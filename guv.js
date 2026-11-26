/* Mastercar Finanzen · GuV je Monat – automatisch aus Rechnungsausgang, Rechnungseingang (und optional Zahlungen ohne Beleg)
   Gliederung wie im Blatt „GuV“ der Excel-Mappe. Beträge netto; durchlaufende Posten (z. B. TÜV-Gebühren) bleiben außen vor. */
const OHNE = 'nicht zugeordnet';
// Netto ohne durchlaufende Posten. Fehlt netto: brutto − durchl. Posten − MwSt (MwSt bekannt), ohne MwSt-Pflicht = brutto − durchl. Posten, sonst ÷ 1,19
const nettoAus = r => {
  if (r.netto != null) return +r.netto;
  const b = (+r.brutto || 0) - (+r.durchlaufend || 0);
  if (r.mwst != null) return r2(b - (+r.mwst || 0));
  return r.mwst_pflicht === false ? r2(b) : r2(b / 1.19);
};
// Zahlungen ans Finanzamt (Umsatzsteuer-Vorauszahlung, Lohnsteuer, Säumniszuschläge) sind keine Kosten im Sinne der GuV:
// die Umsatzsteuer ist durchlaufend (Umsatz und Kosten stehen netto drin), sie werden unten separat gezeigt
const istFinanzamt = r => /finanzamt|steuerverwaltung|bundeskasse|steuerkasse/i.test(r.partner || r.gegenpartei || '');
const nettoA = r => nettoAus(r);
// Bei Finanzamt-Zahlungen zählt nur der erfasste Lohnsteuer-Anteil (Feld „lohn“: LSt + Soli + KiSt) – als Personalkosten
const lstVon = r => istFinanzamt(r) ? r2(+r.lohn || 0) : 0;
const nettoE = r => istFinanzamt(r) ? lstVon(r) : nettoAus(r);   // + Ausgabe, − Gutschrift; vom Finanzamt nur die Lohnsteuer
const kostenartE = r => istFinanzamt(r) ? 'Personalkosten' : r.kostenart;

// Liefert {zeilen: Map(schlüssel → {werte[12], items[]}), jahr}
function guvDaten(jahr, mitOhneBeleg) {
  const Z = new Map();
  const put = (key, m, v, item) => { if (!Z.has(key)) Z.set(key, { w: Array(12).fill(0), items: [] }); const z = Z.get(key); z.w[m] += v; z.items.push({ ...item, v, m }); };
  const inJ = d => d && d.slice(0, 4) === String(jahr), mon = d => +d.slice(5, 7) - 1;
  S.rechnungen.forEach(r => {
    if (!inJ(r.datum)) return;
    if (DOK_ARTEN.includes(r.art)) return;   // Avis/Mahnung sind keine Buchungen
    // Umsatzsteuer / Vorsteuer je Monat (für die USt-Übersicht unter der GuV)
    if (r.richtung === 'ausgang') { put('§USt', mon(r.datum), +r.mwst || 0, { t: 'r', id: r.id }); put('Umsatzerlöse', mon(r.datum), nettoA(r), { t: 'r', id: r.id }); return; }
    if (istFinanzamt(r)) {
      put('§FA', mon(r.datum), +r.brutto || 0, { t: 'r', id: r.id });
      const l = lstVon(r); if (l) { put('Personalkosten', mon(r.datum), -l, { t: 'r', id: r.id }); put('§LSt', mon(r.datum), l, { t: 'r', id: r.id }); }
      return;
    }
    put('§VSt', mon(r.datum), -(+r.mwst || 0), { t: 'r', id: r.id });
    const k = KOSTENARTEN.includes(r.kostenart) ? r.kostenart : OHNE, u = r.unterkonto && UNTERKONTEN(k).includes(r.unterkonto) ? r.unterkonto : '';
    put(k + (u ? '|' + u : ''), mon(r.datum), -nettoE(r), { t: 'r', id: r.id });
  });
  if (mitOhneBeleg) {
    buildIdx();
    S.bank.forEach(b => { if (inJ(b.datum) && personalErstattung(b)) { put('Personalkosten', mon(b.datum), +b.betrag, { t: 'b', id: b.id }); return; }   /* AAG-Erstattung der Krankenkasse mindert die Personalkosten */
      if (!inJ(b.datum) || b.betrag >= 0 || b.art || (IDX.zByB.get(b.id) || []).length || bankNeutral(b)) return;   /* Darlehen/Tilgung, Vorjahr, Rücklastschrift sind keine Kosten */
      if (istFinanzamt(b)) { put('§FA', mon(b.datum), -b.betrag, { t: 'b', id: b.id }); return; } put((KOSTENARTEN.includes(b.kostenart) ? b.kostenart : OHNE), mon(b.datum), +b.betrag, { t: 'b', id: b.id }); });
    S.kasse.forEach(k => { if (!inJ(k.datum) || k.betrag >= 0 || /umbuchung|privat|ignor/i.test(k.kostenart || '') || (IDX.zByK.get(k.id) || []).length) return; /* Bargeld aufs Konto ist kein Aufwand */ put((KOSTENARTEN.includes(k.kostenart) ? k.kostenart : OHNE), mon(k.datum), +k.betrag, { t: 'k', id: k.id }); });
  }
  return Z;
}
function guvRechnen(jahr, mitOhneBeleg) {
  const Z = guvDaten(jahr, mitOhneBeleg), zero = () => Array(12).fill(0), add = (a, b) => a.map((x, i) => x + b[i]);
  const lines = []; let ertrag = zero(), kosten = zero();
  const grpVal = k => { let w = zero(); for (const [key, z] of Z) if (key === k || key.startsWith(k + '|')) w = add(w, z.w); return w; };
  for (const g of GUV) {
    const w = grpVal(g.k);
    lines.push({ typ: 'grp', label: g.k, konto: g.konto || '', w, key: g.k, sub: g.subs.length > 0 });
    if (g.subs.length) {
      g.subs.forEach(([s, konto]) => lines.push({ typ: 'sub', label: s, konto, w: (Z.get(g.k + '|' + s) || { w: zero() }).w, key: g.k + '|' + s }));
      const rest = (Z.get(g.k) || { w: zero() }).w; if (rest.some(x => Math.abs(x) > 0.005)) lines.push({ typ: 'sub', label: 'ohne Unterposition', konto: '', w: rest, key: g.k, nur: true });
    }
    if (g.typ === 'e') ertrag = add(ertrag, w); else kosten = add(kosten, w);
    if (g.k === 'sonstige betriebliche Erträge') lines.push({ typ: 'sum', label: 'Summe Erträge', w: ertrag });
  }
  const ohne = (Z.get(OHNE) || { w: zero() }).w;
  if (ohne.some(x => Math.abs(x) > 0.005)) { lines.push({ typ: 'grp', label: 'Kosten ohne Kategorie', konto: '', w: ohne, key: OHNE, warn: true }); kosten = add(kosten, ohne); }
  const erg = add(ertrag, kosten);
  // Ertragsteuer (30 %, geschätzt) auf das bis dahin AUFGELAUFENE Ergebnis: Verlustmonate werden verrechnet, nicht jeder Gewinnmonat einzeln besteuert
  let kumE = 0, bisher = 0; const steuer = erg.map(x => { kumE += x; const soll = kumE > 0 ? -0.3 * kumE : 0, m = soll - bisher; bisher = soll; return r2(m); });
  const jue = add(erg, steuer);
  let kum = 0; const kumW = jue.map(x => (kum += x));
  lines.push({ typ: 'sum', label: 'Summe Kosten', w: kosten }, { typ: 'tot', label: 'Ergebnis vor Steuern', w: erg }, { typ: 'sub2', label: 'Steuern vom Einkommen und Ertrag (30 %, geschätzt, auf das aufgelaufene Ergebnis)', w: steuer }, { typ: 'tot', label: 'Jahresüberschuss / -fehlbetrag', w: jue }, { typ: 'sub2', label: 'Ergebnis kumuliert', w: kumW, kum: true });
  // Umsatzsteuer – nicht Teil der GuV, zur Kontrolle der Voranmeldung
  const g = k => (Z.get(k) || { w: zero() }).w, ust = g('§USt'), vst = g('§VSt').map(x => -x), zl = ust.map((x, i) => r2(x - vst[i]));
  lines.push({ typ: 'grp', label: 'Umsatzsteuer (nicht in der GuV)', w: zero(), info: true },
    { typ: 'sub', label: 'Umsatzsteuer aus Rechnungsausgang', w: ust, key: '§USt', nur: true },
    { typ: 'sub', label: 'Vorsteuer aus Rechnungseingang', w: vst.map(x => -x), key: '§VSt', nur: true },
    { typ: 'sum', label: 'USt-Zahllast (berechnet)', w: zl },
    { typ: 'sub', label: 'Zahlungen ans Finanzamt (USt-Vorauszahlung, Lohnsteuer, Zuschläge)', w: g('§FA'), key: '§FA', nur: true },
    { typ: 'sub', label: 'davon Lohnsteuer (in Personalkosten gebucht)', w: g('§LSt'), key: '§LSt', nur: true },
    { typ: 'sub', label: 'davon Umsatzsteuer und Sonstiges', w: g('§FA').map((x, i) => r2(x - g('§LSt')[i])) });
  return { lines, Z };
}
const guvJahre = () => { const s = new Set(S.rechnungen.map(r => (r.datum || '').slice(0, 4)).filter(Boolean)); s.add(todayISO().slice(0, 4)); return [...s].sort().reverse(); };

// Finanzamt-Zahlungen des gewählten Jahres ohne erfassten Lohnsteuer-Anteil
const lstOffen = () => S.rechnungen.filter(r => r.richtung === 'eingang' && istFinanzamt(r) && (+r.brutto || 0) > 0 && !(+r.lohn) && (r.datum || '').startsWith(UI.guvJahr || '')).length;
function viewGuv() {   // Teil der Rubrik „Auswertungen“ (Jahr wählt viewAusw)
  const { lines } = guvRechnen(UI.guvJahr, !!UI.guvOhne);
  const MON = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
  const cur = todayISO().slice(0, 4) === UI.guvJahr ? +todayISO().slice(5, 7) : 12;
  const n = v => Math.abs(v) < 0.005 ? '<span class="muted">–</span>' : Math.round(v).toLocaleString('de-DE');
  const tot = w => w.reduce((a, b) => a + b, 0);
  const row = l => {
    const cls = { grp: 'g-grp', sub: 'g-sub', sum: 'g-sum', tot: 'g-tot', sub2: 'g-sub2' }[l.typ] + (l.warn ? ' g-warn' : '');
    const click = l.key && !(l.typ === 'grp' && l.sub) || l.nur;
    const gesamt = l.kum ? l.w[cur - 1] : tot(l.w);
    return `<tr class="${cls}"><th>${esc(l.label)}${l.konto ? `<small>${esc(l.konto)}</small>` : ''}</th>${l.w.map((v, m) => `<td class="num ${v < -0.005 ? 'neg' : ''} ${m >= cur ? 'fut' : ''}" ${click && Math.abs(v) > 0.005 ? `data-act="guvZelle" data-k="${esc(l.key)}" data-m="${m}" data-nur="${l.nur ? 1 : ''}"` : ''}>${n(v)}</td>`).join('')}<td class="num g-ges ${gesamt < -0.005 ? 'neg' : ''}">${n(gesamt)}</td></tr>`;
  };
  return { csv: false, knoepfe: `
    <label class="chk inline"><input type="checkbox" data-chg="guvOhne" ${UI.guvOhne ? 'checked' : ''}> Zahlungen ohne Beleg (Bank/Kasse) mitrechnen</label>
    ${lstOffen() ? `<button class="btn primary" data-act="lstErfassen" title="Lohnsteuer-Anteil der Finanzamt-Zahlungen eintragen">Lohnsteuer erfassen <span class="cnt">${lstOffen()}</span></button>` : `<button class="btn" data-act="lstErfassen">Lohnsteuer erfassen</button>`}
    <button class="btn" data-act="guvCsv">CSV</button>`, body: `
  <p class="small muted">Automatisch aus Rechnungsausgang (netto) und Rechnungseingang (netto, nach Kategorie) nach Rechnungsdatum. Durchlaufende Posten (z. B. TÜV) und Zahlungen ans Finanzamt (Umsatzsteuer, Lohnsteuer) sind nicht enthalten – die stehen unten bei „Umsatzsteuer“. Den Lohnsteuer-Anteil dieser Zahlungen über „Lohnsteuer erfassen“ eintragen – er zählt dann als Personalkosten. Zahl anklicken = Belege dahinter. Vorläufige Auswertung – ersetzt nicht die BWA vom Steuerberater.</p>
  <div class="tw guv"><table class="tb gtab"><thead><tr><th>Position</th>${MON.map(m => `<th class="num">${m}</th>`).join('')}<th class="num">Gesamt</th></tr></thead><tbody>${lines.map(row).join('')}</tbody></table></div>` };
}
function guvZelle(key, m, nur) {
  const { Z } = guvRechnen(UI.guvJahr, !!UI.guvOhne);
  let items = []; for (const [k, z] of Z) if (k === key || (!nur && k.startsWith(key + '|'))) items.push(...z.items.filter(i => i.m === m));
  items.sort((a, b) => Math.abs(b.v) - Math.abs(a.v));
  const lbl = i => { if (i.t === 'r') { const r = S.rechnungen.find(x => x.id === i.id); return r ? [r.datum, r.partner, r.nummer || r.art || ''] : []; } const x = (i.t === 'b' ? S.bank : S.kasse).find(y => y.id === i.id); return x ? [x.datum, i.t === 'b' ? x.gegenpartei : 'Kasse', i.t === 'b' ? x.zweck : x.text] : []; };
  const NAMEN = { '§USt': 'Umsatzsteuer', '§VSt': 'Vorsteuer', '§FA': 'Zahlungen ans Finanzamt', '§LSt': 'Lohnsteuer' };
  openSheet({ title: (NAMEN[key] || key.replace('|', ' · ')) + ' · ' + MONATE[m] + ' ' + UI.guvJahr, wide: true, noOk: true, html: `<div class="sumline">${items.length} Einträge · ${fmtE(sum(items, i => i.v))}</div>
    <div class="tw"><table class="tb click"><tbody>${items.slice(0, 400).map(i => { const [d, p, x] = lbl(i); return `<tr data-act="${i.t === 'r' ? 'rechnung' : i.t === 'b' ? 'bank' : 'kasseD'}" data-id="${i.id}"><td>${fmtD(d)}</td><td>${esc(p || '')}</td><td class="zweck">${esc(x || '')}</td><td class="num ${i.v < 0 ? 'neg' : ''}">${fmtE(i.v)}</td></tr>`; }).join('')}</tbody></table></div>` });
}
/* Lohnsteuer-Anteil je Finanzamt-Zahlung erfassen (aus Lohnabrechnung / Lohnsteuer-Anmeldung) → zählt als Personalkosten,
   der Rest der Zahlung ist Umsatzsteuer (keine Kosten). Gespeichert im Feld „lohn“ der Finanzamt-Buchung. */
function lstErfassen() {
  buildIdx();
  const jahr = UI.guvJahr || todayISO().slice(0, 4);
  const l = S.rechnungen.filter(r => r.richtung === 'eingang' && istFinanzamt(r) && (r.datum || '').startsWith(jahr) && !DOK_ARTEN.includes(r.art)).sort((a, b) => (a.datum || '').localeCompare(b.datum || ''));
  if (!l.length) return toast('Keine Zahlungen ans Finanzamt in ' + jahr + ' gefunden.');
  // Verwendungszweck der zugehörigen Bankbuchung als Hilfe („LSt SoLi KiSt Sep 26 USt Aug 26“)
  const zweck = r => (IDX.zByR.get(r.id) || []).map(z => z.bank_id && S.bank.find(b => b.id === z.bank_id)).filter(Boolean).map(b => String(b.zweck || '').replace(/^.*SVWZ\+/, '').replace(/SecureGo plus$/i, '')).join(' · ') || r.beschreibung || r.notiz || '';
  const d = openSheet({ title: 'Lohnsteuer in den Finanzamt-Zahlungen ' + jahr, wide: true, okLabel: 'Speichern', html: `
    <p class="small muted">Trag je Zahlung ein, wie viel davon <b>Lohnsteuer inkl. Soli und Kirchensteuer</b> ist (steht in der Lohnabrechnung bzw. Lohnsteuer-Anmeldung des Monats). Dieser Teil zählt als Personalkosten, der Rest ist Umsatzsteuer und keine Kosten. Erstattungen mit Minus.</p>
    <div class="tw"><table class="tb"><thead><tr><th>Datum</th><th class="num">Betrag</th><th>Verwendungszweck</th><th class="num">davon Lohnsteuer</th><th class="num">Rest (USt u. a.)</th></tr></thead><tbody>
    ${l.map(r => `<tr><td>${fmtD(r.datum)}</td><td class="num">${fmtE(r.brutto)}</td><td class="zweck" style="white-space:normal;max-width:420px">${esc(zweck(r))}</td>
      <td class="num"><input class="inp num" style="width:110px" data-lst="${r.id}" inputmode="decimal" value="${r.lohn ? String(r.lohn).replace('.', ',') : ''}" placeholder="0,00"></td><td class="num" data-rest="${r.id}">${fmtE((+r.brutto || 0) - (+r.lohn || 0))}</td></tr>`).join('')}
    </tbody></table></div><div class="sumline" id="lstSum"></div>`,
    onOk: async () => {
      const upd = [];
      for (const i of $$('input[data-lst]', d)) {
        const r = l.find(x => x.id === i.dataset.lst), v = i.value.trim() === '' ? 0 : parseNum(i.value);
        if (v == null) { toast('Bitte eine Zahl eintragen (' + fmtD(r.datum) + ').'); return false; }
        if (Math.abs(v) > Math.abs(+r.brutto || 0) + 0.005) { toast('Lohnsteuer ist größer als die Zahlung vom ' + fmtD(r.datum) + '.'); return false; }
        if (!eq(v, +r.lohn || 0)) upd.push([r.id, r2(v)]);
      }
      for (const [id, v] of upd) await DB.update('rechnungen', id, { lohn: v || null });
      toast(upd.length ? `${upd.length} Zahlung${upd.length === 1 ? '' : 'en'} gespeichert – GuV aktualisiert.` : 'Nichts geändert.'); render();
    } });
  const summe = () => { let s = 0, g = 0; $$('input[data-lst]', d).forEach(i => { const r = l.find(x => x.id === i.dataset.lst), v = parseNum(i.value) || 0; s += v; g += +r.brutto || 0; const c = $(`[data-rest="${r.id}"]`, d); if (c) c.textContent = fmtE((+r.brutto || 0) - v); });
    $('#lstSum', d).textContent = `Gezahlt ${fmtE(g)} · davon Lohnsteuer ${fmtE(s)} · Umsatzsteuer u. a. ${fmtE(g - s)}`; };
  $$('input[data-lst]', d).forEach(i => i.oninput = summe); summe();
}
function guvCsv() {
  const { lines } = guvRechnen(UI.guvJahr, !!UI.guvOhne);
  const rows = [['Position', 'Konto', ...MONATE, 'Gesamt']].concat(lines.map(l => [(l.typ === 'sub' ? '  ' : '') + l.label, l.konto || '', ...l.w.map(numDE), numDE(l.kum ? l.w[11] : l.w.reduce((a, b) => a + b, 0))]));
  download(`Mastercar_GuV_${UI.guvJahr}.csv`, rows.map(csvRow).join('\r\n'));
}
