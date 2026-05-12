// Planning screen — drag & drop runner order
const { useState: useStateP, useRef: useRefP } = React;

function PlanningScreen({ runners, order, setOrder, schedule, onContinue, onBack }) {
  const { Icon, StatusChip, EnergyBar } = window.UI;
  const { fmtLap, fmtPace, kmPaceToLapMs, fmtKmPace } = window.RACE_DATA;

  const dragId = useRefP(null);
  const [overId, setOverId] = useStateP(null);

  function getRunner(id) { return runners.find(r => r.id === id); }

  function onDragStart(e, id) {
    dragId.current = id;
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', id); } catch (_) {}
  }
  function onDragOver(e, id) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (overId !== id) setOverId(id);
  }
  function onDrop(e, id) {
    e.preventDefault();
    const src = dragId.current;
    if (!src || src === id) { dragId.current = null; setOverId(null); return; }
    if (!window.confirm("Modifier l'ordre des relais ?")) {
      dragId.current = null; setOverId(null); return;
    }
    setOrder(o => {
      const copy = o.slice();
      const sIdx = copy.indexOf(src);
      const tIdx = copy.indexOf(id);
      copy.splice(sIdx, 1);
      copy.splice(tIdx, 0, src);
      return copy;
    });
    dragId.current = null; setOverId(null);
  }
  function move(id, dir) {
    if (!window.confirm("Modifier l'ordre des relais ?")) return;
    setOrder(o => {
      const copy = o.slice();
      const i = copy.indexOf(id);
      const j = i + dir;
      if (j < 0 || j >= copy.length) return o;
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });
  }

  const activeOrder = order.filter(id => getRunner(id)?.status !== 'out');
  // Sequence des passages : chaque coureur × plannedLaps consécutifs, puis suivant
  const expandedSequence = [];
  activeOrder.forEach(id => {
    const r = getRunner(id);
    const planned = Math.max(1, r.plannedLaps || 1);
    for (let k = 0; k < planned; k++) {
      expandedSequence.push({ id, runner: r, slotIdx: k + 1, slotTotal: planned, isRelay: k === planned - 1 });
    }
  });
  const totalMs = expandedSequence.reduce((a, s) => a + kmPaceToLapMs(s.runner.kmMin, s.runner.kmSec), 0);

  return (
    <div className="page">
      <div className="grid" style={{ gridTemplateColumns: '1.4fr 1fr', gap: 18 }}>
        <div className="card">
          <div className="card-head">
            <Icon name="ListOrdered" size={16} />
            <h3>Ordre des relais</h3>
          </div>
          <div className="card-body">
            <div className="hint" style={{ marginBottom: 12 }}>
              Glissez‑déposez les coureurs pour définir l'ordre des relais. Cet ordre se répète en boucle pendant les 24h.
            </div>
            <div className="plan-list">
              {order.map((id, idx) => {
                const r = getRunner(id);
                const lapMs = kmPaceToLapMs(r.kmMin, r.kmSec);
                const isOut = r.status === 'out';
                return (
                  <div key={id}
                       className={`plan-row ${dragId.current === id ? 'dragging' : ''} ${overId === id ? 'drop-target' : ''}`}
                       style={{ opacity: isOut ? 0.45 : 1 }}
                       draggable
                       onDragStart={e => onDragStart(e, id)}
                       onDragOver={e => onDragOver(e, id)}
                       onDragLeave={() => setOverId(null)}
                       onDrop={e => onDrop(e, id)}
                       onDragEnd={() => { dragId.current = null; setOverId(null); }}>
                    <span className="plan-handle" title="Déplacer">
                      <Icon name="GripVertical" size={18} />
                    </span>
                    <span className="plan-num mono">{isOut ? '—' : String(idx + 1).padStart(2, '0')}</span>
                    <span className="plan-name" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: r.color, verticalAlign: 'middle' }}></span>
                      <span style={{ textDecoration: isOut ? 'line-through' : 'none' }}>{r.name}</span>
                      <StatusChip value={r.status} />
                      <EnergyBar value={r.energy} />
                    </span>
                    <span className="plan-pace">
                      {fmtKmPace(r.kmMin, r.kmSec)} <span style={{ color: 'var(--muted)' }}>· {fmtLap(lapMs)}</span>
                      <span style={{ marginLeft: 8, color: 'var(--accent)' }} className="mono">×{r.plannedLaps || 1}</span>
                    </span>
                    <div style={{ display: 'flex', gap: 2 }}>
                      <button className="btn ghost icon" onClick={() => move(id, -1)} disabled={idx === 0} title="Monter">
                        <Icon name="ChevronUp" size={14} />
                      </button>
                      <button className="btn ghost icon" onClick={() => move(id, 1)} disabled={idx === order.length - 1} title="Descendre">
                        <Icon name="ChevronDown" size={14} />
                      </button>
                    </div>
                    <span></span>
                  </div>
                );
              })}
            </div>

            <hr className="sep" />
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <button className="btn ghost" onClick={onBack} style={{ flexShrink: 0 }}>
                <Icon name="ArrowLeft" size={16} /> Retour
              </button>
              <span className="hint" style={{ flex: '1 1 auto', minWidth: 0 }}>L'ordre sera modifiable en cours de course.</span>
              <button className="btn primary" style={{ marginLeft: 'auto', flexShrink: 0 }} onClick={onContinue}>
                <Icon name="Rocket" size={16} /> Aller au tracker
              </button>
            </div>
          </div>
        </div>

        <div className="grid" style={{ gap: 18, alignContent: 'start' }}>
          <div className="card">
            <div className="card-head">
              <Icon name="Timer" size={16} />
              <h3>Cycle complet</h3>
            </div>
            <div className="card-body">
              <div className="stat-row">
                <div className="stat">
                  <div className="stat-label">Coureurs actifs</div>
                  <div className="stat-value mono">{activeOrder.length}<span style={{ color: 'var(--muted)', fontSize: 14 }}> / {order.length}</span></div>
                </div>
                <div className="stat">
                  <div className="stat-label">Cycle ({expandedSequence.length} t.)</div>
                  <div className="stat-value mono">{totalMs ? fmtLap(totalMs) : '—'}</div>
                </div>
                <div className="stat">
                  <div className="stat-label">Cycles / 24h</div>
                  <div className="stat-value mono">{totalMs ? Math.floor((24 * 3600 * 1000) / totalMs) : '—'}</div>
                </div>
                <div className="stat">
                  <div className="stat-label">Tours / 24h</div>
                  <div className="stat-value mono">{totalMs ? Math.floor((24 * 3600 * 1000) / totalMs) * expandedSequence.length : '—'}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <Icon name="Eye" size={16} />
              <h3>Prochains passages</h3>
            </div>
            <div className="card-body">
              <div className="hint" style={{ marginBottom: 10 }}>
                Aperçu des {Math.min(12, expandedSequence.length)} prochains tours selon les tours prévus de chaque coureur :
              </div>
              <div className="grid" style={{ gap: 6 }}>
                {(() => {
                  const startMs = schedule?.startISO ? new Date(schedule.startISO).getTime() : null;
                  let cum = 0;
                  return expandedSequence.slice(0, 12).map((s, i) => {
                    const r = s.runner;
                    const lapMs = kmPaceToLapMs(r.kmMin, r.kmSec);
                    cum += lapMs;
                    const eta = startMs ? new Date(startMs + cum) : null;
                    return (
                      <div key={i} className="plan-preview-row" style={{
                        display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
                        borderRadius: 8, background: 'var(--bg-2)',
                        borderLeft: s.isRelay ? `2px solid ${r.color}` : '2px solid transparent',
                        flexWrap: 'wrap',
                      }}>
                        <span className="mono" style={{ color: 'var(--muted)', width: 26, flexShrink: 0 }}>{String(i + 1).padStart(2, '0')}</span>
                        <span style={{ width: 8, height: 8, borderRadius: 999, background: r.color, flexShrink: 0 }}></span>
                        <span style={{ flex: '1 1 120px', minWidth: 0, display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' }}>
                          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{r.name}</span>
                          <span className="mono" style={{ color: 'var(--muted)', fontSize: 11, whiteSpace: 'nowrap', flexShrink: 0 }}>
                            {s.slotIdx}/{s.slotTotal}
                          </span>
                          {s.isRelay && s.slotTotal > 1 && (
                            <span className="badge accent" style={{ fontSize: 10, flexShrink: 0 }}>relais</span>
                          )}
                        </span>
                        <span className="mono" style={{ color: 'var(--text-2)', fontSize: 13, flexShrink: 0, whiteSpace: 'nowrap' }}>{fmtKmPace(r.kmMin, r.kmSec)}</span>
                        {eta && (
                          <span className="mono" style={{ color: 'var(--accent)', fontSize: 12, textAlign: 'right', flexShrink: 0, whiteSpace: 'nowrap' }}>
                            → {String(eta.getHours()).padStart(2,'0')}:{String(eta.getMinutes()).padStart(2,'0')}:{String(eta.getSeconds()).padStart(2,'0')}
                          </span>
                        )}
                      </div>
                    );
                  });
                })()}
                {expandedSequence.length === 0 && <div className="empty">Tous les coureurs sont en abandon.</div>}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

window.PlanningScreen = PlanningScreen;
