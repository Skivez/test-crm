export type UserRole = 'manager' | 'executor'
export type TaskStatus = 'new' | 'in_progress' | 'review' | 'accepted' | 'rework'

export interface Profile {
  id: string
  full_name: string
  role: UserRole
}

export interface SiteObject {
  id: string
  name: string
  address: string
  created_at: string
}

export interface Task {
  id: string
  title: string
  description: string
  object_id: string
  assignee_id: string
  status: TaskStatus
  author_id: string
  created_at: string
  updated_at: string
}

export interface TaskWithRefs extends Task {
  object: Pick<SiteObject, 'id' | 'name'> | null
  assignee: Pick<Profile, 'id' | 'full_name'> | null
  author: Pick<Profile, 'id' | 'full_name'> | null
}

export interface HistoryEntry {
  id: number
  task_id: string
  actor_id: string
  from_status: TaskStatus | null
  to_status: TaskStatus
  comment: string | null
  created_at: string
  actor: Pick<Profile, 'id' | 'full_name'> | null
}

export const ROLE_LABEL: Record<UserRole, string> = {
  manager: 'Постановщик',
  executor: 'Исполнитель',
}

export const STATUS_LABEL: Record<TaskStatus, string> = {
  new: 'Новая',
  in_progress: 'В работе',
  review: 'На проверке',
  accepted: 'Принята',
  rework: 'На доработке',
}

export const STATUS_COLOR: Record<TaskStatus, string> = {
  new: 'gray',
  in_progress: 'blue',
  review: 'yellow',
  accepted: 'green',
  rework: 'red',
}

/** Подписи кнопок для перехода в статус. Какие из них показать — решает база (task_available_transitions). */
export const ACTION_LABEL: Record<TaskStatus, string> = {
  new: '',
  in_progress: 'Взять в работу',
  review: 'Отправить на проверку',
  accepted: 'Принять',
  rework: 'Вернуть на доработку',
}

export const STATUS_ORDER: TaskStatus[] = ['new', 'in_progress', 'rework', 'review', 'accepted']
