import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createColumnHelper } from '@tanstack/react-table'
import { ImagePlus, Plus, Trash2 } from 'lucide-react'
import { formatDate, formatINR, SCOOTER_STATUS, scooterSchema } from '@snireva/shared'
import { supabase, type Enums, type Tables } from '@/lib/supabase'
import { isManager, useAuth } from '@/lib/auth'
import { useSettings } from '@/lib/queries'
import { DataTable, FilterSelect, SearchBox, useTableState } from '@/components/DataTable'
import { Button, Chip, Confirm, Drawer, Field, IconButton, Input, PageHeader, Select, Textarea, useToast } from '@/components/ui'

type Scooter = Tables<'scooters'>
const col = createColumnHelper<Scooter>()
const publicUrl = (path: string) => supabase.storage.from('scooters').getPublicUrl(path).data.publicUrl
// Statuses staff may set by hand; reserved/rented are driven by rentals.
const MANUAL: Enums<'scooter_status'>[] = ['available', 'under_maintenance', 'retired']

function ScooterDrawer({ scooter, open, onClose }: { scooter: Scooter | null; open: boolean; onClose: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const { profile } = useAuth()
  const settings = useSettings()
  const empty = { code: '', model: '', chassis_no: '', motor_no: '', battery_no: '', battery_details: '', weekly_rent: '', status: 'available' as Enums<'scooter_status'>, maintenance_notes: '' }
  const [v, setV] = useState(empty)
  const [photos, setPhotos] = useState<string[]>([])
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [uploading, setUploading] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    if (!open) return
    setErrors({})
    setV(scooter ? {
      code: scooter.code, model: scooter.model, chassis_no: scooter.chassis_no ?? '', motor_no: scooter.motor_no ?? '',
      battery_no: scooter.battery_no ?? '', battery_details: scooter.battery_details ?? '',
      weekly_rent: scooter.weekly_rent?.toString() ?? '', status: scooter.status, maintenance_notes: scooter.maintenance_notes ?? '',
    } : empty)
    setPhotos(scooter?.photo_paths ?? [])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, scooter])

  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV((x) => ({ ...x, [k]: e.target.value }))
  const locked = scooter?.status === 'reserved' || scooter?.status === 'rented'

  const save = useMutation({
    mutationFn: async () => {
      const parsed = scooterSchema.safeParse({ ...v, weekly_rent: v.weekly_rent === '' ? null : v.weekly_rent })
      if (!parsed.success) {
        const e: Record<string, string> = {}
        for (const i of parsed.error.issues) e[String(i.path[0])] ??= i.message
        setErrors(e)
        throw new Error('Fix the highlighted fields')
      }
      const row = {
        ...parsed.data,
        code: parsed.data.code.toUpperCase(),
        chassis_no: parsed.data.chassis_no || null, motor_no: parsed.data.motor_no || null,
        battery_no: parsed.data.battery_no || null, battery_details: parsed.data.battery_details || null,
        weekly_rent: parsed.data.weekly_rent ?? null,
        maintenance_notes: v.maintenance_notes || null,
        photo_paths: photos,
        ...(locked ? {} : { status: v.status }),
      }
      const res = scooter
        ? await supabase.from('scooters').update(row).eq('id', scooter.id)
        : await supabase.from('scooters').insert(row)
      if (res.error) throw new Error(res.error.code === '23505' ? `Scooter ID ${row.code} already exists` : res.error.message)
    },
    onSuccess: () => { toast('ok', scooter ? 'Scooter updated' : 'Scooter added'); qc.invalidateQueries({ queryKey: ['scooters'] }); onClose() },
    onError: (e) => toast('error', (e as Error).message),
  })

  const del = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('scooters').delete().eq('id', scooter!.id)
      if (error) throw new Error(error.code === '23503' ? 'This scooter has rental history. Set it to Retired instead.' : error.message)
    },
    onSuccess: () => { toast('ok', 'Scooter deleted'); qc.invalidateQueries({ queryKey: ['scooters'] }); setConfirmDelete(false); onClose() },
    onError: (e) => { toast('error', (e as Error).message); setConfirmDelete(false) },
  })

  async function addPhotos(files: FileList | null) {
    if (!files?.length) return
    setUploading(true)
    try {
      const added: string[] = []
      for (const f of Array.from(files)) {
        const path = `${(v.code || 'new').toUpperCase()}/${Date.now()}-${f.name.replace(/[^a-z0-9.]+/gi, '-')}`
        const { error } = await supabase.storage.from('scooters').upload(path, f, { contentType: f.type })
        if (error) throw error
        added.push(path)
      }
      setPhotos((p) => [...p, ...added])
    } catch (e) {
      toast('error', (e as Error).message)
    } finally {
      setUploading(false)
    }
  }

  return (
    <Drawer open={open} onClose={onClose} title={scooter ? `Edit ${scooter.code}` : 'Add scooter'} width={520}
      footer={<>
        {scooter && isManager(profile?.role) && !locked && <Button variant="danger" icon={Trash2} className="mr-auto" onClick={() => setConfirmDelete(true)}>Delete</Button>}
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" type="submit" form="scooter-form" loading={save.isPending}>{scooter ? 'Save changes' : 'Add scooter'}</Button>
      </>}>
      <form id="scooter-form" className="flex flex-col gap-4" onSubmit={(e: FormEvent) => { e.preventDefault(); save.mutate() }}>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Scooter ID" htmlFor="code" required error={errors.code}><Input id="code" value={v.code} onChange={set('code')} placeholder="SNR-007" className="uppercase" /></Field>
          <Field label="Model" htmlFor="model" required error={errors.model}><Input id="model" value={v.model} onChange={set('model')} /></Field>
          <Field label="Chassis no." htmlFor="chassis"><Input id="chassis" value={v.chassis_no} onChange={set('chassis_no')} /></Field>
          <Field label="Motor no." htmlFor="motor"><Input id="motor" value={v.motor_no} onChange={set('motor_no')} /></Field>
          <Field label="Battery no." htmlFor="battery"><Input id="battery" value={v.battery_no} onChange={set('battery_no')} /></Field>
          <Field label="Weekly rent (₹)" htmlFor="rent" hint={`Blank uses the default ${formatINR(settings.data?.weekly_rent)}`} error={errors.weekly_rent}>
            <Input id="rent" inputMode="decimal" value={v.weekly_rent} onChange={set('weekly_rent')} placeholder={String(settings.data?.weekly_rent ?? '')} className="num" />
          </Field>
        </div>
        <Field label="Battery details" htmlFor="bdetails"><Input id="bdetails" value={v.battery_details} onChange={set('battery_details')} placeholder="e.g. 60V 30Ah Li-ion, ~90 km range" /></Field>
        <Field label="Status" htmlFor="status" hint={locked ? 'Reserved / rented scooters change status through the rental.' : undefined}>
          <Select id="status" value={v.status} disabled={locked} onChange={set('status')}>
            {(locked ? [v.status] : MANUAL).map((s) => <option key={s} value={s}>{SCOOTER_STATUS[s].label}</option>)}
          </Select>
        </Field>
        <Field label="Maintenance notes" htmlFor="mnotes"><Textarea id="mnotes" rows={3} value={v.maintenance_notes} onChange={set('maintenance_notes')} placeholder="Service history, known issues" /></Field>
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">Photos</span>
          <div className="grid grid-cols-4 gap-2">
            {photos.map((p) => (
              <div key={p} className="group relative aspect-square overflow-hidden rounded-md border border-line bg-canvas">
                <img src={publicUrl(p)} alt="" className="h-full w-full object-cover" />
                <IconButton icon={Trash2} label="Remove photo" onClick={() => setPhotos((x) => x.filter((y) => y !== p))}
                  className="absolute right-1 top-1 bg-surface/90 opacity-0 group-hover:opacity-100 focus:opacity-100" />
              </div>
            ))}
            <label className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed border-line-strong text-sm text-ink-2 hover:bg-canvas">
              <ImagePlus size={20} aria-hidden />{uploading ? 'Uploading…' : 'Add'}
              <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" onChange={(e) => addPhotos(e.target.files)} />
            </label>
          </div>
        </div>
      </form>
      <Confirm open={confirmDelete} title={`Delete ${scooter?.code}?`} danger confirmLabel="Delete"
        body="This can't be undone. Scooters with rental history can only be retired." loading={del.isPending}
        onConfirm={() => del.mutate()} onClose={() => setConfirmDelete(false)} />
    </Drawer>
  )
}

export function Scooters() {
  const ts = useTableState({ id: 'code', desc: false })
  const search = ts.filter('q')
  const status = ts.filter('status')
  const settings = useSettings()
  const [editing, setEditing] = useState<Scooter | null>(null)
  const [open, setOpen] = useState(false)

  const q = useQuery({
    queryKey: ['scooters', ts.page, ts.sorting, search, status],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      let query = supabase.from('scooters').select('*', { count: 'exact' })
      if (search) query = query.or(`code.ilike.%${search}%,model.ilike.%${search}%,chassis_no.ilike.%${search}%`)
      if (status) query = query.eq('status', status as Scooter['status'])
      const sort = ts.sorting[0]
      const { data, count, error } = await query.order(sort.id, { ascending: !sort.desc }).range(...ts.range)
      if (error) throw error
      return { rows: data, count: count ?? 0 }
    },
  })
  const counts = useQuery({
    queryKey: ['scooters', 'counts'],
    queryFn: async () => {
      const { data } = await supabase.from('scooters').select('status')
      return (data ?? []).reduce<Record<string, number>>((a, s) => { a[s.status] = (a[s.status] ?? 0) + 1; return a }, {})
    },
  })

  const columns = useMemo(() => [
    col.accessor('photo_paths', {
      header: '', enableSorting: false, cell: (c) => (
        <div className="size-9 overflow-hidden rounded-md bg-canvas">{c.getValue()[0] && <img src={publicUrl(c.getValue()[0])} alt="" className="h-full w-full object-cover" loading="lazy" />}</div>
      ),
    }),
    col.accessor('code', { header: 'Scooter ID', cell: (c) => <span className="font-medium">{c.getValue()}</span> }),
    col.accessor('model', { header: 'Model' }),
    col.accessor('battery_no', { header: 'Battery no.', cell: (c) => <span className="num text-ink-2">{c.getValue() ?? '—'}</span> }),
    col.accessor('chassis_no', { header: 'Chassis no.', cell: (c) => <span className="num text-ink-2">{c.getValue() ?? '—'}</span> }),
    col.accessor('weekly_rent', { header: 'Weekly rent', meta: { align: 'right' }, cell: (c) => formatINR(c.getValue() ?? settings.data?.weekly_rent) }),
    col.accessor('status', { header: 'Status', cell: (c) => <Chip meta={SCOOTER_STATUS[c.getValue()]} /> }),
    col.accessor('updated_at', { header: 'Updated', cell: (c) => <span className="num text-ink-2">{formatDate(c.getValue())}</span> }),
  ], [settings.data?.weekly_rent])

  const c = counts.data ?? {}
  return (
    <>
      <PageHeader title="Scooters"
        description={<span className="num">{Object.values(c).reduce((a, b) => a + b, 0)} total · {c.available ?? 0} available · {c.rented ?? 0} rented · {c.reserved ?? 0} reserved · {c.under_maintenance ?? 0} in maintenance</span>}
        actions={<Button variant="primary" icon={Plus} onClick={() => { setEditing(null); setOpen(true) }}>Add scooter</Button>} />
      <DataTable columns={columns} data={q.data?.rows} total={q.data?.count} loading={q.isPending} error={q.error} onRetry={() => q.refetch()}
        state={ts} onRowClick={(r) => { setEditing(r); setOpen(true) }}
        empty={{ title: 'No scooters found', body: search || status ? 'Try clearing the filters.' : 'Add your first scooter to start renting.' }}
        toolbar={<>
          <SearchBox value={search} onChange={(v) => ts.setFilter('q', v)} placeholder="Search ID, model, chassis" />
          <FilterSelect label="Status" value={status} onChange={(v) => ts.setFilter('status', v)} options={Object.entries(SCOOTER_STATUS).map(([k, m]) => [k, m.label])} />
        </>} />
      <ScooterDrawer scooter={editing} open={open} onClose={() => setOpen(false)} />
    </>
  )
}
