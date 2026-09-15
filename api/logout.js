// /api/logout — Borra la cookie de sesión del panel.
export default async function handler(req, res) {
  res.setHeader('Set-Cookie', 'panel_token=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0');
  return res.status(200).json({ ok: true });
}
