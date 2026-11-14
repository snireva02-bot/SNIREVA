import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Check, ChevronLeft, ChevronRight, FileText, RotateCw, X, ZoomIn, ZoomOut } from 'lucide-react'
import {
  DOC_STATUS, DOC_TYPE_LABEL, formatDate, formatDateTime, formatINR, formatPhone, KYC_STATUS,
  PAYMENT_METHOD_LABEL, PAYMENT_STATUS, PLATFORM_LABEL, RENTAL_STATUS,
} from '@snireva/shared'
import { must, signedUrl, supabase, type Tables } from '@/lib/supabase'
import { Button, Card, Chip, Confirm, DefList, EmptyState, ErrorNote, Field, IconButton, PageHeader, Skeleton, Textarea, useToast } from '@/components/ui'

type Doc = Tables<'kyc_documents'>

function useSigned(bucket: string, path?: string | null) {
  return useQuery({ queryKey: ['signed', bucket, path], enabled: !!path, staleTime: 45 * 60_000, queryFn: () => signedUrl(bucket, path) })
}

function DocThumb({ doc, onOpen }: { doc: Doc; onOpen: () => void }) {
  const { data: url } = useSigned('kyc', doc.file_path)
  const isPdf = doc.file_path.toLowerCase().endsWith('.pdf')
  return (
    <button type="button" onClick={onOpen} className="group flex flex-col overflow-hidden rounded-md border border-line bg-surface text-left hover:border-line-strong">
      <div className="flex aspect-[4/3] items-center justify-center overflow-hidden bg-canvas">
        {isPdf ? <FileText size={32} className="text-muted" aria-hidden />
          : url ? <img src={url} alt={DOC_TYPE_LABEL[doc.doc_type]} className="h-full w-full object-cover" loading="lazy" />
          : <Skeleton className="h-full w-full rounded-none" />}
      </div>
      <div className="flex flex-col items-start gap-1.5 border-t border-line px-3 py-2">
        <span className="text-sm font-medium">{DOC_TYPE_LABEL[doc.doc_type]}</span>
        <Chip meta={DOC_STATUS[doc.status]} />
      </div>
    </button>
  )
}

/** Full-screen document viewer with zoom/rotate and approve/reject. */
function DocViewer({ docs, index, onIndex, onClose }: { docs: Doc[]; index: number; onIndex: (i: number) => void; onClose: () => void }) {
  const doc = docs[index]
  const { data: url } = useSigned('kyc', doc.file_path)
  const [zoom, setZoom] = useState(1)
  const [rot, setRot] = useState(0)
  const [rejecting, setRejecting] = useState(false)
  const [note, setNote] = useState('')
  const qc = useQueryClient()
  const toast = useToast()
  const isPdf = doc.file_path.toLowerCase().endsWith('.pdf')

  useEffect(() => { setZoom(1); setRot(0); setRejecting(false); setNote('') }, [index])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'TEXTAREA') return
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight' && index < docs.length - 1) onIndex(index + 1)
      if (e.key === 'ArrowLeft' && index > 0) onIndex(index - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [index, docs.length, onClose, onIndex])

  const review = useMutation({
    mutationFn: async (approve: boolean) => must(await supabase.rpc('review_kyc_document', { p_doc: doc.id, p_approve: approve, p_note: approve ? undefined : note })),
    onSuccess: (_d, approve) => {
      toast('ok', `${DOC_TYPE_LABEL[doc.doc_type]} ${approve ? 'approved' : 'rejected'}`)
      qc.invalidateQueries({ queryKey: ['customer'] })
      if (index < docs.length - 1) onIndex(index + 1)
    },
    onError: (e) => toast('error', (e as Error).message),
  })

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0d1513]" role="dialog" aria-modal="true" aria-label="Document viewer">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-white/10 px-4 text-white">
        <span className="font-medium">{DOC_TYPE_LABEL[doc.doc_type]}</span>
        <Chip meta={DOC_STATUS[doc.status]} />
        <span className="num text-sm text-white/60">{index + 1} of {docs.length} · uploaded {formatDateTime(doc.created_at)}</span>
        <div className="ml-auto flex items-center gap-1 [&_button]:text-white/80 [&_button:hover]:bg-white/10 [&_button:hover]:text-white">
          <IconButton icon={ZoomOut} label="Zoom out" onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))} />
          <span className="num w-12 text-center text-sm text-white/70">{Math.round(zoom * 100)}%</span>
          <IconButton icon={ZoomIn} label="Zoom in" onClick={() => setZoom((z) => Math.min(3, z + 0.25))} />
          <IconButton icon={RotateCw} label="Rotate" onClick={() => setRot((r) => (r + 90) % 360)} />
          <IconButton icon={X} label="Close viewer" onClick={onClose} />
        </div>
      </header>
      <div className="relative flex flex-1 items-center justify-center overflow-auto p-6">
        {index > 0 && <button type="button" aria-label="Previous document" onClick={() => onIndex(index - 1)} className="absolute left-4 z-10 flex size-10 items-center justify-center rounded-md bg-white/10 text-white hover:bg-white/20"><ChevronLeft /></button>}
        {isPdf ? (
          url ? <a href={url} target="_blank" rel="noreferrer" className="rounded-md bg-white px-4 py-2 text-base font-medium">Open PDF in new tab</a> : null
        ) : url ? (
          <img src={url} alt={DOC_TYPE_LABEL[doc.doc_type]} style={{ transform: `scale(${zoom}) rotate(${rot}deg)` }}
            className="max-h-full max-w-full object-contain transition-transform duration-150" />
        ) : <Skeleton className="h-96 w-72" />}
        {index < docs.length - 1 && <button type="button" aria-label="Next document" onClick={() => onIndex(index + 1)} className="absolute right-4 z-10 flex size-10 items-center justify-center rounded-md bg-white/10 text-white hover:bg-white/20"><ChevronRight /></button>}
      </div>
      <footer className="shrink-0 border-t border-white/10 bg-surface px-4 py-3">
        {rejecting ? (
          <div className="mx-auto flex max-w-3xl items-end gap-3">
            <div className="flex-1">
              <Field label="Reason (shown to the customer)" htmlFor="reject-note">
                <Textarea id="reject-note" autoFocus rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Photo is blurred, card number not readable" />
              </Field>
            </div>
            <Button onClick={() => setRejecting(false)}>Cancel</Button>
            <Button variant="danger" disabled={!note.trim()} loading={review.isPending} onClick={() => review.mutate(false)}>Reject document</Button>
          </div>
        ) : (
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
            <p className="text-sm text-ink-2">{doc.review_note ? `Note: ${doc.review_note}` : 'Check the name and number match the profile and the photo is readable.'}</p>
            <div className="flex gap-2">
              <Button variant="danger" icon={X} onClick={() => setRejecting(true)}>Reject</Button>
              <Button variant="primary" icon={Check} loading={review.isPending} onClick={() => review.mutate(true)}>Approve</Button>
            </div>
          </div>
        )}
      </footer>
    </div>
  )
}

export function CustomerDetail() {
  const { id = '' } = useParams()
  const qc = useQueryClient()
  const toast = useToast()
  const [viewer, setViewer] = useState<number | null>(null)
  const [decision, setDecision] = useState<'approve' | 'reject' | 'deactivate' | 'activate' | null>(null)
  const [reason, setReason] = useState('')

  const q = useQuery({
    queryKey: ['customer', id],
    queryFn: async () => {
      const [profile, docs, rentals, payments] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', id).single(),
        supabase.from('kyc_documents').select('*').eq('user_id', id).order('created_at', { ascending: false }),
        supabase.from('rentals').select('id, status, start_date, next_due_date, weekly_rent, created_at, scooter:scooters(code, model)').eq('user_id', id).order('created_at', { ascending: false }),
        supabase.from('payments').select('id, amount, type, method, status, paid_at, created_at, receipt_no').eq('user_id', id).order('created_at', { ascending: false }).limit(50),
      ])
      return { profile: must(profile), docs: must(docs), rentals: must(rentals), payments: must(payments) }
    },
  })
  const photo = useSigned('avatars', q.data?.profile.photo_path)

  const act = useMutation({
    mutationFn: async () => {
      if (decision === 'approve') return must(await supabase.rpc('decide_kyc', { p_user: id, p_approve: true }))
      if (decision === 'reject') return must(await supabase.rpc('decide_kyc', { p_user: id, p_approve: false, p_reason: reason }))
      return must(await supabase.rpc('set_customer_active', { p_user: id, p_active: decision === 'activate' }))
    },
    onSuccess: () => {
      toast('ok', decision === 'approve' ? 'Customer approved. They have been notified.' : decision === 'reject' ? 'Customer rejected. They have been notified.' : 'Account updated')
      setDecision(null); setReason('')
      qc.invalidateQueries({ queryKey: ['customer', id] })
      qc.invalidateQueries({ queryKey: ['sidebar-badges'] })
    },
    onError: (e) => toast('error', (e as Error).message),
  })

  if (q.isPending) return <div className="flex flex-col gap-4"><Skeleton className="h-8 w-64" /><Skeleton className="h-48 w-full" /></div>
  if (q.error) return <ErrorNote error={q.error} onRetry={() => q.refetch()} />
  const { profile: p, docs, rentals, payments } = q.data
  // Latest upload per type first (older replaced uploads kept for the record)
  const latest = Object.values(docs.reduce<Record<string, Doc>>((acc, d) => { acc[d.doc_type] ??= d; return acc }, {}))
  const canDecide = p.kyc_status !== 'approved' && p.kyc_status !== 'not_submitted'

  return (
    <>
      <PageHeader
        back={<Link to="/customers" className="mb-2 inline-flex items-center gap-1 text-sm text-ink-2 hover:text-ink"><ArrowLeft size={14} /> Customers</Link>}
        title={<span className="flex items-center gap-3">{p.full_name ?? 'Unnamed customer'} <Chip meta={KYC_STATUS[p.kyc_status]} />{!p.is_active && <Chip tone="grey">Inactive</Chip>}</span>}
        description={<span className="num">{formatPhone(p.phone)} · joined {formatDate(p.created_at, true)}</span>}
        actions={<>
          {p.is_active
            ? <Button variant="danger" onClick={() => setDecision('deactivate')}>Deactivate</Button>
            : <Button onClick={() => setDecision('activate')}>Activate</Button>}
          {canDecide && <Button variant="danger" onClick={() => setDecision('reject')}>Reject KYC</Button>}
          {canDecide && <Button variant="primary" onClick={() => setDecision('approve')}>Approve KYC</Button>}
        </>}
      />

      {p.deletion_requested_at && <div className="mb-4"><ErrorNote error={`Customer asked to delete their account on ${formatDate(p.deletion_requested_at, true)}. Close any open rental, then process the request.`} /></div>}
      {p.kyc_status === 'rejected' && p.kyc_reject_reason && <div className="mb-4 rounded-md border border-line bg-surface px-4 py-3 text-base"><span className="text-ink-2">Rejection reason: </span>{p.kyc_reject_reason}</div>}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[360px_1fr]">
        <Card title="Profile">
          <div className="mb-4 flex items-center gap-3">
            <div className="size-14 overflow-hidden rounded-full bg-tint">
              {photo.data && <img src={photo.data} alt="" className="h-full w-full object-cover" />}
            </div>
            <div>
              <p className="font-medium">{p.full_name}</p>
              <p className="text-sm text-ink-2">{p.delivery_platform ? PLATFORM_LABEL[p.delivery_platform] : 'Platform not set'}</p>
            </div>
          </div>
          <DefList items={[
            ['Phone', <span className="num">{formatPhone(p.phone)}</span>],
            ['Address', p.address],
            ['Emergency contact', p.emergency_contact_name ? <>{p.emergency_contact_name}<br /><span className="num">{formatPhone(p.emergency_contact_phone)}</span></> : null],
            ['Consent given', p.consent_at ? formatDateTime(p.consent_at) : 'No'],
          ]} />
        </Card>

        <Card title="Documents" actions={latest.length > 0 && <Button size="sm" onClick={() => setViewer(0)}>Review all</Button>}>
          {latest.length === 0 ? <EmptyState icon={FileText} title="No documents uploaded" body="The customer hasn't uploaded any documents yet." /> : (
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              {latest.map((d, i) => <DocThumb key={d.id} doc={d} onOpen={() => setViewer(i)} />)}
            </div>
          )}
          {docs.length > latest.length && <p className="mt-3 text-xs text-muted">{docs.length - latest.length} older upload(s) kept for the record.</p>}
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card title="Rentals" pad={false}>
          {rentals.length === 0 ? <p className="px-4 py-6 text-base text-ink-2">No rentals yet.</p> : (
            <table className="w-full text-sm">
              <thead><tr className="border-b border-line text-left text-ink-2"><th className="h-9 px-4 font-medium">Scooter</th><th className="px-4 font-medium">Started</th><th className="px-4 font-medium">Next due</th><th className="px-4 font-medium">Status</th></tr></thead>
              <tbody>{rentals.map((r) => (
                <tr key={r.id} className="border-b border-line last:border-0 hover:bg-canvas">
                  <td className="h-11 px-4"><Link className="font-medium text-brand-press hover:underline" to={`/rentals/${r.id}`}>{r.scooter?.code}</Link> <span className="text-ink-2">{r.scooter?.model}</span></td>
                  <td className="num px-4">{formatDate(r.start_date)}</td>
                  <td className="num px-4">{formatDate(r.next_due_date)}</td>
                  <td className="px-4"><Chip meta={RENTAL_STATUS[r.status]} /></td>
                </tr>))}
              </tbody>
            </table>
          )}
        </Card>
        <Card title="Payments" pad={false}>
          {payments.length === 0 ? <p className="px-4 py-6 text-base text-ink-2">No payments yet.</p> : (
            <table className="w-full text-sm">
              <thead><tr className="border-b border-line text-left text-ink-2"><th className="h-9 px-4 font-medium">Date</th><th className="px-4 font-medium">Method</th><th className="px-4 text-right font-medium">Amount</th><th className="px-4 font-medium">Status</th></tr></thead>
              <tbody>{payments.map((x) => (
                <tr key={x.id} className="border-b border-line last:border-0">
                  <td className="num h-11 px-4">{formatDate(x.paid_at ?? x.created_at, true)}</td>
                  <td className="px-4">{PAYMENT_METHOD_LABEL[x.method]}</td>
                  <td className="num px-4 text-right">{formatINR(x.amount)}</td>
                  <td className="px-4"><Chip meta={PAYMENT_STATUS[x.status]} /></td>
                </tr>))}
              </tbody>
            </table>
          )}
        </Card>
      </div>

      {viewer !== null && latest[viewer] && <DocViewer docs={latest} index={viewer} onIndex={setViewer} onClose={() => setViewer(null)} />}

      <Confirm open={decision === 'approve'} title="Approve this customer?" confirmLabel="Approve"
        body="They'll get a notification and can request a scooter. Aadhaar, PAN and driving licence must be approved first."
        loading={act.isPending} onConfirm={() => act.mutate()} onClose={() => setDecision(null)} />
      <Confirm open={decision === 'reject'} title="Reject verification?" confirmLabel="Reject" danger
        body="The customer will see this reason and can upload documents again." loading={act.isPending}
        onConfirm={() => reason.trim() ? act.mutate() : toast('error', 'Add a reason first')} onClose={() => setDecision(null)}>
        <Field label="Reason" htmlFor="reason"><Textarea id="reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Driving licence has expired" /></Field>
      </Confirm>
      <Confirm open={decision === 'deactivate' || decision === 'activate'} title={decision === 'deactivate' ? 'Deactivate this account?' : 'Activate this account?'}
        confirmLabel={decision === 'deactivate' ? 'Deactivate' : 'Activate'} danger={decision === 'deactivate'}
        body={decision === 'deactivate' ? "They won't be able to request scooters. Existing records are kept." : 'They can use the app again.'}
        loading={act.isPending} onConfirm={() => act.mutate()} onClose={() => setDecision(null)} />
    </>
  )
}
