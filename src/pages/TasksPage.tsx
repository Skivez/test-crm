import { useState } from 'react'
import { Alert, Button, Group, Loader, Select, Stack, Title } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { errorMessage, fetchExecutors, fetchObjects, fetchTasks } from '../lib/api'
import { STATUS_LABEL, STATUS_ORDER, type TaskStatus } from '../lib/types'
import { TaskFormModal } from '../components/TaskFormModal'
import { TaskTable } from '../components/TaskTable'

/** Все задачи — экран постановщика. */
export function TasksPage() {
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)
  const [status, setStatus] = useState<string | null>('open')
  const [objectId, setObjectId] = useState<string | null>(null)
  const [assigneeId, setAssigneeId] = useState<string | null>(null)

  const tasks = useQuery({ queryKey: ['tasks', {}], queryFn: () => fetchTasks({}) })
  const objects = useQuery({ queryKey: ['objects'], queryFn: fetchObjects })
  const executors = useQuery({ queryKey: ['executors'], queryFn: fetchExecutors })

  const shown = (tasks.data ?? []).filter(
    (t) =>
      (!status || (status === 'open' ? t.status !== 'accepted' : t.status === status)) &&
      (!objectId || t.object_id === objectId) &&
      (!assigneeId || t.assignee_id === assigneeId),
  )

  return (
    <Stack>
      <Group justify="space-between">
        <Title order={2}>Задачи</Title>
        <Button onClick={() => setCreating(true)}>Новая задача</Button>
      </Group>

      <Group grow preventGrowOverflow={false} wrap="wrap">
        <Select
          label="Статус"
          placeholder="Все"
          clearable
          value={status}
          onChange={setStatus}
          data={[
            { value: 'open', label: 'Все незакрытые' },
            ...STATUS_ORDER.map((s: TaskStatus) => ({ value: s, label: STATUS_LABEL[s] })),
          ]}
        />
        <Select
          label="Объект"
          placeholder="Все"
          clearable
          searchable
          value={objectId}
          onChange={setObjectId}
          data={(objects.data ?? []).map((o) => ({ value: o.id, label: o.name }))}
        />
        <Select
          label="Исполнитель"
          placeholder="Все"
          clearable
          searchable
          value={assigneeId}
          onChange={setAssigneeId}
          data={(executors.data ?? []).map((p) => ({ value: p.id, label: p.full_name }))}
        />
      </Group>

      {tasks.isPending ? (
        <Loader />
      ) : tasks.error ? (
        <Alert color="red">{errorMessage(tasks.error)}</Alert>
      ) : (
        <TaskTable tasks={shown} showObject showAssignee empty="Задач по выбранным условиям нет" />
      )}

      <TaskFormModal
        opened={creating}
        onClose={() => setCreating(false)}
        onSaved={(id) => navigate(`/tasks/${id}`)}
      />
    </Stack>
  )
}
