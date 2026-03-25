import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        this.props.fallback ?? (
          <div className="flex flex-col items-center justify-center h-full p-8 text-destructive gap-2">
            <p className="font-semibold">Something went wrong.</p>
            <p className="text-sm text-muted-foreground">Please refresh the page.</p>
          </div>
        )
      );
    }
    return this.props.children;
  }
}
