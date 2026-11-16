// Fusion à trois de deux saisies faites en même temps sur le même élément (une porte, un immeuble…).
// base : la version de départ commune, mine : celle de ce téléphone, theirs : celle arrivée du serveur.
// Chaque champ modifié d'un seul côté est gardé ; les listes d'objets (habitants…) sont fusionnées par
// identifiant, donc deux noms ajoutés en même temps restent tous les deux. Si le même champ a été changé
// des deux côtés, la saisie de ce téléphone l'emporte (c'est la plus récente : elle part maintenant).

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const hasId = (v) => isObj(v) && v.id != null;

export function same(a, b) {
  if (a === b) return true;
  try { return JSON.stringify(a) === JSON.stringify(b); } catch { return false; }
}

function mergeObjects(base, mine, theirs) {
  const b = isObj(base) ? base : {};
  const out = {};
  for (const k of new Set([...Object.keys(theirs), ...Object.keys(mine)])) {
    const inM = k in mine;
    const inT = k in theirs;
    const inB = k in b;
    if (inM && inT) { out[k] = merge3(b[k], mine[k], theirs[k]); continue; }
    // Présent d'un seul côté : ajouté de ce côté, ou retiré de l'autre.
    const v = inM ? mine[k] : theirs[k];
    if (inB && same(b[k], v)) continue; // l'autre côté l'a retiré, celui-ci n'y avait pas touché
    out[k] = v; // ajouté, ou modifié d'un côté et retiré de l'autre : on garde la donnée
  }
  return out;
}

function mergeById(base, mine, theirs) {
  const index = (a) => new Map((a || []).filter(hasId).map((x) => [x.id, x]));
  const B = index(base);
  const M = index(mine);
  const T = index(theirs);
  const out = [];
  const done = new Set();
  const take = (id) => {
    if (done.has(id)) return;
    done.add(id);
    const inB = B.has(id);
    const m = M.get(id);
    const t = T.get(id);
    if (m && t) { out.push(merge3(B.get(id), m, t)); return; }
    const v = m || t;
    // Retiré d'un côté sans être modifié de l'autre : retiré.
    if (inB && same(B.get(id), v)) return;
    out.push(v);
  };
  // Ordre du serveur d'abord, puis les ajouts de ce téléphone à leur place.
  for (const x of theirs) if (hasId(x)) take(x.id);
  for (const x of mine) if (hasId(x)) take(x.id);
  return out;
}

function mergeSets(base, mine, theirs) {
  const key = (v) => (typeof v === 'object' ? JSON.stringify(v) : String(v));
  const B = new Set((base || []).map(key));
  const M = new Set(mine.map(key));
  const T = new Set(theirs.map(key));
  const out = [];
  const seen = new Set();
  for (const v of [...theirs, ...mine]) {
    const k = key(v);
    if (seen.has(k)) continue;
    seen.add(k);
    const removedM = B.has(k) && !M.has(k);
    const removedT = B.has(k) && !T.has(k);
    if (removedM || removedT) continue;
    out.push(v);
  }
  return out;
}

export function merge3(base, mine, theirs) {
  if (same(mine, theirs)) return theirs;
  if (base !== undefined && same(base, mine)) return theirs;
  if (base !== undefined && same(base, theirs)) return mine;
  if (isObj(mine) && isObj(theirs)) return mergeObjects(base, mine, theirs);
  if (Array.isArray(mine) && Array.isArray(theirs)) {
    const b = Array.isArray(base) ? base : [];
    const all = [...b, ...mine, ...theirs];
    if (all.length && all.every(hasId)) return mergeById(b, mine, theirs);
    if (all.every((v) => v === null || typeof v !== 'object')) return mergeSets(b, mine, theirs);
  }
  return mine;
}
