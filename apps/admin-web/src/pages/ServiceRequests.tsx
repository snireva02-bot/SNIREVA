import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createColumnHelper } from '@tanstack/react-table'
import { ArrowRightLeft, Lock, NotebookPen } from 'lucide-react'
import { formatDateTime, formatPhone, SERVICE_CATEGORY_LABEL, SERVICE_STATUS } from '@snireva/shared'
import { must, signedUrl, supabase, type Enums } from '@/lib/supabase'
import { DataTable, FilterSelect, SearchBox, useTableState } from '@/components/DataTable'
import { Button, Checkbox, Chip, cx, DefList, Drawer, Field, Input, PageHeader, Select, Skeleton, Textarea, useToast } from '@/components/ui'

interface Row {
  id: string; category: Enums<'service_category'>; description: string; status: Enums<'service_status'>; created_at: string
  photo_paths: string[]; assigned_to: string | null; rental_id: string | null; scooter_id: string | null; reopened_count: number
  customer: { id: string; full_name: string | null; phone: string | null } | null
  assignee: { full_name: string | null } | null
  scooter: { code: string; model: string } | null
  rental: { id: string; status: Enums<'rental_status'>; scooter: { id: string; code: string } | null } | null
}
const col = createColumnHelper<Row>()

function Photo({ path }: { path: string }) {
  const { data } = useQuery({ queryKey: ['signed', 'service', path], staleTime: 45 * 60_000, queryFn: () => signedUrl('service', path) })
  return data ? <a href={data} target="_blank" rel="noreferrer"><img src={data} alt="" className="aspect-square w-full rounded-md object-cover" /></a> : <Skeleton className="aspect-square w-full" />
}

function ServiceDrawer({ row, onClose }: { row: Row | null; onClose: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [status, setStatus] = useState<Enums<'service_status'>>('open')
  const [assignee, setAssignee] = useState('')
  const [note, setNote] = useState('')
  const [visible, setVisible] = useState(true)
  const [panel, setPanel] = useState<'none' | 'replace' | 'maint'>('none')
  const [spare, setSpare] = useState('')
  const [reason, setReason] = useState('')
  const [maint, setMaint] = useState('')

  useEffect(() => {
    if (!row) return
    setStatus(row.status); setAssignee(row.assigned_to ?? ''); setNote(''); setVisible(true); setPanel('none'); setSpare(''); setReason(''); setMaint('')
  }, [row])

  const detail = useQuery({
    queryKey: ['service-detail', row?.id],
    enabled: !!row,
    queryFn: async () => must(await supabase.from('service_updates').select('id, author_kind, body, status_to, visible_to_customer, created_at, author:profiles(full_name)').eq('request_id', row!.id).order('created_at')),
  })
  const staff = useQuery({
    queryKey: ['staff-list'],
    queryFn: async () => must(await supabase.from('profiles').select('id, full_name').in('role', ['staff', 'manager', 'owner']).eq('is_active', true).order('full_name')),
  })
  const spares = useQuery({
    queryKey: ['scooters-available'],
    enabled: panel === 'replace',
    queryFn: async () => must(await supabase.from('scooters').select('id, code, model').eq('status', 'available').order('code')),
  })

  const refresh = () => { for (const k of ['service-requests', 'service-detail', 'sidebar-badges', 'scooters', 'rental']) qc.invalidateQueries({ queryKey: [k] }) }
  const save = useMutation({
    mutationFn: async () => must(await supabase.rpc('service_update', {
      p_request: row!.id,
      p_status: status !== row!.status ? status : undefined,
      p_assigned_to: assignee && assignee !== row!.assigned_to ? assignee : undefined,
      p_unassign: !assignee && !!row!.assigned_to,
      p_note: note.trim() || undefined,
      p_visible: visible,
    })),
    onSuccess: () => { toast('ok', note.trim() && visible ? 'Saved. The rider has been notified.' : 'Saved'); setNote(''); refresh() },
    onError: (e) => toast('error', (e as Error).message),
  })
  const replace = useMutation({
    mutationFn: async () => must(await supabase.rpc('replace_scooter', { p_rental: row!.rental!.id, p_new_scooter: spare, p_reason: reason, p_service_request: row!.id })),
    onSuccess: () => { toast('ok', 'Replacement given. Old scooter moved to maintenance; rider notified.'); refresh(); onClose() },
    onError: (e) => toast('error', (e as Error).message),
  })
  const addMaint = useMutation({
    mutationFn: async () => must(await supabase.rpc('add_maintenance_note', { p_scooter: row!.scooter_id!, p_note: maint })),
    onSuccess: () => { toast('ok', `Added to ${row?.scooter?.code} maintenance log`); setMaint(''); setPanel('none'); refresh() },
    onError: (e) => toast('error', (e as Error).message),
  })

  const changed = row && (status !== row.status || (assignee || null) !== row.assigned_to || note.trim())
  const swapped = row?.rental?.scooter && row.scooter && row.rental.scooter.id !== row.scooter_id
  const canReplace = row?.rental && ['active', 'overdue', 'pending_handover', 'pending_agreement'].includes(row.rental.status) && !swapped

  return (
    <Drawer open={!!row} onClose={onClose} width={620}
      title={row ? <span className="flex items-center gap-2">{SERVICE_CATEGORY_LABEL[row.category]}{row.scooter ? ` · ${row.scooter.code}` : ''}<Chip meta={SERVICE_STATUS[row.status]} /></span> : ''}
      footer={<><Button onClick={onClose}>Close</Button><Button variant="primary" disabled={!changed} loading={save.isPending} onClick={() => save.mutate()}>Save update</Button></>}>
      {row && (
        <div className="flex flex-col gap-5">
          <DefList items={[
            ['Customer', <Link to={`/customers/${row.customer?.id}`} className="font-medium text-brand-press hover:underline">{row.customer?.full_name}</Link>],
            ['Phone', <a href={`tel:${row.customer?.phone}`} className="num hover:underline">{formatPhone(row.customer?.phone)}</a>],
            ['Scooter', row.scooter ? <span>{row.scooter.code} <span className="text-ink-2">{row.scooter.model}</span>{row.rental && <> · <Link to={`/rentals/${row.rental.id}`} className="text-brand-press hover:underline">rental</Link></>}</span> : 'Not about a scooter'],
            ...(swapped ? [['Replaced with', <span className="font-medium">{row.rental!.scooter!.code}</span>] as [string, React.ReactNode]] : []),
            ['Raised', formatDateTime(row.created_at)],
            ...(row.reopened_count ? [['Reopened', <Chip tone="red">{row.reopened_count}× by rider</Chip>] as [string, React.ReactNode]] : []),
          ]} />
          {row.photo_paths.length > 0 && <div className="grid grid-cols-4 gap-2">{row.photo_paths.map((p) => <Photo key={p} path={p} />)}</div>}

          {row.scooter_id && (
            <div className="flex flex-wrap gap-2">
              {canReplace && <Button size="sm" icon={ArrowRightLeft} onClick={() => setPanel(panel === 'replace' ? 'none' : 'replace')}>Give replacement scooter</Button>}
              <Button size="sm" icon={NotebookPen} onClick={() => setPanel(panel === 'maint' ? 'none' : 'maint')}>Add to maintenance log</Button>
            </div>
          )}
          {panel === 'replace' && (
            <div className="flex flex-col gap-3 rounded-md border border-line bg-canvas p-4">
              <p className="text-sm text-ink-2">{row.scooter?.code} goes to maintenance. The rider keeps the same rental, due dates and payments on the new scooter.</p>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Replacement" htmlFor="spare">
                  <Select id="spare" value={spare} onChange={(e) => setSpare(e.target.value)}>
                    <option value="" disabled>Choose available scooter</option>
                    {spares.data?.map((s) => <option key={s.id} value={s.id}>{s.code} · {s.model}</option>)}
                  </Select>
                </Field>
                <Field label="Reason" htmlFor="rr"><Input id="rr" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Battery cell fault" /></Field>
              </div>
              <div className="flex justify-end"><Button variant="primary" size="sm" disabled={!spare || !reason.trim()} loading={replace.isPending} onClick={() => replace.mutate()}>Confirm replacement</Button></div>
            </div>
          )}
          {panel === 'maint' && (
            <div className="flex flex-col gap-3 rounded-md border border-line bg-canvas p-4">
              <Field label={`Maintenance note for ${row.scooter?.code}`} htmlFor="mn" hint="Saved with today's date in the scooter's service history.">
                <Input id="mn" value={maint} onChange={(e) => setMaint(e.target.value)} placeholder="e.g. Replaced rear brake pads" />
              </Field>
              <div className="flex justify-end"><Button size="sm" variant="primary" disabled={!maint.trim()} loading={addMaint.isPending} onClick={() => addMaint.mutate()}>Add note</Button></div>
            </div>
          )}

          <section aria-label="Timeline">
            <h3 className="mb-2 text-sm font-medium text-ink-2">Timeline</h3>
            {!detail.data ? <Skeleton className="h-24 w-full" /> : (
              <ol className="flex flex-col gap-2">
                {detail.data.map((u) => (
                  <li key={u.id} className={cx('rounded-md border px-3 py-2 text-sm',
                    u.author_kind === 'customer' ? 'border-line bg-tint/40' : u.author_kind === 'system' ? 'border-transparent bg-neutral-bg' : 'border-line bg-surface',
                    !u.visible_to_customer && 'border-dashed border-warn/50 bg-warn-bg/40')}>
                    <div className="mb-0.5 flex items-center gap-2 text-xs text-muted">
                      <span className="font-medium text-ink-2">{u.author_kind === 'customer' ? 'Rider' : u.author_kind === 'system' ? 'Status' : u.author?.full_name ?? 'Staff'}</span>
                      <span className="num">{formatDateTime(u.created_at)}</span>
                      {!u.visible_to_customer && <span className="inline-flex items-center gap-1 text-warn"><Lock size={12} aria-hidden />Internal</span>}
                    </div>
                    <p className="whitespace-pre-wrap text-ink">{u.body}</p>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section aria-label="Update" className="flex flex-col gap-3 rounded-md border border-line p-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Assigned to" htmlFor="as">
                <Select id="as" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
                  <option value="">Unassigned</option>
                  {staff.data?.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
                </Select>
              </Field>
              <Field label="Status" htmlFor="st" hint={status === 'resolved' ? 'Rider is asked to confirm the fix.' : undefined}>
                <Select id="st" value={status} onChange={(e) => setStatus(e.target.value as Enums<'service_status'>)}>
                  {Object.entries(SERVICE_STATUS).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
                </Select>
              </Field>
            </div>
            <Field label="Update" htmlFor="sn">
              <Textarea id="sn" rows={3} value={note} onChange={(e) => setNote(e.target.value)}
                placeholder={visible ? 'Tell the rider what is happening, e.g. Technician will reach you by 3 pm' : 'Internal note for the team'} />
            </Field>
            <Checkbox label="Visible to the rider (sends a notification)" checked={visible} onChange={setVisible} />
          </section>
        </div>
      )}
    </Drawer>
  )
}

export function ServiceRequests() {
  const ts = useTableState({ id: 'created_at', desc: false })
  const status = ts.filter('status') || 'active'
  const category = ts.filter('category')
  const search = ts.filter('q')
  const [openId, setOpenId] = useState<string | null>(null)

  const q = useQuery({
    queryKey: ['service-requests', ts.page, ts.sorting, status, category, search],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      let query = supabase.from('service_requests').select(
        'id, category, description, status, created_at, photo_paths, assigned_to, rental_id, scooter_id, reopened_count, customer:profiles!service_requests_user_id_fkey(id, full_name, phone), assignee:profiles!service_requests_assigned_to_fkey(full_name), scooter:scooters(code, model), rental:rentals(id, status, scooter:scooters(id, code))',
        { count: 'exact' })
      if (status === 'active') query = query.in('status', ['open', 'assigned', 'in_progress', 'resolved'])
      else if (status !== 'all') query = query.eq('status', status as Row['status'])
      if (category) query = query.eq('category', category as Row['category'])
      if (search) query = query.ilike('description', `%${search}%`)
      const sort = ts.sorting[0]
      const { data, count, error } = await query.order(sort.id, { ascending: !sort.desc }).range(...ts.range)
      if (error) throw error
      return { rows: data as unknown as Row[], count: count ?? 0 }
    },
  })
  const open = q.data?.rows.find((r) => r.id === openId) ?? null

  const columns = useMemo(() => [
    col.accessor('created_at', { header: 'Raised', cell: (c) => <span className="num">{formatDateTime(c.getValue())}</span> }),
    col.accessor((r) => r.scooter?.code, { id: 'scooter', header: 'Scooter', enableSorting: false, cell: (c) => {
      const r = c.row.original
      const now = r.rental?.scooter?.code
      return c.getValue() ? <span className="font-medium">{c.getValue()}{now && now !== c.getValue() && <span className="block text-xs font-normal text-muted">now on {now}</span>}</span> : <span className="text-muted">—</span>
    } }),
    col.accessor((r) => r.customer?.full_name, { id: 'customer', header: 'Customer', enableSorting: false }),
    col.accessor('category', { header: 'Category', cell: (c) => c.getValue() === 'complaint' ? <Chip tone="red">Complaint</Chip> : SERVICE_CATEGORY_LABEL[c.getValue()] }),
    col.accessor('description', { header: 'Description', enableSorting: false, cell: (c) => <span className="line-clamp-1 max-w-72 text-ink-2">{c.getValue()}</span> }),
    col.accessor((r) => r.assignee?.full_name, { id: 'assignee', header: 'Assigned', enableSorting: false, cell: (c) => c.getValue() ?? <span className="text-warn">Unassigned</span> }),
    col.accessor('status', { header: 'Status', cell: (c) => (
      <span className="flex items-center gap-1.5"><Chip meta={SERVICE_STATUS[c.getValue()]} />{c.row.original.reopened_count > 0 && <Chip tone="red">Reopened</Chip>}</span>
    ) }),
  ], [])

  return (
    <>
      <PageHeader title="Service requests" description="Every problem is tied to the scooter it happened on. Assign, update the rider, swap scooters, and close once the rider confirms." />
      <DataTable columns={columns} data={q.data?.rows} total={q.data?.count} loading={q.isPending} error={q.error} onRetry={() => q.refetch()}
        state={ts} onRowClick={(r) => setOpenId(r.id)}
        empty={{ title: status === 'active' ? 'No open requests' : 'No requests', body: status === 'active' ? 'Problems reported by riders appear here instantly.' : undefined }}
        toolbar={<>
          <select aria-label="Status" value={status} onChange={(e) => ts.setFilter('status', e.target.value === 'active' ? null : e.target.value)}
            className="h-8 rounded-md border border-line-strong bg-surface px-2 text-sm focus:border-brand focus:outline-none">
            <option value="active">Open, in progress, awaiting rider</option>
            {Object.entries(SERVICE_STATUS).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
            <option value="all">All</option>
          </select>
          <FilterSelect label="Category" value={category} onChange={(v) => ts.setFilter('category', v)} options={Object.entries(SERVICE_CATEGORY_LABEL)} />
          <SearchBox value={search} onChange={(v) => ts.setFilter('q', v)} placeholder="Search description" />
        </>} />
      <ServiceDrawer row={open} onClose={() => setOpenId(null)} />
    </>
  )
}
