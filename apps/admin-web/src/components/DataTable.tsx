import { useMemo, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  flexRender, getCoreRowModel, useReactTable, type ColumnDef, type SortingState,
} from '@tanstack/react-table'
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Inbox } from 'lucide-react'
import { cx, EmptyState, ErrorNote, Skeleton } from './ui'

export const PAGE_SIZE = 25

/** Table state (page, sort, filters) lives in the URL so filters stick and links can be shared. */
export function useTableState(defaultSort: { id: string; desc: boolean }) {
  const [params, setParams] = useSearchParams()
  const page = Math.max(0, Number(params.get('page') ?? 0))
  const sortId = params.get('sort') ?? defaultSort.id
  const desc = params.has('dir') ? params.get('dir') === 'desc' : defaultSort.desc
  const sorting: SortingState = [{ id: sortId, desc }]

  const set = (patch: Record<string, string | null>, resetPage = true) => {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === '') next.delete(k)
      else next.set(k, v)
    }
    if (resetPage && !('page' in patch)) next.delete('page')
    setParams(next, { replace: true })
  }
  return {
    page, sorting, params,
    filter: (k: string) => params.get(k) ?? '',
    setFilter: (k: string, v: string | null) => set({ [k]: v }),
    setPage: (p: number) => set({ page: p ? String(p) : null }, false),
    setSorting: (s: SortingState) => set({ sort: s[0]?.id ?? null, dir: s[0] ? (s[0].desc ? 'desc' : 'asc') : null }),
    range: [page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1] as [number, number],
  }
}

interface Props<T> {
  columns: ColumnDef<T, any>[]
  data: T[] | undefined
  total: number | undefined
  loading: boolean
  error?: unknown
  onRetry?: () => void
  state: ReturnType<typeof useTableState>
  onRowClick?: (row: T) => void
  rowClassName?: (row: T) => string | undefined
  empty?: { title: string; body?: string; action?: ReactNode }
  toolbar?: ReactNode
}

export function DataTable<T>({ columns, data, total, loading, error, onRetry, state, onRowClick, rowClassName, empty, toolbar }: Props<T>) {
  const rows = useMemo(() => data ?? [], [data])
  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,
    manualPagination: true,
    state: { sorting: state.sorting },
    onSortingChange: (u) => state.setSorting(typeof u === 'function' ? u(state.sorting) : u),
    enableSortingRemoval: false,
  })
  const pages = Math.max(1, Math.ceil((total ?? 0) / 25))
  const from = total ? state.page * 25 + 1 : 0
  const to = Math.min((state.page + 1) * 25, total ?? 0)

  return (
    <div className="rounded-md border border-line bg-surface">
      {toolbar && <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-t-md border-b border-line bg-surface px-3 py-2.5">{toolbar}</div>}
      {error ? <div className="p-4"><ErrorNote error={error} onRetry={onRetry} /></div> : null}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="border-b border-line">
                {hg.headers.map((h) => {
                  const sortable = h.column.getCanSort()
                  const dir = h.column.getIsSorted()
                  const align = (h.column.columnDef.meta as { align?: string } | undefined)?.align
                  return (
                    <th key={h.id} scope="col"
                      aria-sort={dir ? (dir === 'desc' ? 'descending' : 'ascending') : undefined}
                      className={cx('h-9 px-3 font-medium text-ink-2 whitespace-nowrap', align === 'right' ? 'text-right' : 'text-left')}>
                      {sortable ? (
                        <button type="button" onClick={h.column.getToggleSortingHandler()}
                          className={cx('inline-flex items-center gap-1 hover:text-ink', align === 'right' && 'flex-row-reverse')}>
                          {flexRender(h.column.columnDef.header, h.getContext())}
                          {dir === 'asc' ? <ArrowUp size={12} aria-hidden /> : dir === 'desc' ? <ArrowDown size={12} aria-hidden /> : <span className="w-3" />}
                        </button>
                      ) : flexRender(h.column.columnDef.header, h.getContext())}
                    </th>
                  )
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {loading && !data
              ? Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="border-b border-line last:border-0">
                    {columns.map((_c, j) => <td key={j} className="h-11 px-3"><Skeleton className="h-3.5 w-3/4" /></td>)}
                  </tr>
                ))
              : table.getRowModel().rows.map((r) => (
                  <tr key={r.id}
                    onClick={onRowClick ? () => onRowClick(r.original) : undefined}
                    onKeyDown={onRowClick ? (e) => { if (e.key === 'Enter') onRowClick(r.original) } : undefined}
                    tabIndex={onRowClick ? 0 : undefined}
                    className={cx('border-b border-line last:border-0', onRowClick && 'cursor-pointer hover:bg-canvas focus:bg-canvas focus:outline-none', rowClassName?.(r.original))}>
                    {r.getVisibleCells().map((c) => {
                      const align = (c.column.columnDef.meta as { align?: string } | undefined)?.align
                      return <td key={c.id} className={cx('h-11 px-3 text-ink', align === 'right' && 'num text-right')}>{flexRender(c.column.columnDef.cell, c.getContext())}</td>
                    })}
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
      {!loading && rows.length === 0 && !error && (
        <EmptyState icon={Inbox} title={empty?.title ?? 'Nothing here yet'} body={empty?.body} action={empty?.action} />
      )}
      <div className="flex items-center justify-between border-t border-line px-3 py-2 text-sm text-ink-2">
        <span className="num">{total ? `${from}–${to} of ${total}` : loading ? 'Loading…' : '0 results'}</span>
        <div className="flex items-center gap-1">
          <button type="button" aria-label="Previous page" disabled={state.page === 0} onClick={() => state.setPage(state.page - 1)}
            className="inline-flex size-8 items-center justify-center rounded-md hover:bg-canvas disabled:opacity-40"><ChevronLeft size={16} /></button>
          <span className="num px-1">Page {state.page + 1} of {pages}</span>
          <button type="button" aria-label="Next page" disabled={state.page + 1 >= pages} onClick={() => state.setPage(state.page + 1)}
            className="inline-flex size-8 items-center justify-center rounded-md hover:bg-canvas disabled:opacity-40"><ChevronRight size={16} /></button>
        </div>
      </div>
    </div>
  )
}

/** Search input that writes to the URL after a short pause. */
export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <input
      type="search"
      defaultValue={value}
      placeholder={placeholder}
      aria-label={placeholder}
      onChange={(e) => {
        const v = e.target.value
        window.clearTimeout((window as unknown as { __st?: number }).__st)
        ;(window as unknown as { __st?: number }).__st = window.setTimeout(() => onChange(v), 300)
      }}
      className="h-8 w-64 rounded-md border border-line-strong bg-surface px-3 text-sm placeholder:text-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
    />
  )
}

export function FilterSelect({ value, onChange, label, options }: {
  value: string; onChange: (v: string) => void; label: string; options: [string, string][]
}) {
  return (
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}
      className="h-8 rounded-md border border-line-strong bg-surface px-2 text-sm text-ink focus:border-brand focus:outline-none">
      <option value="">{label}: All</option>
      {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  )
}
