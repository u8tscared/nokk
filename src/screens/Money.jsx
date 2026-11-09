import { useState, useMemo } from 'preact/hooks';
import { Icon } from '../ui/icons.jsx';
import { Button, IconButton, Avatar, Empty, toast, confetti, DotIcon, Bump, Seg, Field, Pill, Progress } from '../ui/ui.jsx';
import { data, setData, me, memberById, addHandover, removeVisit, updateVisit, demo, role, mergeData, exportData, online } from '../lib/store.js';
import { formatEuro, totals, countCash, reconcile, DENOMS, RESULTS, METHODS, groupBy } from '../lib/model.js';
import { pocket, breakdown, csv, chequeList } from '../lib/compta.js';
import { openSheet, go } from '../lib/nav.js';
import { feel } from '../lib/feedback.js';
import { shareFile } from '../lib/share.js';
import { inputKinds } from '../lib/keyboard.js';

const euro = (c) => formatEuro(c);

import { ToursCard } from './Tour.jsx';

// ——— Caisse ———

export function CaisseScreen() {
  const d = data.value;
  const m = me.value;
  const crew = (d.crew?.length ? d.crew : [d.meId]).filter(Boolean);
  const p = m ? pocket(d, m.id) : totals([]);
  const [counts, setCounts] = useState({});
  const counted = countCash(counts);
  const touched = Object.values(counts).some((x) => +x > 0);
  const rec = reconcile({ expectedCash: p.especes, counted });
  const myHandovers = d.handovers.filter((h) => crew.includes(h.from) || h.to === m?.id).slice().reverse();
  const stockIn = d.stock.filter((x) => x.memberId === m?.id).reduce((s, x) => s + x.qty, 0);
  const given = d.visits.filter((v) => v.result === 'donne' && (v.by || []).includes(m?.id)).reduce((s, v) => s + (v.calendars ?? 1), 0);

  function setCount(v, n) {
    feel('tick');
    setCounts({ ...counts, [v]: Math.max(0, n) });
  }

  function handover() {
    openSheet(({ close }) => <HandoverSheet close={close} expected={p.especes} counted={touched ? counted : p.especes} counts={touched ? counts : null} visits={p.visits} cheques={p.nbCheques} chequeAmount={p.cheque} onDone={() => setCounts({})} />, { label: 'Remettre la caisse' });
  }

  const bills = DENOMS.filter((x) => x.kind === 'billet');
  const coins = DENOMS.filter((x) => x.kind === 'piece');
  const tile = (x) => {
    const n = +counts[x.v] || 0;
    const label = x.v >= 1 ? x.v + ' €' : String(x.v).replace('0.', '0,') + ' €';
    return (
      <div class={'dtile ' + x.kind + (n ? ' on' : '')} key={x.v}>
        <div class="face">
          <span class="val">{label}</span>
          <span class="sub num">{n ? <Bump value={n}>{euro(Math.round(x.v * 100) * n)}</Bump> : ''}</span>
        </div>
        <div class="ctl">
          <IconButton icon="minus" label={`Retirer un ${x.kind} de ${x.v} €`} onClick={() => setCount(x.v, n - 1)} disabled={!n} />
          <input class="input dn" aria-label={`Nombre de ${x.kind}s de ${x.v} €`} value={n || ''} placeholder="0" onInput={(e) => setCount(x.v, parseInt(e.currentTarget.value.replace(/\D/g, '') || '0', 10))} {...inputKinds.int} />
          <IconButton icon="plus" label={`Ajouter un ${x.kind} de ${x.v} €`} onClick={() => setCount(x.v, n + 1)} />
        </div>
      </div>
    );
  };
  const msg = !touched ? 'Comptez billets et pièces : Nokk compare avec ce qui a été saisi.' : rec.diff === 0 ? 'La caisse tombe juste.' : rec.diff > 0 ? 'Il y a plus que prévu : un don non saisi ?' : "Il manque de l'argent : vérifiez les dons en espèces dans le journal.";

  return (
    <div class="page rise caisse-page">
      <div class="page-head"><div><h1>Caisse</h1><div class="sub">{m ? `Ce que ${crew.length > 1 ? 'votre binôme a' : 'vous avez'} encore en poche` : ''}</div></div></div>
      <div class="cols-2">
        <div>
          <div class="card cash-hero">
            <div class="tiny muted">Espèces à remettre</div>
            <Bump value={p.especes} class="big-num">{euro(p.especes)}</Bump>
            <div class="cash-lines">
              <div class="cash-line"><span class="k"><Icon name="cheque" /> Chèques</span><span class="v">{euro(p.cheque)}</span><span class="s">{p.nbCheques} chèque{p.nbCheques > 1 ? 's' : ''}</span></div>
              <div class="cash-line"><span class="k"><Icon name="card" /> Carte</span><span class="v">{euro(p.carte)}</span><span class="s">terminal</span></div>
              <div class="cash-line"><span class="k"><Icon name="calendar" /> Calendriers</span><span class="v">{p.calendars}</span><span class="s">{p.count} dons</span></div>
            </div>
          </div>

          <div class="card">
            <div class="count-head"><div class="card-title">Compter les espèces</div>{touched && <button class="link-btn" onClick={() => setCounts({})}>Remettre à zéro</button>}</div>
            <div class="count-group"><h4>Billets</h4><div class="denom-grid">{bills.map(tile)}</div></div>
            <div class="count-group"><h4>Pièces</h4><div class="denom-grid coins">{coins.map(tile)}</div></div>
            <div class={'reco-msg tone-' + (touched ? rec.tone : 'muted')}><Icon name={touched && rec.diff === 0 ? 'check' : 'help'} size={18} /> {msg}</div>
          </div>
        </div>
        <div>
          <div class="card">
            <div class="card-title">Mes calendriers</div>
            <div class="stock">
              <div><div class="big-num">{stockIn}</div><div class="tiny muted">reçus</div></div>
              <div><div class="big-num">{given}</div><div class="tiny muted">donnés</div></div>
              <div><div class="big-num" style={{ color: stockIn - given < 15 ? 'var(--warn)' : undefined }}>{Math.max(0, stockIn - given)}</div><div class="tiny muted">restants</div></div>
            </div>
            {stockIn - given < 15 && stockIn > 0 && <Pill tone="warn" icon="calendar">Bientôt à court : demandez un carton</Pill>}
          </div>
          <div class="card">
            <div class="card-title">Remises</div>
            {myHandovers.length ? (
              <div class="list">
                {myHandovers.map((h) => <HandoverRow h={h} key={h.id} />)}
              </div>
            ) : <p class="small muted" style={{ marginTop: 8 }}>Aucune remise pour l'instant. Après chaque soirée, comptez et remettez la caisse au trésorier.</p>}
          </div>
        </div>
      </div>
      <div class="cash-bar">
        <div class="figs">
          <div><div class="k">{touched ? 'Compté' : 'Attendu'}</div><div class="v cash-big"><Bump value={touched ? counted : p.especes}>{euro(touched ? counted : p.especes)}</Bump></div></div>
          {touched && <div><div class="k">Écart</div><div class={'v ' + rec.tone}>{(rec.diff > 0 ? '+' : '') + euro(rec.diff)}</div></div>}
        </div>
        <Button kind="coral small" icon="cash" disabled={!p.count} onClick={handover} data-testid="handover">Remettre</Button>
      </div>
    </div>
  );
}

// Statuts discrets en haut des pages (hors ligne, démo).
export function PageStatus() {
  const off = !online.value;
  if (!off && !demo.value) return null;
  return (
    <div class="page-status">
      {off && <span><i /> Hors ligne · tout est gardé</span>}
      {demo.value && <span class="demo"><i /> Mode démo</span>}
    </div>
  );
}

function HandoverRow({ h }) {
  const from = memberById.value.get(h.from);
  const to = memberById.value.get(h.to);
  const tone = !h.diff ? 'ok' : Math.abs(h.diff) <= 500 ? 'warn' : 'bad';
  return (
    <button class="row" onClick={async () => { const { handoverPdf } = await import('../lib/pdf.js'); feel('print'); shareFile(`remise-${new Date(h.ts).toISOString().slice(0, 10)}.pdf`, await handoverPdf(data.value, h), 'application/pdf'); }}>
      <DotIcon icon="receipt" sm tone={tone} />
      <span class="grow"><span class="t">{from?.name.split(' ')[0]} → {to?.name.split(' ')[0] || 'Trésorier'}</span><span class="s">{new Date(h.ts).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })} · {h.diff ? `écart ${h.diff > 0 ? '+' : ''}${euro(h.diff)}` : 'caisse juste'}</span></span>
      <span class="end">{euro(h.counted ?? h.expected ?? 0)}</span>
    </button>
  );
}

function HandoverSheet({ close, expected, counted, counts, visits, cheques, chequeAmount, onDone }) {
  const d = data.value;
  const treas = d.members.filter((m) => m.role === 'tresorier' || m.role === 'chef').filter((m) => m.id !== d.meId);
  const [to, setTo] = useState(treas[0]?.id || null);
  const [note, setNote] = useState('');
  const diff = counted - expected;
  return (
    <div class="stack">
      <div class="sheet-head"><h2>Remettre la caisse</h2></div>
      <div class="found">
        <div><div class="big-num">{euro(counted)}</div><div class="tiny muted">espèces</div></div>
        <div><div class="big-num">{cheques}</div><div class="tiny muted">chèques · {euro(chequeAmount)}</div></div>
        <div><div class="big-num" style={{ color: diff ? 'var(--warn)' : 'var(--ok)' }}>{diff ? (diff > 0 ? '+' : '') + euro(diff) : 'Juste'}</div><div class="tiny muted">écart</div></div>
      </div>
      {treas.length > 0 && (
        <div class="field"><span class="label">À qui ?</span>
          <div class="chips">{treas.map((m) => <button class="chip" key={m.id} aria-pressed={to === m.id ? 'true' : 'false'} onClick={() => { feel('tick'); setTo(m.id); }}><Avatar m={m} /> {m.name}</button>)}</div>
        </div>
      )}
      <Field id="hnote" label="Note (facultatif)"><input id="hnote" class="input" value={note} onInput={(e) => setNote(e.currentTarget.value)} placeholder="Ex. 2 € en trop, don non saisi" enterKeyHint="done" /></Field>
      <div class="sticky-action">
        <Button kind="full" sound="" onClick={async () => {
          const h = addHandover({ from: d.meId, crew: d.crew, to, expected, counted, diff, counts, visitIds: visits.map((v) => v.id), cheques, chequeAmount, note: note.trim() || undefined });
          feel('done');
          confetti();
          toast(`Caisse remise · ${euro(counted)}`);
          onDone?.();
          close();
        }} data-testid="confirm-handover">Confirmer la remise</Button>
      </div>
    </div>
  );
}

// ——— Comptes ———
function Bars({ days }) {
  if (!days.length) return null;
  const max = Math.max(...days.map((x) => x.amount), 1);
  const H = 120;
  return (
    <div class="bars" role="img" aria-label="Montant collecté par jour">
      {days.slice(-14).map((x) => (
        <div class="bar-col" key={x.day}>
          <span class="bar-val tiny">{Math.round(x.amount / 100)} €</span>
          <span class="bar" style={{ height: Math.max(4, (x.amount / max) * H) + 'px' }} />
          <span class="tiny muted">{new Date(x.day).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' })}</span>
        </div>
      ))}
    </div>
  );
}

export function ComptesScreen() {
  const d = data.value;
  const b = useMemo(() => breakdown(d), [d]);
  const inPockets = d.members.map((m) => ({ m, p: pocket(d, m.id) })).filter((x) => x.p.amount > 0);
  // Un binôme partage la même poche : on dédoublonne par équipe.
  const seen = new Set();
  const pockets = [];
  for (const x of inPockets) {
    const key = x.p.visits.map((v) => v.id).slice(0, 3).join();
    if (seen.has(key)) { pockets.find((y) => y.key === key)?.names.push(x.m); continue; }
    seen.add(key);
    pockets.push({ key, names: [x.m], p: x.p });
  }
  const notHanded = pockets.reduce((s, x) => s + x.p.amount, 0);
  return (
    <div class="page rise">
      <div class="page-head">
        <div><h1>Comptes</h1><div class="sub">Tout est recalculé à partir du journal des passages</div></div>
        <Button kind="small soft" icon="download" onClick={() => go('exports')}>Exporter</Button>
      </div>
      <ToursCard />
      <div class="kpis">
        <div class="kpi main"><div class="tiny">Total collecté</div><div class="big-num">{euro(b.all.amount)}</div>{b.vsLastYear != null && <div class="tiny">{b.vsLastYear >= 0 ? '+' : ''}{b.vsLastYear} % vs l'an dernier, mêmes portes</div>}</div>
        <div class="kpi"><div class="tiny muted">Dons</div><div class="big-num">{b.all.count}</div><div class="tiny muted">{b.all.rate} % des portes ouvertes</div></div>
        <div class="kpi"><div class="tiny muted">Don moyen</div><div class="big-num">{euro(b.all.average)}</div></div>
        <div class="kpi"><div class="tiny muted">Calendriers</div><div class="big-num">{b.all.calendars}</div><div class="tiny muted">sur {b.stockOut || b.stockTotal} confiés</div></div>
      </div>
      <div class="cols-2">
        <div>
          <div class="card">
            <div class="card-title">Par moyen de paiement</div>
            <div class="list">
              {[['especes', 'cash', 'Espèces'], ['cheque', 'cheque', 'Chèques'], ['carte', 'card', 'Carte']].map(([k, ic, l]) => (
                <div class="row" key={k}><DotIcon icon={ic} sm tone={k === 'especes' ? 'ok' : k === 'cheque' ? 'info' : 'coral'} /><span class="grow t">{l}{k === 'cheque' ? ` · ${b.all.nbCheques}` : ''}</span><span class="end">{euro(b.all[k])}</span></div>
              ))}
            </div>
          </div>
          <div class="card">
            <div class="card-title">Par secteur</div>
            <div class="list">
              {b.bySector.map((s) => (
                <div class="row" key={s.id}><span class="grow"><span class="t">{s.name}{s.area ? ' · ' + s.area : ''}</span><span class="s">{s.count} dons · {s.absent} absents · {s.refus} refus</span></span><span class="end">{euro(s.amount)}</span></div>
              ))}
            </div>
          </div>
          <div class="card">
            <div class="card-title">Par jour</div>
            <Bars days={b.days} />
          </div>
        </div>
        <div>
          <div class="card">
            <div class="hrow between"><div class="card-title">Pas encore remis</div><b class="num">{euro(notHanded)}</b></div>
            {pockets.length ? (
              <div class="list">
                {pockets.map((x) => (
                  <div class="row" key={x.key}><span class="avatars">{x.names.map((m) => <Avatar m={m} key={m.id} />)}</span><span class="grow"><span class="t">{x.names.map((m) => m.name.split(' ')[0]).join(' & ')}</span><span class="s">{euro(x.p.especes)} espèces · {x.p.nbCheques} chèques</span></span><span class="end">{euro(x.p.amount)}</span></div>
                ))}
              </div>
            ) : <p class="small muted">Tout a été remis au trésorier.</p>}
          </div>
          <div class="card">
            <div class="card-title">Par équipier</div>
            <div class="list">
              {b.byMember.map((m) => (
                <div class="row" key={m.id}><Avatar m={m} /><span class="grow"><span class="t">{m.name}</span><span class="s">{m.count} dons · {m.calendarsLeft} calendriers restants</span></span><span class="end">{euro(m.share)}</span></div>
              ))}
            </div>
          </div>
          <div class="card">
            <div class="hrow between"><div class="card-title">Remises au trésorier</div><span class="small muted">écart total {b.diffs > 0 ? '+' : ''}{euro(b.diffs)}</span></div>
            <div class="list">{d.handovers.slice().reverse().map((h) => <HandoverRow h={h} key={h.id} />)}</div>
            {!d.handovers.length && <p class="small muted">Aucune remise pour l'instant.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ——— Journal ———
export function JournalScreen() {
  const d = data.value;
  const [filter, setFilter] = useState('all');
  const [q, setQ] = useState('');
  const doors = useMemo(() => new Map(d.doors.map((x) => [x.id, x])), [d.doors]);
  const list = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return [...d.visits].reverse().filter((v) => {
      if (filter !== 'all' && v.result !== filter) return false;
      if (!ql) return true;
      const door = doors.get(v.doorId);
      return `${door?.num} ${door?.street} ${v.name || ''} ${v.unit || ''}`.toLowerCase().includes(ql);
    });
  }, [d.visits, filter, q]);
  const [limit, setLimit] = useState(80);
  const groups = groupBy(list.slice(0, limit), (v) => new Date(v.ts).toDateString());
  return (
    <div class="page rise">
      <div class="page-head"><div><h1>Journal</h1><div class="sub">{d.visits.length} passages enregistrés</div></div></div>
      <input class="input" type="search" placeholder="Rue, numéro ou nom" value={q} onInput={(e) => setQ(e.currentTarget.value)} {...inputKinds.search} aria-label="Rechercher dans le journal" />
      <div class="chips">
        {[['all', 'Tout'], ['donne', 'Donné'], ['absent', 'Absent'], ['refus', 'Refus'], ['deja', 'Déjà pris']].map(([k, l]) => (
          <button class="chip" key={k} aria-pressed={filter === k ? 'true' : 'false'} onClick={() => { feel('tick'); setFilter(k); }}>{l}</button>
        ))}
      </div>
      {!list.length ? (
        <div class="card"><Empty icon="list" title="Rien pour l'instant" text="Chaque porte saisie apparaîtra ici, avec le montant et le moyen de paiement." action={<Button kind="soft" onClick={() => go('carte')}>Aller sur la carte</Button>} /></div>
      ) : (
        [...groups.entries()].map(([day, vs]) => (
          <div class="card tight" key={day}>
            <div class="section-title" style={{ padding: '10px 12px 4px' }}>{new Date(day).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })} · {euro(totals(vs).amount)}</div>
            <div class="list">
              {vs.map((v) => {
                const door = doors.get(v.doorId);
                const r = RESULTS[v.result];
                return (
                  <button class="row" key={v.id} onClick={() => openSheet(({ close }) => <EditVisit v={v} close={close} />, { label: 'Modifier le passage' })}>
                    <span class={'hdot st-' + v.result} />
                    <span class="grow"><span class="t">{door ? `${door.num} ${door.street}` : 'Porte supprimée'}{v.unit && !v.closed ? ' · ' + v.unit : ''}</span><span class="s">{new Date(v.ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} · {v.closed ? 'Immeuble terminé' : r?.short}{v.name ? ' · ' + v.name : ''}{v.method && v.result === 'donne' ? ' · ' + METHODS[v.method].label : ''}</span></span>
                    <span class="end">{v.result === 'donne' ? euro(v.amount) : ''}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))
      )}
      {list.length > limit && <Button kind="ghost" onClick={() => setLimit(limit + 200)}>Voir plus</Button>}
    </div>
  );
}

function EditVisit({ v, close }) {
  const [amount, setAmount] = useState(((v.amount || 0) / 100).toFixed(2).replace('.', ','));
  const [method, setMethod] = useState(v.method || 'especes');
  const [result, setResult] = useState(v.result);
  const [name, setName] = useState(v.name || '');
  const door = data.value.doors.find((x) => x.id === v.doorId);
  return (
    <form class="stack" onSubmit={(e) => {
      e.preventDefault();
      const c = Math.round(parseFloat(amount.replace(',', '.')) * 100) || 0;
      updateVisit(v.id, { result, amount: result === 'donne' ? c : undefined, method: result === 'donne' ? method : undefined, name: name.trim() || undefined });
      feel('ok');
      toast('Passage corrigé');
      close();
    }}>
      <div class="sheet-head"><h2>{door ? `${door.num} ${door.street}` : 'Passage'}</h2></div>
      <Seg label="Résultat" value={result} onChange={setResult} options={Object.entries(RESULTS).map(([k, r]) => ({ value: k, label: r.short }))} />
      {result === 'donne' && (
        <>
          <Field id="eamount" label="Montant (€)"><input id="eamount" class="input" value={amount} onInput={(e) => setAmount(e.currentTarget.value)} {...inputKinds.number} /></Field>
          <Seg label="Paiement" value={method} onChange={setMethod} options={[{ value: 'especes', label: 'Espèces' }, { value: 'carte', label: 'Carte' }, { value: 'cheque', label: 'Chèque' }]} />
        </>
      )}
      <Field id="ename" label="Nom"><input id="ename" class="input" value={name} onInput={(e) => setName(e.currentTarget.value)} {...inputKinds.name} enterKeyHint="done" /></Field>
      <div class="sticky-action">
        <Button kind="danger" type="button" icon="trash" onClick={() => { const snap = v; removeVisit(v.id); close(); toast('Passage supprimé', { undo: () => setData((x) => ({ ...x, visits: [...x.visits, snap].sort((a, b) => a.ts - b.ts) })) }); }}>Supprimer</Button>
        <Button kind="grow" type="submit" sound="" class="grow">Enregistrer</Button>
      </div>
    </form>
  );
}

// ——— Exports ———
export function ExportsScreen() {
  const d = data.value;
  const [busy, setBusy] = useState('');
  const stamp = new Date().toISOString().slice(0, 10);
  async function run(kind) {
    setBusy(kind);
    try {
      if (kind === 'report') {
        const { reportPdf } = await import('../lib/pdf.js');
        feel('print');
        await shareFile(`nokk-bilan-${stamp}.pdf`, await reportPdf(d), 'application/pdf', 'Bilan de la tournée');
      } else if (kind === 'cheques') {
        const { chequesPdf } = await import('../lib/pdf.js');
        feel('print');
        await shareFile(`nokk-cheques-${stamp}.pdf`, await chequesPdf(d), 'application/pdf', 'Remise de chèques');
      } else if (kind === 'csv') {
        await shareFile(`nokk-passages-${stamp}.csv`, csv(d), 'text/csv;charset=utf-8', 'Passages');
      } else if (kind === 'backup') {
        await shareFile(`nokk-sauvegarde-${stamp}.nokk.json`, JSON.stringify(exportData()), 'application/json', 'Sauvegarde Nokk');
      }
    } catch (e) {
      toast("L'export n'a pas pu se faire, réessayez", { error: true });
    } finally {
      setBusy('');
    }
  }
  const nbCheques = chequeList(d).length;
  const items = [
    { k: 'report', icon: 'file', tone: 'coral', t: 'Bilan complet en PDF', s: 'Totaux, secteurs, équipiers, remises' },
    { k: 'cheques', icon: 'cheque', tone: 'info', t: 'Bordereau de chèques', s: `${nbCheques} chèques, prêt pour la banque` },
    { k: 'csv', icon: 'list', tone: 'ok', t: 'Tableur (Excel, Numbers)', s: `${d.visits.length} passages, une ligne chacun` },
    { k: 'backup', icon: 'download', tone: 'muted', t: 'Sauvegarde complète', s: 'Pour changer de téléphone' },
  ];
  return (
    <div class="page rise">
      <div class="page-head"><div><h1>Exports</h1><div class="sub">Pour le trésorier, la banque et les archives</div></div></div>
      <div class="card tight">
        <div class="list">
          {items.map((it) => (
            <button class="row" key={it.k} disabled={!!busy} onClick={() => run(it.k)} data-testid={'export-' + it.k}>
              <DotIcon icon={it.icon} tone={it.tone} />
              <span class="grow"><span class="t">{busy === it.k ? 'Préparation…' : it.t}</span><span class="s">{it.s}</span></span>
              <Icon name="download" class="chev" />
            </button>
          ))}
        </div>
      </div>
      <ImportCard />
    </div>
  );
}

export function ImportCard() {
  return (
    <div class="card">
      <div class="hrow"><DotIcon icon="upload" tone="ok" /><div class="grow"><div class="card-title">Recevoir un fichier Nokk</div><div class="small muted">Secteur envoyé par le chef, relevé d'un binôme, sauvegarde : tout se fusionne sans doublon.</div></div></div>
      <label class="btn soft full" style={{ marginTop: 12 }} for="importfile"><Icon name="upload" /> Choisir le fichier</label>
      <input id="importfile" type="file" accept=".json,application/json" hidden onChange={async (e) => {
        const f = e.currentTarget.files?.[0];
        if (!f) return;
        try {
          const j = JSON.parse(await f.text());
          if (j.app !== 'nokk') throw new Error();
          const n = mergeData(j);
          feel('ok');
          toast(`Fichier reçu · ${n} passages ajoutés`);
        } catch {
          toast("Ce fichier n'est pas un fichier Nokk", { error: true });
        }
        e.currentTarget.value = '';
      }} />
    </div>
  );
}
