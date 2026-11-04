import { useState } from 'react'
import { Alert, Anchor, Button, Group, Loader, Stack, Table, Text, Title } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { errorMessage, fetchObjects } from '../lib/api'
import { ObjectFormModal } from '../components/ObjectFormModal'

export function ObjectsPage() {
  const { isManager } = useAuth()
  const [creating, setCreating] = useState(false)
  const objects = useQuery({ queryKey: ['objects'], queryFn: fetchObjects })

  return (
    <Stack>
      <Group justify="space-between">
        <Title order={2}>Объекты</Title>
        {isManager && <Button onClick={() => setCreating(true)}>Добавить объект</Button>}
      </Group>
      {!isManager && (
        <Text c="dimmed" size="sm">
          Показаны объекты, на которых у вас есть задачи.
        </Text>
      )}

      {objects.isPending ? (
        <Loader />
      ) : objects.error ? (
        <Alert color="red">{errorMessage(objects.error)}</Alert>
      ) : !objects.data.length ? (
        <Text c="dimmed">Объектов пока нет</Text>
      ) : (
        <Table.ScrollContainer minWidth={560}>
          <Table highlightOnHover verticalSpacing="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Название</Table.Th>
                <Table.Th>Адрес</Table.Th>
                <Table.Th ta="right">{isManager ? 'Задач (открытых)' : 'Моих задач'}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {objects.data.map((o) => {
                const open = o.tasks.filter((t) => t.status !== 'accepted').length
                return (
                  <Table.Tr key={o.id}>
                    <Table.Td>
                      <Anchor component={Link} to={`/objects/${o.id}`} fw={500}>
                        {o.name}
                      </Anchor>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">{o.address}</Text>
                    </Table.Td>
                    <Table.Td ta="right">
                      {o.tasks.length} ({open})
                    </Table.Td>
                  </Table.Tr>
                )
              })}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}

      <ObjectFormModal opened={creating} onClose={() => setCreating(false)} />
    </Stack>
  )
}
