/* Mastercar Finanzen · EIN Feld für alles (wie im Sonnenplan):
   tippen = sofort suchen · Enter/Frage = KI-Assistent · Dateien reinziehen = importieren/auslesen · 🎙 sprechen */
// Ein Feld für alles (wie im Sonnenplan): tippen = suchen · Enter/🎙 = KI fragen · 📷 Foto · 🖼 Bild · ⬆ Dateien · reinziehen/einfügen
function omniHtml() {
  return `<section class="omni-wrap" id="omni" aria-label="Suchen, fragen oder Dateien ablegen"><div class="omni"><span class="omni-ic">⌕</span>
    <input id="oq" type="search" autocomplete="off" enterkeyhint="go" aria-label="Suchen oder fragen"
      placeholder="${DB.aiOn ? 'Suchen oder fragen – z. B. „Welche Kundenrechnungen sind seit über 30 Tagen offen?“' : 'Suchen: Rechnungsnr., Kunde, Kennzeichen, Betrag, To-Do …'}">
    ${SRec ? '<button type="button" class="omni-b" data-o="mic" title="Sprechen: suchen oder fragen" aria-label="Sprechen">🎙</button>' : ''}
    <button type="button" class="omni-b" data-o="cam" title="Foto aufnehmen – z. B. Rechnung, Beleg, Kassenzettel" aria-label="Kamera">📷</button>
    <button type="button" class="omni-b" data-o="img" title="Bild hochladen" aria-label="Bild hochladen">🖼</button>
    <button type="button" class="omni-b" data-o="file" title="Dateien hochladen: Excel-Mappe, SumUp, Bank-CSV, PDF, Outlook-Mail" aria-label="Dateien hochladen">⬆</button>
    <button type="button" class="btn primary sm" data-o="go">${DB.aiOn ? 'Los' : 'Suchen'}</button></div>
    <div class="omni-hint small">Tippen = suchen · ${DB.aiOn ? 'Enter = KI fragen · ' : ''}Rechnungen, Outlook-Mails, Fotos, Excel- und Bankdateien einfach hierher ziehen oder einfügen</div>
    <div class="omni-res" id="ores" role="region" aria-live="polite"></div>
    <input type="file" id="camIn" accept="image/*" capture="environment" hidden><input type="file" id="imgIn" accept="image/*,.pdf" multiple hidden></section>`;
}
const SRec = window.SpeechRecognition || window.webkitSpeechRecognition;

function omniSearch(q) {
  q = q.toLowerCase().trim(); if (q.length < 2) return [];
  const ws = q.split(/\s+/), hit = s => ws.every(w => s.includes(w)), out = [];
  S.rechnungen.forEach(r => { if (hit(textOf(r))) out.push({ g: r.richtung === 'ausgang' ? 'Kundenrechnungen' : 'Lieferantenrechnungen', t: (r.nummer ? r.nummer + ' · ' : '') + (r.partner || ''), m: fmtD(r.datum) + ' · ' + fmtE(r.brutto) + ' · ' + rStatus(r).label, act: 'rechnung', id: r.id, d: r.datum || '' }); });
  S.bank.forEach(b => { if (hit([b.gegenpartei, b.zweck, b.kostenart, b.iban, b.betrag, fmtE(b.betrag), fmtD(b.datum)].join(' ').toLowerCase())) out.push({ g: 'Bank', t: (b.gegenpartei || '–') + ' · ' + fmtE(b.betrag), m: fmtD(b.datum) + ' · ' + (b.zweck || '').slice(0, 70), act: 'bank', id: b.id, d: b.datum }); });
  S.sumup.forEach(s => { if (hit([s.beschreibung, s.transaktion, s.betrag, fmtE(s.betrag), fmtD(s.datum)].join(' ').toLowerCase())) out.push({ g: 'SumUp / EC', t: fmtE(s.betrag) + (s.beschreibung ? ' · ' + s.beschreibung : ''), m: fmtD(s.datum) + ' · ' + sStatus(s).label, act: 'sumup', id: s.id, d: s.datum }); });
  S.kasse.forEach(k => { if (hit([k.text, k.belegnr, k.kostenart, k.betrag, fmtE(k.betrag), fmtD(k.datum)].join(' ').toLowerCase())) out.push({ g: 'Kassenbuch', t: fmtE(k.betrag) + ' · ' + (k.text || ''), m: fmtD(k.datum) + (k.belegnr ? ' · Beleg ' + k.belegnr : ''), act: 'kasseD', id: k.id, d: k.datum }); });
  S.todos.forEach(t => { if (hit([t.titel, t.details, t.thema, t.wer, t.extern, ...(t.updates || []).map(u => u.text)].join(' ').toLowerCase())) out.push({ g: 'To-Dos', t: (t.erledigt ? '✓ ' : '') + t.titel, m: [t.wer, t.faellig ? 'fällig ' + fmtD(t.faellig) : ''].filter(Boolean).join(' · '), act: 'todo', id: t.id, d: t.faellig || (t.created_at || '').slice(0, 10) }); });
  S.hebebuehne.forEach(h => { if (hit([h.mitarbeiter, h.abwesend, ...(h.auftraege || []).flatMap(j => [j.name, j.kdnr, j.auftrag])].join(' ').toLowerCase())) out.push({ g: 'Hebebühne', t: h.mitarbeiter + ' · ' + (h.stunden || 0) + ' h', m: fmtD(h.datum) + ' · ' + (h.auftraege || []).map(j => [j.name, j.auftrag].filter(Boolean).join(' ')).join(', '), act: 'hebeE', id: h.id, d: h.datum }); });
  return out.sort((a, b) => b.d.localeCompare(a.d));
}
function omniResHtml(q) {
  const l = omniSearch(q); if (String(q).trim().length < 2) return '';
  if (!l.length) return `<div class="o-none">Nichts gefunden.${DB.aiOn ? ' Enter drücken, um die KI zu fragen.' : ''}</div>`;
  const g = {}; l.forEach(x => (g[x.g] = g[x.g] || []).push(x));
  return Object.entries(g).map(([k, a]) => `<div class="o-g"><div class="o-h">${esc(k)} <span>${a.length}</span></div>${a.slice(0, 6).map(x => `<button class="o-r" data-act="${x.act}" data-id="${x.id}"><b>${esc(x.t)}</b><span>${esc(x.m)}</span></button>`).join('')}${a.length > 6 ? `<div class="o-more">+ ${a.length - 6} weitere</div>` : ''}</div>`).join('');
}
let oT;
function omniWire() {
  const box = $('#omni'), inp = $('#oq'), res = $('#ores');
  inp.addEventListener('input', () => { clearTimeout(oT); oT = setTimeout(() => res.innerHTML = omniResHtml(inp.value), 120); });
  inp.addEventListener('focus', () => { if (!res.innerHTML) res.innerHTML = omniResHtml(inp.value); });
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); omniRun(inp.value); } if (e.key === 'Escape') { inp.value = ''; res.innerHTML = ''; } });
  document.addEventListener('click', e => { if (!e.target.closest('#omni')) res.innerHTML = ''; else if (e.target.closest('.o-r')) setTimeout(() => res.innerHTML = '', 0); });
  box.addEventListener('click', e => {
    const o = e.target.closest('[data-o]')?.dataset.o; if (!o) return;
    if (o === 'go') omniRun(inp.value); else if (o === 'file') $('#anyIn').click(); else if (o === 'mic') omniMic(e.target.closest('[data-o]'));
    else if (o === 'cam') $('#camIn', box).click(); else if (o === 'img') $('#imgIn', box).click();
  });
  ['#camIn', '#imgIn'].forEach(s => $(s, box).onchange = e => { if (e.target.files.length) korbAdd(e.target.files); e.target.value = ''; });
  // Dateien in die Leiste ziehen oder einfügen
  box.addEventListener('dragover', e => { e.preventDefault(); box.classList.add('over'); });
  box.addEventListener('dragleave', e => { if (!box.contains(e.relatedTarget)) box.classList.remove('over'); });
  box.addEventListener('drop', e => { e.preventDefault(); e.stopPropagation(); box.classList.remove('over'); if (e.dataTransfer.files.length) korbAdd(e.dataTransfer.files); });
  // Einfügen: Dateien/Screenshots → Belege; langer Text (z. B. Mail) → KI fragen
  inp.addEventListener('paste', e => { const fl = [...(e.clipboardData.files || [])], t = e.clipboardData.getData('text/plain') || '';
    if (fl.length) { e.preventDefault(); korbAdd(fl); } else if (DB.aiOn && (/\n/.test(t.trim()) || t.length > 200)) { e.preventDefault(); aiChat('Hier ist ein Text (z. B. E-Mail). Was ist zu tun – gibt es eine Rechnung, Zahlung oder ein To-Do?\n\n' + t.slice(0, 4000)); } });
}
function omniRun(q) {
  q = String(q || '').trim().replace(/[.!]+$/, ''); if (q.length < 2) return;
  const res = omniSearch(q), words = q.split(/\s+/).length;
  if (DB.aiOn && (words >= 3 || /\?$/.test(q) || !res.length)) { $('#ores').innerHTML = ''; return aiChat(q); }
  if (res.length) { A[res[0].act]({ id: res[0].id }); $('#ores').innerHTML = ''; return; }
  toast('Nichts gefunden.');
}
function omniMic(btn) {
  if (!SRec) return; const r = new SRec(); r.lang = 'de-DE'; r.interimResults = true; btn.classList.add('rec');
  r.onresult = e => { const t = [...e.results].map(x => x[0].transcript).join(''); $('#oq').value = t; if (e.results[e.results.length - 1].isFinal) { btn.classList.remove('rec'); omniRun(t); } };
  r.onerror = r.onend = () => btn.classList.remove('rec'); r.start();
}

/* ---------- KI-Assistent (Chat-Fenster) ---------- */
const AIC = { open: false, busy: false, msgs: [] };
function aicEl() {
  let d = $('#aic'); if (d) return d;
  d = document.createElement('section'); d.id = 'aic'; d.className = 'aic'; d.hidden = true; d.setAttribute('aria-label', 'KI-Assistent');
  d.innerHTML = `<header><b>✨ Assistent</b><span class="sp"></span><button class="icon-btn" data-c="new" title="Neues Gespräch">↺</button><button class="icon-btn" data-c="x" title="Schließen">✕</button></header>
    <div class="aic-msgs" id="aicM"></div>
    <form id="aicF"><textarea id="aicT" rows="1" placeholder="Frag mich etwas – z. B. „Diagramm: Umsatz je Monat dieses Jahr“"></textarea><button class="btn primary sm">Los</button></form>`;
  document.body.appendChild(d);
  d.addEventListener('click', e => {
    const c = e.target.closest('[data-c]')?.dataset.c;
    if (c === 'x') aicShow(false); else if (c === 'new') { AIC.msgs = []; aicPaint(); }
    else if (c === 'q') aiChat(e.target.closest('[data-c]').dataset.q);
    else if (c === 'open') aicOpen(AIC.msgs[+e.target.closest('[data-c]').dataset.i].open);
    else if (c === 'todo') { const b = e.target.closest('[data-c]'), a = AIC.msgs[+b.dataset.i].todos[+b.dataset.j]; todoForm(null, a); }
  });
  $('#aicF', d).addEventListener('submit', e => { e.preventDefault(); const t = $('#aicT'); const v = t.value.trim(); if (v) { t.value = ''; aiChat(v); } });
  $('#aicT', d).addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#aicF').requestSubmit(); } });
  return d;
}
function aicShow(on) { AIC.open = on; aicEl().hidden = !on; $('#aicFab') && ($('#aicFab').hidden = on || !DB.aiOn); if (on) { aicPaint(); setTimeout(() => innerWidth > 700 && $('#aicT').focus(), 50); } }
const aicMd = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').split('\n').map(l => /^\s*[-•*]\s+/.test(l) ? '<li>' + l.replace(/^\s*[-•*]\s+/, '') + '</li>' : l).join('\n').replace(/(<li>[\s\S]*?<\/li>)(?!\n<li>)/g, '<ul>$1</ul>').replace(/<\/li>\n<li>/g, '</li><li>').replace(/\n/g, '<br>');
function aicTable(t) { if (!t || !Array.isArray(t.cols) || !Array.isArray(t.rows) || !t.rows.length) return ''; return `<div class="tw"><table class="tb"><thead><tr>${t.cols.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${t.rows.slice(0, 80).map(r => `<tr>${(r || []).map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`; }
function aicChart(c) {
  if (!c || !Array.isArray(c.labels) || !Array.isArray(c.series) || !c.series.length) return '';
  const L = c.labels.slice(0, 24).map(String), SR = c.series.slice(0, 3).map((s, k) => ({ name: String(s.name || ''), cls: 'c' + (k + 1), data: L.map((_, i) => +((s.data || [])[i]) || 0) }));
  const head = c.title ? `<div class="aic-ct">${esc(c.title)}</div>` : '';
  if (c.type === 'pie') return head + hbars(L.map((l, i) => [l, SR[0].data[i]]).sort((a, b) => b[1] - a[1]), sum(SR[0].data));
  return head + barChart(L, SR, { h: 200 });
}
const OPEN_LABEL = { start: 'Übersicht', todos: 'To-Dos', ausgang: 'Rechnungsausgang', eingang: 'Rechnungseingang', bank: 'Bank', sumup: 'SumUp', kasse: 'Kassenbuch', hebe: 'Hebebühne', guv: 'Auswertungen (GuV, BWA, Umsatzsteuer)', abgleich: 'Abgleich & Probleme' };
function aicOpenLabel(o) { if (!o) return ''; if (o.id) { const r = S.rechnungen.find(x => x.id === o.id); if (r) return 'Rechnung ' + (r.nummer || r.partner) + ' öffnen'; if (S.bank.some(x => x.id === o.id)) return 'Bankumsatz öffnen'; if (S.sumup.some(x => x.id === o.id)) return 'EC-Zahlung öffnen'; if (S.kasse.some(x => x.id === o.id)) return 'Kassenbuch-Eintrag öffnen'; if (S.todos.some(x => x.id === o.id)) return 'To-Do öffnen'; } return OPEN_LABEL[o.view] ? OPEN_LABEL[o.view] + ' öffnen' : ''; }
function aicOpen(o) {
  if (!o) return;
  if (o.id) { if (S.rechnungen.some(x => x.id === o.id)) return rechnungDetail(o.id); if (S.bank.some(x => x.id === o.id)) return bankDetail(o.id); if (S.sumup.some(x => x.id === o.id)) return sumupDetail(o.id); if (S.kasse.some(x => x.id === o.id)) return kasseDetail(o.id); const t = S.todos.find(x => x.id === o.id); if (t) return todoForm(t); }
  if (OPEN_LABEL[o.view]) { UI.view = o.view; if (o.filter && UI.filt[o.view] !== undefined) UI.filt[o.view] = o.filter; if (o.suche) UI.q[o.view] = o.suche; render(); }
}
function aicPaint() {
  const box = $('#aicM'); if (!box) return;
  box.innerHTML = (AIC.msgs.length ? '' : `<div class="aic-empty"><b>Was möchtest du wissen?</b><p class="small muted">Ich kenne alle Rechnungen, Bankumsätze und SumUp-Zahlungen. Zum Beispiel:</p>
    ${['Welche Kundenrechnungen sind seit über 30 Tagen offen?', 'Wie hoch waren die Ausgaben für Ersatzteile dieses Jahr?', 'Diagramm: Umsatz je Monat', 'Hat jemand doppelt bezahlt?', 'Was hat Kunde Müller insgesamt bezahlt?'].map(x => `<button class="chip" data-c="q" data-q="${esc(x)}">${esc(x)}</button>`).join('')}</div>`)
    + AIC.msgs.map((m, i) => m.role === 'u' ? `<div class="m u">${esc(m.text)}</div>` : `<div class="m a">${m.err ? `<span class="muted">${esc(m.text)}</span>` : aicMd(m.text)}${aicTable(m.table)}${aicChart(m.chart)}${(m.todos || []).map((a, j) => `<div class="aic-act"><span>☑ <b>${esc(a.titel)}</b>${a.wer ? ' · ' + esc(a.wer) : ''}${a.faellig ? ' · fällig ' + fmtD(a.faellig) : ''}</span><button class="btn sm primary" data-c="todo" data-i="${i}" data-j="${j}">Prüfen & anlegen</button></div>`).join('')}${m.open && aicOpenLabel(m.open) ? `<button class="lnk" data-c="open" data-i="${i}">↗ ${esc(aicOpenLabel(m.open))}</button>` : ''}</div>`).join('')
    + (AIC.busy ? '<div class="m a"><span class="dots"><i></i><i></i><i></i></span></div>' : '');
  box.scrollTop = box.scrollHeight;
}

// Datenauszug für die KI: Kennzahlen + offene/auffällige Posten + zur Frage passende Zeilen + Neueste
function aiSnapshot(q) {
  buildIdx();
  const R = S.rechnungen.map(r => ({ r, st: rStatus(r) }));
  const yrs = {}; R.forEach(({ r }) => { const y = (r.datum || '????').slice(0, 4); const o = yrs[y] = yrs[y] || { ein: 0, aus: 0, n: 0, ka: {} }; if (r.richtung === 'ausgang') { o.ein += +r.brutto || 0; o.n++; } else { o.aus += +r.brutto || 0; const k = r.kostenart || 'ohne'; o.ka[k] = (o.ka[k] || 0) + (+r.brutto || 0); } });
  S.bank.filter(personalErstattung).forEach(b => { const y = b.datum.slice(0, 4); const o = yrs[y] = yrs[y] || { ein: 0, aus: 0, n: 0, ka: {} }; o.aus -= b.betrag; const k = 'Personalkosten (Bank ohne Beleg)'; o.ka[k] = (o.ka[k] || 0) - b.betrag; });
  S.bank.filter(b => b.betrag < 0 && !['privat', 'intern', 'ignoriert', 'vorjahr'].includes(b.art) && !(IDX.zByB.get(b.id) || []).length && !bankNeutral(b)).forEach(b => { const y = b.datum.slice(0, 4); const o = yrs[y] = yrs[y] || { ein: 0, aus: 0, n: 0, ka: {} }; o.aus -= b.betrag; const k = (b.kostenart || 'ohne') + ' (Bank ohne Beleg)'; o.ka[k] = (o.ka[k] || 0) - b.betrag; });
  const mon = {}; R.forEach(({ r }) => { const k = monthKey(r.datum); if (!k) return; const o = mon[k] = mon[k] || [0, 0]; o[r.richtung === 'ausgang' ? 0 : 1] += +r.brutto || 0; });
  const rl = ({ r, st }) => [r.id, r.richtung === 'ausgang' ? 'A' : 'E', r.nummer || '', r.datum || '', faelligAm(r) || '', r.partner || '', r.kennzeichen || '', r.kostenart || '', r2(r.brutto), r2(st.bezahlt), st.label, ZA[r.zahlart] || '', (r.beschreibung || '').slice(0, 60)].join('|');
  const bl = b => [b.id, b.datum, r2(b.betrag), b.gegenpartei || '', (b.zweck || '').slice(0, 90), b.kostenart || '', bStatus(b).label].join('|');
  const sl = s => [s.id, s.datum, r2(s.betrag), s.gebuehr ?? '', s.beschreibung || '', sStatus(s).label].join('|');
  const ws = norm(q).split(' ').filter(w => w.length >= 3 && !['welche', 'wie', 'was', 'zeig', 'alle', 'hat', 'haben', 'sind', 'ist', 'der', 'die', 'das', 'und', 'mir', 'von', 'fuer', 'mit', 'dieses', 'jahr', 'monat', 'rechnung', 'rechnungen', 'kunde', 'kunden', 'offen', 'bezahlt'].includes(w));
  const m = s => ws.length && ws.some(w => norm(s).includes(w));
  const auff = R.filter(x => !['bezahlt', 'erledigt', 'extern', 'storno'].includes(x.st.key));
  const passR = R.filter(x => m(textOf(x.r))).slice(0, 250), passB = S.bank.filter(b => m([b.gegenpartei, b.zweck, b.kostenart, b.betrag].join(' '))).slice(0, 150), passS = S.sumup.filter(s => m([s.beschreibung, s.betrag].join(' '))).slice(0, 80);
  const newest = [...R].sort((a, b) => (b.r.datum || '').localeCompare(a.r.datum || '')).slice(0, 60);
  const bankNew = [...S.bank].sort((a, b) => b.datum.localeCompare(a.datum)).slice(0, 60);
  const bankOpen = S.bank.filter(b => b.betrag > 0 && bStatus(b).key === 'offen').slice(0, 80);
  const uniq = (a, f) => { const s = new Set(); return a.filter(x => { const k = f(x); if (s.has(k)) return false; s.add(k); return true; }); };
  return `JAHRES-KENNZAHLEN (brutto): ${Object.entries(yrs).sort().map(([y, o]) => `${y}: Umsatz ${r2(o.ein)} € (${o.n} Rechnungen), Ausgaben ${r2(o.aus)} €, Kostenarten ${JSON.stringify(Object.fromEntries(Object.entries(o.ka).map(([k, v]) => [k, r2(v)])))}`).join(' || ')}
MONATE (Umsatz|Eingangsrechnungen): ${Object.keys(mon).sort().slice(-24).map(k => k + ':' + r2(mon[k][0]) + '|' + r2(mon[k][1])).join(', ')}
ANZAHL: ${S.rechnungen.length} Rechnungen, ${S.bank.length} Bankumsätze, ${S.sumup.length} SumUp-Zahlungen. Zahlungsziel ${ZIEL_TAGE()} Tage.

RECHNUNGEN Format: id|A=Ausgang(Kunde)/E=Eingang(Lieferant)|Nr|Datum|Fällig|Partner|Kennzeichen|Kostenart|Brutto|Bezahlt|Status|Zahlart|Beschreibung
Nicht bezahlte/auffällige (${auff.length}):
${auff.slice(0, 300).map(rl).join('\n')}
${passR.length ? 'Passend zur Frage:\n' + uniq(passR, x => x.r.id).filter(x => !auff.includes(x)).map(rl).join('\n') : ''}
Neueste:
${newest.filter(x => !auff.includes(x) && !passR.includes(x)).map(rl).join('\n')}

BANK Format: id|Datum|Betrag(+Eingang/−Ausgang)|Name|Verwendungszweck|Kostenart|Status
Zahlungseingänge ohne Rechnung: ${bankOpen.map(bl).join('\n') || 'keine'}
${passB.length ? 'Passend zur Frage:\n' + passB.map(bl).join('\n') : ''}
Neueste:
${bankNew.map(bl).join('\n')}

SUMUP (EC) Format: id|Datum|Betrag|Gebühr|Beschreibung|Status
${(passS.length ? passS : [...S.sumup].sort((a, b) => b.datum.localeCompare(a.datum)).slice(0, 40)).map(sl).join('\n') || 'keine'}

${aiSnapshotExtra(q, m)}`;
}
// To-Dos, Kassenbuch, Hebebühne, GuV
function aiSnapshotExtra(q, m) {
  const KB = kasseBestand(), kl = k => [k.id, k.datum, r2(k.betrag), k.belegnr || '', k.text || '', k.kostenart || '', kStatus(k).label].join('|');
  const tl = t => [t.id, t.titel, t.wer || '', t.faellig || '', t.wv || '', t.prio, t.extern || '', t.status || '', (t.updates || []).slice(-2).map(u => u.d + ': ' + u.text).join(' / ')].join('|');
  const passK = S.kasse.filter(k => m([k.text, k.belegnr, k.betrag].join(' '))).slice(0, 80);
  const jahr = todayISO().slice(0, 4), g = guvRechnen(jahr, false).lines.filter(l => ['grp', 'sum', 'tot'].includes(l.typ));
  const W = hebeWochen(jahr), satz = STUNDENSATZ();
  const passH = S.hebebuehne.filter(h => m([h.mitarbeiter, ...(h.auftraege || []).flatMap(j => [j.name, j.kdnr, j.auftrag])].join(' '))).slice(0, 120);
  return `TO-DOS offen Format: id|Titel|Wer|Fällig|Wiedervorlage|Prio|Extern|Status|letzte Updates
${S.todos.filter(t => !t.erledigt).slice(0, 150).map(tl).join('\n') || 'keine'}
Mitarbeiter: ${mitarbeiter().join(', ')}${S.meName ? ' · ich bin ' + S.meName : ''}

KASSENBUCH: Bestand ${KB.bestand} € (Anfangsbestand ${kasseAnfang()} €). Format: id|Datum|Betrag(+Einnahme/−Ausgabe)|Beleg|Text|Kostenart|Status
${(passK.length ? passK : [...S.kasse].sort((a, b) => b.datum.localeCompare(a.datum)).slice(0, 40)).map(kl).join('\n') || 'keine'}

GUV ${jahr} netto je Monat (Jan..Dez | Gesamt):
${g.map(l => l.label + ': ' + l.w.map(v => Math.round(v)).join(' ') + ' | ' + Math.round(l.w.reduce((a, b) => a + b, 0))).join('\n')}

HEBEBÜHNE ${jahr} je KW (Stunden | auf Rechnung = Werkstatt-Lohn netto | tatsächlich = Stunden × ${satz} €):
${Object.keys(W).sort().slice(-20).map(k => 'KW' + +k.slice(5) + ': ' + r2(W[k].std) + ' h | ' + r2(W[k].lohn) + ' | ' + r2(W[k].std * satz)).join('\n')}
${passH.length ? 'Einträge passend zur Frage (Datum|Mitarbeiter|Stunden|Aufträge):\n' + passH.map(h => [h.datum, h.mitarbeiter, h.stunden, (h.auftraege || []).map(j => [j.name, j.kdnr, j.auftrag].filter(Boolean).join(' ')).join('; ')].join('|')).join('\n') : ''}`;
}

async function aiChat(q) {
  q = String(q || '').trim(); if (!q) return; if (!DB.aiOn) return toast(AI_ERR.offline);
  aicShow(true); AIC.msgs.push({ role: 'u', text: q }); AIC.busy = true; aicPaint();
  const hist = AIC.msgs.slice(-9, -1).map(m => (m.role === 'u' ? 'Nutzer: ' : 'Assistent: ') + String(m.text).slice(0, 600)).join('\n');
  try {
    const r = await DB.aiJson(`Du bist der Finanz-Assistent der Kfz-Werkstatt „Mastercar Bornheim“ (VE Sportmanagement UG (haftungsbeschränkt)). Heute ist ${fmtD(todayISO())} (${todayISO()}).
Antworte genau, vollständig und knapp auf Deutsch. Nutze NUR die Daten unten – nichts erfinden; fehlt etwas, sag es. Summen und Anzahlen exakt aus den Daten rechnen. Beträge als „1.234,56 €“, Datum als TT.MM.JJJJ.
Du bist kein Steuerberater: bei steuerlichen Fragen kurz darauf hinweisen.
${hist ? 'Bisheriges Gespräch:\n' + hist + '\n' : ''}Neue Frage: """${q.slice(0, 1500)}"""

DATEN:
${aiSnapshot(q)}

Antworte nur mit JSON:
{"say":"Antwort; Aufzählungen mit '- ', Wichtiges mit **fett**","table":null,"chart":null,"open":null,"todos":[]}
- todos: nur wenn ein To-Do angelegt werden soll („leg mir ein To-Do an …“, „erinnere mich …“, oder klar sinnvoll wie „Kunde X wegen überfälliger Rechnung anrufen“, wenn danach gefragt wird): [{"titel":"…","wer":"Name aus Mitarbeiter oder leer","faellig":"JJJJ-MM-TT oder leer","wv":"","prio":"dringend|hoch|normal|niedrig","details":"…","extern":""}]. Relative Angaben (morgen, Freitag) ab heute ausrechnen. Der Nutzer prüft und speichert selbst – nie behaupten, es sei schon angelegt.
- table: {"cols":["…"],"rows":[["…"]]} – bei Listen mit mehr als 5 Einträgen oder mehreren Spalten.
- chart: nur wenn ein Diagramm gewünscht ist oder Zahlen sich klar besser zeigen lassen: {"type":"bar|pie","title":"…","labels":["…"],"series":[{"name":"…","data":[Zahlen]}]}
- open: passendes Fenster, sonst null: {"id":"id einer Rechnung/Bankbuchung/SumUp-Zahlung/Kassenbuch-Eintrag/To-Do"} oder {"view":"start|todos|ausgang|eingang|bank|sumup|kasse|hebe|guv|abgleich","filter":"","suche":""}. Filter für ausgang/eingang: alle|offen|ueberfaellig|probleme|bezahlt|pruefen; für bank: offen|alle|ein|aus|sumup|kosten.`, { tier: 'default' });
    AIC.busy = false;
    const m = { role: 'a', text: String(r && r.say || '').trim() || 'Dazu habe ich in den Daten nichts gefunden.', table: r && r.table, chart: r && r.chart, open: r && r.open && typeof r.open === 'object' && (r.open.id || r.open.view) ? r.open : null,
      todos: (r && Array.isArray(r.todos) ? r.todos : []).filter(a => a && a.titel).slice(0, 8).map(a => ({ titel: String(a.titel).slice(0, 300), wer: a.wer || '', faellig: /^\d{4}-\d{2}-\d{2}$/.test(a.faellig || '') ? a.faellig : '', wv: /^\d{4}-\d{2}-\d{2}$/.test(a.wv || '') ? a.wv : '', prio: PRIO[a.prio] ? a.prio : 'normal', details: a.details || '', extern: a.extern || '' })) };
    AIC.msgs.push(m); aicPaint();
  } catch (e) { AIC.busy = false; AIC.msgs.push({ role: 'a', err: 1, text: aiErr(e) }); aicPaint(); }
}
