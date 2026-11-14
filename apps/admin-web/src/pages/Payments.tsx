import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query'
import { createColumnHelper } from '@tanstack/react-table'
import { FileDown, RefreshCw } from 'lucide-react'
import { formatDateTime, formatINR, PAYMENT_METHOD_LABEL, PAYMENT_STATUS, PAYMENT_TYPE_LABEL } from '@snireva/shared'
import { invoke, signedUrl, supabase, type Enums } from '@/lib/supabase'
import { DataTable, FilterSelect, SearchBox, useTableState } from '@/components/DataTable'
import { Chip, IconButton, Input, PageHeader, useToast } from '@/components/ui'

interface Row {
  id: string; amount: number; late_fee_amount: number; type: Enums<'payment_type'>; method: Enums<'payment_method'>
  status: Enums<'payment_status'>; paid_at: string | null; created_at: string; receipt_no: string | null; receipt_path: string | null
  failure_reason: string | null; rental_id: string | null; razorpay_payment_id: string | null
  customer: { full_name: string | null; phone: string | null } | null
  by: { full_name: string | null } | null
}
const col = createColumnHelper<Row>()

function ReceiptActions({ row }: { row: Row }) {
  const toast = useToast()
  const regen = useMutation({
    mutationFn: () => invoke<{ path: string }>('generate-pdf', { kind: 'receipt', id: row.id }),
    onSuccess: async (r) => { const url = await signedUrl('receipts', r.path); if (url) window.open(url, '_blank'); toast('ok', 'Receipt regenerated') },
    onError: (e) => toast('error', (e as Error).message),
  })
  if (row.status !== 'paid') return null
  return (
    <span className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
      {row.receipt_path && <IconButton icon={FileDown} label="Download receipt" onClick={async () => { const u = await signedUrl('receipts', row.receipt_path); if (u) window.open(u, '_blank') }} />}
      <IconButton icon={RefreshCw} label={row.receipt_path ? 'Regenerate receipt' : 'Generate receipt'} onClick={() => regen.mutate()} className={regen.isPending ? 'animate-spin' : ''} />
    </span>
  )
}

export function Payments() {
  const ts = useTableState({ id: 'created_at', desc: true })
  const status = ts.filter('status'), method = ts.filter('method'), type = ts.filter('type')
  const from = ts.filter('from'), to = ts.filter('to'), search = ts.filter('q')

  const q = useQuery({
    queryKey: ['payments', ts.page, ts.sorting, status, method, type, from, to, search],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      let query = supabase.from('payments').select(
        'id, amount, late_fee_amount, type, method, status, paid_at, created_at, receipt_no, receipt_path, failure_reason, rental_id, razorpay_payment_id, customer:profiles!payments_user_id_fkey!inner(full_name, phone), by:profiles!payments_recorded_by_fkey(full_name)',
        { count: 'exact' })
      query = status ? query.eq('status', status as Row['status']) : query.neq('status', 'created')
      if (method) query = query.eq('method', method as Row['method'])
      if (type) query = query.eq('type', type as Row['type'])
      if (from) query = query.gte('created_at', `${from}T00:00:00+05:30`)
      if (to) query = query.lte('created_at', `${to}T23:59:59+05:30`)
      if (search) query = query.or(`full_name.ilike.%${search}%,phone.ilike.%${search}%`, { referencedTable: 'customer' })
      const sort = ts.sorting[0]
      const { data, count, error } = await query.order(sort.id, { ascending: !sort.desc }).range(...ts.range)
      if (error) throw error
      return { rows: data as unknown as Row[], count: count ?? 0 }
    },
  })

  const columns = useMemo(() => [
    col.accessor('created_at', { header: 'Date', cell: (c) => <span className="num">{formatDateTime(c.row.original.paid_at ?? c.getValue())}</span> }),
    col.accessor((r) => r.customer?.full_name, { id: 'customer', header: 'Customer', enableSorting: false, cell: (c) => (
      c.row.original.rental_id ? <Link to={`/rentals/${c.row.original.rental_id}`} onClick={(e) => e.stopPropagation()} className="font-medium hover:underline">{c.getValue()}</Link> : c.getValue()
    ) }),
    col.accessor('type', { header: 'Type', cell: (c) => PAYMENT_TYPE_LABEL[c.getValue()] }),
    col.accessor('method', { header: 'Method', cell: (c) => <span>{PAYMENT_METHOD_LABEL[c.getValue()]}{c.row.original.by?.full_name && <span className="block text-xs text-muted">by {c.row.original.by.full_name}</span>}</span> }),
    col.accessor('amount', { header: 'Amount', meta: { align: 'right' }, cell: (c) => formatINR(c.getValue()) }),
    col.accessor('status', { header: 'Status', cell: (c) => (
      <span title={c.row.original.failure_reason ?? undefined}><Chip meta={PAYMENT_STATUS[c.getValue()]} /></span>
    ) }),
    col.accessor('receipt_no', { header: 'Receipt', cell: (c) => <span className="num text-ink-2">{c.getValue() ?? '—'}</span> }),
    col.display({ id: 'actions', header: '', cell: (c) => <ReceiptActions row={c.row.original} /> }),
  ], [])

  return (
    <>
      <PageHeader title="Payments" description="Online payments are confirmed by the Razorpay webhook. Offline payments are recorded from a rental." />
      <DataTable columns={columns} data={q.data?.rows} total={q.data?.count} loading={q.isPending} error={q.error} onRetry={() => q.refetch()} state={ts}
        empty={{ title: 'No payments match', body: 'Try a different date range or clear the filters.' }}
        toolbar={<>
          <SearchBox value={search} onChange={(v) => ts.setFilter('q', v)} placeholder="Search customer" />
          <FilterSelect label="Status" value={status} onChange={(v) => ts.setFilter('status', v)} options={(['paid', 'failed', 'created', 'refunded'] as const).map((s) => [s, PAYMENT_STATUS[s].label])} />
          <FilterSelect label="Method" value={method} onChange={(v) => ts.setFilter('method', v)} options={Object.entries(PAYMENT_METHOD_LABEL)} />
          <FilterSelect label="Type" value={type} onChange={(v) => ts.setFilter('type', v)} options={Object.entries(PAYMENT_TYPE_LABEL)} />
          <label className="flex items-center gap-1.5 text-sm text-ink-2">From <Input type="date" value={from} onChange={(e) => ts.setFilter('from', e.target.value)} className="h-8 w-36! text-sm" /></label>
          <label className="flex items-center gap-1.5 text-sm text-ink-2">To <Input type="date" value={to} onChange={(e) => ts.setFilter('to', e.target.value)} className="h-8 w-36! text-sm" /></label>
          <Link to="/rentals?view=overdue" className="ml-auto text-sm font-medium text-brand-press hover:underline">Overdue rentals →</Link>
        </>} />
    </>
  )
}
