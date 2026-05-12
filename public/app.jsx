// Main app — multi-team, PIN-gated, RTDB-synced
const { useState: useStateA, useEffect: useEffectA, useMemo: useMemoA, useCallback: useCallbackA, useRef: useRefA } = React;

const DEFAULT_ADMIN_PASSWORD = 'azerty2026';
const SUPER_ADMIN_PIN = '080687';
const TEAM_CATEGORIES = ['Hommes', 'Mixte', 'Femmes'];

// ---- URL routing ----
function urlForViewTeam(view, teamId) {
  if (view === 'admin' || view === 'admin-gate') return '/admin';
  if ((view === 'setup' || view === 'planning' || view === 'live' || view === 'history' || view === 'contact') && teamId) return `/team/${teamId}`;
  return '/';
}
function parseAppUrl(path) {
  if (!path) return { view: 'home', teamId: null };
  if (path === '/admin' || path.startsWith('/admin/')) return { view: 'admin', teamId: null };
  const m = path.match(/^\/team\/([^\/]+)/);
  if (m) return { view: 'team', teamId: m[1] };
  return { view: 'home', teamId: null };
}
const TEAM_COLOR_PALETTE = ['#A6F060', '#60D9F0', '#F0A860', '#D060F0', '#F06080', '#F0E060', '#80F0C8', '#F08060', '#A080F0', '#F0C040'];

// Estimate where a team is on the track right now (0..1 along path)
function computeTeamProgress(t, raceStarted, raceStartTime, now, kmPaceToLapMs) {
  if (!raceStarted || !raceStartTime) return 0;
  const laps = t.laps || [];
  const order = t.order || [];
  const runners = t.runners || [];
  if (order.length === 0) return 0;
  const lastLapAt = laps.length ? laps[laps.length - 1].timestamp : raceStartTime;
  const currentRunnerId = order[(t.currentIdx || 0) % order.length];
  const runner = runners.find(r => r.id === currentRunnerId);
  if (!runner) return 0;
  const lastLap = laps.length ? laps[laps.length - 1] : null;
  let expectedLapMs;
  if (runner.liveKmMin != null) expectedLapMs = kmPaceToLapMs(runner.liveKmMin, runner.liveKmSec);
  else if (lastLap && lastLap.runnerId === runner.id) expectedLapMs = lastLap.lapTime;
  else expectedLapMs = kmPaceToLapMs(runner.kmMin, runner.kmSec);
  if (!expectedLapMs || expectedLapMs <= 0) return 0;
  const elapsed = Math.max(0, now - lastLapAt);
  // No cap — GpxMap wraps modulo so marker continues looping if no lap is validated.
  return elapsed / expectedLapMs;
}

// Strip undefined recursively so Firebase RTDB accepts the payload
function _sanitize(v) {
  if (v === undefined) return null;
  if (Array.isArray(v)) return v.map(_sanitize);
  if (v && typeof v === 'object') {
    const out = {};
    for (const k of Object.keys(v)) out[k] = _sanitize(v[k]);
    return out;
  }
  return v;
}

function emptyTeamSlice() {
  return {
    info: { id: '', name: '', maxRunners: 6, pin: '0000', category: 'Mixte', goalLaps: 200, color: TEAM_COLOR_PALETTE[0] },
    runners: [],
    order: [],
    laps: [],
    currentIdx: 0,
    ranking: { position: 1, gapPrev: '', gapNext: '', history: [] },
  };
}

function defaultAdminState() {
  return {
    schedule: { startISO: '2026-05-16T15:00', endISO: '2026-05-17T15:00' },
    race: { started: false, startTime: null },
    interruptions: [],
    password: DEFAULT_ADMIN_PASSWORD,
    contact: { email: '', phone: '' },
  };
}

// ---------- PinGate (PIN or password) ----------
function PinGate({ title, hint, expected, onUnlock, onCancel, numeric = true, label, minLength = 4 }) {
  const { Icon } = window.UI;
  const [value, setValue] = useStateA('');
  const [err, setErr] = useStateA(false);
  const inputRef = useRefA(null);

  useEffectA(() => { inputRef.current && inputRef.current.focus(); }, []);

  function submit(e) {
    if (e) e.preventDefault();
    if (value === expected) {
      setErr(false);
      onUnlock();
    } else {
      setErr(true);
      setTimeout(() => setErr(false), 800);
    }
  }

  return (
    <div className="page" style={{ display: 'grid', placeItems: 'center', minHeight: 'calc(100vh - 70px)' }}>
      <form onSubmit={submit} className="card" style={{ maxWidth: 380, width: '100%' }}>
        <div className="card-head">
          <Icon name="Lock" size={16} />
          <h3>{title}</h3>
        </div>
        <div className="card-body grid" style={{ gap: 14 }}>
          {hint && <div className="hint">{hint}</div>}
          <div className="field">
            <span className="field-label">{label || (numeric ? 'Code PIN' : 'Mot de passe')}</span>
            <input
              ref={inputRef}
              type="password"
              inputMode={numeric ? 'numeric' : 'text'}
              pattern={numeric ? '[0-9]*' : undefined}
              maxLength={numeric ? 8 : 64}
              value={value}
              onChange={e => setValue(numeric ? e.target.value.replace(/\D/g, '') : e.target.value)}
              className={numeric ? 'mono' : ''}
              style={numeric
                ? { fontSize: 22, letterSpacing: '0.4em', textAlign: 'center', borderColor: err ? 'var(--danger)' : undefined }
                : { fontSize: 16, borderColor: err ? 'var(--danger)' : undefined }}
              placeholder={numeric ? '••••' : '••••••••'}
              autoComplete="off"
            />
            {err && <span className="hint" style={{ color: 'var(--danger)' }}>{numeric ? 'Code incorrect' : 'Mot de passe incorrect'}</span>}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {onCancel && (
              <button type="button" className="btn ghost" onClick={onCancel}>
                <Icon name="ArrowLeft" size={14} /> Retour
              </button>
            )}
            <button type="submit" className="btn primary" style={{ marginLeft: 'auto' }} disabled={value.length < minLength}>
              <Icon name="LogIn" size={14} /> Valider
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
window.PinGate = PinGate;

// ---------- ContactScreen ----------
function ContactScreen({ adminContact, team }) {
  const { Icon } = window.UI;
  const ac = adminContact || { email: '', phone: '' };
  return (
    <div className="page">
      <div className="grid" style={{ gap: 18, maxWidth: 720, margin: '0 auto' }}>
        <div className="card">
          <div className="card-head">
            <Icon name="Shield" size={16} />
            <h3>Contact administrateur</h3>
            <span className="hint" style={{ marginLeft: 'auto' }}>Question / problème</span>
          </div>
          <div className="card-body grid" style={{ gap: 10 }}>
            {!ac.email && !ac.phone && (
              <div className="empty">Aucun contact administrateur configuré.</div>
            )}
            {ac.email && (
              <a href={`mailto:${ac.email}`}
                 style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px',
                          background: 'var(--bg-2)', border: '1px solid var(--border)',
                          borderRadius: 12, color: 'var(--text)', textDecoration: 'none' }}>
                <Icon name="Mail" size={18} />
                <div style={{ flex: 1 }}>
                  <div className="hint">Email</div>
                  <div className="mono" style={{ fontSize: 16, marginTop: 2 }}>{ac.email}</div>
                </div>
                <Icon name="ExternalLink" size={14} />
              </a>
            )}
            {ac.phone && (
              <a href={`tel:${ac.phone.replace(/\s/g, '')}`}
                 style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px',
                          background: 'var(--bg-2)', border: '1px solid var(--border)',
                          borderRadius: 12, color: 'var(--text)', textDecoration: 'none' }}>
                <Icon name="Phone" size={18} />
                <div style={{ flex: 1 }}>
                  <div className="hint">Téléphone</div>
                  <div className="mono" style={{ fontSize: 16, marginTop: 2 }}>{ac.phone}</div>
                </div>
                <Icon name="ExternalLink" size={14} />
              </a>
            )}
          </div>
        </div>

        {team && (
          <div className="card">
            <div className="card-head">
              <Icon name="Users" size={16} />
              <h3>Contact équipe — {team.name}</h3>
            </div>
            <div className="card-body grid" style={{ gap: 10 }}>
              <div className="hint">Personne référente que l'administrateur peut joindre.</div>
              {!team.contactName && !team.contactPhone && (
                <div className="empty">Aucun contact équipe configuré. Modifiable en admin.</div>
              )}
              {(team.contactName || team.contactPhone) && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px',
                              background: 'var(--bg-2)', border: '1px solid var(--border)',
                              borderRadius: 12 }}>
                  <Icon name="UserCheck" size={18} />
                  <div style={{ flex: 1 }}>
                    <div className="hint">Référent</div>
                    <div style={{ fontSize: 16, marginTop: 2, fontWeight: 500 }}>
                      {team.contactName || '(sans nom)'}
                    </div>
                    {team.contactPhone && (
                      <a href={`tel:${team.contactPhone.replace(/\s/g, '')}`}
                         className="mono"
                         style={{ fontSize: 14, color: 'var(--accent)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                        <Icon name="Phone" size={12} /> {team.contactPhone}
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
window.ContactScreen = ContactScreen;

// ---------- HomeScreen ----------
function HomeScreen({ teamsById, onPickTeam, onGoAdmin, raceStarted, raceStartTime }) {
  const { Icon, GpxMap } = window.UI;
  const { fmtClock, kmPaceToLapMs, LAP_DISTANCE_M } = window.RACE_DATA;
  const teams = Object.values(teamsById);
  const [now, setNow] = useStateA(Date.now());
  useEffectA(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const elapsedMs = raceStarted && raceStartTime ? Math.max(0, now - raceStartTime) : 0;

  const markers = teams
    .filter(t => (t.runners || []).length > 0)
    .map(t => ({
      id: t.info.id,
      color: t.info.color || '#A6F060',
      progress: computeTeamProgress(t, raceStarted, raceStartTime, now, kmPaceToLapMs),
      label: t.info.name || '',
    }));

  return (
    <div className="page">
      <div className="grid" style={{ gap: 18, maxWidth: 980, margin: '0 auto' }}>
        {/* Carte circuit en haut */}
        <div className="card">
          <div className="card-head">
            <Icon name="Map" size={16} />
            <h3>Circuit · live</h3>
            <span className="badge" style={{ marginLeft: 'auto' }}>{LAP_DISTANCE_M} m / tour</span>
            <span className={`badge ${raceStarted ? 'accent' : ''}`}>
              {raceStarted ? `LIVE · ${fmtClock(elapsedMs)}` : 'Course non démarrée'}
            </span>
          </div>
          <div className="card-body">
            <GpxMap height={420} markers={markers} showLabel />
          </div>
        </div>

        {/* Liste équipes dessous */}
        <div className="card">
          <div className="card-head">
            <Icon name="Users" size={16} />
            <h3>Équipes inscrites · {teams.length}</h3>
          </div>
          <div className="card-body">
            {teams.length === 0 && <div className="empty">Aucune équipe enregistrée.</div>}
            {teams.length > 0 && (
              <div className="grid" style={{ gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
                {teams.map(t => (
                  <button key={t.info.id}
                          onClick={() => onPickTeam(t.info.id)}
                          className="card"
                          style={{
                            background: 'var(--bg-2)', borderRadius: 12, padding: 14,
                            textAlign: 'left', cursor: 'pointer', display: 'grid', gap: 8,
                            border: '1px solid var(--border)',
                            borderLeft: `4px solid ${t.info.color || 'var(--accent)'}`,
                          }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{
                        width: 36, height: 36, borderRadius: 10,
                        background: t.info.color || 'var(--accent)', color: '#0a0e0c',
                        display: 'grid', placeItems: 'center', fontWeight: 700,
                      }} className="mono">
                        {t.info.name ? t.info.name.charAt(0).toUpperCase() : '?'}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {t.info.name || '(sans nom)'}
                        </div>
                        <div className="hint">{t.info.category}</div>
                      </div>
                      {!raceStarted && t.info?.ready && (
                        <span className="badge accent" style={{ fontSize: 10, padding: '2px 6px' }}>
                          ✓ prêt
                        </span>
                      )}
                      <Icon name="Lock" size={14} />
                    </div>
                    <div style={{ display: 'flex', gap: 8, fontSize: 12, color: 'var(--muted)' }} className="mono">
                      <span>{(t.runners || []).length} coureur(s)</span>
                      <span>·</span>
                      <span>{(t.laps || []).length} tour(s)</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
window.HomeScreen = HomeScreen;

// ---------- App ----------
function App() {
  const { Icon, Toast, useToast } = window.UI;
  const { fmtClock } = window.RACE_DATA;

  // View routing: 'home' | 'admin-gate' | 'admin' | 'setup' | 'planning' | 'live'
  const [view, setView] = useStateA(() => {
    if (typeof window === 'undefined') return 'home';
    const p = parseAppUrl(window.location.pathname);
    if (p.view === 'admin') return 'admin-gate';
    if (p.view === 'team') return 'setup';
    return 'home';
  });
  const [currentTeamId, setCurrentTeamId] = useStateA(() => {
    if (typeof window === 'undefined') return null;
    return parseAppUrl(window.location.pathname).teamId;
  });

  // PIN unlock (persisted in localStorage so user reste connecté)
  const [adminUnlocked, setAdminUnlocked] = useStateA(() => {
    try { return localStorage.getItem('teamlap.adminUnlocked') === '1'; } catch (_) { return false; }
  });
  const [unlockedTeams, setUnlockedTeams] = useStateA(() => {
    try {
      const raw = localStorage.getItem('teamlap.unlockedTeams');
      if (!raw) return {};
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? Object.fromEntries(arr.map(id => [id, true])) : {};
    } catch (_) { return {}; }
  });
  const [pendingPinTeam, setPendingPinTeam] = useStateA(null); // teamId pending PIN entry

  // Persist unlocks
  useEffectA(() => {
    try {
      if (adminUnlocked) localStorage.setItem('teamlap.adminUnlocked', '1');
      else localStorage.removeItem('teamlap.adminUnlocked');
    } catch (_) {}
  }, [adminUnlocked]);
  useEffectA(() => {
    try {
      const ids = Object.keys(unlockedTeams).filter(k => unlockedTeams[k]);
      if (ids.length) localStorage.setItem('teamlap.unlockedTeams', JSON.stringify(ids));
      else localStorage.removeItem('teamlap.unlockedTeams');
    } catch (_) {}
  }, [unlockedTeams]);

  // Server state
  const [admin, setAdmin] = useStateA(defaultAdminState());
  const [teamsById, setTeamsById] = useStateA({}); // { [id]: { info, runners, order, laps, currentIdx, ranking } }

  // ---------- Firebase RTDB sync ----------
  const hydratedRef = useRefA(false);
  const writeTimerRef = useRefA(null);
  const lastSerializedRef = useRefA(null);
  const cloudRef = typeof window !== 'undefined' ? window.CLOUD_REF : null;
  const toaster = useToast();

  useEffectA(() => {
    if (!cloudRef) { hydratedRef.current = true; return; }
    const handler = (snap) => {
      const v = snap.val();
      if (!v || typeof v !== 'object') { hydratedRef.current = true; return; }
      const serialized = JSON.stringify(v);
      if (lastSerializedRef.current === serialized) { hydratedRef.current = true; return; }
      lastSerializedRef.current = serialized;
      if (v.admin) {
        // Spread cloud over defaults to preserve all custom fields (password, etc.)
        const def = defaultAdminState();
        setAdmin({
          ...def,
          ...v.admin,
          schedule: { ...def.schedule, ...(v.admin.schedule || {}) },
          race: { ...def.race, ...(v.admin.race || {}) },
          interruptions: Array.isArray(v.admin.interruptions) ? v.admin.interruptions : [],
        });
      }
      if (v.teamsById && typeof v.teamsById === 'object') {
        const clean = {};
        const defSlice = emptyTeamSlice();
        for (const id of Object.keys(v.teamsById)) {
          const t = v.teamsById[id] || {};
          clean[id] = {
            ...defSlice,
            ...t,
            info: { ...defSlice.info, id, ...(t.info || {}) },
            runners: Array.isArray(t.runners) ? t.runners : [],
            order: Array.isArray(t.order) ? t.order : [],
            laps: Array.isArray(t.laps) ? t.laps : [],
            currentIdx: typeof t.currentIdx === 'number' ? t.currentIdx : 0,
            ranking: { ...defSlice.ranking, ...(t.ranking || {}) },
          };
        }
        setTeamsById(clean);
      }
      hydratedRef.current = true;
    };
    cloudRef.on('value', handler);
    const safetyTimer = setTimeout(() => { hydratedRef.current = true; }, 1500);
    return () => {
      cloudRef.off('value', handler);
      clearTimeout(safetyTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffectA(() => {
    if (!cloudRef || !hydratedRef.current) return;
    clearTimeout(writeTimerRef.current);
    writeTimerRef.current = setTimeout(() => {
      const payload = _sanitize({ admin, teamsById });
      const serialized = JSON.stringify(payload);
      if (lastSerializedRef.current === serialized) return;
      lastSerializedRef.current = serialized;
      cloudRef.set(payload).catch(err => console.error('[firebase] set failed', err));
    }, 800);
    return () => clearTimeout(writeTimerRef.current);
  }, [admin, teamsById]);

  // ---------- Admin team CRUD ----------
  const addTeam = useCallbackA(() => {
    const id = 'team_' + Date.now().toString(36);
    setTeamsById(prev => {
      const idx = Object.keys(prev).length;
      return {
        ...prev,
        [id]: {
          ...emptyTeamSlice(),
          info: {
            id, name: `Équipe ${idx + 1}`, maxRunners: 6, pin: '0000',
            category: 'Mixte', goalLaps: 200,
            color: TEAM_COLOR_PALETTE[idx % TEAM_COLOR_PALETTE.length],
          },
        },
      };
    });
    toaster.push('Équipe ajoutée', 'Plus');
  }, [toaster]);

  const updateTeamInfo = useCallbackA((id, patch) => {
    setTeamsById(prev => {
      if (!prev[id]) return prev;
      return { ...prev, [id]: { ...prev[id], info: { ...prev[id].info, ...patch } } };
    });
  }, []);

  const removeTeam = useCallbackA((id) => {
    if (!window.confirm("Supprimer cette équipe et toutes ses données (coureurs, tours, classement) ?")) return;
    setTeamsById(prev => {
      const cp = { ...prev };
      delete cp[id];
      return cp;
    });
    setUnlockedTeams(u => { const cp = { ...u }; delete cp[id]; return cp; });
    toaster.push('Équipe supprimée', 'Trash2');
  }, [toaster]);

  // ---------- Per-team scoped setters ----------
  function patchTeamSlice(id, sliceKey, value) {
    setTeamsById(prev => {
      if (!prev[id]) return prev;
      const cur = prev[id];
      const next = typeof value === 'function' ? value(cur[sliceKey]) : value;
      return { ...prev, [id]: { ...cur, [sliceKey]: next } };
    });
  }

  // ---------- Global race controls ----------
  function startRaceNow() {
    setAdmin(a => ({ ...a, race: { started: true, startTime: Date.now() } }));
    toaster.push('Course lancée — top départ !', 'Rocket');
  }
  function startRaceAtScheduled() {
    const ts = admin.schedule.startISO ? new Date(admin.schedule.startISO).getTime() : null;
    if (!ts) return;
    setAdmin(a => ({ ...a, race: { started: true, startTime: ts } }));
    toaster.push("Course alignée sur l'heure programmée", 'Calendar');
  }
  function stopRace() {
    setAdmin(a => ({ ...a, race: { ...a.race, started: false } }));
    toaster.push('Course arrêtée', 'Square');
  }
  function correctActualStart(isoString) {
    const ts = new Date(isoString).getTime();
    if (isNaN(ts)) return;
    setAdmin(a => ({ ...a, race: { ...a.race, startTime: ts } }));
    toaster.push("Heure de départ effective corrigée", 'Edit3');
  }

  const resetRace = useCallbackA(() => {
    if (!window.confirm("Réinitialiser la course ?\n\nLe départ, tous les tours de toutes les équipes, et les interruptions seront effacés. Les équipes et leurs coureurs sont conservés.")) return;
    setAdmin(a => ({ ...a, race: { started: false, startTime: null }, interruptions: [] }));
    setTeamsById(prev => {
      const cp = {};
      for (const id of Object.keys(prev)) {
        cp[id] = {
          ...prev[id],
          laps: [],
          currentIdx: 0,
          info: { ...prev[id].info, ready: false },
          ranking: { ...prev[id].ranking, history: [] },
        };
      }
      return cp;
    });
    toaster.push('Course réinitialisée', 'RefreshCcw');
  }, [toaster]);

  // ---------- Synthesize props for the active team ----------
  const currentTeam = currentTeamId ? teamsById[currentTeamId] : null;
  const synthesizedTeam = currentTeam ? currentTeam.info : null;
  const setSynthesizedTeam = useCallbackA((updater) => {
    if (!currentTeamId) return;
    setTeamsById(prev => {
      const cur = prev[currentTeamId];
      if (!cur) return prev;
      const nextInfo = typeof updater === 'function' ? updater(cur.info) : updater;
      return { ...prev, [currentTeamId]: { ...cur, info: nextInfo } };
    });
  }, [currentTeamId]);

  const runners = currentTeam ? currentTeam.runners : [];
  const setRunners = useCallbackA((updater) => {
    if (!currentTeamId) return;
    patchTeamSlice(currentTeamId, 'runners', updater);
  }, [currentTeamId]);

  const order = currentTeam ? currentTeam.order : [];
  const setOrder = useCallbackA((updater) => {
    if (!currentTeamId) return;
    patchTeamSlice(currentTeamId, 'order', updater);
  }, [currentTeamId]);

  const ranking = currentTeam ? currentTeam.ranking : { position: 1, gapPrev: '', gapNext: '', history: [] };
  const setRanking = useCallbackA((updater) => {
    if (!currentTeamId) return;
    patchTeamSlice(currentTeamId, 'ranking', updater);
  }, [currentTeamId]);

  // Synthesize race object combining global admin.race + team-local laps/currentIdx
  const synthRace = {
    started: admin.race.started,
    startTime: admin.race.startTime,
    laps: currentTeam ? currentTeam.laps : [],
    currentIdx: currentTeam ? currentTeam.currentIdx : 0,
  };
  const setSynthRace = useCallbackA((updater) => {
    if (!currentTeamId) return;
    const teamId = currentTeamId;
    setTeamsById(prevT => {
      const cur = prevT[teamId];
      if (!cur) return prevT;
      const prevRace = {
        started: admin.race.started,
        startTime: admin.race.startTime,
        laps: cur.laps,
        currentIdx: cur.currentIdx,
      };
      const next = typeof updater === 'function' ? updater(prevRace) : updater;
      return {
        ...prevT,
        [teamId]: {
          ...cur,
          laps: Array.isArray(next.laps) ? next.laps : cur.laps,
          currentIdx: typeof next.currentIdx === 'number' ? next.currentIdx : cur.currentIdx,
        },
      };
    });
    setAdmin(prevA => {
      const next = typeof updater === 'function' ? updater({
        started: prevA.race.started,
        startTime: prevA.race.startTime,
        laps: [],
        currentIdx: 0,
      }) : updater;
      return { ...prevA, race: { started: !!next.started, startTime: next.startTime ?? null } };
    });
  }, [currentTeamId, admin.race.started, admin.race.startTime]);

  // Topbar live tick (1s) — used by the LIVE pill (elapsed + remaining)
  const [tickNow, setTickNow] = useStateA(Date.now());
  useEffectA(() => {
    const id = setInterval(() => setTickNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // ---------- Auto-validate virtual laps for ALL teams (runs even on home/admin) ----------
  const autoTickRef = useRefA(Date.now());
  useEffectA(() => {
    if (!admin.race.started || !admin.race.startTime) return;
    const { kmPaceToLapMs } = window.RACE_DATA;
    const { nextActiveIdx } = window.UI || {};
    const id = setInterval(() => {
      const now = Date.now();
      autoTickRef.current = now;
      setTeamsById(prev => {
        let changed = false;
        const next = { ...prev };
        for (const tid of Object.keys(prev)) {
          const t = prev[tid];
          if (!t) continue;
          const order = Array.isArray(t.order) ? t.order : [];
          const runners = Array.isArray(t.runners) ? t.runners : [];
          if (order.length === 0) continue;
          const lapsArr = Array.isArray(t.laps) ? t.laps : [];
          const lastLap = lapsArr.length ? lapsArr[lapsArr.length - 1] : null;
          // Baseline timestamp: either last lap, OR race start if team marked itself "ready"
          let lastLapAt;
          if (lastLap) lastLapAt = lastLap.timestamp;
          else if (t.info?.ready) lastLapAt = admin.race.startTime;
          else continue;
          const currentRunnerId = order[(t.currentIdx || 0) % order.length];
          const runner = runners.find(r => r.id === currentRunnerId);
          if (!runner) continue;
          // Energy factor applied to base pace when no real lap yet for this runner
          const energyFactor = runner.energy >= 100 ? 1.0 : runner.energy >= 50 ? 1.10 : runner.energy >= 25 ? 1.25 : 1.40;
          let expectedLapMs;
          if (runner.liveKmMin != null) expectedLapMs = kmPaceToLapMs(runner.liveKmMin, runner.liveKmSec);
          else if (lastLap && lastLap.runnerId === runner.id) expectedLapMs = lastLap.lapTime;
          else expectedLapMs = Math.round(kmPaceToLapMs(runner.kmMin, runner.kmSec) * energyFactor);
          if (!expectedLapMs || expectedLapMs <= 0) continue;
          if (now - lastLapAt < expectedLapMs) continue;
          // Count laps for currentRunnerId since last relay
          let count = 1;
          for (let i = lapsArr.length - 1; i >= 0; i--) {
            const l = lapsArr[i];
            if (l.type === 'position') continue;
            if (l.type === 'relay') break;
            if (l.runnerId === currentRunnerId) count++;
          }
          const planned = Math.max(1, runner.plannedLaps || 1);
          const shouldAutoRelay = count >= planned;
          const virtTs = lastLapAt + expectedLapMs;
          const newLap = {
            id: 'lv' + virtTs + '_' + tid,
            runnerId: currentRunnerId,
            timestamp: virtTs,
            lapTime: expectedLapMs,
            type: 'virtual',
            autoRelay: shouldAutoRelay || undefined,
            lapNumber: lapsArr.length + 1,
          };
          const nIdx = shouldAutoRelay && nextActiveIdx
            ? nextActiveIdx(order, runners, t.currentIdx || 0)
            : (t.currentIdx || 0);
          next[tid] = { ...t, laps: [...lapsArr, newLap], currentIdx: nIdx };
          changed = true;
        }
        return changed ? next : prev;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [admin.race.started, admin.race.startTime]);

  // Keep team.order in sync when runners change
  useEffectA(() => {
    if (!currentTeamId || !currentTeam) return;
    setTeamsById(prev => {
      const cur = prev[currentTeamId];
      if (!cur) return prev;
      const ids = cur.runners.map(r => r.id);
      const nextOrder = cur.order.filter(id => ids.includes(id)).concat(ids.filter(id => !cur.order.includes(id)));
      if (nextOrder.length === cur.order.length && nextOrder.every((v, i) => v === cur.order[i])) return prev;
      return { ...prev, [currentTeamId]: { ...cur, order: nextOrder } };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTeam && currentTeam.runners.length]);

  // Raccourcis clavier T/R/U supprimés — actions par boutons UI uniquement.

  // ---------- URL <-> view sync ----------
  // 1. Push URL when view/teamId changes
  useEffectA(() => {
    if (typeof window === 'undefined') return;
    const expected = urlForViewTeam(view, currentTeamId);
    if (window.location.pathname !== expected) {
      window.history.pushState({ view, teamId: currentTeamId }, '', expected);
    }
  }, [view, currentTeamId]);

  // 2. Initial URL → state (after mount, once)
  useEffectA(() => {
    if (typeof window === 'undefined') return;
    const p = parseAppUrl(window.location.pathname);
    if (p.view === 'admin') {
      setView(adminUnlocked ? 'admin' : 'admin-gate');
    } else if (p.view === 'team' && p.teamId) {
      setCurrentTeamId(p.teamId);
      setView('setup');
      if (!unlockedTeams[p.teamId]) setPendingPinTeam(p.teamId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 3. Popstate (back/forward) → state
  useEffectA(() => {
    function onPop() {
      const p = parseAppUrl(window.location.pathname);
      if (p.view === 'admin') {
        setView(adminUnlocked ? 'admin' : 'admin-gate');
        setCurrentTeamId(null);
        setPendingPinTeam(null);
      } else if (p.view === 'team' && p.teamId) {
        setCurrentTeamId(p.teamId);
        setView('setup');
        setPendingPinTeam(unlockedTeams[p.teamId] ? null : p.teamId);
      } else {
        setView('home');
        setCurrentTeamId(null);
        setPendingPinTeam(null);
      }
    }
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [adminUnlocked, unlockedTeams]);

  // ---------- View navigation handlers ----------
  function goHome() { setView('home'); setCurrentTeamId(null); }
  function requestAdmin() {
    if (adminUnlocked) setView('admin');
    else setView('admin-gate');
  }
  function pickTeam(id) {
    if (unlockedTeams[id]) { setCurrentTeamId(id); setView('setup'); }
    else { setPendingPinTeam(id); }
  }
  function lockAdmin() {
    if (!window.confirm("Se déconnecter de l'administrateur ?")) return;
    setAdminUnlocked(false);
    goHome();
    toaster.push('Admin verrouillé', 'Lock');
  }
  function lockCurrentTeam() {
    if (!currentTeamId) return;
    if (!window.confirm("Verrouiller l'équipe ? Le PIN sera redemandé au prochain accès.")) return;
    const id = currentTeamId;
    setUnlockedTeams(u => { const cp = { ...u }; delete cp[id]; return cp; });
    goHome();
    toaster.push('Équipe verrouillée', 'Lock');
  }

  const planningReady = currentTeam && currentTeam.info.name && currentTeam.runners.length >= 2 && currentTeam.runners.every(r => r.name && r.name.trim());
  const liveReady = planningReady && currentTeam.order.length >= 2;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand" style={{ cursor: 'pointer' }} onClick={goHome}>
          <div className="brand-mark" aria-label="TeamLap">
            <svg width="22" height="22" viewBox="0 0 200 200" fill="none" aria-hidden="true">
              <circle cx="100" cy="110" r="60" stroke="currentColor" strokeWidth="22" fill="none"
                      strokeDasharray="305 60" strokeDashoffset="-30" strokeLinecap="round"
                      transform="rotate(-90 100 110)" />
              <rect x="58" y="32" width="84" height="20" rx="10" fill="currentColor" />
              <rect x="92" y="18" width="16" height="28" rx="4" fill="currentColor" />
            </svg>
          </div>
          <div>
            <div className="brand-name">TeamLap</div>
            <div className="brand-sub">
              {currentTeam ? `${currentTeam.info.name} · 24h de course à pied 2026` : '24h de course à pied 2026'}
            </div>
          </div>
        </div>

        {(view === 'setup' || view === 'planning' || view === 'live' || view === 'history' || view === 'contact') && currentTeam && (
          <div className="tabs" role="tablist">
            <button role="tab" aria-selected={view === 'setup'} className="tab" onClick={() => setView('setup')}>
              <Icon name="Users" size={14} />
              <span>Équipe</span>
            </button>
            <button role="tab" aria-selected={view === 'planning'} className="tab"
                    disabled={!planningReady}
                    onClick={() => setView('planning')}>
              <Icon name="ListOrdered" size={14} />
              <span>Planning</span>
            </button>
            <button role="tab" aria-selected={view === 'live'} className="tab"
                    disabled={!liveReady}
                    onClick={() => setView('live')}>
              <Icon name="Activity" size={14} />
              <span>Tracker</span>
            </button>
            <button role="tab" aria-selected={view === 'history'} className="tab"
                    disabled={!liveReady}
                    onClick={() => setView('history')}>
              <Icon name="History" size={14} />
              <span>Historique</span>
            </button>
            <button role="tab" aria-selected={view === 'contact'} className="tab"
                    onClick={() => setView('contact')}>
              <Icon name="Phone" size={14} />
              <span>Contact</span>
            </button>
          </div>
        )}

        {view === 'admin' && (
          <div className="tabs" role="tablist">
            <button role="tab" aria-selected className="tab">
              <Icon name="Shield" size={14} />
              <span>Admin</span>
            </button>
          </div>
        )}

        <div className="topbar-spacer" />

        {view !== 'home' && (
          <button className="btn ghost" onClick={goHome} title="Retour à l'accueil">
            <Icon name="Home" size={14} /> Accueil
          </button>
        )}
        {view === 'admin' && adminUnlocked && (
          <button className="btn ghost" onClick={lockAdmin} title="Se déconnecter de l'administrateur">
            <Icon name="Lock" size={14} /> Déconnecter
          </button>
        )}
        {(view === 'setup' || view === 'planning' || view === 'live' || view === 'history' || view === 'contact') && currentTeamId && (
          <button className="btn ghost" onClick={lockCurrentTeam} title="Verrouiller cette équipe (redemandera le PIN)">
            <Icon name="Lock" size={14} /> Verrouiller
          </button>
        )}

        <div className={`live-pill ${admin.race.started ? 'is-live' : ''}`}>
          <span className="live-dot"></span>
          {admin.race.started && admin.race.startTime
            ? (() => {
                const RACE_MS = 24 * 3600 * 1000;
                const elapsed = Math.max(0, Math.min(RACE_MS, tickNow - admin.race.startTime));
                const remaining = Math.max(0, RACE_MS - elapsed);
                return (
                  <span className="mono" style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                    <span>LIVE</span>
                    <span>{fmtClock(elapsed)}</span>
                    <span style={{ color: 'var(--muted)' }}>·</span>
                    <span style={{ color: 'var(--text-2)' }}>−{fmtClock(remaining)}</span>
                  </span>
                );
              })()
            : <span>Stand‑by</span>}
        </div>
      </header>

      <main>
        {pendingPinTeam && teamsById[pendingPinTeam] && (
          <PinGate
            title={`Accès équipe — ${teamsById[pendingPinTeam].info.name}`}
            hint="Saisis le code PIN de l'équipe pour accéder aux pages."
            expected={teamsById[pendingPinTeam].info.pin || '0000'}
            onUnlock={() => {
              const id = pendingPinTeam;
              setUnlockedTeams(u => ({ ...u, [id]: true }));
              setPendingPinTeam(null);
              setCurrentTeamId(id);
              setView('setup');
            }}
            onCancel={() => setPendingPinTeam(null)}
          />
        )}

        {!pendingPinTeam && view === 'home' && (
          <HomeScreen
            teamsById={teamsById}
            onPickTeam={pickTeam}
            onGoAdmin={requestAdmin}
            raceStarted={admin.race.started}
            raceStartTime={admin.race.startTime}
          />
        )}

        {!pendingPinTeam && view === 'admin-gate' && (
          <PinGate
            title="Accès administrateur"
            hint="Saisis le mot de passe administrateur."
            expected={admin.password || DEFAULT_ADMIN_PASSWORD}
            numeric={false}
            label="Mot de passe"
            minLength={1}
            onUnlock={() => { setAdminUnlocked(true); setView('admin'); }}
            onCancel={goHome}
          />
        )}

        {!pendingPinTeam && view === 'admin' && adminUnlocked && (
          <window.AdminScreen
            admin={admin} setAdmin={setAdmin}
            teamsById={teamsById}
            addTeam={addTeam} updateTeamInfo={updateTeamInfo} removeTeam={removeTeam}
            startRaceNow={startRaceNow}
            startRaceAtScheduled={startRaceAtScheduled}
            stopRace={stopRace}
            correctActualStart={correctActualStart}
            resetRace={resetRace}
            pushToast={toaster.push}
            categories={TEAM_CATEGORIES}
            superAdminPin={SUPER_ADMIN_PIN}
          />
        )}

        {!pendingPinTeam && view === 'setup' && currentTeam && (
          <window.SetupScreen
            team={synthesizedTeam} setTeam={setSynthesizedTeam}
            runners={runners} setRunners={setRunners}
            categories={TEAM_CATEGORIES}
            adminContact={admin.contact || { email: '', phone: '' }}
            onContinue={() => setView('planning')}
          />
        )}

        {!pendingPinTeam && view === 'planning' && currentTeam && (
          <window.PlanningScreen
            runners={runners} order={order} setOrder={setOrder}
            schedule={admin.schedule}
            onContinue={() => setView('live')}
            onBack={() => setView('setup')}
          />
        )}

        {!pendingPinTeam && (view === 'live' || view === 'history') && currentTeam && (
          <window.LiveScreen
            mode={view === 'history' ? 'history' : 'course'}
            team={synthesizedTeam} setTeam={setSynthesizedTeam}
            runners={runners} setRunners={setRunners}
            order={order} setOrder={setOrder}
            race={synthRace} setRace={setSynthRace}
            ranking={{ ...ranking, totalTeams: Math.max(1, Object.keys(teamsById).length) }} setRanking={setRanking}
            onBack={() => setView('planning')}
            pushToast={toaster.push}
          />
        )}

        {!pendingPinTeam && view === 'contact' && currentTeam && (
          <ContactScreen
            adminContact={admin.contact || { email: '', phone: '' }}
            team={synthesizedTeam}
          />
        )}
      </main>

      <Toast items={toaster.items} />
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
