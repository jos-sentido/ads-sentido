// Snapshot de datos REALES de Metricool (vía el conector, no la API pública).
// Se regenera con el job programado. Archivo con prefijo "_": Vercel no lo
// expone como endpoint ni lo sirve como estático — solo lo importa la función.
//
// Forma por marca: { brand, updated, periods: { 'YYYY-MM': { data, series } } }
// data = métricas BASE por red (la función calcula ctr/cpc/cpm/frecuencia/net).

const d = n => `2026-08-${String(n).padStart(2, '0')}`;
const AMANCAY_SPEND_AGO = [0,0,0,694.44,2079.11,1337.98,1242.73,1136.87,1726.58,1400.88,1295.78,1878.28,1831,1312.86,969.24,1692.56,1468.15,1570,1520.71,1681.16,948.48,0,0,1268.27,2240.84,2082.51,1689.39,1751.96,1540.37,1863.58,757.25];
const AMANCAY_REACH_AGO = [22,17,37,1424,2637,1682,1288,2202,2896,2025,1522,3477,2623,1721,1897,3289,2819,3014,3289,3418,2088,71,80,3471,4635,2875,3913,2385,2937,2172,907];

export default {
  amancay: {
    brand: 'Amancay',
    updated: '2026-09-16',
    periods: {
      '2026-08': {
        data: {
          metaAds:   { spend: 38980.98, impressions: 127273, reach: 56261, clicks: 1896 },
          googleAds: { cost: 15957.76, impressions: 11096, clicks: 925, conversions: 0 },
          instagram: { followers: 1961, reach: 66833, views: 134264, gained: 43, lost: 19, engaged: 91 },
          facebook:  { followers: 1471, interactions: 47, pageViews: 725, contentViews: 42580 },
        },
        series: {
          metaAds_spend: AMANCAY_SPEND_AGO.map((v, i) => ({ date: d(i + 1), value: v })),
          instagram_reach: AMANCAY_REACH_AGO.map((v, i) => ({ date: d(i + 1), value: v })),
        },
      },
      '2026-07': {
        data: {
          metaAds:   { spend: 40000, impressions: 178468, reach: 91395, clicks: 1824 },
          googleAds: { cost: 16294.68, impressions: 61837, clicks: 3147, conversions: 0 },
          instagram: { followers: 1937, reach: 115961, views: 221251, gained: 36, lost: 15, engaged: 136 },
          facebook:  { followers: 1466, interactions: 68, pageViews: 448, contentViews: 43311 },
        },
        series: {},
      },
    },
  },
};
