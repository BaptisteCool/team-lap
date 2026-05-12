// Shared small components & helpers
const { useState, useEffect, useRef, useMemo, useCallback } = React;

// Lucide icon helper — lucide UMD exposes an `icons` map keyed by PascalCase
function Icon({ name, size = 18, strokeWidth = 2, ...rest }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current || !window.lucide) return;
    const node = ref.current;
    node.innerHTML = '';
    const iconObj = window.lucide.icons?.[name] || window.lucide[name];
    if (iconObj && typeof iconObj.toSvg === 'function') {
      node.innerHTML = iconObj.toSvg({ width: size, height: size, 'stroke-width': strokeWidth });
    } else if (window.lucide.createIcons) {
      // fallback: data-lucide
      const span = document.createElement('i');
      span.setAttribute('data-lucide', name.replace(/[A-Z]/g, (c, i) => (i === 0 ? c.toLowerCase() : '-' + c.toLowerCase())));
      node.appendChild(span);
      window.lucide.createIcons({ attrs: { width: size, height: size, 'stroke-width': strokeWidth } });
    }
  }, [name, size, strokeWidth]);
  return <span ref={ref} className="lucide" style={{ display: 'inline-flex', lineHeight: 0 }} {...rest} />;
}

function Avatar({ name, color, size = 56 }) {
  const initials = (name || '?').split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
  return (
    <div className="avatar"
         style={{ width: size, height: size, background: color || 'var(--accent)', fontSize: size * 0.36 }}>
      {initials}
    </div>
  );
}

function GpxMap({ height = 220, marker = null, progress = null, showLabel = true, markers = null }) {
  const { GPX_PATH, GPX_VIEWBOX, LAP_DISTANCE_M } = window.RACE_DATA;
  const pathRef = useRef(null);
  const [computedMarker, setComputedMarker] = useState(null);
  const [computedMulti, setComputedMulti] = useState([]);
  useEffect(() => {
    if (progress == null || !pathRef.current) { setComputedMarker(null); return; }
    const len = pathRef.current.getTotalLength();
    const p = ((progress % 1) + 1) % 1; // wrap into [0,1)
    const pt = pathRef.current.getPointAtLength(len * p);
    setComputedMarker({ x: pt.x, y: pt.y });
  }, [progress, GPX_PATH]);
  useEffect(() => {
    if (!Array.isArray(markers) || !pathRef.current) { setComputedMulti([]); return; }
    const len = pathRef.current.getTotalLength();
    const computed = markers.map(mk => {
      const p = ((mk.progress % 1) + 1) % 1;
      const pt = pathRef.current.getPointAtLength(len * p);
      return { ...mk, x: pt.x, y: pt.y };
    });
    setComputedMulti(computed);
  }, [markers, GPX_PATH]);
  const m = marker || computedMarker;
  return (
    <div className="map-wrap" style={{ height }}>
      <svg viewBox={GPX_VIEWBOX} preserveAspectRatio="xMidYMid meet" style={{ height: '100%', width: '100%' }}>
        <defs>
          <linearGradient id="trackGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%"  stopColor="oklch(0.86 0.20 135)" />
            <stop offset="100%" stopColor="oklch(0.78 0.18 160)" />
          </linearGradient>
          <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(255,255,255,0.025)" strokeWidth="1"/>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
        {/* shadow path */}
        <path d={GPX_PATH} fill="none" stroke="rgba(166,240,96,0.08)" strokeWidth="14" strokeLinecap="round" strokeLinejoin="round"/>
        <path ref={pathRef} d={GPX_PATH} fill="none" stroke="url(#trackGrad)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
        {/* GPX[0] · START_FINISH_CHECKPOINT — lat 47.915850 / lon 0.331450 */}
        <g transform="translate(99 121)">
          <line x1="-14" y1="0" x2="14" y2="0" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round"/>
          <circle r="9" fill="none" stroke="var(--accent)" strokeWidth="1.5" opacity="0.6">
            <animate attributeName="r" values="6;14;6" dur="1.8s" repeatCount="indefinite"/>
            <animate attributeName="opacity" values="0.7;0;0.7" dur="1.8s" repeatCount="indefinite"/>
          </circle>
          <circle r="3.5" fill="var(--accent)" stroke="var(--bg)" strokeWidth="1.5"/>
        </g>
        {m && (
          <g transform={`translate(${m.x} ${m.y})`} style={{ transition: 'transform 240ms linear' }}>
            <circle r="11" fill="var(--warn)" opacity="0.18">
              <animate attributeName="r" values="9;13;9" dur="1.6s" repeatCount="indefinite"/>
              <animate attributeName="opacity" values="0.25;0.05;0.25" dur="1.6s" repeatCount="indefinite"/>
            </circle>
            <circle r="5" fill="var(--warn)" stroke="var(--bg)" strokeWidth="2"/>
          </g>
        )}
        {computedMulti.map(mk => (
          <g key={mk.id} transform={`translate(${mk.x} ${mk.y})`} style={{ transition: 'transform 1s linear' }}>
            <circle r="10" fill={mk.color} opacity="0.18" />
            <circle r="5.5" fill={mk.color} stroke="var(--bg)" strokeWidth="2" />
            {mk.label && (
              <text x="9" y="-7" fill="var(--text)" fontSize="9" fontWeight="600"
                    style={{ paintOrder: 'stroke', stroke: 'var(--bg)', strokeWidth: 3, strokeLinejoin: 'round' }}>
                {mk.label}
              </text>
            )}
          </g>
        ))}
      </svg>
      {showLabel && (
        <div className="map-meta">{LAP_DISTANCE_M} m / tour · 56 pts GPX</div>
      )}
    </div>
  );
}

function Toast({ items }) {
  return (
    <div className="toast-stack">
      {items.map(t => (
        <div key={t.id} className="toast">
          <span className="toast-icon"><Icon name={t.icon || 'CheckCircle2'} size={18} /></span>
          <span>{t.text}</span>
        </div>
      ))}
    </div>
  );
}

function useToast() {
  const [items, setItems] = useState([]);
  const push = useCallback((text, icon) => {
    const id = Math.random().toString(36).slice(2);
    setItems(s => [...s, { id, text, icon }]);
    setTimeout(() => setItems(s => s.filter(i => i.id !== id)), 2400);
  }, []);
  return { items, push };
}

// Modal
function Modal({ title, icon, onClose, children, footer }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          {icon && <Icon name={icon} size={18} />}
          <h3>{title}</h3>
          <button className="btn ghost icon" style={{ marginLeft: 'auto' }} onClick={onClose}>
            <Icon name="X" size={16} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

window.UI = { Icon, Avatar, GpxMap, Toast, useToast, Modal };

// ---------- Energy / status / live pace helpers ----------

function EnergySegment({ value, onChange, size = 'md' }) {
  const { ENERGY_LEVELS } = window.RACE_DATA;
  return (
    <div className="seg" role="group" aria-label="Niveau d'énergie">
      {ENERGY_LEVELS.map(e => (
        <button key={e.value}
                type="button"
                aria-pressed={value === e.value}
                className={`seg-btn is-energy-${e.value}`}
                onClick={() => onChange(e.value)}
                title={e.label}>
          <span className="dot" />
          <span>{size === 'sm' ? e.short : e.label}</span>
        </button>
      ))}
    </div>
  );
}

function StatusSegment({ value, onChange, size = 'md' }) {
  const { STATUSES } = window.RACE_DATA;
  return (
    <div className="seg" role="group" aria-label="Statut">
      {STATUSES.map(s => (
        <button key={s.value}
                type="button"
                aria-pressed={value === s.value}
                className={`seg-btn is-status-${s.value}`}
                onClick={() => onChange(s.value)}
                title={s.label}>
          <Icon name={s.icon} size={12} />
          <span>{size === 'sm' ? s.short : s.label}</span>
        </button>
      ))}
    </div>
  );
}

function EnergyBar({ value }) {
  return (
    <span className={`energy-bar lvl-${value}`} title={`Énergie ${value}%`}>
      <span className="pip" /><span className="pip" /><span className="pip" /><span className="pip" />
    </span>
  );
}

function StatusChip({ value }) {
  const { STATUSES } = window.RACE_DATA;
  const s = STATUSES.find(x => x.value === value) || STATUSES[0];
  return (
    <span className={`chip status-${value}`}>
      <Icon name={s.icon} size={12} />
      <span>{s.short}</span>
    </span>
  );
}

// Compute live pace info for a runner.
// Returns { actualLapMs, kmMin, kmSec, source, baseLapMs, effectiveLapMs }
// Slowdown factor applied to base pace based on runner energy (first-lap projection)
function energyPaceFactor(energy) {
  if (energy >= 100) return 1.0;
  if (energy >= 50)  return 1.10;
  if (energy >= 25)  return 1.25;
  return 1.40;
}

function getRunnerPace(runner, race) {
  const { kmPaceToLapMs, lapMsToKmPace } = window.RACE_DATA;
  const rawBaseLapMs = kmPaceToLapMs(runner.kmMin, runner.kmSec);
  const energyFactor = energyPaceFactor(runner.energy);
  // First lap projection slowed down based on energy. Once a real lap is run, the live time wins.
  const baseLapMs = Math.round(rawBaseLapMs * energyFactor);
  // Real laps for this runner — pace estimate uses ONLY the previous lap (not an average)
  const real = race?.laps?.filter(l => l.runnerId === runner.id) || [];
  const lastLap = real[real.length - 1];
  const actualLapMs = lastLap ? lastLap.lapTime : null;
  // Manual override (per km)
  const hasOverride = runner.liveKmMin != null && runner.liveKmSec != null
                      && (runner.liveKmMin !== 0 || runner.liveKmSec !== 0);
  const overrideLapMs = hasOverride ? kmPaceToLapMs(runner.liveKmMin, runner.liveKmSec) : null;

  let effectiveLapMs, source;
  if (overrideLapMs != null) { effectiveLapMs = overrideLapMs; source = 'override'; }
  else if (actualLapMs != null) { effectiveLapMs = actualLapMs; source = 'live'; }
  else { effectiveLapMs = baseLapMs; source = 'base'; }
  const km = lapMsToKmPace(effectiveLapMs);
  return { actualLapMs, baseLapMs, effectiveLapMs, source, energyFactor, kmMin: km.min, kmSec: km.sec };
}

// Find next active runner index (skips status='out')
function nextActiveIdx(order, runners, fromIdx) {
  if (!order.length) return 0;
  for (let i = 1; i <= order.length; i++) {
    const idx = (fromIdx + i) % order.length;
    const r = runners.find(x => x.id === order[idx]);
    if (r && r.status !== 'out') return idx;
  }
  return (fromIdx + 1) % order.length;
}

window.UI.EnergySegment = EnergySegment;
window.UI.StatusSegment = StatusSegment;
window.UI.EnergyBar = EnergyBar;
window.UI.StatusChip = StatusChip;
window.UI.getRunnerPace = getRunnerPace;
window.UI.nextActiveIdx = nextActiveIdx;
