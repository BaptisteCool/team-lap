import { Link } from '@tanstack/react-router'
import React from 'react'

export type DemoBannerProps = {
  subtitle?: string
}

export function DemoBanner({ subtitle = 'Course factice · lecture seule' }: DemoBannerProps): React.ReactElement {
  return (
    <div className="demo-banner" role="status">
      <span className="demo-banner-tag">DÉMO</span>
      <span className="demo-banner-title">24h Brette-les-Pins 2026</span>
      <span className="demo-banner-sub">{subtitle}</span>
      <nav className="demo-banner-nav">
        <Link to="/demo" className="demo-banner-link" activeOptions={{ exact: true }}>Home</Link>
        <Link to="/demo/admin" className="demo-banner-link">Admin</Link>
      </nav>
    </div>
  )
}
