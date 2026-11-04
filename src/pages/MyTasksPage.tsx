import { useState } from 'react'
import { Alert, Loader, SegmentedControl, Stack, Title } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../auth/AuthProvider'
import { errorMessage, fetchTasks } from '../lib/api'
import { TaskTable } from '../components/TaskTable'

export function MyTasksPage() {
  const { session } = useAuth()
  const userId = session!.user.id
  const [filter, setFilter] = useState<'active' | 'all'>('active')
  // RLS и так вернёт исполнителю только его задачи; фильтр по assignee — для явности.
  const tasks = useQuery({
    queryKey: ['tasks', { assigneeId: userId }],
    queryFn: () => fetchTasks({ assigneeId: userId }),
  })

  const shown = (tasks.data ?? []).filter((t) => filter === 'all' || t.status !== 'accepted')

  return (
    <Stack>
      <Title order={2}>Мои задачи</Title>
      <SegmentedControl
        w="fit-content"
        value={filter}
        onChange={(v) => setFilter(v as 'active' | 'all')}
        data={[
          { value: 'active', label: 'Активные' },
          { value: 'all', label: 'Все' },
        ]}
      />
      {tasks.isPending ? (
        <Loader />
      ) : tasks.error ? (
        <Alert color="red">{errorMessage(tasks.error)}</Alert>
      ) : (
        <TaskTable tasks={shown} showObject empty="Задач нет" />
      )}
    </Stack>
  )
}
