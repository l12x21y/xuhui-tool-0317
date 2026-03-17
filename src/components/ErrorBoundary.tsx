// @ts-nocheck
import { Component, type ErrorInfo, type ReactNode } from 'react';

type ErrorBoundaryState = {
  hasError: boolean;
  errorMessage: string;
};

type ErrorBoundaryProps = {
  children: ReactNode;
};

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    const message = error instanceof Error ? error.message : 'Unknown runtime error';
    return { hasError: true, errorMessage: message };
  }

  componentDidCatch(error: unknown, errorInfo: ErrorInfo) {
    console.error('App runtime error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 px-6">
          <div className="max-w-2xl w-full rounded-xl border border-rose-200 bg-white p-6 shadow-sm">
            <h1 className="text-xl font-semibold text-rose-700 mb-2">页面运行异常（已拦截）</h1>
            <p className="text-slate-700 mb-2">应用发生了前端运行时错误，已避免白屏。请刷新页面重试。</p>
            <p className="text-sm text-slate-500 break-all">错误信息：{this.state.errorMessage}</p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
