# ads.sentido.mx — Panel interno de resultados de pauta y redes

Herramienta interna de Sentido (tipo Swydo). Vive en su propio subdominio,
**separada** de `propuestas.sentido.mx`. Muestra métricas y nombres de clientes,
así que es superficie privada: detrás de login, con `noindex`, y nunca se
publican estos datos en superficies abiertas.

## Qué es cada cosa

- `api/metrics.js` — lee Metricool (fuente única hoy). **Agnóstico de fuente:**
  para meter Meta Ads nativo (Marketing API) se cambia solo el proveedor de la
  red `metaAds`, sin tocar el resto.
- `api/login.js` / `logout.js` / `session.js` — acceso por cookie.
- `index.html` — login + índice de clientes.
- `hub.html` — el hub de cada cliente (`/:marca`), con selector de rango,
  gráficas con hover y análisis por bloque.
- `assets/panel.css` — el sistema visual (ver abajo).

## Arquitectura de datos (no romper el modelo)

- **Filtro = `desde/hasta`.** Los presets solo calculan esas dos fechas.
- **`/api/metrics` devuelve un shape normalizado:** `{ data:{ metaAds, googleAds,
  instagram, facebook }, series:{ metaAds_spend, instagram_reach } }`. El front
  (`hub.html`) consume ese shape; los datos de ejemplo lo replican.
- **Análisis en 3 niveles:** (1) callouts computados en el front — se recalculan
  con cualquier rango, sin IA; (2) "Lectura del mes", la redacta Sentido desde
  Claude Code; (3) conversación en proyectos de Claude sobre la misma data.
- **Métricas por red = ids de Data Studio de Metricool** (ej. `FAEV04` = spend de
  Meta Ads). Están en `METRICS` dentro de `api/metrics.js`.

## Sistema visual — estricto de Sentido

Es superficie institucional: manda el sistema de la marca. Referencia completa en
el repo `Sentido` (`SISTEMA-VISUAL.md`). Reglas que aquí se aplican:

- **Tinta y hueso, sin color.** Meta vs Google se distinguen por columnas con
  regla y densidad, no por azul/rojo. Las variaciones van con flecha de hueso,
  nunca semáforo verde/rojo.
- **Sin tarjetas.** KPIs en plancha de renglones; grupos en columnas con regla.
- **Archivo** (auto-hospedada), titular de dos pesos, cifras con `tabular-nums`.
- **Sin gris, sin cursiva, sin gradientes/glow, sin íconos** (el rombo cubre esa
  función). Piso de 11px. Contraste mínimo 4.5:1.
- Una sección en **papel** (la lectura) invierte los tokens.
- Logo: no se recompone. El ojo se graba como buril enmascarado (`.ojo`) porque
  el isotipo PNG es negro y desaparece en fondo oscuro.

## Restricciones de publicación (del cliente, no negociables)

Sin precios en superficies públicas, sin métricas de cliente en abierto (este
panel es privado y por eso sí las muestra, con login), único dato de trayectoria
autorizado: «desde 2010».

## Deploy y variables

Ver `README.md`. Secretos por variable de entorno en Vercel; nunca en el repo.
