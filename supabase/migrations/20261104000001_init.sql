-- =====================================================================
-- Мини-CRM «Объекты и задачи»: схема, права доступа, статусы, история.
--
-- Принципы защиты:
--   * anon (не вошедший пользователь) не имеет доступа ни к чему;
--   * для authenticated права выданы точечно, вплоть до колонок:
--     status / author_id / created_at напрямую через API менять нельзя;
--   * какие строки видны и изменяемы — решает RLS;
--   * смена статуса — только через функцию change_task_status(),
--     которая проверяет роль, исполнителя и матрицу переходов
--     и сама пишет историю;
--   * история только для чтения, изменить/удалить её нельзя.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Типы
-- ---------------------------------------------------------------------
create type public.user_role as enum ('manager', 'executor');

create type public.task_status as enum (
  'new',          -- Новая
  'in_progress',  -- В работе
  'review',       -- На проверке
  'accepted',     -- Принята
  'rework'        -- На доработке
);

-- Служебная схема: не публикуется через API, но функции из неё
-- используются в политиках RLS.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

-- ---------------------------------------------------------------------
-- Таблицы
-- ---------------------------------------------------------------------
create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  full_name  text not null check (length(btrim(full_name)) > 0),
  role       public.user_role not null default 'executor',
  created_at timestamptz not null default now()
);
comment on table public.profiles is 'Сотрудники и их роли. Роль задаётся только администратором (app_metadata.role).';

create table public.objects (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(btrim(name)) > 0),
  address    text not null check (length(btrim(address)) > 0),
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
comment on table public.objects is 'Объекты (стройки).';

create table public.tasks (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (length(btrim(title)) > 0),
  description text not null default '',
  object_id   uuid not null references public.objects (id) on delete restrict,
  assignee_id uuid not null references public.profiles (id) on delete restrict,
  status      public.task_status not null default 'new',
  author_id   uuid not null references public.profiles (id) on delete restrict default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index tasks_object_id_idx   on public.tasks (object_id);
create index tasks_assignee_id_idx on public.tasks (assignee_id);

create table public.task_status_history (
  id          bigint generated always as identity primary key,
  task_id     uuid not null references public.tasks (id) on delete cascade,
  actor_id    uuid not null references public.profiles (id) on delete restrict,
  from_status public.task_status,           -- null = задача создана
  to_status   public.task_status not null,
  comment     text,
  created_at  timestamptz not null default now()
);
create index task_status_history_task_id_idx on public.task_status_history (task_id, created_at);

-- ---------------------------------------------------------------------
-- Вспомогательные функции для RLS
-- ---------------------------------------------------------------------
create or replace function private.my_role()
returns public.user_role
language sql
stable
security definer
set search_path = ''
as $$
  select p.role from public.profiles p where p.id = auth.uid()
$$;

create or replace function private.is_manager()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.my_role() = 'manager', false)
$$;

revoke all on function private.my_role()    from public;
revoke all on function private.is_manager() from public;
grant execute on function private.my_role()    to authenticated;
grant execute on function private.is_manager() to authenticated;

-- Матрица переходов статусов (единственный источник правды).
create or replace function private.transition_allowed(
  p_role        public.user_role,
  p_is_assignee boolean,
  p_from        public.task_status,
  p_to          public.task_status
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when p_role = 'executor' and p_is_assignee then
      (p_from, p_to) in (
        ('new'::public.task_status,    'in_progress'::public.task_status),
        ('in_progress',                'review'),
        ('rework',                     'in_progress')
      )
    when p_role = 'manager' then
      (p_from, p_to) in (
        ('review'::public.task_status, 'accepted'::public.task_status),
        ('review',                     'rework')
      )
    else false
  end
$$;
revoke all on function private.transition_allowed(public.user_role, boolean, public.task_status, public.task_status) from public;

-- ---------------------------------------------------------------------
-- Профиль создаётся автоматически при создании пользователя в Auth.
-- Роль берётся из app_metadata (её может задать только администратор
-- через service_role / Dashboard; сам пользователь её не изменит).
-- ---------------------------------------------------------------------
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''), new.email),
    coalesce((new.raw_app_meta_data ->> 'role')::public.user_role, 'executor')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- GoTrue записывает app_metadata отдельным UPDATE после создания пользователя,
-- а администратор может сменить роль позже — синхронизируем.
create or replace function private.handle_user_role_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles
     set role = coalesce((new.raw_app_meta_data ->> 'role')::public.user_role, 'executor')
   where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_role_changed
  after update of raw_app_meta_data on auth.users
  for each row
  when (old.raw_app_meta_data ->> 'role' is distinct from new.raw_app_meta_data ->> 'role')
  execute function private.handle_user_role_change();

-- ---------------------------------------------------------------------
-- Триггеры задач
-- ---------------------------------------------------------------------

-- Исполнителем можно назначить только пользователя с ролью «Исполнитель».
create or replace function private.tasks_check_assignee()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = new.assignee_id and p.role = 'executor'
  ) then
    raise exception 'Исполнителем можно назначить только сотрудника с ролью «Исполнитель»'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function private.tasks_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Задача всегда создаётся в статусе «Новая», автор — текущий пользователь.
  new.status     := 'new';
  new.created_at := now();
  new.updated_at := now();
  if auth.uid() is not null then
    new.author_id := auth.uid();
  end if;
  return new;
end;
$$;

create or replace function private.tasks_before_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Статус меняется только внутри change_task_status(); любой другой путь
  -- (включая прямой UPDATE с повышенными правами) отклоняется.
  if new.status is distinct from old.status
     and coalesce(current_setting('app.status_change', true), '') <> 'on' then
    raise exception 'Статус меняется только через change_task_status()'
      using errcode = '42501';
  end if;

  new.author_id  := old.author_id;
  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end;
$$;

-- Запись о создании задачи (— → Новая).
create or replace function private.tasks_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.task_status_history (task_id, actor_id, from_status, to_status)
  values (new.id, new.author_id, null, new.status);
  return new;
end;
$$;

create trigger tasks_before_insert
  before insert on public.tasks
  for each row execute function private.tasks_before_insert();

create trigger tasks_check_assignee
  before insert or update of assignee_id on public.tasks
  for each row execute function private.tasks_check_assignee();

create trigger tasks_before_update
  before update on public.tasks
  for each row execute function private.tasks_before_update();

create trigger tasks_after_insert
  after insert on public.tasks
  for each row execute function private.tasks_after_insert();

-- ---------------------------------------------------------------------
-- История неизменяема: UPDATE запрещён всегда, DELETE — только как
-- каскад при удалении самой задачи постановщиком.
-- ---------------------------------------------------------------------
create or replace function private.history_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE'
     and not exists (select 1 from public.tasks t where t.id = old.task_id) then
    return old;  -- каскадное удаление вместе с задачей
  end if;
  raise exception 'История статусов не может быть изменена или удалена'
    using errcode = '42501';
end;
$$;

create trigger task_status_history_immutable
  before update or delete on public.task_status_history
  for each row execute function private.history_immutable();

-- ---------------------------------------------------------------------
-- Смена статуса (RPC)
-- ---------------------------------------------------------------------
create or replace function public.change_task_status(
  p_task_id uuid,
  p_to      public.task_status,
  p_comment text default null
)
returns public.tasks
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_role    public.user_role;
  v_task    public.tasks;
  v_from    public.task_status;
  v_comment text := nullif(btrim(p_comment), '');
begin
  if v_uid is null then
    raise exception 'Требуется вход в систему' using errcode = '42501';
  end if;

  select role into v_role from public.profiles where id = v_uid;

  -- Блокируем строку, чтобы два одновременных перехода не прошли оба.
  select * into v_task from public.tasks where id = p_task_id for update;

  -- Чужая задача для исполнителя «не существует» (не раскрываем её наличие).
  if not found or (v_role is distinct from 'manager' and v_task.assignee_id <> v_uid) then
    raise exception 'Задача не найдена' using errcode = 'P0002';
  end if;

  v_from := v_task.status;

  if not private.transition_allowed(v_role, v_task.assignee_id = v_uid, v_from, p_to) then
    raise exception 'Переход «%» → «%» вам недоступен', v_from, p_to using errcode = '42501';
  end if;

  if p_to = 'rework' and v_comment is null then
    raise exception 'При возврате на доработку комментарий обязателен' using errcode = '23514';
  end if;

  perform set_config('app.status_change', 'on', true);
  update public.tasks set status = p_to where id = p_task_id returning * into v_task;
  perform set_config('app.status_change', '', true);

  insert into public.task_status_history (task_id, actor_id, from_status, to_status, comment)
  values (p_task_id, v_uid, v_from, p_to, v_comment);

  return v_task;
end;
$$;

-- Какие переходы доступны текущему пользователю (для кнопок в интерфейсе;
-- использует ту же матрицу, что и change_task_status).
create or replace function public.task_available_transitions(p_task_id uuid)
returns public.task_status[]
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(array_agg(s order by s), '{}')
  from public.tasks t
  cross join unnest(enum_range(null::public.task_status)) as s
  where t.id = p_task_id   -- RLS: чужую задачу не видно → пустой список
    and private.transition_allowed(private.my_role(), t.assignee_id = auth.uid(), t.status, s)
$$;

revoke all on function public.change_task_status(uuid, public.task_status, text) from public, anon;
revoke all on function public.task_available_transitions(uuid) from public, anon;
grant execute on function public.change_task_status(uuid, public.task_status, text) to authenticated;
grant execute on function public.task_available_transitions(uuid) to authenticated;
grant execute on function private.transition_allowed(public.user_role, boolean, public.task_status, public.task_status) to authenticated;

-- Служебные функции триггеров не должны вызываться через API.
revoke all on function private.handle_new_user()       from public;
revoke all on function private.handle_user_role_change() from public;
revoke all on function private.tasks_check_assignee()  from public;
revoke all on function private.tasks_before_insert()   from public;
revoke all on function private.tasks_before_update()   from public;
revoke all on function private.tasks_after_insert()    from public;
revoke all on function private.history_immutable()     from public;

-- ---------------------------------------------------------------------
-- Табличные права (GRANT): что вообще можно делать через API.
-- Supabase по умолчанию выдаёт anon/authenticated всё — забираем.
-- ---------------------------------------------------------------------
revoke all on public.profiles, public.objects, public.tasks, public.task_status_history
  from anon, authenticated;

grant select on public.profiles to authenticated;

grant select, delete on public.objects to authenticated;
grant insert (name, address), update (name, address) on public.objects to authenticated;

grant select, delete on public.tasks to authenticated;
grant insert (title, description, object_id, assignee_id),
      update (title, description, object_id, assignee_id)
  on public.tasks to authenticated;

grant select on public.task_status_history to authenticated;

-- ---------------------------------------------------------------------
-- RLS: какие строки видны и изменяемы
-- ---------------------------------------------------------------------
alter table public.profiles            enable row level security;
alter table public.objects             enable row level security;
alter table public.tasks               enable row level security;
alter table public.task_status_history enable row level security;

-- Профили: постановщик видит всех; исполнитель — себя и постановщиков
-- (их имена есть в задачах и истории). Других исполнителей не видит.
create policy profiles_select on public.profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or role = 'manager'
    or (select private.is_manager())
  );

-- Объекты
create policy objects_select on public.objects
  for select to authenticated
  using (
    (select private.is_manager())
    or exists (
      select 1 from public.tasks t
      where t.object_id = objects.id and t.assignee_id = (select auth.uid())
    )
  );
create policy objects_insert on public.objects
  for insert to authenticated with check ((select private.is_manager()));
create policy objects_update on public.objects
  for update to authenticated
  using ((select private.is_manager())) with check ((select private.is_manager()));
create policy objects_delete on public.objects
  for delete to authenticated using ((select private.is_manager()));

-- Задачи
create policy tasks_select on public.tasks
  for select to authenticated
  using ((select private.is_manager()) or assignee_id = (select auth.uid()));
create policy tasks_insert on public.tasks
  for insert to authenticated with check ((select private.is_manager()));
create policy tasks_update on public.tasks
  for update to authenticated
  using ((select private.is_manager())) with check ((select private.is_manager()));
create policy tasks_delete on public.tasks
  for delete to authenticated using ((select private.is_manager()));

-- История: видна тем, кто видит задачу. Записей INSERT/UPDATE/DELETE нет.
create policy history_select on public.task_status_history
  for select to authenticated
  using (
    (select private.is_manager())
    or exists (
      select 1 from public.tasks t
      where t.id = task_status_history.task_id and t.assignee_id = (select auth.uid())
    )
  );
