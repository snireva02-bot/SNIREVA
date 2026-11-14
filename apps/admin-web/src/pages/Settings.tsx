import { useEffect, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Plus, UserPlus } from 'lucide-react'
import { formatDateTime, formatINR, ROLE_LABEL } from '@snireva/shared'
import { invoke, must, supabase, type Tables } from '@/lib/supabase'
import { isOwner, useAuth } from '@/lib/auth'
import { useSettings } from '@/lib/queries'
import { Button, Card, Checkbox, Chip, Confirm, Drawer, Field, Input, PageHeader, Select, Skeleton, Textarea, useToast } from '@/components/ui'

type S = Tables<'settings'>

function SettingsForm({ s, readOnly }: { s: S; readOnly: boolean }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [v, setV] = useState(s)
  const [applyOpen, setApplyOpen] = useState(false)
  useEffect(() => setV(s), [s])
  const set = (k: keyof S) => (e: { target: { value: string } }) => setV((x) => ({ ...x, [k]: e.target.value }))

  const save = useMutation({
    mutationFn: async () => {
      const num = (x: unknown) => Number(x)
      if (num(v.weekly_rent) <= 0) throw new Error('Weekly rent must be more than 0')
      const { error } = await supabase.from('settings').update({
        weekly_rent: num(v.weekly_rent), deposit_amount: num(v.deposit_amount), late_fee_per_day: num(v.late_fee_per_day), grace_days: Math.round(num(v.grace_days)),
        support_phone: v.support_phone || null, support_whatsapp: v.support_whatsapp || null, support_email: v.support_email || null,
        company_name: v.company_name, company_address: v.company_address || null, company_gstin: v.company_gstin || null, company_cin: v.company_cin || null,
      }).eq('id', 1)
      if (error) throw error
    },
    onSuccess: () => { toast('ok', 'Settings saved. New rentals use the new values; running rentals keep theirs.'); qc.invalidateQueries({ queryKey: ['settings'] }) },
    onError: (e) => toast('error', (e as Error).message),
  })
  const apply = useMutation({
    mutationFn: async () => must(await supabase.rpc('apply_current_rent', {})),
    onSuccess: (n) => { toast('ok', `Weekly rent updated on ${n} running rental(s)`); setApplyOpen(false) },
    onError: (e) => toast('error', (e as Error).message),
  })

  return (
    <form onSubmit={(e: FormEvent) => { e.preventDefault(); save.mutate() }} className="flex flex-col gap-4">
      <fieldset disabled={readOnly} className="contents">
        <Card title="Rent and charges">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Field label="Weekly rent (₹)" htmlFor="wr"><Input id="wr" className="num" inputMode="decimal" value={String(v.weekly_rent)} onChange={set('weekly_rent')} /></Field>
            <Field label="Deposit (₹)" htmlFor="dep"><Input id="dep" className="num" inputMode="decimal" value={String(v.deposit_amount)} onChange={set('deposit_amount')} /></Field>
            <Field label="Late fee per day (₹)" htmlFor="lf"><Input id="lf" className="num" inputMode="decimal" value={String(v.late_fee_per_day)} onChange={set('late_fee_per_day')} /></Field>
            <Field label="Grace days" htmlFor="gd" hint="No late fee within this many days"><Input id="gd" className="num" inputMode="numeric" value={String(v.grace_days)} onChange={set('grace_days')} /></Field>
          </div>
          <p className="mt-3 text-sm text-ink-2">Rent is fixed on each rental when it starts. Changing it here doesn't change running rentals{!readOnly && <> unless you <button type="button" className="font-medium text-brand-press underline" onClick={() => setApplyOpen(true)}>apply it to running rentals</button></>}.</p>
        </Card>
        <Card title="Support contacts">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Field label="Phone" htmlFor="sp"><Input id="sp" type="tel" value={v.support_phone ?? ''} onChange={set('support_phone')} placeholder="+91…" /></Field>
            <Field label="WhatsApp" htmlFor="sw"><Input id="sw" type="tel" value={v.support_whatsapp ?? ''} onChange={set('support_whatsapp')} placeholder="+91…" /></Field>
            <Field label="Email" htmlFor="se"><Input id="se" type="email" value={v.support_email ?? ''} onChange={set('support_email')} /></Field>
          </div>
        </Card>
        <Card title="Company details (used on agreements and receipts)">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Field label="Legal name" htmlFor="cn"><Input id="cn" value={v.company_name} onChange={set('company_name')} /></Field>
            <Field label="Address" htmlFor="ca"><Input id="ca" value={v.company_address ?? ''} onChange={set('company_address')} /></Field>
            <Field label="GSTIN" htmlFor="cg"><Input id="cg" value={v.company_gstin ?? ''} onChange={set('company_gstin')} /></Field>
            <Field label="CIN" htmlFor="cc"><Input id="cc" value={v.company_cin ?? ''} onChange={set('company_cin')} /></Field>
          </div>
        </Card>
      </fieldset>
      {readOnly ? <p className="text-sm text-ink-2">Only the owner can change settings.</p>
        : <div className="flex justify-end"><Button type="submit" variant="primary" loading={save.isPending}>Save settings</Button></div>}
      <Confirm open={applyOpen} title="Apply current rent to running rentals?" confirmLabel={`Apply ${formatINR(s.weekly_rent)}`} loading={apply.isPending}
        body={`Every open rental will be charged ${formatINR(s.weekly_rent)} per week (or its scooter's own rent) from its next payment. Customers are not notified automatically.`}
        onConfirm={() => apply.mutate()} onClose={() => setApplyOpen(false)} />
    </form>
  )
}

function PickupLocations({ canEdit }: { canEdit: boolean }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [edit, setEdit] = useState<Partial<Tables<'pickup_locations'>> | null>(null)
  const q = useQuery({ queryKey: ['pickup-admin'], queryFn: async () => must(await supabase.from('pickup_locations').select('*').order('name')) })
  const save = useMutation({
    mutationFn: async () => {
      if (!edit?.name?.trim() || !edit.address?.trim()) throw new Error('Name and address are required')
      const row = { name: edit.name.trim(), address: edit.address.trim(), is_active: edit.is_active ?? true }
      const { error } = edit.id ? await supabase.from('pickup_locations').update(row).eq('id', edit.id) : await supabase.from('pickup_locations').insert(row)
      if (error) throw error
    },
    onSuccess: () => { toast('ok', 'Pickup location saved'); qc.invalidateQueries({ queryKey: ['pickup-admin'] }); setEdit(null) },
    onError: (e) => toast('error', (e as Error).message),
  })
  return (
    <Card title="Pickup locations" pad={false} actions={canEdit && <Button size="sm" icon={Plus} onClick={() => setEdit({ is_active: true })}>Add</Button>}>
      <ul className="divide-y divide-line">
        {q.data?.map((l) => (
          <li key={l.id} className="flex items-center gap-3 px-4 py-3">
            <div className="flex-1"><p className="font-medium">{l.name}</p><p className="text-sm text-ink-2">{l.address}</p></div>
            {!l.is_active && <Chip tone="grey">Hidden</Chip>}
            {canEdit && <Button size="sm" variant="ghost" onClick={() => setEdit(l)}>Edit</Button>}
          </li>
        ))}
      </ul>
      <Drawer open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Edit pickup location' : 'Add pickup location'}
        footer={<><Button onClick={() => setEdit(null)}>Cancel</Button><Button variant="primary" loading={save.isPending} onClick={() => save.mutate()}>Save</Button></>}>
        <div className="flex flex-col gap-4">
          <Field label="Name" htmlFor="pn"><Input id="pn" value={edit?.name ?? ''} onChange={(e) => setEdit((x) => ({ ...x, name: e.target.value }))} /></Field>
          <Field label="Address" htmlFor="pa"><Textarea id="pa" value={edit?.address ?? ''} onChange={(e) => setEdit((x) => ({ ...x, address: e.target.value }))} /></Field>
          <Checkbox label="Show to customers" checked={edit?.is_active ?? true} onChange={(v) => setEdit((x) => ({ ...x, is_active: v }))} />
        </div>
      </Drawer>
    </Card>
  )
}

function AgreementTemplate({ canEdit }: { canEdit: boolean }) {
  const qc = useQueryClient()
  const toast = useToast()
  const q = useQuery({ queryKey: ['templates'], queryFn: async () => must(await supabase.from('agreement_templates').select('*').order('version', { ascending: false })) })
  const [body, setBody] = useState('')
  const latest = q.data?.[0]
  useEffect(() => { if (latest) setBody(latest.body) }, [latest])
  const save = useMutation({
    mutationFn: async () => must(await supabase.rpc('save_agreement_template', { p_body: body })),
    onSuccess: (v) => { toast('ok', `Saved as version ${v}. New agreements will use it.`); qc.invalidateQueries({ queryKey: ['templates'] }) },
    onError: (e) => toast('error', (e as Error).message),
  })
  const placeholders = ['company_name', 'company_address', 'customer_name', 'customer_phone', 'customer_address', 'scooter_code', 'scooter_model', 'chassis_no', 'motor_no', 'battery_no', 'weekly_rent', 'deposit_amount', 'late_fee_per_day', 'grace_days', 'start_date']
  return (
    <Card title="Agreement template" actions={latest && <span className="text-sm text-ink-2">Version {latest.version} · {formatDateTime(latest.created_at)}</span>}>
      <div role="note" className="mb-4 flex items-start gap-2 rounded-md border border-warn/30 bg-warn-bg px-3 py-2 text-base text-warn">
        <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
        <span><strong>Final wording must be reviewed by a lawyer.</strong> Signed agreements keep the exact text that was signed; saving creates a new version.</span>
      </div>
      {!q.data ? <Skeleton className="h-64 w-full" /> : (
        <>
          <Textarea aria-label="Agreement text" value={body} onChange={(e) => setBody(e.target.value)} readOnly={!canEdit} rows={16} className="font-mono text-sm leading-6" />
          <p className="mt-2 text-xs text-muted">Placeholders: {placeholders.map((p) => `{{${p}}}`).join(' ')}</p>
          {canEdit && <div className="mt-3 flex justify-end"><Button variant="primary" disabled={body === latest?.body} loading={save.isPending} onClick={() => save.mutate()}>Save as new version</Button></div>}
        </>
      )}
    </Card>
  )
}

function StaffUsers() {
  const qc = useQueryClient()
  const toast = useToast()
  const { profile: me } = useAuth()
  const [open, setOpen] = useState(false)
  const [nu, setNu] = useState({ full_name: '', email: '', role: 'staff', password: '' })
  const q = useQuery({ queryKey: ['staff-users'], queryFn: async () => must(await supabase.from('profiles').select('id, full_name, email, role, is_active, created_at').neq('role', 'customer').order('created_at')) })
  const run = useMutation({
    mutationFn: (body: Record<string, unknown>) => invoke('admin-users', body),
    onSuccess: (_d, body) => { toast('ok', body.action === 'create' ? 'Staff account created. Share the temporary password securely.' : 'Updated'); qc.invalidateQueries({ queryKey: ['staff-users'] }); if (body.action === 'create') { setOpen(false); setNu({ full_name: '', email: '', role: 'staff', password: '' }) } },
    onError: (e) => toast('error', (e as Error).message),
  })
  return (
    <Card title="Staff and roles" pad={false} actions={<Button size="sm" icon={UserPlus} onClick={() => setOpen(true)}>Add staff</Button>}>
      <table className="w-full text-sm">
        <thead><tr className="border-b border-line text-left text-ink-2"><th className="h-9 px-4 font-medium">Name</th><th className="px-4 font-medium">Email</th><th className="px-4 font-medium">Role</th><th className="px-4 font-medium">Status</th><th /></tr></thead>
        <tbody>{q.data?.map((u) => (
          <tr key={u.id} className="border-b border-line last:border-0">
            <td className="h-11 px-4 font-medium">{u.full_name}</td>
            <td className="px-4 text-ink-2">{u.email}</td>
            <td className="px-4">
              <Select aria-label={`Role for ${u.full_name}`} value={u.role} disabled={u.id === me?.id || run.isPending} className="h-8 w-32! text-sm"
                onChange={(e) => run.mutate({ action: 'set_role', user_id: u.id, role: e.target.value })}>
                {(['staff', 'manager', 'owner'] as const).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
              </Select>
            </td>
            <td className="px-4">{u.is_active ? <Chip tone="green">Active</Chip> : <Chip tone="grey">Disabled</Chip>}</td>
            <td className="px-4 text-right">{u.id !== me?.id && <Button size="sm" variant={u.is_active ? 'danger' : 'secondary'} onClick={() => run.mutate({ action: 'set_active', user_id: u.id, active: !u.is_active })}>{u.is_active ? 'Disable' : 'Enable'}</Button>}</td>
          </tr>
        ))}</tbody>
      </table>
      <Drawer open={open} onClose={() => setOpen(false)} title="Add staff member"
        footer={<><Button onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" loading={run.isPending} onClick={() => run.mutate({ action: 'create', ...nu })}>Create account</Button></>}>
        <div className="flex flex-col gap-4">
          <Field label="Full name" htmlFor="sn2"><Input id="sn2" value={nu.full_name} onChange={(e) => setNu({ ...nu, full_name: e.target.value })} /></Field>
          <Field label="Email" htmlFor="se2"><Input id="se2" type="email" value={nu.email} onChange={(e) => setNu({ ...nu, email: e.target.value })} /></Field>
          <Field label="Role" htmlFor="sr2" hint="Staff: daily operations. Manager: + reports and audit log. Owner: everything.">
            <Select id="sr2" value={nu.role} onChange={(e) => setNu({ ...nu, role: e.target.value })}>
              {(['staff', 'manager', 'owner'] as const).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </Select>
          </Field>
          <Field label="Temporary password" htmlFor="sp2" hint="At least 10 characters. Ask them to keep it private.">
            <Input id="sp2" type="text" autoComplete="new-password" value={nu.password} onChange={(e) => setNu({ ...nu, password: e.target.value })} />
          </Field>
        </div>
      </Drawer>
    </Card>
  )
}

export function SettingsPage() {
  const { profile } = useAuth()
  const s = useSettings()
  const owner = isOwner(profile?.role)
  return (
    <>
      <PageHeader title="Settings" description={owner ? 'Changes are recorded in the audit log.' : 'View only. Ask the owner to change these.'} />
      <div className="flex flex-col gap-4">
        {s.data ? <SettingsForm s={s.data} readOnly={!owner} /> : <Skeleton className="h-64 w-full" />}
        <PickupLocations canEdit={owner} />
        <AgreementTemplate canEdit={owner} />
        {owner && <StaffUsers />}
      </div>
    </>
  )
}
