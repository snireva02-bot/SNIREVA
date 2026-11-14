import { createClient } from '@supabase/supabase-js'
import type { Database } from '@snireva/shared'

const url = import.meta.env.VITE_SUPABASE_URL as string
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string
if (!url || !anonKey) throw new Error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY')

export const supabase = createClient<Database>(url, anonKey, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'snireva-admin' },
})

export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row']
export type Enums<T extends keyof Database['public']['Enums']> = Database['public']['Enums'][T]

/** Throws on Supabase errors so React Query can surface them. Use with .single()/lists/RPCs (not maybeSingle). */
export function must<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message)
  return res.data as T
}

const urlCache = new Map<string, { url: string; exp: number }>()
/** Signed URL for private buckets, cached for 50 minutes. */
export async function signedUrl(bucket: string, path: string | null | undefined): Promise<string | null> {
  if (!path) return null
  const key = `${bucket}/${path}`
  const hit = urlCache.get(key)
  if (hit && hit.exp > Date.now()) return hit.url
  if (bucket === 'scooters') return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 3600)
  if (error || !data) return null
  urlCache.set(key, { url: data.signedUrl, exp: Date.now() + 50 * 60 * 1000 })
  return data.signedUrl
}

/** Calls a Supabase Edge Function with the current session. */
export async function invoke<T = unknown>(fn: string, body: unknown): Promise<T> {
  const { data, error } = await supabase.functions.invoke(fn, { body: body as Record<string, unknown> })
  if (error) {
    let msg = error.message
    try {
      const ctx = (error as { context?: Response }).context
      if (ctx) msg = (await ctx.json()).error ?? msg
    } catch { /* keep message */ }
    throw new Error(msg)
  }
  return data as T
}
