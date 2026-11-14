import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { formatINR, PAYMENT_METHOD_LABEL, PAYMENT_TYPE_LABEL } from '@snireva/shared'
import { must, supabase, type Enums } from '@/lib/supabase'
import { Button, Drawer, Field, Input, Select, Textarea, useToast } from './ui'

/** Staff records cash / offline UPI / bank payments. Who, when and how much go to the audit log. */
export function RecordPaymentDrawer({ open, onClose, rentalId, defaultAmount, lateFee, label }: {
  open: boolean; onClose: () => void; rentalId: string; defaultAmount: number; lateFee: number; label: string
}) {
  const qc = useQueryClient()
  const toast = useToast()
  const [type, setType] = useState<Enums<'payment_type'>>('rent')
  const [method, setMethod] = useState<Enums<'payment_method'>>('cash')
  const [amount, setAmount] = useState(String(defaultAmount))
  const [notes, setNotes] = useState('')

  useEffect(() => { if (open) { setType('rent'); setMethod('cash'); setAmount(String(defaultAmount)); setNotes('') } }, [open, defaultAmount])

  const save = useMutation({
    mutationFn: async () => must(await supabase.rpc('record_offline_payment', {
      p_rental: rentalId, p_amount: Number(amount), p_type: type, p_method: method, p_notes: notes || undefined,
    })),
    onSuccess: () => {
      toast('ok', `${formatINR(amount)} recorded. Receipt is being generated.`)
      qc.invalidateQueries({ queryKey: ['rental', rentalId] })
      qc.invalidateQueries({ queryKey: ['rentals'] })
      qc.invalidateQueries({ queryKey: ['payments'] })
      onClose()
    },
    onError: (e) => toast('error', (e as Error).message),
  })

  return (
    <Drawer open={open} onClose={onClose} title="Record payment"
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={save.isPending} disabled={!(Number(amount) > 0)} onClick={() => save.mutate()}>Record {formatINR(Number(amount) || 0)}</Button></>}>
      <div className="flex flex-col gap-4">
        <p className="text-base text-ink-2">{label}</p>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Type" htmlFor="pt">
            <Select id="pt" value={type} onChange={(e) => { const t = e.target.value as Enums<'payment_type'>; setType(t); if (t === 'rent') setAmount(String(defaultAmount)) }}>
              {(['rent', 'deposit', 'late_fee', 'other'] as const).map((t) => <option key={t} value={t}>{PAYMENT_TYPE_LABEL[t]}</option>)}
            </Select>
          </Field>
          <Field label="Method" htmlFor="pmethod">
            <Select id="pmethod" value={method} onChange={(e) => setMethod(e.target.value as Enums<'payment_method'>)}>
              {(['cash', 'offline_upi', 'bank'] as const).map((m) => <option key={m} value={m}>{PAYMENT_METHOD_LABEL[m]}</option>)}
            </Select>
          </Field>
        </div>
        <Field label="Amount (₹)" htmlFor="amt" hint={type === 'rent' ? `Due now ${formatINR(defaultAmount)}${lateFee > 0 ? ` incl. ${formatINR(lateFee)} late fee` : ''}. Rent moves the due date by 7 days.` : 'Does not change the due date.'}>
          <Input id="amt" inputMode="decimal" className="num" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} />
        </Field>
        <Field label="Notes" htmlFor="pnotes" hint="e.g. UPI reference number or who handed over the cash">
          <Textarea id="pnotes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </div>
    </Drawer>
  )
}
