import { useEffect, useState } from 'react'
import { Alert, Button, Group, Modal, Stack, TextInput } from '@mantine/core'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { errorMessage, saveObject } from '../lib/api'
import type { SiteObject } from '../lib/types'

interface Props {
  opened: boolean
  onClose: () => void
  object?: SiteObject | null
}

export function ObjectFormModal({ opened, onClose, object }: Props) {
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')

  useEffect(() => {
    if (opened) {
      setName(object?.name ?? '')
      setAddress(object?.address ?? '')
      mutation.reset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, object])

  const mutation = useMutation({
    mutationFn: () => saveObject({ id: object?.id, name, address }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['objects'] })
      qc.invalidateQueries({ queryKey: ['object'] })
      onClose()
    },
  })

  return (
    <Modal opened={opened} onClose={onClose} title={object ? 'Редактировать объект' : 'Новый объект'}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          mutation.mutate()
        }}
      >
        <Stack>
          {mutation.error && <Alert color="red">{errorMessage(mutation.error)}</Alert>}
          <TextInput label="Название" required value={name} onChange={(e) => setName(e.currentTarget.value)} data-autofocus />
          <TextInput label="Адрес" required value={address} onChange={(e) => setAddress(e.currentTarget.value)} />
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              Отмена
            </Button>
            <Button type="submit" loading={mutation.isPending} disabled={!name.trim() || !address.trim()}>
              Сохранить
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  )
}
