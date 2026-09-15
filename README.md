# ads.sentido.mx — Panel interno de resultados

Herramienta interna tipo Swydo: monitoreo y reportes de pauta (Meta Ads, Google
Ads) y redes (Instagram, Facebook) para los clientes de Sentido. Un hub por
cliente, con selector de fechas, y análisis concreto sobre cada bloque.

Se controla desde la app **y** desde Claude Code (que lee la misma data para
optimizar, redactar la lectura del mes y responder sobre cualquier cuenta).

## Cómo funciona

- **Fuente de datos:** Metricool (ya agrega Meta Ads, Google Ads, IG y FB de
  todas las marcas). La función `/api/metrics` traduce un rango de fechas a
  llamadas de la API de Metricool y devuelve un JSON normalizado.
- **Filtrado:** todo filtro se reduce a `desde/hasta`. El front los calcula
  (presets o custom) y `/api/metrics` trae esa data. Real-time por rango.
- **Análisis:** Nivel 1 (callouts computados en el front, se recalculan con
  cualquier rango) + Nivel 2 (la "Lectura del mes", que redacta Sentido desde
  Claude Code) + Nivel 3 (conversación en proyectos de Claude).
- **Diseño:** sistema visual estricto de Sentido (tinta + hueso, Archivo, buril,
  rombo). Sin color, sin tarjetas, sin semáforos. Ver `assets/panel.css`.

## Estructura

```
api/metrics.js   — lee Metricool (agnóstico de fuente: Meta nativo se enchufa aquí)
api/login.js     — login del panel → cookie de sesión
api/logout.js    — cierra sesión
api/session.js   — dice si hay sesión y devuelve la lista de marcas
index.html       — login + índice de clientes
hub.html         — el hub de cada cliente (ads.sentido.mx/:marca)
assets/          — CSS del panel, logos, favicon, fuente Archivo
vercel.json      — ruteo /:marca → hub, noindex en todo
```

## Deploy (una vez)

1. **Vercel → Add New → Project** → importar el repo `jos-sentido/ads-sentido`.
   Framework preset: **Other**. Sin build command. Output: raíz.
2. **Settings → Environment Variables** (Production + Preview):
   - `METRICOOL_USER_ID`, `METRICOOL_USER_TOKEN` — de Metricool (Configuración → API).
   - `PANEL_PASSWORD`, `PANEL_TOKEN` — contraseña de acceso y un token largo aleatorio.
   - Opcional: `PANEL_PASSWORD_2` / `PANEL_TOKEN_2` para un segundo usuario.
3. **Settings → Domains** → agregar `ads.sentido.mx`. Vercel indica el registro
   DNS (un CNAME) a agregar donde administras `sentido.mx`.

> Nota: para ver algo hay que iniciar sesión. Sin `METRICOOL_*` configurado, el
> hub de Amancay muestra **datos de ejemplo** (marcados) hasta conectar la API.

## Confirmar el shape de Metricool (primer deploy)

La API de Metricool no se pudo probar desde el entorno de desarrollo. En el
primer deploy, ya con sesión iniciada, abrir una vez:

```
/api/metrics?brand=amancay&from=2026-08-01&to=2026-08-31&debug=timeline&metric=FAEV04
```

y confirmar el formato de la serie diaria. Si difiere del esperado, se ajusta
`extractSeries()` en `api/metrics.js`.

## Agregar un cliente

Registrar la marca en dos lugares (slug + `blogId` de Metricool):
`api/metrics.js` (constante `BRANDS`) y `api/session.js` (lista `BRANDS`).

## Variables de entorno

Ver `.env.local.example`. Nunca comitear valores reales — `.env.local` está en
`.gitignore` y en producción viven en Vercel.
