/**
 * Проверка правил доступа «в обход интерфейса»: обращаемся к Supabase API напрямую
 * с публичным anon key от имени разных пользователей и пытаемся сделать запрещённое.
 *
 *   npm run test:security
 *
 * service_role не используется — только то, что доступно любому пользователю.
 * Скрипт создаёт временный объект и задачи и удаляет их в конце.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { anonClient, DEMO_USERS, signedIn } from './env.ts'

let passed = 0
let failed = 0

function check(name: string, ok: boolean, details?: unknown) {
  if (ok) {
    passed++
    console.log(`  ✔ ${name}`)
  } else {
    failed++
    console.log(`  ✘ ${name}`, details ?? '')
  }
}

type Res = { data: unknown; error: { message: string } | null }

/** Запрос должен завершиться ошибкой или не затронуть ни одной строки. */
function denied(name: string, r: Res) {
  const empty = Array.isArray(r.data) ? r.data.length === 0 : r.data == null
  check(name, !!r.error || empty, r)
}
function allowed(name: string, r: Res) {
  check(name, !r.error, r.error)
}

async function uid(c: SupabaseClient) {
  return (await c.auth.getUser()).data.user!.id
}

async function main() {
  const anon = anonClient()
  const m = await signedIn('manager')
  const e1 = await signedIn('executor1')
  const e2 = await signedIn('executor2')
  const [mId, e1Id, e2Id] = await Promise.all([uid(m), uid(e1), uid(e2)])

  // --- подготовка: объект и по задаче на каждого исполнителя ---
  const { data: obj } = await m.from('objects')
    .insert({ name: '[security-test] объект', address: 'тест' }).select().single().throwOnError()
  const { data: obj2 } = await m.from('objects')
    .insert({ name: '[security-test] объект только для e2', address: 'тест' }).select().single().throwOnError()
  const { data: t1 } = await m.from('tasks')
    .insert({ title: '[security-test] задача e1', object_id: obj!.id, assignee_id: e1Id })
    .select().single().throwOnError()
  const { data: t2 } = await m.from('tasks')
    .insert({ title: '[security-test] задача e2', object_id: obj2!.id, assignee_id: e2Id })
    .select().single().throwOnError()

  try {
    console.log('\nАнонимный доступ и регистрация')
    denied('аноним не читает задачи', await anon.from('tasks').select('*'))
    denied('аноним не читает объекты', await anon.from('objects').select('*'))
    denied('аноним не читает профили', await anon.from('profiles').select('*'))
    denied('аноним не вызывает смену статуса', await anon.rpc('change_task_status', { p_task_id: t1!.id, p_to: 'in_progress' }))
    const su = await anon.auth.signUp({ email: `intruder${Date.now()}@example.com`, password: 'Passw0rd!123' })
    // Важна именно причина отказа: облако отклоняет и «невалидный» домен example.com, это не считается.
    check('открытая регистрация отключена', su.error?.code === 'signup_disabled', su.error)

    console.log('\nИсполнитель: чтение')
    const e1Tasks = (await e1.from('tasks').select('id, assignee_id')).data ?? []
    check('исполнитель видит только свои задачи', e1Tasks.length > 0 && e1Tasks.every((t) => t.assignee_id === e1Id))
    denied('исполнитель не читает чужую задачу по id', await e1.from('tasks').select('*').eq('id', t2!.id))
    denied('исполнитель не видит объект без своих задач', await e1.from('objects').select('*').eq('id', obj2!.id))
    allowed('исполнитель видит объект со своей задачей', await e1.from('objects').select('*').eq('id', obj!.id).single())
    denied('исполнитель не читает историю чужой задачи', await e1.from('task_status_history').select('*').eq('task_id', t2!.id))
    denied('исполнитель не видит других исполнителей', await e1.from('profiles').select('*').eq('id', e2Id))
    const avail = await e1.rpc('task_available_transitions', { p_task_id: t2!.id })
    check('доступные действия по чужой задаче пусты', Array.isArray(avail.data) && avail.data.length === 0, avail)

    console.log('\nИсполнитель: изменения')
    denied('исполнитель не создаёт объект', await e1.from('objects').insert({ name: 'x', address: 'y' }).select())
    denied('исполнитель не меняет объект', await e1.from('objects').update({ name: 'взлом' }).eq('id', obj!.id).select())
    denied('исполнитель не удаляет объект', await e1.from('objects').delete().eq('id', obj!.id).select())
    denied('исполнитель не создаёт задачу', await e1.from('tasks')
      .insert({ title: 'x', object_id: obj!.id, assignee_id: e1Id }).select())
    denied('исполнитель не редактирует свою задачу', await e1.from('tasks').update({ title: 'взлом' }).eq('id', t1!.id).select())
    denied('исполнитель не переназначает задачу', await e1.from('tasks').update({ assignee_id: e2Id }).eq('id', t1!.id).select())
    denied('исполнитель не меняет статус напрямую', await e1.from('tasks').update({ status: 'accepted' }).eq('id', t1!.id).select())
    denied('исполнитель не удаляет свою задачу', await e1.from('tasks').delete().eq('id', t1!.id).select())
    denied('исполнитель не меняет чужую задачу', await e1.from('tasks').update({ title: 'взлом' }).eq('id', t2!.id).select())
    denied('исполнитель не меняет свою роль', await e1.from('profiles').update({ role: 'manager' }).eq('id', e1Id).select())
    await e1.auth.updateUser({ data: { role: 'manager' } })
    const meAfter = (await e1.from('profiles').select('role').eq('id', e1Id).single()).data
    check('user_metadata.role не даёт прав постановщика', meAfter?.role === 'executor', meAfter)

    console.log('\nПереходы статусов')
    denied('чужую задачу нельзя взять в работу', await e1.rpc('change_task_status', { p_task_id: t2!.id, p_to: 'in_progress' }))
    denied('Новая → На проверке (минуя «В работе») запрещено', await e1.rpc('change_task_status', { p_task_id: t1!.id, p_to: 'review' }))
    denied('Новая → Принята исполнителем запрещено', await e1.rpc('change_task_status', { p_task_id: t1!.id, p_to: 'accepted' }))
    denied('постановщик не берёт задачу в работу за исполнителя', await m.rpc('change_task_status', { p_task_id: t1!.id, p_to: 'in_progress' }))
    allowed('Новая → В работе (исполнитель)', await e1.rpc('change_task_status', { p_task_id: t1!.id, p_to: 'in_progress' }))
    denied('повторный переход в тот же статус запрещён', await e1.rpc('change_task_status', { p_task_id: t1!.id, p_to: 'in_progress' }))
    allowed('В работе → На проверке (исполнитель)', await e1.rpc('change_task_status', { p_task_id: t1!.id, p_to: 'review' }))
    denied('исполнитель не принимает свою задачу', await e1.rpc('change_task_status', { p_task_id: t1!.id, p_to: 'accepted' }))
    denied('исполнитель не возвращает на доработку', await e1.rpc('change_task_status', { p_task_id: t1!.id, p_to: 'rework', p_comment: 'x' }))
    denied('На доработку без комментария нельзя', await m.rpc('change_task_status', { p_task_id: t1!.id, p_to: 'rework' }))
    denied('На доработку с пустым комментарием нельзя', await m.rpc('change_task_status', { p_task_id: t1!.id, p_to: 'rework', p_comment: '   ' }))
    allowed('На проверке → На доработке с комментарием', await m.rpc('change_task_status', { p_task_id: t1!.id, p_to: 'rework', p_comment: 'Переделать' }))
    denied('На доработке → На проверке (минуя «В работе») запрещено', await e1.rpc('change_task_status', { p_task_id: t1!.id, p_to: 'review' }))
    allowed('На доработке → В работе', await e1.rpc('change_task_status', { p_task_id: t1!.id, p_to: 'in_progress' }))
    allowed('В работе → На проверке', await e1.rpc('change_task_status', { p_task_id: t1!.id, p_to: 'review' }))
    allowed('На проверке → Принята (постановщик)', await m.rpc('change_task_status', { p_task_id: t1!.id, p_to: 'accepted' }))
    denied('из «Принята» никуда нельзя', await m.rpc('change_task_status', { p_task_id: t1!.id, p_to: 'rework', p_comment: 'x' }))
    denied('постановщик не меняет статус напрямую', await m.from('tasks').update({ status: 'new' }).eq('id', t1!.id).select())
    denied('нельзя создать задачу сразу в статусе «Принята»', await m.from('tasks')
      .insert({ title: 'x', object_id: obj!.id, assignee_id: e1Id, status: 'accepted' }).select())
    denied('нельзя подделать автора задачи', await m.from('tasks')
      .insert({ title: 'x', object_id: obj!.id, assignee_id: e1Id, author_id: e2Id }).select())
    denied('нельзя назначить исполнителем постановщика', await m.from('tasks')
      .insert({ title: 'x', object_id: obj!.id, assignee_id: mId }).select())

    console.log('\nИстория')
    const hist = (await e1.from('task_status_history').select('*').eq('task_id', t1!.id).order('created_at')).data ?? []
    check('история записана полностью (7 записей) и видна исполнителю', hist.length === 7, hist.length)
    check('комментарий возврата сохранён', hist.some((h) => h.to_status === 'rework' && h.comment === 'Переделать'))
    const h0 = hist[0]
    for (const [who, c] of [['исполнитель', e1], ['постановщик', m]] as const) {
      denied(`${who} не добавляет запись в историю`, await c.from('task_status_history')
        .insert({ task_id: t1!.id, actor_id: mId, to_status: 'accepted' }).select())
      denied(`${who} не меняет запись истории`, await c.from('task_status_history')
        .update({ comment: 'подделка' }).eq('id', h0.id).select())
      denied(`${who} не удаляет запись истории`, await c.from('task_status_history').delete().eq('id', h0.id).select())
    }
    const histAfter = (await m.from('task_status_history').select('*').eq('task_id', t1!.id)).data ?? []
    check('история не изменилась', histAfter.length === 7 && histAfter.every((h) => h.comment !== 'подделка'))

    console.log('\nПостановщик')
    allowed('постановщик редактирует задачу', await m.from('tasks').update({ title: '[security-test] задача e1 (ред.)' }).eq('id', t1!.id).select().single())
    denied('объект с задачами не удаляется', await m.from('objects').delete().eq('id', obj!.id).select())
  } finally {
    await m.from('tasks').delete().in('id', [t1!.id, t2!.id]).throwOnError()
    await m.from('objects').delete().in('id', [obj!.id, obj2!.id]).throwOnError()
    const left = (await m.from('task_status_history').select('id').in('task_id', [t1!.id, t2!.id])).data ?? []
    check('удаление задачи постановщиком удаляет её историю (каскад)', left.length === 0)
  }

  console.log(`\nИтого: ${passed} пройдено, ${failed} провалено (пользователи: ${Object.keys(DEMO_USERS).join(', ')})`)
  process.exit(failed ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
