import { useState } from 'react'
import { Alert, Anchor, Button, Group, Loader, Paper, Stack, Text, Title } from '@mantine/core'
import { modals } from '@mantine/modals'
import { notifications } from '@mantine/notifications'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { deleteObject, errorMessage, fetchObject, fetchTasks } from '../lib/api'
import { ObjectFormModal } from '../components/ObjectFormModal'
import { TaskFormModal } from '../components/TaskFormModal'
import { TaskTable } from '../components/TaskTable'

export function ObjectPage() {
  const { id = '' } = useParams()
  const { isManager } = useAuth()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [creatingTask, setCreatingTask] = useState(false)

  const object = useQuery({ queryKey: ['object', id], queryFn: () => fetchObject(id) })
  const tasks = useQuery({ queryKey: ['tasks', { objectId: id }], queryFn: () => fetchTasks({ objectId: id }) })

  const remove = useMutation({
    mutationFn: () => deleteObject(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['objects'] })
      notifications.show({ message: 'Объект удалён', color: 'green' })
      navigate('/objects')
    },
    onError: (e) => notifications.show({ message: errorMessage(e), color: 'red' }),
  })

  if (object.isPending) return <Loader />
  if (object.error) return <Alert color="red">{errorMessage(object.error)}</Alert>
  // Нет объекта или нет доступа (RLS просто не вернёт строку) — для пользователя одно и то же.
  if (!object.data) return <Alert color="gray">Объект не найден или у вас нет к нему доступа.</Alert>

  const o = object.data
  return (
    <Stack>
      <Anchor component={Link} to="/objects" size="sm">
        ← Все объекты
      </Anchor>
      <Paper withBorder p="md" radius="md">
        <Group justify="space-between" align="flex-start">
          <div>
            <Title order={2}>{o.name}</Title>
            <Text c="dimmed">{o.address}</Text>
          </div>
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
                    title: 'Удалить объект?',
                    children: <Text size="sm">Объект можно удалить, только если у него нет задач.</Text>,
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
      </Paper>

      <Group justify="space-between">
        <Title order={3}>{isManager ? 'Задачи' : 'Мои задачи на объекте'}</Title>
        {isManager && <Button onClick={() => setCreatingTask(true)}>Новая задача</Button>}
      </Group>
      {tasks.isPending ? (
        <Loader />
      ) : tasks.error ? (
        <Alert color="red">{errorMessage(tasks.error)}</Alert>
      ) : (
        <TaskTable tasks={tasks.data} showAssignee={isManager} empty="На объекте пока нет задач" />
      )}

      <ObjectFormModal opened={editing} onClose={() => setEditing(false)} object={o} />
      <TaskFormModal
        opened={creatingTask}
        onClose={() => setCreatingTask(false)}
        defaultObjectId={o.id}
        onSaved={(taskId) => navigate(`/tasks/${taskId}`)}
      />
    </Stack>
  )
}
