import { useEffect, useState } from 'react'
import { Alert, Button, Group, Modal, Select, Stack, TextInput, Textarea } from '@mantine/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { errorMessage, fetchExecutors, fetchObjects, saveTask } from '../lib/api'
import type { Task } from '../lib/types'

interface Props {
  opened: boolean
  onClose: () => void
  task?: Task | null
  defaultObjectId?: string
  onSaved?: (id: string) => void
}

export function TaskFormModal({ opened, onClose, task, defaultObjectId, onSaved }: Props) {
  const qc = useQueryClient()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [objectId, setObjectId] = useState<string | null>(null)
  const [assigneeId, setAssigneeId] = useState<string | null>(null)

  const executors = useQuery({ queryKey: ['executors'], queryFn: fetchExecutors, enabled: opened })
  const objects = useQuery({ queryKey: ['objects'], queryFn: fetchObjects, enabled: opened })

  useEffect(() => {
    if (opened) {
      setTitle(task?.title ?? '')
      setDescription(task?.description ?? '')
      setObjectId(task?.object_id ?? defaultObjectId ?? null)
      setAssigneeId(task?.assignee_id ?? null)
      mutation.reset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, task, defaultObjectId])

  const mutation = useMutation({
    mutationFn: () =>
      saveTask({ id: task?.id, title, description, object_id: objectId!, assignee_id: assigneeId! }),
    onSuccess: ({ id }) => {
      qc.invalidateQueries({ queryKey: ['tasks'] })
      qc.invalidateQueries({ queryKey: ['task', id] })
      qc.invalidateQueries({ queryKey: ['objects'] })
      onClose()
      onSaved?.(id)
    },
  })

  const valid = title.trim() && objectId && assigneeId

  return (
    <Modal opened={opened} onClose={onClose} title={task ? 'Редактировать задачу' : 'Новая задача'} size="lg">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (valid) mutation.mutate()
        }}
      >
        <Stack>
          {mutation.error && <Alert color="red">{errorMessage(mutation.error)}</Alert>}
          <TextInput label="Название" required value={title} onChange={(e) => setTitle(e.currentTarget.value)} data-autofocus />
          <Textarea
            label="Описание"
            autosize
            minRows={3}
            value={description}
            onChange={(e) => setDescription(e.currentTarget.value)}
          />
          <Select
            label="Объект"
            required
            searchable
            data={(objects.data ?? []).map((o) => ({ value: o.id, label: o.name }))}
            value={objectId}
            onChange={setObjectId}
          />
          <Select
            label="Исполнитель"
            required
            searchable
            data={(executors.data ?? []).map((p) => ({ value: p.id, label: p.full_name }))}
            value={assigneeId}
            onChange={setAssigneeId}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              Отмена
            </Button>
            <Button type="submit" loading={mutation.isPending} disabled={!valid}>
              Сохранить
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  )
}
