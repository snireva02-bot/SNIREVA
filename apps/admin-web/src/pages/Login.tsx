import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { isStaffRole, useAuth } from '@/lib/auth'
import { Button, ErrorNote, Field, Input } from '@/components/ui'

export function Login() {
  const { session, profile, loading, signOut } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!loading && session && profile && isStaffRole(profile.role) && profile.is_active) return <Navigate to="/" replace />
  const denied = !loading && session && profile && (!isStaffRole(profile.role) || !profile.is_active)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true); setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setBusy(false)
    if (error) setError(error.message === 'Invalid login credentials' ? 'Email or password is incorrect.' : error.message)
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex justify-center">
          <img src="/logo-wide.png" alt="SNIREVA" className="h-16 w-auto rounded-md bg-[#050505] px-3 py-2" />
        </div>
        <div className="rounded-md border border-line bg-surface p-6">
          <h1 className="text-xl font-semibold">Sign in to Admin</h1>
          <p className="mt-1 text-base text-ink-2">For SNIREVA staff only.</p>
          {denied ? (
            <div className="mt-5 flex flex-col gap-4">
              <ErrorNote error="This account doesn't have admin access. Ask the owner to add you as staff." />
              <Button onClick={signOut}>Use another account</Button>
            </div>
          ) : (
            <form onSubmit={submit} className="mt-5 flex flex-col gap-4">
              <Field label="Email" htmlFor="email">
                <Input id="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </Field>
              <Field label="Password" htmlFor="password">
                <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
              </Field>
              {error && <p role="alert" className="text-sm text-bad">{error}</p>}
              <Button type="submit" variant="primary" loading={busy} className="mt-1 w-full">Sign in</Button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
