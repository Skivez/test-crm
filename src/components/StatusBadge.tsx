import { Badge } from '@mantine/core'
import { STATUS_COLOR, STATUS_LABEL, type TaskStatus } from '../lib/types'

export function StatusBadge({ status }: { status: TaskStatus }) {
  return (
    <Badge color={STATUS_COLOR[status]} variant="light">
      {STATUS_LABEL[status]}
    </Badge>
  )
}
