import {
  createContext, forwardRef, useCallback, useContext, useEffect, useId, useRef, useState,
  type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'
import { Loader2, X, CheckCircle2, AlertCircle, type LucideIcon } from 'lucide-react'
import type { StatusMeta, Tone } from '@snireva/shared'

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')

/* ---------------------------------------------------------------- Button */
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: 'sm' | 'md'
  loading?: boolean
  icon?: LucideIcon
}
const variants: Record<Variant, string> = {
  primary: 'bg-brand text-white hover:bg-brand-hover active:bg-brand-press border border-brand',
  secondary: 'bg-surface text-ink border border-line-strong hover:bg-canvas',
  ghost: 'text-ink-2 hover:bg-canvas hover:text-ink border border-transparent',
  danger: 'bg-surface text-bad border border-line-strong hover:bg-bad-bg hover:border-bad/40',
}
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', loading, icon: Icon, className, children, disabled, ...rest }, ref,
) {
  return (
    <button
      ref={ref}
      type={rest.type ?? 'button'}
      disabled={disabled || loading}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-md font-medium whitespace-nowrap transition-colors duration-150 disabled:opacity-50',
        size === 'sm' ? 'h-8 px-3 text-sm' : 'h-9 px-4 text-base',
        variants[variant], className,
      )}
      {...rest}
    >
      {loading ? <Loader2 size={16} className="animate-spin" aria-hidden /> : Icon ? <Icon size={16} strokeWidth={1.75} aria-hidden /> : null}
      {children}
    </button>
  )
})

export function IconButton({ icon: Icon, label, className, ...rest }: { icon: LucideIcon; label: string } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" aria-label={label} title={label}
      className={cx('inline-flex size-8 items-center justify-center rounded-md text-ink-2 hover:bg-canvas hover:text-ink', className)} {...rest}>
      <Icon size={16} strokeWidth={1.75} aria-hidden />
    </button>
  )
}

/* ---------------------------------------------------------------- Form */
export function Field({ label, hint, error, children, htmlFor, required }: {
  label: string; hint?: string; error?: string | null; children: ReactNode; htmlFor?: string; required?: boolean
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium text-ink">
        {label}{required && <span className="text-bad" aria-hidden> *</span>}
      </label>
      {children}
      {error ? <p role="alert" className="text-xs text-bad">{error}</p> : hint ? <p className="text-xs text-muted">{hint}</p> : null}
    </div>
  )
}

const inputBase = 'h-9 w-full rounded-md border border-line-strong bg-surface px-3 text-base text-ink placeholder:text-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 disabled:bg-canvas disabled:text-muted'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...p }, ref) {
  return <input ref={ref} className={cx(inputBase, className)} {...p} />
})
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...p }, ref) {
  return <select ref={ref} className={cx(inputBase, 'pr-8', className)} {...p}>{children}</select>
})
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...p }, ref) {
  return <textarea ref={ref} className={cx(inputBase, 'h-auto min-h-20 py-2 leading-5', className)} {...p} />
})

export function Checkbox({ label, checked, onChange, id }: { label: string; checked: boolean; onChange: (v: boolean) => void; id?: string }) {
  const auto = useId()
  const cid = id ?? auto
  return (
    <label htmlFor={cid} className="inline-flex items-center gap-2 text-base text-ink select-none">
      <input id={cid} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)}
        className="size-4 rounded border-line-strong accent-brand" />
      {label}
    </label>
  )
}

/* ---------------------------------------------------------------- Status chip */
const toneCls: Record<Tone, string> = {
  green: 'bg-ok-bg text-ok',
  amber: 'bg-warn-bg text-warn',
  red: 'bg-bad-bg text-bad',
  grey: 'bg-neutral-bg text-neutral',
}
const dotCls: Record<Tone, string> = { green: 'bg-ok', amber: 'bg-warn', red: 'bg-bad', grey: 'bg-neutral' }
export function Chip({ meta, tone, children }: { meta?: StatusMeta; tone?: Tone; children?: ReactNode }) {
  const t = meta?.tone ?? tone ?? 'grey'
  return (
    <span className={cx('inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium whitespace-nowrap', toneCls[t])}>
      <span className={cx('size-1.5 rounded-full', dotCls[t])} aria-hidden />
      {meta?.label ?? children}
    </span>
  )
}

/* ---------------------------------------------------------------- Layout bits */
export function Card({ children, className, title, actions, pad = true }: {
  children: ReactNode; className?: string; title?: ReactNode; actions?: ReactNode; pad?: boolean
}) {
  return (
    <section className={cx('rounded-md border border-line bg-surface', className)}>
      {(title || actions) && (
        <header className="flex min-h-12 items-center justify-between gap-4 border-b border-line px-4 py-2">
          <h2 className="text-lg font-semibold">{title}</h2>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={pad ? 'p-4' : undefined}>{children}</div>
    </section>
  )
}

export function PageHeader({ title, description, actions, back }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; back?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {back}
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-base text-ink-2">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function DefList({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[minmax(120px,160px)_1fr] gap-x-4 gap-y-2.5 text-base">
      {items.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-ink-2">{k}</dt>
          <dd className="min-w-0 break-words text-ink">{v ?? '—'}</dd>
        </div>
      ))}
    </dl>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('skeleton h-4', className)} aria-hidden />
}

export function EmptyState({ icon: Icon, title, body, action }: { icon: LucideIcon; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <div className="mb-3 flex size-10 items-center justify-center rounded-md bg-tint text-brand">
        <Icon size={20} strokeWidth={1.75} aria-hidden />
      </div>
      <p className="text-lg font-semibold">{title}</p>
      {body && <p className="mt-1 max-w-sm text-base text-ink-2">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function ErrorNote({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  if (!error) return null
  return (
    <div role="alert" className="flex items-center justify-between gap-4 rounded-md border border-bad/30 bg-bad-bg px-4 py-3 text-base text-bad">
      <span className="flex items-center gap-2"><AlertCircle size={16} aria-hidden />{error instanceof Error ? error.message : String(error)}</span>
      {onRetry && <Button size="sm" variant="secondary" onClick={onRetry}>Retry</Button>}
    </div>
  )
}

export function Stat({ label, value, sub, tone, onClick }: { label: string; value: ReactNode; sub?: ReactNode; tone?: Tone; onClick?: () => void }) {
  const Comp = onClick ? 'button' : 'div'
  return (
    <Comp onClick={onClick} className={cx('flex flex-col items-start rounded-md border border-line bg-surface px-4 py-3 text-left', onClick && 'hover:border-line-strong')}>
      <span className="text-sm text-ink-2">{label}</span>
      <span className={cx('num mt-1 text-2xl font-semibold tracking-tight',
        tone === 'red' ? 'text-bad' : tone === 'amber' ? 'text-warn' : 'text-ink')}>{value}</span>
      {sub && <span className="num mt-0.5 text-xs text-muted">{sub}</span>}
    </Comp>
  )
}

/* ---------------------------------------------------------------- Modal (right drawer) */
export function Drawer({ open, onClose, title, children, footer, width = 480 }: {
  open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; width?: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    const first = ref.current?.querySelector<HTMLElement>('input,select,textarea,button:not([data-close])')
    first?.focus()
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined}>
      <div className="absolute inset-0 bg-ink/40" onClick={onClose} />
      <div ref={ref} style={{ width }} className="relative flex h-full max-w-full flex-col border-l border-line bg-surface">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-line px-5">
          <h2 className="text-lg font-semibold">{title}</h2>
          <IconButton icon={X} label="Close" onClick={onClose} data-close />
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
        {footer && <footer className="flex shrink-0 justify-end gap-2 border-t border-line px-5 py-3">{footer}</footer>}
      </div>
    </div>
  )
}

export function Confirm({ open, title, body, confirmLabel, danger, loading, onConfirm, onClose, children }: {
  open: boolean; title: string; body?: ReactNode; confirmLabel: string; danger?: boolean; loading?: boolean
  onConfirm: () => void; onClose: () => void; children?: ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="alertdialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-ink/40" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-md border border-line bg-surface p-5">
        <h2 className="text-lg font-semibold">{title}</h2>
        {body && <div className="mt-2 text-base text-ink-2">{body}</div>}
        {children && <div className="mt-4">{children}</div>}
        <div className="mt-5 flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button variant={danger ? 'danger' : 'primary'} loading={loading} onClick={onConfirm} autoFocus>{confirmLabel}</Button>
        </div>
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------- Toasts */
type ToastT = { id: number; kind: 'ok' | 'error'; text: string }
const ToastCtx = createContext<(kind: ToastT['kind'], text: string) => void>(() => {})
export const useToast = () => useContext(ToastCtx)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastT[]>([])
  const push = useCallback((kind: ToastT['kind'], text: string) => {
    const id = Date.now() + Math.random()
    setItems((x) => [...x, { id, kind, text }])
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), kind === 'error' ? 6000 : 3500)
  }, [])
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed bottom-4 right-4 z-[60] flex flex-col gap-2">
        {items.map((t) => (
          <div key={t.id} className="pointer-events-auto flex max-w-sm items-start gap-2 rounded-md border border-line bg-ink px-4 py-3 text-base text-white">
            {t.kind === 'ok'
              ? <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-[#7fd1a7]" aria-hidden />
              : <AlertCircle size={16} className="mt-0.5 shrink-0 text-[#f4a39a]" aria-hidden />}
            <span>{t.text}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}
