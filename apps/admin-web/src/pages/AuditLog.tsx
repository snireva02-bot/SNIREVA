import { useMemo, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { createColumnHelper } from '@tanstack/react-table'
import { formatDateTime } from '@snireva/shared'
import { supabase } from '@/lib/supabase'
import { DataTable, FilterSelect, useTableState } from '@/components/DataTable'
import { Chip, Drawer, Input, PageHeader } from '@/components/ui'

interface Row {
  id: string; at: string; action: string; entity: string; entity_id: string | null
  before: Record<string, unknown> | null; after: Record<string, unknown> | null
  actor: { full_name: string | null; role: string } | null
}
const col = createColumnHelper<Row>()
const HIDE = new Set(['updated_at', 'created_at'])

function changes(r: Row): [string, unknown, unknown][] {
  const keys = new Set([...Object.keys(r.before ?? {}), ...Object.keys(r.after ?? {})])
  return [...keys].filter((k) => !HIDE.has(k) && JSON.stringify(r.before?.[k]) !== JSON.stringify(r.after?.[k]))
    .map((k) => [k, r.before?.[k], r.after?.[k]])
}
const show = (v: unknown) => (v === null || v === undefined ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v))

export function AuditLog() {
  const ts = useTableState({ id: 'at', desc: true })
  const entity = ts.filter('entity'), day = ts.filter('day')
  const [open, setOpen] = useState<Row | null>(null)

  const q = useQuery({
    queryKey: ['audit', ts.page, ts.sorting, entity, day],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      // actor_id has no FK (actors can be deleted); join profiles client-side
      let query = supabase.from('audit_log').select('id, at, action, entity, entity_id, before, after, actor_id', { count: 'exact' })
      if (entity) query = query.eq('entity', entity)
      if (day) query = query.gte('at', `${day}T00:00:00+05:30`).lte('at', `${day}T23:59:59+05:30`)
      const { data, count, error } = await query.order('at', { ascending: ts.sorting[0].desc === false }).range(...ts.range)
      if (error) throw error
      const ids = [...new Set(data.map((r) => r.actor_id).filter(Boolean))] as string[]
      const { data: actors } = ids.length ? await supabase.from('profiles').select('id, full_name, role').in('id', ids) : { data: [] }
      const byId = new Map((actors ?? []).map((a) => [a.id, a]))
      return { rows: data.map((r) => ({ ...r, actor: r.actor_id ? byId.get(r.actor_id) ?? null : null })) as unknown as Row[], count: count ?? 0 }
    },
  })

  const columns = useMemo(() => [
    col.accessor('at', { header: 'When', cell: (c) => <span className="num">{formatDateTime(c.getValue())}</span> }),
    col.accessor((r) => r.actor?.full_name, { id: 'actor', header: 'Who', enableSorting: false, cell: (c) => c.getValue() ?? <span className="text-muted">System</span> }),
    col.accessor('action', { header: 'Action', enableSorting: false, cell: (c) => <Chip tone={c.getValue() === 'delete' ? 'red' : c.getValue() === 'insert' ? 'green' : 'grey'}>{c.getValue()}</Chip> }),
    col.accessor('entity', { header: 'Record', enableSorting: false, cell: (c) => <span>{c.getValue()} <span className="num text-xs text-muted">{c.row.original.entity_id?.slice(0, 8)}</span></span> }),
    col.display({ id: 'changes', header: 'Changed', cell: (c) => <span className="line-clamp-1 max-w-96 text-ink-2">{changes(c.row.original).map(([k]) => k).join(', ') || '—'}</span> }),
  ], [])

  return (
    <>
      <PageHeader title="Audit log" description="Every change to payments, rentals, scooters, KYC documents, customers and settings. Read-only; rows can't be edited or deleted." />
      <DataTable columns={columns} data={q.data?.rows} total={q.data?.count} loading={q.isPending} error={q.error} onRetry={() => q.refetch()} state={ts} onRowClick={setOpen}
        toolbar={<>
          <FilterSelect label="Record" value={entity} onChange={(v) => ts.setFilter('entity', v)}
            options={['payments', 'rentals', 'scooters', 'kyc_documents', 'profiles', 'settings'].map((e) => [e, e])} />
          <Input type="date" aria-label="Day" value={day} onChange={(e) => ts.setFilter('day', e.target.value)} className="h-8 w-40! text-sm" />
        </>} />
      <Drawer open={!!open} onClose={() => setOpen(null)} title={open ? `${open.action} · ${open.entity}` : ''} width={560}>
        {open && (
          <div className="flex flex-col gap-4">
            <p className="text-base text-ink-2">{formatDateTime(open.at)} by {open.actor?.full_name ?? 'System'}{open.actor ? ` (${open.actor.role})` : ''}</p>
            <table className="w-full text-sm">
              <thead><tr className="border-b border-line text-left text-ink-2"><th className="h-8 pr-3 font-medium">Field</th><th className="pr-3 font-medium">Before</th><th className="font-medium">After</th></tr></thead>
              <tbody>{changes(open).map(([k, b, a]) => (
                <tr key={k} className="border-b border-line align-top last:border-0">
                  <td className="py-2 pr-3 font-medium">{k}</td>
                  <td className="num break-all py-2 pr-3 text-bad">{show(b)}</td>
                  <td className="num break-all py-2 text-ok">{show(a)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </Drawer>
    </>
  )
}
