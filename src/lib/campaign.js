// Nouvelle campagne : on garde l'historique de chaque porte (montant, nom, notes) et on repart à zéro.
import { data, setData } from './store.js';
import { indexVisits } from './model.js';

export function campaignSummary(d = data.value) {
  const by = indexVisits(d.visits);
  let doors = 0, amount = 0;
  for (const door of d.doors) {
    const l = by.get(door.id) || [];
    const gifts = l.filter((v) => v.result === 'donne');
    if (l.length) doors++;
    amount += gifts.reduce((s, v) => s + (v.amount || 0), 0);
  }
  return { year: d.org?.year || new Date().getFullYear(), doors, amount, visits: d.visits.length };
}

export function doorYear(door, list) {
  if (!list?.length) return null;
  const gifts = list.filter((v) => v.result === 'donne');
  const last = list[list.length - 1];
  const name = [...list].reverse().find((v) => v.name)?.name;
  return {
    amount: gifts.reduce((s, v) => s + (v.amount || 0), 0) || null,
    name: name || undefined,
    result: gifts.length ? 'donne' : last.result,
    hour: new Date((gifts[gifts.length - 1] || last).ts).getHours(),
  };
}

export function closeCampaign() {
  const d = data.peek();
  const year = d.org?.year || new Date().getFullYear();
  const by = indexVisits(d.visits);
  setData((x) => ({
    ...x,
    doors: x.doors.map((door) => {
      const y = doorYear(door, by.get(door.id));
      if (!y) return door.lastYear ? { ...door, lastYear: null, history: door.history } : door;
      return { ...door, lastYear: { ...y, year }, history: { ...(door.history || {}), [year]: y } };
    }),
    visits: [], sessions: [], handovers: [], stock: [],
    org: { ...(x.org || {}), year: year + 1 },
  }));
  return year + 1;
}
