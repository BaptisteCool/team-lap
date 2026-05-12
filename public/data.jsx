// GPX-derived data for "24H Running - Brette-les-Pins"
// Path is rotated so that GPX[0] = START_FINISH_CHECKPOINT (lat 47.915850 / lon 0.331450)
// at SVG coords (99, 121). progress=0 along the path = checkpoint.
const GPX_PATH = "M99 121 L97.2 132.4 L96.3 143.5 L103.7 149.0 L121.4 149.0 L140.9 156.0 L156.7 158.7 L172.6 164.3 L183.7 167.1 L185.6 189.3 L182.8 204.5 L177.2 218.4 L174.4 232.3 L166.0 239.2 L143.7 239.2 L118.6 232.3 L100.9 228.1 L79.5 224.0 L63.7 219.8 L56.3 217.0 L49.8 218.4 L20.0 167.1 L35.8 137.9 L53.5 112.9 L80.5 75.5 L100.0 50.5 L128.8 40.8 L142.8 40.8 L159.5 46.3 L188.4 61.6 L222.8 83.8 L248.8 94.9 L270.2 107.4 L289.8 112.9 L311.2 115.7 L329.8 115.7 L346.5 111.5 L357.7 108.8 L371.6 108.8 L380.0 124.0 L379.1 136.5 L377.2 151.8 L363.3 154.6 L354.9 143.5 L347.4 135.1 L331.6 149.0 L314.0 153.2 L283.3 147.6 L264.7 140.7 L244.2 133.8 L220.0 129.6 L199.5 119.9 L175.3 110.2 L150.2 100.4 L127.0 94.9 L107.4 94.9 L100.9 110.2 Z";

const GPX_VIEWBOX = "0 0 400 280";
const LAP_DISTANCE_M = 900; // distance de référence par tour
const LAP_DISTANCE_M_MEASURED = 934;

// ---------- Time helpers ----------
function pad2(n) { return String(n).padStart(2, '0'); }

function fmtClock(ms) {
  if (ms == null || isNaN(ms) || ms < 0) ms = 0;
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
}

function fmtLap(ms) {
  if (ms == null || isNaN(ms) || ms < 0) return '—';
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  const cs = Math.floor((ms % 1000) / 10);
  return `${m}:${pad2(s)}.${pad2(cs)}`;
}

function fmtPace(ms, distM = LAP_DISTANCE_M) {
  if (!ms || ms <= 0) return '—';
  const secPerKm = (ms / 1000) * (1000 / distM);
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${pad2(s)}/km`;
}

function fmtGap(sec) {
  if (sec == null) return '—';
  const sign = sec >= 0 ? '+' : '−';
  const a = Math.abs(sec);
  const m = Math.floor(a / 60);
  const s = Math.floor(a % 60);
  return `${sign}${m}:${pad2(s)}`;
}

function paceToMs(min, sec) {
  return ((min || 0) * 60 + (sec || 0)) * 1000;
}

// Per-km pace → lap time in ms for the reference distance
function kmPaceToLapMs(kmMin, kmSec, distM = LAP_DISTANCE_M) {
  return ((kmMin || 0) * 60 + (kmSec || 0)) * 1000 * (distM / 1000);
}
// Lap time in ms → per-km pace { min, sec }
function lapMsToKmPace(lapMs, distM = LAP_DISTANCE_M) {
  if (!lapMs || lapMs <= 0) return { min: 0, sec: 0 };
  const secPerKm = (lapMs / 1000) * (1000 / distM);
  return { min: Math.floor(secPerKm / 60), sec: Math.round(secPerKm % 60) };
}
function fmtKmPace(kmMin, kmSec) {
  return `${kmMin}:${pad2(kmSec)}/km`;
}

// ---------- Energy & status ----------
const ENERGY_LEVELS = [
  { value: 100, label: 'Au top',         color: 'oklch(0.86 0.20 135)', short: '100%' },
  { value: 50,  label: 'Un peu diminué', color: 'oklch(0.82 0.17 70)',  short: '50%'  },
  { value: 25,  label: 'Très diminué',   color: 'oklch(0.72 0.21 25)',  short: '25%'  },
];
const STATUSES = [
  { value: 'ready',     label: 'Prêt à courir', short: 'Prêt',     color: 'oklch(0.86 0.20 135)', icon: 'Check' },
  { value: 'uncertain', label: 'Incertain',     short: 'Incertain',color: 'oklch(0.82 0.17 70)',  icon: 'HelpCircle' },
  { value: 'out',       label: 'Abandon',       short: 'Abandon',  color: 'oklch(0.72 0.21 25)',  icon: 'XCircle' },
];

// ---------- Demo / preset data ----------
const DEFAULT_TEAM = {
  name: "Mon équipe",
  category: "Mixte 6",
  goalLaps: 280,
};

// kmMin/kmSec = base pace per km (fix, set before race)
// liveKmMin/liveKmSec = live pace per km (auto-updated from actual laps, manually overridable)
//   when null/undefined → derived from real laps avg, falling back to base
// energy: 100 | 50 | 25 — status: 'ready' | 'uncertain' | 'out'
// plannedLaps = nombre de tours d'affilée prévus avant de passer le relais
const RUNNER_PALETTE = ['#A6F060', '#60D9F0', '#F0A860', '#D060F0', '#F06080', '#F0E060', '#80F0C8', '#F08060', '#A080F0', '#F0C040'];
const DEFAULT_PLANNED_LAPS = 4;
const _SEED_RUNNERS = [
  { name: 'Lulu',      kmMin: 6, kmSec: 0  },
  { name: 'Pascal',    kmMin: 4, kmSec: 15 },
  { name: 'Baco',      kmMin: 4, kmSec: 45 },
  { name: 'Klempic',   kmMin: 5, kmSec: 30 },
  { name: 'Charlotte', kmMin: 6, kmSec: 0  },
  { name: 'Toto',      kmMin: 4, kmSec: 45 },
  { name: 'Sim',       kmMin: 4, kmSec: 50 },
  { name: 'Rodin',     kmMin: 5, kmSec: 30 },
  { name: 'Martial',   kmMin: 5, kmSec: 0  },
  { name: 'Marina',    kmMin: 6, kmSec: 30 },
];
const DEFAULT_RUNNERS = _SEED_RUNNERS.map((r, i) => ({
  id: 'r' + (i + 1),
  name: r.name,
  kmMin: r.kmMin, kmSec: r.kmSec,
  color: RUNNER_PALETTE[i % RUNNER_PALETTE.length],
  energy: 100, status: 'ready',
  liveKmMin: null, liveKmSec: null,
  plannedLaps: DEFAULT_PLANNED_LAPS,
}));

window.RACE_DATA = {
  GPX_PATH, GPX_VIEWBOX, LAP_DISTANCE_M, LAP_DISTANCE_M_MEASURED,
  fmtClock, fmtLap, fmtPace, fmtGap, paceToMs, pad2,
  kmPaceToLapMs, lapMsToKmPace, fmtKmPace,
  ENERGY_LEVELS, STATUSES,
  DEFAULT_TEAM, DEFAULT_RUNNERS, DEFAULT_PLANNED_LAPS, RUNNER_PALETTE,
};
