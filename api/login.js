// /api/login — Valida la contraseña del panel y emite la cookie de sesión.
//
// Variables de entorno:
//   PANEL_PASSWORD   — contraseña de acceso al panel
//   PANEL_TOKEN      — token de sesión que se guarda en la cookie
//   (opcionales, para un segundo usuario)
//   PANEL_PASSWORD_2 / PANEL_TOKEN_2

const USERS = [
  { pw: 'PANEL_PASSWORD',   tk: 'PANEL_TOKEN' },
  { pw: 'PANEL_PASSWORD_2', tk: 'PANEL_TOKEN_2' },
];

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { password } = req.body || {};
  if (!password) return res.status(401).json({ error: 'Contraseña incorrecta' });

  for (const u of USERS) {
    const pw = process.env[u.pw], tk = process.env[u.tk];
    if (!pw || !tk) continue;
    if (password === pw) {
      const maxAge = 60 * 60 * 24 * 30; // 30 días
      res.setHeader('Set-Cookie', `panel_token=${tk}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`);
      return res.status(200).json({ ok: true });
    }
  }
  return res.status(401).json({ error: 'Contraseña incorrecta' });
}
