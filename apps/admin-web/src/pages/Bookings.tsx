import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createColumnHelper } from '@tanstack/react-table'
import { BOOKING_STATUS, formatDateTime, formatINR, formatPhone } from '@snireva/shared'
import { must, supabase } from '@/lib/supabase'
import { useSettings } from '@/lib/queries'
import { DataTable, useTableState } from '@/components/DataTable'
import { Button, Chip, DefList, Drawer, Field, PageHeader, Select, Textarea, useToast } from '@/components/ui'

interface Row {
  id: string
  status: keyof typeof BOOKING_STATUS
  created_at: string
  admin_note: string | null
  preferred_scooter_id: string | null
  customer: { id: string; full_name: string | null; phone: string | null } | null
  pickup: { name: string } | null
  scooter: { code: string } | null
}
const col = createColumnHelper<Row>()

function AllocateDrawer({ booking, onClose }: { booking: Row | null; onClose: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [scooter, setScooter] = useState('')
  const [note, setNote] = useState('')
  const [mode, setMode] = useState<'allocate' | 'reject'>('allocate')

  const available = useQuery({
    queryKey: ['scooters', 'available'],
    enabled: !!booking,
    queryFn: async () => must(await supabase.from('scooters').select('id, code, model, battery_details, weekly_rent').eq('status', 'available').order('code')),
  })
  const settings = useSettings()

  const run = useMutation({
    mutationFn: async () => {
      if (!booking) return
      if (mode === 'allocate') return must(await supabase.rpc('allocate_scooter', { p_booking: booking.id, p_scooter: scooter, p_note: note || undefined }))
      return must(await supabase.rpc('reject_booking', { p_booking: booking.id, p_note: note }))
    },
    onSuccess: () => {
      toast('ok', mode === 'allocate' ? 'Scooter allocated. Customer has been notified to sign the agreement.' : 'Request declined. Customer has been notified.')
      qc.invalidateQueries({ queryKey: ['bookings'] })
      qc.invalidateQueries({ queryKey: ['scooters'] })
      qc.invalidateQueries({ queryKey: ['sidebar-badges'] })
      close()
    },
    onError: (e) => toast('error', (e as Error).message),
  })

  function close() { setScooter(''); setNote(''); setMode('allocate'); onClose() }
  const preferred = available.data?.find((s) => s.id === booking?.preferred_scooter_id)
  const chosen = available.data?.find((s) => s.id === (scooter || preferred?.id))

  return (
    <Drawer open={!!booking} onClose={close} title="Booking request"
      footer={mode === 'allocate' ? <>
        <Button onClick={() => setMode('reject')}>Decline</Button>
        <Button variant="primary" disabled={!(scooter || preferred)} loading={run.isPending}
          onClick={() => { if (!scooter && preferred) setScooter(preferred.id); run.mutate() }}>Allocate scooter</Button>
      </> : <>
        <Button onClick={() => setMode('allocate')}>Back</Button>
        <Button variant="danger" disabled={!note.trim()} loading={run.isPending} onClick={() => run.mutate()}>Decline request</Button>
      </>}>
      {booking && (
        <div className="flex flex-col gap-5">
          <DefList items={[
            ['Customer', <Link className="font-medium text-brand-press hover:underline" to={`/customers/${booking.customer?.id}`}>{booking.customer?.full_name}</Link>],
            ['Phone', <span className="num">{formatPhone(booking.customer?.phone)}</span>],
            ['Pickup', booking.pickup?.name],
            ['Requested', formatDateTime(booking.created_at)],
            ['Preferred', preferred ? `${preferred.code} · ${preferred.model}` : 'Any'],
          ]} />
          {mode === 'allocate' ? (
            <>
              <Field label="Scooter" htmlFor="scooter" hint={available.data?.length === 0 ? 'No scooters are available right now.' : 'Only available scooters are listed.'}>
                <Select id="scooter" value={scooter || preferred?.id || ''} onChange={(e) => setScooter(e.target.value)}>
                  <option value="" disabled>Choose a scooter</option>
                  {available.data?.map((s) => <option key={s.id} value={s.id}>{s.code} · {s.model}</option>)}
                </Select>
              </Field>
              {chosen && (
                <div className="rounded-md border border-line bg-canvas px-4 py-3 text-sm">
                  <p className="text-ink-2">{chosen.battery_details ?? 'No battery details'}</p>
                  <p className="num mt-1">Weekly rent {formatINR(chosen.weekly_rent ?? settings.data?.weekly_rent)} · Deposit {formatINR(settings.data?.deposit_amount)}</p>
                </div>
              )}
              <Field label="Note for customer (optional)" htmlFor="note">
                <Textarea id="note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Collect after 10 am" />
              </Field>
            </>
          ) : (
            <Field label="Reason (shown to the customer)" htmlFor="reject">
              <Textarea id="reject" autoFocus rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. No scooters at this hub this week" />
            </Field>
          )}
        </div>
      )}
    </Drawer>
  )
}

export function Bookings() {
  const ts = useTableState({ id: 'created_at', desc: false })
  const status = ts.filter('status') || 'pending'
  const [open, setOpen] = useState<Row | null>(null)

  const q = useQuery({
    queryKey: ['bookings', ts.page, ts.sorting, status],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      let query = supabase.from('booking_requests')
        .select('id, status, created_at, admin_note, preferred_scooter_id, customer:profiles!booking_requests_user_id_fkey(id, full_name, phone), pickup:pickup_locations(name), scooter:scooters!booking_requests_scooter_id_fkey(code)', { count: 'exact' })
      if (status !== 'all') query = query.eq('status', status as Row['status'])
      const sort = ts.sorting[0]
      const { data, count, error } = await query.order(sort.id, { ascending: !sort.desc }).range(...ts.range)
      if (error) throw error
      return { rows: data as unknown as Row[], count: count ?? 0 }
    },
  })

  const columns = useMemo(() => [
    col.accessor((r) => r.customer?.full_name, { id: 'customer', header: 'Customer', enableSorting: false, cell: (c) => <span className="font-medium">{c.getValue()}</span> }),
    col.accessor((r) => r.customer?.phone, { id: 'phone', header: 'Phone', enableSorting: false, cell: (c) => <span className="num">{formatPhone(c.getValue())}</span> }),
    col.accessor((r) => r.pickup?.name, { id: 'pickup', header: 'Pickup', enableSorting: false }),
    col.accessor('created_at', { header: 'Requested', cell: (c) => <span className="num">{formatDateTime(c.getValue())}</span> }),
    col.accessor('status', { header: 'Status', cell: (c) => <Chip meta={BOOKING_STATUS[c.getValue()]} /> }),
    col.accessor((r) => r.scooter?.code ?? r.admin_note, { id: 'outcome', header: 'Scooter / note', enableSorting: false, cell: (c) => <span className="text-ink-2">{c.getValue() ?? '—'}</span> }),
    col.display({ id: 'act', header: '', cell: (c) => c.row.original.status === 'pending' ? <Button size="sm" variant="primary" onClick={(e) => { e.stopPropagation(); setOpen(c.row.original) }}>Allocate</Button> : null }),
  ], [])

  return (
    <>
      <PageHeader title="Booking requests" description="Oldest first. Allocate an available scooter or decline with a reason." />
      <DataTable columns={columns} data={q.data?.rows} total={q.data?.count} loading={q.isPending} error={q.error} onRetry={() => q.refetch()}
        state={ts} onRowClick={(r) => r.status === 'pending' && setOpen(r)}
        empty={{ title: status === 'pending' ? 'No pending requests' : 'No requests', body: status === 'pending' ? 'New scooter requests from approved customers will appear here.' : undefined }}
        toolbar={
          <select aria-label="Status" value={status} onChange={(e) => ts.setFilter('status', e.target.value === 'pending' ? null : e.target.value)}
            className="h-8 rounded-md border border-line-strong bg-surface px-2 text-sm focus:border-brand focus:outline-none">
            {Object.entries(BOOKING_STATUS).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
            <option value="all">All requests</option>
          </select>}
      />
      <AllocateDrawer booking={open} onClose={() => setOpen(null)} />
    </>
  )
}
