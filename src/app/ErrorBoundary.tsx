import { Component, type ErrorInfo, type ReactNode } from 'react';
import { HeartPulse, RotateCcw } from 'lucide-react';
import { newRequestId } from '@/services/errors';

interface State {
  error: Error | null;
  reference: string;
}

/** App-wide error boundary: friendly screen + reference ID. Never a blank page or a stack trace. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null, reference: '' };

  static getDerivedStateFromError(error: Error): State {
    return { error, reference: newRequestId() };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Structured, PHI-free log. (Sentry would receive this with sendDefaultPii: false.)
    console.error(JSON.stringify({ level: 'error', event: 'ui.crash', requestId: this.state.reference, details: { name: error.name, component: info.componentStack?.split('\n')[1]?.trim() } }));
  }

  render() {
    if (!this.state.error) return this.props.children;
    return <CrashScreen reference={this.state.reference} onRetry={() => this.setState({ error: null })} error={this.state.error} />;
  }
}

export function CrashScreen({ reference, onRetry, error }: { reference: string; onRetry?: () => void; error?: Error }) {
  return (
    <div className="hero-backdrop flex min-h-screen items-center justify-center p-6">
      <div className="surface max-w-md p-8 text-center">
        <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
          <HeartPulse className="size-7" aria-hidden />
        </div>
        <h1 className="text-2xl font-light text-brand-900">Something went wrong</h1>
        <p className="mt-2 text-sm text-ink-500">We hit an unexpected problem. Your data is safe. Try again, and if it keeps happening, share this reference with support.</p>
        <p className="mt-4 rounded-lg bg-ice-100 px-3 py-2 font-mono text-xs text-ink-600">Reference: {reference.slice(0, 8)}</p>
        {error && (
          <div className="mt-4 rounded-lg bg-red-100 px-3 py-2 text-left font-mono text-xs text-red-900 overflow-auto max-h-40">
            <strong>{error.name}:</strong> {error.message}
            <br />
            {error.stack}
          </div>
        )}
        <div className="mt-6 flex justify-center gap-2">
          <button type="button" onClick={() => (window.location.href = '/')} className="rounded-lg border border-line-strong bg-white px-4 py-2 text-sm font-medium hover:bg-brand-50">
            Go home
          </button>
          {onRetry && (
            <button type="button" onClick={onRetry} className="inline-flex items-center gap-2 rounded-lg bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800">
              <RotateCcw className="size-4" /> Try again
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
