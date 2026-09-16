// /api/metrics — Sirve la analítica del panel desde el snapshot de datos reales
// de Metricool (api/_data.js), que se regenera con el job programado a través
// del conector de Metricool (más confiable que la API pública fragmentada).
//
// El diseño sigue siendo AGNÓSTICO DE FUENTE: mañana el snapshot puede venir de
// un cron con el conector, de Meta Ads nativo, o de la API REST — la función y
// el front no cambian.
//
// ── Variables de entorno ──  METRICOOL_* ya no se usan aquí; solo PANEL_TOKEN.
//
// ── Contrato ──  GET /api/metrics?brand=amancay&from=2026-08-01&to=2026-08-31
//   Devuelve el período (mes) que cae dentro del rango, con razones calculadas.

import SNAP from './_data.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const cookie = req.headers.cookie || '';
  const ok = process.env.PANEL_TOKEN && cookie.includes(`panel_token=${process.env.PANEL_TOKEN}`);
  if (!ok) return res.status(401).json({ error: 'No autorizado' });

  const { brand, from, to } = req.query;
  const slug = String(brand || '').toLowerCase();
  const snap = SNAP[slug];
  if (!snap) return res.status(404).json({ error: `Marca desconocida: ${brand}` });

  const start = ymd(from), end = ymd(to);
  if (!start || !end) return res.status(400).json({ error: 'from/to requeridos (YYYY-MM-DD)' });

  // Por ahora el snapshot es mensual: se sirve el mes que contiene el rango.
  const monthKey = `${start.slice(0, 4)}-${start.slice(4, 6)}`;
  const sameMonth = `${end.slice(0, 4)}-${end.slice(4, 6)}` === monthKey;
  const period = sameMonth && snap.periods[monthKey];
  if (!period) {
    return res.status(404).json({ error: 'Sin datos para este rango', available: Object.keys(snap.periods) });
  }

  const data = JSON.parse(JSON.stringify(period.data));
  const m = data.metaAds, g = data.googleAds, ig = data.instagram;
  if (m) { m.ctr = pct(m.clicks, m.impressions); m.cpc = ratio(m.spend, m.clicks); m.cpm = m.impressions ? (m.spend / m.impressions) * 1000 : null; m.frequency = ratio(m.impressions, m.reach); }
  if (g) { g.ctr = pct(g.clicks, g.impressions); g.cpc = ratio(g.cost, g.clicks); }
  if (ig) ig.net = num(ig.gained) - num(ig.lost);

  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=1800');
  return res.status(200).json({
    brand: snap.brand, slug, from: start, to: end, updated: snap.updated,
    data, series: period.series || {},
  });
}

const num = v => Number(v) || 0;
const ratio = (a, b) => (b ? a / b : null);
const pct = (a, b) => (b ? (a / b) * 100 : null);
function ymd(x) {
  const s = String(x || '').trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[1]}${m[2]}${m[3]}` : (/^\d{8}$/.test(s) ? s : null);
}
