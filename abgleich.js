/* Mastercar Finanzen · Abgleich: Rechnungen ↔ Bank ↔ SumUp
   Status je Rechnung: offen, überfällig, bezahlt, zu wenig (teilbezahlt), zu viel (überzahlt), doppelt bezahlt, erledigt */
const ZIEL_TAGE = () => +(S.einstellungen.zahlungsziel ?? 10);   // Kundenrechnungen: ab 10 Tagen nach Rechnungsdatum überfällig
let IDX = { zByR: new Map(), zByB: new Map(), zByS: new Map(), zByK: new Map() };
function buildIdx() {
  const m = () => new Map(); IDX = { zByR: m(), zByB: m(), zByS: m(), zByK: m(), gsByR: m(), rById: new Map(S.rechnungen.map(r => [r.id, r])) };
  const push = (map, k, z) => { if (!k) return; if (!map.has(k)) map.set(k, []); map.get(k).push(z); };
  S.zuordnungen.forEach(z => { push(IDX.zByR, z.rechnung_id, z); push(IDX.zByB, z.bank_id, z); push(IDX.zByS, z.sumup_id, z); push(IDX.zByK, z.kasse_id, z); });
  S.rechnungen.forEach(r => { if (r.bezug_id && r.bezug_id !== r.id) push(IDX.gsByR, r.bezug_id, r); });   // Gutschriften/Korrekturen je Rechnung
  PARTNER_LERN = null;   // gelernte Namen bei Bedarf neu aufbauen
  IDX.bArt = bankOhneRechnung();
}
/* ---------- Bankbuchungen, zu denen es keine Rechnung gibt (automatisch erkannt, nichts wird gespeichert) ----------
   Gilt nur für Buchungen ohne Zuordnung und ohne von Hand gesetzte Art. */
const B_AUTO = {
  vorjahr: ['Gehört zu 2025', 'st-info'], rueck: ['Rücklastschrift', 'st-info'], erstattung: ['Erstattung (ohne Rechnung)', 'st-info'],
  steuer: ['Steuer-Erstattung', 'st-info'], darlehen: ['Darlehen / Tilgung', 'st-info'], gebuehr: ['Bankgebühr', 'st-info'], rueckzahlung: ['Rückzahlung an Kunden', 'st-info'],
};
const RUECK_RX = /retoure|r(ü|ue|u)cklastschrift|return\s*\/\s*refund/i;
const bZweck = b => String(b.zweck || '').replace(/^.*SVWZ\+/, '') + ' ' + (b.gegenpartei || '');
function bankOhneRechnung() {
  const m = new Map(), frei = b => !b.art && !(IDX.zByB.get(b.id) || []).length;
  const tok = b => (nameTokens(b.gegenpartei || '')[0] || '');
  // Rücklastschrift: Gutschrift „Retoure SEPA Lastschrift“ + die Abbuchung mit gleichem Betrag kurz davor
  const ret = S.bank.filter(b => b.betrag > 0 && RUECK_RX.test(bZweck(b)));
  for (const r of ret) {
    const o = S.bank.filter(b => b.betrag < 0 && eq(-b.betrag, r.betrag) && !m.has(b.id) && daysBetween(b.datum, r.datum) >= 0 && daysBetween(b.datum, r.datum) <= 14 && (!tok(r) || tok(b) === tok(r)))
      .sort((a, b) => frei(b) - frei(a) || b.datum.localeCompare(a.datum))[0];
    if (frei(r)) m.set(r.id, 'rueck');
    if (o && frei(o)) m.set(o.id, 'rueck');
  }
  for (const b of S.bank) {
    if (m.has(b.id) || !frei(b)) continue;
    const t = bZweck(b);
    let k = null;
    if (b.betrag > 0 && /\bR\s?25\s?[-\/]\s?\d{3,4}\b|\b(re|rg|rechnung|renr)\.?[^\d]{0,12}25[-\/]\d{3,4}\b|\bR25-?\d{3,4}|\bre\.?\s*25-\d{4}\b|\/25-\d{4}\b|\b(re|rg|rechnung|renr)\.?[^\d]{0,12}(PR)?25\d{3}\b/i.test(t)) k = 'vorjahr';   // auch „Rechnung 25006“ (PR-Nummernkreis 2025)
    else if (/darlehen|tilgung/i.test(t)) k = 'darlehen';
    else if (b.betrag > 0 && /steuerverwaltung|finanzamt|bundeskasse/i.test(t)) k = 'steuer';
    else if (b.betrag > 0 && /erstattung|erstattet|r(ü|ue|u)ckzahlung|(ü|ue|u)berzahlung|doppelzahl|zu\s?viel|refund|zur(ü|ue|u)ck/i.test(t)) k = 'erstattung';
    else if (b.betrag < 0 && /umsatzsteuer auf eur .*abrechnung per|jahrespreis girocard|kontof(ü|ue|u)hrung|rechnungsabschluss|entgelt(e)? f(ü|ue|u)r/i.test(t)) k = 'gebuehr';
    else if (b.betrag < 0 && /doppelzahl|(ü|ue|u)berzahl|zu\s?viel|r(ü|ue|u)ckzahl|r(ü|ue|u)ck(ü|ue|u)berw/i.test(t)) k = 'rueckzahlung';
    if (k) m.set(b.id, k);
  }
  return m;
}
/* ---------- Gehört eine Zahlung zu diesem Rechnungssteller? ----------
   1) gleiches Namenswort · 2) bekannte Abkürzungen („BGHM“ = Berufsgenossenschaft Holz und Metall)
   3) gelernt: diese IBAN / dieser Auftraggeber wurde schon einmal einer Rechnung dieser Firma zugeordnet
   4) Tippfehler im Namen (gleicher Wortanfang, mind. 6 Buchstaben: „Stellantids“ = „Stellantis“) */
const NAME_ALIAS = [
  [/\bbghm\b|berufsgenossenschaft\s*holz/i, /berufsgenossenschaft\s*holz|\bbg\s*holz|\bbghm\b/i],
  [/techniker|^\s*tk\b/i, /techniker\s*krankenkasse|\btk\b/i],
  [/rundfunk|beitragsservice|\bgez\b/i, /rundfunk|beitragsservice|ard\s*zdf/i],
  [/stadtbetrieb|stadt\s*bornheim/i, /stadtbetrieb|stadt\s*bornheim/i],
  [/stellanti|distrigo/i, /stellantis|distrigo|\bpsa\b/i],
  [/minijob|knappschaft/i, /minijob|knappschaft/i],
  [/finanzamt/i, /finanzamt|steuerverwaltung|bundeskasse|landeshauptkasse/i],
  [/rentenversicherung|\bdrv\b/i, /rentenversicherung/i],
  [/\bsvlfg\b|sozialversicherung.*landwirt/i, /svlfg|sozialversicherung.*landwirt/i],
];
const ALLERWELT = /^(servic|autoha|handel|techni|intern|deutsc|versic|holdin|gesell|verwal|kfzser|mobili|logist|partne|vertri|zentra|system|consul|europe|german|onlin)/;   // zu allgemein für den Wortanfang-Vergleich
let PARTNER_LERN = null;
function partnerLernen() {
  const m = new Map(), put = (k, p) => { if (!k || !p) return; if (!m.has(k)) m.set(k, new Set()); m.get(k).add(p); };
  const bank = new Map(S.bank.map(b => [b.id, b])), re = new Map(S.rechnungen.map(r => [r.id, r]));
  S.zuordnungen.forEach(z => { const b = z.bank_id && bank.get(z.bank_id), r = re.get(z.rechnung_id); if (!b || !r || !r.partner) return;
    const p = norm(r.partner); if (b.iban) put('i:' + normNr(b.iban), p); if (b.gegenpartei) put('g:' + norm(b.gegenpartei), p); });
  return (PARTNER_LERN = m);
}
function partnerPasst(r, pay, NS) {
  const txt = (pay.gegenpartei || '') + ' ' + (pay.zweck || pay.beschreibung || pay.text || '');
  NS = NS || new Set(nameTok(txt));
  if (nameHit(r.partner, NS)) return true;
  if (NAME_ALIAS.some(([a, b]) => a.test(r.partner || '') && b.test(txt))) return true;
  const L = PARTNER_LERN || partnerLernen(), p = norm(r.partner);
  if (pay.iban && (L.get('i:' + normNr(pay.iban)) || new Set()).has(p)) return true;
  if (pay.gegenpartei && (L.get('g:' + norm(pay.gegenpartei)) || new Set()).has(p)) return true;
  const ok = w => w.length >= 6 && !ALLERWELT.test(w), a = nameTok(r.partner).filter(ok), b = [...NS].filter(ok);
  return a.some(w => b.some(v => v.slice(0, 6) === w.slice(0, 6)));
}
// Zu zahlender Betrag (Skonto abgezogen)
const sollOf = r => r2((+r.brutto || 0) - (+r.skonto || 0));
const isStorno = r => /storn/i.test((r.status_excel || '') + ' ' + (r.art || '') + ' ' + (r.zahlart || ''));
const sum = (a, f = x => x) => r2(a.reduce((s, x) => s + (+f(x) || 0), 0));
const sumOk = s => !/fehl|failed|storn|abgebrochen|cancel|declin|abgelehnt|ignor/i.test(s.status || '');

const R_ST = {
  offen: ['Offen', 'st-open'], ueberfaellig: ['Überfällig', 'st-late'], bezahlt: ['Bezahlt', 'st-ok'], teil: ['Zu wenig bezahlt', 'st-warn'],
  ueber: ['Zu viel bezahlt', 'st-warn'], doppelt: ['Doppelt bezahlt', 'st-bad'], erledigt: ['Erledigt', 'st-ok'], pruefen: ['KI – prüfen', 'st-ai'],
  extern: ['Bezahlt (laut Liste)', 'st-ok'], storno: ['Storniert', 'st-info']
};
// Kundenrechnungen: immer Rechnungsdatum + Zahlungsziel (Standard 10 Tage); Lieferanten: Fälligkeit laut Rechnung, sonst 14 Tage
function faelligAm(r) {
  if (!r.datum) return r.faellig || null;
  return r.richtung === 'ausgang' ? addDays(r.datum, ZIEL_TAGE()) : (r.faellig || addDays(r.datum, 14));
}
// Status genau wie in der Excel-Mappe (Spalte „Erledigt?“ bzw. „Bezahlt?“)
const ST_LISTE = {
  eingang: ['Offen', 'Abbuchung offen', 'Mahnung', '2. Mahnung', '3. Mahnung', 'Beleg fehlt aber bez.', 'Bezahlt'],
  ausgang: ['Offen', 'Mahnung', '2. Mahnung', '3. Mahnung', 'Zu viel bez.', 'Bezahlt', 'storniert']
};
// eigene Schreibweisen aus der Excel übernehmen (z. B. „3. Mahnung“), sonst die feste Liste
const stListe = dir => { const s = new Set(ST_LISTE[dir]); S.rechnungen.forEach(r => { if (r.richtung === dir && r.status_excel) s.add(r.status_excel); }); return [...s]; };
const stNorm = (v, dir) => { const t = String(v || '').trim(); if (!t) return null; const hit = ST_LISTE[dir || 'eingang'].concat(ST_LISTE.ausgang).find(x => x.toLowerCase() === t.toLowerCase()); return hit || t; };
const istBezahltLaut = s => /^(bezahlt|beleg fehlt|zu viel)/i.test(String(s || '').trim());
const istStornoLaut = s => /^storn/i.test(String(s || '').trim());
// Farben wie die bedingte Formatierung der Excel-Mappe: Bezahlt grün, Offen rot, Abbuchung offen gelb, Teilw. bezahlt dunkelblau, Rücklastschrift lila, Mahnungen rot/schwarz
const ST_CLS = s => istBezahltLaut(s) ? (/zu viel/i.test(s) ? 'st-warn' : 'st-ok') : /^[23]\.\s*mahn|letzte mahn/i.test(s) ? 'st-bad' : /mahn/i.test(s) ? 'st-late' : istStornoLaut(s) ? 'st-info' : /abbuchung/i.test(s) ? 'st-abb' : /teilw/i.test(s) ? 'st-teil' : /r(ü|ue)cklast/i.test(s) ? 'st-rueck' : /^offen/i.test(s) ? 'st-offen' : 'st-open';
function rStatus(r) {
  // Gutschrift/Korrektur, die mit einer Rechnung verknüpft ist: wird dort verrechnet, ist selbst nichts mehr offen
  const orig = r.bezug_id && (+r.brutto || 0) < 0 ? S.rechnungen.find(x => x.id === r.bezug_id) : null;
  if (orig) return { key: 'verrechnet', label: 'Verrechnet', cls: 'st-ok', hint: ['mit ' + (orig.nummer || 'Rechnung') + ' verrechnet', 'st-ok'], bezahlt: 0, offen: 0, zahlungen: [], gutschriften: [], bezug: orig };
  const gs = (IDX.gsByR && IDX.gsByR.get(r.id) || []).filter(g => (+g.brutto || 0) < 0), gut = sum(gs, g => Math.abs(sollOf(g)));
  const zs = IDX.zByR.get(r.id) || [], paid = r2(sum(zs, z => z.betrag) + gut), brutto = sollOf(r), diff = r2(brutto - paid), hatZ = zs.length || gs.length;
  const stx = r.status_excel || '', laut = istBezahltLaut(stx) || (!stx && r.bezahlt_extern);
  let key, erkl = null;   // erkl = Abweichung ist erklärt (Cent-Differenz, Notiz, Liste) → kein Problem
  if (r.erledigt || istStornoLaut(stx)) key = isStorno(r) || istStornoLaut(stx) ? 'storno' : 'erledigt';
  else if (!hatZ && laut) key = 'extern';   // laut Liste bezahlt, Zahlung (noch) nicht gefunden
  else if (!hatZ) { const f = faelligAm(r); key = f && f < todayISO() ? 'ueberfaellig' : 'offen'; }
  else if (!zs.length && diff > 0.01) { const f = faelligAm(r); key = f && f < todayISO() ? 'ueberfaellig' : 'offen'; }   // nur teilweise gutgeschrieben, Rest offen
  else if (Math.abs(diff) <= 0.01) key = 'bezahlt';
  else if (Math.abs(diff) <= CENT_TOLERANZ) { key = 'bezahlt'; erkl = ['Cent-Differenz ' + fmtE(-diff), 'st-info']; }
  else if (diff > 0) { key = 'teil'; if (laut) erkl = ['Rest ' + fmtE(diff) + ' laut Liste bezahlt (Zahlung noch nicht gefunden)', 'st-info']; }
  else {
    key = zs.length >= 2 && (zs.filter(z => eq(z.betrag, brutto)).length >= 2 || eq(paid, 2 * brutto)) ? 'doppelt' : 'ueber';
    if (NOTIZ_RUECK.test(r.notiz || '')) erkl = ['Rückzahlung laut Notiz', 'st-info'];
  }
  if (erkl) key = 'bezahlt';
  // Anzeige: der Status aus der Liste; ohne Eintrag ein passender Begriff aus derselben Liste
  const label = stx || ({ bezahlt: 'Bezahlt', extern: 'Bezahlt', erledigt: 'Bezahlt', storno: 'storniert', ueber: 'Zu viel bez.' }[key] || 'Offen');
  // Zusatzhinweis aus dem Abgleich, wenn er etwas anderes sagt als der Status
  let hint = null;
  if (erkl) hint = erkl;
  else if (['ueber', 'doppelt', 'teil'].includes(key) && !(key === 'ueber' && /zu viel/i.test(label))) hint = R_ST[key];
  else if (key === 'ueberfaellig' && !/mahn/i.test(label)) hint = ['überfällig', 'st-late'];
  else if (key === 'bezahlt' && !istBezahltLaut(label)) hint = ['Zahlung gefunden', 'st-ok'];
  if (!hint && gut > 0.005) hint = ['Gutschrift ' + fmtE(gut) + ' verrechnet', 'st-info'];
  return { key, label, cls: ST_CLS(label), hint, erklaert: !!erkl, bezahlt: key === 'extern' ? brutto : paid, offen: key === 'erledigt' || key === 'storno' || key === 'extern' || erkl ? 0 : diff, zahlungen: zs, gutschriften: gs };
}
// Rechnungen mit Nachbarnummer (R26-0764 → R26-0762 … R26-0766)
function nachbarn(r, pool) {
  const m = String(r.nummer || '').match(/^(.*?)(\d+)$/); if (!m) return [];
  const n = +m[2], w = m[2].length, ok = new Set([-2, -1, 1, 2].map(d => normNr(m[1] + String(n + d).padStart(w, '0'))));
  return pool.filter(x => x.id !== r.id && x.nummer && ok.has(normNr(x.nummer)));
}
const CENT_TOLERANZ = 0.10;   // Rundungs-/Cent-Differenzen bis 10 Cent gelten als bezahlt
const NOTIZ_RUECK = /zur(ü|ue)ck|erstatt|r(ü|ue)ck(ü|ue)berw|r(ü|ue)ckzahl|gutgeschrieben|verrechnet/i;   // „Doppelte Bezahlung, also 79,99 € zurück“
// Nach einem Zahlungsfund den Status nachziehen: vollständig bezahlt → „Bezahlt“.
// „Zu viel / zu wenig / doppelt“ bleibt nur ein Hinweis – das entscheidet ihr selbst (oft sind es Tippfehler in der Beschreibung).
async function statusNachziehen(ids) {
  buildIdx(); const jobs = [];
  for (const id of new Set(ids)) {
    const r = S.rechnungen.find(x => x.id === id); if (!r || r.erledigt || istStornoLaut(r.status_excel)) continue;
    const st = rStatus(r), p = {};
    if (st.key === 'bezahlt' && !istBezahltLaut(r.status_excel)) p.status_excel = 'Bezahlt';
    const za = zahlartAusZahlung(r); if (za && za !== r.zahlart) p.zahlart = za;
    if (Object.keys(p).length) jobs.push(() => DB.update('rechnungen', r.id, p));
  }
  for (let i = 0; i < jobs.length; i += 10) await Promise.all(jobs.slice(i, i + 10).map(f => f()));
  return jobs.length;
}
// Zahlart aus der zugeordneten Zahlung: SumUp → EC, Kasse/bar → Bar, Bank → Überweisung (eine SEPA-Lastschrift bleibt SEPA).
// Bei mehreren Zahlungen zählt die mit dem größten Betrag.
function zahlartAusZahlung(r) {
  const zs = IDX.zByR.get(r.id) || []; if (!zs.length) return null;
  const sum = {}; zs.forEach(z => { const a = z.sumup_id ? 'ec' : z.bank_id ? (r.zahlart === 'sepa' ? 'sepa' : 'bank') : 'bar'; sum[a] = (sum[a] || 0) + Math.abs(+z.betrag || 0); });
  return Object.entries(sum).sort((a, b) => b[1] - a[1])[0][0];
}
// Bei allen Rechnungen mit Zahlung die Zahlart angleichen (läuft bei jedem Abgleich mit)
async function zahlartNachziehen() {
  buildIdx(); const l = S.rechnungen.filter(r => { const za = zahlartAusZahlung(r); return za && za !== r.zahlart; });
  for (let i = 0; i < l.length; i += 20) await Promise.all(l.slice(i, i + 20).map(r => DB.update('rechnungen', r.id, { zahlart: zahlartAusZahlung(r) })));
  return l.length;
}
// Verwendungszweck nur für die Anzeige kürzen: SEPA-Kürzel (EREF+, KREF+, MREF+, CRED+, SVWZ+, ABWA+ …) und ihre Kennungen weglassen,
// übrig bleibt der eigentliche Text (z. B. „R26-1794“). Gespeichert und abgeglichen wird weiter mit dem vollen Text.
const SEPA_TAG = /(EREF|KREF|MREF|CRED|SVWZ|ABWA|ABWE|IBAN|BIC|PURP|DEBT|COAM|OAMT|SQTP|BREF|RREF)\+/g;
function zweckKurz(s) {
  const t = String(s || '').replace(/\s+/g, ' ').trim(); if (!SEPA_TAG.test(t)) { SEPA_TAG.lastIndex = 0; return t; } SEPA_TAG.lastIndex = 0;
  const teile = {}; let m, letzter = null, pos = 0; const vor = [];
  while ((m = SEPA_TAG.exec(t))) { const davor = t.slice(pos, m.index); if (letzter) teile[letzter] = (teile[letzter] || '') + davor; else vor.push(davor); letzter = m[1]; pos = m.index + m[0].length; }
  if (letzter) teile[letzter] = (teile[letzter] || '') + t.slice(pos);
  const svwz = (teile.SVWZ || '').trim(), rest = vor.join(' ').trim();
  const out = svwz || rest || (teile.ABWA || '').trim();
  return out.replace(/\bNOTPROVIDED\b/g, '').replace(/\s*SecureGo\s*plus\s*$/i, '').replace(/\s+/g, ' ').trim() || t;
}
// Bankbewegungen, die weder Kosten noch Erlöse sind (Darlehen aufnehmen/tilgen, Vorjahr, Rücklastschrift-Paare, Privat, Umbuchung …)
const bankNeutral = b => ['privat', 'intern', 'ignoriert', 'vorjahr', 'darlehen'].includes(b.art)
  || (!(IDX.zByB.get(b.id) || []).length && ['darlehen', 'vorjahr', 'rueck'].includes(IDX.bArt && IDX.bArt.get(b.id)));
/* Erstattung der Krankenkasse nach AAG (U1 Lohnfortzahlung, U2 Mutterschaft) mindert die Personalkosten */
const KK_RX = /\bikk\b|\baok\b|\bbkk\b|barmer|techniker\s*kranken|\btk\b|\bdak\b|\bkkh\b|\bhkk\b|knappschaft|minijob|krankenkasse|kranken\s*kasse|krankenversicherung|sozialversicherung|svlfg|ersatzkasse/i;
const AAG_RX = /\baag\b|\bu\s?[12]\b|umlage|lohnfortzahl|entgeltfortzahl|mutterschaft|mutterschutz|erstatt/i;
const personalErstattung = b => b.betrag > 0 && !b.art && !(IDX.zByB.get(b.id) || []).length && KK_RX.test(b.gegenpartei || '') && AAG_RX.test(b.zweck || '') && !RUECK_RX.test(b.zweck || '');
const zRichtung = z => { const r = (IDX.rById && IDX.rById.get(z.rechnung_id)) || S.rechnungen.find(x => x.id === z.rechnung_id); return r && r.richtung === 'eingang' ? -1 : 1; };
const zFluss = z => zRichtung(z) * (+z.betrag || 0);   // + = Geld kommt rein, − = Geld geht raus
const B_ST = {
  offen: ['Nicht zugeordnet', 'st-open'], zugeordnet: ['Zugeordnet', 'st-ok'], teilweise: ['Teilweise zugeordnet', 'st-warn'], sumup: ['SumUp-Auszahlung', 'st-info'],
  privat: ['Privat', 'st-info'], intern: ['Umbuchung', 'st-info'], ignoriert: ['Ignoriert', 'st-info'], vorjahr: ['Gehört zu 2025', 'st-info'], darlehen: ['Darlehen / Tilgung', 'st-info'], kosten: ['Kosten ohne Beleg', 'st-info']
};
function bStatus(b) {
  // Verrechnung: eine Buchung kann Rechnungen UND Gutschriften abdecken (z. B. Altteile-Gutschriften minus Rechnungen).
  // Geldfluss je Zuordnung: Ausgangsrechnung + / Eingangsrechnung − (Gutschrift mit negativem Betrag dreht das Vorzeichen)
  const zs = IDX.zByB.get(b.id) || [], used = r2(Math.sign(b.betrag || 1) * sum(zs, z => zFluss(z))), rest = r2(Math.abs(b.betrag) - used);
  let key;
  const auto = !zs.length && !b.art && IDX.bArt && IDX.bArt.get(b.id);
  if (b.art && B_ST[b.art] && !zs.length) key = b.art;
  else if (auto && !(b.betrag < 0 && b.kostenart && auto !== 'rueck')) return { key: 'auto', auto, label: B_AUTO[auto][0], cls: B_AUTO[auto][1], rest: Math.max(0, rest), zuordnungen: zs };
  else if (!zs.length) key = b.betrag < 0 && b.kostenart ? 'kosten' : 'offen';
  else key = rest <= 0.01 ? 'zugeordnet' : 'teilweise';
  return { key, label: B_ST[key][0], cls: B_ST[key][1], rest: Math.max(0, rest), zuordnungen: zs };
}
function sStatus(s) {
  if (!sumOk(s)) return { key: 'fehl', label: s.status || 'Fehlgeschlagen', cls: 'st-info', rest: 0, zuordnungen: [] };
  const zs = IDX.zByS.get(s.id) || [], used = sum(zs, z => z.betrag), rest = r2(Math.abs(s.betrag) - used);
  if (!zs.length) return { key: 'offen', label: 'Keiner Rechnung zugeordnet', cls: 'st-open', rest, zuordnungen: zs };
  return rest <= 0.01 ? { key: 'zugeordnet', label: 'Zugeordnet', cls: 'st-ok', rest: 0, zuordnungen: zs } : { key: 'teilweise', label: 'Teilweise zugeordnet', cls: 'st-warn', rest, zuordnungen: zs };
}

function kStatus(k) {
  const zs = IDX.zByK.get(k.id) || [], used = sum(zs, z => z.betrag), rest = r2(Math.abs(k.betrag) - used);
  if (!zs.length && k.betrag > 0 && /^\s*R\s?25\s?[-\/]/i.test(k.text || '')) return { key: 'intern', label: 'Gehört zu 2025', cls: 'st-info', rest: 0, zuordnungen: zs };   // Vorjahr – nicht Teil dieser Software
  if (!zs.length && /umbuchung|privat|ignor/i.test(k.kostenart || '')) return { key: 'intern', label: /umbuchung/i.test(k.kostenart) ? 'Umbuchung Kasse → Bank' : k.kostenart, cls: 'st-info', rest: 0, zuordnungen: zs };   // per Regel eingeordnet
  if (!zs.length) return { key: 'offen', label: k.betrag < 0 && k.kostenart ? 'Kosten ohne Beleg' : 'Ohne Beleg', cls: k.betrag < 0 && k.kostenart ? 'st-info' : 'st-open', rest, zuordnungen: zs };
  return rest <= 0.01 ? { key: 'zugeordnet', label: 'Zugeordnet', cls: 'st-ok', rest: 0, zuordnungen: zs } : { key: 'teilweise', label: 'Teilweise', cls: 'st-warn', rest, zuordnungen: zs };
}

/* ---------- Trefferbewertung: passt Zahlung (Text, Name, IBAN, Betrag, Datum) zu Rechnung? ---------- */
// Text einmal vorbereiten (schneller bei tausenden Rechnungen)
const prepText = text => { const T = String(text || '').toUpperCase(); return { flat: T.replace(/[^A-Z0-9]/g, ''), toks: new Set(T.split(/[^A-Z0-9]+/).filter(Boolean)), raw: text }; };
const NT_CACHE = new Map();
const nameTok = s => { s = s || ''; let v = NT_CACHE.get(s); if (!v) { v = nameTokens(s); NT_CACHE.set(s, v); } return v; };
// Kurzformen ausschreiben: „r26/0491 0490“ → R26-0491 R26-0490 · „r26-1143-1131-1102“ → drei Nummern · „r26/0625+0619“ → zwei
function expandNr(text) {
  const t = String(text || ''), add = [], re = /[a-z]?\s*(\d{2})\s*[\/\-.]\s*(\d{3,5})((?:\s*[+,&\/\-\s]\s*\d{3,4}\b)*)/gi; let m;
  // dreistellig („r26/114“) → vierstellig (R26-0114); fünfstellig bleibt (ist dann ein Tippfehler und passt zu nichts)
  while ((m = re.exec(t))) { add.push('R' + m[1] + '-' + String(+m[2]).padStart(4, '0')); /* „r26/00865“ = R26-0865 */ (m[3].match(/\d{3,4}/g) || []).forEach(n => add.push('R' + m[1] + '-' + n.padStart(4, '0'))); }
  return add.length ? t + ' · ' + add.join(' · ') : t;
}
const siehtWieNummerAus = text => /\b[a-z]?\s*\d{2}\s*[\/\-.]\s*\d{3,5}\b/i.test(String(text || ''));
// Tippfehler im Jahr/Kürzel („r25/0505“, „r27/1064“, „d26/1642“): nur die laufende Nummer vergleichen – zugeordnet wird nur bei exakt gleichem Betrag
const laufNr = text => new Set([...String(text || '').matchAll(/\d{2}\s*[\/\-.]\s*(\d{3,5})\b/g)].map(m => String(+m[1]).padStart(4, '0')));
const nrEnde = nummer => { const m = String(nummer || '').match(/(\d{3,4})\s*$/); return m ? m[1].padStart(4, '0') : null; };
// enthält – aber nicht als Teil einer längeren Zahl („R26-00865“ ist nicht R26-0086)
function hatGrenze(hay, s, auchVorne) {
  for (let i = hay.indexOf(s); i >= 0; i = hay.indexOf(s, i + 1)) {
    const a = hay[i - 1], b = hay[i + s.length];
    if (!(b && /\d/.test(b)) && !(auchVorne && a && /\d/.test(a))) return true;
  }
  return false;
}
function nrHit(nummer, text) {
  const nr = normNr(nummer); if (!nr || nr.length < 3) return false;
  const P = typeof text === 'object' && text ? text : prepText(expandNr(text)), flat = P.flat, toks = P.toks;
  if (toks.has(nr)) return true;
  if (nr.length >= 5 && hatGrenze(flat, nr, false)) return true;
  const dig = String(nummer).replace(/\D/g, '');
  if (dig.length >= 5 && hatGrenze(flat, dig, true) && !/^0+$/.test(dig)) return true;
  if (dig.length === 4 && toks.has(dig) && /[A-Z]/.test(nr)) return true; // „RE-1234“ → „Rechnung 1234“
  return false;
}
function nameHit(partner, text) {
  const a = nameTok(partner); if (!a.length) return false;
  const b = text instanceof Set ? text : new Set(nameTok(text)); return a.some(w => b.has(w));
}
// Bewertet eine Zahlung (Bank/SumUp) gegen eine Rechnung; höher = besser
function score(pay, r, restPay, restR) {
  const text = (pay.zweck || pay.beschreibung || pay.text || '') + ' ' + (pay.gegenpartei || '');
  let s = 0; const why = [];
  if (r.nummer && nrHit(r.nummer, text)) { s += 60; why.push('Rechnungsnr. im Text'); }
  if (r.kennzeichen && normNr(text).includes(normNr(r.kennzeichen)) && normNr(r.kennzeichen).length >= 4) { s += 20; why.push('Kennzeichen'); }
  if (partnerPasst(r, pay)) { s += 25; why.push('Name'); }
  if (r.iban && pay.iban && normNr(r.iban) === normNr(pay.iban)) { s += 30; why.push('IBAN'); }
  if (eq(restPay, restR) && restR > 0.005) { s += 30; why.push('Betrag = offener Betrag'); }
  else if (eq(restPay, r.brutto)) { s += 20; why.push('Betrag = Rechnungsbetrag'); }
  if (r.datum && pay.datum) { const d = daysBetween(r.datum, pay.datum); if (d < -5) s -= 30; else if (d <= 45) s += 5; else if (d > 200) s -= 15; }
  return { s, why };
}
// Vorschläge für eine Zahlung (für das manuelle Zuordnen)
function vorschlaege(pay, kind) {
  buildIdx();
  const richtung = kind === 'sumup' ? 'ausgang' : (pay.betrag >= 0 ? 'ausgang' : 'eingang');
  const restPay = kind === 'bank' ? bStatus(pay).rest : kind === 'kasse' ? kStatus(pay).rest : sStatus(pay).rest;
  const l = S.rechnungen.filter(r => r.richtung === richtung).map(r => { const st = rStatus(r); const sc = score(pay, r, restPay, st.offen); return { r, st, ...sc }; })
    .filter(x => x.s >= 25).sort((a, b) => b.s - a.s).slice(0, 8);
  // Belege, deren Nummer im Verwendungszweck steht – auch Gutschriften und Rechnungen der Gegenrichtung (Verrechnung) – immer zuerst
  const imZweck = belegeImZweck(pay).filter(r => !l.some(x => x.r.id === r.id)).map(r => ({ r, st: rStatus(r), s: 95, why: ['Nr. im Verwendungszweck'], imZweck: true }));
  return [...imZweck, ...l];
}
// Rechnungen/Gutschriften, deren Nummer (mind. 5 Zeichen) im Verwendungszweck vorkommt
function belegeImZweck(pay) {
  const z = String(pay.zweck || '').toUpperCase(); if (!z.trim()) return [];
  // Verzeichnis Nummer → Belege (einmal je Datenstand): reine Ziffern ohne führende Nullen bzw. Buchstaben+Ziffern zusammengeschrieben
  if (!IDX.nrIdx || IDX.nrIdxN !== S.rechnungen.length) {
    const m = new Map(); S.rechnungen.forEach(r => { if (DOK_ARTEN.includes(r.art)) return; let n = String(r.nummer || '').toUpperCase().replace(/[^A-Z0-9]+/g, '');
      if (/^\d+$/.test(n)) n = n.replace(/^0+/, ''); if (n.length < 5) return; (m.get(n) || m.set(n, []).get(n)).push(r); });
    IDX.nrIdx = m; IDX.nrIdxN = S.rechnungen.length;
  }
  const keys = new Set();
  (z.match(/\d{5,}/g) || []).forEach(d => keys.add(d.replace(/^0+/, '')));   // „001263015679“ = 1263015679, nicht Teil einer längeren Zahl
  (z.replace(/[^A-Z0-9]+/g, '').match(/[A-Z]{1,4}\d{4,}/g) || []).forEach(k => { for (let i = 5; i <= k.length; i++) keys.add(k.slice(0, i)); });   // „R26-0628“ → R260628
  const out = new Set(); keys.forEach(k => (IDX.nrIdx.get(k) || []).forEach(r => out.add(r)));
  // Buchstaben-Nummern: keine weitere Ziffer direkt dahinter (R26-0628 ≠ R26-06281)
  const zz = z.replace(/[^A-Z0-9]+/g, '');
  return [...out].filter(r => { const n = String(r.nummer || '').toUpperCase().replace(/[^A-Z0-9]+/g, ''); return /^\d+$/.test(n) || new RegExp(n + '(\\D|$)').test(zz); });
}

/* ---------- Automatischer Abgleich ---------- */
async function autoAbgleich() {
  if (typeof regelnAnwenden === 'function') await regelnAnwenden().catch(e => console.warn(e));
  if (typeof dlpNachziehen === 'function') await dlpNachziehen().catch(e => console.warn(e));   // TÜV/DEKRA: durchlaufender Posten
  if (typeof fixNachziehen === 'function') await fixNachziehen().catch(e => console.warn(e));   // fehlendes „variabel / fix“ ergänzen   // eigene Regeln zuerst (z. B. Bareinzahlungen = Umbuchung)
  // Zahlungsavise zuerst: sie sagen genau, welche Rechnungen in einer Sammel-Lastschrift stecken
  if (typeof avisAbgleich === 'function') await avisAbgleich().catch(e => console.warn(e));
  const nAvis = await avisZuordnen().catch(e => { console.warn(e); return 0; });
  buildIdx();
  // Rücklastschrift: Abbuchung kam zurück und wurde später neu bezahlt → die Rechnung hängt an der neuen Zahlung, nicht an der zurückgegebenen
  let nRueck = 0;
  for (const rt of S.bank.filter(b => b.betrag > 0 && RUECK_RX.test(bZweck(b)))) {
    const tk = nameTokens(rt.gegenpartei || '')[0] || '', passt = b => !tk || norm(bZweck(b)).includes(tk);
    const d = S.bank.find(b => b.betrag < 0 && eq(-b.betrag, rt.betrag) && daysBetween(b.datum, rt.datum) >= 0 && daysBetween(b.datum, rt.datum) <= 14 && (IDX.zByB.get(b.id) || []).length && passt(b));
    if (!d) continue;
    const n = S.bank.filter(b => b.betrag < 0 && b.id !== d.id && eq(b.betrag, d.betrag) && daysBetween(rt.datum, b.datum) >= 0 && daysBetween(rt.datum, b.datum) <= 60 && !b.art && !(IDX.zByB.get(b.id) || []).length && IDX.bArt.get(b.id) !== 'rueck' && passt(b)).sort((a, b) => a.datum.localeCompare(b.datum))[0];
    if (!n) continue;
    for (const z of IDX.zByB.get(d.id)) await DB.update('zuordnungen', z.id, { bank_id: n.id, datum: n.datum, notiz: [z.notiz, 'nach Rücklastschrift neu bezahlt am ' + fmtD(n.datum)].filter(Boolean).join(' · ') });
    nRueck++; buildIdx();
  }
  // Rückzahlung an einen Kunden (Doppel-/Überzahlung) erklärt dessen „zu viel bezahlt“
  for (const b of S.bank.filter(b => IDX.bArt.get(b.id) === 'rueckzahlung')) {
    const c = S.rechnungen.filter(r => r.richtung === 'ausgang' && !NOTIZ_RUECK.test(r.notiz || '') && partnerPasst(r, b) && ['ueber', 'doppelt'].includes(rStatus(r).key) && Math.abs(-rStatus(r).offen - Math.abs(b.betrag)) <= CENT_TOLERANZ);
    if (c.length === 1) await DB.update('rechnungen', c[0].id, { notiz: [c[0].notiz, 'Rückzahlung ' + fmtE(Math.abs(b.betrag)) + ' am ' + fmtD(b.datum) + ' überwiesen'].filter(Boolean).join(' · ') });
  }
  partnerLernen();
  const newZ = [], extraR = new Map(), extraP = new Map();
  // offener Betrag nur aus echten Zahlungen (auch „laut Liste bezahlt“ darf noch seine Zahlung finden)
  const paidR = new Map(); S.zuordnungen.forEach(z => paidR.set(z.rechnung_id, (paidR.get(z.rechnung_id) || 0) + (+z.betrag || 0)));
  // verknüpfte Gutschriften/Korrekturen mindern, was noch zu zahlen ist
  const gutR = new Map(); S.rechnungen.forEach(g => { if (g.bezug_id && (+g.brutto || 0) < 0) gutR.set(g.bezug_id, (gutR.get(g.bezug_id) || 0) + Math.abs(sollOf(g))); });
  const restR = r => r2(sollOf(r) - (paidR.get(r.id) || 0) - (extraR.get(r.id) || 0) - (gutR.get(r.id) || 0));
  // für Summen-Treffer nur Rechnungen ohne jede Zahlung (Rest-Beträge wie 15,48 € ergeben sonst Zufallssummen)
  const unberuehrt = r => !(paidR.get(r.id) > 0.005) && !(extraR.get(r.id) > 0.005);
  // Rechnung höchstens 5 Tage nach und höchstens 60 Tage vor der Zahlung
  const imFenster = (r, pay) => !r.datum || !pay.datum || (daysBetween(r.datum, pay.datum) >= -5 && daysBetween(r.datum, pay.datum) <= 60);
  // noch keiner Rechnung zugeordnete Gutschriften (Einnahmen) – können in einer Sammel-Lastschrift abgezogen sein
  const gutFrei = S.rechnungen.filter(g => g.richtung === 'eingang' && !g.bezug_id && (+g.brutto || 0) < 0 && g.nummer && !DOK_ARTEN.includes(g.art));
  const gutLinks = [];
  const add = (r, pay, kind, betrag, why) => {
    betrag = r2(betrag); if (betrag <= 0.005) return;
    newZ.push({ rechnung_id: r.id, bank_id: kind === 'bank' ? pay.id : null, sumup_id: kind === 'sumup' ? pay.id : null, kasse_id: kind === 'kasse' ? pay.id : null, betrag, art: 'auto', datum: pay.datum, notiz: why });
    extraR.set(r.id, (extraR.get(r.id) || 0) + betrag); extraP.set(pay.id, (extraP.get(pay.id) || 0) + betrag);
  };
  const restP = (id, rest) => r2(rest - (extraP.get(id) || 0));   // was von einer Zahlung in diesem Lauf noch übrig ist
  const ausg = S.rechnungen.filter(r => r.richtung === 'ausgang' && !r.erledigt && sollOf(r) > 0);
  const eing = S.rechnungen.filter(r => r.richtung === 'eingang' && !r.erledigt && sollOf(r) > 0);

  // 0) Hinweise aus der Spalte „Notizen“ zuerst: „bezahlt unter 0325“, „falsch auf Nr 26-0062“, „08.01.2026 um 16:27 bezahlt“
  //    Zugeordnet wird nur, wenn der Betrag genau passt.
  const zahlungen = () => [
    ...S.bank.filter(b => !b.art && b.betrag > 0).map(b => ({ p: b, kind: 'bank', text: b.zweck || '', rest: restP(b.id, bStatus(b).rest) })),
    ...S.sumup.filter(s => sumOk(s) && s.betrag > 0).map(s => ({ p: s, kind: 'sumup', text: s.beschreibung || '', rest: restP(s.id, sStatus(s).rest) })),
    ...S.kasse.filter(k => k.betrag > 0).map(k => ({ p: k, kind: 'kasse', text: k.text || '', rest: restP(k.id, kStatus(k).rest) }))
  ].filter(x => x.rest > 0.005);
  const nrSchluessel = text => { const s = new Set(), t = expandNr(text);
    (t.match(/R(\d{2})-(\d{3,5})/g) || []).forEach(x => { const [, yy, n] = x.match(/R(\d{2})-(\d{3,5})/); s.add(yy + n.padStart(4, '0')); s.add(n.padStart(4, '0')); });
    (String(text).match(/\b\d{3,5}\b/g) || []).forEach(n => s.add(n.padStart(4, '0')));
    return s; };
  const mitNotiz = ausg.filter(r => r.notiz && restR(r) > 0.005);
  if (mitNotiz.length) {
    const Z = zahlungen().map(x => ({ ...x, keys: nrSchluessel(x.text) }));
    for (const r of mitNotiz) {
      const n = String(r.notiz);
      // a) andere Nummer: „unter / als / auf / mit (Nr.) 26-0062 | 0325 | 288“
      const alias = [...n.matchAll(/(?:unter|als|auf|mit)\s+(?:der\s+)?(?:re\.?|rg\.?|rechnung)?\s*(?:nr\.?|nummer)?\s*([a-z]?\s*\d{2}\s*[\/\-.]\s*\d{3,5}|\d{3,5})\b/gi)].map(m => {
        const a = m[1].match(/(\d{2})\s*[\/\-.]\s*(\d{3,5})/); return a ? a[1] + a[2].padStart(4, '0') : m[1].replace(/\D/g, '').padStart(4, '0'); });
      let hit = null;
      if (alias.length) { const c = Z.filter(x => x.rest > 0.005 && alias.some(a => x.keys.has(a)) && eq(x.rest, restR(r))); if (c.length === 1) hit = [c[0], 'Notiz: „' + n.slice(0, 40) + '“']; }
      // b) Zahltag: „bezahlt am 21.01.2026“, „08.01.2026 um 16:27 bezahlt“
      if (!hit && /bezahlt|gezahlt|überwiesen|ueberwiesen/i.test(n)) {
        const d = n.match(/(\d{1,2})\.(\d{1,2})\.?(\d{4}|\d{2}(?!:))?/);   // „11.04“, „11.04.“, „11.04.2026“ (nicht die Uhrzeit „14:56“)
        if (d) {
          let y = d[3] ? +d[3] : +(r.datum || todayISO()).slice(0, 4); if (y < 100) y += 2000;
          const tag = `${y}-${d[2].padStart(2, '0')}-${d[1].padStart(2, '0')}`, fenster = r.zahlart === 'ec' ? 0 : 3;
          const c = Z.filter(x => x.rest > 0.005 && eq(x.rest, restR(r)) && Math.abs(daysBetween(x.p.datum, tag)) <= fenster && (r.zahlart !== 'ec' || x.kind === 'sumup'));
          if (c.length === 1) hit = [c[0], 'Notiz: „' + n.slice(0, 40) + '“'];
        }
      }
      if (hit) { add(r, hit[0].p, hit[0].kind, hit[0].rest, hit[1]); hit[0].rest = 0; }
    }
  }

  // Welche offenen Rechnungen ergeben zusammen genau den Zahlbetrag? (älteste zuerst, höchstens 5 Rechnungen)
  // nahAm: Datum der Zahlung → die Rechnungen mit dem nächstliegenden Datum zuerst (bei gleichen Beträgen, z. B. Beitragsbescheide)
  const teilsumme = (list, ziel, max = 5, nahAm = null) => {
    const dd = r => r.datum && nahAm ? Math.abs(daysBetween(r.datum, nahAm)) : 0;
    const L = list.filter(r => restR(r) > 0.005).sort((a, b) => (nahAm ? (istBezahltLaut(b.status_excel) - istBezahltLaut(a.status_excel)) || dd(a) - dd(b) : 0) || (a.datum || '').localeCompare(b.datum || '')).slice(0, 16); let best = null;
    const rec = (i, acc, pick) => { if (best) return; if (pick.length && eq(acc, ziel)) { best = pick.slice(); return; }
      if (pick.length >= max || i >= L.length || acc > ziel + 0.01) return;
      pick.push(L[i]); rec(i + 1, acc + restR(L[i]), pick); pick.pop(); rec(i + 1, acc, pick); };
    rec(0, 0, []); return best;
  };
  const skontoUpd = [];
  function matchPay(pay, kind, pool, restPay, amountOnlyOk = false) {
    const text = (pay.zweck || pay.beschreibung || pay.text || '') + ' ' + (pay.gegenpartei || '');
    const P = prepText(expandNr(text)), NS = new Set(nameTok(text));
    // 1) Rechnungsnummer(n) im Verwendungszweck – auch wenn schon bezahlt (→ doppelt/überzahlt wird sichtbar)
    const byNr = pool.filter(r => r.nummer && nrHit(r.nummer, P));
    // Sammel-Lastschrift „RNR 398565, RNR 713218“: Rechnung(en) minus Gutschrift(en) = abgebuchter Betrag
    if (kind === 'bank' && pay.betrag < 0 && byNr.length) {
      const gs = gutFrei.filter(g => !gutLinks.some(l => l.g === g) && nrHit(g.nummer, P));
      const open = byNr.filter(r => restR(r) > 0.005);
      if (gs.length && open.length && eq(r2(sum(open, restR) - sum(gs, g => Math.abs(sollOf(g)))), restPay)) {
        const ziel = open.slice().sort((a, b) => restR(b) - restR(a))[0];
        gs.forEach(g => { gutLinks.push({ g, r: ziel }); gutR.set(ziel.id, (gutR.get(ziel.id) || 0) + Math.abs(sollOf(g))); });
        open.forEach(r => add(r, pay, kind, restR(r), 'Sammel-Lastschrift, Gutschrift ' + gs.map(g => g.nummer).join(', ') + ' abgezogen'));
        return true;
      }
    }
    if (byNr.length === 1) {
      // Betrag passt nicht, aber die Nachbarnummer (±1/±2) hat genau diesen Betrag offen und ein ähnliches Datum → Zahlendreher/Vertipper
      const r0 = byNr[0];
      if (!eq(restR(r0), restPay)) {
        const nb = nachbarn(r0, pool).filter(r => eq(restR(r), restPay) && (!r.datum || !pay.datum || Math.abs(daysBetween(r.datum, pay.datum)) <= 7));
        if (nb.length === 1) { add(nb[0], pay, kind, restPay, `Nummer vertippt (${r0.nummer} statt ${nb[0].nummer}), Betrag passt`); return true; }
      }
      add(r0, pay, kind, restPay, 'Rechnungsnummer im Text'); return true;
    }
    if (byNr.length > 1) {
      // mehrere Nummern-Treffer: zuerst der, bei dem auch Name bzw. Betrag passt (zufällige Ziffernfolgen, z. B. in Mandats-IDs, aussortieren)
      const nb = byNr.filter(r => partnerPasst(r, pay, NS) && eq(restR(r), restPay));
      if (nb.length === 1) { add(nb[0], pay, kind, restPay, 'Rechnungsnummer, Name und Betrag'); return true; }
      const nn = byNr.filter(r => partnerPasst(r, pay, NS));
      if (nn.length === 1 && restR(nn[0]) > 0.005) { add(nn[0], pay, kind, restPay, 'Rechnungsnummer und Name'); return true; }
      const open = byNr.filter(r => restR(r) > 0.005), tot = sum(open, restR);
      if (open.length && eq(tot, restPay)) { open.forEach(r => add(r, pay, kind, restR(r), 'Sammelzahlung (mehrere Rechnungsnummern)')); return true; }
      // dieselbe Nummer bei mehreren Belegen (z. B. Beitragsbescheid + Nachtrag): genau einer oder ein Teil davon ergibt den Betrag
      const ex = open.filter(r => eq(restR(r), restPay));
      if (ex.length === 1) { add(ex[0], pay, kind, restPay, 'Rechnungsnummer und Betrag'); return true; }
      const ts = !ex.length && teilsumme(open, restPay);
      if (ts) { ts.forEach(r => add(r, pay, kind, restR(r), 'Sammelzahlung (Rechnungsnummer, Summe)')); return true; }
      return false; // unklar → von Hand
    }
    const openPool = pool.filter(r => restR(r) > 0.005 && !(r.datum && pay.datum && daysBetween(r.datum, pay.datum) < -5));
    // 2) Name/IBAN + genau der offene Betrag
    const named = openPool.filter(r => partnerPasst(r, pay, NS) || (r.iban && pay.iban && normNr(r.iban) === normNr(pay.iban)));
    const nAmt = named.filter(r => eq(restR(r), restPay));
    if (nAmt.length === 1) { add(nAmt[0], pay, kind, restPay, 'Name/IBAN und Betrag'); return true; }
    // gleicher Betrag jeden Monat (Beiträge, Miete …): die Rechnung mit dem nächstliegenden Datum
    if (nAmt.length > 1) { const dd = r => r.datum && pay.datum ? Math.abs(daysBetween(r.datum, pay.datum)) : 999; nAmt.sort((a, b) => dd(a) - dd(b) || (a.datum || '').localeCompare(b.datum || '')); add(nAmt[0], pay, kind, restPay, 'Name/IBAN und Betrag (nächstes Datum)'); return true; }
    // 3) Name + Summe aller offenen Rechnungen dieses Partners – oder eines Teils davon (Sammel-Lastschrift über mehrere Rechnungen)
    const namedS = named.filter(r => unberuehrt(r) && imFenster(r, pay));
    if (namedS.length > 1 && eq(sum(namedS, restR), restPay)) { namedS.forEach(r => add(r, pay, kind, restR(r), 'Sammelzahlung (Name, Summe)')); return true; }
    if (namedS.length > 1) { const ts = teilsumme(namedS, restPay, 5, pay.datum);if (ts && ts.length > 1) { ts.forEach(r => add(r, pay, kind, restR(r), 'Sammelzahlung (Name, Summe von ' + ts.length + ' Rechnungen)')); return true; } }
    // 3b) Abbuchung/Überweisung mit Skonto (2 % oder 3 % abgezogen): Skonto an der Rechnung eintragen
    if (kind === 'bank' && pay.betrag < 0) {
      const sk = named.filter(r => [0.02, 0.03].some(p => Math.abs(restR(r) * (1 - p) - restPay) <= 0.02));
      if (sk.length === 1) { const r = sk[0], s = r2(restR(r) - restPay); skontoUpd.push([r, s]); add(r, pay, kind, restPay, 'Name und Betrag mit Skonto (' + fmtE(s) + ' abgezogen)'); return true; }
    }
    // 4) Nur Betrag – nur wenn eindeutig (genau eine offene Rechnung mit diesem Betrag)
    const amt = openPool.filter(r => eq(restR(r), restPay) && (!r.datum || !pay.datum || daysBetween(r.datum, pay.datum) <= 90));
    if (amt.length === 1 && amountOnlyOk) { add(amt[0], pay, kind, restPay, 'Nur Betrag (eindeutig) – bitte prüfen'); return true; }
    return false;
  }

  // Bank: Eingänge → Ausgangsrechnungen, Abgänge → Eingangsrechnungen
  const bankOpen = S.bank.filter(b => !b.art && IDX.bArt.get(b.id) !== 'rueck').map(b => ({ b, rest: restP(b.id, bStatus(b).rest) })).filter(x => x.rest > 0.005).sort((a, b) => a.b.datum.localeCompare(b.b.datum));
  // Nur-Betrag-Treffer nur, wenn auch der Betrag bei den Bankumsätzen eindeutig ist
  const amtCount = {}; bankOpen.forEach(x => { const k = Math.sign(x.b.betrag) + ':' + x.rest.toFixed(2); amtCount[k] = (amtCount[k] || 0) + 1; });
  for (const { b, rest } of bankOpen) {
    matchPay(b, 'bank', b.betrag > 0 ? ausg : eing, rest, amtCount[Math.sign(b.betrag) + ':' + rest.toFixed(2)] === 1);
  }
  // SumUp: Kartenzahlungen → Ausgangsrechnungen (Nummer in Beschreibung, sonst Betrag ±7 Tage, EC bevorzugt)
  for (const s of S.sumup.filter(sumOk)) {
    const rest = restP(s.id, sStatus(s).rest); if (rest <= 0.005 || s.betrag <= 0) continue;
    if (matchPay({ ...s, zweck: s.beschreibung }, 'sumup', ausg, rest)) continue;
    if (siehtWieNummerAus(s.beschreibung)) {   // Nummer angegeben, aber keine passende Rechnung → Tippfehler im Jahr? sonst lieber von Hand
      const ln = laufNr(s.beschreibung), c = ausg.filter(r => ln.has(nrEnde(r.nummer)) && eq(restR(r), rest));
      if (c.length === 1) add(c[0], s, 'sumup', rest, 'Nummer mit Tippfehler, Betrag passt');
      continue;
    }
    const c = ausg.filter(r => restR(r) > 0.005 && eq(restR(r), rest) && r.zahlart !== 'bar' && r.zahlart !== 'bank' && (!r.datum || Math.abs(daysBetween(r.datum, s.datum)) <= 7));
    const ec = c.filter(r => r.zahlart === 'ec'), pick = ec.length === 1 ? ec[0] : c.length === 1 ? c[0] : (c.filter(r => r.datum === s.datum).length === 1 ? c.find(r => r.datum === s.datum) : null);
    if (pick) add(pick, s, 'sumup', rest, 'SumUp: Betrag und Datum');
  }
  // Kassenbuch: Bar-Einnahmen → Kundenrechnungen (Rechnungsnr. im Text, z. B. „R26-0048“), Bar-Ausgaben → Eingangsbelege
  // Doppelte Kassenzeilen (gleiches Datum, Betrag, Beleg-Nr. und Text – z. B. der doppelte Januar-Block) zählen nur einmal als Zahlung
  const kSig = k => [k.datum, r2(k.betrag), k.belegnr || '', norm(k.text || '')].join('|');
  const kSigBelegt = new Set(S.kasse.filter(k => (IDX.zByK.get(k.id) || []).length).map(kSig));
  for (const k of S.kasse) {
    const rest = restP(k.id, kStatus(k).rest); if (rest <= 0.005) continue;
    if (kSigBelegt.has(kSig(k))) continue;
    const pool = k.betrag > 0 ? ausg : eing;
    const vorher = newZ.length;
    if (matchPay(k, 'kasse', pool, rest)) { if (newZ.length > vorher) kSigBelegt.add(kSig(k)); continue; }
    if (siehtWieNummerAus(k.text)) {   // z. B. „R25-0010“: nur dieselbe laufende Nummer mit exakt gleichem Betrag, nie eine fremde Rechnung
      const ln = laufNr(k.text), c = pool.filter(r => ln.has(nrEnde(r.nummer)) && eq(restR(r), rest));
      if (c.length === 1) { add(c[0], k, 'kasse', rest, 'Nummer mit Tippfehler, Betrag passt'); kSigBelegt.add(kSig(k)); }
      continue;
    }
    // Bar-Beleg gleichen Betrags ±3 Tage (bevorzugt Zahlart bar)
    const c = pool.filter(r => restR(r) > 0.005 && eq(restR(r), rest) && r.datum && Math.abs(daysBetween(r.datum, k.datum)) <= 3);
    const bar = c.filter(r => r.zahlart === 'bar'), pick = bar.length === 1 ? bar[0] : c.length === 1 ? c[0] : null;
    if (pick) { add(pick, k, 'kasse', rest, 'Kasse: Betrag und Datum'); kSigBelegt.add(kSig(k)); }
  }

  // 5) Sammelzahlung, die bisher an nur EINER Rechnung hängt (z. B. BGHM: eine Abbuchung für zwei Bescheide → eine „zu viel bezahlt“, die andere „offen“)
  //    Überschuss = genau die offenen Rechnungen derselben Firma → aufteilen
  const zUpd = [];
  for (const r of S.rechnungen) {
    const zs = (IDX.zByR.get(r.id) || []).filter(z => z.bank_id); if (zs.length !== 1 || r.erledigt) continue;
    const z = zs[0], ueber = r2(-restR(r)); if (ueber <= CENT_TOLERANZ) continue;
    const b = S.bank.find(x => x.id === z.bank_id); if (!b) continue;
    if (Math.abs(z.betrag - Math.abs(b.betrag)) > 0.01) continue;   // nur wenn die ganze Buchung an dieser einen Rechnung hängt
    const pool = (r.richtung === 'eingang' ? eing : ausg).filter(o => o.id !== r.id && unberuehrt(o) && partnerPasst(o, b) && imFenster(o, b));
    const ts = teilsumme(pool, ueber, 4, b.datum); if (!ts) continue;
    zUpd.push([z, r2(z.betrag - ueber)]); paidR.set(r.id, r2((paidR.get(r.id) || 0) - ueber));
    ts.forEach(o => add(o, b, 'bank', restR(o), 'Sammelzahlung aufgeteilt (mit ' + (r.nummer || 'anderer Rechnung') + ')'));
    extraP.set(b.id, r2((extraP.get(b.id) || 0) - ueber));   // der Betrag war ja schon verbraucht
  }

  // 6) Laut Excel bezahlt, aber noch ohne Zahlung → in Bank und Kasse eine GANZE, noch freie Buchung mit genau diesem Betrag suchen
  //    (keine Summen aus Rest-Beträgen – das ergibt Zufallstreffer; Sammel-Lastschriften laufen über das Zahlungsavis)
  const tage = (r, p) => r.datum && p.datum ? daysBetween(r.datum, p.datum) : 0;
  const PAYS = [
    ...S.bank.filter(b => !b.art).map(b => ({ p: b, kind: 'bank', base: bStatus(b).rest })),
    ...S.kasse.filter(k => !/umbuchung|privat|ignor/i.test(k.kostenart || '') && !kSigBelegt.has(kSig(k))).map(k => ({ p: { ...k, zweck: k.text, gegenpartei: k.text }, kind: 'kasse', base: kStatus(k).rest }))
  ];
  const frei = x => restP(x.p.id, x.base), ganzFrei = x => Math.abs(frei(x) - Math.abs(x.p.betrag)) <= 0.005;
  const lautBez = S.rechnungen.filter(r => !r.erledigt && sollOf(r) > 0 && istBezahltLaut(r.status_excel) && !DOK_ARTEN.includes(r.art) && unberuehrt(r)).sort((a, b) => (a.datum || '').localeCompare(b.datum || ''));
  let nExcel = 0;
  for (const r of lautBez) {
    const soll = restR(r); if (soll <= 0.005 || !unberuehrt(r)) continue;
    const P = PAYS.filter(x => (r.richtung === 'eingang') === (x.p.betrag < 0) && ganzFrei(x) && tage(r, x.p) >= -10 && tage(r, x.p) <= 120);
    const nah = (a, b) => Math.abs(tage(r, a.p)) - Math.abs(tage(r, b.p));
    const nm = P.filter(x => partnerPasst(r, x.p) || (r.iban && x.p.iban && normNr(r.iban) === normNr(x.p.iban))).sort(nah);
    const gleich = x => Math.abs(frei(x) - soll) <= CENT_TOLERANZ;
    let x = nm.find(gleich);
    if (x) { add(r, x.p, x.kind, Math.min(frei(x), soll), 'Laut Excel bezahlt: Name und Betrag'); nExcel++; continue; }
    // mit Skonto (2 % / 3 %) abgezogen
    x = nm.find(y => [0.02, 0.03].some(q => Math.abs(soll * (1 - q) - frei(y)) <= 0.02));
    if (x) { const s = r2(soll - frei(x)); skontoUpd.push([r, s]); add(r, x.p, x.kind, frei(x), 'Laut Excel bezahlt: Name und Betrag mit Skonto (' + fmtE(s) + ')'); nExcel++; continue; }
    // ohne Namenstreffer: genau eine Zahlung mit diesem Betrag kurz nach dem Rechnungsdatum – und keine andere Rechnung, die sie auch meinen könnte
    const c = P.filter(y => gleich(y) && tage(r, y.p) >= -5 && tage(r, y.p) <= 60);
    if (c.length === 1) {
      const y = c[0], konkurrenz = lautBez.filter(o => o !== r && o.richtung === r.richtung && Math.abs(restR(o) - soll) <= CENT_TOLERANZ && tage(o, y.p) >= -5 && tage(o, y.p) <= 60);
      if (!konkurrenz.length) { add(r, y.p, y.kind, Math.min(frei(y), soll), 'Laut Excel bezahlt: Betrag und Datum (einziger Treffer) – bitte prüfen'); nExcel++; }
    }
  }

  // 7) Personal ohne Rechnung: Krankenkassen, Sozialversicherung, Lohnsteuer, Löhne werden einfach abgebucht/überwiesen → Kosten ohne Beleg (Personalkosten)
  const HR_RX = /\bikk\b|\baok\b|\bbkk\b|barmer|techniker\s*kranken|\bdak\b|\bkkh\b|\bhkk\b|knappschaft|minijob|kranken\s*kasse|krankenkasse|krankenversicherung|sozialversicherung|svlfg|beitragsnachweis|sv[-\s]?beitr|lohnsteuer|lohn\s*\/|gehalt|lohnzahlung|\blohn\b/i;
  const hrJobs = S.bank.filter(b => b.betrag < 0 && !b.art && !b.kostenart && !(IDX.zByB.get(b.id) || []).length && !(extraP.get(b.id) > 0.005) && HR_RX.test((b.gegenpartei || '') + ' ' + (b.zweck || '')));
  for (let i = 0; i < hrJobs.length; i += 10) await Promise.all(hrJobs.slice(i, i + 10).map(b => DB.update('bank', b.id, { kostenart: 'Personalkosten' })));

  for (const [z, betrag] of zUpd) await DB.update('zuordnungen', z.id, { betrag, notiz: [z.notiz, 'Sammelzahlung aufgeteilt'].filter(Boolean).join(' · ') });
  for (const [r, s] of skontoUpd) await DB.update('rechnungen', r.id, { skonto: r2((+r.skonto || 0) + s), notiz: [r.notiz, 'Skonto ' + fmtE(s) + ' beim Bezahlen abgezogen'].filter(Boolean).join(' · ') });
  for (const { g, r } of gutLinks) await DB.update('rechnungen', g.id, { bezug_id: r.id, notiz: [g.notiz, `Mit ${r.nummer || 'Rechnung'} in der Lastschrift verrechnet`].filter(Boolean).join(' · ') });
  if (gutLinks.length) buildIdx();
  if (newZ.length) { await DB.insert('zuordnungen', newZ); await statusNachziehen(newZ.map(z => z.rechnung_id).concat(zUpd.map(([z]) => z.rechnung_id))); }
  else if (zUpd.length) await statusNachziehen(zUpd.map(([z]) => z.rechnung_id));

  // SumUp-Auszahlungen auf dem Bankkonto ↔ einzelne SumUp-Umsätze
  let links = 0;
  for (const b of S.bank.filter(b => b.art === 'sumup' && !S.sumup.some(s => s.bank_id === b.id))) {
    const netto = s => s.auszahlung != null ? s.auszahlung : s.betrag - (s.gebuehr || 0);
    // 1) sicher: Auszahlungs-ID („PID1066911“) steht im Verwendungszweck der Bankgutschrift
    const pid = String(b.zweck || '').toUpperCase().match(/PID\s*(\d{4,})/);
    if (pid) {
      const c = S.sumup.filter(s => !s.bank_id && s.auszahlung_ref && new RegExp('PID\\s*' + pid[1] + '\\b', 'i').test(s.auszahlung_ref));
      if (c.length) { for (const s of c) { await DB.update('sumup', s.id, { bank_id: b.id }); links++; } continue; }
    }
    // 2) sonst über Auszahlungsdatum und Summe
    // erst gleicher Tag, dann schrittweise ±1 … ±3 Tage (Bank bucht oft 1–2 Tage später)
    for (let w = 0; w <= 3; w++) {
      const c = S.sumup.filter(s => !s.bank_id && sumOk(s) && s.auszahlung_datum && Math.abs(daysBetween(s.auszahlung_datum, b.datum)) <= w);
      if (c.length && Math.abs(sum(c, netto) - b.betrag) <= 0.05) { for (const s of c) { await DB.update('sumup', s.id, { bank_id: b.id }); links++; } break; }
      // auch einzelne Auszahlungstage im Fenster prüfen
      const days = [...new Set(c.map(s => s.auszahlung_datum))], hit = days.find(d => Math.abs(sum(c.filter(s => s.auszahlung_datum === d), netto) - b.betrag) <= 0.05);
      if (hit) { for (const s of c.filter(s => s.auszahlung_datum === hit)) { await DB.update('sumup', s.id, { bank_id: b.id }); links++; } break; }
    }
  }
  buildIdx();
  await zahlartNachziehen().catch(e => console.warn(e));   // Zahlart = wie tatsächlich bezahlt (EC/SumUp, Überweisung/SEPA, bar)
  if (typeof avisAbgleich === 'function') await avisAbgleich().catch(e => console.warn(e));   // Avise, die erst jetzt ihre Abbuchung finden
  const nAvis2 = await avisZuordnen().catch(e => { console.warn(e); return 0; });
  if (nAvis2) buildIdx();
  const nVerr = await verrechnungAusZweck().catch(e => { console.warn(e); return 0; });
  if (nVerr) buildIdx();
  // Status aus der Liste („Offen“, „Mahnung“, „Abbuchung offen“ …) auf „Bezahlt“ setzen, wenn die Zahlung jetzt vollständig gefunden ist
  const fertig = S.rechnungen.filter(r => !DOK_ARTEN.includes(r.art) && !istBezahltLaut(r.status_excel) && !istStornoLaut(r.status_excel) && ['bezahlt', 'verrechnet'].includes(rStatus(r).key));
  if (fertig.length) { for (let i = 0; i < fertig.length; i += 10) await Promise.all(fertig.slice(i, i + 10).map(r => DB.update('rechnungen', r.id, { status_excel: 'Bezahlt' }))); buildIdx(); }
  return { verrechnet: nVerr, avis: nAvis + nAvis2, rueck: nRueck, n: newZ.length, links, excel: nExcel, hr: hrJobs.length, geteilt: zUpd.length };
}

/* ---------- Verrechnung laut Verwendungszweck ----------
   Stehen mehrere Beleg-Nummern im Verwendungszweck (Rechnungen und Gutschriften, z. B. KSR, RCW/Wolf Reifen) und ergeben ihre
   offenen Beträge zusammen GENAU die Buchung, werden alle zugeordnet. Bisherige automatische Zuordnungen dieser Buchung werden ersetzt,
   von Hand gesetzte bleiben – dann passiert hier nichts. */
async function verrechnungAusZweck() {
  buildIdx(); let n = 0;
  const offenVon = (r, bid) => { const s = rStatus(r); const fremd = sum((IDX.zByR.get(r.id) || []).filter(z => z.bank_id !== bid), z => z.betrag);
    if (s.key === 'verrechnet' || s.key === 'storno' || s.key === 'erledigt') return 0;
    return r2(sollOf(r) - fremd); };   // was nach Abzug anderer Zahlungen noch auf diese Buchung entfallen kann
  for (const b of S.bank) {
    if (b.art || !b.zweck) continue;
    const zs = IDX.zByB.get(b.id) || []; if (zs.some(z => z.art !== 'auto')) continue;
    const l = belegeImZweck(b); if (!l.length) continue;
    const posten = l.map(r => ({ r, o: offenVon(r, b.id) })).filter(x => Math.abs(x.o) > 0.005);
    if (!posten.length || (posten.length === 1 && zs.length)) continue;   // ein einzelner Beleg nur bei noch freier Buchung
    const fluss = r2(sum(posten, x => (x.r.richtung === 'eingang' ? -1 : 1) * x.o));
    if (Math.abs(fluss - b.betrag) > 0.01) continue;
    // schon genau so zugeordnet?
    if (zs.length === posten.length && posten.every(x => zs.some(z => z.rechnung_id === x.r.id && Math.abs(z.betrag - x.o) <= 0.01))) continue;
    if (zs.length) await DB.remove('zuordnungen', zs.map(z => z.id));
    await DB.insert('zuordnungen', posten.map(x => ({ rechnung_id: x.r.id, bank_id: b.id, betrag: x.o, art: 'auto', datum: b.datum, notiz: `Verrechnung laut Verwendungszweck (${posten.length} Belege)` })));
    buildIdx(); n++;
  }
  return n;
}

/* ---------- Zahlungsavis → Zuordnungen ----------
   Ein Avis (PV Automotive, Dederichs, WM …) sagt genau, welche Rechnungen und Gutschriften in einer Sammel-Lastschrift stecken.
   Gutschriften werden mit der größten Rechnung verrechnet, Skonto (2 % / 3 % auf die Rechnungen) wird eingetragen, der Rest zugeordnet. */
async function avisZuordnen() {
  buildIdx();
  const RE = new Map(S.rechnungen.map(r => [r.id, r])), BK = new Map(S.bank.map(b => [b.id, b]));
  const newZ = [], ids = []; let n = 0;
  for (const a of S.avise || []) {
    const b = a.bank_id && BK.get(a.bank_id); if (!b || b.art || b.betrag >= 0) continue;
    // Das Avis gilt: automatische Zuordnungen dieser Abbuchung zu Rechnungen, die NICHT im Avis stehen, sind falsch geraten → lösen
    const imAvis = new Set(a.rechnung_ids || []), falsch = (IDX.zByB.get(b.id) || []).filter(z => z.art === 'auto' && !imAvis.has(z.rechnung_id));
    if (falsch.length && (a.rechnung_ids || []).some(id => RE.get(id) && !(IDX.zByR.get(id) || []).length)) {
      await DB.remove('zuordnungen', falsch.map(z => z.id)); ids.push(...falsch.map(z => z.rechnung_id)); buildIdx();
    }
    const rest = r2(bStatus(b).rest - sum(newZ.filter(z => z.bank_id === b.id), z => z.betrag)); if (rest <= 0.01) continue;
    const rs = [...new Set(a.rechnung_ids || [])].map(id => RE.get(id)).filter(r => r && r.richtung === 'eingang' && !r.erledigt);
    const pos = rs.filter(r => (+r.brutto || 0) > 0 && !(IDX.zByR.get(r.id) || []).length && !newZ.some(z => z.rechnung_id === r.id));
    const neg = rs.filter(r => (+r.brutto || 0) < 0 && !r.bezug_id);
    if (!pos.length) continue;
    const gsAlt = r => sum((IDX.gsByR.get(r.id) || []).filter(g => (+g.brutto || 0) < 0), g => Math.abs(sollOf(g)));
    const L = pos.slice().sort((x, y) => y.brutto - x.brutto)[0], gutNeu = sum(neg, g => Math.abs(sollOf(g)));
    const brutto = sum(pos, r => sollOf(r)), soll = r2(brutto - sum(pos, gsAlt) - gutNeu), diff = r2(soll - rest);
    // Skonto? (2 % oder 3 % auf die Rechnungsbeträge abgezogen)
    const sk = new Map();
    const p = [0.03, 0.02].find(q => diff > 0.01 && Math.abs(diff - brutto * q) <= 0.02 + pos.length * 0.01);
    if (p) { let s = 0; pos.forEach(r => { const v = r2(sollOf(r) * p); sk.set(r.id, v); s += v; }); sk.set(L.id, r2(sk.get(L.id) + diff - r2(s))); }
    const fehlen = String(a.rechnung_nrn || '').split(/[,;\s]+/).filter(Boolean).length > rs.length;
    const amt = new Map(pos.map(r => [r.id, r2(sollOf(r) - gsAlt(r) - (sk.get(r.id) || 0) - (r === L ? gutNeu : 0))]));
    let sumA = sum([...amt.values()]);
    if (Math.abs(sumA - rest) > 0.01 && (fehlen || Math.abs(sumA - rest) <= 1)) { amt.set(L.id, r2(amt.get(L.id) + rest - sumA)); sumA = rest; }   // Cent-Rest oder Beleg fehlt in der App
    if ([...amt.values()].some(v => v <= 0.005)) continue;   // unplausibel → von Hand
    let frei = rest; const notiz = 'Zahlungsavis ' + (a.nummer || fmtD(a.datum)) + (pos.length + neg.length > 1 ? ' (Sammel-Lastschrift)' : '');
    for (const r of pos) { const v = r2(Math.min(amt.get(r.id), frei)); if (v <= 0.005) break; frei = r2(frei - v);
      newZ.push({ rechnung_id: r.id, bank_id: b.id, sumup_id: null, kasse_id: null, betrag: v, art: 'auto', datum: b.datum, notiz }); ids.push(r.id); }
    for (const g of neg) await DB.update('rechnungen', g.id, { bezug_id: L.id, notiz: [g.notiz, 'Mit ' + (L.nummer || 'Rechnung') + ' im Zahlungsavis verrechnet'].filter(Boolean).join(' · ') });
    for (const [id, v] of sk) { const r = RE.get(id); if (v > 0.005) await DB.update('rechnungen', id, { skonto: r2((+r.skonto || 0) + v), notiz: [r.notiz, 'Skonto ' + fmtE(v) + ' laut Zahlungsavis'].filter(Boolean).join(' · ') }); }
    if (b.kostenart) await DB.update('bank', b.id, { kostenart: null });   // war vorläufig als „Kosten ohne Beleg“ eingeordnet
    n++;
  }
  if (newZ.length) { await DB.insert('zuordnungen', newZ); await statusNachziehen(ids); }
  return n;
}

/* ---------- Ergebnis des Abgleichs: was ist zugeordnet, was bleibt offen und warum ---------- */
function abgleichBericht(res) {
  buildIdx();
  const nrIn = text => [...new Set((expandNr(text).match(/R\d{2}-\d{4}\b/g) || []))];
  const hatR = new Set(S.rechnungen.filter(r => r.nummer).map(r => normNr(r.nummer)));
  const offen = S.bank.filter(b => !b.art && bStatus(b).key === 'offen' && b.datum >= START_DATUM).sort((a, b) => b.datum.localeCompare(a.datum));
  const ein = offen.filter(b => b.betrag > 0), aus = offen.filter(b => b.betrag < 0);
  const grund = b => {
    const nrs = nrIn((b.zweck || '') + ' ' + (b.gegenpartei || '')).filter(n => !/^R25/.test(n));
    if (/^R25|\bR?25[-\/]\d{3,4}/i.test(String(b.zweck || '').replace(/^.*SVWZ\+/, ''))) return 'Rechnung aus 2025 – nicht in dieser Software';
    const fehlt = nrs.filter(n => !hatR.has(normNr(n)));
    if (fehlt.length) return `${fehlt.join(', ')} noch nicht in der App (Werkstatt Journal / Rechnung hochladen)`;
    if (nrs.length) return `${nrs.join(', ')} ist da, aber Betrag passt nicht oder schon bezahlt – bitte von Hand`;
    return 'keine Rechnungsnummer im Text, kein eindeutiger Betrag';
  };
  const zeile = b => `<tr data-act="bank" data-id="${b.id}"><td>${fmtD(b.datum)}</td><td class="num">${fmtE(b.betrag)}</td><td>${esc((b.gegenpartei || '').slice(0, 32))}</td><td class="muted">${esc(grund(b))}</td></tr>`;
  const ausGrund = () => 'keine passende Eingangsrechnung in der App';
  // Welcher Zeitraum ist auf der Bank überhaupt da? Eine Rechnung, die vor dem ersten importierten Bankumsatz bezahlt wurde, kann nichts finden.
  const bd = S.bank.map(b => b.datum).filter(Boolean).sort(), von = bd[0], bis = bd[bd.length - 1];
  const monate = new Set(bd.filter(d => d >= START_DATUM).map(d => d.slice(0, 7))), fehlM = [];
  if (von) for (let d = START_DATUM.slice(0, 7); d <= (bis || '').slice(0, 7); d = addDays(d + '-01', 32).slice(0, 7)) if (!monate.has(d)) fehlM.push(monthLabel(d));
  const offenE = S.rechnungen.filter(r => r.richtung === 'eingang' && !DOK_ARTEN.includes(r.art) && ['offen', 'ueberfaellig', 'teil'].includes(rStatus(r).key) && (+r.brutto || 0) > 0);
  const vorBank = von ? offenE.filter(r => r.datum && addDays(r.datum, 60) < von).length : 0;
  openSheet({ title: 'Abgleich fertig', wide: true, noOk: true, html: `
    <p>${res.n ? `✓ <b>${res.n}</b> Zahlung${res.n === 1 ? '' : 'en'} neu zugeordnet` : 'Nichts Neues eindeutig zuzuordnen'}${res.links ? ` · ${res.links} SumUp-Umsätze mit Auszahlungen verknüpft` : ''}.</p>
    ${res.avis || res.rueck || res.excel || res.geteilt || res.hr ? `<p class="small">${[res.avis ? `${res.avis} Zahlungsavise (Sammel-Lastschriften) den Rechnungen zugeordnet` : '', res.rueck ? `${res.rueck} Rücklastschriften: Rechnung auf die neue Zahlung umgehängt` : '', res.excel ? `${res.excel} Rechnungen, die laut Excel bezahlt sind, ihre Bankbuchung gefunden` : '', res.geteilt ? `${res.geteilt} Sammelzahlungen auf mehrere Rechnungen aufgeteilt` : '', res.hr ? `${res.hr} Abbuchungen von Krankenkassen/Lohn als Personalkosten ohne Rechnung eingeordnet` : ''].filter(Boolean).join(' · ')}.</p>` : ''}
    ${(() => { const n = S.rechnungen.filter(r => rStatus(r).key === 'extern' && !DOK_ARTEN.includes(r.art)).length; return n ? `<p class="small muted">${n} Rechnungen stehen in der Excel auf „bezahlt“, aber es gibt keine Bankbuchung mit passendem Namen und Betrag. Bei diesen „Zahlung zuordnen“ öffnen und nach Name oder Betrag suchen.</p>` : ''; })()}
    <p class="small">${von ? `Bankumsätze in der App: <b>${fmtD(von)} – ${fmtD(bis)}</b> (${S.bank.length}).` : '<b>Noch keine Bankumsätze importiert.</b>'}${fehlM.length ? ` <span class="neg">Ohne einen einzigen Bankumsatz: ${fehlM.join(', ')} – diesen Zeitraum bitte als Bank-CSV nachladen, sonst finden die Rechnungen daraus keine Zahlung.</span>` : ''}${vorBank ? ` ${vorBank} offene Eingangsrechnungen sind älter als die Bankdaten.` : ''}</p>
    ${ein.length ? `<details open><summary><b>${ein.length}</b> Geldeingänge auf der Bank noch ohne Rechnung</summary><div class="tw"><table class="tb click"><tbody>${ein.map(zeile).join('')}</tbody></table></div></details>` : '<p>✓ Alle Geldeingänge auf der Bank sind zugeordnet.</p>'}
    ${aus.length ? `<details><summary><b>${aus.length}</b> Abbuchungen noch ohne Eingangsrechnung</summary><div class="tw"><table class="tb click"><tbody>${aus.map(b => `<tr data-act="bank" data-id="${b.id}"><td>${fmtD(b.datum)}</td><td class="num">${fmtE(b.betrag)}</td><td>${esc((b.gegenpartei || '').slice(0, 32))}</td><td class="muted">${ausGrund(b)}</td></tr>`).join('')}</tbody></table></div></details>` : ''}
    <p class="small muted">Sobald die fehlenden Rechnungen in der App sind (Werkstatt Journal bzw. Belege hochladen), läuft der Abgleich automatisch – oder hier nochmal auf „⟳ Abgleichen“.</p>` });
}

/* ---------- Manuelles Zuordnen ---------- */
async function zuordnen(r, pay, kind, betrag, notiz) {
  await DB.insert('zuordnungen', [{ rechnung_id: r.id, bank_id: kind === 'bank' ? pay.id : null, sumup_id: kind === 'sumup' ? pay.id : null, kasse_id: kind === 'kasse' ? pay.id : null, betrag: r2(betrag), art: kind === 'bar' ? 'bar' : 'manuell', datum: pay ? pay.datum : todayISO(), notiz: notiz || null }]);
  await statusNachziehen([r.id]);
}
async function zuordnungLoeschen(zid) { await DB.remove('zuordnungen', zid); buildIdx(); }
