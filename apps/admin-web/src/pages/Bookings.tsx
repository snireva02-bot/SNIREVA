import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createColumnHelper } from '@tanstack/react-table'
import { BOOKING_STATUS, formatDateTime, formatINR, formatPhone } from '@snireva/shared'
import { must, supabase } from '@/lib/supabase'
import { useSettings } from '@/lib/queries'
import { DataTable, useTableState } from '@/components/DataTable'
import { Button, Chip, cx, DefList, Drawer, Field, PageHeader, Textarea, useToast } from '@/components/ui'

interface Row {
  id: string
  status: keyof typeof BOOKING_STATUS
  created_at: string
  admin_note: string | null
  quantity: number
  preferred_scooter_ids: string[]
  customer: { id: string; full_name: string | null; phone: string | null } | null
  pickup: { name: string } | null
  rentals: { id: string; scooter: { code: string } | null }[]
}
const col = createColumnHelper<Row>()

function AllocateDrawer({ booking, onClose }: { booking: Row | null; onClose: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const settings = useSettings()
  const [picked, setPicked] = useState<string[]>([])
  const [note, setNote] = useState('')
  const [mode, setMode] = useState<'allocate' | 'reject'>('allocate')

  const available = useQuery({
    queryKey: ['scooters-available'],
    enabled: !!booking,
    queryFn: async () => must(await supabase.from('scooters').select('id, code, model, battery_details, weekly_rent').eq('status', 'available').order('code')),
  })

  // Pre-tick the rider's preferred scooters that are still available.
  useEffect(() => {
    if (!booking || !available.data) return
    setPicked(booking.preferred_scooter_ids.filter((id) => available.data.some((s) => s.id === id)).slice(0, booking.quantity))
  }, [booking, available.data])

  const run = useMutation({
    mutationFn: async () => {
      if (!booking) return
      if (mode === 'allocate') return must(await supabase.rpc('allocate_scooters', { p_booking: booking.id, p_scooters: picked, p_note: note || undefined }))
      return must(await supabase.rpc('reject_booking', { p_booking: booking.id, p_note: note }))
    },
    onSuccess: () => {
      toast('ok', mode === 'allocate' ? `${picked.length} scooter${picked.length === 1 ? '' : 's'} allocated. Customer has been notified to sign.` : 'Request declined. Customer has been notified.')
      for (const k of ['bookings', 'scooters', 'scooters-available', 'sidebar-badges', 'rentals']) qc.invalidateQueries({ queryKey: [k] })
      close()
    },
    onError: (e) => toast('error', (e as Error).message),
  })

  function close() { setPicked([]); setNote(''); setMode('allocate'); onClose() }
  function toggle(id: string) {
    if (!booking) return
    setPicked((p) => p.includes(id) ? p.filter((x) => x !== id) : p.length >= booking.quantity ? p : [...p, id])
  }
  const weekly = (available.data ?? []).filter((s) => picked.includes(s.id)).reduce((a, s) => a + Number(s.weekly_rent ?? settings.data?.weekly_rent ?? 0), 0)
  const partial = booking && picked.length > 0 && picked.length < booking.quantity

  return (
    <Drawer open={!!booking} onClose={close} title="Booking request" width={560}
      footer={mode === 'allocate' ? <>
        <Button onClick={() => setMode('reject')}>Decline</Button>
        <Button variant="primary" disabled={!picked.length} loading={run.isPending} onClick={() => run.mutate()}>
          Allocate {picked.length || ''} scooter{picked.length === 1 ? '' : 's'}
        </Button>
      </> : <>
        <Button onClick={() => setMode('allocate')}>Back</Button>
        <Button variant="danger" disabled={!note.trim()} loading={run.isPending} onClick={() => run.mutate()}>Decline request</Button>
      </>}>
      {booking && (
        <div className="flex flex-col gap-5">
          <DefList items={[
            ['Customer', <Link className="font-medium text-brand-press hover:underline" to={`/customers/${booking.customer?.id}`}>{booking.customer?.full_name}</Link>],
            ['Phone', <span className="num">{formatPhone(booking.customer?.phone)}</span>],
            ['Scooters asked', <span className="num font-medium">{booking.quantity}</span>],
            ['Pickup', booking.pickup?.name],
            ['Requested', formatDateTime(booking.created_at)],
          ]} />
          {mode === 'allocate' ? (
            <>
              <div className="flex flex-col gap-2">
                <div className="flex items-baseline justify-between">
                  <span className="text-sm font-medium">Choose scooters <span className="num text-ink-2">({picked.length} of {booking.quantity})</span></span>
                  {booking.preferred_scooter_ids.length > 0 && <span className="text-xs text-muted">Rider's picks are marked</span>}
                </div>
                {available.data?.length === 0 && <p className="text-base text-ink-2">No scooters are available right now.</p>}
                <ul className="max-h-80 divide-y divide-line overflow-y-auto rounded-md border border-line">
                  {available.data?.map((s) => {
                    const on = picked.includes(s.id)
                    const full = !on && picked.length >= booking.quantity
                    return (
                      <li key={s.id}>
                        <label className={cx('flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-canvas', full && 'cursor-not-allowed opacity-50', on && 'bg-tint/50')}>
                          <input type="checkbox" checked={on} disabled={full} onChange={() => toggle(s.id)} className="size-4 accent-brand" />
                          <span className="flex-1">
                            <span className="font-medium">{s.code}</span> <span className="text-ink-2">{s.model}</span>
                            <span className="block text-xs text-muted">{s.battery_details}</span>
                          </span>
                          {booking.preferred_scooter_ids.includes(s.id) && <Chip tone="green">Rider's pick</Chip>}
                          <span className="num text-sm text-ink-2">{formatINR(s.weekly_rent ?? settings.data?.weekly_rent)}/wk</span>
                        </label>
                      </li>
                    )
                  })}
                </ul>
              </div>
              {picked.length > 0 && (
                <div className="rounded-md border border-line bg-canvas px-4 py-3 text-sm">
                  <p className="num">Weekly rent {formatINR(weekly)} · Deposit {formatINR(Number(settings.data?.deposit_amount ?? 0) * picked.length)}</p>
                  {partial && <p className="mt-1 text-warn">Allocating fewer than asked. The customer will see "{picked.length} of {booking.quantity}".</p>}
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
        .select('id, status, created_at, admin_note, quantity, preferred_scooter_ids, customer:profiles!booking_requests_user_id_fkey(id, full_name, phone), pickup:pickup_locations(name), rentals(id, scooter:scooters(code))', { count: 'exact' })
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
    col.accessor('quantity', { header: 'Scooters', meta: { align: 'right' }, cell: (c) => <span className="font-medium">{c.getValue()}</span> }),
    col.accessor((r) => r.pickup?.name, { id: 'pickup', header: 'Pickup', enableSorting: false }),
    col.accessor('created_at', { header: 'Requested', cell: (c) => <span className="num">{formatDateTime(c.getValue())}</span> }),
    col.accessor('status', { header: 'Status', cell: (c) => <Chip meta={BOOKING_STATUS[c.getValue()]} /> }),
    col.display({ id: 'outcome', header: 'Allocated / note', cell: (c) => {
      const r = c.row.original
      const codes = r.rentals.map((x) => x.scooter?.code).filter(Boolean)
      return <span className="text-ink-2">{codes.length ? codes.join(', ') : r.admin_note ?? '—'}</span>
    } }),
    col.display({ id: 'act', header: '', cell: (c) => c.row.original.status === 'pending' ? <Button size="sm" variant="primary" onClick={(e) => { e.stopPropagation(); setOpen(c.row.original) }}>Allocate</Button> : null }),
  ], [])

  return (
    <>
      <PageHeader title="Booking requests" description="Oldest first. A rider can ask for several scooters; allocate them in one go or decline with a reason." />
      <DataTable columns={columns} data={q.data?.rows} total={q.data?.count} loading={q.isPending} error={q.error} onRetry={() => q.refetch()}
        state={ts} onRowClick={(r) => r.status === 'pending' && setOpen(r)}
        empty={{ title: status === 'pending' ? 'No pending requests' : 'No requests', body: status === 'pending' ? 'New scooter requests from approved customers appear here instantly.' : undefined }}
        toolbar={
          <select aria-label="Status" value={status} onChange={(e) => ts.setFilter('status', e.target.value === 'pending' ? null : e.target.value)}
            className="h-8 rounded-md border border-line-strong bg-surface px-2 text-sm focus:border-brand focus:outline-none">
            {Object.entries(BOOKING_STATUS).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
            <option value="all">All requests</option>
          </select>} />
      <AllocateDrawer booking={open} onClose={() => setOpen(null)} />
    </>
  )
}
