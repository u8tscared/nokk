// Photo des boîtes aux lettres → noms (et étages quand ils sont écrits), lus par le serveur Nokk.
import { parseFloor } from './residents.js';

const API = () => (typeof window !== 'undefined' && window.__nokkApi) || 'https://nokk-api.marceau-ruis.workers.dev';

export async function readMailboxPhoto(image, { signal } = {}) {
  let r;
  try {
    r = await fetch(API() + '/boites/read', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ image }), signal });
  } catch (e) {
    if (e?.name === 'AbortError') throw e;
    throw Object.assign(new Error('network'), { code: 'network' });
  }
  const j = await r.json().catch(() => null);
  if (!r.ok) throw Object.assign(new Error(j?.error || 'boites'), { code: r.status === 404 || r.status === 401 ? 'soon' : j?.error || 'error' });
  return (j?.boites || []).map((b) => ({ name: b.nom, floor: parseFloor(b.etage), unit: b.porte || undefined }));
}

export const PHOTO_ERRORS = {
  network: 'Pas de réseau ici. Saisissez les noms à la main, ou réessayez dehors.',
  unreadable: 'Les noms ne sont pas lisibles. Reprenez la photo plus près, bien en face, sans reflet.',
  bad_image: 'Photo trop lourde ou illisible. Reprenez-la.',
  soon: 'La lecture des photos arrive dans quelques minutes. En attendant, saisissez les noms à la main.',
  error: 'La lecture n\'a pas marché. Réessayez, ou saisissez les noms à la main.',
};
