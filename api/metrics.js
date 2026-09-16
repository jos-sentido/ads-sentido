// /api/metrics — Sirve la analítica del panel agregando CUALQUIER rango de
// fechas desde series DIARIAS reales de Metricool (api/_data.js), que se
// regeneran con el job programado a través del conector de Metricool.
//
// Diseño agnóstico de fuente: el snapshot puede venir del conector, de un cron,
// de Meta Ads nativo o de REST — la función y el front no cambian.
//
// ── Contrato ──  GET /api/metrics?brand=amancay&from=2026-08-17&to=2026-09-15
//   Filtra las series diarias al rango [from, to] y agrega: suma las métricas
//   aditivas, toma el último valor de las de stock (seguidores), y calcula
//   ctr/cpc/cpm/frecuencia. Devuelve también las series diarias del rango.

import SNAP from './_data.js';

// Qué métricas trae cada red (nombres normalizados que consume el front).
const NET_KEYS = {
  metaAds:   ['spend','impressions','clicks'],
  googleAds: ['cost','impressions','clicks','conversions'],
  instagram: ['followers','reach','views','gained','lost','engaged'],
  facebook:  ['followers','interactions','pageViews','contentViews'],
};
const LAST = new Set(['followers']); // stock, no aditivo → último valor del rango

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const cookie = req.headers.cookie || '';
  const ok = process.env.PANEL_TOKEN && cookie.includes(`panel_token=${process.env.PANEL_TOKEN}`);
  if (!ok) return res.status(401).json({ error: 'No autorizado' });

  const { brand, from, to } = req.query;
  const slug = String(brand || '').toLowerCase();
  const snap = SNAP[slug];
  if (!snap) return res.status(404).json({ error: `Marca desconocida: ${brand}` });

  const f = dash(from), t = dash(to);
  if (!f || !t) return res.status(400).json({ error: 'from/to requeridos (YYYY-MM-DD)' });
  const [lo, hi] = f <= t ? [f, t] : [t, f];

  const D = snap.daily || {};
  const inRange = arr => (arr || []).filter(p => p.date >= lo && p.date <= hi);
  const agg = (net, key) => {
    const pts = inRange(D[net] && D[net][key]);
    if (!pts.length) return LAST.has(key) ? null : 0;
    return LAST.has(key) ? pts[pts.length - 1].value : pts.reduce((s, p) => s + (Number(p.value) || 0), 0);
  };

  const data = {};
  let any = false;
  for (const net of Object.keys(NET_KEYS)) {
    data[net] = {};
    for (const key of NET_KEYS[net]) {
      const v = agg(net, key);
      data[net][key] = v;
      if (v) any = true;
    }
  }
  if (!any) return res.status(404).json({ error: 'Sin datos para este rango', window: snap.window || null });

  const m = data.metaAds, g = data.googleAds, ig = data.instagram;
  if (m) { m.ctr = pct(m.clicks, m.impressions); m.cpc = ratio(m.spend, m.clicks); m.cpm = m.impressions ? (m.spend / m.impressions) * 1000 : null; }
  if (g) { g.ctr = pct(g.clicks, g.impressions); g.cpc = ratio(g.cost, g.clicks); }
  if (ig) ig.net = num(ig.gained) - num(ig.lost);

  const series = {
    metaAds_spend: inRange(D.metaAds && D.metaAds.spend),
    instagram_reach: inRange(D.instagram && D.instagram.reach),
  };

  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=1800');
  return res.status(200).json({ brand: snap.brand, slug, from: lo, to: hi, updated: snap.updated, data, series });
}

const num = v => Number(v) || 0;
const ratio = (a, b) => (b ? a / b : null);
const pct = (a, b) => (b ? (a / b) * 100 : null);
function dash(x) {
  const s = String(x || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}
