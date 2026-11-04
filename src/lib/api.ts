import type { PostgrestError } from '@supabase/supabase-js'
import { supabase } from './supabase'
import type { HistoryEntry, Profile, SiteObject, TaskStatus, TaskWithRefs } from './types'

/** Превращает ошибку базы в понятное пользователю сообщение. */
export function errorMessage(e: unknown): string {
  const err = e as Partial<PostgrestError> & { message?: string }
  if (err?.code === '23503') {
    if (err.message?.includes('objects')) return 'Нельзя удалить объект, пока у него есть задачи'
    return 'Запись связана с другими данными'
  }
  if (err?.code === '42501' && err.message?.startsWith('permission denied')) return 'Недостаточно прав'
  if (err?.code === '23514' && err.message?.includes('check constraint')) return 'Заполните обязательные поля'
  return err?.message ?? 'Неизвестная ошибка'
}

function unwrap<T>(r: { data: T | null; error: PostgrestError | null }): T {
  if (r.error) throw r.error
  return r.data as T
}

const TASK_SELECT = `
  *,
  object:objects(id, name),
  assignee:profiles!tasks_assignee_id_fkey(id, full_name),
  author:profiles!tasks_author_id_fkey(id, full_name)
`

export async function fetchProfile(id: string): Promise<Profile | null> {
  return unwrap(await supabase.from('profiles').select('id, full_name, role').eq('id', id).maybeSingle())
}

export async function fetchExecutors(): Promise<Profile[]> {
  return unwrap(
    await supabase.from('profiles').select('id, full_name, role').eq('role', 'executor').order('full_name'),
  )
}

export type ObjectWithCounts = SiteObject & { tasks: { status: TaskStatus }[] }

export async function fetchObjects(): Promise<ObjectWithCounts[]> {
  return unwrap(await supabase.from('objects').select('*, tasks(status)').order('name'))
}

export async function fetchObject(id: string): Promise<SiteObject | null> {
  return unwrap(await supabase.from('objects').select('*').eq('id', id).maybeSingle())
}

export async function saveObject(input: { id?: string; name: string; address: string }): Promise<SiteObject> {
  const values = { name: input.name.trim(), address: input.address.trim() }
  const q = input.id
    ? supabase.from('objects').update(values).eq('id', input.id)
    : supabase.from('objects').insert(values)
  return unwrap(await q.select().single())
}

export async function deleteObject(id: string): Promise<void> {
  unwrap(await supabase.from('objects').delete().eq('id', id))
}

export async function fetchTasks(filter: { objectId?: string; assigneeId?: string }): Promise<TaskWithRefs[]> {
  let q = supabase.from('tasks').select(TASK_SELECT).order('created_at', { ascending: false })
  if (filter.objectId) q = q.eq('object_id', filter.objectId)
  if (filter.assigneeId) q = q.eq('assignee_id', filter.assigneeId)
  return unwrap(await q) as unknown as TaskWithRefs[]
}

export async function fetchTask(id: string): Promise<TaskWithRefs | null> {
  return unwrap(await supabase.from('tasks').select(TASK_SELECT).eq('id', id).maybeSingle()) as TaskWithRefs | null
}

export interface TaskInput {
  id?: string
  title: string
  description: string
  object_id: string
  assignee_id: string
}

export async function saveTask(input: TaskInput): Promise<{ id: string }> {
  // status, author_id, created_at не передаём: их выставляет база.
  const values = {
    title: input.title.trim(),
    description: input.description.trim(),
    object_id: input.object_id,
    assignee_id: input.assignee_id,
  }
  const q = input.id
    ? supabase.from('tasks').update(values).eq('id', input.id)
    : supabase.from('tasks').insert(values)
  return unwrap(await q.select('id').single())
}

export async function deleteTask(id: string): Promise<void> {
  unwrap(await supabase.from('tasks').delete().eq('id', id))
}

export async function fetchHistory(taskId: string): Promise<HistoryEntry[]> {
  return unwrap(
    await supabase
      .from('task_status_history')
      .select('*, actor:profiles(id, full_name)')
      .eq('task_id', taskId)
      .order('created_at')
      .order('id'),
  ) as unknown as HistoryEntry[]
}

export async function fetchAvailableTransitions(taskId: string): Promise<TaskStatus[]> {
  return unwrap(await supabase.rpc('task_available_transitions', { p_task_id: taskId })) ?? []
}

export async function changeStatus(taskId: string, to: TaskStatus, comment?: string): Promise<void> {
  unwrap(
    await supabase.rpc('change_task_status', { p_task_id: taskId, p_to: to, p_comment: comment?.trim() || null }),
  )
}
