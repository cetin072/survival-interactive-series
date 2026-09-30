import { createClient } from '@supabase/supabase-js'

const projectUrl = import.meta.env.VITE_SUPABASE_URL?.trim()
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()

/** The browser only receives the public publishable key. Operator RPCs enforce user capability in Postgres. */
export const supabaseClient = projectUrl && publishableKey
  ? createClient(projectUrl, publishableKey, {
      auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true },
    })
  : null
