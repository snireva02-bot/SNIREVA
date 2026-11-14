import { useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Camera, FileDown, ImagePlus, PauseCircle, PlayCircle, Undo2, Trash2, ClipboardCheck } from 'lucide-react'
import {
  daysUntil, formatDate, formatDateTime, formatINR, formatPhone, PAYMENT_METHOD_LABEL, PAYMENT_STATUS,
  PAYMENT_TYPE_LABEL, RENTAL_STATUS,
} from '@snireva/shared'
import { must, signedUrl, supabase, type Enums, type Tables } from '@/lib/supabase'
import {
  Button, Card, Checkbox, Chip, Confirm, DefList, Drawer, ErrorNote, Field, IconButton, Input, PageHeader, Select,
  Skeleton, Stat, Textarea, useToast,
} from '@/components/ui'
import { RecordPaymentDrawer } from '@/components/RecordPayment'

type Rental = Tables<'rentals'> & {
  customer: Pick<Tables<'profiles'>, 'id' | 'full_name' | 'phone'> | null
  scooter: Pick<Tables<'scooters'>, 'id' | 'code' | 'model' | 'chassis_no' | 'battery_no'> | null
  pickup: { name: string } | null
}

function useSigned(bucket: string, path?: string | null) {
  return useQuery({ queryKey: ['signed', bucket, path], enabled: !!path, staleTime: 45 * 60_000, queryFn: () => signedUrl(bucket, path) })
}

function SignedImage({ bucket, path, className }: { bucket: string; path: string; className?: string }) {
  const { data } = useSigned(bucket, path)
  return data ? <a href={data} target="_blank" rel="noreferrer"><img src={data} alt="" className={className} loading="lazy" /></a> : <Skeleton className={className} />
}

/* ------------------------------------------------------------------ Checklist drawer (handover + return) */
function ChecklistDrawer({ rental, kind, open, onClose, outstanding }: {
  rental: Rental; kind: Enums<'handover_kind'>; open: boolean; onClose: () => void; outstanding: number
}) {
  const qc = useQueryClient()
  const toast = useToast()
  const [c, setC] = useState({ scooter_condition: 'Good', battery_condition: '', charger_ok: true, accessories: '', damage_notes: '', customer_ack: false })
  const [photos, setPhotos] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
  const [collectDeposit, setCollectDeposit] = useState(true)
  const [collectFirst, setCollectFirst] = useState(true)
  const [method, setMethod] = useState<Enums<'payment_method'>>('cash')
  const [nextStatus, setNextStatus] = useState<'available' | 'under_maintenance'>('available')
  const [settlement, setSettlement] = useState('')

  async function addPhotos(files: FileList | null) {
    if (!files?.length) return
    setUploading(true)
    try {
      for (const f of Array.from(files)) {
        const path = `${rental.user_id}/${rental.id}/${kind}-${Date.now()}-${f.name.replace(/[^a-z0-9.]+/gi, '-')}`
        const { error } = await supabase.storage.from('handover').upload(path, f, { contentType: f.type })
        if (error) throw error
        setPhotos((p) => [...p, path])
      }
    } catch (e) { toast('error', (e as Error).message) } finally { setUploading(false) }
  }

  const submit = useMutation({
    mutationFn: async () => {
      const checklist = { ...c, photo_paths: photos }
      if (kind === 'handover') {
        return must(await supabase.rpc('complete_handover', {
          p_rental: rental.id, p_checklist: checklist, p_collect_deposit: collectDeposit, p_collect_first_week: collectFirst, p_method: method,
        }))
      }
      return must(await supabase.rpc('complete_return', {
        p_rental: rental.id, p_checklist: checklist, p_scooter_status: nextStatus, p_settlement_note: settlement || undefined,
      }))
    },
    onSuccess: () => {
      toast('ok', kind === 'handover' ? 'Handover complete. Rental is active.' : 'Return recorded. Rental closed.')
      qc.invalidateQueries({ queryKey: ['rental', rental.id] })
      qc.invalidateQueries({ queryKey: ['rentals'] })
      onClose()
    },
    onError: (e) => toast('error', (e as Error).message),
  })

  const set = (k: keyof typeof c) => (e: { target: { value: string } }) => setC((x) => ({ ...x, [k]: e.target.value }))
  return (
    <Drawer open={open} onClose={onClose} width={560} title={kind === 'handover' ? `Handover · ${rental.scooter?.code}` : `Return · ${rental.scooter?.code}`}
      footer={<>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" loading={submit.isPending} disabled={kind === 'handover' && !c.customer_ack} onClick={() => submit.mutate()}>
          {kind === 'handover' ? 'Complete handover' : 'Complete return'}
        </Button>
      </>}>
      <div className="flex flex-col gap-4">
        {kind === 'return' && (
          <div className={`rounded-md border px-4 py-3 ${outstanding > 0 ? 'border-bad/30 bg-bad-bg' : 'border-line bg-canvas'}`}>
            <p className="text-sm text-ink-2">Outstanding balance</p>
            <p className={`num text-xl font-semibold ${outstanding > 0 ? 'text-bad' : ''}`}>{formatINR(outstanding)}</p>
            {outstanding > 0 && <p className="mt-1 text-sm text-ink-2">Record the payment first, or explain how it was settled below.</p>}
          </div>
        )}
        <div className="grid grid-cols-2 gap-4">
          <Field label="Scooter condition" htmlFor="sc">
            <Select id="sc" value={c.scooter_condition} onChange={set('scooter_condition')}>
              {['Good', 'Minor scratches', 'Damaged'].map((o) => <option key={o}>{o}</option>)}
            </Select>
          </Field>
          <Field label="Battery (charge / health)" htmlFor="bc"><Input id="bc" value={c.battery_condition} onChange={set('battery_condition')} placeholder="e.g. 95%, healthy" /></Field>
        </div>
        <Field label="Accessories" htmlFor="acc"><Input id="acc" value={c.accessories} onChange={set('accessories')} placeholder="e.g. Helmet, phone holder, keys ×2" /></Field>
        <Checkbox label="Charger handed over and working" checked={c.charger_ok} onChange={(v) => setC((x) => ({ ...x, charger_ok: v }))} />
        <Field label="Damage notes" htmlFor="dn"><Textarea id="dn" rows={2} value={c.damage_notes} onChange={set('damage_notes')} placeholder="Describe any scratches, dents or missing parts" /></Field>
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">Photos</span>
          <div className="grid grid-cols-4 gap-2">
            {photos.map((p) => (
              <div key={p} className="group relative aspect-square overflow-hidden rounded-md border border-line">
                <SignedImage bucket="handover" path={p} className="h-full w-full object-cover" />
                <IconButton icon={Trash2} label="Remove photo" onClick={() => setPhotos((x) => x.filter((y) => y !== p))} className="absolute right-1 top-1 bg-surface/90" />
              </div>
            ))}
            <label className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed border-line-strong text-sm text-ink-2 hover:bg-canvas">
              <ImagePlus size={20} aria-hidden />{uploading ? 'Uploading…' : 'Add'}
              <input type="file" accept="image/*" multiple capture="environment" className="sr-only" onChange={(e) => addPhotos(e.target.files)} />
            </label>
          </div>
        </div>

        {kind === 'handover' ? (
          <fieldset className="flex flex-col gap-3 rounded-md border border-line p-4">
            <legend className="px-1 text-sm font-medium">Collected now</legend>
            <Checkbox label={`Deposit ${formatINR(rental.deposit_amount)}`} checked={collectDeposit} onChange={setCollectDeposit} />
            <Checkbox label={`First week rent ${formatINR(rental.weekly_rent)}`} checked={collectFirst} onChange={setCollectFirst} />
            {(collectDeposit || collectFirst) && (
              <Field label="Payment method" htmlFor="pm">
                <Select id="pm" value={method} onChange={(e) => setMethod(e.target.value as Enums<'payment_method'>)}>
                  {(['cash', 'offline_upi', 'bank'] as const).map((m) => <option key={m} value={m}>{PAYMENT_METHOD_LABEL[m]}</option>)}
                </Select>
              </Field>
            )}
          </fieldset>
        ) : (
          <>
            <Field label="Scooter after return" htmlFor="ns">
              <Select id="ns" value={nextStatus} onChange={(e) => setNextStatus(e.target.value as typeof nextStatus)}>
                <option value="available">Available for next rental</option>
                <option value="under_maintenance">Send for maintenance</option>
              </Select>
            </Field>
            {outstanding > 0 && (
              <Field label="Settlement note" htmlFor="sn" hint="Required when a balance is still outstanding.">
                <Textarea id="sn" rows={2} value={settlement} onChange={(e) => setSettlement(e.target.value)} placeholder="e.g. Adjusted ₹1,820 from deposit" />
              </Field>
            )}
          </>
        )}
        <Checkbox label="Customer checked this with me and agrees" checked={c.customer_ack} onChange={(v) => setC((x) => ({ ...x, customer_ack: v }))} />
      </div>
    </Drawer>
  )
}

function Section({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  return <Card title={title} actions={actions}>{children}</Card>
}

export function RentalDetail() {
  const { id = '' } = useParams()
  const qc = useQueryClient()
  const toast = useToast()
  const [drawer, setDrawer] = useState<'handover' | 'return' | 'payment' | null>(null)
  const [confirm, setConfirm] = useState<'terminate' | 'hold' | 'release' | null>(null)
  const [reason, setReason] = useState('')
  const [showTerms, setShowTerms] = useState(false)

  const q = useQuery({
    queryKey: ['rental', id],
    queryFn: async () => {
      const [rental, agreement, records, payments, due] = await Promise.all([
        supabase.from('rentals').select('*, customer:profiles!rentals_user_id_fkey(id, full_name, phone), scooter:scooters(id, code, model, chassis_no, battery_no), pickup:pickup_locations(name)').eq('id', id).single(),
        supabase.from('agreements').select('*').eq('rental_id', id).maybeSingle(),
        supabase.from('handover_records').select('*, by:profiles!handover_records_recorded_by_fkey(full_name)').eq('rental_id', id).order('created_at'),
        supabase.from('payments').select('*, by:profiles!payments_recorded_by_fkey(full_name)').eq('rental_id', id).order('created_at', { ascending: false }),
        supabase.rpc('rental_amount_due', { p_rental: id }),
      ])
      if (agreement.error) throw agreement.error
      return {
        rental: must(rental) as unknown as Rental, agreement: agreement.data, records: must(records), payments: must(payments),
        due: (must(due) as unknown as { rent: number; late_fee: number; total: number; outstanding: number; days_late: number; weeks_due: number }[])[0],
      }
    },
  })

  const act = useMutation({
    mutationFn: async () => {
      if (confirm === 'terminate') return must(await supabase.rpc('terminate_rental', { p_rental: id, p_reason: reason, p_scooter_status: 'available' }))
      return must(await supabase.rpc('set_renewal_block', { p_rental: id, p_blocked: confirm === 'hold', p_reason: reason || undefined }))
    },
    onSuccess: () => {
      toast('ok', confirm === 'terminate' ? 'Rental terminated' : confirm === 'hold' ? 'Renewal put on hold' : 'Renewal allowed again')
      setConfirm(null); setReason('')
      qc.invalidateQueries({ queryKey: ['rental', id] }); qc.invalidateQueries({ queryKey: ['rentals'] })
    },
    onError: (e) => toast('error', (e as Error).message),
  })

  const sig = useSigned('agreements', q.data?.agreement?.signature_path)
  const pdf = useSigned('agreements', q.data?.agreement?.pdf_path)

  if (q.isPending) return <div className="flex flex-col gap-4"><Skeleton className="h-8 w-72" /><Skeleton className="h-28 w-full" /><Skeleton className="h-64 w-full" /></div>
  if (q.error) return <ErrorNote error={q.error} onRetry={() => q.refetch()} />
  const { rental: r, agreement, records, payments, due } = q.data
  const live = r.status === 'active' || r.status === 'overdue'
  const closed = r.status === 'returned' || r.status === 'terminated'
  const d = r.next_due_date ? daysUntil(r.next_due_date) : null

  return (
    <>
      <PageHeader
        back={<Link to="/rentals" className="mb-2 inline-flex items-center gap-1 text-sm text-ink-2 hover:text-ink"><ArrowLeft size={14} /> Rentals</Link>}
        title={<span className="flex items-center gap-3">{r.scooter?.code} · {r.customer?.full_name}<Chip meta={RENTAL_STATUS[r.status]} />{r.renewal_blocked && <Chip tone="red">Renewal on hold</Chip>}</span>}
        description={<span className="num">{r.scooter?.model} · <Link className="text-brand-press hover:underline" to={`/customers/${r.customer?.id}`}>{formatPhone(r.customer?.phone)}</Link>{r.pickup ? ` · ${r.pickup.name}` : ''}</span>}
        actions={<>
          {!closed && <Button variant="danger" onClick={() => setConfirm('terminate')}>Terminate</Button>}
          {live && (r.renewal_blocked
            ? <Button icon={PlayCircle} onClick={() => setConfirm('release')}>Allow renewal</Button>
            : <Button icon={PauseCircle} onClick={() => setConfirm('hold')}>Hold renewal</Button>)}
          {live && <Button icon={Undo2} onClick={() => setDrawer('return')}>Record return</Button>}
          {live && <Button variant="primary" onClick={() => setDrawer('payment')}>Record payment</Button>}
          {r.status === 'pending_handover' && <Button variant="primary" icon={ClipboardCheck} onClick={() => setDrawer('handover')}>Start handover</Button>}
        </>}
      />

      {r.status === 'pending_agreement' && <div className="mb-4 rounded-md border border-line bg-warn-bg px-4 py-3 text-base text-warn">Waiting for the customer to sign the agreement in the app.</div>}
      {r.renewal_blocked && <div className="mb-4 rounded-md border border-bad/30 bg-bad-bg px-4 py-3 text-base text-bad">Renewal on hold: {r.renewal_block_reason}. The customer can't pay online until you allow renewal.</div>}

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Next due" value={live ? formatDate(r.next_due_date) : '—'}
          sub={live && d !== null ? (d < 0 ? `${-d} days late` : d === 0 ? 'Due today' : `In ${d} days`) : undefined}
          tone={live && d !== null && d < 0 ? 'red' : live && d !== null && d <= 2 ? 'amber' : undefined} />
        <Stat label="Outstanding" value={formatINR(due?.outstanding ?? 0)} tone={(due?.outstanding ?? 0) > 0 ? 'red' : undefined}
          sub={(due?.late_fee ?? 0) > 0 ? `Includes ${formatINR(due.late_fee)} late fee` : undefined} />
        <Stat label="Weekly rent" value={formatINR(r.weekly_rent)} sub="Fixed at rental start" />
        <Stat label="Deposit" value={formatINR(r.deposit_amount)} sub={r.start_date ? `Started ${formatDate(r.start_date, true)}` : 'Not started'} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_380px]">
        <div className="flex flex-col gap-4">
          <Section title="Payments">
            {payments.length === 0 ? <p className="text-base text-ink-2">No payments yet.</p> : (
              <div className="-m-4 overflow-x-auto">
                <table className="w-full text-sm whitespace-nowrap">
                  <thead><tr className="border-b border-line text-left text-ink-2">
                    <th className="h-9 px-4 font-medium">Date</th><th className="px-4 font-medium">Type</th><th className="px-4 font-medium">Period</th>
                    <th className="px-4 font-medium">Method</th><th className="px-4 text-right font-medium">Amount</th><th className="px-4 font-medium">Status</th><th className="px-4 font-medium">Receipt</th>
                  </tr></thead>
                  <tbody>{payments.map((p) => (
                    <tr key={p.id} className="border-b border-line last:border-0">
                      <td className="num h-11 px-4">{formatDate(p.paid_at ?? p.created_at, true)}</td>
                      <td className="px-4">{PAYMENT_TYPE_LABEL[p.type]}</td>
                      <td className="num px-4 text-ink-2">{p.period_start ? `${formatDate(p.period_start)} – ${formatDate(p.period_end)}` : '—'}</td>
                      <td className="px-4">{PAYMENT_METHOD_LABEL[p.method]}{p.by?.full_name ? <span className="block text-xs text-muted">by {p.by.full_name}</span> : null}</td>
                      <td className="num px-4 text-right">{formatINR(p.amount)}</td>
                      <td className="px-4"><Chip meta={PAYMENT_STATUS[p.status]} /></td>
                      <td className="num px-4 text-ink-2">{p.receipt_no ?? '—'}</td>
                    </tr>))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          <Section title="Handover and return">
            {records.length === 0 ? <p className="text-base text-ink-2">{r.status === 'pending_handover' ? 'Handover not done yet.' : 'No records yet.'}</p> : (
              <div className="flex flex-col gap-5">
                {records.map((h) => (
                  <div key={h.id} className="flex flex-col gap-3 border-b border-line pb-5 last:border-0 last:pb-0">
                    <p className="flex items-center gap-2 font-medium"><Camera size={16} className="text-ink-2" aria-hidden />{h.kind === 'handover' ? 'Handover' : 'Return'} · <span className="num font-normal text-ink-2">{formatDateTime(h.created_at)}{h.by?.full_name ? ` by ${h.by.full_name}` : ''}</span></p>
                    <DefList items={[
                      ['Scooter', h.scooter_condition], ['Battery', h.battery_condition], ['Charger', h.charger_ok ? 'OK' : 'Missing / faulty'],
                      ['Accessories', h.accessories], ['Damage notes', h.damage_notes],
                      ...(h.kind === 'return' ? [['Outstanding at return', formatINR(h.outstanding_amount)] as [string, ReactNode]] : []),
                      ['Customer acknowledged', h.customer_ack_at ? formatDateTime(h.customer_ack_at) : 'No'],
                    ]} />
                    {h.photo_paths.length > 0 && <div className="grid grid-cols-6 gap-2">{h.photo_paths.map((p) => <SignedImage key={p} bucket="handover" path={p} className="aspect-square w-full rounded-md object-cover" />)}</div>}
                  </div>
                ))}
              </div>
            )}
          </Section>
        </div>

        <Section title="Agreement" actions={pdf.data && <a href={pdf.data} target="_blank" rel="noreferrer"><Button size="sm" icon={FileDown}>PDF</Button></a>}>
          {!agreement ? <p className="text-base text-ink-2">Not signed yet.</p> : (
            <div className="flex flex-col gap-4">
              <DefList items={[
                ['Signed', formatDateTime(agreement.signed_at)],
                ['Template', `Version ${agreement.version}`],
                ['Terms hash', <span className="num break-all text-xs text-ink-2">{agreement.terms_hash}</span>],
                ['PDF', agreement.pdf_path ? 'Ready' : 'Being generated'],
              ]} />
              {sig.data && <div><p className="mb-1 text-sm text-ink-2">Signature</p><img src={sig.data} alt="Customer signature" className="h-20 rounded-md border border-line bg-white object-contain p-2" /></div>}
              <Button size="sm" variant="ghost" onClick={() => setShowTerms((x) => !x)}>{showTerms ? 'Hide terms' : 'Show signed terms'}</Button>
              {showTerms && <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-md bg-canvas p-3 font-sans text-sm text-ink">{(agreement.terms_snapshot as { body?: string }).body}</pre>}
            </div>
          )}
        </Section>
      </div>

      <ChecklistDrawer rental={r} kind="handover" open={drawer === 'handover'} onClose={() => setDrawer(null)} outstanding={0} />
      <ChecklistDrawer rental={r} kind="return" open={drawer === 'return'} onClose={() => setDrawer(null)} outstanding={Number(due?.outstanding ?? 0)} />
      <RecordPaymentDrawer open={drawer === 'payment'} onClose={() => setDrawer(null)} rentalId={r.id} defaultAmount={Number(due?.total || r.weekly_rent)}
        lateFee={Number(due?.late_fee ?? 0)} label={`${r.scooter?.code} · ${r.customer?.full_name}`} />

      <Confirm open={confirm === 'terminate'} title="Terminate this rental?" danger confirmLabel="Terminate" loading={act.isPending}
        body="The rental closes and the scooter becomes available. Use Record return instead if the scooter was returned normally."
        onConfirm={() => reason.trim() ? act.mutate() : toast('error', 'Add a reason')} onClose={() => setConfirm(null)}>
        <Field label="Reason (shown to the customer)" htmlFor="tr"><Textarea id="tr" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      </Confirm>
      <Confirm open={confirm === 'hold'} title="Hold renewal?" confirmLabel="Hold renewal" loading={act.isPending}
        body="The customer won't be able to pay for the next week until you allow it."
        onConfirm={() => reason.trim() ? act.mutate() : toast('error', 'Add a reason')} onClose={() => setConfirm(null)}>
        <Field label="Reason" htmlFor="hr"><Textarea id="hr" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Pending damage inspection" /></Field>
      </Confirm>
      <Confirm open={confirm === 'release'} title="Allow renewal?" confirmLabel="Allow" loading={act.isPending}
        body="The customer can pay for the next week again." onConfirm={() => act.mutate()} onClose={() => setConfirm(null)} />
    </>
  )
}
