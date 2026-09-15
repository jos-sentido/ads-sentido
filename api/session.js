// /api/session — Dice si hay sesión válida y, si la hay, devuelve la lista de
// marcas para el índice. Se usa desde el front (la cookie es HttpOnly y JS no
// la puede leer directamente).

const BRANDS = [
  { slug: 'amancay',  label: 'Amancay' },
  { slug: 'bolongo',  label: 'Bolongo' },
  { slug: 'brelia',   label: 'Brelia' },
  { slug: 'heredit',  label: 'Heredit' },
  { slug: 'essentia', label: 'Essentia Country' },
];

export default async function handler(req, res) {
  const cookie = req.headers.cookie || '';
  const authed = [process.env.PANEL_TOKEN, process.env.PANEL_TOKEN_2]
    .filter(Boolean)
    .some(tk => cookie.includes(`panel_token=${tk}`));
  return res.status(200).json({ authed, brands: authed ? BRANDS : [] });
}
