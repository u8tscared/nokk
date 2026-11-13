// Page « Vous étiez absent » : l'habitant choisit quand l'équipe repasse. Aucun compte, aucune donnée pistée.
(function () {
  var API = window.NOKK_API || 'https://nokk-api.marceau-ruis.workers.dev';
  var app = document.getElementById('app');
  var m = /^#([A-Za-z0-9]{8,24})(?:\.(\d{1,3}))?/.exec(location.hash);
  var token = m && m[1];
  var card = m && m[2] ? +m[2] : null;
  var state = { want: null, day: null, slot: null, info: null, busy: false };
  var DAYS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
  var MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  var SHORT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  var LONG = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  var ICON = {
    yes: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12.5 9 17.5 20 6.5"/></svg>',
    no: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    cal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="5.5" width="16" height="14" rx="3"/><path d="M8 3.5v4M16 3.5v4M4 10h16"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5 10 17.5 19 7"/></svg>'
  };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function iso(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function hh(h) { return h + ' h'; }
  function slotsFor(d) {
    var w = d.getDay();
    if (w === 6) return [[10, 12], [14, 17], [17, 19]];
    if (w === 0) return [[10, 12], [14, 17]];
    return [[17, 18], [18, 19], [19, 20]];
  }
  function days() {
    var out = [], now = new Date();
    for (var i = 0; i < 12 && out.length < 10; i++) {
      var d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
      var s = slotsFor(d).filter(function (x) { return i > 0 || x[0] > now.getHours() + 1; });
      if (s.length) out.push({ d: d, slots: s });
    }
    return out;
  }
  function api(method, body) {
    return fetch(API + '/r/' + token, { method: method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw j; return j; }); });
  }
  function hero(info) {
    var o = info.org || {};
    return '<section class="hero"><div class="org"><span class="badge">' + ICON.cal + '</span><span>' + esc(o.name) + (o.city ? ' · ' + esc(o.city) : '') + '</span></div>' +
      '<h1>Nous sommes passés, vous étiez absent.</h1><p>Pour les calendriers ' + esc(o.year || '') + '. Dites-nous si vous voulez qu\'on repasse, et quand.</p></section>';
  }
  function render() {
    var info = state.info;
    var html = hero(info);
    html += '<section class="card"><h2>On repasse ?</h2><div class="choices">' +
      '<button class="choice" data-want="oui" aria-pressed="' + (state.want === 'oui') + '"><span class="ic">' + ICON.yes + '</span><span>Oui, repassez<small>Choisissez le jour et l\'heure</small></span></button>' +
      '<button class="choice no" data-want="non" aria-pressed="' + (state.want === 'non') + '"><span class="ic">' + ICON.no + '</span><span>Non merci<small>L\'équipe ne repassera pas</small></span></button>' +
      '</div></section>';
    if (state.want === 'oui') {
      var list = days();
      if (!state.day) state.day = iso(list[0].d);
      var cur = list.filter(function (x) { return iso(x.d) === state.day; })[0] || list[0];
      html += '<section class="card"><h2>Quand êtes-vous là ?</h2><div class="days" role="group" aria-label="Jour">' +
        list.map(function (x) { var k = iso(x.d); return '<button class="day" data-day="' + k + '" aria-pressed="' + (k === state.day) + '"><span>' + DAYS[x.d.getDay()] + '</span><b>' + x.d.getDate() + '</b><span>' + MONTHS[x.d.getMonth()].slice(0, 4) + '.</span></button>'; }).join('') +
        '</div><span class="label">Créneau</span><div class="slots" role="group" aria-label="Créneau">' +
        cur.slots.map(function (s) { var k = s[0] + '-' + s[1]; return '<button class="slot" data-slot="' + k + '" aria-pressed="' + (state.slot === k) + '">' + hh(s[0]) + ' – ' + hh(s[1]) + '</button>'; }).join('') +
        '</div>' + fields(true) + '</section>';
    } else if (state.want === 'non') {
      html += '<section class="card">' + fields(false) + '</section>';
    }
    app.innerHTML = html;
    var go = document.getElementById('go');
    if (go) go.disabled = state.want === 'oui' && !state.slot;
  }
  function fields(yes) {
    return '<label class="field"><span>Votre nom (facultatif)</span><input id="f-name" autocomplete="name" value="' + esc(state.name) + '" placeholder="Ex. Mme Dupont"></label>' +
      (yes ? '<label class="field"><span>Votre adresse</span><input id="f-address" autocomplete="street-address" value="' + esc(state.address) + '" placeholder="Ex. 12 rue des Lilas, bât. B"><small>Pour que l\'équipe sonne à la bonne porte.</small></label>' +
      '<label class="field"><span>E-mail (facultatif)</span><input id="f-email" type="email" inputmode="email" autocomplete="email" value="' + esc(state.email) + '" placeholder="Si l\'équipe doit vous prévenir"></label>' : '') +
      '<label class="field"><span>Un mot pour l\'équipe (facultatif)</span><input id="f-note" value="' + esc(state.note) + '" placeholder="' + (yes ? 'Ex. sonner chez Martin, 2e étage' : 'Ex. déjà pris chez un collègue') + '"></label>' +
      '<div id="err" class="err hidden" role="alert"></div>' +
      '<button id="go" class="go">' + (yes ? 'Valider ce créneau' : 'Envoyer') + '</button>';
  }
  function keep() {
    ['name', 'address', 'email', 'note'].forEach(function (k) { var el = document.getElementById('f-' + k); if (el) state[k] = el.value; });
  }
  function slotText() {
    var p = state.day.split('-'), d = new Date(+p[0], +p[1] - 1, +p[2]), s = state.slot.split('-');
    return LONG[d.getDay()] + ' ' + d.getDate() + ' ' + MONTHS[d.getMonth()] + ', entre ' + hh(s[0]) + ' et ' + hh(s[1]);
  }
  function ics() {
    var s = state.slot.split('-'), day = state.day.replace(/-/g, '');
    var pad = function (n) { return String(n).padStart(2, '0'); };
    var o = state.info.org || {};
    var txt = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Nokk//Repassez//FR', 'BEGIN:VEVENT', 'UID:' + Date.now() + '@nokk', 'DTSTAMP:' + new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z',
      'DTSTART:' + day + 'T' + pad(s[0]) + '0000', 'DTEND:' + day + 'T' + pad(s[1]) + '0000', 'SUMMARY:Les pompiers repassent pour les calendriers',
      'DESCRIPTION:' + (o.name || 'Amicale des sapeurs-pompiers').replace(/[,;]/g, ' '), 'BEGIN:VALARM', 'TRIGGER:-PT1H', 'ACTION:DISPLAY', 'DESCRIPTION:Les pompiers passent dans une heure', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    return 'data:text/calendar;charset=utf-8,' + encodeURIComponent(txt);
  }
  function done() {
    var yes = state.want === 'oui';
    app.innerHTML = hero(state.info).replace('Nous sommes passés, vous étiez absent.', 'Merci !') +
      '<section class="card done" data-testid="done"><div class="check">' + ICON.check + '</div>' +
      (yes ? '<h2>C\'est noté</h2><p>L\'équipe repassera</p><div class="when">' + esc(slotText()) + '</div><a class="ghost" download="pompiers.ics" href="' + ics() + '">Ajouter à mon agenda</a>'
        : '<h2>C\'est noté</h2><p>L\'équipe ne repassera pas. Merci d\'avoir pris le temps de répondre, et bonne année !</p>') +
      '</section>';
  }
  app.addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    keep();
    if (b.dataset.want) { state.want = b.dataset.want; render(); var c = app.querySelectorAll('.card')[1]; if (c) c.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    if (b.dataset.day) { state.day = b.dataset.day; state.slot = null; render(); return; }
    if (b.dataset.slot) { state.slot = b.dataset.slot; render(); return; }
    if (b.id === 'go' && !state.busy) {
      var err = document.getElementById('err');
      if (state.want === 'oui' && !state.slot) return;
      if (state.want === 'oui' && !(state.address || '').trim() && !card) { err.textContent = 'Indiquez votre adresse pour que l\'équipe vous retrouve.'; err.classList.remove('hidden'); return; }
      state.busy = true; b.disabled = true; b.textContent = 'Envoi…';
      var s = state.slot ? state.slot.split('-') : null;
      api('POST', { n: card, want: state.want, slot: s ? { day: state.day, from: +s[0], to: +s[1] } : null, name: state.name, address: state.address, email: state.email, note: state.note })
        .then(done, function (j) {
          state.busy = false; b.disabled = false; b.textContent = 'Réessayer';
          err.textContent = j && j.error === 'bad_email' ? 'Cette adresse e-mail ne semble pas valide.' : 'Pas de réseau ou petit souci. Réessayez dans un instant.';
          err.classList.remove('hidden');
        });
    }
  });
  if (!token) { app.innerHTML = '<section class="card"><h2>Lien incomplet</h2><p>Scannez à nouveau le QR code de la carte laissée par les pompiers.</p></section>'; return; }
  api('GET').then(function (info) { state.info = info; document.title = 'Vous étiez absent · ' + (info.org && info.org.name || 'Pompiers'); render(); },
    function () { app.innerHTML = '<section class="card"><h2>Ce QR code n\'est plus actif</h2><p>Le secteur a peut-être été modifié. Vous pouvez attendre le prochain passage de l\'équipe.</p></section>'; });
})();
