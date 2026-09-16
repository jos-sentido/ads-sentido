// /api/metrics — Lee analítica de Metricool para una marca y un rango de fechas.
//
// Metricool es la fuente uniforme (agrega Meta Ads, Google Ads, Instagram y
// Facebook de todas las marcas). Esta función traduce un rango a las llamadas
// de la API de Metricool y devuelve un JSON normalizado que el hub dibuja.
//
// El diseño es AGNÓSTICO DE FUENTE: cada red decide de dónde jala. Hoy todo
// sale de Metricool; para meter Meta Ads nativo (Marketing API) más adelante,
// se cambia solo el proveedor de la red 'metaAds' sin tocar el resto.
//
// ── Variables de entorno (Vercel → Settings → Environment Variables) ──
//   METRICOOL_USER_ID    — userId de Metricool
//   METRICOOL_USER_TOKEN — userToken / Access Token de Metricool
//   PANEL_TOKEN          — token de sesión del panel (lo emite /api/login)
//
// ── Contrato ──
//   GET /api/metrics?brand=amancay&from=2026-08-01&to=2026-08-31
//   GET /api/metrics?brand=amancay&from=..&to=..&debug=timeline&metric=FAEV04
//        → respuesta CRUDA de Metricool (para confirmar el shape en el 1er deploy)

const API = 'https://app.metricool.com/api';

// Registro de marcas. blogId = id de la marca en Metricool (no es secreto).
const BRANDS = {
  amancay:  { blogId: 1610215, label: 'Amancay',         networks: ['metaAds','googleAds','instagram','facebook'] },
  bolongo:  { blogId: 1140633, label: 'Bolongo',         networks: ['metaAds','googleAds','instagram','facebook'] },
  brelia:   { blogId: 2066332, label: 'Brelia',          networks: ['metaAds','googleAds','instagram','facebook'] },
  heredit:  { blogId: 3777294, label: 'Heredit',         networks: ['metaAds','googleAds','instagram','facebook'] },
  essentia: { blogId: 2425775, label: 'Essentia Country',networks: ['metaAds','googleAds','instagram','facebook'] },
};

// Métrica → id de Data Studio de Metricool.
const METRICS = {
  metaAds:   { spend:'FAEV04', impressions:'FAEV01', reach:'FAEV03', clicks:'FAEV05' },
  googleAds: { cost:'GAEV02', impressions:'GAEV01', clicks:'GAEV03', conversions:'GAEV04' },
  instagram: { followers:'IGEV01', reach:'IGEV06', views:'IGEV05', gained:'IGEV43', lost:'IGEV44', engaged:'IGEV42' },
  facebook:  { followers:'FBEV17', interactions:'FBEV10', pageViews:'FBEV03', contentViews:'FBEV49' },
};

const AGG = {
  spend:'sum', cost:'sum', impressions:'sum', clicks:'sum', reach:'sum', conversions:'sum',
  views:'sum', gained:'sum', lost:'sum', engaged:'sum', interactions:'sum', pageViews:'sum', contentViews:'sum',
  followers:'last',
};

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // Acceso interno: cookie del panel.
  const cookie = req.headers.cookie || '';
  const ok = process.env.PANEL_TOKEN && cookie.includes(`panel_token=${process.env.PANEL_TOKEN}`);
  if (!ok) return res.status(401).json({ error: 'No autorizado' });

  const userId = process.env.METRICOOL_USER_ID;
  const userToken = process.env.METRICOOL_USER_TOKEN;
  if (!userId || !userToken) return res.status(500).json({ error: 'Falta METRICOOL_USER_ID / METRICOOL_USER_TOKEN' });

  const { brand, from, to, debug, metric } = req.query;
  const b = BRANDS[String(brand || '').toLowerCase()];
  if (!b) return res.status(404).json({ error: `Marca desconocida: ${brand}` });

  const start = ymd(from), end = ymd(to);
  if (!start || !end) return res.status(400).json({ error: 'from/to requeridos (YYYY-MM-DD)' });

  const mc = (path, extra = {}) => fetchMetricool(path, { blogId: b.blogId, userId, userToken, start, end, ...extra });

  try {
    // Modo diagnóstico: prueba varios endpoints candidatos a la vez para
    // encontrar cuál devuelve las métricas de Data Studio (FAEV/GAEV/IGEV).
    if (debug) {
      const fromISO = `${req.query.from}T00:00:00-06:00`;
      const toISO = `${req.query.to}T23:59:59-06:00`;
      const tryUrl = async (path) => {
        const qs = new URLSearchParams({ from: fromISO, to: toISO, blogId: b.blogId, userId, userToken, integrationSource: 'MCP' });
        try {
          const r = await fetch(`${API}${path}?${qs}`, { headers: { 'X-Mc-Auth': userToken, 'Accept': 'application/json' } });
          const t = await r.text();
          return { path, status: r.status, sample: t.slice(0, 400) };
        } catch (e) { return { path, error: String(e && e.message || e) }; }
      };
      const results = await Promise.all([
        tryUrl('/v2/analytics/evolution/facebookAds'),
        tryUrl('/v2/analytics/evolution/metaAds'),
        tryUrl('/v2/analytics/evolution/googleAds'),
        tryUrl('/v2/analytics/timeline/facebookAds'),
        tryUrl('/v2/analytics/posts/facebook'),
      ]);
      return res.status(200).json({ from: fromISO, to: toISO, results });
    }

    const jobs = [];
    for (const net of b.networks) {
      for (const [key, id] of Object.entries(METRICS[net] || {})) {
        jobs.push(mc(`/stats/timeline/${id}`).then(raw => ({ net, key, series: extractSeries(raw) })));
      }
    }
    const settled = await Promise.all(jobs);

    const out = { brand: b.label, slug: String(brand).toLowerCase(), blogId: b.blogId, from: start, to: end, data: {}, series: {} };
    for (const net of b.networks) out.data[net] = {};

    for (const { net, key, series } of settled) {
      const vals = series.map(p => p.value);
      out.data[net][key] = AGG[key] === 'last' ? (vals.length ? vals[vals.length - 1] : null) : sum(vals);
      if ((net === 'metaAds' && key === 'spend') || (net === 'instagram' && key === 'reach')) {
        out.series[`${net}_${key}`] = series;
      }
    }

    const m = out.data.metaAds, g = out.data.googleAds;
    if (m) { m.ctr = pct(m.clicks, m.impressions); m.cpc = ratio(m.spend, m.clicks); m.cpm = m.impressions ? (m.spend/m.impressions)*1000 : null; m.frequency = ratio(m.impressions, m.reach); }
    if (g) { g.ctr = pct(g.clicks, g.impressions); g.cpc = ratio(g.cost, g.clicks); }
    if (out.data.instagram) out.data.instagram.net = num(out.data.instagram.gained) - num(out.data.instagram.lost);

    res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=3600');
    return res.status(200).json(out);
  } catch (err) {
    console.error('[metrics]', err);
    return res.status(502).json({ error: 'No se pudo leer Metricool', detail: String(err && err.message || err) });
  }
}

async function fetchMetricool(path, { blogId, userId, userToken, start, end, ...extra }) {
  const qs = new URLSearchParams({ blogId, userId, userToken, start, end, ...extra });
  const r = await fetch(`${API}${path}?${qs}`, { headers: { 'X-Mc-Auth': userToken, 'Accept': 'application/json' } });
  if (!r.ok) throw new Error(`Metricool ${r.status} en ${path}`);
  return r.json();
}

function extractSeries(raw) {
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw && raw.data) ? raw.data
    : Array.isArray(raw && raw.values) ? raw.values : [];
  return arr.map(p => {
    // Metricool devuelve pares ["YYYYMMDD","valor"].
    if (Array.isArray(p)) return { date: normDate(p[0]), value: Number(p[1]) || 0 };
    return {
      date: normDate(p.date || p.dateTime || (p.day && p.day.date) || null),
      value: Number(p.value != null ? p.value : (Array.isArray(p.values) ? p.values[0] : p)) || 0,
    };
  });
}
function normDate(s) {
  if (!s) return null;
  const m = String(s).match(/^(\d{4})(\d{2})(\d{2})$/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : String(s).slice(0, 10);
}

const sum = a => a.reduce((s, v) => s + (Number(v) || 0), 0);
const num = v => Number(v) || 0;
const ratio = (a, b) => (b ? a / b : null);
const pct = (a, b) => (b ? (a / b) * 100 : null);
function ymd(d) {
  const s = String(d || '').trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[1]}${m[2]}${m[3]}` : (/^\d{8}$/.test(s) ? s : null);
}
