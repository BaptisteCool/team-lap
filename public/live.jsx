// Live Race Tracker — main dashboard
const { useState: useStateL, useEffect: useEffectL, useMemo: useMemoL, useRef: useRefL } = React;

function LiveScreen({ mode = 'course', team, setTeam, runners, setRunners, order, setOrder, race, setRace, ranking, setRanking, onBack, pushToast }) {
  const liveTab = mode;
  const { Icon, Avatar, GpxMap, Modal, EnergySegment, StatusSegment, StatusChip, EnergyBar, getRunnerPace, nextActiveIdx } = window.UI;
  const { fmtClock, fmtLap, fmtPace, fmtGap, kmPaceToLapMs, fmtKmPace, lapMsToKmPace, LAP_DISTANCE_M } = window.RACE_DATA;
  const Recharts = window.Recharts;

  // Live ticking clock
  const [now, setNow] = useStateL(Date.now());
  useEffectL(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const RACE_DURATION_MS = 24 * 3600 * 1000;
  const elapsed = race.started ? Math.min(now - race.startTime, RACE_DURATION_MS) : 0;
  const remaining = race.started ? Math.max(0, RACE_DURATION_MS - elapsed) : RACE_DURATION_MS;
  const progress = race.started ? Math.min(1, elapsed / RACE_DURATION_MS) : 0;

  function getRunner(id) { return runners.find(r => r.id === id); }
  const currentRunnerId = order[race.currentIdx % order.length];
  const currentRunner = getRunner(currentRunnerId);
  const nextIdx = nextActiveIdx(order, runners, race.currentIdx);
  const nextRunnerId = order[nextIdx];
  const nextRunner = getRunner(nextRunnerId);

  // Last lap timestamp = race.startTime if no lap yet, else last lap.timestamp
  const lastLapAt = race.laps.length ? race.laps[race.laps.length - 1].timestamp : race.startTime;
  const currentLapMs = race.started ? now - lastLapAt : 0;

  const totalLaps = race.laps.length;
  const totalDistanceM = totalLaps * LAP_DISTANCE_M;

  // Average lap time (real, from history)
  const realAvgMs = race.laps.length
    ? race.laps.reduce((a, l) => a + l.lapTime, 0) / race.laps.length
    : 0;
  // Projection
  const projectedLaps = realAvgMs ? Math.floor(RACE_DURATION_MS / realAvgMs) : 0;

  // Best lap
  const bestLap = race.laps.length ? race.laps.reduce((m, l) => l.lapTime < m.lapTime ? l : m) : null;

  // Tour count for current runner
  const lapsByRunner = useMemoL(() => {
    const m = {};
    for (const l of race.laps) m[l.runnerId] = (m[l.runnerId] || 0) + 1;
    return m;
  }, [race.laps]);

  // Pre-compute relay stats once per render (used in runner-current band + controls)
  const relayStats = useMemoL(() => {
    let manualLastTs = race.startTime;
    for (let i = race.laps.length - 1; i >= 0; i--) {
      const l = race.laps[i];
      if (l.type === 'top' || l.type === 'relay') { manualLastTs = l.timestamp; break; }
    }
    let lapsThisRelay = 0;
    if (currentRunnerId) {
      for (let i = race.laps.length - 1; i >= 0; i--) {
        const l = race.laps[i];
        if (l.type === 'position') continue;
        if (l.type === 'relay') break;
        if (l.runnerId === currentRunnerId) lapsThisRelay++;
      }
    }
    return { manualLastTs, lapsThisRelay };
  }, [race.laps, currentRunnerId, race.startTime]);

  // ----- Actions (départ/pause gérés côté admin) -----
  const lastRecordAtRef = useRefL(0);
  const MIN_LAP_GAP_MS = 5000; // refuse double-tap within 5s

  function recordLap({ change }) {
    const ts = Date.now();
    // Guard against double-tap (5s window)
    if (ts - lastRecordAtRef.current < MIN_LAP_GAP_MS) {
      pushToast(`Trop rapide — attends ${Math.ceil((MIN_LAP_GAP_MS - (ts - lastRecordAtRef.current)) / 1000)}s`, 'AlertTriangle');
      return;
    }
    // Also guard against pressing within 5s of last recorded lap (cross-tab)
    const lastInState = race.laps.filter(l => l.type === 'top' || l.type === 'relay' || l.type === 'virtual').slice(-1)[0];
    if (lastInState && ts - lastInState.timestamp < MIN_LAP_GAP_MS) {
      pushToast(`Trop rapide — attends ${Math.ceil((MIN_LAP_GAP_MS - (ts - lastInState.timestamp)) / 1000)}s`, 'AlertTriangle');
      return;
    }
    lastRecordAtRef.current = ts;
    const expectedNow = kmPaceToLapMs(getRunnerPace(currentRunner, race).kmMin, getRunnerPace(currentRunner, race).kmSec);
    const nIdx = change ? nextActiveIdx(order, runners, race.currentIdx) : race.currentIdx;
    setRace(r => {
      const lastLap = r.laps[r.laps.length - 1];
      const prevLap = r.laps.length > 1 ? r.laps[r.laps.length - 2] : null;
      // If the last lap was an auto-virtual one and we're inside the 60% window
      // around the estimated time, the manual entry REPLACES the virtual lap.
      if (lastLap && lastLap.type === 'virtual') {
        const since = ts - lastLap.timestamp;
        const window = (expectedNow || lastLap.lapTime) * 0.6;
        if (since <= window) {
          const refTs = prevLap ? prevLap.timestamp : r.startTime;
          const replaced = {
            ...lastLap,
            id: 'l' + ts,
            timestamp: ts,
            lapTime: ts - refTs,
            type: change ? 'relay' : 'top',
          };
          pushToast(change ? `Relais → ${getRunner(order[nIdx]).name}` : `Tour manuel — ${fmtLap(replaced.lapTime)} (remplace virtuel)`,
                    change ? 'Repeat' : 'Flag');
          return { ...r, laps: [...r.laps.slice(0, -1), replaced], currentIdx: nIdx };
        }
      }
      const refTs = lastLap ? lastLap.timestamp : r.startTime;
      const lapTime = ts - refTs;
      const newLap = {
        id: 'l' + ts,
        runnerId: currentRunnerId,
        timestamp: ts,
        lapTime,
        type: change ? 'relay' : 'top',
        lapNumber: r.laps.length + 1,
      };
      pushToast(change ? `Relais → ${getRunner(order[nIdx]).name}` : `Top — ${fmtLap(lapTime)}`,
                change ? 'Repeat' : 'Flag');
      return { ...r, laps: [...r.laps, newLap], currentIdx: nIdx };
    });
    // Auto-calibration : le tour qu'on vient de chronométrer devient
    // la nouvelle estimation pour ce coureur (override liveKm/Sec).
    const lapTimeForUpdate = (() => {
      // Le lap final dépend du chemin pris dans setRace : si on a REMPLACÉ un virtuel,
      // lapTime = ts - prevLap.timestamp. Sinon lapTime = ts - lastLap.timestamp.
      const lastLap = race.laps[race.laps.length - 1];
      const prevLap = race.laps.length > 1 ? race.laps[race.laps.length - 2] : null;
      if (lastLap && lastLap.type === 'virtual') {
        const since = ts - lastLap.timestamp;
        const window = (expectedNow || lastLap.lapTime) * 0.6;
        if (since <= window) {
          const refTs = prevLap ? prevLap.timestamp : race.startTime;
          return ts - refTs;
        }
      }
      const refTs = lastLap ? lastLap.timestamp : race.startTime;
      return ts - refTs;
    })();
    const km = lapMsToKmPace(lapTimeForUpdate);
    setRunners(rs => rs.map(rr => rr.id === currentRunnerId
      ? { ...rr, liveKmMin: km.min, liveKmSec: km.sec }
      : rr));
  }

  // Auto-validate a VIRTUAL lap when the marker passes the checkpoint (progress >= 1).
  // Uses the runner's current estimated lap time (= duration of the previous lap).
  const expectedLapMs = currentRunner
    ? kmPaceToLapMs(getRunnerPace(currentRunner, race).kmMin, getRunnerPace(currentRunner, race).kmSec)
    : 0;
  // Auto-validation centralisée dans App.jsx (s'exécute même hors Tracker).
  // LiveScreen ne déclenche plus le tour virtuel pour éviter doublons multi-onglets.
  function undoLap() {
    if (!race.laps.length) return;
    setRace(r => {
      const last = r.laps[r.laps.length - 1];
      return {
        ...r,
        laps: r.laps.slice(0, -1),
        currentIdx: last.type === 'relay'
          ? (r.currentIdx - 1 + order.length) % order.length
          : r.currentIdx,
      };
    });
    pushToast('Dernière action annulée', 'Undo2');
  }
  // ----- Modal: change current runner -----
  const [pickerOpen, setPickerOpen] = useStateL(null); // null | 'current' | 'reorder' | 'manage'
  const [editLapId, setEditLapId] = useStateL(null); // id of lap whose runner is being reassigned
  // Pagination historique des tours
  const LAP_PAGE_STEP = 10;
  const [lapPageLimit, setLapPageLimit] = useStateL(LAP_PAGE_STEP);

  function changeLapRunner(lapId, newRunnerId) {
    const lap = race.laps.find(l => l.id === lapId);
    if (!lap) return;
    const newRunner = runners.find(r => r.id === newRunnerId);
    if (!newRunner) return;
    const oldRunner = runners.find(r => r.id === lap.runnerId);
    if (!window.confirm(`Réattribuer ce tour de "${oldRunner ? oldRunner.name : '?'}" à "${newRunner.name}" ?`)) return;
    setRace(r => ({ ...r, laps: r.laps.map(l => l.id === lapId ? { ...l, runnerId: newRunnerId } : l) }));
    setEditLapId(null);
    pushToast('Coureur du tour modifié', 'UserCheck');
  }

  function setCurrentTo(runnerId) {
    const idx = order.indexOf(runnerId);
    if (idx >= 0) {
      setRace(r => ({ ...r, currentIdx: idx }));
      pushToast(`Coureur courant → ${getRunner(runnerId).name}`, 'UserCheck');
    }
    setPickerOpen(null);
  }

  // ----- Position chart data -----
  const chartData = useMemoL(() => {
    const pts = ranking.history.map(p => ({
      t: Math.round((p.t - race.startTime) / 60000),
      pos: p.pos,
    }));
    return pts;
  }, [ranking.history, race.startTime]);

  const { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, ReferenceLine, CartesianGrid } = Recharts;

  return (
    <div className="page">
      {/* Top hero — clock + main controls + current runner */}
      <div className={liveTab === 'course' ? 'grid live-grid' : 'grid'}
           style={liveTab === 'history' ? { gap: 18, maxWidth: 900, margin: '0 auto' } : null}>
        {liveTab === 'course' && (
        <div className="grid" style={{ gap: 18, alignContent: 'start' }}>
          <div className="hero-card">
            <div className="progress-track"><div className="progress-fill" style={{ width: `${progress * 100}%` }}/></div>
            <div style={{ display: 'flex', gap: 18, marginTop: 14, flexWrap: 'wrap', color: 'var(--muted)', fontSize: 13 }}>
              <span><Icon name="MapPin" size={12} /> {(totalDistanceM/1000).toFixed(2)} km parcourus</span>
              <span><Icon name="Flag" size={12} /> {totalLaps} tours</span>
              {realAvgMs > 0 && <span><Icon name="Activity" size={12} /> Moy. {fmtLap(realAvgMs)}</span>}
              {projectedLaps > 0 && <span><Icon name="Target" size={12} /> Proj. {projectedLaps} t</span>}
            </div>

            {/* Current runner band */}
            <div className="runner-current">
              <Avatar name={currentRunner.name} color={currentRunner.color} size={56} />
              <div className="runner-meta">
                <div className="role">Coureur en piste · {String(race.currentIdx + 1).padStart(2,'0')} / {order.length}</div>
                <div className="name">{currentRunner.name}</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4, flexWrap: 'wrap' }}>
                  <StatusChip value={currentRunner.status} />
                  <EnergyBar value={currentRunner.energy} />
                  {(() => {
                    const p = getRunnerPace(currentRunner, race);
                    const planned = Math.max(1, currentRunner.plannedLaps || 1);
                    return (
                      <span className="hint">
                        Tour <span className="mono" style={{ color: 'var(--accent)', fontWeight: 600 }}>{race.started ? fmtLap(currentLapMs) : '—'}</span>
                        {' · '}Allure {p.source === 'override' ? 'man.' : p.source === 'live' ? 'live' : `estim. (E${currentRunner.energy}%)`} <span className="mono">{fmtKmPace(p.kmMin, p.kmSec)}</span>
                        {' · '}Relai <span className="mono" style={{ color: 'var(--accent)', fontWeight: 600 }}>{relayStats.lapsThisRelay}</span>/<span className="mono">{planned}</span> tours
                      </span>
                    );
                  })()}
                </div>
              </div>
              <div className="runner-pace">
                <div className="v">{fmtKmPace(currentRunner.kmMin, currentRunner.kmSec)}</div>
                <div className="l">Cible / km</div>
                <div style={{ display: 'flex', gap: 6, marginTop: 8, justifyContent: 'flex-end' }}>
                  <button className="btn ghost" style={{ padding: '6px 10px', fontSize: 12 }}
                          onClick={() => setPickerOpen('manage')}>
                    <Icon name="SlidersHorizontal" size={12} /> Gérer
                  </button>
                  <button className="btn ghost" style={{ padding: '6px 10px', fontSize: 12 }}
                          onClick={() => setPickerOpen('current')}>
                    <Icon name="Replace" size={12} /> Changer
                  </button>
                </div>
              </div>
            </div>

            {/* Relay in progress — stats + cancellable laps */}
            {(() => {
              const lastRelayIdx = race.laps.map(l => l.type).lastIndexOf('relay');
              const relayLaps = race.laps.slice(lastRelayIdx + 1).filter(l => l.runnerId === currentRunnerId);
              const lastLap = relayLaps[relayLaps.length - 1];
              const avgMs = relayLaps.length ? relayLaps.reduce((a, l) => a + l.lapTime, 0) / relayLaps.length : 0;
              return (
                <div className="relay-panel">
                  <div className="relay-head">
                    <span className="relay-title"><Icon name="Repeat" size={12}/> Relais en cours</span>
                    <span className="relay-count"><span className="mono">{relayLaps.length}</span> tour{relayLaps.length > 1 ? 's' : ''}</span>
                  </div>
                  <div className="relay-stats">
                    <div className="rs">
                      <div className="rs-l">Dernier tour</div>
                      <div className="rs-v mono">{lastLap ? fmtLap(lastLap.lapTime) : '—'}</div>
                      <div className="rs-s mono">{lastLap ? fmtPace(lastLap.lapTime) : '—'}</div>
                    </div>
                    <div className="rs">
                      <div className="rs-l">Moy. tour</div>
                      <div className="rs-v mono">{avgMs ? fmtLap(avgMs) : '—'}</div>
                      <div className="rs-s mono">{avgMs ? fmtPace(avgMs) : '—'}</div>
                    </div>
                    <div className="rs">
                      <div className="rs-l">Allure /km moy.</div>
                      <div className="rs-v mono">{avgMs ? fmtPace(avgMs) : '—'}</div>
                      <div className="rs-s">sur ce relais</div>
                    </div>
                  </div>
                  {relayLaps.length > 0 && (
                    <div className="relay-laps">
                      {relayLaps.map((l, i) => {
                        const expectedMs = kmPaceToLapMs(currentRunner.kmMin, currentRunner.kmSec);
                        const abnormal = expectedMs > 0 && l.lapTime > expectedMs * 2;
                        return (
                          <div key={l.id} className={`rl ${abnormal ? 'is-abn' : ''}`}>
                            <span className="rl-n mono">T{String(i + 1).padStart(2, '0')}</span>
                            <span className="rl-t mono">{fmtLap(l.lapTime)}</span>
                            <span className="rl-p mono">{fmtPace(l.lapTime)}</span>
                            {abnormal && <span className="rl-flag"><Icon name="AlertTriangle" size={10}/></span>}
                            <button className="btn ghost icon" style={{ padding: 3 }}
                                    onClick={() => setRace(r => ({ ...r, laps: r.laps.filter(x => x.id !== l.id) }))}
                                    title="Annuler ce tour (arrêt prolongé, etc.)">
                              <Icon name="X" size={11}/>
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Big controls — Top / Relais avec ETA passage + ETA relai */}
            {(() => {
              const timeSinceManual = race.started && relayStats.manualLastTs
                ? Math.max(0, now - relayStats.manualLastTs) : 0;
              const inCalibWindow = race.started && expectedLapMs > 0 && (() => {
                const cycleIdx = Math.floor(timeSinceManual / expectedLapMs);
                const cycleStart = cycleIdx * expectedLapMs;
                const tIn = timeSinceManual - cycleStart;
                return tIn >= 0.4 * expectedLapMs || tIn <= 0.6 * expectedLapMs;
              })();
              const remainingToPassage = expectedLapMs > 0 ? expectedLapMs - currentLapMs : 0;
              const plannedLaps = Math.max(1, currentRunner?.plannedLaps || 1);
              const lapsRemainingInRelay = Math.max(0, plannedLaps - relayStats.lapsThisRelay);
              const etaRelay = lapsRemainingInRelay > 0
                ? Math.max(0, lapsRemainingInRelay * expectedLapMs - currentLapMs)
                : 0;
              return (
                <>
                  <div className="controls">
                    {!race.started ? (
                      <button className="big-btn start" style={{
                                gridColumn: '1 / -1',
                                background: team?.ready ? 'var(--accent)' : undefined,
                                color: team?.ready ? 'var(--accent-ink)' : undefined,
                              }}
                              onClick={() => {
                                if (!setTeam) return;
                                setTeam(t => ({ ...t, ready: !t?.ready }));
                                pushToast(team?.ready ? 'Équipe non-prête' : 'Équipe prête ! Auto-validation au top départ', 'Flag');
                              }}>
                        <span className="label-top">{team?.ready ? '✓ Équipe prête' : 'Annoncer le départ'}</span>
                        <span className="label-main">
                          {team?.ready
                            ? `Équipe prête — démarre auto avec ${currentRunner?.name || '—'}`
                            : 'Équipe prête !'}
                        </span>
                        <span className="label-sub">
                          {team?.ready
                            ? 'Le premier passage virtuel sera auto-validé à l\'instant estimé après le top départ.'
                            : 'Cliquez avant le top départ pour activer l\'auto-validation dès le départ.'}
                        </span>
                      </button>
                    ) : race.laps.length === 0 ? (
                      <button className="big-btn start" style={{ gridColumn: '1 / -1' }}
                              onClick={() => recordLap({ change: false })}>
                        <span className="label-top">Démarrage tardif de l'équipe</span>
                        <span className="label-main">Lancer l'équipe avec le passage de {currentRunner?.name || '—'}</span>
                        <span className="label-sub">Premier passage validé. Les boutons Top / Relais apparaissent ensuite.</span>
                      </button>
                    ) : (
                      <>
                        <button className="big-btn top" disabled={!race.started || !inCalibWindow}
                                onClick={() => recordLap({ change: false })}>
                          <span className="label-top">Top passage</span>
                          <span className="label-main mono">
                            {remainingToPassage > 0 ? `dans ${fmtLap(remainingToPassage)}` : 'fin de passage'}
                          </span>
                          <span className="label-sub">Tour validé · {currentRunner?.name}. Calibre à la seconde près.</span>
                        </button>
                        <button className="big-btn relay" disabled={!race.started || !inCalibWindow}
                                onClick={() => recordLap({ change: true })}>
                          <span className="label-top">Relai → {nextRunner?.name}</span>
                          <span className="label-main mono">
                            {etaRelay > 0 ? `dans ${fmtLap(etaRelay)}` : 'maintenant'}
                          </span>
                          <span className="label-sub">
                            Reste <span className="mono" style={{ color: 'var(--accent)', fontWeight: 600 }}>{lapsRemainingInRelay}</span> tour{lapsRemainingInRelay > 1 ? 's' : ''} pour {currentRunner?.name}.
                          </span>
                        </button>
                      </>
                    )}
                  </div>
                </>
              );
            })()}
            {!race.started && (
              <div className="hint" style={{ marginTop: 10, padding: 8, background: 'var(--bg-2)', borderRadius: 8, border: '1px solid var(--border)' }}>
                <Icon name="Info" size={12} style={{ verticalAlign: -2, marginRight: 4 }} />
                Course non démarrée. Le départ et la pause sont gérés par l'administrateur.
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <button className="btn ghost" onClick={undoLap} disabled={!race.laps.length}>
                <Icon name="Undo2" size={14} /> Annuler dernier
              </button>
              <button className="btn ghost" onClick={() => setPickerOpen('reorder')}>
                <Icon name="ListOrdered" size={14} /> Modifier l'ordre
              </button>
              <span className="hint" style={{ marginLeft: 'auto' }}>
              </span>
            </div>
          </div>
        </div>
        )}

        {/* Right column */}
        <div className="grid" style={{ gap: 18, alignContent: 'start' }}>
          {/* Mini circuit */}
          {liveTab === 'course' && (
          <div className="card">
            <div className="card-head">
              <Icon name="Map" size={16} />
              <h3>Circuit</h3>
              <span className="badge" style={{ marginLeft: 'auto' }}>{LAP_DISTANCE_M} m</span>
            </div>
            <div className="card-body" style={{ paddingTop: 10 }}>
              <GpxMap height={180} showLabel={false}
                      progress={(() => {
                        if (!race.started) return null;
                        const p = getRunnerPace(currentRunner, race);
                        const expected = kmPaceToLapMs(p.kmMin, p.kmSec);
                        if (!expected) return null;
                        return currentLapMs / expected;
                      })()} />
              <div className="stat-row" style={{ marginTop: 12 }}>
                <div className="stat" style={{ minWidth: 0 }}>
                  <div className="stat-label">Meilleur tour</div>
                  <div className="stat-value mono" style={{ fontSize: 18, color: 'var(--accent)' }}>{bestLap ? fmtLap(bestLap.lapTime) : '—'}</div>
                  {bestLap && <div className="hint">{getRunner(bestLap.runnerId).name}</div>}
                </div>
                <div className="stat" style={{ minWidth: 0 }}>
                  <div className="stat-label">Allure équipe</div>
                  <div className="stat-value mono" style={{ fontSize: 18 }}>{realAvgMs ? fmtPace(realAvgMs) : '—'}</div>
                </div>
              </div>
            </div>
          </div>
          )}

          {/* Ranking */}
          {liveTab === 'history' && (
          <div className="card">
            <div className="card-head">
              <Icon name="Trophy" size={16} />
              <h3>Classement live</h3>
            </div>
            <div className="card-body">
              <div className="ranking-row">
                <div className="pos-badge">
                  <div>
                    <div className="num">{ranking.position}</div>
                    <div className="suffix" style={{ textAlign: 'center' }}>{ranking.position === 1 ? 'er' : 'e'}</div>
                  </div>
                </div>
                <div style={{ flex: 1 }}>
                  <div className="stat-label">Position actuelle</div>
                  <div style={{ fontSize: 14, color: 'var(--text-2)', marginTop: 4 }}>
                    Sur {ranking.totalTeams || '—'} équipes inscrites
                  </div>
                </div>
                <div className="pos-edit">
                  <button className="pos-step" onClick={() => setRanking(r => ({ ...r, position: Math.max(1, r.position - 1) }))}>
                    <Icon name="ChevronUp" size={16} />
                  </button>
                  <button className="pos-step" onClick={() => setRanking(r => ({ ...r, position: r.position + 1 }))}>
                    <Icon name="ChevronDown" size={16} />
                  </button>
                </div>
              </div>

              <div className="gaps">
                <div className="gap-cell">
                  <div className="gap-l"><Icon name="ArrowUp" size={11} /> Écart au précédent <span style={{ color: 'var(--muted)', textTransform: 'none', letterSpacing: 0, fontWeight: 400 }}>· min:sec</span></div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <input type="number" min="0" max="59" className="mono"
                           value={ranking.gapPrevMin || 0}
                           onChange={e => setRanking(r => ({ ...r, gapPrevMin: Math.max(0, +e.target.value || 0) }))}
                           style={{ width: 56, textAlign: 'center' }} />
                    <span style={{ color: 'var(--muted)' }}>:</span>
                    <input type="number" min="0" max="59" className="mono"
                           value={ranking.gapPrevSec || 0}
                           onChange={e => setRanking(r => ({ ...r, gapPrevSec: Math.min(59, Math.max(0, +e.target.value || 0)) }))}
                           style={{ width: 56, textAlign: 'center' }} />
                  </div>
                </div>
                <div className="gap-cell">
                  <div className="gap-l"><Icon name="ArrowDown" size={11} /> Avance sur suivant <span style={{ color: 'var(--muted)', textTransform: 'none', letterSpacing: 0, fontWeight: 400 }}>· min:sec</span></div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <input type="number" min="0" max="59" className="mono"
                           value={ranking.gapNextMin || 0}
                           onChange={e => setRanking(r => ({ ...r, gapNextMin: Math.max(0, +e.target.value || 0) }))}
                           style={{ width: 56, textAlign: 'center' }} />
                    <span style={{ color: 'var(--muted)' }}>:</span>
                    <input type="number" min="0" max="59" className="mono"
                           value={ranking.gapNextSec || 0}
                           onChange={e => setRanking(r => ({ ...r, gapNextSec: Math.min(59, Math.max(0, +e.target.value || 0)) }))}
                           style={{ width: 56, textAlign: 'center' }} />
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <button className="btn primary" disabled={!race.started}
                        onClick={() => {
                          const ts = Date.now();
                          const gp = (ranking.gapPrevMin || 0) || (ranking.gapPrevSec || 0)
                            ? `−${ranking.gapPrevMin || 0}:${String(ranking.gapPrevSec || 0).padStart(2,'0')}`
                            : null;
                          const gn = (ranking.gapNextMin || 0) || (ranking.gapNextSec || 0)
                            ? `+${ranking.gapNextMin || 0}:${String(ranking.gapNextSec || 0).padStart(2,'0')}`
                            : null;
                          const newLap = {
                            id: 'lp' + ts,
                            timestamp: ts,
                            type: 'position',
                            position: ranking.position,
                            gapPrev: gp,
                            gapNext: gn,
                            lapNumber: null,
                          };
                          setRace(r => ({ ...r, laps: [...r.laps, newLap] }));
                          setRanking(r => ({
                            ...r,
                            history: [...(r.history || []), { t: ts, pos: ranking.position }],
                            gapPrevMin: 0, gapPrevSec: 0, gapNextMin: 0, gapNextSec: 0,
                          }));
                          pushToast(`Position ${ranking.position}e enregistrée`, 'BookmarkCheck');
                        }}>
                  <Icon name="BookmarkCheck" size={14}/> Enregistrer la position
                </button>
                <span className="hint" style={{ marginLeft: 'auto' }}>
                  Les pickers se remettent à zéro après chaque enregistrement
                </span>
              </div>
            </div>
          </div>
          )}

          {/* Lap history */}
          {liveTab === 'history' && (
          <div className="card">
            <div className="card-head">
              <Icon name="History" size={16} />
              <h3>Historique des tours · {race.laps.length}</h3>
            </div>
            <div className="card-body">
              {race.laps.length === 0 ? (
                <div className="empty">Aucun tour pour l'instant. Le premier passage apparaîtra ici.</div>
              ) : (
                <div className="laps">
                  {race.laps.slice().reverse().slice(0, lapPageLimit).map((l, i) => {
                    if (l.type === 'position') {
                      const fmtT = (() => {
                        const ms = l.timestamp - race.startTime;
                        return fmtClock(Math.max(0, ms));
                      })();
                      return (
                        <div key={l.id} className="lap is-position"
                             style={{ background: 'oklch(0.65 0.18 270 / 0.08)', border: '1px dashed oklch(0.65 0.18 270 / 0.4)' }}>
                          <span className="num"><Icon name="Trophy" size={11}/></span>
                          <span className="who">
                            <span className="badge accent" style={{ marginRight: 8 }}>{l.position}<sup style={{ fontSize: 8 }}>{l.position === 1 ? 'er' : 'e'}</sup></span>
                            <span style={{ color: 'var(--text-2)', fontSize: 13 }}>Position relevée</span>
                            {l.gapPrev && <span className="chip" style={{ marginLeft: 8, padding: '1px 6px', fontSize: 10, background: 'var(--bg-2)' }}>↑ {l.gapPrev}</span>}
                            {l.gapNext && <span className="chip" style={{ marginLeft: 4, padding: '1px 6px', fontSize: 10, background: 'var(--bg-2)' }}>↓ {l.gapNext}</span>}
                          </span>
                          <span className="time mono" style={{ color: 'var(--muted)', fontSize: 12 }}>T+{fmtT}</span>
                          <span className="pace"></span>
                          <button className="btn ghost icon" style={{ padding: 4 }}
                                  onClick={() => setRace(rr => ({ ...rr, laps: rr.laps.filter(x => x.id !== l.id) }))}
                                  title="Supprimer cet enregistrement">
                            <Icon name="X" size={12}/>
                          </button>
                        </div>
                      );
                    }
                    const r = getRunner(l.runnerId);
                    const expectedMs = r ? kmPaceToLapMs(r.kmMin, r.kmSec) : 0;
                    const isAbnormal = expectedMs > 0 && l.lapTime > expectedMs * 2;
                    return (
                      <div key={l.id} className={`lap is-${l.type}`}
                           style={isAbnormal ? { borderColor: 'oklch(0.72 0.21 25 / 0.4)', background: 'oklch(0.72 0.21 25 / 0.06)' } : undefined}>
                        <span className="num">{String(l.lapNumber).padStart(3, '0')}</span>
                        <span className="who">
                          <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 999, background: r.color, marginRight: 8, verticalAlign: 'middle' }}></span>
                          {r.name}
                          {l.type === 'virtual' && <span className="chip" style={{ marginLeft: 8, padding: '1px 6px', fontSize: 10, background: 'oklch(0.78 0.18 80 / 0.15)', color: 'oklch(0.88 0.15 80)' }}><Icon name="CircleDot" size={10}/> virtuel</span>}
                          {isAbnormal && <span className="chip status-out" style={{ marginLeft: 8, padding: '1px 6px', fontSize: 10 }}><Icon name="AlertTriangle" size={10}/> approx.</span>}
                        </span>
                        <span className="time">{fmtLap(l.lapTime)}</span>
                        <span className="pace">{fmtPace(l.lapTime)}</span>
                        <div style={{ display: 'flex', gap: 2 }}>
                          <button className="btn ghost icon" style={{ padding: 4 }}
                                  onClick={() => setEditLapId(l.id)}
                                  title="Réattribuer ce tour à un autre coureur">
                            <Icon name="UserCheck" size={12}/>
                          </button>
                          <button className="btn ghost icon" style={{ padding: 4 }}
                                  onClick={() => setRace(rr => ({ ...rr, laps: rr.laps.filter(x => x.id !== l.id) }))}
                                  title="Supprimer ce tour">
                            <Icon name="X" size={12}/>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {race.laps.length > lapPageLimit && (
                <div style={{ display: 'flex', justifyContent: 'center', marginTop: 12 }}>
                  <button className="btn ghost" onClick={() => setLapPageLimit(n => n + LAP_PAGE_STEP)}>
                    <Icon name="ChevronDown" size={14} /> Charger {Math.min(LAP_PAGE_STEP, race.laps.length - lapPageLimit)} tours de plus
                    <span className="hint" style={{ marginLeft: 6 }}>({lapPageLimit} / {race.laps.length})</span>
                  </button>
                </div>
              )}
            </div>
          </div>
          )}
           {/* Position evolution chart */}
          {liveTab === 'history' && (
          <div className="card">
            <div className="card-head">
              <Icon name="LineChart" size={16} />
              <h3>Évolution de la position</h3>
              <span className="badge accent" style={{ marginLeft: 'auto' }}>{ranking.position}<sup style={{ fontSize: 9 }}>e</sup></span>
            </div>
            <div className="card-body">
              {chartData.length < 2 ? (
                <div className="empty">Saisissez la position au fil de la course pour voir l'évolution apparaître ici.</div>
              ) : (
                <div className="chart-wrap">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 6, right: 12, left: 0, bottom: 0 }}>
                      <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                      <XAxis dataKey="t" stroke="var(--muted)" tick={{ fill: 'var(--muted)', fontSize: 11 }}
                             tickFormatter={(v) => `${v}min`} />
                      <YAxis reversed stroke="var(--muted)" tick={{ fill: 'var(--muted)', fontSize: 11 }}
                             allowDecimals={false} domain={[1, 'auto']} width={28}/>
                      <Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)' }}
                               labelFormatter={(v) => `T+${v} min`}
                               formatter={(v) => [`${v}e`, 'Position']} />
                      <Line type="stepAfter" dataKey="pos" stroke="var(--accent)" strokeWidth={2.5}
                            dot={{ r: 3, fill: 'var(--accent)', stroke: 'var(--bg)', strokeWidth: 2 }}
                            activeDot={{ r: 5 }} isAnimationActive={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>
          )}
        </div>
      </div>

      {/* Pickers */}
      {pickerOpen === 'current' && (
        <Modal title="Changer le coureur en piste" icon="UserCheck" onClose={() => setPickerOpen(null)}>
          <div className="hint" style={{ marginBottom: 10 }}>Sélectionnez le coureur actuellement en piste. L'ordre suivant sera repris à partir de lui.</div>
          <div className="grid" style={{ gap: 8 }}>
            {order.map((id, idx) => {
              const r = getRunner(id);
              const isCurrent = idx === race.currentIdx;
              return (
                <div key={id} className={`pick-row ${isCurrent ? 'is-current' : ''}`} onClick={() => setCurrentTo(id)}>
                  <span style={{ width: 14, height: 14, borderRadius: 4, background: r.color }}></span>
                  <div>
                    <div style={{ fontWeight: 500 }}>{r.name}</div>
                    <div className="hint">Position {idx + 1} · {fmtKmPace(r.kmMin, r.kmSec)} cible</div>
                  </div>
                  <span className="mono" style={{ color: 'var(--muted)' }}>{lapsByRunner[id] || 0} t</span>
                </div>
              );
            })}
          </div>
        </Modal>
      )}

      {pickerOpen === 'manage' && (
        <ManageRunnersModal
          runners={runners} setRunners={setRunners}
          race={race} order={order} currentIdx={race.currentIdx}
          onClose={() => setPickerOpen(null)}
          pushToast={pushToast}
        />
      )}

      {editLapId && (() => {
        const lap = race.laps.find(l => l.id === editLapId);
        if (!lap) return null;
        const currentRunner = runners.find(r => r.id === lap.runnerId);
        return (
          <Modal title={`Réattribuer le tour n°${lap.lapNumber}`} icon="UserCheck" onClose={() => setEditLapId(null)}>
            <div className="hint" style={{ marginBottom: 10 }}>
              Choisis le coureur qui a réellement fait ce tour. Le temps de tour reste inchangé.
              {currentRunner && <> Actuellement attribué à <strong>{currentRunner.name}</strong>.</>}
            </div>
            <div className="grid" style={{ gap: 8 }}>
              {runners.map(r => {
                const isCurrent = r.id === lap.runnerId;
                return (
                  <div key={r.id} className={`pick-row ${isCurrent ? 'is-current' : ''}`}
                       style={{ cursor: 'pointer' }}
                       onClick={() => changeLapRunner(lap.id, r.id)}>
                    <span style={{ width: 14, height: 14, borderRadius: 4, background: r.color }}></span>
                    <div>
                      <div style={{ fontWeight: 500 }}>{r.name}</div>
                      <div className="hint">{fmtKmPace(r.kmMin, r.kmSec)} cible {isCurrent ? '· actuel' : ''}</div>
                    </div>
                    <span className="mono" style={{ color: 'var(--muted)' }}>{lapsByRunner[r.id] || 0} t</span>
                  </div>
                );
              })}
            </div>
          </Modal>
        );
      })()}

      {pickerOpen === 'reorder' && (
        <ReorderModal
          order={order} setOrder={setOrder} runners={runners}
          currentIdx={race.currentIdx}
          onClose={() => setPickerOpen(null)}
        />
      )}
    </div>
  );
}

function ReorderModal({ order, setOrder, runners, currentIdx, onClose }) {
  const { Icon, Modal } = window.UI;
  const { fmtLap, kmPaceToLapMs } = window.RACE_DATA;
  // Editable copy — only future relays editable
  const [draft, setDraft] = useStateL(order.slice());

  function getRunner(id) { return runners.find(r => r.id === id); }
  function move(i, dir) {
    if (i + dir <= currentIdx) return; // can't move into past
    const j = i + dir;
    if (j < 0 || j >= draft.length) return;
    const c = draft.slice();
    [c[i], c[j]] = [c[j], c[i]];
    setDraft(c);
  }

  return (
    <Modal title="Modifier l'ordre des relais" icon="ListOrdered" onClose={onClose}
           footer={<>
             <button className="btn ghost" onClick={onClose}>Annuler</button>
             <button className="btn primary" onClick={() => {
               if (!window.confirm("Modifier l'ordre des relais ?")) return;
               setOrder(draft);
               onClose();
             }}>
               <Icon name="Check" size={14} /> Appliquer
             </button>
           </>}>
      <div className="hint" style={{ marginBottom: 10 }}>
        Vous ne pouvez modifier que les relais à venir. La position actuelle est verrouillée.
      </div>
      <div className="grid" style={{ gap: 6 }}>
        {draft.map((id, idx) => {
          const r = getRunner(id);
          const locked = idx <= currentIdx;
          return (
            <div key={id} className="pick-row" style={{ opacity: locked ? 0.5 : 1 }}>
              <span style={{ width: 14, height: 14, borderRadius: 4, background: r.color }}></span>
              <div>
                <div style={{ fontWeight: 500 }}>
                  <span className="mono" style={{ color: 'var(--muted)', marginRight: 8 }}>{String(idx + 1).padStart(2, '0')}</span>
                  {r.name}
                  {idx === currentIdx && <span className="badge accent" style={{ marginLeft: 8 }}>en piste</span>}
                </div>
                <div className="hint">{fmtLap(kmPaceToLapMs(r.kmMin, r.kmSec))}</div>
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                <button className="btn ghost icon" onClick={() => move(idx, -1)} disabled={locked || idx <= currentIdx + 1}>
                  <Icon name="ChevronUp" size={14} />
                </button>
                <button className="btn ghost icon" onClick={() => move(idx, 1)} disabled={locked || idx === draft.length - 1}>
                  <Icon name="ChevronDown" size={14} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

window.LiveScreen = LiveScreen;

// ---------- Manage runners modal ----------
function ManageRunnersModal({ runners, setRunners, race, order, currentIdx, onClose, pushToast }) {
  const { Icon, Modal, EnergySegment, StatusSegment, getRunnerPace } = window.UI;
  const { fmtKmPace, fmtLap, kmPaceToLapMs, lapMsToKmPace } = window.RACE_DATA;

  function update(id, patch) {
    setRunners(rs => rs.map(r => r.id === id ? { ...r, ...patch } : r));
  }
  function applyLiveAuto(id) {
    const r = runners.find(x => x.id === id);
    if (!r) return;
    const p = getRunnerPace(r, race);
    if (p.source === 'live') {
      update(id, { liveKmMin: p.kmMin, liveKmSec: p.kmSec });
      pushToast(`${r.name} → allure verrouillée à ${fmtKmPace(p.kmMin, p.kmSec)}`, 'Lock');
    }
  }
  function clearOverride(id) {
    update(id, { liveKmMin: null, liveKmSec: null });
  }

  const lapsByRunner = {};
  for (const l of race.laps) lapsByRunner[l.runnerId] = (lapsByRunner[l.runnerId] || 0) + 1;

  return (
    <Modal title="Gérer les coureurs" icon="SlidersHorizontal" onClose={onClose}
           footer={<button className="btn primary" onClick={onClose}>Terminé</button>}>
      <div className="hint" style={{ marginBottom: 12 }}>
        Mettez à jour énergie, statut, et allure live en cours de course. L'allure auto = temps du dernier tour du coureur.
      </div>
      <div className="grid" style={{ gap: 10 }}>
        {order.map((id, idx) => {
          const r = runners.find(x => x.id === id);
          if (!r) return null;
          const p = getRunnerPace(r, race);
          const isCurrent = idx === currentIdx;
          const hasOverride = r.liveKmMin != null && r.liveKmSec != null;
          return (
            <div key={id} className="card" style={{ background: 'var(--bg-2)', borderColor: isCurrent ? 'var(--accent-line)' : 'var(--border)' }}>
              <div style={{ padding: 12, display: 'grid', gridTemplateColumns: '12px 1fr auto', gap: 10, alignItems: 'center' }}>
                <span style={{ width: 12, height: 12, borderRadius: 4, background: r.color }}></span>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <strong>{r.name}</strong>
                    {isCurrent && <span className="badge accent">en piste</span>}
                  </div>
                  <div className="hint">
                    {lapsByRunner[id] || 0} tour{(lapsByRunner[id]||0)>1?'s':''} effectué{(lapsByRunner[id]||0)>1?'s':''}
                    {p.actualLapMs && <> · live {fmtLap(p.actualLapMs)}</>}
                  </div>
                </div>
              </div>
              <div style={{ padding: '0 12px 12px', display: 'grid', gap: 10 }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <div>
                    <div className="field-label" style={{ marginBottom: 4 }}>Énergie</div>
                    <EnergySegment value={r.energy} onChange={v => update(id, { energy: v })} size="sm" />
                  </div>
                  <div>
                    <div className="field-label" style={{ marginBottom: 4 }}>Statut</div>
                    <StatusSegment value={r.status} onChange={v => update(id, { status: v })} size="sm" />
                  </div>
                </div>
                <div className="pace-stack" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
                  <div>
                    <div className="lab">Estim. (fix)</div>
                    <div className="val">{fmtKmPace(r.kmMin, r.kmSec)}</div>
                  </div>
                  <div>
                    <div className="lab">Auto (live)</div>
                    <div className="val live">{p.actualLapMs ? (() => { const k = lapMsToKmPace(p.actualLapMs); return fmtKmPace(k.min, k.sec); })() : '—'}</div>
                  </div>
                  <div>
                    <div className="lab">Override</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                      <span className="pace-mini-input">
                        <input type="number" min="0" max="20"
                               value={r.liveKmMin ?? ''}
                               placeholder={String(p.kmMin)}
                               onChange={e => update(id, { liveKmMin: e.target.value === '' ? null : Math.max(0, +e.target.value) })} />
                        <span>:</span>
                        <input type="number" min="0" max="59"
                               value={r.liveKmSec ?? ''}
                               placeholder={String(p.kmSec).padStart(2,'0')}
                               onChange={e => update(id, { liveKmSec: e.target.value === '' ? null : Math.min(59, Math.max(0, +e.target.value)) })} />
                      </span>
                      {hasOverride && (
                        <button className="btn ghost icon" onClick={() => clearOverride(id)} title="Retirer l'override">
                          <Icon name="X" size={12} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
                {p.actualLapMs && !hasOverride && (
                  <button className="btn ghost" style={{ alignSelf: 'flex-start', padding: '4px 8px', fontSize: 12 }}
                          onClick={() => applyLiveAuto(id)}>
                    <Icon name="Lock" size={12} /> Verrouiller l'allure live comme override
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
