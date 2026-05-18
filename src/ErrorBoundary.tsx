import { Component, type ErrorInfo, type ReactNode } from 'react'

type ErrorBoundaryProps = {
  children: ReactNode
}

type ErrorBoundaryState = {
  error: Error | null
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Sprite Character Creator render failure', error, info)
  }

  render() {
    if (!this.state.error) {
      return this.props.children
    }

    return (
      <main className="runtime-error" role="alert">
        <section>
          <p className="eyebrow">Runtime error</p>
          <h1>The creator could not finish rendering.</h1>
          <p>{this.state.error.message || 'An unexpected render error stopped the app.'}</p>
          <div className="button-row">
            <button type="button" onClick={() => this.setState({ error: null })}>Try again</button>
            <button type="button" onClick={() => window.location.reload()}>Reload app</button>
          </div>
        </section>
      </main>
    )
  }
}
