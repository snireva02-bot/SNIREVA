import { Component, type ReactNode } from 'react'

export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) { return { error } }
  componentDidCatch(error: Error) { console.error(error) }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="flex min-h-dvh items-center justify-center bg-canvas p-6">
        <div className="max-w-md rounded-md border border-line bg-surface p-6">
          <h1 className="text-xl font-semibold">Something went wrong</h1>
          <p className="mt-2 text-base text-ink-2">This page hit an unexpected error. Your data is safe. Reload to try again.</p>
          <pre className="mt-3 max-h-32 overflow-auto rounded-md bg-canvas p-2 text-xs text-ink-2">{this.state.error.message}</pre>
          <button type="button" onClick={() => window.location.reload()} className="mt-4 h-9 rounded-md bg-brand px-4 text-base font-medium text-white hover:bg-brand-hover">Reload</button>
        </div>
      </div>
    )
  }
}
