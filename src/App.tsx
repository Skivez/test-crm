import { Center, Loader } from '@mantine/core'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth/AuthProvider'
import { Layout } from './components/Layout'
import { LoginPage } from './pages/LoginPage'
import { MyTasksPage } from './pages/MyTasksPage'
import { ObjectPage } from './pages/ObjectPage'
import { ObjectsPage } from './pages/ObjectsPage'
import { TaskPage } from './pages/TaskPage'
import { TasksPage } from './pages/TasksPage'

export default function App() {
  const { session, loading, isManager } = useAuth()

  if (loading) {
    return (
      <Center mih="100vh">
        <Loader />
      </Center>
    )
  }

  if (!session) {
    return (
      <Routes>
        <Route path="*" element={<LoginPage />} />
      </Routes>
    )
  }

  const home = isManager ? '/tasks' : '/my-tasks'
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/objects" element={<ObjectsPage />} />
        <Route path="/objects/:id" element={<ObjectPage />} />
        <Route path="/tasks" element={isManager ? <TasksPage /> : <Navigate to="/my-tasks" replace />} />
        <Route path="/tasks/:id" element={<TaskPage />} />
        <Route path="/my-tasks" element={isManager ? <Navigate to="/tasks" replace /> : <MyTasksPage />} />
        <Route path="*" element={<Navigate to={home} replace />} />
      </Route>
    </Routes>
  )
}
