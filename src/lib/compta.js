// Comptabilité : tout se recalcule à partir du journal des passages (une seule source de vérité).
import { totals, groupBy } from './model.js';

export function handedIds(handovers) {
  const s = new Set();
  for (const h of handovers) for (const id of h.visitIds || []) s.add(id);
  return s;
}

// Ce qu'un équipier (ou un binôme) a encore « en poche » : dons pas encore remis.
export function pocket(d, memberId) {
  const handed = handedIds(d.handovers);
  const list = d.visits.filter((v) => v.result === 'donne' && !handed.has(v.id) && (v.by || []).includes(memberId));
  // Pour les secteurs remis avant le suivi par passage (anciennes remises par secteur).
  const legacy = new Set(d.handovers.filter((h) => h.sectorId && !h.visitIds).map((h) => h.sectorId + '|' + h.from));
  const filtered = list.filter((v) => !legacy.has(v.sectorId + '|' + memberId) && !(v.by || []).some((b) => legacy.has(v.sectorId + '|' + b)));
  return { visits: filtered, ...totals(filtered) };
}

export function breakdown(d) {
  const all = totals(d.visits);
  const bySector = d.sectors.map((s) => {
    const vs = d.visits.filter((v) => v.sectorId === s.id);
    return { id: s.id, name: s.name, area: s.area, doors: d.doors.filter((x) => x.sectorId === s.id).length, ...totals(vs) };
  });
  // Par équipier : un don fait à deux compte pour chacun (part égale pour le montant).
  const byMember = d.members.map((m) => {
    const vs = d.visits.filter((v) => (v.by || []).includes(m.id));
    const t = totals(vs);
    const share = vs.filter((v) => v.result === 'donne').reduce((s, v) => s + Math.round((v.amount || 0) / Math.max(1, (v.by || []).length)), 0);
    const stockIn = d.stock.filter((x) => x.memberId === m.id).reduce((s, x) => s + x.qty, 0);
    const given = vs.filter((v) => v.result === 'donne').reduce((s, v) => s + Math.round((v.calendars ?? 1) / Math.max(1, (v.by || []).length)), 0);
    return { id: m.id, name: m.name, role: m.role, color: m.color, ...t, share, stockIn, calendarsLeft: Math.max(0, stockIn - given) };
  });
  const days = [...groupBy(d.visits.filter((v) => v.result === 'donne'), (v) => new Date(v.ts).toISOString().slice(0, 10)).entries()]
    .map(([day, vs]) => ({ day, ...totals(vs) }))
    .sort((a, b) => a.day.localeCompare(b.day));
  const handed = handedIds(d.handovers);
  let handedAmount = 0;
  for (const h of d.handovers) handedAmount += h.counted ?? h.expected ?? 0;
  const cashHanded = d.handovers.reduce((s, h) => s + (h.counted ?? 0), 0);
  const cashExpected = all.especes;
  const diffs = d.handovers.reduce((s, h) => s + (h.diff || 0), 0);
  // Comparaison avec l'an dernier, sur les mêmes portes.
  const doorsById = new Map(d.doors.map((x) => [x.id, x]));
  let ly = 0, now = 0;
  const seen = new Set();
  for (const v of d.visits) {
    if (v.result !== 'donne') continue;
    const door = doorsById.get(v.doorId);
    if (!door?.lastYear?.amount) continue;
    now += v.amount || 0;
    if (!seen.has(door.id)) { ly += door.lastYear.amount; seen.add(door.id); }
  }
  const vsLastYear = ly ? Math.round(((now - ly) / ly) * 100) : null;
  const stockTotal = d.org?.stock || 0;
  const stockOut = d.stock.reduce((s, x) => s + x.qty, 0);
  return { all, bySector, byMember, days, handedCount: handed.size, handedAmount, cashHanded, cashExpected, diffs, vsLastYear, stockTotal, stockOut };
}

export function chequeList(d, visits = d.visits) {
  const doors = new Map(d.doors.map((x) => [x.id, x]));
  return visits
    .filter((v) => v.result === 'donne' && v.method === 'cheque')
    .map((v) => ({ ...v, address: doors.get(v.doorId) ? `${doors.get(v.doorId).num} ${doors.get(v.doorId).street}` : '' }));
}

export function csv(d) {
  const doors = new Map(d.doors.map((x) => [x.id, x]));
  const sectors = new Map(d.sectors.map((s) => [s.id, s]));
  const members = new Map(d.members.map((m) => [m.id, m]));
  const esc = (x) => {
    const s = x == null ? '' : String(x);
    return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const head = ['Date', 'Heure', 'Secteur', 'Numéro', 'Rue', 'Étage', 'Logement', 'Résultat', 'Montant (€)', 'Paiement', 'Calendriers', 'Nom', 'N° chèque', 'Équipe', 'Note'];
  const R = { donne: 'Donné', absent: 'Absent', refus: 'Refus', deja: 'Déjà pris' };
  const M = { especes: 'Espèces', carte: 'Carte', cheque: 'Chèque' };
  const rows = [...d.visits].sort((a, b) => a.ts - b.ts).map((v) => {
    const dt = new Date(v.ts);
    const door = doors.get(v.doorId);
    const r = v.rid ? door?.residents?.find((x) => x.id === v.rid) : null;
    const f = r ? r.floor : null;
    return [
      dt.toLocaleDateString('fr-FR'), dt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
      sectors.get(v.sectorId)?.name, door?.num, door?.street, f == null ? '' : f === 0 ? 'RDC' : f < 0 ? 'Sous-sol' : f, v.unit, R[v.result],
      v.result === 'donne' ? ((v.amount || 0) / 100).toFixed(2).replace('.', ',') : '', v.result === 'donne' ? M[v.method] : '',
      v.result === 'donne' ? v.calendars ?? 1 : '', v.name, v.chequeNo,
      (v.by || []).map((id) => members.get(id)?.name).filter(Boolean).join(' & '), v.note,
    ].map(esc).join(';');
  });
  // BOM pour qu'Excel lise bien les accents.
  return '﻿' + [head.join(';'), ...rows].join('\r\n');
}
