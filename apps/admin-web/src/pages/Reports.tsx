import { useMemo, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { FileSpreadsheet, FileText } from 'lucide-react'
import { formatDate, formatINR, formatPhone, RENTAL_STATUS, SCOOTER_STATUS, toISODate } from '@snireva/shared'
import { must, supabase, type Enums } from '@/lib/supabase'
import { exportExcel, exportPdf, type ExportColumn } from '@/lib/export'
import { Button, Card, Chip, ErrorNote, Input, PageHeader, Select, Skeleton, Stat } from '@/components/ui'

type Tab = 'collections' | 'customers' | 'outstanding' | 'utilisation'
const TABS: [Tab, string][] = [['collections', 'Collections'], ['customers', 'Customer-wise'], ['outstanding', 'Outstanding & overdue'], ['utilisation', 'Scooter utilisation']]

function presets(): [string, string, string][] {
  const t = new Date()
  const monday = new Date(t); monday.setDate(t.getDate() - ((t.getDay() + 6) % 7))
  const m0 = new Date(t.getFullYear(), t.getMonth(), 1)
  const lm0 = new Date(t.getFullYear(), t.getMonth() - 1, 1), lm1 = new Date(t.getFullYear(), t.getMonth(), 0)
  const d30 = new Date(t); d30.setDate(t.getDate() - 29)
  return [
    ['week', 'This week', `${toISODate(monday)}|${toISODate(t)}`],
    ['month', 'This month', `${toISODate(m0)}|${toISODate(t)}`],
    ['last', 'Last month', `${toISODate(lm0)}|${toISODate(lm1)}`],
    ['30', 'Last 30 days', `${toISODate(d30)}|${toISODate(t)}`],
  ]
}

interface Col<T> extends ExportColumn<T> { render?: (row: T) => ReactNode; align?: 'right' }
function ReportTable<T>({ cols, rows, empty }: { cols: Col<T>[]; rows: T[]; empty: string }) {
  if (!rows.length) return <p className="px-4 py-8 text-center text-base text-ink-2">{empty}</p>
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr className="border-b border-line text-left text-ink-2">{cols.map((c) => <th key={c.header} className={`h-9 px-4 font-medium whitespace-nowrap ${c.money || c.align === 'right' ? 'text-right' : ''}`}>{c.header}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => (
          <tr key={i} className="border-b border-line last:border-0">
            {cols.map((c) => <td key={c.header} className={`h-10 px-4 ${c.money || c.align === 'right' ? 'num text-right' : ''}`}>{c.render ? c.render(r) : c.money ? formatINR(Number(c.value(r))) : c.value(r)}</td>)}
          </tr>
        ))}</tbody>
      </table>
    </div>
  )
}

interface Coll { period: string; total: number; online: number; offline: number; payments: number; rent: number; deposit: number; late_fees: number }
interface Cust { user_id: string; full_name: string; phone: string; payments: number; total: number; last_paid: string | null; outstanding: number; rental_status: Enums<'rental_status'> | null }
interface Out { rental_id: string; full_name: string; phone: string; scooter_code: string; status: Enums<'rental_status'>; next_due_date: string; days_late: number; weeks_due: number; late_fee: number; outstanding: number }
interface Util { code: string; model: string; status: Enums<'scooter_status'>; rented_days: number; range_days: number; utilisation: number; revenue: number; rentals: number; service_requests: number; maintenance_notes: string | null }

export function Reports() {
  const ps = presets()
  const [tab, setTab] = useState<Tab>('collections')
  const [range, setRange] = useState(ps[1][2])
  const [group, setGroup] = useState<'day' | 'week' | 'month'>('day')
  const [from, to] = range.split('|')
  const label = `${formatDate(from, true)} – ${formatDate(to, true)}`

  const q = useQuery({
    queryKey: ['report', tab, from, to, group],
    queryFn: async (): Promise<unknown[]> => {
      if (tab === 'collections') return must(await supabase.rpc('report_collections', { p_from: from, p_to: to, p_group: group })) as unknown[]
      if (tab === 'customers') return must(await supabase.rpc('report_customers', { p_from: from, p_to: to })) as unknown[]
      if (tab === 'outstanding') return must(await supabase.rpc('report_outstanding')) as unknown[]
      return must(await supabase.rpc('report_utilisation', { p_from: from, p_to: to })) as unknown[]
    },
  })

  const spec = useMemo(() => {
    const periodLabel = (d: string) => group === 'month' ? new Date(d).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) : group === 'week' ? `Week of ${formatDate(d, true)}` : formatDate(d, true)
    const coll: Col<Coll>[] = [
      { header: group === 'day' ? 'Date' : group === 'week' ? 'Week' : 'Month', value: (r) => periodLabel(r.period) },
      { header: 'Payments', value: (r) => Number(r.payments), align: 'right' },
      { header: 'Rent', value: (r) => Number(r.rent ?? 0), money: true },
      { header: 'Deposits', value: (r) => Number(r.deposit ?? 0), money: true },
      { header: 'Late fees', value: (r) => Number(r.late_fees ?? 0), money: true },
      { header: 'Online (UPI)', value: (r) => Number(r.online ?? 0), money: true },
      { header: 'Offline', value: (r) => Number(r.offline ?? 0), money: true },
      { header: 'Total', value: (r) => Number(r.total), money: true },
    ]
    const cust: Col<Cust>[] = [
      { header: 'Customer', value: (r) => r.full_name },
      { header: 'Phone', value: (r) => formatPhone(r.phone) },
      { header: 'Payments', value: (r) => Number(r.payments), align: 'right' },
      { header: 'Paid in range', value: (r) => Number(r.total), money: true },
      { header: 'Last paid', value: (r) => (r.last_paid ? formatDate(r.last_paid, true) : '—') },
      { header: 'Outstanding now', value: (r) => Number(r.outstanding), money: true },
      { header: 'Rental', value: (r) => (r.rental_status ? RENTAL_STATUS[r.rental_status].label : '—'), render: (r) => (r.rental_status ? <Chip meta={RENTAL_STATUS[r.rental_status]} /> : '—') },
    ]
    const out: Col<Out>[] = [
      { header: 'Customer', value: (r) => r.full_name },
      { header: 'Phone', value: (r) => formatPhone(r.phone) },
      { header: 'Scooter', value: (r) => r.scooter_code },
      { header: 'Due date', value: (r) => formatDate(r.next_due_date, true) },
      { header: 'Days late', value: (r) => r.days_late, align: 'right' },
      { header: 'Weeks due', value: (r) => r.weeks_due, align: 'right' },
      { header: 'Late fee', value: (r) => Number(r.late_fee), money: true },
      { header: 'Outstanding', value: (r) => Number(r.outstanding), money: true },
      { header: 'Status', value: (r) => RENTAL_STATUS[r.status].label, render: (r) => <Chip meta={RENTAL_STATUS[r.status]} /> },
    ]
    const util: Col<Util>[] = [
      { header: 'Scooter', value: (r) => r.code },
      { header: 'Model', value: (r) => r.model },
      { header: 'Status', value: (r) => SCOOTER_STATUS[r.status].label, render: (r) => <Chip meta={SCOOTER_STATUS[r.status]} /> },
      { header: 'Days rented', value: (r) => `${r.rented_days} / ${r.range_days}`, align: 'right' },
      { header: 'Utilisation', value: (r) => `${Number(r.utilisation).toFixed(1)}%`, align: 'right' },
      { header: 'Rent collected', value: (r) => Number(r.revenue), money: true },
      { header: 'Service requests', value: (r) => Number(r.service_requests), align: 'right' },
      { header: 'Maintenance notes', value: (r) => r.maintenance_notes ?? '', render: (r) => <span className="line-clamp-1 max-w-64 text-ink-2">{r.maintenance_notes ?? '—'}</span> },
    ]
    return { collections: coll, customers: cust, outstanding: out, utilisation: util }
  }, [group])

  const rows = q.data ?? []
  const cols = spec[tab] as Col<unknown>[]
  const title = TABS.find((t) => t[0] === tab)![1]
  const sub = tab === 'outstanding' ? `As of ${formatDate(new Date(), true)}` : label
  const fileName = `snireva-${tab}-${tab === 'outstanding' ? toISODate(new Date()) : `${from}-to-${to}`}`

  const totals = tab === 'collections' ? (rows as Coll[]).reduce((a, r) => ({ total: a.total + Number(r.total), online: a.online + Number(r.online ?? 0), offline: a.offline + Number(r.offline ?? 0), n: a.n + Number(r.payments) }), { total: 0, online: 0, offline: 0, n: 0 })
    : tab === 'outstanding' ? { total: (rows as Out[]).reduce((a, r) => a + Number(r.outstanding), 0), n: rows.length, online: 0, offline: 0 } : null

  return (
    <>
      <PageHeader title="Reports" description="Pick a report and a date range. Export to Excel or PDF."
        actions={<>
          <Button icon={FileSpreadsheet} disabled={!rows.length} onClick={() => exportExcel(fileName, title, cols, rows)}>Excel</Button>
          <Button icon={FileText} disabled={!rows.length} onClick={() => exportPdf(fileName, title, sub, cols, rows)}>PDF</Button>
        </>} />
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-md border border-line bg-surface p-2">
        <div role="tablist" className="flex flex-wrap gap-1">
          {TABS.map(([k, l]) => (
            <button key={k} role="tab" type="button" aria-selected={tab === k} onClick={() => setTab(k)}
              className={`h-8 rounded-md px-3 text-sm ${tab === k ? 'bg-tint font-medium text-brand-press' : 'text-ink-2 hover:bg-canvas'}`}>{l}</button>
          ))}
        </div>
        {tab !== 'outstanding' && (
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {tab === 'collections' && (
              <Select aria-label="Group by" value={group} onChange={(e) => setGroup(e.target.value as typeof group)} className="h-8 w-28! text-sm">
                <option value="day">Daily</option><option value="week">Weekly</option><option value="month">Monthly</option>
              </Select>
            )}
            <Select aria-label="Date range" value={ps.some((p) => p[2] === range) ? range : 'custom'} onChange={(e) => e.target.value !== 'custom' && setRange(e.target.value)} className="h-8 w-36! text-sm">
              {ps.map(([k, l, v]) => <option key={k} value={v}>{l}</option>)}
              <option value="custom">Custom</option>
            </Select>
            <Input type="date" aria-label="From" value={from} onChange={(e) => setRange(`${e.target.value}|${to}`)} className="h-8 w-36! text-sm" />
            <span className="text-ink-2">–</span>
            <Input type="date" aria-label="To" value={to} onChange={(e) => setRange(`${from}|${e.target.value}`)} className="h-8 w-36! text-sm" />
          </div>
        )}
      </div>

      {totals && (
        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {tab === 'collections' ? <>
            <Stat label="Collected" value={formatINR(totals.total)} sub={label} />
            <Stat label="Online (UPI)" value={formatINR(totals.online)} />
            <Stat label="Offline" value={formatINR(totals.offline)} />
            <Stat label="Payments" value={totals.n} />
          </> : <>
            <Stat label="Outstanding" value={formatINR(totals.total)} tone={totals.total ? 'red' : undefined} />
            <Stat label="Rentals listed" value={totals.n} sub="Overdue or due in 3 days" />
          </>}
        </div>
      )}

      <Card pad={false} title={title} actions={<span className="text-sm text-ink-2">{sub}</span>}>
        {q.error ? <div className="p-4"><ErrorNote error={q.error} onRetry={() => q.refetch()} /></div>
          : q.isPending ? <div className="flex flex-col gap-2 p-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
          : <ReportTable cols={cols} rows={rows} empty="No data for this range." />}
      </Card>
    </>
  )
}
