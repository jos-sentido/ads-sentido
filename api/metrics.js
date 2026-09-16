// /api/metrics — Lee analítica de Metricool para una marca y un rango de fechas.
//
// Endpoint correcto: GET /api/v2/analytics/timelines
//   ?network=<red>&metric=<códigoDataStudio>&from=<ISO>&to=<ISO>&timezone=<tz>
//   &blogId=<>&userId=<>&integrationSource=MCP   + header X-Mc-Auth
// Respuesta: { data: [["YYYYMMDD"|ISO, valor], ...] }  (serie diaria)
//
// Diseño agnóstico de fuente: para meter Meta Ads nativo (Marketing API) más
// adelante, se cambia solo el proveedor de la red 'metaAds' sin tocar el resto.
//
// ── Variables de entorno (Vercel → Settings → Environment Variables) ──
//   METRICOOL_USER_ID, METRICOOL_USER_TOKEN, PANEL_TOKEN
//
// ── Contrato ──
//   GET /api/metrics?brand=amancay&from=2026-08-01&to=2026-08-31
//   GET /api/metrics?...&debug=1&metric=FAEV04&network=metaAds  → respuesta cruda

const API = 'https://app.metricool.com/api';
const TZ = 'America/Mexico_City';

const BRANDS = {
  amancay:  { blogId: 1610215, label: 'Amancay',         networks: ['metaAds','googleAds','instagram','facebook'] },
  bolongo:  { blogId: 1140633, label: 'Bolongo',         networks: ['metaAds','googleAds','instagram','facebook'] },
  brelia:   { blogId: 2066332, label: 'Brelia',          networks: ['metaAds','googleAds','instagram','facebook'] },
  heredit:  { blogId: 3777294, label: 'Heredit',         networks: ['metaAds','googleAds','instagram','facebook'] },
  essentia: { blogId: 2425775, label: 'Essentia Country',networks: ['metaAds','googleAds','instagram','facebook'] },
};

// red → { métrica normalizada: código de Data Studio de Metricool }
const METRICS = {
  metaAds:   { spend: 'FAEV04', impressions: 'FAEV01', reach: 'FAEV03', clicks: 'FAEV05' },
  googleAds: { cost: 'GAEV02', impressions: 'GAEV01', clicks: 'GAEV03', conversions: 'GAEV04' },
  instagram: { followers: 'IGEV01', reach: 'IGEV06', views: 'IGEV05', gained: 'IGEV43', lost: 'IGEV44', engaged: 'IGEV42' },
  facebook:  { followers: 'FBEV17', interactions: 'FBEV10', pageViews: 'FBEV03', contentViews: 'FBEV49' },
};

const AGG = {
  spend:'sum', cost:'sum', impressions:'sum', clicks:'sum', reach:'sum', conversions:'sum',
  views:'sum', gained:'sum', lost:'sum', engaged:'sum', interactions:'sum', pageViews:'sum', contentViews:'sum',
  followers:'last',
};

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const cookie = req.headers.cookie || '';
  const ok = process.env.PANEL_TOKEN && cookie.includes(`panel_token=${process.env.PANEL_TOKEN}`);
  if (!ok) return res.status(401).json({ error: 'No autorizado' });

  const userId = process.env.METRICOOL_USER_ID;
  const userToken = process.env.METRICOOL_USER_TOKEN;
  if (!userId || !userToken) return res.status(500).json({ error: 'Falta METRICOOL_USER_ID / METRICOOL_USER_TOKEN' });

  const { brand, from, to, debug, metric, network } = req.query;
  const b = BRANDS[String(brand || '').toLowerCase()];
  if (!b) return res.status(404).json({ error: `Marca desconocida: ${brand}` });

  const start = ymd(from), end = ymd(to);
  if (!start || !end) return res.status(400).json({ error: 'from/to requeridos (YYYY-MM-DD)' });
  const fromISO = `${dash(start)}T00:00:00`, toISO = `${dash(end)}T23:59:59`;
  const ctx = { blogId: b.blogId, userId, userToken, fromISO, toISO };

  try {
    if (debug) {
      const net = String(network || 'metaAds'), m = String(metric || 'FAEV04');
      const raw = await timeline(net, m, ctx).catch(e => ({ error: String(e && e.message || e) }));
      return res.status(200).json({ network: net, metric: m, from: fromISO, to: toISO, raw });
    }

    const jobs = [];
    for (const net of b.networks) {
      for (const [key, id] of Object.entries(METRICS[net] || {})) {
        jobs.push(timeline(net, id, ctx).then(raw => ({ net, key, series: extractSeries(raw) })).catch(() => ({ net, key, series: [] })));
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

async function timeline(net, metricId, { blogId, userId, userToken, fromISO, toISO }) {
  const qs = new URLSearchParams({
    network: net, metric: metricId, from: fromISO, to: toISO, timezone: TZ,
    blogId, userId, userToken, integrationSource: 'MCP',
  });
  const r = await fetch(`${API}/v2/analytics/timelines?${qs}`, { headers: { 'X-Mc-Auth': userToken, 'Accept': 'application/json' } });
  if (!r.ok) throw new Error(`Metricool ${r.status} en ${net}/${metricId}`);
  return r.json();
}

// { data: [["YYYYMMDD"|ISO, valor], ...] } o [{value}] → [{date, value}]
function extractSeries(raw) {
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw && raw.data) ? raw.data
    : Array.isArray(raw && raw.values) ? raw.values : [];
  return arr.map(p => {
    if (Array.isArray(p)) return { date: normDate(p[0]), value: Number(p[1]) || 0 };
    return {
      date: normDate(p.date || p.dateTime || (p.day && p.day.date) || null),
      value: Number(p.value != null ? p.value : (Array.isArray(p.values) ? p.values[0] : p)) || 0,
    };
  });
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
function dash(yyyymmdd) { return `${yyyymmdd.slice(0,4)}-${yyyymmdd.slice(4,6)}-${yyyymmdd.slice(6,8)}`; }
function normDate(s) {
  if (!s) return null;
  const m = String(s).match(/^(\d{4})(\d{2})(\d{2})$/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : String(s).slice(0, 10);
}
