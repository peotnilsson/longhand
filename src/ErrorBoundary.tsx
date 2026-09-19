import { Component, type ErrorInfo, type ReactNode } from 'react'
import { STORE_KEY } from './store'
import { buildStamp } from './build'
import { ISSUES_URL } from './analytics'

/**
 * What a crash is allowed to look like.
 *
 * A blank white page is the worst outcome this app has, because everything the
 * user has written is still sitting in localStorage and they have no way to
 * know that. This has already happened once in development, which is the whole
 * reason the boundary exists.
 *
 * So the rule here is: never touch React state to recover. The store is read
 * straight out of localStorage, because whatever broke may well be the state
 * itself — and the export button has to work even then.
 */

interface State {
  error: Error | null
  details: string
}

const download = (contents: string, filename: string): void => {
  const url = URL.createObjectURL(new Blob([contents], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null, details: '' }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Kept for the report, not shown by default: a stack trace is frightening
    // and unhelpful to somebody who just wants their beam calculation back.
    this.setState({
      details: `${error.stack ?? error.message}\n\nComponents:${info.componentStack ?? ''}`,
    })
  }

  private rawStore(): string | null {
    try {
      return localStorage.getItem(STORE_KEY)
    } catch {
      return null
    }
  }

  private exportBackup = (): void => {
    const raw = this.rawStore()
    if (!raw) return
    download(raw, `longhand-recovered-${new Date().toISOString().slice(0, 10)}.json`)
  }

  private report = (): void => {
    const body = [
      'What I was doing when it broke:',
      '',
      '',
      '---',
      buildStamp(),
      '',
      '```',
      this.state.details.slice(0, 2500),
      '```',
    ].join('\n')
    const url = `${ISSUES_URL}/new?title=${encodeURIComponent(
      `Crash: ${this.state.error?.message?.slice(0, 60) ?? 'unknown'}`,
    )}&body=${encodeURIComponent(body)}`
    window.open(url, '_blank', 'noreferrer')
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children

    const hasStore = this.rawStore() !== null

    return (
      <div className="crash">
        <div className="crash-inner">
          <h1>Longhand has stopped.</h1>
          <p>
            Something in the app threw an error and the page could not finish drawing. This is a
            bug in Longhand, not a mistake in your calculation.
          </p>
          {hasStore ? (
            <p>
              <strong>Your work is still here.</strong> It is saved in this browser, not in the
              part that broke. Export it before doing anything else — then reload, and if the
              page still will not open, restore that file from Settings → Data in a fresh tab.
            </p>
          ) : (
            <p>
              This browser is not letting Longhand read its storage, so there is nothing to
              export from here.
            </p>
          )}

          <div className="crash-actions">
            {hasStore && (
              <button className="primary" onClick={this.exportBackup}>
                Export a backup
              </button>
            )}
            <button onClick={() => window.location.reload()}>Reload the page</button>
            <button onClick={this.report}>Report this</button>
          </div>

          <details>
            <summary>What went wrong</summary>
            <pre>{this.state.details || this.state.error.message}</pre>
          </details>

          <p className="crash-foot">{buildStamp()}</p>
        </div>
      </div>
    )
  }
}
