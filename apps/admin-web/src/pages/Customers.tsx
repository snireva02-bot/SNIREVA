import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { createColumnHelper } from '@tanstack/react-table'
import { formatDate, formatPhone, KYC_STATUS, PLATFORM_LABEL } from '@snireva/shared'
import { supabase, type Tables } from '@/lib/supabase'
import { DataTable, FilterSelect, PAGE_SIZE, SearchBox, useTableState } from '@/components/DataTable'
import { Chip, PageHeader } from '@/components/ui'

type Row = Pick<Tables<'profiles'>, 'id' | 'full_name' | 'phone' | 'delivery_platform' | 'kyc_status' | 'is_active' | 'created_at' | 'deletion_requested_at'>
const col = createColumnHelper<Row>()

export function Customers() {
  const navigate = useNavigate()
  const ts = useTableState({ id: 'created_at', desc: true })
  const search = ts.filter('q')
  const kyc = ts.filter('kyc')
  const active = ts.filter('active')

  const q = useQuery({
    queryKey: ['customers', ts.page, ts.sorting, search, kyc, active],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      let query = supabase.from('profiles')
        .select('id, full_name, phone, delivery_platform, kyc_status, is_active, created_at, deletion_requested_at', { count: 'exact' })
        .eq('role', 'customer')
      if (search) {
        const s = search.replace(/[%,()]/g, '')
        query = query.or(`full_name.ilike.%${s}%,phone.ilike.%${s.replace(/\D/g, '') || s}%`)
      }
      if (kyc === 'pending') query = query.in('kyc_status', ['submitted', 'under_review'])
      else if (kyc) query = query.eq('kyc_status', kyc as Row['kyc_status'])
      if (active) query = query.eq('is_active', active === 'yes')
      const sort = ts.sorting[0]
      const { data, count, error } = await query.order(sort.id, { ascending: !sort.desc }).range(...ts.range)
      if (error) throw error
      return { rows: data as Row[], count: count ?? 0 }
    },
  })

  const columns = useMemo(() => [
    col.accessor('full_name', { header: 'Name', cell: (c) => <span className="font-medium">{c.getValue() ?? 'Not set'}</span> }),
    col.accessor('phone', { header: 'Phone', cell: (c) => <span className="num">{formatPhone(c.getValue())}</span> }),
    col.accessor('delivery_platform', { header: 'Platform', enableSorting: false, cell: (c) => (c.getValue() ? PLATFORM_LABEL[c.getValue()!] : '—') }),
    col.accessor('kyc_status', { header: 'KYC', cell: (c) => <Chip meta={KYC_STATUS[c.getValue()]} /> }),
    col.accessor('is_active', {
      header: 'Account', cell: (c) => (
        <span className="flex items-center gap-2">
          {c.getValue() ? <Chip tone="green">Active</Chip> : <Chip tone="grey">Inactive</Chip>}
          {c.row.original.deletion_requested_at && <Chip tone="red">Deletion requested</Chip>}
        </span>
      ),
    }),
    col.accessor('created_at', { header: 'Joined', cell: (c) => <span className="num">{formatDate(c.getValue(), true)}</span> }),
  ], [])

  return (
    <>
      <PageHeader title="Customers" description="Riders who signed up in the app. Review documents to approve them." />
      <DataTable
        columns={columns}
        data={q.data?.rows}
        total={q.data?.count}
        loading={q.isPending}
        error={q.error}
        onRetry={() => q.refetch()}
        state={ts}
        onRowClick={(r) => navigate(`/customers/${r.id}`)}
        empty={{ title: 'No customers found', body: search || kyc || active ? 'Try clearing the filters.' : 'Customers appear here after they sign up in the app.' }}
        toolbar={<>
          <SearchBox value={search} onChange={(v) => ts.setFilter('q', v)} placeholder="Search name or phone" />
          <FilterSelect label="KYC" value={kyc} onChange={(v) => ts.setFilter('kyc', v)}
            options={[['pending', 'Needs review'], ...Object.entries(KYC_STATUS).map(([k, m]) => [k, m.label] as [string, string])]} />
          <FilterSelect label="Account" value={active} onChange={(v) => ts.setFilter('active', v)} options={[['yes', 'Active'], ['no', 'Inactive']]} />
          <span className="ml-auto text-xs text-muted">{PAGE_SIZE} per page</span>
        </>}
      />
    </>
  )
}
