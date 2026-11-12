import { Component, type ReactNode } from "react";

interface Props { children: ReactNode; label?: string; onReset?: () => void }
interface State { error: Error | null; key: number }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, key: 0 };
  static getDerivedStateFromError(error: Error): Partial<State> { return { error }; }
  reset = () => { this.props.onReset?.(); this.setState((s) => ({ error: null, key: s.key + 1 })); };
  render() {
    if (this.state.error) {
      return (
        <div className="card error-card" role="alert">
          <h3>{this.props.label ?? "This section"} hit a problem</h3>
          <p className="muted">{this.state.error.message}</p>
          <button className="btn primary" onClick={this.reset}>Try again</button>
        </div>
      );
    }
    return <div key={this.state.key}>{this.props.children}</div>;
  }
}
