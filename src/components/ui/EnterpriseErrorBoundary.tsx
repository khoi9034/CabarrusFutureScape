"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface EnterpriseErrorBoundaryProps {
  children: ReactNode;
  moduleName: string;
  resetKey?: string | number | null;
}

interface EnterpriseErrorBoundaryState {
  error: Error | null;
  resetKey?: string | number | null;
}

export class EnterpriseErrorBoundary extends Component<
  EnterpriseErrorBoundaryProps,
  EnterpriseErrorBoundaryState
> {
  state: EnterpriseErrorBoundaryState = {
    error: null,
    resetKey: this.props.resetKey,
  };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  static getDerivedStateFromProps(
    props: EnterpriseErrorBoundaryProps,
    state: EnterpriseErrorBoundaryState,
  ) {
    if (props.resetKey !== state.resetKey) {
      return {
        error: null,
        resetKey: props.resetKey,
      };
    }

    return null;
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[CFS ${this.props.moduleName}] render failure`, {
      error,
      componentStack: info.componentStack,
    });
  }

  reset = () => {
    this.setState({ error: null, resetKey: this.props.resetKey });
  };

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <section className="flex min-h-[12rem] items-center justify-center rounded-xl border border-amber-300/20 bg-amber-300/[0.055] p-4 text-amber-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
        <div className="max-w-md text-center">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg border border-amber-300/25 bg-amber-300/10 text-amber-100">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <h2 className="mt-3 text-sm font-semibold text-white">
            {this.props.moduleName} paused safely
          </h2>
          <p className="mt-2 text-xs leading-5 text-amber-100/75">
            This dashboard module hit a local rendering error. Other CFS
            modules remain available while this area is reset.
          </p>
          <button
            className="mt-3 inline-flex items-center justify-center gap-2 rounded-md border border-amber-300/25 bg-amber-300/10 px-3 py-2 text-xs font-semibold text-amber-50 transition hover:border-amber-300/40 hover:bg-amber-300/15 focus:outline-none focus:ring-2 focus:ring-amber-300/25"
            onClick={this.reset}
            type="button"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Retry module
          </button>
        </div>
      </section>
    );
  }
}
