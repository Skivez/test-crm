# Объекты и задачи — мини-CRM для стройки

Постановщик заводит объекты (стройки) и задачи по ним, исполнитель берёт задачи в работу и сдаёт на проверку. Каждая смена статуса попадает в историю.

**Стек:** React 19 + TypeScript + Vite, Mantine, TanStack Query, Supabase (Postgres + Auth + RLS).

- [Как устроена система — для руководителя](docs/EXPLANATION.md)
- [Решения и допущения](docs/DECISIONS.md)

## Где что лежит

```
supabase/migrations/   схема БД, права, RLS, смена статусов, история (вся логика безопасности)
scripts/seed.ts        демо-пользователи и данные (нужен service_role, запускается только локально)
scripts/security-test.ts  56 проверок прав «в обход интерфейса» (только anon key + пароли)
src/                   фронтенд
```

## Локальный запуск

Нужны Node.js 20+ и Docker.

```bash
npm install
npx supabase start          # поднимает локальный Supabase и применяет миграции
npx supabase status         # API URL, anon key, service_role key
```

Создайте два файла по образцу `.env.example` и `.env.seed.example`:

- `.env.local` — `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (уходят в браузер, поэтому **только anon key**);
- `.env.seed` — `SUPABASE_SERVICE_ROLE_KEY`, `SEED_PASSWORD` (нужны только скриптам на вашей машине).

Оба файла в `.gitignore`.

```bash
npm run seed                # 2 постановщика, 2 исполнителя, 3 объекта, 6 задач в разных статусах
npm run dev                 # http://localhost:5173
npm run test:security       # проверка прав доступа через API
```

`npm run seed -- --reset` пересоздаёт объекты и задачи.

Демо-пользователи (пароль — `SEED_PASSWORD`):

| Email | Роль |
|---|---|
| manager@example.com | Постановщик |
| manager2@example.com | Постановщик |
| executor1@example.com | Исполнитель |
| executor2@example.com | Исполнитель |

## Развёртывание в облаке

1. Создайте проект на supabase.com и примените миграции:
   ```bash
   npx supabase link --project-ref <ref>
   npx supabase db push
   ```
2. **Authentication → Sign In / Providers → Allow new users to sign up: выключить** (или `npx supabase config push`: в `supabase/config.toml` стоит `enable_signup = false`).
3. Заполните `.env.local`/`.env.seed` значениями облачного проекта и запустите `npm run seed` и `npm run test:security`.
4. Vercel: импортируйте репозиторий (фреймворк Vite) и задайте переменные `VITE_SUPABASE_URL` и `VITE_SUPABASE_ANON_KEY`. `vercel.json` отдаёт `index.html` на все пути SPA. В **Authentication → URL Configuration** укажите адрес сайта.

`service_role` никогда не задаётся в Vercel и не попадает во фронтенд.

## Как устроена защита

| Требование | Как сделано |
|---|---|
| Права на уровне БД | Всё закрыто от `anon`. `authenticated` получает права точечно (`GRANT`, вплоть до колонок), а строки фильтрует RLS на всех четырёх таблицах |
| Исполнитель не видит чужое | `tasks`: `assignee_id = auth.uid()`; `objects`: только объекты, где есть его задачи; история — только по его задачам; профили — свой и постановщиков |
| Переходы статусов в БД | Колонка `status` недоступна для `UPDATE` через API. Сменить статус можно только RPC `change_task_status()`: он проверяет роль, исполнителя, матрицу переходов и обязательный комментарий, блокирует строку (`FOR UPDATE`) и пишет историю. Триггер на `tasks` отклоняет смену статуса любым другим путём, даже от суперпользователя |
| История не подделывается | На `task_status_history` выдан только `SELECT`. Записи создаёт сама база (триггер при создании задачи и RPC). Триггер запрещает `UPDATE`/`DELETE` всем; удалить её можно только каскадом вместе с задачей |
| Регистрация закрыта | `enable_signup = false`, пользователей создаёт администратор. Роль хранится в `app_metadata`, который пользователь сам изменить не может |
| Секреты | Во фронтенде только anon key. `service_role` лежит только в `.env.seed` (gitignore) для сида |

Кнопки действий в карточке задачи интерфейс получает из `task_available_transitions()`. Эта функция использует ту же матрицу переходов, что и проверка, поэтому интерфейс и база не могут разойтись.
