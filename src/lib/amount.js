// « 12 », « 12,5 », « 0,1 », « 0.10 € » → centimes. Vide ou illisible → null.
export function parseAmount(txt) {
  const s = String(txt ?? '').replace(/\s|€/g, '').replace(',', '.');
  if (!s || s === '.') return null;
  if (!/^\d{0,5}(\.\d{0,2})?$/.test(s)) return null;
  return Math.round(parseFloat(s) * 100);
}
