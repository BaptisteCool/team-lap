import React from 'react'

type SliderErrorBoundaryProps = {
  children: React.ReactNode
  onError?: (error: Error) => void
}

type SliderErrorBoundaryState = {
  hasError: boolean
}

export class SliderErrorBoundary extends React.Component<SliderErrorBoundaryProps, SliderErrorBoundaryState> {
  constructor(props: SliderErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(): SliderErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: Error): void {
    this.props.onError?.(error)
  }

  render(): React.ReactNode {
    if (this.state.hasError) return null
    return this.props.children
  }
}
