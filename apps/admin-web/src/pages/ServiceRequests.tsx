import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createColumnHelper } from '@tanstack/react-table'
import { formatDateTime, formatPhone, SERVICE_CATEGORY_LABEL, SERVICE_STATUS } from '@snireva/shared'
import { signedUrl, supabase, type Enums } from '@/lib/supabase'
import { DataTable, FilterSelect, useTableState } from '@/components/DataTable'
import { Button, Chip, DefList, Drawer, Field, PageHeader, Select, Skeleton, Textarea, useToast } from '@/components/ui'

interface Row {
  id: string; category: Enums<'service_category'>; description: string; status: Enums<'service_status'>; created_at: string
  photo_paths: string[]; admin_notes: string | null; assigned_to: string | null; rental_id: string | null
  customer: { id: string; full_name: string | null; phone: string | null } | null
  assignee: { full_name: string | null } | null
  rental: { scooter: { code: string } | null } | null
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
  const [notes, setNotes] = useState('')
  useEffect(() => { if (row) { setStatus(row.status); setAssignee(row.assigned_to ?? ''); setNotes(row.admin_notes ?? '') } }, [row])

  const staff = useQuery({
    queryKey: ['staff-list'],
    queryFn: async () => (await supabase.from('profiles').select('id, full_name, role').in('role', ['staff', 'manager', 'owner']).eq('is_active', true).order('full_name')).data ?? [],
  })
  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('service_requests').update({
        assigned_to: assignee || null, admin_notes: notes.trim() || null,
        status: assignee && status === 'open' ? 'assigned' : status,
      }).eq('id', row!.id)
      if (error) throw error
    },
    onSuccess: () => { toast('ok', 'Request updated. Customer has been notified of status changes.'); qc.invalidateQueries({ queryKey: ['service-requests'] }); qc.invalidateQueries({ queryKey: ['sidebar-badges'] }); onClose() },
    onError: (e) => toast('error', (e as Error).message),
  })

  return (
    <Drawer open={!!row} onClose={onClose} title={row ? SERVICE_CATEGORY_LABEL[row.category] : ''}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={save.isPending} onClick={() => save.mutate()}>Save</Button></>}>
      {row && (
        <div className="flex flex-col gap-5">
          <DefList items={[
            ['Customer', <Link to={`/customers/${row.customer?.id}`} className="font-medium text-brand-press hover:underline">{row.customer?.full_name}</Link>],
            ['Phone', <a href={`tel:${row.customer?.phone}`} className="num hover:underline">{formatPhone(row.customer?.phone)}</a>],
            ['Scooter', row.rental?.scooter?.code ? <Link to={`/rentals/${row.rental_id}`} className="hover:underline">{row.rental.scooter.code}</Link> : '—'],
            ['Raised', formatDateTime(row.created_at)],
          ]} />
          <div className="rounded-md bg-canvas p-3 text-base">{row.description}</div>
          {row.photo_paths.length > 0 && <div className="grid grid-cols-4 gap-2">{row.photo_paths.map((p) => <Photo key={p} path={p} />)}</div>}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Assigned to" htmlFor="as">
              <Select id="as" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
                <option value="">Unassigned</option>
                {staff.data?.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
              </Select>
            </Field>
            <Field label="Status" htmlFor="st">
              <Select id="st" value={status} onChange={(e) => setStatus(e.target.value as Enums<'service_status'>)}>
                {Object.entries(SERVICE_STATUS).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
              </Select>
            </Field>
          </div>
          <Field label="Notes" htmlFor="sn" hint="Shown to the customer once resolved or closed.">
            <Textarea id="sn" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Brake pads replaced at Madhapur hub" />
          </Field>
        </div>
      )}
    </Drawer>
  )
}

export function ServiceRequests() {
  const ts = useTableState({ id: 'created_at', desc: false })
  const status = ts.filter('status') || 'active'
  const category = ts.filter('category')
  const [open, setOpen] = useState<Row | null>(null)

  const q = useQuery({
    queryKey: ['service-requests', ts.page, ts.sorting, status, category],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      let query = supabase.from('service_requests').select(
        'id, category, description, status, created_at, photo_paths, admin_notes, assigned_to, rental_id, customer:profiles!service_requests_user_id_fkey(id, full_name, phone), assignee:profiles!service_requests_assigned_to_fkey(full_name), rental:rentals(scooter:scooters(code))',
        { count: 'exact' })
      if (status === 'active') query = query.in('status', ['open', 'assigned', 'in_progress'])
      else if (status !== 'all') query = query.eq('status', status as Row['status'])
      if (category) query = query.eq('category', category as Row['category'])
      const sort = ts.sorting[0]
      const { data, count, error } = await query.order(sort.id, { ascending: !sort.desc }).range(...ts.range)
      if (error) throw error
      return { rows: data as unknown as Row[], count: count ?? 0 }
    },
  })

  const columns = useMemo(() => [
    col.accessor('created_at', { header: 'Raised', cell: (c) => <span className="num">{formatDateTime(c.getValue())}</span> }),
    col.accessor((r) => r.customer?.full_name, { id: 'customer', header: 'Customer', enableSorting: false, cell: (c) => <span className="font-medium">{c.getValue()}</span> }),
    col.accessor((r) => r.rental?.scooter?.code, { id: 'scooter', header: 'Scooter', enableSorting: false, cell: (c) => c.getValue() ?? '—' }),
    col.accessor('category', { header: 'Category', cell: (c) => c.getValue() === 'complaint' ? <Chip tone="red">Complaint</Chip> : SERVICE_CATEGORY_LABEL[c.getValue()] }),
    col.accessor('description', { header: 'Description', enableSorting: false, cell: (c) => <span className="line-clamp-1 max-w-80 text-ink-2">{c.getValue()}</span> }),
    col.accessor((r) => r.assignee?.full_name, { id: 'assignee', header: 'Assigned', enableSorting: false, cell: (c) => c.getValue() ?? <span className="text-muted">—</span> }),
    col.accessor('status', { header: 'Status', cell: (c) => <Chip meta={SERVICE_STATUS[c.getValue()]} /> }),
  ], [])

  return (
    <>
      <PageHeader title="Service requests" description="Oldest first. Assign a staff member and keep the customer updated." />
      <DataTable columns={columns} data={q.data?.rows} total={q.data?.count} loading={q.isPending} error={q.error} onRetry={() => q.refetch()}
        state={ts} onRowClick={setOpen} empty={{ title: status === 'active' ? 'No open requests' : 'No requests', body: status === 'active' ? 'Problems reported by riders will show here.' : undefined }}
        toolbar={<>
          <select aria-label="Status" value={status} onChange={(e) => ts.setFilter('status', e.target.value === 'active' ? null : e.target.value)}
            className="h-8 rounded-md border border-line-strong bg-surface px-2 text-sm focus:border-brand focus:outline-none">
            <option value="active">Open and in progress</option>
            {Object.entries(SERVICE_STATUS).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
            <option value="all">All</option>
          </select>
          <FilterSelect label="Category" value={category} onChange={(v) => ts.setFilter('category', v)} options={Object.entries(SERVICE_CATEGORY_LABEL)} />
        </>} />
      <ServiceDrawer row={open} onClose={() => setOpen(null)} />
    </>
  )
}
