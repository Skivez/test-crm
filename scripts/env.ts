import { config } from 'dotenv'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// .env.local — публичные настройки фронтенда (URL + anon key);
// .env.seed — секреты только для локальных скриптов (service_role, пароль). Оба в .gitignore.
config({ path: '.env.local', quiet: true })
config({ path: '.env.seed', quiet: true })

function required(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Не задана переменная окружения ${name}`)
  return v
}

export const SUPABASE_URL = required('VITE_SUPABASE_URL')
export const ANON_KEY = required('VITE_SUPABASE_ANON_KEY')

export const DEMO_USERS = {
  manager: { email: 'manager@example.com', full_name: 'Ирина Смирнова', role: 'manager' },
  manager2: { email: 'manager2@example.com', full_name: 'Олег Волков', role: 'manager' },
  executor1: { email: 'executor1@example.com', full_name: 'Алексей Кузнецов', role: 'executor' },
  executor2: { email: 'executor2@example.com', full_name: 'Дмитрий Соколов', role: 'executor' },
} as const

export type DemoUserKey = keyof typeof DEMO_USERS

export function demoPassword(): string {
  return required('SEED_PASSWORD')
}

export function anonClient(): SupabaseClient {
  return createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export async function signedIn(key: DemoUserKey): Promise<SupabaseClient> {
  const c = anonClient()
  const { error } = await c.auth.signInWithPassword({
    email: DEMO_USERS[key].email,
    password: demoPassword(),
  })
  if (error) throw new Error(`Вход ${key}: ${error.message}`)
  return c
}

export function adminClient(): SupabaseClient {
  return createClient(SUPABASE_URL, required('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
