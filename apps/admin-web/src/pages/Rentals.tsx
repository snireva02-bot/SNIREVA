import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { createColumnHelper } from '@tanstack/react-table'
import { daysUntil, formatDate, formatINR, formatPhone, RENTAL_STATUS, toISODate } from '@snireva/shared'
import { supabase, type Enums } from '@/lib/supabase'
import { DataTable, SearchBox, useTableState } from '@/components/DataTable'
import { Chip, PageHeader } from '@/components/ui'

interface Row {
  id: string
  status: Enums<'rental_status'>
  start_date: string | null
  next_due_date: string | null
  weekly_rent: number
  renewal_blocked: boolean
  created_at: string
  customer: { full_name: string | null; phone: string | null } | null
  scooter: { code: string; model: string } | null
}
const col = createColumnHelper<Row>()

const VIEWS: [string, string][] = [
  ['open', 'Open rentals'], ['due', 'Due in 3 days'], ['overdue', 'Overdue'],
  ['setup', 'Awaiting agreement / handover'], ['closed', 'Returned / terminated'], ['all', 'All'],
]

export function Rentals() {
  const navigate = useNavigate()
  const ts = useTableState({ id: 'next_due_date', desc: false })
  const view = ts.filter('view') || 'open'
  const search = ts.filter('q')

  const q = useQuery({
    queryKey: ['rentals', ts.page, ts.sorting, view, search],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      let query = supabase.from('rentals').select(
        'id, status, start_date, next_due_date, weekly_rent, renewal_blocked, created_at, customer:profiles!rentals_user_id_fkey!inner(full_name, phone), scooter:scooters!inner(code, model)',
        { count: 'exact' })
      if (view === 'open') query = query.not('status', 'in', '(returned,terminated)')
      if (view === 'overdue') query = query.eq('status', 'overdue')
      if (view === 'setup') query = query.in('status', ['pending_agreement', 'pending_handover'])
      if (view === 'closed') query = query.in('status', ['returned', 'terminated'])
      if (view === 'due') {
        const in3 = new Date(); in3.setDate(in3.getDate() + 3)
        query = query.in('status', ['active', 'overdue']).lte('next_due_date', toISODate(in3))
      }
      if (search) query = query.or(`full_name.ilike.%${search}%,phone.ilike.%${search}%`, { referencedTable: 'customer' })
      const sort = ts.sorting[0]
      const { data, count, error } = await query.order(sort.id, { ascending: !sort.desc, nullsFirst: false }).range(...ts.range)
      if (error) throw error
      return { rows: data as unknown as Row[], count: count ?? 0 }
    },
  })

  const columns = useMemo(() => [
    col.accessor((r) => r.customer?.full_name, { id: 'customer', header: 'Customer', enableSorting: false, cell: (c) => (
      <div><p className="font-medium">{c.getValue()}</p><p className="num text-xs text-muted">{formatPhone(c.row.original.customer?.phone)}</p></div>
    ) }),
    col.accessor((r) => r.scooter?.code, { id: 'scooter', header: 'Scooter', enableSorting: false, cell: (c) => <span>{c.getValue()} <span className="text-ink-2">{c.row.original.scooter?.model}</span></span> }),
    col.accessor('start_date', { header: 'Started', cell: (c) => <span className="num">{formatDate(c.getValue())}</span> }),
    col.accessor('next_due_date', { header: 'Next due', cell: (c) => {
      const v = c.getValue(); const s = c.row.original.status
      if (!v || !['active', 'overdue'].includes(s)) return <span className="text-muted">—</span>
      const d = daysUntil(v)
      return <span className={`num ${d < 0 ? 'font-medium text-bad' : d <= 2 ? 'font-medium text-warn' : ''}`}>{formatDate(v)} <span className="text-xs font-normal text-muted">{d < 0 ? `${-d}d late` : d === 0 ? 'today' : `in ${d}d`}</span></span>
    } }),
    col.accessor('weekly_rent', { header: 'Weekly rent', meta: { align: 'right' }, cell: (c) => formatINR(c.getValue()) }),
    col.accessor('status', { header: 'Status', cell: (c) => (
      <span className="flex items-center gap-1.5"><Chip meta={RENTAL_STATUS[c.getValue()]} />{c.row.original.renewal_blocked && <Chip tone="red">Renewal on hold</Chip>}</span>
    ) }),
  ], [])

  return (
    <>
      <PageHeader title="Rentals" description="Overdue rows are highlighted. Open a rental to hand over, take payment, or record a return." />
      <DataTable columns={columns} data={q.data?.rows} total={q.data?.count} loading={q.isPending} error={q.error} onRetry={() => q.refetch()}
        state={ts} onRowClick={(r) => navigate(`/rentals/${r.id}`)}
        rowClassName={(r) => (r.status === 'overdue' ? 'bg-bad-bg/40' : undefined)}
        empty={{ title: 'No rentals here', body: view === 'overdue' ? 'Nobody is overdue right now.' : undefined }}
        toolbar={<>
          <div role="tablist" aria-label="Rental views" className="flex flex-wrap gap-1">
            {VIEWS.map(([k, label]) => (
              <button key={k} role="tab" aria-selected={view === k} type="button" onClick={() => ts.setFilter('view', k === 'open' ? null : k)}
                className={`h-8 rounded-md px-3 text-sm ${view === k ? 'bg-tint font-medium text-brand-press' : 'text-ink-2 hover:bg-canvas'}`}>{label}</button>
            ))}
          </div>
          <div className="ml-auto"><SearchBox value={search} onChange={(v) => ts.setFilter('q', v)} placeholder="Search customer" /></div>
        </>} />
    </>
  )
}
