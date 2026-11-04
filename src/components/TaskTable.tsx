import { Anchor, Table, Text } from '@mantine/core'
import { Link } from 'react-router-dom'
import dayjs from 'dayjs'
import type { TaskWithRefs } from '../lib/types'
import { StatusBadge } from './StatusBadge'

interface Props {
  tasks: TaskWithRefs[]
  showObject?: boolean
  showAssignee?: boolean
  empty?: string
}

export function TaskTable({ tasks, showObject, showAssignee, empty = 'Задач нет' }: Props) {
  if (!tasks.length) return <Text c="dimmed">{empty}</Text>
  return (
    <Table.ScrollContainer minWidth={560}>
      <Table highlightOnHover verticalSpacing="sm">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Задача</Table.Th>
            {showObject && <Table.Th>Объект</Table.Th>}
            {showAssignee && <Table.Th>Исполнитель</Table.Th>}
            <Table.Th>Статус</Table.Th>
            <Table.Th>Создана</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {tasks.map((t) => (
            <Table.Tr key={t.id}>
              <Table.Td>
                <Anchor component={Link} to={`/tasks/${t.id}`} fw={500}>
                  {t.title}
                </Anchor>
              </Table.Td>
              {showObject && (
                <Table.Td>
                  {t.object ? (
                    <Anchor component={Link} to={`/objects/${t.object.id}`} c="dimmed" size="sm">
                      {t.object.name}
                    </Anchor>
                  ) : (
                    '—'
                  )}
                </Table.Td>
              )}
              {showAssignee && <Table.Td>{t.assignee?.full_name ?? '—'}</Table.Td>}
              <Table.Td>
                <StatusBadge status={t.status} />
              </Table.Td>
              <Table.Td>
                <Text size="sm" c="dimmed">
                  {dayjs(t.created_at).format('DD.MM.YYYY')}
                </Text>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  )
}
