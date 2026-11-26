/* Mastercar Finanzen · App-Rahmen: Anmeldung, Navigation, Aktionen */
const A = {};
const START_HASH = location.hash;   // vor der Supabase-Anmeldung merken (die Bibliothek leert die Adresse beim Einlösen des Links)
const VIEWS = { avis: () => viewAvis(), start: viewStart, todos: viewTodos, ausgang: () => viewRechnungen('ausgang'), eingang: () => viewRechnungen('eingang'), bank: viewBank, sumup: viewSumup, kasse: viewKasse, hebe: viewHebe, guv: viewAusw, abgleich: viewAbgleich, einst: viewEinst, ablage: () => viewAblage() };
let OMNI = null;   // die Suchleiste bleibt dasselbe Element und wird bei jedem Neuzeichnen unter die Überschrift gesetzt

/* Hell/Dunkel: Schieberegler (Mond links = dunkel, Sonne rechts = hell), Wahl wird im Browser gemerkt */
const TABS = [['start', 'Übersicht', '◧'], ['eingang', 'Eingang', '↘'], ['ausgang', 'Ausgang', '↗'], ['todos', 'To-Dos', '☑']];
const istHell = () => document.documentElement.getAttribute('data-theme') === 'light';
function themeSwitch() {
  return `<label class="thm" title="Hell / Dunkel umschalten"><span aria-hidden="true">🌙</span><input type="checkbox" role="switch" data-chg="theme" aria-label="Helle Ansicht" ${istHell() ? 'checked' : ''}><i></i><span aria-hidden="true">☀️</span></label>`;
}
function themeSetzen(t) {
  document.documentElement.setAttribute('data-theme', t);
  try { localStorage.setItem('mc-theme', t); } catch (e) { }
  $('meta[name=theme-color]')?.setAttribute('content', t === 'light' ? '#F3F3EF' : '#1F1F21');
  $$('.thm input').forEach(i => i.checked = t === 'light');
}
function shell() {
  document.body.innerHTML = `
  <div class="app">
    <aside class="side"><div class="brand"><span class="logo">MASTERCAR</span><span class="sub">Bornheim · Finanzen</span></div>
      <div class="side-tools"><span class="small muted thm-lbl">Ansicht</span>${themeSwitch()}</div>
      <button class="menu-btn" data-act="menu" aria-label="Menü" aria-expanded="false">☰</button>
      <nav id="nav"></nav>
      <div class="side-foot small">VE Sportmanagement UG<br>(haftungsbeschränkt)<br><span class="${DB.cloud ? 'on' : ''}">${DB.cloud ? '● online' : '○ Demo-Modus'}</span></div></aside>
    <div class="mainwrap"><main id="main" tabindex="-1"></main></div>
  </div>
  <nav class="tabbar" id="tabbar" aria-label="Schnellwahl"></nav>
  <div id="omniPark" hidden>${omniHtml()}</div>
  <input type="file" id="anyIn" multiple hidden accept=".xlsx,.xlsm,.xlsb,.xls,.csv,.txt,.pdf,.png,.jpg,.jpeg,.webp,.heic,.eml,.msg">
  <input type="file" id="tblIn" hidden accept=".xlsx,.xlsm,.xlsb,.xls,.csv,.txt">
  <input type="file" id="belegIn" multiple hidden accept=".pdf,.png,.jpg,.jpeg,.webp,.eml,.msg">
  <div class="dropveil" id="veil"><div>Loslassen zum Übernehmen<small>Excel, SumUp, Bank-CSV, Rechnungen (PDF/Foto/Mail)</small></div></div>`;
  if (DB.aiOn) { const b = document.createElement('button'); b.id = 'aicFab'; b.className = 'fab'; b.title = 'KI-Assistent'; b.textContent = '✨'; b.onclick = () => aicShow(true); document.body.appendChild(b); }
  OMNI = $('#omni'); omniWire();
  $('#anyIn').onchange = e => { korbAdd(e.target.files); e.target.value = ''; };
  $('#tblIn').onchange = e => { const f = e.target.files[0]; if (f) importFile(e.target.dataset.t, f); e.target.value = ''; };
  $('#belegIn').onchange = e => { korbAdd(e.target.files); e.target.value = ''; };
}
function render() {
  buildIdx();
  const probs = S.rechnungen.filter(r => ['ueber', 'doppelt', 'teil'].includes(rStatus(r).key)).length, tdf = todoFaelligAnz();
  const nb = { abgleich: probs, todos: tdf };
  $('#nav').innerHTML = NAV.map(([k, l, ic]) => `<button class="nav ${UI.view === k ? 'on' : ''}" data-act="go" data-v="${k}"><span class="ni">${ic}</span>${l}${nb[k] ? `<span class="nb">${nb[k]}</span>` : ''}</button>`).join('');
  // Handy: Leiste unten mit den wichtigsten Bereichen + „Mehr“ (öffnet das ganze Menü)
  const haupt = TABS.map(t => t[0]), mehrOn = !haupt.includes(UI.view);
  $('#tabbar').innerHTML = TABS.map(([k, l, ic]) => `<button class="${UI.view === k ? 'on' : ''}" data-act="go" data-v="${k}"><b>${ic}</b>${l}${nb[k] ? `<span class="nb">${nb[k]}</span>` : ''}</button>`).join('')
    + `<button class="${mehrOn ? 'on' : ''}" data-act="menu"><b>☰</b>${mehrOn ? esc((NAV.find(n => n[0] === UI.view) || [])[1] || 'Mehr').split(' ')[0] : 'Mehr'}${nb.abgleich && !haupt.includes('abgleich') ? `<span class="nb">${nb.abgleich}</span>` : ''}</button>`;
  const main = $('#main'), y = window.scrollY, active = document.activeElement, qv = active && active.dataset && active.dataset.q, pos = qv ? active.selectionStart : 0;
  const omniFocus = active && active.id === 'oq';
  if (OMNI) OMNI.remove();   // Leiste vor dem Neuzeichnen herausnehmen (behält Text und Ereignisse)
  $$('.tw.scroll', main).forEach(t => { if (t.dataset.twk) TW.pos[t.dataset.twk] = [t.scrollLeft, t.scrollTop]; });   // Scroll-Position der Tabellen merken
  main.innerHTML = (VIEWS[UI.view] || viewStart)();
  if (OMNI) {   // Startseite: eigener Platz unter der Begrüßung · sonst direkt unter der Überschriftszeile
    const slot = $('#omniSlot', main), tb = $('.toolbar', main);
    if (slot) slot.replaceWith(OMNI); else if (tb) tb.after(OMNI); else main.prepend(OMNI);
    if (omniFocus) $('#oq').focus();
  }
  twEnhance(main);
  $$('details.cfm[open]', main).forEach(cfmPos);
  if (qv) { const i = $(`[data-q="${qv}"]`); if (i) { i.focus({ preventScroll: true }); i.setSelectionRange(pos, pos); } }
  window.scrollTo(0, y);
}

/* ---------- Breite Tabellen: seitlich schieben (Maus ziehen, ◀ ▶, Shift+Mausrad) und maximieren ----------
   Jede Datentabelle bekommt eine eigene Scroll-Box mit fester Kopfzeile. Zustand (Vollbild, Scroll-Position)
   bleibt beim Filtern/Neuzeichnen erhalten. */
const TW = { max: null, pos: {} };
function twEnhance(root) {
  document.body.classList.toggle('tw-max-on', false);
  layoutLaden();
  let nr = 0;   // gezählt werden nur echte Datentabellen (mit Spalten-Schlüsseln) – kleine Übersichten davor verschieben die Nummer nicht
  $$('.tw', root).forEach(tw => {
    if (!tw.querySelector('thead') || tw.closest('.korb')) return;
    const i = tw.querySelector('thead th[data-k]') ? nr++ : 'x' + nr;
    const key = (UI.view === 'guv' && UI.auswTab && UI.auswTab !== 'guv' ? 'ausw-' + UI.auswTab : UI.view) + ':' + i; tw.dataset.twk = key;   // jede Auswertung merkt sich ihre Spalten selbst
    const box = document.createElement('div'); box.className = 'twbox'; tw.before(box);
    box.innerHTML = `<div class="twbar"><button class="btn sm" data-tw="l" title="Nach links" aria-label="Nach links">◀</button><button class="btn sm" data-tw="r" title="Nach rechts" aria-label="Nach rechts">▶</button>
      <span class="sp"></span><button class="btn sm" data-tw="sp" title="Spalten ein- und ausblenden">☰ Spalten</button><button class="btn sm" data-tw="max">${TW.max === key ? '✕ Verkleinern' : '⤢ Maximieren'}</button></div>`;
    box.appendChild(tw); tw.classList.add('scroll');
    twSpalten(tw, key, box);
    if (TW.max === key) { box.classList.add('max'); document.body.classList.add('tw-max-on'); }
    const fr = tw.querySelector('tr.frow'), h1 = tw.querySelector('thead tr');
    if (fr && h1) fr.querySelectorAll('th').forEach(th => th.style.top = h1.offsetHeight + 'px');
    const p = TW.pos[key]; if (p) { tw.scrollLeft = p[0]; tw.scrollTop = p[1]; }
    tw.addEventListener('scroll', () => { TW.pos[key] = [tw.scrollLeft, tw.scrollTop]; twPfeile(box, tw); }, { passive: true });
    twPfeile(box, tw);
    box.querySelector('.twbar').addEventListener('click', e => {
      const a = e.target.closest('[data-tw]')?.dataset.tw; if (!a) return;
      if (a === 'l' || a === 'r') { tw.scrollLeft += (a === 'l' ? -1 : 1) * Math.max(200, tw.clientWidth * 0.7); TW.pos[key] = [tw.scrollLeft, tw.scrollTop]; twPfeile(box, tw); }
      if (a === 'max') { TW.max = TW.max === key ? null : key; render(); }
      if (a === 'reset') { delete SPALTEN[key]; spaltenSpeichern(); delete BREITEN[key]; breitenSpeichern(); delete SP_AUS[key]; spAusSpeichern(); render(); }
      if (a === 'sp') { e.stopPropagation(); spaltenMenue(e.target.closest('[data-tw]'), tw, key); }
    });
    // Mit gedrückter Maus seitlich ziehen (Klick ohne Bewegung öffnet weiter die Zeile)
    tw.addEventListener('mousedown', e => { if (e.button !== 0 || e.target.closest('input,select,textarea,button,a,thead')) return; TW.drag = { tw, sx: e.clientX, sl: tw.scrollLeft, bewegt: false }; });
    tw.addEventListener('click', e => { if (TW.nachZiehen) { e.stopPropagation(); e.preventDefault(); } }, true);
  });
}
window.addEventListener('mousemove', e => { const d = TW.drag; if (!d) return; const dx = e.clientX - d.sx; if (!d.bewegt && Math.abs(dx) > 6) { d.bewegt = true; d.tw.classList.add('ziehen'); } if (d.bewegt) { d.tw.scrollLeft = d.sl - dx; e.preventDefault(); } });
window.addEventListener('mouseup', () => { const d = TW.drag; if (!d) return; TW.drag = null; d.tw.classList.remove('ziehen'); if (d.bewegt) { TW.nachZiehen = true; setTimeout(() => TW.nachZiehen = false, 0); } });
/* Spalten-Reihenfolge, ausgeblendete Spalten und Breiten je Tabelle: in der Cloud gespeichert (Einstellung „tabellen_layout“),
   damit es auf jedem Gerät und für alle gleich aussieht; im Browser zusätzlich als Zwischenspeicher. */
const SPALTEN = (() => { try { return JSON.parse(localStorage.getItem('mc-spalten')) || {}; } catch (e) { return {}; } })();
let LAYOUT_GELADEN = false, layoutT;
function layoutLaden() {
  if (LAYOUT_GELADEN || !S.user) return; LAYOUT_GELADEN = true;
  // Rechnungsausgang: durch die Monatsübersicht hieß die Haupttabelle kurzzeitig „ausgang:1“ – jetzt wieder „ausgang:0“
  [SPALTEN, SP_AUS, BREITEN].forEach(m => { if (m['ausgang:1'] && !m['ausgang:0']) { m['ausgang:0'] = m['ausgang:1']; delete m['ausgang:1']; } });
  const l = S.einstellungen && S.einstellungen.tabellen_layout;
  if (l && typeof l === 'object') { [[SPALTEN, l.spalten], [SP_AUS, l.aus], [BREITEN, l.breiten]].forEach(([ziel, q]) => { if (q && typeof q === 'object') { Object.keys(ziel).forEach(k => delete ziel[k]); Object.assign(ziel, q); } }); }
  else if (Object.keys(SPALTEN).length || Object.keys(SP_AUS).length || Object.keys(BREITEN).length) layoutCloud();   // bisher nur im Browser → einmal hochladen
}
function layoutCloud() { clearTimeout(layoutT); layoutT = setTimeout(() => { if (S.user) DB.setSetting('tabellen_layout', { spalten: SPALTEN, aus: SP_AUS, breiten: BREITEN }).catch(e => console.warn(e)); }, 600); }
function spaltenSpeichern() { try { localStorage.setItem('mc-spalten', JSON.stringify(SPALTEN)); } catch (e) { } layoutCloud(); }
function twSpalten(tw, key, box) {
  const h = tw.querySelector('thead tr'); if (!h) return;
  const keys = [...h.children].map(th => th.dataset.k || ''), n = keys.length;
  const want = SPALTEN[key];
  if (want && keys.every(Boolean)) {
    const order = [...want.filter(k => keys.includes(k)), ...keys.filter(k => !want.includes(k))].map(k => keys.indexOf(k));
    if (order.some((v, i) => v !== i)) tw.querySelectorAll('tr').forEach(tr => { const c = [...tr.children]; if (c.length === n) order.forEach(i => tr.appendChild(c[i])); });
    box.querySelector('.twbar .sp').insertAdjacentHTML('afterend', '<button class="btn sm" data-tw="reset" title="Ursprüngliche Spaltenreihenfolge">↺ Spalten</button>');
  }
  // Excel-Look: jede Zelle bekommt ihre Spalte als Klasse (c-brutto, c-st …), die Tabelle ihren Bereich (Farben wie in der Excel-Mappe)
  tw.dataset.view = UI.view;
  const ks = [...h.children].map(th => th.dataset.k || '');
  tw.querySelectorAll('tr').forEach(tr => { if (tr.children.length !== n) return; [...tr.children].forEach((c, i) => { if (ks[i]) c.classList.add('c-' + ks[i]); }); });
  twBreiten(tw, key, h);
  // Gekürzte lange Texte (Verwendungszweck, Notiz …) beim Drüberfahren vollständig zeigen
  tw.querySelectorAll('tbody td.zweck, tbody td.verk, tbody td.c-notiz, tbody td.c-zweck, tbody td.c-beschr, tbody td.c-re, tbody td.c-zahl, tbody td.c-nr, tbody td.c-ka, tbody td.stick').forEach(td => { if (!td.title) td.title = td.textContent.trim(); });
  // Ausgeblendete Spalten (pro Tabelle gemerkt) + „✕“ in der Überschrift zum Ausblenden
  const aus = SP_AUS[key] || [];
  [...h.children].forEach((th, i) => {
    if (!ks[i]) return;
    if (aus.includes(ks[i])) tw.querySelectorAll('tr').forEach(tr => { if (tr.children.length === n) tr.children[i].classList.add('col-aus'); });
    const x = document.createElement('span'); x.className = 'col-x'; x.textContent = '✕'; x.title = 'Spalte ausblenden (zurückholen über „☰ Spalten“)';
    x.addEventListener('click', e => { e.stopPropagation(); e.preventDefault(); SP_AUS[key] = [...new Set([...(SP_AUS[key] || []), ks[i]])]; spAusSpeichern(); render(); });
    x.addEventListener('mousedown', e => e.stopPropagation());
    th.appendChild(x);
  });
  if (aus.length) box.querySelector('[data-tw=sp]').innerHTML = `☰ Spalten <span class="cnt">${aus.length} aus</span>`;
  if (!want && ((BREITEN[key] && Object.keys(BREITEN[key]).length) || aus.length)) box.querySelector('.twbar .sp').insertAdjacentHTML('afterend', '<button class="btn sm" data-tw="reset" title="Ursprüngliche Spalten (Reihenfolge und Breite)">↺ Spalten</button>');
  const hs = [...h.children], ni = hs.findIndex(th => th.dataset.name);
  if (ni >= 0) tw.querySelectorAll('tr').forEach(tr => { if (tr.children.length === n) tr.children[ni].classList.add('stick'); });
  hs.forEach(th => {
    if (!th.dataset.k) return; th.draggable = true;
    th.addEventListener('dragstart', e => { e.dataTransfer.setData('text/x-spalte', th.dataset.k); e.dataTransfer.effectAllowed = 'move'; th.classList.add('zieht'); });
    th.addEventListener('dragend', () => { th.classList.remove('zieht'); hs.forEach(t => t.classList.remove('ziel')); });
    th.addEventListener('dragover', e => { if (![...e.dataTransfer.types].includes('text/x-spalte')) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; th.classList.add('ziel'); });
    th.addEventListener('dragleave', () => th.classList.remove('ziel'));
    th.addEventListener('drop', e => {
      const k = e.dataTransfer.getData('text/x-spalte'); th.classList.remove('ziel'); if (!k || k === th.dataset.k) return;
      e.preventDefault();
      const cur = [...h.children].map(t => t.dataset.k), von = cur.indexOf(k), ziel = cur.indexOf(th.dataset.k);
      cur.splice(von, 1); cur.splice(von < ziel ? cur.indexOf(th.dataset.k) + 1 : cur.indexOf(th.dataset.k), 0, k);   // nach rechts: hinter das Ziel, nach links: davor
      SPALTEN[key] = cur; spaltenSpeichern(); render();
    });
  });
}
/* Spalten ein-/ausblenden (pro Tabelle und Browser gemerkt) */
const SP_AUS = (() => { try { return JSON.parse(localStorage.getItem('mc-spalten-aus')) || {}; } catch (e) { return {}; } })();
function spAusSpeichern() { try { localStorage.setItem('mc-spalten-aus', JSON.stringify(SP_AUS)); } catch (e) { } layoutCloud(); }
function spaltenMenue(btn, tw, key) {
  $('.sp-menu')?.remove();
  const h = tw.querySelector('thead tr'); if (!h) return;
  const aus = SP_AUS[key] || [];
  const m = document.createElement('div'); m.className = 'sp-menu';
  m.innerHTML = `<b>Spalten anzeigen</b>${[...h.children].filter(th => th.dataset.k).map(th => `<label class="chk inline"><input type="checkbox" data-k="${th.dataset.k}" ${aus.includes(th.dataset.k) ? '' : 'checked'}> ${esc((th.childNodes[0]?.textContent || th.dataset.k).trim() || th.dataset.k)}</label>`).join('')}
    <div class="btnrow"><button class="btn sm" data-m="alle">Alle zeigen</button><button class="btn sm primary" data-m="ok">Fertig</button></div>`;
  document.body.appendChild(m);
  const r = btn.getBoundingClientRect(); m.style.top = Math.min(r.bottom + 6, innerHeight - m.offsetHeight - 10) + 'px'; m.style.left = Math.max(10, Math.min(r.left, innerWidth - m.offsetWidth - 10)) + 'px';
  m.addEventListener('change', e => { const k = e.target.dataset.k; if (!k) return; const s = new Set(SP_AUS[key] || []); e.target.checked ? s.delete(k) : s.add(k); SP_AUS[key] = [...s]; spAusSpeichern(); render(); });
  m.addEventListener('click', e => { const a = e.target.closest('[data-m]')?.dataset.m; if (a === 'alle') { delete SP_AUS[key]; spAusSpeichern(); render(); m.remove(); } if (a === 'ok') m.remove(); });
  setTimeout(() => document.addEventListener('click', function zu(e) { if (!m.contains(e.target)) { m.remove(); document.removeEventListener('click', zu); } }), 0);
}
/* Spaltenbreite: am rechten Rand der Überschrift ziehen (Maus oder Finger), Doppelklick = wieder automatisch. Pro Tabelle gemerkt. */
const BREITEN = (() => { try { return JSON.parse(localStorage.getItem('mc-breiten')) || {}; } catch (e) { return {}; } })();
function breitenSpeichern() { try { localStorage.setItem('mc-breiten', JSON.stringify(BREITEN)); } catch (e) { } layoutCloud(); }
function spalteBreite(tw, idx, w) {
  tw.querySelectorAll('tr').forEach(tr => { const c = tr.children[idx]; if (!c || tr.children.length !== tw.querySelector('thead tr').children.length) return;
    if (w) { c.style.width = c.style.minWidth = c.style.maxWidth = w + 'px'; c.classList.add('fix-w'); } else { c.style.width = c.style.minWidth = c.style.maxWidth = ''; c.classList.remove('fix-w'); } });
}
function twBreiten(tw, key, h) {
  const B = BREITEN[key] || {};
  [...h.children].forEach((th, i) => {
    const k = th.dataset.k; if (!k) return;
    if (B[k]) spalteBreite(tw, i, B[k]);
    const g = document.createElement('span'); g.className = 'col-gr'; g.title = 'Ziehen = Breite ändern · Doppelklick = automatisch'; g.setAttribute('aria-hidden', 'true'); th.appendChild(g);
    g.addEventListener('pointerdown', e => {
      e.preventDefault(); e.stopPropagation(); g.setPointerCapture(e.pointerId);
      const idx = [...h.children].indexOf(th), x0 = e.clientX, w0 = th.getBoundingClientRect().width; let w = w0;
      tw.classList.add('col-resize');
      const mv = ev => { w = Math.max(40, Math.round(w0 + ev.clientX - x0)); spalteBreite(tw, idx, w); };
      const up = () => { g.removeEventListener('pointermove', mv); g.removeEventListener('pointerup', up); g.removeEventListener('pointercancel', up); tw.classList.remove('col-resize');
        if (Math.abs(w - w0) > 2) { (BREITEN[key] = BREITEN[key] || {})[k] = w; breitenSpeichern(); TW.nachZiehen = true; setTimeout(() => TW.nachZiehen = false, 0); } };
      g.addEventListener('pointermove', mv); g.addEventListener('pointerup', up); g.addEventListener('pointercancel', up);
    });
    g.addEventListener('click', e => { e.stopPropagation(); e.preventDefault(); });
    g.addEventListener('dblclick', e => { e.stopPropagation(); e.preventDefault(); if (BREITEN[key]) { delete BREITEN[key][k]; breitenSpeichern(); } spalteBreite(tw, [...h.children].indexOf(th), 0); });
    g.addEventListener('dragstart', e => { e.preventDefault(); e.stopPropagation(); });
  });
}
// Spaltenfilter-Liste (Häkchen) liegt über der Tabelle, damit sie in der Scroll-Box nicht abgeschnitten wird
function cfmPos(d) {
  const p = d.querySelector('.msel-pop'), s = d.querySelector('summary'); if (!p || !s) return;
  const r = s.getBoundingClientRect(); p.style.left = Math.max(8, Math.min(r.left, innerWidth - 290)) + 'px';
  const unten = innerHeight - r.bottom; p.style.top = (unten > 260 ? r.bottom + 4 : Math.max(8, r.top - Math.min(p.offsetHeight || 300, innerHeight * 0.6) - 4)) + 'px';
}
function twPfeile(box, tw) {
  const breit = tw.scrollWidth > tw.clientWidth + 2;
  box.classList.toggle('breit', breit);
  const [l, r] = box.querySelectorAll('[data-tw=l],[data-tw=r]');
  if (l) l.disabled = tw.scrollLeft <= 1; if (r) r.disabled = tw.scrollLeft + tw.clientWidth >= tw.scrollWidth - 1;
}
window.addEventListener('resize', () => $$('.twbox').forEach(b => twPfeile(b, $('.tw', b))));
document.addEventListener('keydown', e => { if (e.key === 'Escape' && TW.max && !$('#sheet')) { TW.max = null; render(); } });

/* ---------- Aktionen (data-act) ---------- */
Object.assign(A, {
  menu: () => { const on = document.body.classList.toggle('menu-on'); $('.menu-btn')?.setAttribute('aria-expanded', on); },
  go: d => { document.body.classList.remove('menu-on'); $('.menu-btn')?.setAttribute('aria-expanded', 'false'); UI.view = d.v; if (d.f) UI.filt[d.v] = d.f;
    if (d.v === 'ausgang' && UI.cs.ausgang) { UI.cs.ausgang.k = null; UI.cs.ausgang.d = null; } /* beim Öffnen immer neueste Rechnung oben */ if (d.t) UI.auswTab = d.t; render(); window.scrollTo(0, 0); $('#main').focus({ preventScroll: true }); },
  filt: d => { UI.filt[d.v] = d.f; UI.more[d.v] = 0; render(); },
  filtT: d => { let sel = filtListe(d.v); if (d.f === 'alle') sel = []; else sel = sel.includes(d.f) ? sel.filter(x => x !== d.f) : sel.concat(d.f); UI.filt[d.v] = sel.length ? sel : 'alle'; UI.more[d.v] = 0; render(); },   /* Filterknopf an/aus, mehrere gleichzeitig */
  avisD: d => avisDetail(d.id),
  bezahlen: () => bezahlenAnsicht(),
  zahlD: d => zahlungenFenster(d.id),
  pruefen: () => pruefAnsicht(),
  regelNeu: async () => {
    const t = ($('#rgText') || {}).value || ''; if (t.trim().length < 5) return toast('Bitte erst den Hinweis in eigenen Worten eintippen.');
    busy(true, DB.aiOn ? 'KI macht daraus eine Regel …' : 'Regel vorbereiten …');
    try { const g = await regelAusText(t.trim()); busy(false); regelForm({ ...g, text: t.trim(), kurz: g.kurz || t.trim() }, null); }
    catch (e) { busy(false); toast(aiErr(e)); regelForm({ text: t.trim(), kurz: t.trim(), quelle: 'bank', richtung: 'beide', suche: [], oder: [], aktion: 'ignorieren' }, null); }
  },
  regelEdit: d => regelForm(regeln()[+d.i], +d.i),
  regelDel: async d => { const l = regeln().slice(), g = l[+d.i]; if (!confirm('Regel löschen?\n' + (g.kurz || g.text || ''))) return; l.splice(+d.i, 1); await regelnSpeichern(l); render(); toast('Regel gelöscht – bereits eingeordnete Einträge bleiben, bis du sie änderst.'); },
  abgAlle: d => { UI.abgOpen = {}; if (d.v === '1') $$('details.abg').forEach(x => UI.abgOpen[x.dataset.abg] = true); render(); },
  neuAbgleich: async () => {
    const auto = S.zuordnungen.filter(z => z.art === 'auto');
    if (!confirm(`${auto.length} automatische Zuordnungen verwerfen und mit den aktuellen Regeln neu berechnen?\nVon Hand zugeordnete Zahlungen bleiben unverändert.`)) return;
    busy(true, 'Berechne den Abgleich neu …');
    try { await DB.remove('zuordnungen', auto.map(z => z.id)); const r = await autoAbgleich(); toast(`Neu berechnet: ${r.n} Zuordnungen (vorher ${auto.length}).`); }
    catch (e) { toast('Fehler: ' + e.message); }
    busy(false); render();
  },
  korbGo: () => korbVerarbeiten(),
  offeneListe: () => offeneListe(),
  darlNeu: () => darlNeu(),
  darlWeg: async d => { const l = darlAnfang().slice(), a = l[+d.i]; if (!a || !confirm(`Darlehen „${a.geber}“ (${fmtE(a.betrag)}) aus der Liste entfernen?`)) return; l.splice(+d.i, 1); await DB.setSetting('darlehen_anfang', l); render(); },
  filtLeer: d => { UI.filt[d.v] = 'alle'; UI.more[d.v] = 0; render(); },
  offeneZeigen: () => { UI.filt.ausgang = 'offen'; UI.cs.ausgang = { ...(UI.cs.ausgang || {}), k: 'datum', d: 'asc' }; UI.more.ausgang = 0; render(); },
  // Ablage
  ablGo: d => { UI.abl = d.p || ''; UI.q.ablage = ''; render(); window.scrollTo(0, 0); },
  ablOeffnen: async d => { const w = window.open('', '_blank'); try { const u = await DB.fileUrl(d.f); if (w) w.location = u; else location.href = u; } catch (e) { w?.close(); toast('Datei nicht geöffnet: ' + e.message); } },
  dokHoch: () => { let i = $('#dokIn'); if (!i) { i = document.createElement('input'); i.type = 'file'; i.multiple = true; i.hidden = true; i.id = 'dokIn'; i.onchange = () => { dokHochladen([...i.files]); i.value = ''; }; document.body.appendChild(i); } i.click(); },
  dokOrdner: async () => {
    const n = dokOrdnerName(prompt('Name des neuen Ordners (z. B. Verträge, Versicherungen):') || ''); if (!n) return;
    const sub = (UI.abl || '').split('/').slice(1).concat(n).join('/');
    try { await DB.upload(dokPrefix(sub) + '/' + DOK_PLATZ, new Blob([''], { type: 'text/plain' })); await dokLaden((UI.abl || '').split('/').slice(1).join('/'), true); UI.abl = 'dok/' + sub; render(); }
    catch (e) { toast('Ordner nicht angelegt: ' + e.message); }
  },
  dokOrdnerWeg: async () => {
    const t = (UI.abl || '').split('/'), sub = t.slice(1).join('/'); if (!sub || !confirm(`Ordner „${t[t.length - 1]}“ löschen?`)) return;
    try { await DB.removeFile(dokPrefix(sub) + '/' + DOK_PLATZ); delete DOK.cache[dokPrefix(sub)]; UI.abl = t.slice(0, -1).join('/'); await dokLaden(UI.abl.split('/').slice(1).join('/'), true); render(); }
    catch (e) { toast('Nicht gelöscht: ' + e.message); }
  },
  dokWeg: async d => {
    if (!confirm(`„${dokName(d.f.split('/').pop())}“ endgültig löschen?`)) return;
    try { await DB.removeFile(d.f); await dokLaden((UI.abl || '').split('/').slice(1).join('/'), true); render(); toast('Gelöscht.'); }
    catch (e) { toast('Nicht gelöscht: ' + e.message); }
  },
  korbDel: d => { KORB.splice(+d.i, 1); korbRender(); },
  korbLeer: () => { KORB.length = 0; korbRender(); },
  korbPick: () => $('#anyIn').click(),
  korbZu: () => $('#korb')?.classList.toggle('zu'),
  ablageWahl: async d => { await ablageWaehlen(d.art || 'eingang'); render(); korbRender(); },
  ablageAlle: () => ablageAlle(),
  ablageAus: async d => { await ablageAus(d.art || 'eingang'); render(); toast('Ordner-Ablage ausgeschaltet.'); },
  more: d => { UI.more[d.v] = (UI.more[d.v] || 300) + 300; render(); },
  // Spaltenkopf: aufsteigend → absteigend → wieder Standard-Sortierung
  colSort: d => { const st = UI.cs[d.v] = UI.cs[d.v] || {}; if (st.k !== d.k) { st.k = d.k; st.d = 'asc'; } else if (st.d === 'asc') st.d = 'desc'; else { st.k = null; st.d = null; } render(); },
  colReset: d => { UI.cs[d.v] = {}; Object.keys(UI.q).forEach(k => { if (k.startsWith(d.v + '|')) delete UI.q[k]; }); UI.more[d.v] = 0; render(); },
  rechnung: d => rechnungDetail(d.id), bank: d => bankDetail(d.id), sumup: d => sumupDetail(d.id), kasseD: d => kasseDetail(d.id),
  todo: d => { const t = S.todos.find(x => x.id === d.id); if (t) todoForm(t); }, todoNeu: () => todoForm(null), todoHaken: d => todoHaken(d.id),
  kasseNeu: d => kasseForm(null, d.a),
  hebeNeu: d => hebeForm(null, { datum: d.d || todayISO(), mitarbeiter: d.ma || '' }), hebeE: d => { const h = S.hebebuehne.find(x => x.id === d.id); if (h) hebeForm(h); },
  hebeKW: d => { const [y, w] = (UI.hebeKW || kwKey(todayISO())).split('-').map(Number); UI.hebeKW = +d.d === 0 ? kwKey(todayISO()) : kwKey(addDays(isoWeekMonday(y, w), 7 * +d.d)); render(); },
  hebeGo: d => { UI.hebeKW = d.k; render(); window.scrollTo(0, 0); },
  guvZelle: d => guvZelle(d.k, +d.m, !!d.nur), guvCsv: () => guvCsv(), lstErfassen: () => lstErfassen(),
  auswTab: d => { UI.auswTab = d.t; render(); window.scrollTo(0, 0); }, auswZelle: d => auswZelle(d.k), auswCsv: () => auswCsv(),
  pick: d => { const i = $('#tblIn'); i.dataset.t = d.t; i.click(); },
  pickBeleg: () => $('#belegIn').click(),
  neuR: d => rechnungForm(d.dir),
  auto: async () => { busy(true, 'Gleiche ab …'); try { const r = await autoAbgleich(); busy(false); render(); abgleichBericht(r); } catch (e) { busy(false); toast('Fehler: ' + e.message); render(); } },
  csv: d => exportCsv(d.v),
  undoImp: async d => {
    const imp = S.importe.find(i => i.id === d.id); if (!imp) return;
    const t = imp.art === 'ausgang' || imp.art === 'eingang' ? 'rechnungen' : imp.art, ids = S[t].filter(r => r.import_id === imp.id).map(r => r.id);
    if (!confirm(`Import „${imp.datei}“ rückgängig machen? ${ids.length} Einträge und ihre Zuordnungen werden gelöscht.`)) return;
    busy(true, 'Lösche …'); try { await DB.remove(t, ids); await DB.remove('importe', imp.id); toast('Import rückgängig gemacht.'); } catch (e) { toast('Fehler: ' + e.message); } busy(false); render();
  },
  logout: () => DB.signOut(),
  pw: () => openSheet({ title: 'Passwort ändern', html: '<label class="fld"><span>Neues Passwort (mind. 8 Zeichen)</span><input class="inp" type="password" id="npw" autocomplete="new-password"></label>', onOk: async d => { const p = $('#npw', d).value; if (p.length < 8) { toast('Mindestens 8 Zeichen.'); return false; } await DB.setPw(p); toast('Passwort geändert.'); } }),
  demo: async () => { busy(true, 'Lege Demo-Daten an …'); await demoDaten(); busy(false); UI.period = 'alle'; render(); toast('Demo-Daten geladen – schau dir „Abgleich & Probleme“ an.'); },
  resetDemo: () => { if (confirm('Alle Demo-Daten in diesem Browser löschen?')) { DB.resetLocal(); render(); } },
});
document.addEventListener('click', e => {
  // Mehrfach-Filter: Klick daneben schließt die Liste
  if (!e.target.closest('.msel')) { $$('details.msel[open]').forEach(d => d.open = false); UI.mselAuf = {}; }
  const el = e.target.closest('[data-act]'); if (!el) return;
  if (e.target.closest('select, input, textarea') && el.tagName === 'TR') return;   // Auswahlfeld in der Zeile (z. B. Status) öffnet nicht die Rechnung
  // In Fenstern nur Zeilen-Klicks (Rechnung/Bank/SumUp öffnen) global behandeln
  if (el.closest('#sheet') && !['rechnung', 'bank', 'sumup', 'kasseD', 'avisD'].includes(el.dataset.act)) return;
  const f = A[el.dataset.act]; if (f) { e.preventDefault(); f({ ...el.dataset }); }
});
document.addEventListener('change', e => {
  const c = e.target.dataset && e.target.dataset.chg; if (!c) return;
  if (c === 'period') { UI.period = e.target.value; render(); }
  if (c === 'colFM') {   // Spaltenfilter mit Mehrfachauswahl; „Alle“ hebt alles auf, die Liste bleibt offen
    const d = e.target.dataset, st = UI.cs[d.v] = UI.cs[d.v] || {}; st.f = st.f || {}; let l = cfListe(st, d.k);
    l = !d.o ? [] : e.target.checked ? [...new Set(l.concat(d.o))] : l.filter(x => x !== d.o);
    st.f[d.k] = l; UI.more[d.v] = 0; UI.mselAuf = { ...(UI.mselAuf || {}), ['cf:' + d.v + ':' + d.k]: true }; render();
  }
  if (c === 'filtM') {   // Mehrfach-Filter: Häkchen setzen/entfernen; „Alle“ hebt alles auf. Liste bleibt offen.
    const v = e.target.dataset.v, k = e.target.dataset.k; let sel = filtListe(v);
    if (k === 'alle') sel = []; else sel = e.target.checked ? [...new Set(sel.concat(k))] : sel.filter(x => x !== k);
    UI.filt[v] = sel.length ? sel : 'alle'; UI.more[v] = 0; UI.mselAuf = { ...(UI.mselAuf || {}), [v]: true }; render();
  }
  if (c === 'filt') { const v = e.target.dataset.v; UI.filt[v] = e.target.value; UI.more[v] = 0; render(); }
  if (c === 'theme') themeSetzen(e.target.checked ? 'light' : 'dark');
  if (c === 'colF') { const d = e.target.dataset, st = UI.cs[d.v] = UI.cs[d.v] || {}; st.f = st.f || {}; st.f[d.k] = e.target.value; UI.more[d.v] = 0; render(); }
  if (c === 'ziel') { DB.setSetting('zahlungsziel', Math.max(0, +e.target.value || 0)).then(render); }
  if (c === 'rstatus') {
    const r = S.rechnungen.find(x => x.id === e.target.dataset.id); if (!r) return;
    const v = e.target.value;
    // „storniert“ schließt die Rechnung; wer von „storniert“ zurückstellt, öffnet sie wieder
    DB.update('rechnungen', r.id, { status_excel: v, erledigt: istStornoLaut(v) ? true : istStornoLaut(r.status_excel) ? false : r.erledigt })
      .then(() => { render(); if ($('#sheet') && e.target.closest('#sheet')) rechnungDetail(r.id); toast('Status: ' + v); }).catch(err => toast('Fehler: ' + err.message));
  }
  if (c === 'guvJahr') { UI.guvJahr = e.target.value; render(); }
  if (c === 'guvOhne') { UI.guvOhne = e.target.checked; render(); }
  if (c === 'bwaMon') { UI.bwaMon = +e.target.value; render(); }
  if (c === 'ustPer') { UI.ustPer = e.target.value; render(); }
  if (c === 'ustIst') { UI.ustIst = !!e.target.value; render(); }
  if (c === 'todoWer') { UI.todoWer = e.target.value; render(); }
  if (c === 'hebeMa') { UI.hebeMa = e.target.value; render(); }
  if (c === 'stundensatz') { DB.setSetting('stundensatz', Math.max(0, parseNum(e.target.value) || 0)).then(render); }
  if (c === 'kasseAnfang') { DB.setSetting('kasse_anfang', parseNum(e.target.value) || 0).then(render); }
});
let qT; document.addEventListener('input', e => { const v = e.target.dataset && e.target.dataset.q; if (!v) return; UI.q[v] = e.target.value; UI.more[v.split('|')[0]] = 0; clearTimeout(qT); qT = setTimeout(render, 200); });

// Dateien irgendwo ins Fenster ziehen
// Problemseite: Rubrik auf-/zuklappen merken; Inhalt wird erst beim Aufklappen gezeichnet
document.addEventListener('toggle', e => {
  const d = e.target;
  if (d.matches && d.dataset && d.dataset.auf) { UI.auf = { ...(UI.auf || {}), [d.dataset.auf]: d.open }; return; }   // aufgeklappte Übersichten merken
  if (d.matches && d.matches('details.cfm') && d.open) cfmPos(d);
  if (d.matches && d.matches('details.msel')) { UI.mselAuf = { ...(UI.mselAuf || {}), [d.dataset.msel]: d.open }; return; } if (!d.matches || !d.matches('details.abg')) return;
  UI.abgOpen = UI.abgOpen || {}; UI.abgOpen[d.dataset.abg] = d.open;
  if (d.open && !d.querySelector('.tw, .empty')) { const y = window.scrollY; render(); window.scrollTo(0, y); }
}, true);
// Hinweis „Loslassen zum Übernehmen“: an, solange eine Datei über dem Fenster schwebt; verschwindet von selbst
// (beim Loslassen – auch auf der Suchleiste –, beim Abbrechen oder spätestens 300 ms nach der letzten Bewegung)
let veilT;
const veilAus = () => { clearTimeout(veilT); $('#veil')?.classList.remove('on'); };
const hatDateien = e => [...(e.dataTransfer?.types || [])].includes('Files');
document.addEventListener('dragover', e => { e.preventDefault(); if (!hatDateien(e)) return; $('#veil')?.classList.add('on'); clearTimeout(veilT); veilT = setTimeout(veilAus, 300); }, true);
document.addEventListener('drop', veilAus, true);
document.addEventListener('dragend', veilAus, true);
window.addEventListener('blur', veilAus);
document.addEventListener('keydown', e => { if (e.key === 'Escape') veilAus(); });
document.addEventListener('drop', e => {
  e.preventDefault(); if (!e.dataTransfer.files.length || !S.user) return;
  // Rechnung geöffnet und genau ein Beleg reingezogen → an diese Rechnung hängen
  const rid = $('#sheet')?.dataset.rid, fs = [...e.dataTransfer.files];
  if (rid && fs.length === 1 && !isTable(fs[0])) return belegZuRechnung(rid, fs[0]);
  // Ablage → Dokumente: Dateien landen im geöffneten Ordner
  if (UI.view === 'ablage' && /^dok(\/|$)/.test(UI.abl || '') && !$('#sheet')) return dokHochladen(fs);
  korbAdd(e.dataTransfer.files);   // erst sammeln, verarbeitet wird mit „Verarbeiten“
});

/* ---------- CSV-Export (für Steuerberater / Excel) ---------- */
function exportCsv(v) {
  buildIdx(); let rows, name;
  if (v === 'ausgang' || v === 'eingang') {
    rows = [['Richtung', 'Rechnungsnr', 'Datum', 'Fällig', v === 'ausgang' ? 'Kunde' : 'Lieferant', 'Kennzeichen', 'Kostenart', 'Netto', 'MwSt', 'Brutto', 'Bezahlt', 'Offen', 'Zahlart', 'Status', 'Beschreibung', 'Notiz']];
    S.rechnungen.filter(r => r.richtung === v).sort((a, b) => (a.datum || '').localeCompare(b.datum || '')).forEach(r => { const st = rStatus(r); rows.push([v, r.nummer, fmtD(r.datum), fmtD(faelligAm(r)), r.partner, r.kennzeichen, r.kostenart, numDE(r.netto), numDE(r.mwst), numDE(r.brutto), numDE(st.bezahlt), numDE(st.offen), ZA[r.zahlart] || '', st.label, r.beschreibung, r.notiz]); });
    name = `Mastercar_${v}_${todayISO()}.csv`;
  } else if (v === 'bank') {
    rows = [['Datum', 'Betrag', 'Name', 'IBAN', 'Verwendungszweck', 'Kostenart', 'Status', 'Rechnungen']];
    [...S.bank].sort((a, b) => a.datum.localeCompare(b.datum)).forEach(b => { const st = bStatus(b); rows.push([fmtD(b.datum), numDE(b.betrag), b.gegenpartei, b.iban, b.zweck, b.kostenart, st.label, st.zuordnungen.map(z => S.rechnungen.find(r => r.id === z.rechnung_id)?.nummer).filter(Boolean).join(', ')]); });
    name = `Mastercar_Bank_${todayISO()}.csv`;
  } else if (v === 'kasse') {
    const B = kasseBestand();
    rows = [['Datum', 'Beleg-Nr.', 'Text', 'Einnahme', 'Ausgabe', 'Bestand', 'Kostenart', 'Rechnung'], ['', '', 'Anfangsbestand', '', '', numDE(kasseAnfang()), '', '']];
    [...S.kasse].sort(kasseSort).forEach(k => rows.push([fmtD(k.datum), k.belegnr, k.text, k.betrag > 0 ? numDE(k.betrag) : '', k.betrag < 0 ? numDE(-k.betrag) : '', numDE(B.map.get(k.id)), k.kostenart, kStatus(k).zuordnungen.map(z => S.rechnungen.find(r => r.id === z.rechnung_id)?.nummer).filter(Boolean).join(', ')]));
    name = `Mastercar_Kassenbuch_${todayISO()}.csv`;
  } else {
    rows = [['Datum', 'Betrag', 'Gebühr', 'Beschreibung', 'Karte', 'Transaktion', 'Status', 'Rechnung']];
    [...S.sumup].sort((a, b) => a.datum.localeCompare(b.datum)).forEach(s => { const st = sStatus(s); rows.push([fmtD(s.datum), numDE(s.betrag), numDE(s.gebuehr), s.beschreibung, s.zahlungsart, s.transaktion, st.label, st.zuordnungen.map(z => S.rechnungen.find(r => r.id === z.rechnung_id)?.nummer).filter(Boolean).join(', ')]); });
    name = `Mastercar_SumUp_${todayISO()}.csv`;
  }
  download(name, rows.map(csvRow).join('\r\n'));
}

/* ---------- Anmeldung ---------- */
function loginScreen(msg = '') {
  document.body.innerHTML = `<div class="login"><form class="login-card" id="lf">
    <div class="brand big"><span class="logo">MASTERCAR</span><span class="sub">Bornheim · Finanzen</span></div>
    ${msg ? `<div class="warn">${esc(msg)}</div>` : ''}
    <label class="fld"><span>E-Mail</span><input class="inp" type="email" id="le" autocomplete="username" required></label>
    <label class="fld"><span>Passwort</span><input class="inp" type="password" id="lp" autocomplete="current-password" required></label>
    <button class="btn primary">Anmelden</button>
    <button type="button" class="lnk" id="lfg">Passwort vergessen?</button>
    <p class="small muted">VE Sportmanagement UG (haftungsbeschränkt)</p></form></div>`;
  $('#lf').onsubmit = async e => { e.preventDefault(); const b = $('#lf .btn'); b.disabled = true; try { await DB.signIn($('#le').value.trim(), $('#lp').value); start(); } catch (err) { loginScreen(err.message); } };
  $('#lfg').onclick = async () => { const em = $('#le').value.trim(); if (!em) return toast('Bitte erst die E-Mail eintragen.'); try { await DB.resetPw(em); toast('Link zum Zurücksetzen wurde gesendet.'); } catch (e) { toast(e.message); } };
}
async function start() {
  try {
    const u = S.user || await DB.init();
    if (!u) return loginScreen();
    if (!(await DB.isStaff())) return loginScreen('Diese E-Mail ist noch nicht freigeschaltet. Bitte in Supabase in der Tabelle „team“ eintragen.');
    busy(true, 'Lade Daten …'); await DB.loadAll(); bankIbanFix(); await avisUmzug().catch(e => console.warn(e)); await ausgangNamenAngleichen().catch(e => console.warn(e)); busy(false);
    shell(); render();
    // Beim Öffnen still nachgleichen: was seit dem letzten Mal neu dazugekommen ist (z. B. Rechnung nach der Bankbuchung)
    setTimeout(() => autoAbgleich().then(r => { if (r.n || r.links) { render(); toast(`Abgleich: ${r.n} Zahlung${r.n === 1 ? '' : 'en'} neu zugeordnet.`); } }).catch(e => console.warn(e)), 1500);
    if (S._fehlt) setTimeout(() => toast('Bitte in Supabase noch „02_erweiterung.sql“ ausführen – sonst fehlen Kassenbuch, To-Dos und Hebebühne.', 9000), 600);
    // Einladungs- oder Passwort-vergessen-Link: gleich ein eigenes Passwort setzen lassen
    if (DB.cloud && /type=(recovery|invite|signup|magiclink)/.test(START_HASH)) { A.pw(); history.replaceState(null, '', location.pathname); }
  } catch (e) { busy(false); console.error(e); document.body.innerHTML = `<div class="login"><div class="login-card"><h2>Verbindung fehlgeschlagen</h2><p>${esc(e.message || e)}</p><p class="small muted">Prüfe in config.js die Supabase-Adresse und ob 01_einrichtung.sql ausgeführt wurde.</p><button class="btn primary" onclick="location.reload()">Nochmal</button></div></div>`; }
}

/* ---------- Demo-Daten (nur Demo-Modus) ---------- */
async function demoDaten() {
  const kunden = ['Müller, Thomas', 'Schmitz GmbH', 'Weber, Anna', 'Becker Logistik', 'Hoffmann, Jens', 'Klein, Sabine', 'Wagner Bau GmbH', 'Schulz, Peter', 'Fischer, Maria', 'Koch & Söhne'];
  const lief = [['Stahlgruber GmbH', 'Ersatzteile & Material'], ['WM SE', 'Ersatzteile & Material'], ['Reifen Göggel', 'Reifen'], ['Liqui Moly Vertrieb', 'Öl & Schmierstoffe'], ['Würth', 'Werkzeug & Ausstattung'], ['Stadtwerke Bornheim', 'Energie (Strom, Gas, Wasser)']];
  const t = todayISO(), A0 = [], E0 = [], B0 = [], S0 = [];
  let nr = 2400;
  for (let i = 0; i < 36; i++) {
    const d = addDays(t, -110 + i * 3), k = kunden[i % kunden.length], br = r2(80 + ((i * 137) % 900) + (i % 3) * 0.5), za = i % 4 === 0 ? 'ec' : i % 9 === 0 ? 'bar' : 'bank';
    A0.push({ richtung: 'ausgang', nummer: 'RE-' + (++nr), datum: d, partner: k, kennzeichen: 'SU-MC ' + (100 + i), netto: r2(br / 1.19), mwst: r2(br - br / 1.19), brutto: br, zahlart: za, quelle: 'demo', geprueft: true, schluessel: 'A:RE' + nr });
  }
  const aus = await DB.insert('rechnungen', A0);
  for (const r of aus) {
    const i = aus.indexOf(r);
    if (r.zahlart === 'bar') { await DB.insert('zuordnungen', [{ rechnung_id: r.id, betrag: r.brutto, art: 'bar', datum: r.datum }]); continue; }
    if (r.zahlart === 'ec') { S0.push({ transaktion: 'TX' + r.nummer, datum: r.datum, betrag: r.brutto, gebuehr: r2(r.brutto * 0.0139), auszahlung: r2(r.brutto * 0.9861), auszahlung_datum: addDays(r.datum, 2), beschreibung: i % 8 === 0 ? r.nummer : '', zahlungsart: 'girocard', status: 'Erfolgreich' }); continue; }
    if (i >= 30) continue; // die neuesten noch offen
    let betrag = r.brutto, zweck = 'Rechnung ' + r.nummer + ' ' + r.kennzeichen;
    if (i === 5) betrag = r2(r.brutto - 50);              // zu wenig
    if (i === 10) betrag = r2(r.brutto + 20);             // zu viel
    if (i === 14) zweck = 'Danke fuer die Reparatur';     // nur Name + Betrag
    B0.push({ datum: addDays(r.datum, 6 + (i % 10)), betrag, gegenpartei: r.partner.toUpperCase(), iban: 'DE8937040044053201' + String(1000 + i), zweck, schluessel: 'Bdemo' + i });
    if (i === 17) B0.push({ datum: addDays(r.datum, 20), betrag: r.brutto, gegenpartei: r.partner.toUpperCase(), zweck: 'RE ' + r.nummer.slice(3), schluessel: 'Bdemo-d' + i }); // doppelt
  }
  for (let i = 0; i < 14; i++) {
    const [n, ka] = lief[i % lief.length], d = addDays(t, -100 + i * 7), br = r2(120 + (i * 211) % 1400), num = 'L' + (50000 + i * 13);
    E0.push({ richtung: 'eingang', nummer: num, datum: d, faellig: addDays(d, 14), partner: n, kostenart: ka, netto: r2(br / 1.19), mwst: r2(br - br / 1.19), brutto: br, quelle: 'demo', geprueft: i !== 13, schluessel: 'E:' + num });
    if (i < 11) B0.push({ datum: addDays(d, 10), betrag: -br, gegenpartei: n, zweck: 'Rechnung ' + num, schluessel: 'Bdemo-e' + i });
  }
  await DB.insert('rechnungen', E0);
  B0.push({ datum: addDays(t, -40), betrag: -1850, gegenpartei: 'Grundbesitz Bornheim KG', zweck: 'Miete Werkstatt', schluessel: 'Bdemo-m1', kostenart: 'Miete & Nebenkosten' });
  B0.push({ datum: addDays(t, -10), betrag: -1850, gegenpartei: 'Grundbesitz Bornheim KG', zweck: 'Miete Werkstatt', schluessel: 'Bdemo-m2', kostenart: 'Miete & Nebenkosten' });
  B0.push({ datum: addDays(t, -25), betrag: 345.5, gegenpartei: 'Unbekannt Zahler', zweck: 'Zahlung', schluessel: 'Bdemo-u1' });
  S0.push({ transaktion: 'TX-OHNE', datum: addDays(t, -15), betrag: 59.9, gebuehr: 0.83, auszahlung: 59.07, auszahlung_datum: addDays(t, -13), beschreibung: 'Ölwechsel', zahlungsart: 'Visa', status: 'Erfolgreich' });
  const sus = await DB.insert('sumup', S0);
  const byDay = {}; sus.forEach(s => (byDay[s.auszahlung_datum] = byDay[s.auszahlung_datum] || []).push(s));
  Object.entries(byDay).forEach(([d, l], i) => B0.push({ datum: d, betrag: sum(l, s => s.auszahlung), gegenpartei: 'SumUp Payments Limited', zweck: 'SumUp Auszahlung', schluessel: 'Bdemo-s' + i }));
  markBankArten(B0);
  await DB.insert('bank', B0);
  await autoAbgleich();
}

start();
