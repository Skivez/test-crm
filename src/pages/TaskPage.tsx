import { useState } from 'react'
import {
  Alert,
  Anchor,
  Button,
  Group,
  Loader,
  Modal,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
  Timeline,
  Title,
} from '@mantine/core'
import { modals } from '@mantine/modals'
import { notifications } from '@mantine/notifications'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import dayjs from 'dayjs'
import { useAuth } from '../auth/AuthProvider'
import { changeStatus, deleteTask, errorMessage, fetchAvailableTransitions, fetchHistory, fetchTask } from '../lib/api'
import { ACTION_LABEL, STATUS_COLOR, STATUS_LABEL, type TaskStatus } from '../lib/types'
import { StatusBadge } from '../components/StatusBadge'
import { TaskFormModal } from '../components/TaskFormModal'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
        {label}
      </Text>
      <div>{children}</div>
    </div>
  )
}

export function TaskPage() {
  const { id = '' } = useParams()
  const { isManager } = useAuth()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [action, setAction] = useState<TaskStatus | null>(null)
  const [comment, setComment] = useState('')

  const task = useQuery({ queryKey: ['task', id], queryFn: () => fetchTask(id) })
  const history = useQuery({ queryKey: ['task', id, 'history'], queryFn: () => fetchHistory(id) })
  // Какие кнопки показать, решает база той же функцией, что проверяет переход.
  const transitions = useQuery({
    queryKey: ['task', id, 'transitions'],
    queryFn: () => fetchAvailableTransitions(id),
  })

  const change = useMutation({
    mutationFn: ({ to, comment }: { to: TaskStatus; comment?: string }) => changeStatus(id, to, comment),
    onSuccess: (_d, { to }) => {
      notifications.show({ message: `Статус: ${STATUS_LABEL[to]}`, color: 'green' })
      setAction(null)
      setComment('')
    },
    onError: (e) => notifications.show({ message: errorMessage(e), color: 'red' }),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['task', id] })
      qc.invalidateQueries({ queryKey: ['tasks'] })
      qc.invalidateQueries({ queryKey: ['objects'] })
    },
  })

  const remove = useMutation({
    mutationFn: () => deleteTask(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] })
      qc.invalidateQueries({ queryKey: ['objects'] })
      notifications.show({ message: 'Задача удалена', color: 'green' })
      navigate(task.data ? `/objects/${task.data.object_id}` : '/objects')
    },
    onError: (e) => notifications.show({ message: errorMessage(e), color: 'red' }),
  })

  if (task.isPending) return <Loader />
  if (task.error) return <Alert color="red">{errorMessage(task.error)}</Alert>
  if (!task.data) return <Alert color="gray">Задача не найдена или у вас нет к ней доступа.</Alert>

  const t = task.data
  const commentRequired = action === 'rework'

  function onAction(to: TaskStatus) {
    if (to === 'in_progress') change.mutate({ to })
    else {
      setComment('')
      setAction(to)
    }
  }

  return (
    <Stack>
      {t.object && (
        <Anchor component={Link} to={`/objects/${t.object.id}`} size="sm">
          ← {t.object.name}
        </Anchor>
      )}

      <Paper withBorder p="md" radius="md">
        <Stack>
          <Group justify="space-between" align="flex-start">
            <Group gap="sm">
              <Title order={2}>{t.title}</Title>
              <StatusBadge status={t.status} />
            </Group>
            {isManager && (
              <Group gap="xs">
                <Button variant="default" onClick={() => setEditing(true)}>
                  Редактировать
                </Button>
                <Button
                  color="red"
                  variant="light"
                  loading={remove.isPending}
                  onClick={() =>
                    modals.openConfirmModal({
                      title: 'Удалить задачу?',
                      children: <Text size="sm">Задача будет удалена вместе с историей статусов.</Text>,
                      labels: { confirm: 'Удалить', cancel: 'Отмена' },
                      confirmProps: { color: 'red' },
                      onConfirm: () => remove.mutate(),
                    })
                  }
                >
                  Удалить
                </Button>
              </Group>
            )}
          </Group>

          <Text style={{ whiteSpace: 'pre-wrap' }} c={t.description ? undefined : 'dimmed'}>
            {t.description || 'Без описания'}
          </Text>

          <SimpleGrid cols={{ base: 2, sm: 4 }}>
            <Field label="Объект">{t.object?.name ?? '—'}</Field>
            <Field label="Исполнитель">{t.assignee?.full_name ?? '—'}</Field>
            <Field label="Автор">{t.author?.full_name ?? '—'}</Field>
            <Field label="Создана">{dayjs(t.created_at).format('DD.MM.YYYY HH:mm')}</Field>
          </SimpleGrid>

          {!!transitions.data?.length && (
            <Group>
              {transitions.data.map((to) => (
                <Button
                  key={to}
                  color={STATUS_COLOR[to]}
                  variant={to === 'rework' ? 'light' : 'filled'}
                  loading={change.isPending && change.variables?.to === to}
                  onClick={() => onAction(to)}
                >
                  {ACTION_LABEL[to]}
                </Button>
              ))}
            </Group>
          )}
        </Stack>
      </Paper>

      <Title order={3}>История</Title>
      {history.isPending ? (
        <Loader />
      ) : history.error ? (
        <Alert color="red">{errorMessage(history.error)}</Alert>
      ) : (
        <Timeline bulletSize={14} lineWidth={2} active={history.data.length}>
          {history.data.map((h) => (
            <Timeline.Item
              key={h.id}
              color={STATUS_COLOR[h.to_status]}
              title={
                h.from_status
                  ? `${STATUS_LABEL[h.from_status]} → ${STATUS_LABEL[h.to_status]}`
                  : `Создана (${STATUS_LABEL[h.to_status]})`
              }
            >
              <Text size="sm" c="dimmed">
                {h.actor?.full_name ?? 'Сотрудник'} · {dayjs(h.created_at).format('DD.MM.YYYY HH:mm')}
              </Text>
              {h.comment && (
                <Text size="sm" mt={4} style={{ whiteSpace: 'pre-wrap' }}>
                  «{h.comment}»
                </Text>
              )}
            </Timeline.Item>
          ))}
        </Timeline>
      )}

      <Modal opened={!!action} onClose={() => setAction(null)} title={action ? ACTION_LABEL[action] : ''}>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (action) change.mutate({ to: action, comment })
          }}
        >
          <Stack>
            <Textarea
              label="Комментарий"
              description={commentRequired ? 'Обязательно: что нужно исправить' : 'Необязательно'}
              required={commentRequired}
              autosize
              minRows={3}
              value={comment}
              onChange={(e) => setComment(e.currentTarget.value)}
              data-autofocus
            />
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setAction(null)}>
                Отмена
              </Button>
              <Button
                type="submit"
                color={action ? STATUS_COLOR[action] : undefined}
                loading={change.isPending}
                disabled={commentRequired && !comment.trim()}
              >
                {action ? ACTION_LABEL[action] : ''}
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      <TaskFormModal opened={editing} onClose={() => setEditing(false)} task={t} />
    </Stack>
  )
}
