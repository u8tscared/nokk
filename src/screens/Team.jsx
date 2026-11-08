import { useState } from 'preact/hooks';
import { Icon } from '../ui/icons.jsx';
import { Button, IconButton, Avatar, Empty, toast, Field, Seg, DotIcon, Stepper } from '../ui/ui.jsx';
import { data, me, addMember, updateMember, removeMember, setCrew, switchUser, addStock, role } from '../lib/store.js';
import { breakdown } from '../lib/compta.js';
import { formatEuro } from '../lib/model.js';
import { ROLES, MENU, allowed } from '../lib/nav.js';
import { openSheet } from '../lib/nav.js';
import { feel } from '../lib/feedback.js';
import { inputKinds } from '../lib/keyboard.js';
import { shareFile } from '../lib/share.js';
import { ImportCard } from './Money.jsx';

const COLORS = ['#367a6d', '#d9554f', '#3f6c8f', '#b7791f', '#6b5ca5', '#12262a', '#2c7a59', '#a14e78'];

export function openAddMember() {
  openSheet(({ close }) => <MemberForm close={close} />, { label: 'Ajouter un équipier' });
}

export function MemberForm({ close, m }) {
  const [name, setName] = useState(m?.name || '');
  const [r, setR] = useState(m?.role || 'pompier');
  const [pin, setPin] = useState(m?.pin || '');
  const [err, setErr] = useState('');
  const isChef = role.value === 'chef';
  return (
    <form class="stack" onSubmit={(e) => {
      e.preventDefault();
      if (name.trim().length < 2) { setErr('Le prénom et le nom, pour s\'y retrouver'); feel('err'); return; }
      if (pin && !/^\d{4}$/.test(pin)) { setErr('Le code fait 4 chiffres'); feel('err'); return; }
      if (m) updateMember(m.id, { name: name.trim(), role: r, pin: pin || undefined });
      else addMember({ name: name.trim(), role: r, pin: pin || undefined, color: COLORS[data.value.members.length % COLORS.length] });
      feel('ok');
      toast(m ? 'Équipier mis à jour' : `${name.trim().split(' ')[0]} ajouté à l'équipe`);
      close();
    }}>
      <div class="sheet-head"><h2>{m ? 'Modifier' : 'Ajouter un équipier'}</h2></div>
      <Field id="mname" label="Prénom et nom" error={err}>
        <input id="mname" class="input" value={name} onInput={(e) => { setName(e.currentTarget.value); setErr(''); }} {...inputKinds.name} placeholder="Ex. Inès Diallo" data-autofocus />
      </Field>
      {isChef && (
        <div class="field"><span class="label">Rôle</span>
          <Seg label="Rôle" value={r} onChange={setR} options={Object.entries(ROLES).map(([k, x]) => ({ value: k, label: x.label.replace("Chef d'équipe", 'Chef') }))} />
          <div class="tiny muted">{ROLES[r].hint}</div>
        </div>
      )}
      <Field id="mpin" label="Code personnel (facultatif)" hint="4 chiffres pour passer d'un équipier à l'autre sur un téléphone partagé">
        <input id="mpin" class="input" value={pin} maxLength={4} onInput={(e) => setPin(e.currentTarget.value.replace(/\D/g, ''))} {...inputKinds.int} enterKeyHint="done" />
      </Field>
      <div class="sticky-action"><Button kind="full" type="submit" sound="">{m ? 'Enregistrer' : 'Ajouter'}</Button></div>
    </form>
  );
}

function MemberSheet({ m, close }) {
  const b = breakdown(data.value).byMember.find((x) => x.id === m.id);
  const [qty, setQty] = useState(50);
  const isChef = role.value === 'chef';
  const hidden = m.hidden || [];
  return (
    <div class="stack">
      <div class="sheet-head"><div class="hrow"><Avatar m={m} lg /><div><h2>{m.name}</h2><div class="small muted">{ROLES[m.role]?.label}</div></div></div></div>
      <div class="found">
        <div><div class="big-num">{b?.count || 0}</div><div class="tiny muted">dons</div></div>
        <div><div class="big-num">{formatEuro(b?.share || 0)}</div><div class="tiny muted">collectés</div></div>
        <div><div class="big-num">{b?.calendarsLeft || 0}</div><div class="tiny muted">calendriers restants</div></div>
      </div>
      {isChef && (
        <div class="card">
          <div class="card-title">Confier des calendriers</div>
          <div style={{ marginTop: 10 }}><Stepper label="Nombre de calendriers" value={qty} step={10} min={10} max={500} onChange={setQty} format={(v) => <b class="big-num" style={{ fontSize: 28 }}>{v}</b>} /></div>
          <div class="hrow" style={{ marginTop: 10 }}>
            <Button kind="soft small grow" onClick={() => { addStock(m.id, -qty, 'Retour'); toast(`${qty} calendriers rendus`); close(); }}>Rendus</Button>
            <Button kind="small grow" onClick={() => { addStock(m.id, qty, 'Carton'); feel('ok'); toast(`${qty} calendriers confiés à ${m.name.split(' ')[0]}`); close(); }}>Confier</Button>
          </div>
        </div>
      )}
      {isChef && m.id !== data.value.meId && (
        <div class="card">
          <div class="card-title">Écrans visibles</div>
          <p class="tiny muted">Un écran retiré disparaît partout pour {m.name.split(' ')[0]}.</p>
          <div class="chips" style={{ marginTop: 8 }}>
            {MENU.filter((x) => x.roles.includes(m.role) && x.route !== 'carte').map((x) => (
              <button class="chip" key={x.route} aria-pressed={!hidden.includes(x.route) ? 'true' : 'false'} onClick={() => { feel('tick'); updateMember(m.id, { hidden: hidden.includes(x.route) ? hidden.filter((h) => h !== x.route) : [...hidden, x.route] }); close(); openSheet(({ close: c }) => <MemberSheet m={data.value.members.find((y) => y.id === m.id)} close={c} />, { label: m.name }); }}>
                <Icon name={x.icon} size={16} /> {x.label}
              </button>
            ))}
          </div>
        </div>
      )}
      <div class="list card tight">
        <button class="row" onClick={() => { close(); setTimeout(() => openSheet(({ close: c }) => <MemberForm m={m} close={c} />, { label: 'Modifier' }), 300); }}><DotIcon icon="pencil" sm /><span class="grow t">Modifier</span></button>
        {m.id !== data.value.meId && <button class="row" onClick={() => { close(); setTimeout(() => askSwitch(m), 300); }}><DotIcon icon="swap" sm tone="info" /><span class="grow t">Passer sur le profil de {m.name.split(' ')[0]}</span></button>}
        {isChef && m.id !== data.value.meId && <button class="row" onClick={() => { const undo = removeMember(m.id); close(); toast(`${m.name} retiré`, { undo }); }}><DotIcon icon="trash" sm tone="bad" /><span class="grow t" style={{ color: 'var(--bad)' }}>Retirer de l'équipe</span></button>}
      </div>
    </div>
  );
}

export function askSwitch(m) {
  if (!m.pin) { switchUser(m.id); feel('ok'); toast(`Bonjour ${m.name.split(' ')[0]}`); return; }
  openSheet(({ close }) => <PinPad m={m} close={close} onOk={() => { switchUser(m.id); toast(`Bonjour ${m.name.split(' ')[0]}`); }} />, { label: 'Code personnel' });
}

export function PinPad({ m, close, onOk }) {
  const [v, setV] = useState('');
  const [bad, setBad] = useState(false);
  const press = (k) => {
    feel('tick');
    let n = v;
    if (k === '⌫') n = v.slice(0, -1);
    else if (v.length < 4) n = v + k;
    setV(n);
    setBad(false);
    if (n.length === 4) {
      if (n === m.pin) { feel('ok'); close?.(); onOk(); }
      else { setBad(true); feel('err'); setTimeout(() => setV(''), 350); }
    }
  };
  return (
    <div class="stack center pinpad">
      <Avatar m={m} lg />
      <h2 class="h2">Code de {m.name.split(' ')[0]}</h2>
      <div class={'pin-dots' + (bad ? ' shake' : '')} aria-live="polite" aria-label={`${v.length} chiffres sur 4`}>{[0, 1, 2, 3].map((i) => <i key={i} class={i < v.length ? 'on' : ''} />)}</div>
      <div class="numpad">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((k, i) => k ? <button key={i} type="button" onClick={() => press(k)} aria-label={k === '⌫' ? 'Effacer' : k}>{k}</button> : <span key={i} />)}
      </div>
    </div>
  );
}

export function TeamScreen() {
  const d = data.value;
  const crew = d.crew || [];
  const b = breakdown(d);
  return (
    <div class="page rise">
      <div class="page-head">
        <div><h1>Équipe</h1><div class="sub">{d.members.length} équipiers{d.org?.name ? ' · ' + d.org.name : ''}</div></div>
        {role.value === 'chef' && <Button kind="small" icon="plus" onClick={openAddMember} data-testid="add-member">Ajouter</Button>}
      </div>
      <div class="card">
        <div class="card-title">Ce soir, je tourne avec</div>
        <p class="tiny muted">Seul ou à plusieurs : les dons sont partagés entre vous dans les comptes.</p>
        <div class="chips" style={{ marginTop: 10 }}>
          {d.members.map((m) => {
            const on = crew.includes(m.id);
            const self = m.id === d.meId;
            return (
              <button class="chip" key={m.id} aria-pressed={on ? 'true' : 'false'} disabled={self} onClick={() => { feel('tick'); setCrew(on ? crew.filter((x) => x !== m.id) : [...crew, m.id]); }}>
                <Avatar m={m} /> {self ? 'Moi' : m.name.split(' ')[0]}
              </button>
            );
          })}
        </div>
      </div>
      <div class="card tight">
        <div class="list">
          {d.members.map((m) => {
            const x = b.byMember.find((y) => y.id === m.id);
            return (
              <button class="row" key={m.id} onClick={() => openSheet(({ close }) => <MemberSheet m={m} close={close} />, { label: m.name })}>
                <Avatar m={m} />
                <span class="grow"><span class="t">{m.name}{m.id === d.meId ? ' (moi)' : ''}</span><span class="s">{ROLES[m.role]?.label} · {x?.count || 0} dons · {x?.calendarsLeft || 0} calendriers</span></span>
                <span class="end">{formatEuro(x?.share || 0)}</span>
                <Icon name="chevR" class="chev" />
              </button>
            );
          })}
        </div>
        {!d.members.length && <Empty icon="team" title="Personne pour l'instant" text="Ajoutez les équipiers qui font la tournée." />}
      </div>
      <div class="card">
        <div class="hrow"><DotIcon icon="share" tone="ok" /><div class="grow"><div class="card-title">Partager avec l'équipe</div><div class="small muted">Envoyez le fichier de l'équipe (secteurs, portes, passages) par message. Chacun l'ouvre dans Nokk.</div></div></div>
        <div class="hrow" style={{ marginTop: 12 }}>
          <Button kind="soft small grow" icon="share" onClick={() => {
            const { pin, ...x } = {};
            const payload = { app: 'nokk', kind: 'equipe', exportedAt: new Date().toISOString(), ...d, members: d.members.map(({ pin: _p, ...mm }) => mm), meId: null, crew: [] };
            shareFile(`nokk-equipe-${new Date().toISOString().slice(0, 10)}.nokk.json`, JSON.stringify(payload), 'application/json', 'Équipe Nokk');
          }}>Envoyer le fichier</Button>
        </div>
        <p class="tiny muted" style={{ marginTop: 10 }}><span class="badge-soon">Bientôt</span> Synchro en direct entre téléphones, sans fichier.</p>
      </div>
      <ImportCard />
    </div>
  );
}
