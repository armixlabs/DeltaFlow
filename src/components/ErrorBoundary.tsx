import { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI.
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
    this.setState({ error, errorInfo });
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '2rem', fontFamily: 'monospace', color: '#c7254e', backgroundColor: '#f9f2f4', border: '1px solid #d6d6d6', borderRadius: '4px', margin: '1rem' }}>
          <h1>Something went wrong.</h1>
          <p>This is a critical error that prevented the application from rendering. Please check the console for details, or see the error message below.</p>
          <details style={{ whiteSpace: 'pre-wrap', marginTop: '1rem', cursor: 'pointer' }}>
            <summary>Error Details</summary>
            {this.state.error && <p><strong>{this.state.error.toString()}</strong></p>}
            {this.state.errorInfo && <pre>{this.state.errorInfo.componentStack}</pre>}
          </details>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;

