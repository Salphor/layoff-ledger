import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// This client relies on your existing RLS policies to restrict read access.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false }
})