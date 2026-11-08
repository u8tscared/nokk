// Exports PDF (chargés à la demande pour garder l'app légère).
import { breakdown, chequeList } from './compta.js';
import { formatEuro, totals, DENOMS } from './model.js';

const INK = [18, 38, 42];
const GREEN = [54, 122, 109];
const CORAL = [217, 85, 79];
const MUTED = [91, 109, 113];

async function lib() {
  const { jsPDF } = await import('jspdf');
  const { autoTable } = await import('jspdf-autotable');
  return { jsPDF, autoTable };
}

// jsPDF n'a pas l'espace fine insécable : on la remplace.
const e = (c) => formatEuro(c, { decimals: 2 }).replace(/ | /g, ' ');
const clean = (s) => String(s ?? '').replace(/ | /g, ' ');

function header(doc, title, d) {
  const w = doc.internal.pageSize.getWidth();
  doc.setFillColor(...GREEN);
  doc.roundedRect(14, 12, 12, 12, 3, 3, 'F');
  doc.setFillColor(...CORAL);
  doc.triangle(26, 20, 26, 24, 22, 24, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('n', 20, 20.5, { align: 'center' });
  doc.setTextColor(...INK);
  doc.setFontSize(18);
  doc.text(title, 30, 20.5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  const org = d.org ? `${d.org.name}${d.org.city ? ' · ' + d.org.city : ''} · Tournée ${d.org.year || ''}` : '';
  doc.text(clean(org), 30, 26);
  doc.text(`Édité le ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} avec Nokk`, w - 14, 26, { align: 'right' });
  doc.setDrawColor(223, 230, 227);
  doc.line(14, 30, w - 14, 30);
  return 38;
}

function footer(doc) {
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    const w = doc.internal.pageSize.getWidth();
    const h = doc.internal.pageSize.getHeight();
    doc.text(`Page ${i} / ${n}`, w - 14, h - 8, { align: 'right' });
    if (n > 0) doc.text('Document de travail interne à l\'amicale', 14, h - 8);
  }
}

function kpis(doc, y, items) {
  const w = doc.internal.pageSize.getWidth() - 28;
  const cw = w / items.length;
  items.forEach((it, i) => {
    const x = 14 + i * cw;
    doc.setFillColor(240, 244, 242);
    doc.roundedRect(x, y, cw - 4, 22, 3, 3, 'F');
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text(clean(it.label), x + 4, y + 7);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...INK);
    doc.text(clean(it.value), x + 4, y + 16.5);
    doc.setFont('helvetica', 'normal');
  });
  return y + 30;
}

const tableStyle = {
  styles: { font: 'helvetica', fontSize: 9, cellPadding: 2.2, textColor: INK, lineColor: [223, 230, 227], lineWidth: 0.1 },
  headStyles: { fillColor: INK, textColor: 255, fontStyle: 'bold' },
  alternateRowStyles: { fillColor: [247, 249, 248] },
  margin: { left: 14, right: 14 },
};

export async function reportPdf(d) {
  const { jsPDF, autoTable } = await lib();
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const b = breakdown(d);
  let y = header(doc, 'Bilan de la tournée', d);
  y = kpis(doc, y, [
    { label: 'Total collecté', value: e(b.all.amount) },
    { label: 'Dons', value: String(b.all.count) },
    { label: 'Don moyen', value: e(b.all.average) },
    { label: 'Calendriers donnés', value: String(b.all.calendars) },
  ]);
  y = kpis(doc, y, [
    { label: 'Espèces', value: e(b.all.especes) },
    { label: 'Chèques', value: `${e(b.all.cheque)} (${b.all.nbCheques})` },
    { label: 'Carte', value: e(b.all.carte) },
    { label: 'Taux de dons', value: `${b.all.rate} %` },
  ]);
  autoTable(doc, {
    ...tableStyle, startY: y,
    head: [['Secteur', 'Portes', 'Dons', 'Absents', 'Refus', 'Espèces', 'Chèques', 'Carte', 'Total']],
    body: b.bySector.map((s) => [clean(s.name + (s.area ? ' · ' + s.area : '')), s.doors, s.count, s.absent, s.refus, e(s.especes), e(s.cheque), e(s.carte), e(s.amount)]),
    foot: [['Total', b.bySector.reduce((s, x) => s + x.doors, 0), b.all.count, b.all.absent, b.all.refus, e(b.all.especes), e(b.all.cheque), e(b.all.carte), e(b.all.amount)]],
    footStyles: { fillColor: [225, 239, 234], textColor: INK, fontStyle: 'bold' },
    columnStyles: { 5: { halign: 'right' }, 6: { halign: 'right' }, 7: { halign: 'right' }, 8: { halign: 'right', fontStyle: 'bold' } },
  });
  y = doc.lastAutoTable.finalY + 8;
  autoTable(doc, {
    ...tableStyle, startY: y,
    head: [['Équipier', 'Rôle', 'Dons', 'Part collectée', 'Calendriers reçus', 'Restants']],
    body: b.byMember.map((m) => [clean(m.name), { chef: "Chef d'équipe", pompier: 'Pompier', tresorier: 'Trésorier' }[m.role] || '', m.count, e(m.share), m.stockIn, m.calendarsLeft]),
    columnStyles: { 3: { halign: 'right' } },
  });
  y = doc.lastAutoTable.finalY + 8;
  if (d.handovers.length) {
    const members = new Map(d.members.map((m) => [m.id, m.name]));
    autoTable(doc, {
      ...tableStyle, startY: y,
      head: [['Remise', 'De', 'À', 'Attendu', 'Compté', 'Écart']],
      body: d.handovers.map((h) => [new Date(h.ts).toLocaleDateString('fr-FR'), clean(members.get(h.from) || ''), clean(members.get(h.to) || ''), e(h.expected || 0), e(h.counted || 0), (h.diff > 0 ? '+' : '') + e(h.diff || 0)]),
      columnStyles: { 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' } },
    });
  }
  footer(doc);
  return doc.output('blob');
}

// Bordereau de remise de chèques en banque.
export async function chequesPdf(d, visits) {
  const { jsPDF, autoTable } = await lib();
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const list = chequeList(d, visits);
  let y = header(doc, 'Bordereau de remise de chèques', d);
  y = kpis(doc, y, [
    { label: 'Nombre de chèques', value: String(list.length) },
    { label: 'Montant total', value: e(list.reduce((s, v) => s + v.amount, 0)) },
  ]);
  autoTable(doc, {
    ...tableStyle, startY: y,
    head: [['#', 'Date', 'Émetteur', 'N° de chèque', 'Adresse', 'Montant']],
    body: list.map((v, i) => [i + 1, new Date(v.ts).toLocaleDateString('fr-FR'), clean(v.name || ''), v.chequeNo || '', clean(v.address), e(v.amount)]),
    columnStyles: { 5: { halign: 'right', fontStyle: 'bold' } },
  });
  footer(doc);
  return doc.output('blob');
}

// Reçu de remise de caisse (après un point caisse).
export async function handoverPdf(d, h) {
  const { jsPDF, autoTable } = await lib();
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const members = new Map(d.members.map((m) => [m.id, m.name]));
  let y = header(doc, 'Remise de caisse', d);
  doc.setFontSize(11);
  doc.setTextColor(...INK);
  doc.text(clean(`Remise de ${members.get(h.from) || '—'} à ${members.get(h.to) || '—'} le ${new Date(h.ts).toLocaleDateString('fr-FR')} à ${new Date(h.ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`), 14, y);
  y += 8;
  y = kpis(doc, y, [
    { label: 'Espèces attendues', value: e(h.expected || 0) },
    { label: 'Espèces comptées', value: e(h.counted || 0) },
    { label: 'Écart', value: (h.diff > 0 ? '+' : '') + e(h.diff || 0) },
    { label: 'Chèques', value: `${h.cheques || 0} · ${e(h.chequeAmount || 0)}` },
  ]);
  if (h.counts) {
    autoTable(doc, {
      ...tableStyle, startY: y,
      head: [['Billets et pièces', 'Quantité', 'Total']],
      body: DENOMS.filter((x) => +h.counts[x.v]).map((x) => [clean(`${x.kind === 'billet' ? 'Billet' : 'Pièce'} de ${formatEuro(Math.round(x.v * 100), { decimals: x.v < 1 ? 2 : 0 })}`), h.counts[x.v], e(Math.round(x.v * 100) * h.counts[x.v])]),
      columnStyles: { 2: { halign: 'right' } },
    });
    y = doc.lastAutoTable.finalY + 8;
  }
  if (h.note) { doc.setFontSize(10); doc.text(clean('Note : ' + h.note), 14, y); y += 10; }
  doc.setDrawColor(...MUTED);
  doc.line(14, y + 20, 90, y + 20);
  doc.line(120, y + 20, 196, y + 20);
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text('Signature de qui remet', 14, y + 25);
  doc.text('Signature de qui reçoit', 120, y + 25);
  footer(doc);
  return doc.output('blob');
}

export { totals };
