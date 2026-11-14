import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, ArrowRight } from 'lucide-react'
import { daysUntil, formatDate, formatINR, formatPhone, RENTAL_STATUS, toISODate } from '@snireva/shared'
import { must, supabase, type Enums } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { Card, Chip, ErrorNote, PageHeader, Skeleton, Stat } from '@/components/ui'

interface Overview {
  scooters: { total: number; available: number; rented: number; reserved: number; maintenance: number }
  active_customers: number; collected_week: number; collected_today: number; pending_amount: number
  overdue_amount: number; overdue_count: number; due_soon_count: number; due_soon_amount: number
  pending_kyc: number; pending_bookings: number; awaiting_handover: number; open_service: number; week_start: string
}
interface Outstanding {
  rental_id: string; full_name: string; phone: string; scooter_code: string; status: Enums<'rental_status'>
  next_due_date: string; days_late: number; outstanding: number
}

/** Daily collections, last 14 days. Single series: one hue, no legend, hover tooltip, table for screen readers. */
function CollectionsChart() {
  const [hover, setHover] = useState<number | null>(null)
  const days = 14
  const q = useQuery({
    queryKey: ['collections-14d'],
    queryFn: async () => {
      const start = new Date(); start.setDate(start.getDate() - (days - 1))
      const { data, error } = await supabase.from('payments').select('amount, paid_at').eq('status', 'paid').gte('paid_at', `${toISODate(start)}T00:00:00+05:30`)
      if (error) throw error
      const buckets = Array.from({ length: days }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return { date: toISODate(d), total: 0 } })
      for (const p of data) {
        const key = new Date(p.paid_at!).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
        const b = buckets.find((x) => x.date === key)
        if (b) b.total += Number(p.amount)
      }
      return buckets
    },
  })
  const data = q.data
  const max = Math.max(1, ...(data?.map((d) => d.total) ?? [1]))
  const nice = useMemo(() => { const m = Math.pow(10, Math.floor(Math.log10(max))); return Math.ceil(max / m) * m }, [max])
  const W = 720, H = 200, padL = 56, padB = 24, plotW = W - padL - 8, plotH = H - padB - 8
  const bw = plotW / days
  const total = data?.reduce((a, d) => a + d.total, 0) ?? 0

  return (
    <Card title="Collections, last 14 days" actions={<span className="num text-sm text-ink-2">{formatINR(total)} total</span>}>
      {!data ? <Skeleton className="h-[200px] w-full" /> : (
        <div className="relative">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Daily collections for the last 14 days, ${formatINR(total)} in total`}>
            {[0, 0.5, 1].map((t) => {
              const y = 8 + plotH * (1 - t)
              return (
                <g key={t}>
                  <line x1={padL} x2={W - 8} y1={y} y2={y} stroke="#DCE6E0" strokeWidth={1} />
                  <text x={padL - 8} y={y + 4} textAnchor="end" fontSize={11} fill="#66756F" style={{ fontVariantNumeric: 'tabular-nums' }}>{t === 0 ? '0' : formatINR(nice * t)}</text>
                </g>
              )
            })}
            {data.map((d, i) => {
              const h = (d.total / nice) * plotH
              const x = padL + i * bw + 2
              const w = Math.max(4, bw - 4) // 2px surface gap each side
              const y = 8 + plotH - h
              const r = Math.min(4, h / 2, w / 2)
              return (
                <g key={d.date} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                  <rect x={padL + i * bw} y={8} width={bw} height={plotH} fill="transparent" />
                  {h > 0 && (
                    <path fill={hover === null || hover === i ? '#23915C' : '#9ED1B6'}
                      d={`M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`} />
                  )}
                  {(i % 2 === 1 || i === days - 1) && (
                    <text x={padL + i * bw + bw / 2} y={H - 6} textAnchor="middle" fontSize={11} fill="#66756F">{formatDate(d.date)}</text>
                  )}
                </g>
              )
            })}
          </svg>
          {hover !== null && (
            <div className="pointer-events-none absolute -translate-x-1/2 rounded-md border border-line bg-surface px-3 py-2 text-sm"
              style={{ left: `${((padL + hover * bw + bw / 2) / W) * 100}%`, top: 0 }}>
              <p className="text-ink-2">{formatDate(data[hover].date, true)}</p>
              <p className="num font-semibold">{formatINR(data[hover].total)}</p>
            </div>
          )}
          <table className="sr-only">
            <caption>Daily collections</caption>
            <thead><tr><th>Date</th><th>Amount</th></tr></thead>
            <tbody>{data.map((d) => <tr key={d.date}><td>{formatDate(d.date, true)}</td><td>{formatINR(d.total)}</td></tr>)}</tbody>
          </table>
        </div>
      )}
    </Card>
  )
}

export function Overview() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const q = useQuery({ queryKey: ['overview'], refetchInterval: 60_000, queryFn: async () => must(await supabase.rpc('dashboard_overview')) as unknown as Overview })
  const out = useQuery({ queryKey: ['outstanding'], queryFn: async () => must(await supabase.rpc('report_outstanding')) as unknown as Outstanding[] })
  const o = q.data

  return (
    <>
      <PageHeader title={`Good ${new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}, ${profile?.full_name?.split(' ')[0] ?? ''}`}
        description={`${formatDate(new Date(), true)} · figures update every minute`} />
      {q.error && <ErrorNote error={q.error} onRetry={() => q.refetch()} />}

      {!o ? <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">{Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="h-[84px]" />)}</div> : (
        <>
          <h2 className="sr-only">Fleet</h2>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Stat label="Scooters" value={o.scooters.total} sub={`${o.scooters.reserved} reserved`} onClick={() => navigate('/scooters')} />
            <Stat label="Available" value={o.scooters.available} onClick={() => navigate('/scooters?status=available')} />
            <Stat label="Rented" value={o.scooters.rented} onClick={() => navigate('/scooters?status=rented')} />
            <Stat label="In maintenance" value={o.scooters.maintenance} tone={o.scooters.maintenance ? 'amber' : undefined} onClick={() => navigate('/scooters?status=under_maintenance')} />
            <Stat label="Active customers" value={o.active_customers} onClick={() => navigate('/rentals')} />
          </div>
          <h2 className="sr-only">Money</h2>
          <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Stat label="Collected this week" value={formatINR(o.collected_week)} sub={`${formatINR(o.collected_today)} today`} onClick={() => navigate('/payments?status=paid')} />
            <Stat label="Pending" value={formatINR(o.pending_amount)} sub="Due now across rentals" />
            <Stat label="Overdue" value={formatINR(o.overdue_amount)} sub={`${o.overdue_count} rental${o.overdue_count === 1 ? '' : 's'}`} tone={o.overdue_count ? 'red' : undefined} onClick={() => navigate('/rentals?view=overdue')} />
            <Stat label="Due in next 3 days" value={o.due_soon_count} sub={formatINR(o.due_soon_amount)} tone={o.due_soon_count ? 'amber' : undefined} onClick={() => navigate('/rentals?view=due')} />
            <Stat label="Pending KYC" value={o.pending_kyc} tone={o.pending_kyc ? 'amber' : undefined} onClick={() => navigate('/customers?kyc=pending')} />
          </div>
        </>
      )}

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[1fr_420px]">
        <CollectionsChart />
        <Card title="Needs attention" pad={false}>
          <ul className="divide-y divide-line text-base">
            {[
              [o?.pending_bookings, 'booking requests to allocate', '/bookings'],
              [o?.awaiting_handover, 'scooters awaiting handover', '/rentals?view=setup'],
              [o?.pending_kyc, 'customers waiting for KYC review', '/customers?kyc=pending'],
              [o?.open_service, 'open service requests', '/service'],
            ].map(([n, label, to]) => (
              <li key={label as string}>
                <Link to={to as string} className="flex h-12 items-center gap-3 px-4 hover:bg-canvas">
                  <span className={`num w-8 text-lg font-semibold ${n ? 'text-ink' : 'text-muted'}`}>{n ?? '–'}</span>
                  <span className="flex-1 text-ink-2">{label as string}</span>
                  <ArrowRight size={16} className="text-muted" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="mt-4">
        <Card title={<span className="flex items-center gap-2"><AlertTriangle size={16} className="text-warn" aria-hidden />Overdue and due soon</span>} pad={false}
          actions={<Link to="/rentals?view=due" className="text-sm font-medium text-brand-press hover:underline">All rentals</Link>}>
          {!out.data ? <div className="p-4"><Skeleton className="h-24 w-full" /></div> : out.data.length === 0 ? (
            <p className="px-4 py-6 text-base text-ink-2">Nobody is overdue or due in the next 3 days.</p>
          ) : (
            <table className="w-full text-sm">
              <thead><tr className="border-b border-line text-left text-ink-2">
                <th className="h-9 px-4 font-medium">Customer</th><th className="px-4 font-medium">Scooter</th><th className="px-4 font-medium">Due</th>
                <th className="px-4 font-medium">Status</th><th className="px-4 text-right font-medium">Outstanding</th>
              </tr></thead>
              <tbody>{out.data.slice(0, 8).map((r) => {
                const d = daysUntil(r.next_due_date)
                return (
                  <tr key={r.rental_id} onClick={() => navigate(`/rentals/${r.rental_id}`)} className="cursor-pointer border-b border-line last:border-0 hover:bg-canvas">
                    <td className="h-11 px-4"><span className="font-medium">{r.full_name}</span> <span className="num text-xs text-muted">{formatPhone(r.phone)}</span></td>
                    <td className="px-4">{r.scooter_code}</td>
                    <td className={`num px-4 ${d < 0 ? 'text-bad' : d <= 2 ? 'text-warn' : ''}`}>{formatDate(r.next_due_date)} <span className="text-xs text-muted">{d < 0 ? `${-d}d late` : d === 0 ? 'today' : `in ${d}d`}</span></td>
                    <td className="px-4"><Chip meta={RENTAL_STATUS[r.status]} /></td>
                    <td className="num px-4 text-right">{formatINR(r.outstanding)}</td>
                  </tr>
                )
              })}</tbody>
            </table>
          )}
        </Card>
      </div>
    </>
  )
}
