/**
 * Наполнение базы демо-данными.
 *   npm run seed           — создать пользователей и данные (если объектов ещё нет)
 *   npm run seed -- --reset — удалить все объекты/задачи и создать заново
 *
 * service_role используется ТОЛЬКО здесь, локально, для создания пользователей
 * (открытая регистрация отключена). Переходы статусов выполняются от имени
 * реальных пользователей через RPC, поэтому история получается «честной».
 */
import { adminClient, demoPassword, DEMO_USERS, signedIn, type DemoUserKey } from './env.ts'

const admin = adminClient()
const reset = process.argv.includes('--reset')

async function ensureUsers(): Promise<Record<DemoUserKey, string>> {
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 })
  if (error) throw error
  const ids = {} as Record<DemoUserKey, string>

  for (const [key, u] of Object.entries(DEMO_USERS) as [DemoUserKey, (typeof DEMO_USERS)[DemoUserKey]][]) {
    const existing = data.users.find((x) => x.email === u.email)
    if (existing) {
      ids[key] = existing.id
      console.log(`  пользователь ${u.email} уже есть`)
      continue
    }
    const { data: created, error: e } = await admin.auth.admin.createUser({
      email: u.email,
      password: demoPassword(),
      email_confirm: true,
      user_metadata: { full_name: u.full_name },
      app_metadata: { role: u.role }, // роль — только в app_metadata, пользователь её не изменит
    })
    if (e) throw e
    ids[key] = created.user.id
    console.log(`  создан ${u.email} (${u.role})`)
  }
  return ids
}

type Step = { by: DemoUserKey; to: string; comment?: string }

async function main() {
  console.log('Пользователи:')
  const ids = await ensureUsers()

  const { count } = await admin.from('objects').select('*', { count: 'exact', head: true })
  if (count && !reset) {
    console.log('Объекты уже есть — данные не трогаю (используйте --reset).')
    return
  }
  if (reset) {
    // Удаление задач каскадом удаляет их историю (триггер это разрешает только при удалении задачи).
    await admin.from('tasks').delete().not('id', 'is', null).throwOnError()
    await admin.from('objects').delete().not('id', 'is', null).throwOnError()
    console.log('Старые объекты и задачи удалены.')
  }

  const manager = await signedIn('manager')
  const clients = {
    manager,
    manager2: await signedIn('manager2'),
    executor1: await signedIn('executor1'),
    executor2: await signedIn('executor2'),
  }

  const { data: objects } = await manager
    .from('objects')
    .insert([
      { name: 'ЖК «Северный парк», корпус 2', address: 'г. Москва, ул. Лётчика Бабушкина, 41' },
      { name: 'Коттедж Ивановых', address: 'МО, д. Подрезково, ул. Лесная, 7' },
      { name: 'Склад «ПромТехЛогистик»', address: 'г. Химки, Промышленный проезд, 3с1' },
    ])
    .select()
    .throwOnError()
  const [park, cottage, warehouse] = objects!

  const plan: { title: string; description: string; object: string; assignee: DemoUserKey; by: DemoUserKey; steps: Step[] }[] = [
    {
      title: 'Залить фундаментную плиту секции 3',
      description: 'Бетон B25, толщина 600 мм. Перед заливкой — приёмка арматуры технадзором.',
      object: park.id, assignee: 'executor1', by: 'manager',
      steps: [],
    },
    {
      title: 'Смонтировать опалубку перекрытия 5 этажа',
      description: 'Использовать щитовую опалубку с объекта, проверить вертикальность стоек.',
      object: park.id, assignee: 'executor2', by: 'manager',
      steps: [{ by: 'executor2', to: 'in_progress' }],
    },
    {
      title: 'Гидроизоляция подвала',
      description: 'Обмазочная гидроизоляция в 2 слоя, фото каждого этапа в отчёт.',
      object: park.id, assignee: 'executor1', by: 'manager2',
      steps: [
        { by: 'executor1', to: 'in_progress' },
        { by: 'executor1', to: 'review', comment: 'Готово, фото в общей папке' },
      ],
    },
    {
      title: 'Кладка перегородок 1 этажа',
      description: 'Газобетон D500, 100 мм. По проекту АР-3.',
      object: cottage.id, assignee: 'executor1', by: 'manager',
      steps: [
        { by: 'executor1', to: 'in_progress' },
        { by: 'executor1', to: 'review' },
        { by: 'manager', to: 'rework', comment: 'В санузле перегородка смещена на 10 см от проекта — переложить.' },
      ],
    },
    {
      title: 'Устройство кровли',
      description: 'Металлочерепица, утепление 200 мм, пароизоляция.',
      object: cottage.id, assignee: 'executor2', by: 'manager',
      steps: [
        { by: 'executor2', to: 'in_progress' },
        { by: 'executor2', to: 'review' },
        { by: 'manager', to: 'accepted', comment: 'Принято, замечаний нет.' },
      ],
    },
    {
      title: 'Разметка осей колонн',
      description: 'Геодезическая разбивка по плану фундаментов.',
      object: warehouse.id, assignee: 'executor2', by: 'manager2',
      steps: [
        { by: 'executor2', to: 'in_progress' },
        { by: 'executor2', to: 'review' },
        { by: 'manager2', to: 'rework', comment: 'Нет акта разбивки, приложите.' },
        { by: 'executor2', to: 'in_progress' },
        { by: 'executor2', to: 'review', comment: 'Акт приложил.' },
      ],
    },
  ]

  for (const t of plan) {
    const { data: task } = await clients[t.by]
      .from('tasks')
      .insert({ title: t.title, description: t.description, object_id: t.object, assignee_id: ids[t.assignee] })
      .select()
      .single()
      .throwOnError()
    for (const s of t.steps) {
      await clients[s.by]
        .rpc('change_task_status', { p_task_id: task!.id, p_to: s.to, p_comment: s.comment ?? null })
        .throwOnError()
    }
    console.log(`  задача «${t.title}» → ${t.steps.at(-1)?.to ?? 'new'}`)
  }
  console.log('Готово.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
