/* Mastercar Finanzen · Rubrik „Auswertungen“
   GuV · BWA (kurzfristige Erfolgsrechnung) · Umsatzsteuer-Voranmeldung · Offene Posten · Liquidität · Kunden & Lieferanten
   Alles wird live aus Rechnungsausgang, Rechnungseingang, Bank, Kasse und SumUp berechnet – vorläufige Zahlen,
   sie ersetzen nicht die Auswertungen vom Steuerberater. */
const AUSW = [
  ['guv', 'GuV', 'Gewinn- und Verlustrechnung je Monat'],
  ['bwa', 'BWA', 'Betriebswirtschaftliche Auswertung: Monat, aufgelaufen, Vorjahr, Kennzahlen'],
  ['ustva', 'Umsatzsteuer-VA', 'Umsatzsteuer-Voranmeldung je Monat oder Quartal (Kennzahlen wie in ELSTER)'],
  ['op', 'Offene Posten', 'Forderungen und Verbindlichkeiten nach Alter'],
  ['liq', 'Liquidität', 'Geldbewegungen je Monat und fällige Zahlungen'],
  ['partner', 'Kunden & Lieferanten', 'Umsatz je Kunde, Kosten je Lieferant'],
  ['darl', 'Darlehen', 'Aufgenommene Darlehen, Tilgungen und was noch offen ist'],
];

/* ---------- Darlehen ----------
   Darlehen sind weder Erlös noch Kosten (Bilanz: Verbindlichkeiten). Hier: Stand je Darlehensgeber.
   Anfangsstände aus dem Vorjahr stehen in den Einstellungen („darlehen_anfang“), die Bewegungen kommen aus der Bank
   (Art „Darlehen / Tilgung“ oder automatisch erkannt). */
const darlAnfang = () => Array.isArray(S.einstellungen.darlehen_anfang) ? S.einstellungen.darlehen_anfang : [];
function darlGruppen() {
  const G = [], tk = s => nameTokens(s).filter(w => w.length >= 5);
  const gruppe = name => { const t = tk(name); let g = G.find(x => t.some(w => x.tok.has(w))); if (!g) { g = { name, tok: new Set(), anfang: [], bew: [] }; G.push(g); } t.forEach(w => g.tok.add(w)); return g; };
  darlAnfang().forEach((a, i) => gruppe(a.geber).anfang.push({ ...a, i }));
  S.bank.filter(b => b.art === 'darlehen' || (!b.art && !(IDX.zByB.get(b.id) || []).length && IDX.bArt && IDX.bArt.get(b.id) === 'darlehen'))
    .sort((a, b) => a.datum.localeCompare(b.datum)).forEach(b => gruppe(b.gegenpartei || 'Unbekannt').bew.push(b));
  G.forEach(g => { g.auf = r2(sum(g.anfang, a => +a.betrag || 0) + sum(g.bew.filter(b => b.betrag > 0), b => b.betrag)); g.tilg = r2(-sum(g.bew.filter(b => b.betrag < 0), b => b.betrag)); g.offen = r2(g.auf - g.tilg); });
  return G.sort((a, b) => b.offen - a.offen);
}
function viewDarl() {
  const G = darlGruppen(), offen = sum(G, g => g.offen);
  return { ohneJahr: true, knoepfe: `<button class="btn primary" data-act="darlNeu">＋ Darlehen aus dem Vorjahr</button>`, body: `
    <section class="kpi">
      <div class="k hi"><div class="kv">${fmtE(offen)}</div><div class="kl">Darlehen noch offen</div></div>
      <div class="k"><div class="kv">${fmtE(sum(G, g => g.auf))}</div><div class="kl">aufgenommen (inkl. Vorjahr)</div></div>
      <div class="k"><div class="kv">${fmtE(sum(G, g => g.tilg))}</div><div class="kl">zurückgezahlt</div></div>
    </section>
    <p class="small muted">Darlehen sind weder Umsatz noch Kosten – sie stehen nicht in GuV und BWA, sondern im Jahresabschluss als Verbindlichkeit. Kosten sind nur Zinsen. Bankbuchungen kommen hierher, wenn sie die Art „Darlehen / Tilgung“ haben oder als Darlehen erkannt wurden.</p>
    <div class="tw"><table class="tb"><thead><tr><th>Darlehensgeber</th><th class="num">Aufgenommen</th><th class="num">Zurückgezahlt</th><th class="num">Offen</th><th>Bewegungen</th></tr></thead><tbody>
    ${G.map(g => `<tr><td><b>${esc(g.name)}</b></td><td class="num">${fmtE(g.auf)}</td><td class="num">${fmtE(g.tilg)}</td><td class="num ${g.offen > 0.005 ? 'neg' : ''}"><b>${fmtE(g.offen)}</b></td>
      <td class="small">${g.anfang.map(a => `${fmtD(a.datum)} ${fmtE(a.betrag)} <span class="muted">(Vorjahr${a.notiz ? ', ' + esc(a.notiz) : ''})</span> <button class="lnk" data-act="darlWeg" data-i="${a.i}" title="Eintrag entfernen">✕</button>`).join('<br>')}${g.anfang.length && g.bew.length ? '<br>' : ''}
        ${g.bew.map(b => `<a href="#" data-act="bank" data-id="${b.id}">${fmtD(b.datum)} ${fmtE(b.betrag)}</a> <span class="muted">${esc(zweckKurz(b.zweck).slice(0, 40))}</span>`).join('<br>')}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">Keine Darlehen.</td></tr>'}
    </tbody></table></div>` };
}
function darlNeu() {
  openSheet({ title: 'Darlehen aus dem Vorjahr', okLabel: 'Speichern', html: `<p class="small muted">Für Darlehen, die vor 2026 aufs Konto kamen – die Rückzahlungen in 2026 rechnet die App selbst dagegen.</p>
    <label class="fld"><span>Darlehensgeber</span><input class="inp" id="dlG" placeholder="z. B. Therese von Elstermann"></label>
    <label class="fld"><span>Datum der Auszahlung</span><input class="inp" type="date" id="dlD"></label>
    <label class="fld"><span>Betrag (€)</span><input class="inp" id="dlB" inputmode="decimal" placeholder="50.000,00"></label>
    <label class="fld"><span>Notiz</span><input class="inp" id="dlN" placeholder="z. B. Darlehen vom 08.12.2025"></label>`,
    onOk: async d => { const g = $('#dlG', d).value.trim(), dt = $('#dlD', d).value, b = parseNum($('#dlB', d).value);
      if (!g || !dt || !(b > 0)) { toast('Bitte Darlehensgeber, Datum und Betrag angeben.'); return false; }
      await DB.setSetting('darlehen_anfang', [...darlAnfang(), { geber: g, datum: dt, betrag: r2(b), notiz: $('#dlN', d).value.trim() || null }]); render(); toast('Darlehen gespeichert.'); } });
}
let AUSW_Z = {};   // Klick-Ziele der Zellen (Schlüssel → Belege), wird bei jedem Zeichnen neu gefüllt
const aN = v => Math.abs(v) < 0.005 ? '<span class="muted">–</span>' : Math.round(v).toLocaleString('de-DE');
const aN2 = v => Math.abs(v) < 0.005 ? '<span class="muted">–</span>' : (+v).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const aP = (v, g) => !g || Math.abs(g) < 0.005 ? '' : (v / g * 100).toLocaleString('de-DE', { maximumFractionDigits: 1, minimumFractionDigits: 1 }) + ' %';
// Zelle mit Zahl; mit Belegen dahinter anklickbar
function aZelle(v, items, title, fmt = aN, cls = '') {
  let k = '';
  if (items && items.length && Math.abs(v) > 0.005) { k = 'z' + Object.keys(AUSW_Z).length; AUSW_Z[k] = { title, items }; }
  return `<td class="num ${v < -0.005 ? 'neg' : ''} ${cls}" ${k ? `data-act="auswZelle" data-k="${k}"` : ''}>${fmt(v)}</td>`;
}
const aKlick = (items, title) => { const k = 'z' + Object.keys(AUSW_Z).length; AUSW_Z[k] = { title, items }; return `data-act="auswZelle" data-k="${k}"`; };

function viewAusw() {
  const jahre = guvJahre();
  UI.guvJahr = UI.guvJahr && jahre.includes(UI.guvJahr) ? UI.guvJahr : (jahre.find(j => S.rechnungen.some(r => (r.datum || '').startsWith(j))) || jahre[0]);
  const t = AUSW.some(a => a[0] === UI.auswTab) ? UI.auswTab : 'guv';
  AUSW_Z = {}; buildIdx();
  const sub = ({ guv: viewGuv, bwa: viewBwa, ustva: viewUstva, op: viewOp, liq: viewLiq, partner: viewPartner, darl: viewDarl }[t])();
  const jahrSel = sub.ohneJahr ? '' : `<select class="inp" data-chg="guvJahr" aria-label="Jahr">${jahre.map(j => `<option ${j === UI.guvJahr ? 'selected' : ''}>${j}</option>`).join('')}</select>`;
  return `
  <div class="toolbar"><h1>Auswertungen</h1><span class="sp"></span>${jahrSel}${sub.knoepfe || ''}${sub.csv === false ? '' : `<button class="btn" data-act="auswCsv" title="Tabelle als CSV für Excel">CSV</button>`}</div>
  <div class="chips ausw-tabs" role="tablist">${AUSW.map(([k, l, h]) => `<button class="chip ${k === t ? 'on' : ''}" role="tab" aria-selected="${k === t}" data-act="auswTab" data-t="${k}" title="${esc(h)}">${l}</button>`).join('')}</div>
  ${sub.body}`;
}

/* ---------- Belege hinter einer Zahl ---------- */
function auswZelle(k) {
  const z = AUSW_Z[k]; if (!z) return;
  belegListe(z.title, z.items);
}
function belegListe(title, items) {
  items = [...items].sort((a, b) => Math.abs(b.v) - Math.abs(a.v));
  const lbl = i => {
    if (i.t === 'r') { const r = S.rechnungen.find(x => x.id === i.id); return r ? [r.datum, r.partner, [r.nummer || r.art || '', i.info].filter(Boolean).join(' · ')] : []; }
    if (i.t === 's') { const s = S.sumup.find(x => x.id === i.id); return s ? [s.datum, 'SumUp', s.beschreibung || s.transaktion || ''] : []; }
    const x = (i.t === 'b' ? S.bank : S.kasse).find(y => y.id === i.id); return x ? [x.datum, i.t === 'b' ? x.gegenpartei : 'Kasse', i.t === 'b' ? x.zweck : x.text] : [];
  };
  const act = { r: 'rechnung', b: 'bank', k: 'kasseD', s: 'sumup' };
  openSheet({ title, wide: true, noOk: true, html: `<div class="sumline">${items.length} Einträge · ${fmtE(sum(items, i => i.v))}</div>
    <div class="tw"><table class="tb click"><tbody>${items.slice(0, 500).map(i => { const [d, p, x] = lbl(i); return `<tr data-act="${act[i.t]}" data-id="${i.id}"><td>${fmtD(d)}</td><td>${esc(p || '')}</td><td class="zweck">${esc(x || '')}</td><td class="num ${i.v < 0 ? 'neg' : ''}">${fmtE(i.v)}</td></tr>`; }).join('')}</tbody></table>${items.length > 500 ? '<p class="small muted">… die ersten 500 von ' + items.length + '</p>' : ''}</div>` });
}
// CSV der ersten Tabelle der aktuellen Auswertung (so wie sie angezeigt wird)
function auswCsv() {
  const tabs = $$('#main table.tb'); if (!tabs.length) return toast('Keine Tabelle zum Exportieren.');
  const zeilen = [];
  tabs.forEach((t, n) => {
    if (n) zeilen.push([]);
    const h = t.closest('section')?.querySelector('h2'); if (h) zeilen.push([h.textContent.trim()]);
    t.querySelectorAll('tr').forEach(tr => zeilen.push([...tr.children].map(c => { const s = c.textContent.replace(/\s+/g, ' ').trim(); return /^-?[\d.]+(,\d+)?( %)?$/.test(s) ? s.replace(/\.(?=\d{3})/g, '').replace(' %', '') : s === '–' ? '' : s; })));
  });
  const tab = (AUSW.find(a => a[0] === (UI.auswTab || 'guv')) || [])[1] || 'Auswertung';
  download(`Mastercar_${tab.replace(/[^\wäöüÄÖÜ]+/g, '_')}_${UI.guvJahr}.csv`, zeilen.map(csvRow).join('\r\n'));
}

/* ---------- BWA: kurzfristige Erfolgsrechnung (Aufbau wie die DATEV-BWA) ---------- */
const BWA_KOSTEN = ['Personalkosten', 'Raumkosten', 'Fahrzeugkosten', 'Werbe-/Reisekosten', 'Kosten Warenabgabe', 'Abschreibungen', 'Reparatur/Instandhaltung', 'sonstige Kosten', OHNE];
const BWA_NEUTRAL = ['Zinsaufwand', 'sonstiger neutraler Aufwand'];
const BWA_ZEILEN = [
  { l: 'Umsatzerlöse', k: ['Umsatzerlöse'] },
  { l: 'Gesamtleistung', k: ['Umsatzerlöse'], s: 1 },
  { l: 'Material- / Wareneinkauf', k: ['Materialaufwand'], kosten: 1 },
  { l: 'Rohertrag', k: ['Umsatzerlöse', 'Materialaufwand'], s: 1 },
  { l: 'sonstige betriebliche Erlöse', k: ['sonstige betriebliche Erträge'] },
  { l: 'Betrieblicher Rohertrag', k: ['Umsatzerlöse', 'Materialaufwand', 'sonstige betriebliche Erträge'], s: 1 },
  ...BWA_KOSTEN.map(k => ({ l: k === OHNE ? 'Kosten ohne Kategorie' : k, k: [k], kosten: 1, ein: 1 })),
  { l: 'Gesamtkosten', k: BWA_KOSTEN, s: 1, kosten: 1 },
  { l: 'Betriebsergebnis', k: ['Umsatzerlöse', 'Materialaufwand', 'sonstige betriebliche Erträge', ...BWA_KOSTEN], s: 2 },
  ...BWA_NEUTRAL.map(k => ({ l: k, k: [k], kosten: 1, ein: 1 })),
  { l: 'Neutrales Ergebnis', k: BWA_NEUTRAL, s: 1 },
  { l: 'Ergebnis vor Steuern', k: ['Umsatzerlöse', 'Materialaufwand', 'sonstige betriebliche Erträge', ...BWA_KOSTEN, ...BWA_NEUTRAL], s: 2 },
];
// Gruppe → 12 Monatswerte (Erträge +, Kosten −) und die Belege dahinter
function guvGruppen(jahr) {
  const { Z } = guvRechnen(jahr, !!UI.guvOhne), G = {};
  for (const [key, z] of Z) { if (key[0] === '§') continue; const g = key.split('|')[0]; G[g] = G[g] || { w: Array(12).fill(0), items: [] }; z.w.forEach((v, i) => G[g].w[i] += v); G[g].items.push(...z.items); }
  return G;
}
function viewBwa() {
  const J = UI.guvJahr, VJ = String(+J - 1), G = guvGruppen(J), GV = guvGruppen(VJ);
  const hatVJ = Object.values(GV).some(g => g.w.some(v => Math.abs(v) > 0.005));
  const heute = todayISO(), cur = heute.slice(0, 4) === J ? +heute.slice(5, 7) : 12;
  const M = Math.min(12, Math.max(1, +UI.bwaMon || cur)); UI.bwaMon = M;
  const mon = [M - 1], kum = Array.from({ length: M }, (_, i) => i);
  const val = (GG, keys, ms) => keys.reduce((s, k) => s + ms.reduce((a, m) => a + ((GG[k] || { w: [] }).w[m] || 0), 0), 0);
  const its = (keys, ms) => keys.flatMap(k => ((G[k] || {}).items || []).filter(i => ms.includes(i.m)));
  const disp = (z, v) => z.kosten ? -v : v;   // Kosten positiv zeigen (wie in der BWA üblich)
  const gl = ms => val(G, ['Umsatzerlöse'], ms), glV = val(GV, ['Umsatzerlöse'], kum);
  const rows = BWA_ZEILEN.filter(z => !z.ein || Math.abs(val(G, z.k, kum)) > 0.005 || Math.abs(val(GV, z.k, kum)) > 0.005).map(z => {
    const vm = disp(z, val(G, z.k, mon)), vk = disp(z, val(G, z.k, kum)), vv = disp(z, val(GV, z.k, kum));
    const abw = hatVJ && Math.abs(vv) > 0.005 ? ((vk - vv) / Math.abs(vv) * 100).toLocaleString('de-DE', { maximumFractionDigits: 1 }) + ' %' : '';
    const t = z.l + ' · ';
    return `<tr class="${z.s === 2 ? 'g-tot' : z.s ? 'g-sum' : z.kosten ? 'g-sub' : 'g-grp'}"><th>${esc(z.l)}</th>
      ${aZelle(vm, its(z.k, mon), t + MONATE[M - 1] + ' ' + J)}<td class="num pct">${aP(vm, gl(mon))}</td>
      ${aZelle(vk, its(z.k, kum), t + 'Jan–' + MONATE[M - 1] + ' ' + J)}<td class="num pct">${aP(vk, gl(kum))}</td>
      <td class="num">${hatVJ ? aN(vv) : '<span class="muted">–</span>'}</td><td class="num pct">${abw}</td>
      <td class="num">${aN(vk / M)}</td></tr>`;
  });
  // Kennzahlen (aufgelaufen)
  const GL = gl(kum), roh = val(G, ['Umsatzerlöse', 'Materialaufwand'], kum), pers = -val(G, ['Personalkosten'], kum), erg = val(G, BWA_ZEILEN[BWA_ZEILEN.length - 1].k, kum);
  const kostFix = -val(G, BWA_KOSTEN, kum) - val(G, BWA_NEUTRAL, kum), rq = GL ? roh / GL : 0, be = rq > 0 ? kostFix / rq : 0;
  const pz = (a, b) => b ? (a / b * 100).toLocaleString('de-DE', { maximumFractionDigits: 1 }) + ' %' : '–';
  return {
    knoepfe: `<select class="inp" data-chg="bwaMon" aria-label="Monat">${MONATE.map((m, i) => `<option value="${i + 1}" ${i + 1 === M ? 'selected' : ''}>bis ${m}</option>`).join('')}</select>
      <label class="chk inline"><input type="checkbox" data-chg="guvOhne" ${UI.guvOhne ? 'checked' : ''}> Zahlungen ohne Beleg mitrechnen</label>`,
    body: `
    <section class="kpi">
      <div class="k hi"><div class="kv">${fmtE(GL)}</div><div class="kl">Gesamtleistung Jan–${MONATE[M - 1]}</div></div>
      <div class="k"><div class="kv">${pz(roh, GL)}</div><div class="kl">Rohertragsquote (Umsatz − Material)</div></div>
      <div class="k"><div class="kv">${pz(pers, GL)}</div><div class="kl">Personalkostenquote</div></div>
      <div class="k"><div class="kv ${erg < 0 ? 'neg' : ''}">${pz(erg, GL)}</div><div class="kl">Umsatzrendite (Ergebnis ÷ Umsatz)</div></div>
      <div class="k"><div class="kv">${be ? fmtE(be / M) : '–'}</div><div class="kl">Break-even: nötiger Umsatz je Monat</div></div>
    </section>
    <p class="small muted">Aufbau wie die BWA vom Steuerberater (kurzfristige Erfolgsrechnung), netto, nach Rechnungsdatum. „% Gesamtl.“ = Anteil am Umsatz. Kosten stehen als positive Zahl da. Break-even = alle Kosten außer Material ÷ Rohertragsquote: so viel Umsatz braucht ihr im Monat, um bei null rauszukommen. Zahl anklicken = Belege dahinter.</p>
    <div class="tw guv"><table class="tb gtab"><thead><tr><th>Position</th><th class="num">${MONATE[M - 1]} ${J}</th><th class="num">% Gesamtl.</th><th class="num">Jan–${MONATE[M - 1]} ${J}</th><th class="num">% Gesamtl.</th><th class="num">Vorjahr Jan–${MONATE[M - 1]}</th><th class="num">Veränd.</th><th class="num">Ø je Monat</th></tr></thead>
    <tbody>${rows.join('')}</tbody></table></div>
    ${hatVJ ? '' : `<p class="small muted">Für ${VJ} sind keine Rechnungen in der App – der Vorjahresvergleich bleibt leer.</p>`}`
  };
}

/* ---------- Umsatzsteuer-Voranmeldung ---------- */
// Ausländische Online-Anbieter: Rechnung ohne MwSt → meist Reverse-Charge (§ 13b UStG), gehört dann in Kz 46/47 und 67
const RC_RX = /shopify|google|meta platforms|facebook|instagram|linkedin|microsoft ireland|adobe|openai|anthropic|amazon web services|\baws\b|dropbox|zoom|canva|mailchimp|slack|notion|atlassian|wix|squarespace|apple distribution|spotify|tiktok|stripe|paypal europe/i;
const ustSatz = r => { const n = +r.netto, m = +r.mwst || 0; if (Math.abs(m) < 0.005) return 0; const q = n ? Math.abs(m / n) : 0.19; return q > 0.12 ? 19 : q > 0.03 ? 7 : 0; };
function zDatumMap() {
  const m = new Map(); S.bank.forEach(b => m.set('b' + b.id, b.datum)); S.kasse.forEach(k => m.set('k' + k.id, k.datum)); S.sumup.forEach(s => m.set('s' + s.id, s.datum));
  return z => z.datum || (z.bank_id && m.get('b' + z.bank_id)) || (z.kasse_id && m.get('k' + z.kasse_id)) || (z.sumup_id && m.get('s' + z.sumup_id)) || '';
}
function ustDaten(jahr, ist) {
  const F = ['bg19', 'st19', 'bg7', 'st7', 'bg0', 'vst', 'rc', 'fa'];
  const M = Array.from({ length: 12 }, () => { const o = { it: {} }; F.forEach(f => { o[f] = 0; o.it[f] = []; }); return o; });
  const inJ = d => d && d.startsWith(jahr), mon = d => +d.slice(5, 7) - 1, zd = zDatumMap();
  const put = (m, f, v, item) => { M[m][f] += v; M[m].it[f].push({ ...item, v: r2(v) }); };
  const umsatz = (m, r, anteil = 1, info) => {
    const n = nettoAus(r) * anteil, st = (+r.mwst || 0) * anteil, s = ustSatz(r);
    if (s === 19) { put(m, 'bg19', n, { t: 'r', id: r.id, info }); put(m, 'st19', st, { t: 'r', id: r.id, info }); }
    else if (s === 7) { put(m, 'bg7', n, { t: 'r', id: r.id, info }); put(m, 'st7', st, { t: 'r', id: r.id, info }); }
    else put(m, 'bg0', n, { t: 'r', id: r.id, info });
  };
  S.rechnungen.forEach(r => {
    if (DOK_ARTEN.includes(r.art) || !r.datum) return;
    if (r.richtung === 'ausgang') {
      // Soll: nach Rechnungsdatum. Gutschriften/Stornorechnungen (−) und die stornierte Originalrechnung (+, erledigt) immer nach Datum,
      // damit sich beide auch bei Ist-Versteuerung genau aufheben
      if (!ist || (+r.brutto || 0) < 0 || r.erledigt) { if (inJ(r.datum)) umsatz(mon(r.datum), r); return; }
      // Ist-Versteuerung: im Monat des Geldeingangs, anteilig bei Teilzahlungen
      const zs = IDX.zByR.get(r.id) || [], b = +r.brutto || 0;
      if (!zs.length) { if ((istBezahltLaut(r.status_excel) || r.bezahlt_extern) && inJ(r.datum)) umsatz(mon(r.datum), r, 1, 'bezahlt laut Liste, Zahlung nicht zugeordnet'); return; }
      zs.forEach(z => { const d = zd(z); if (inJ(d)) umsatz(mon(d), r, b ? Math.min(1, (+z.betrag || 0) / b) : 1, 'bezahlt am ' + fmtD(d)); });
      return;
    }
    if (!inJ(r.datum)) return;
    const m = mon(r.datum);
    if (istFinanzamt(r)) { const v = (+r.brutto || 0) - (+r.lohn || 0); if (Math.abs(v) > 0.005) put(m, 'fa', v, { t: 'r', id: r.id }); return; }
    const v = +r.mwst || 0;
    if (Math.abs(v) > 0.005) put(m, 'vst', v, { t: 'r', id: r.id });
    else if (RC_RX.test(r.partner || '') && Math.abs(+r.brutto || 0) > 0.005 && !(+r.durchlaufend)) put(m, 'rc', nettoAus(r), { t: 'r', id: r.id });
  });
  if (UI.guvOhne) S.bank.forEach(b => { if (inJ(b.datum) && b.betrag < 0 && !b.art && istFinanzamt(b) && !(IDX.zByB.get(b.id) || []).length) put(mon(b.datum), 'fa', -b.betrag, { t: 'b', id: b.id }); });
  return M;
}
function viewUstva() {
  const J = UI.guvJahr, ist = !!UI.ustIst, q = UI.ustPer === 'q';
  const M = ustDaten(J, ist);
  const P = q ? [0, 1, 2, 3].map(i => ({ l: 'Q' + (i + 1), ms: [3 * i, 3 * i + 1, 3 * i + 2] })) : MONATE.map((l, i) => ({ l, ms: [i] }));
  P.push({ l: 'Jahr', ms: [...Array(12).keys()], ges: true });
  const agg = (f, p) => p.ms.reduce((s, m) => s + M[m][f], 0), items = (f, p) => p.ms.flatMap(m => M[m].it[f]);
  const ust = p => agg('st19', p) + agg('st7', p), zl = p => ust(p) - agg('vst', p);
  const heute = todayISO(), curM = heute.slice(0, 4) === J ? +heute.slice(5, 7) : 13;
  const fut = p => !p.ges && p.ms[0] + 1 > curM ? 'fut' : '';
  const hat = f => P.some(p => Math.abs(agg(f, p)) > 0.005);
  const zeile = (label, f, cls = '', kz = '') => `<tr class="${cls}"><th>${label}${kz ? `<small>Kennzahl ${kz}</small>` : ''}</th>${P.map(p => aZelle(agg(f, p), items(f, p), label.replace(/<[^>]+>/g, '') + ' · ' + p.l + ' ' + J, aN2, (p.ges ? 'g-ges ' : '') + fut(p))).join('')}</tr>`;
  const calc = (label, fn, cls = 'g-sum', kz = '') => `<tr class="${cls}"><th>${label}${kz ? `<small>Kennzahl ${kz}</small>` : ''}</th>${P.map(p => { const v = fn(p); return `<td class="num ${v < -0.005 ? 'neg' : ''} ${p.ges ? 'g-ges' : ''} ${fut(p)}">${aN2(v)}</td>`; }).join('')}</tr>`;
  const rows = [
    `<tr class="g-grp"><th>Umsätze</th>${P.map(() => '<td></td>').join('')}</tr>`,
    zeile('Steuerpflichtige Umsätze 19 % – netto', 'bg19', 'g-sub', '81'),
    zeile('darauf Umsatzsteuer 19 %', 'st19', 'g-sub'),
    hat('bg7') || hat('st7') ? zeile('Steuerpflichtige Umsätze 7 % – netto', 'bg7', 'g-sub', '86') + zeile('darauf Umsatzsteuer 7 %', 'st7', 'g-sub') : '',
    hat('bg0') ? zeile('Umsätze ohne Umsatzsteuer (prüfen: steuerfrei / nicht steuerbar)', 'bg0', 'g-sub g-warn') : '',
    calc('Umsatzsteuer gesamt', ust),
    `<tr class="g-grp"><th>Abziehbare Vorsteuer</th>${P.map(() => '<td></td>').join('')}</tr>`,
    zeile('Vorsteuer aus Eingangsrechnungen', 'vst', 'g-sub', '66'),
    hat('rc') ? zeile('Rechnungen ausländischer Anbieter ohne MwSt – netto (evtl. § 13b)', 'rc', 'g-sub g-warn', '46/47, 67') : '',
    calc('Umsatzsteuer-Vorauszahlung (+ zahlen / − Erstattung)', zl, 'g-tot', '83'),
    `<tr class="g-grp"><th>Zur Kontrolle</th>${P.map(() => '<td></td>').join('')}</tr>`,
    zeile('An das Finanzamt gezahlt (ohne Lohnsteuer)', 'fa', 'g-sub'),
  ];
  const fehlt = S.rechnungen.filter(r => r.richtung === 'ausgang' && (r.datum || '').startsWith(J) && !DOK_ARTEN.includes(r.art) && r.mwst == null && r.netto == null).length;
  return {
    knoepfe: `<select class="inp" data-chg="ustPer" aria-label="Zeitraum"><option value="m" ${!q ? 'selected' : ''}>monatlich</option><option value="q" ${q ? 'selected' : ''}>vierteljährlich</option></select>
      <select class="inp" data-chg="ustIst" aria-label="Versteuerung"><option value="" ${!ist ? 'selected' : ''}>Soll-Versteuerung (Rechnungsdatum)</option><option value="1" ${ist ? 'selected' : ''}>Ist-Versteuerung (Geldeingang)</option></select>`,
    body: `
    <p class="small muted">Werte für die Umsatzsteuer-Voranmeldung in ELSTER. <b>Soll-Versteuerung</b>: Umsatz zählt im Monat der Rechnung. <b>Ist-Versteuerung</b>: im Monat, in dem das Geld kommt (nur wenn das Finanzamt das genehmigt hat – im Zweifel beim Steuerberater nachfragen). Vorsteuer zählt immer nach Rechnungsdatum. Durchlaufende Posten (TÜV, DEKRA, Zulassung) gehören nicht hinein und sind schon herausgerechnet. In ELSTER wird die Bemessungsgrundlage in vollen Euro eingetragen. Die Zahlungen ans Finanzamt betreffen meist den Vormonat. Zahl anklicken = Belege dahinter.</p>
    ${hat('rc') ? `<div class="warn">⚠ Es gibt Rechnungen ausländischer Online-Anbieter ohne MwSt (z. B. Shopify, Google, Meta). Das ist meist Reverse-Charge (§ 13b UStG): Ihr schuldet die Steuer selbst (Kz 46/47) und zieht sie gleich wieder als Vorsteuer ab (Kz 67) – zahlungsneutral, muss aber gemeldet werden.</div>` : ''}
    ${hat('bg0') ? `<div class="warn">⚠ Einige Ausgangsrechnungen haben keine Umsatzsteuer. Bitte prüfen, ob das stimmt (z. B. reine Weiterberechnung von TÜV-Gebühren) – sonst fehlt Umsatzsteuer.</div>` : ''}
    ${fehlt ? `<div class="warn">⚠ ${fehlt} Ausgangsrechnungen ohne Netto- und MwSt-Betrag – dort wird mit 19 % gerechnet.</div>` : ''}
    <div class="tw guv"><table class="tb gtab"><thead><tr><th>Position</th>${P.map(p => `<th class="num">${p.l}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`
  };
}

/* ---------- Offene Posten (Forderungen / Verbindlichkeiten) nach Alter ---------- */
const OP_B = ['nicht fällig', '1–30 Tage', '31–60 Tage', '61–90 Tage', 'über 90 Tage'];
function opDaten(dir) {
  const heute = todayISO();
  return S.rechnungen.filter(r => r.richtung === dir && !DOK_ARTEN.includes(r.art)).map(r => ({ r, st: rStatus(r) }))
    .filter(x => ['offen', 'ueberfaellig', 'teil'].includes(x.st.key) && Math.abs(x.st.offen) > 0.01)
    .map(x => { const f = faelligAm(x.r), tage = f ? daysBetween(f, heute) : 0; return { ...x, f, tage, b: x.st.offen < 0 || tage <= 0 ? 0 : tage <= 30 ? 1 : tage <= 60 ? 2 : tage <= 90 ? 3 : 4 }; });
}
function opTabelle(dir, L) {
  const g = new Map(); L.forEach(x => { const k = norm(x.r.partner) || '–'; if (!g.has(k)) g.set(k, { name: x.r.partner || '–', l: [] }); g.get(k).l.push(x); });
  const grp = [...g.values()].map(p => ({ ...p, s: sum(p.l, x => x.st.offen), b: OP_B.map((_, i) => sum(p.l.filter(x => x.b === i), x => x.st.offen)) })).sort((a, b) => b.s - a.s);
  const it = l => l.map(x => ({ t: 'r', id: x.r.id, v: x.st.offen, info: x.tage > 0 && x.st.offen > 0 ? x.tage + ' Tage überfällig' : 'fällig ' + fmtD(x.f) }));
  const was = dir === 'ausgang' ? 'Forderung' : 'Verbindlichkeit';
  const tot = OP_B.map((_, i) => sum(L.filter(x => x.b === i), x => x.st.offen));
  // Lieferanten: getrennt nach „wird abgebucht“ und „müssen wir selbst überweisen“
  const E = dir === 'eingang', AB = [['noch Abbuchung offen', x => istAbbuchung(x.r)], ['noch manuelle Zahlung offen', x => !istAbbuchung(x.r)]];
  const abZ = (l, fett, titel) => E ? AB.map(([n, f]) => { const ll = l.filter(f), v = sum(ll, x => x.st.offen); return `<td class="num" ${titel && v ? aKlick(it(ll), n + ' · ' + titel) : ''}>${fett ? '<b>' + aN2(v) + '</b>' : aN2(v)}</td>`; }).join('') : '';
  return `<div class="tw"><table class="tb click"><thead><tr><th>${dir === 'ausgang' ? 'Kunde' : 'Lieferant'}</th><th class="num">Belege</th>${OP_B.map(b => `<th class="num">${b}</th>`).join('')}${E ? AB.map(a => `<th class="num">${a[0]}</th>`).join('') : ''}<th class="num">Offen gesamt</th></tr></thead><tbody>
    ${grp.map(p => `<tr ${aKlick(it(p.l), 'Offen · ' + p.name)}><td>${esc(p.name)}</td><td class="num">${p.l.length}</td>${p.b.map((v, i) => `<td class="num ${i >= 2 && v > 0.005 ? 'neg' : ''}">${aN2(v)}</td>`).join('')}${abZ(p.l)}<td class="num"><b>${aN2(p.s)}</b></td></tr>`).join('') || `<tr><td colspan="10" class="empty">Keine offenen ${was === 'Forderung' ? 'Forderungen' : 'Verbindlichkeiten'}.</td></tr>`}
    ${grp.length ? `<tr class="g-sum"><td><b>Summe</b></td><td class="num">${L.length}</td>${tot.map((v, i) => `<td class="num" ${v ? aKlick(it(L.filter(x => x.b === i)), was + 'en · ' + OP_B[i]) : ''}><b>${aN2(v)}</b></td>`).join('')}${abZ(L, true, 'alle Lieferanten')}<td class="num"><b>${aN2(sum(L, x => x.st.offen))}</b></td></tr>` : ''}
    </tbody></table></div>`;
}
function viewOp() {
  const F = opDaten('ausgang'), V = opDaten('eingang');
  const ue = L => sum(L.filter(x => x.b > 0), x => x.st.offen);
  return {
    ohneJahr: true,
    body: `
    <section class="kpi">
      <div class="k hi"><div class="kv">${fmtE(sum(F, x => x.st.offen))}</div><div class="kl">Forderungen (Kunden schulden uns)</div></div>
      <div class="k"><div class="kv ${ue(F) > 0 ? 'neg' : ''}">${fmtE(ue(F))}</div><div class="kl">davon überfällig</div></div>
      <div class="k"><div class="kv">${fmtE(sum(V, x => x.st.offen))}</div><div class="kl">Verbindlichkeiten (wir schulden)</div></div>
      <div class="k"><div class="kv">${fmtE(sum(V.filter(x => istAbbuchung(x.r)), x => x.st.offen))}</div><div class="kl">davon noch Abbuchung offen</div></div>
      <div class="k"><div class="kv">${fmtE(sum(V.filter(x => !istAbbuchung(x.r)), x => x.st.offen))}</div><div class="kl">davon noch manuelle Zahlung offen</div></div>
      <div class="k"><div class="kv ${ue(V) > 0 ? 'neg' : ''}">${fmtE(ue(V))}</div><div class="kl">davon überfällig</div></div>
    </section>
    <p class="small muted">Stand heute, über alle Jahre. Fälligkeit = Fälligkeitsdatum der Rechnung, sonst Rechnungsdatum + ${ZIEL_TAGE()} Tage Zahlungsziel. Offene Gutschriften stehen mit Minus bei „nicht fällig“. Zeile anklicken = Rechnungen dahinter.</p>
    <section><h2 class="ausw-h2">Forderungen – offene Ausgangsrechnungen</h2>${opTabelle('ausgang', F)}</section>
    <section><h2 class="ausw-h2">Verbindlichkeiten – offene Eingangsrechnungen</h2>${opTabelle('eingang', V)}</section>`
  };
}

/* ---------- Liquidität: Geldbewegungen je Monat und was demnächst fällig wird ---------- */
function viewLiq() {
  const J = UI.guvJahr, inJ = d => d && d.startsWith(J), mon = d => +d.slice(5, 7) - 1;
  const R = {}; const put = (k, m, v, item) => { R[k] = R[k] || { w: Array(12).fill(0), it: Array.from({ length: 12 }, () => []) }; R[k].w[m] += v; R[k].it[m].push({ ...item, v }); };
  S.bank.forEach(b => { if (!inJ(b.datum)) return; put(b.betrag >= 0 ? 'bE' : 'bA', mon(b.datum), +b.betrag, { t: 'b', id: b.id }); });
  S.kasse.forEach(k => { if (!inJ(k.datum)) return; put(k.betrag >= 0 ? 'kE' : 'kA', mon(k.datum), +k.betrag, { t: 'k', id: k.id }); });
  S.sumup.forEach(s => { if (!inJ(s.datum) || !sumOk(s)) return; put('sU', mon(s.datum), +s.betrag || 0, { t: 's', id: s.id }); });
  const w = k => (R[k] || { w: Array(12).fill(0) }).w;
  // Kassenbestand am Monatsende (über alle Jahre fortgeschrieben)
  const kb = MONATE.map((_, m) => { const ende = J + '-' + String(m + 1).padStart(2, '0') + '-31'; return r2(kasseAnfang() + sum(S.kasse.filter(k => k.datum <= ende), k => k.betrag)); });
  const heute = todayISO(), cur = heute.slice(0, 4) === J ? +heute.slice(5, 7) : 12;
  const z = (label, k, cls = 'g-sub') => `<tr class="${cls}"><th>${label}</th>${w(k).map((v, m) => aZelle(v, R[k] && R[k].it[m], label + ' · ' + MONATE[m] + ' ' + J, aN, m >= cur ? 'fut' : '')).join('')}${aZelle(w(k).reduce((a, b) => a + b, 0), R[k] && R[k].it.flat(), label + ' · ' + J, aN, 'g-ges')}</tr>`;
  const c = (label, arr, cls = 'g-sum', ges) => `<tr class="${cls}"><th>${label}</th>${arr.map((v, m) => `<td class="num ${v < -0.005 ? 'neg' : ''} ${m >= cur ? 'fut' : ''}">${aN(v)}</td>`).join('')}<td class="num g-ges ${ges < -0.005 ? 'neg' : ''}">${aN(ges)}</td></tr>`;
  const bS = w('bE').map((v, i) => v + w('bA')[i]), kS = w('kE').map((v, i) => v + w('kA')[i]);
  const tot = a => a.reduce((x, y) => x + y, 0);
  // Fälligkeiten: was kommt rein, was muss raus
  const F = opDaten('ausgang'), V = opDaten('eingang');
  const FB = [['bereits fällig', -1e9, 0], ['in 1–7 Tagen', 1, 7], ['in 8–14 Tagen', 8, 14], ['in 15–30 Tagen', 15, 30], ['in 31–60 Tagen', 31, 60], ['später', 61, 1e9]];
  const bis = x => -x.tage;   // Tage bis zur Fälligkeit
  const inB = (L, b) => L.filter(x => bis(x) >= b[1] && bis(x) <= b[2] && x.st.offen > 0);
  const it = L => L.map(x => ({ t: 'r', id: x.r.id, v: x.st.offen, info: 'fällig ' + fmtD(x.f) }));
  let kumS = 0;
  const fRows = FB.map(b => { const f = inB(F, b), v = inB(V, b), sf = sum(f, x => x.st.offen), sv = sum(v, x => x.st.offen); kumS += sf - sv;
    return `<tr><td>${b[0]}</td>${aZelle(sf, it(f), 'Erwartete Zahlungseingänge · ' + b[0], aN)}${aZelle(-sv, it(v), 'Fällige Zahlungen · ' + b[0], aN)}<td class="num ${sf - sv < 0 ? 'neg' : ''}">${aN(sf - sv)}</td><td class="num ${kumS < 0 ? 'neg' : ''}">${aN(kumS)}</td></tr>`; });
  const f30 = sum(F.filter(x => bis(x) <= 30 && x.st.offen > 0), x => x.st.offen), v30 = sum(V.filter(x => bis(x) <= 30 && x.st.offen > 0), x => x.st.offen);
  return {
    body: `
    <section class="kpi">
      <div class="k hi"><div class="kv">${fmtE(kasseBestand().bestand)}</div><div class="kl">Kassenbestand heute</div></div>
      <div class="k"><div class="kv ${tot(bS) < 0 ? 'neg' : ''}">${fmtE(tot(bS))}</div><div class="kl">Bank: Eingänge − Ausgänge ${J}</div></div>
      <div class="k"><div class="kv">${fmtE(f30)}</div><div class="kl">Erwartete Eingänge (fällig bis 30 Tage)</div></div>
      <div class="k"><div class="kv">${fmtE(v30)}</div><div class="kl">Zu zahlen (fällig bis 30 Tage)</div></div>
    </section>
    <p class="small muted">Tatsächliche Geldbewegungen laut Bank-Import, Kassenbuch und SumUp (brutto, nach Buchungsdatum). Den Kontostand selbst kennt die App nicht – nur die importierten Bewegungen. Zahl anklicken = Buchungen dahinter.</p>
    <section><h2 class="ausw-h2">Geldbewegungen ${J}</h2>
    <div class="tw guv"><table class="tb gtab"><thead><tr><th>Position</th>${MONATE.map(m => `<th class="num">${m}</th>`).join('')}<th class="num">Gesamt</th></tr></thead><tbody>
      <tr class="g-grp"><th>Bank</th>${MONATE.map(() => '<td></td>').join('')}<td class="g-ges"></td></tr>
      ${z('Eingänge', 'bE')}${z('Ausgänge', 'bA')}${c('Saldo Bank', bS, 'g-sum', tot(bS))}
      <tr class="g-grp"><th>Kasse</th>${MONATE.map(() => '<td></td>').join('')}<td class="g-ges"></td></tr>
      ${z('Einnahmen', 'kE')}${z('Ausgaben', 'kA')}${c('Saldo Kasse', kS, 'g-sum', tot(kS))}${c('Kassenbestand am Monatsende', kb, 'g-sub2', kb[cur - 1])}
      ${R.sU ? `<tr class="g-grp"><th>Kartenzahlungen</th>${MONATE.map(() => '<td></td>').join('')}<td class="g-ges"></td></tr>${z('SumUp-Umsätze', 'sU')}` : ''}
      ${c('Geldfluss gesamt (Bank + Kasse)', bS.map((v, i) => v + kS[i]), 'g-tot', tot(bS) + tot(kS))}
    </tbody></table></div></section>
    <section><h2 class="ausw-h2">Fällige Zahlungen – Vorschau ab heute</h2>
    <div class="tw"><table class="tb"><thead><tr><th>Fälligkeit</th><th class="num">Eingänge (Kunden)</th><th class="num">Ausgänge (Lieferanten)</th><th class="num">Saldo</th><th class="num">Saldo aufgelaufen</th></tr></thead><tbody>${fRows.join('')}</tbody></table></div>
    <p class="small muted">Aus den offenen Posten: offene Ausgangsrechnungen als erwartete Eingänge, offene Eingangsrechnungen (inkl. „Abbuchung offen“) als Ausgänge. Laufende Kosten ohne Rechnung (Lohn, Miete per Dauerauftrag) sind hier nicht drin.</p></section>`
  };
}

/* ---------- Kunden & Lieferanten ---------- */
function partnerTabelle(dir, J) {
  const L = S.rechnungen.filter(r => r.richtung === dir && (r.datum || '').startsWith(J) && !DOK_ARTEN.includes(r.art) && !(dir === 'eingang' && istFinanzamt(r)));
  const g = new Map(); L.forEach(r => { const k = norm(r.partner) || '–'; if (!g.has(k)) g.set(k, { namen: {}, l: [] }); const p = g.get(k); p.namen[r.partner || '–'] = (p.namen[r.partner || '–'] || 0) + 1; p.l.push(r); });
  const wert = r => dir === 'ausgang' ? nettoA(r) : nettoE(r);
  const P = [...g.values()].map(p => ({ name: Object.entries(p.namen).sort((a, b) => b[1] - a[1])[0][0], l: p.l, v: sum(p.l, wert), offen: sum(p.l, r => { const s = rStatus(r); return ['offen', 'ueberfaellig', 'teil'].includes(s.key) ? s.offen : 0; }),
    ka: dir === 'eingang' ? Object.entries(p.l.reduce((a, r) => { const k = r.kostenart || 'ohne Kategorie'; a[k] = (a[k] || 0) + 1; return a; }, {})).sort((a, b) => b[1] - a[1])[0][0] : '' })).sort((a, b) => b.v - a.v);
  const ges = sum(P, p => p.v), TOP = 30, top = P.slice(0, TOP), rest = P.slice(TOP);
  const it = l => l.map(r => ({ t: 'r', id: r.id, v: wert(r) }));
  let kum = 0;
  const zeile = (p, i) => { kum += p.v; return `<tr ${aKlick(it(p.l), p.name + ' · ' + J)}><td class="num muted">${i + 1}</td><td>${esc(p.name)}</td>${dir === 'eingang' ? `<td class="small">${esc(p.ka)}</td>` : ''}<td class="num">${p.l.length}</td><td class="num"><b>${aN2(p.v)}</b></td><td class="num">${aP(p.v, ges)}</td><td class="num muted">${aP(kum, ges)}</td><td class="num">${aN2(p.v / p.l.length)}</td><td class="num ${p.offen > 0.005 ? 'neg' : ''}">${aN2(p.offen)}</td></tr>`; };
  const restZ = rest.length ? `<tr ${aKlick(it(rest.flatMap(p => p.l)), 'Übrige ' + (dir === 'ausgang' ? 'Kunden' : 'Lieferanten') + ' · ' + J)}><td></td><td class="muted">übrige ${rest.length} ${dir === 'ausgang' ? 'Kunden' : 'Lieferanten'}</td>${dir === 'eingang' ? '<td></td>' : ''}<td class="num">${sum(rest, p => p.l.length)}</td><td class="num"><b>${aN2(sum(rest, p => p.v))}</b></td><td class="num">${aP(sum(rest, p => p.v), ges)}</td><td class="num muted">100,0 %</td><td></td><td class="num">${aN2(sum(rest, p => p.offen))}</td></tr>` : '';
  return { n: P.length, ges, top3: ges ? sum(P.slice(0, 3), p => p.v) / ges : 0, html: `<div class="tw"><table class="tb click"><thead><tr><th class="num">#</th><th>${dir === 'ausgang' ? 'Kunde' : 'Lieferant'}</th>${dir === 'eingang' ? '<th>Kategorie</th>' : ''}<th class="num">Rechnungen</th><th class="num">${dir === 'ausgang' ? 'Umsatz' : 'Kosten'} netto</th><th class="num">Anteil</th><th class="num">aufgelaufen</th><th class="num">Ø je Rechnung</th><th class="num">noch offen</th></tr></thead><tbody>
    ${top.map(zeile).join('') || `<tr><td colspan="9" class="empty">Keine Rechnungen in ${J}.</td></tr>`}${restZ}</tbody></table></div>` };
}
function viewPartner() {
  const J = UI.guvJahr, K = partnerTabelle('ausgang', J), L = partnerTabelle('eingang', J);
  const pz = v => (v * 100).toLocaleString('de-DE', { maximumFractionDigits: 0 }) + ' %';
  return {
    body: `
    <section class="kpi">
      <div class="k hi"><div class="kv">${K.n}</div><div class="kl">Kunden mit Rechnung ${J}</div></div>
      <div class="k"><div class="kv">${pz(K.top3)}</div><div class="kl">Umsatzanteil der 3 größten Kunden</div></div>
      <div class="k"><div class="kv">${L.n}</div><div class="kl">Lieferanten ${J}</div></div>
      <div class="k"><div class="kv">${pz(L.top3)}</div><div class="kl">Kostenanteil der 3 größten Lieferanten</div></div>
    </section>
    <p class="small muted">Netto nach Rechnungsdatum, Gutschriften abgezogen, Zahlungen ans Finanzamt nicht enthalten. Hoher Anteil weniger Kunden = Abhängigkeit (Klumpenrisiko). Zeile anklicken = Rechnungen.</p>
    <section><h2 class="ausw-h2">Umsatz nach Kunden</h2>${K.html}</section>
    <section><h2 class="ausw-h2">Kosten nach Lieferanten</h2>${L.html}</section>`
  };
}
