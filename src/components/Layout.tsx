import { AppShell, Badge, Button, Container, Group, Text } from '@mantine/core'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { ROLE_LABEL } from '../lib/types'

function TopLink({ to, children }: { to: string; children: string }) {
  return (
    <NavLink to={to} style={{ textDecoration: 'none' }}>
      {({ isActive }) => (
        <Button variant={isActive ? 'light' : 'subtle'} size="compact-md">
          {children}
        </Button>
      )}
    </NavLink>
  )
}

export function Layout() {
  const { profile, isManager, signOut } = useAuth()
  return (
    <AppShell header={{ height: 56 }} padding="md">
      <AppShell.Header>
        <Container size="lg" h="100%">
          <Group h="100%" justify="space-between" wrap="nowrap">
            <Group gap="xs" wrap="nowrap">
              <Text fw={700} mr="sm" visibleFrom="sm">
                Объекты и задачи
              </Text>
              {isManager ? <TopLink to="/tasks">Задачи</TopLink> : <TopLink to="/my-tasks">Мои задачи</TopLink>}
              <TopLink to="/objects">Объекты</TopLink>
            </Group>
            <Group gap="sm" wrap="nowrap">
              <Text size="sm" visibleFrom="xs">
                {profile?.full_name}
              </Text>
              {profile && (
                <Badge variant="outline" color={isManager ? 'violet' : 'teal'}>
                  {ROLE_LABEL[profile.role]}
                </Badge>
              )}
              <Button variant="default" size="compact-sm" onClick={signOut}>
                Выйти
              </Button>
            </Group>
          </Group>
        </Container>
      </AppShell.Header>
      <AppShell.Main>
        <Container size="lg">
          <Outlet />
        </Container>
      </AppShell.Main>
    </AppShell>
  )
}
