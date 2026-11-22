import React from 'react';

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      message: error?.message || 'An unexpected interface error occurred.',
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('VIRAASAT UI ErrorBoundary:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#FAF7F2] flex items-center justify-center p-6">
          <div className="max-w-lg w-full bg-[#F3ECE1] border border-[#DFD3C0] p-8 text-center">
            <p className="text-xs tracking-widest uppercase text-[#A67C37] mb-2">
              VIRAASAT Concierge
            </p>
            <h1 className="font-display text-3xl text-[#231B17] mb-3">
              Something interrupted your viewing
            </h1>
            <p className="text-sm text-[#6E5F54] mb-6 break-words">
              {this.state.message}
            </p>
            <button
              type="button"
              onClick={() => this.setState({ hasError: false, message: '' })}
              className="px-6 py-2.5 bg-[#6B1D2A] text-[#FAF7F2] text-sm font-medium hover:bg-[#52141F] transition-colors"
            >
              Return to Gallery
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
