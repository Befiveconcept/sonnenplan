/* Mastercar Finanzen · Import von Excel/CSV: Rechnungsausgang, SumUp, Bankumsätze
   Spalten werden automatisch erkannt, im Fenster geprüft und pro Dateiaufbau gemerkt. */

// Feld: [Schlüssel, Bezeichnung, Spaltennamen-Synonyme, nicht passend (RegExp)]
const IMP = {
  ausgang: {
    label: 'Rechnungsausgang (Excel)', need: ['brutto'],
    fields: [
      ['nummer', 'Rechnungsnummer', ['rechnungsnummer', 'rechnungsnr', 're nr', 'renr', 'rg nr', 'rgnr', 'belegnummer', 'beleg nr', 'belegnr', 'rechnung nr', 'rechnung', 'nummer', 'nr'], /kunde|kd|auftrag/],
      ['datum', 'Rechnungsdatum', ['rechnungsdatum', 'belegdatum', 're datum', 'datum', 'erstellt'], /faellig|zahl|bezahlt|liefer/],
      ['faellig', 'Fällig am', ['faellig', 'faellig am', 'faelligkeit', 'faelligkeitsdatum', 'zahlungsziel'], null],
      ['partner', 'Kunde', ['kunde', 'kundenname', 'name', 'firma', 'empfaenger', 'auftraggeber', 'rechnungsempfaenger'], /nummer|nr$|^nr|id$/],
      ['kennzeichen', 'Kennzeichen', ['kennzeichen', 'kfz kennzeichen', 'amtl kennzeichen', 'kfz'], null],
      ['beschreibung', 'Beschreibung', ['beschreibung', 'leistung', 'betreff', 'text', 'fahrzeug', 'bemerkung'], null],
      ['netto', 'Netto', ['netto', 'nettobetrag', 'summe netto', 'betrag netto'], null],
      ['mwst', 'MwSt.', ['mwst', 'ust', 'umsatzsteuer', 'mehrwertsteuer', 'steuer', 'mwst betrag'], /satz|prozent/],
      ['brutto', 'Brutto / Rechnungsbetrag', ['brutto', 'bruttobetrag', 'gesamtbetrag', 'rechnungsbetrag', 'endbetrag', 'gesamt', 'summe brutto', 'betrag brutto', 'betrag', 'summe'], /netto|mwst|ust|offen|bezahlt/],
      ['zahlart', 'Zahlart', ['zahlart', 'zahlungsart', 'zahlweise', 'bezahlt per', 'zahlung'], null],
    ]
  },
  sumup: {
    label: 'SumUp-Export (EC-Zahlungen)', need: ['betrag', 'datum'],
    fields: [
      ['transaktion', 'Transaktions-ID', ['transaktions id', 'transaktionsid', 'transaction id', 'transaktionscode', 'transaktionsnummer', 'transaktions code', 'code', 'referenz', 'id'], null],
      ['datum', 'Datum', ['datum', 'zeitstempel', 'transaktionsdatum', 'date', 'timestamp', 'erstellt am', 'zeitpunkt', 'datum uhrzeit'], /auszahl|payout/],
      ['betrag', 'Betrag', ['betrag', 'gesamtbetrag', 'betrag inkl mwst', 'betrag brutto', 'amount', 'total', 'umsatz', 'brutto', 'summe'], /gebuehr|fee|auszahl|netto|trinkgeld|steuer|mwst/],
      ['gebuehr', 'Gebühr', ['gebuehrenbetrag', 'gebuehr', 'gebuehren', 'transaktionsgebuehr', 'fee', 'fees'], null],
      ['auszahlung', 'Auszahlungsbetrag', ['auszahlung', 'auszahlungsbetrag', 'ausgezahlt', 'payout', 'nettobetrag', 'netto'], /datum|date|\bid\b|referenz/],
      ['auszahlung_datum', 'Auszahlungsdatum', ['auszahlungsdatum', 'auszahlung am', 'ausgezahlt am', 'payout date'], null],
      ['auszahlung_ref', 'Auszahlungs-ID', ['auszahlungs id', 'auszahlungsid', 'payout id', 'auszahlungsreferenz'], null],
      ['art', 'Transaktionsart', ['transaktionsart', 'transaction type', 'typ'], null],
      ['beschreibung', 'Beschreibung', ['beschreibung', 'description', 'produkt', 'produkte', 'artikel', 'notiz', 'bemerkung', 'referenz'], null],
      ['zahlungsart', 'Zahlungsart / Karte', ['kartensystem', 'zahlungsart', 'zahlungsmethode', 'kartentyp', 'kartenart', 'karte', 'payment method', 'karten typ'], null],
      ['status', 'Status', ['status', 'transaktionsstatus'], null],
    ]
  },
  bank: {
    label: 'Bankumsätze (CSV/Excel)', need: ['datum'],
    fields: [
      ['konto', 'Eigenes Konto', ['auftragskonto', 'bezeichnung auftragskonto', 'iban auftragskonto', 'eigene iban', 'konto'], /nummer|bic|blz|name|gegen|empf/],   // „IBAN/Kontonummer“ ist das Gegenkonto, nicht das eigene
      ['datum', 'Buchungstag', ['buchungstag', 'buchungsdatum', 'datum', 'buchung'], /valuta|wert/],
      ['valuta', 'Valuta / Wertstellung', ['valuta', 'valutadatum', 'wertstellung', 'wertstellungsdatum', 'wertstellungstag'], null],
      ['betrag', 'Betrag (+/−)', ['betrag', 'betrag eur', 'betrag in eur', 'umsatz', 'amount', 'betrag euro'], /waehrung|saldo/],
      ['soll', 'Soll (Abgang)', ['soll', 'belastung', 'abgang', 'ausgang'], /ursprung|rueck/],
      ['haben', 'Haben (Eingang)', ['haben', 'gutschrift', 'zugang', 'eingang'], null],
      ['gegenpartei', 'Name Auftraggeber/Empfänger', ['beguenstigter zahlungspflichtiger', 'name zahlungsbeteiligter', 'auftraggeber empfaenger', 'empfaenger zahlungspflichtiger', 'zahlungsempfaenger', 'zahlungspflichtiger', 'auftraggeber', 'empfaenger', 'gegenkonto name', 'name', 'partner'], /iban|konto|bic|nummer/],
      ['iban', 'IBAN Gegenkonto', ['iban zahlungsbeteiligter', 'kontonummer iban', 'iban', 'kontonummer', 'gegenkonto iban', 'gegenkonto'], /auftragskonto|eigene|name|bic/],
      ['zweck', 'Verwendungszweck', ['verwendungszweck', 'zweck', 'vorgang verwendungszweck', 'buchungsdetails', 'beschreibung'], null],
      ['buchungstext', 'Buchungstext', ['buchungstext', 'umsatzart', 'transaktionsart', 'vorgang', 'buchungsart'], /zweck/],
    ]
  },
};

/* ---------- Datei lesen ---------- */
function decodeText(buf) {
  const u8 = new Uint8Array(buf);
  let t = new TextDecoder('utf-8').decode(u8);
  if (t.includes('\uFFFD')) t = new TextDecoder('windows-1252').decode(u8);
  return t.replace(/^\uFEFF/, '');
}
function parseCSV(text) {
  const lines = text.split(/\r?\n/).slice(0, 30);
  const cnt = ch => lines.reduce((a, l) => a + (l.split(ch).length - 1), 0);
  const sep = [';', '\t', ','].sort((a, b) => cnt(b) - cnt(a))[0];
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; continue; }
    if (c === '"') q = true;
    else if (c === sep) { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows.map(r => r.map(x => x.trim()));
}
async function readTable(file) {
  const buf = await file.arrayBuffer();
  if (/\.(csv|txt)$/i.test(file.name)) return { sheets: [{ name: 'CSV', rows: parseCSV(decodeText(buf)) }] };
  if (!window.XLSX) throw new Error('Excel-Leser nicht geladen (Internet?)');
  // Formeln nicht auswerten: .xlsb mit Tabellen-Bezügen („PtgList“) würde sonst abbrechen; gelesen werden die gespeicherten Werte
  const wb = XLSX.read(buf, { type: 'array', cellDates: true, cellFormula: false });
  const sheets = wb.SheetNames.map(n => ({ name: n, rows: XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: '' }) }))
    .filter(s => s.rows.length);
  sheets.sort((a, b) => b.rows.length - a.rows.length);
  return { sheets };
}

/* ---------- Spalten erkennen ---------- */
function findHeader(rows, type) {
  const syn = new Set(IMP[type].fields.flatMap(f => f[2]));
  let best = 0, bestScore = -1;
  rows.slice(0, 25).forEach((r, i) => {
    const sc = r.filter(c => { const n = norm(c); return n && (syn.has(n) || [...syn].some(s => s.length >= 5 && n.includes(s))); }).length;
    if (sc > bestScore) { bestScore = sc; best = i; }
  });
  return best;
}
function autoMap(headers, type) {
  const H = headers.map(norm), map = {}, used = new Set();
  const fields = IMP[type].fields;
  const ok = (f, i, pass) => !used.has(i) && H[i] && !(pass === 1 && f[3] && f[3].test(H[i]));
  // 1. exakter Name, 2. Name enthält Synonym (nur längere Synonyme; hier gelten die Ausschlüsse)
  for (const pass of [0, 1]) for (const f of fields) {
    if (map[f[0]] != null) continue;
    for (const s of f[2]) {
      const i = H.findIndex((h, i) => ok(f, i, pass) && (pass === 0 ? h === s : s.length >= 4 && h.includes(s)));
      if (i >= 0) { map[f[0]] = i; used.add(i); break; }
    }
  }
  return map;
}
// Welcher Import passt? Nur die Überschriftenzeile zählt (im Verwendungszweck kann z. B. „SumUp“ stehen)
function detectType(rows) {
  const BONUS = { bank: /buchungstag|verwendungszweck|valuta|wertstellung|auftragskonto|beguenstigter|zahlungspflichtiger|zahlungsbeteiligter/, sumup: /transaktion|auszahlung|trinkgeld|kartentyp|zahlungsmethode/, ausgang: /rechnungsnummer|re nr|rechnungsdatum|kennzeichen|kunde/ };
  let best = 'ausgang', bs = -1;
  for (const t of Object.keys(IMP)) {
    const hi = findHeader(rows, t), H = (rows[hi] || []).map(norm);
    const sc = Object.keys(autoMap(H, t)).length + 3 * H.filter(h => BONUS[t].test(h)).length;
    if (sc > bs) { bs = sc; best = t; }
  }
  return best;
}
const sigOf = headers => hashStr(headers.map(norm).join('|'));

/* ---------- Zeilen umwandeln ---------- */
function zahlartOf(v) {
  const s = norm(v); if (!s) return null;
  if (/\bbar\b|barzahlung|kasse/.test(s)) return 'bar';
  if (/\bec\b|karte|sumup|giro|girocard|kredit|visa|master|maestro|terminal/.test(s)) return 'ec';
  if (/ueberweis|bank|rechnung|lastschrift|sepa/.test(s)) return 'bank';
  return null;
}
function convertRows(type, rows, map, headerIdx) {
  const get = (r, k) => map[k] != null ? r[map[k]] : null;
  const out = [], skipped = []; const seen = {};
  rows.slice(headerIdx + 1).forEach((r, li) => {
    if (!r || !r.some(c => String(c).trim() !== '')) return;
    const line = headerIdx + 2 + li;
    if (type === 'ausgang') {
      const nummer = String(get(r, 'nummer') ?? '').trim();
      let brutto = parseNum(get(r, 'brutto')), netto = parseNum(get(r, 'netto')), mwst = parseNum(get(r, 'mwst'));
      if (brutto == null && netto != null) brutto = r2(netto + (mwst ?? netto * 0.19));
      if (netto == null && brutto != null && mwst != null) netto = r2(brutto - mwst);
      const partner = String(get(r, 'partner') ?? '').trim();
      if (brutto == null || (!nummer && !partner)) { skipped.push({ line, why: 'kein Betrag oder keine Nummer/Kunde' }); return; }
      if (/^(summe|gesamt|total)/i.test(nummer + partner)) { skipped.push({ line, why: 'Summenzeile' }); return; }
      const datum = parseDate(get(r, 'datum'));
      out.push({ richtung: 'ausgang', nummer: nummer || null, datum, faellig: parseDate(get(r, 'faellig')), partner, kennzeichen: String(get(r, 'kennzeichen') ?? '').trim().toUpperCase() || null,
        beschreibung: String(get(r, 'beschreibung') ?? '').trim() || null, netto, mwst, brutto: r2(brutto), zahlart: zahlartOf(get(r, 'zahlart')), quelle: 'excel', geprueft: true,
        schluessel: nummer ? 'A:' + normNr(nummer) : 'A#' + hashStr([datum, r2(brutto), norm(partner)].join('|')), _line: line });
    } else if (type === 'sumup') {
      let betrag = parseNum(get(r, 'betrag')); const datum = parseDate(get(r, 'datum'));
      if (betrag == null || !datum) { skipped.push({ line, why: 'kein Betrag oder Datum' }); return; }
      if (/erstatt|refund|rueckbuch|chargeback|storn/i.test(norm(get(r, 'art')))) betrag = -Math.abs(betrag);   // Erstattung an den Kunden
      // Auszahlungs-ID wie „SUMUP PID1066911 PAYOUT 060126“ → Auszahlungsdatum 06.01.2026
      const ref = String(get(r, 'auszahlung_ref') ?? '').trim(), pm = ref.match(/PAYOUT\s*(\d{2})(\d{2})(\d{2})\b/i);
      const gebuehr = parseNum(get(r, 'gebuehr'));
      const status = String(get(r, 'status') ?? '').trim();
      const besch = String(get(r, 'beschreibung') ?? '').trim();
      let tx = String(get(r, 'transaktion') ?? '').trim();
      if (!tx) { const k = [datum, r2(betrag), norm(besch)].join('|'); seen[k] = (seen[k] || 0) + 1; tx = 'H' + hashStr(k + '|' + seen[k]); }
      const az = parseNum(get(r, 'auszahlung'));
      out.push({ transaktion: tx, datum, betrag: r2(betrag), gebuehr, auszahlung: az != null ? az : (gebuehr != null ? r2(betrag - gebuehr) : null),
        auszahlung_datum: parseDate(get(r, 'auszahlung_datum')) || (pm ? `20${pm[3]}-${pm[2]}-${pm[1]}` : null), auszahlung_ref: ref || null,
        beschreibung: besch || null, zahlungsart: String(get(r, 'zahlungsart') ?? '').trim() || null, status: status || null, _line: line });
    } else if (type === 'bank') {
      const datum = parseDate(get(r, 'datum'));
      let betrag = parseNum(get(r, 'betrag'));
      if (betrag == null && (map.soll != null || map.haben != null)) betrag = r2((parseNum(get(r, 'haben')) || 0) - Math.abs(parseNum(get(r, 'soll')) || 0));
      if (!datum || betrag == null) { skipped.push({ line, why: 'kein Datum oder Betrag' }); return; }
      const bt = String(get(r, 'buchungstext') ?? '').trim(), zw = String(get(r, 'zweck') ?? '').replace(/\s+/g, ' ').trim();
      const zweck = [bt, zw].filter(Boolean).join(': ');
      const gp = String(get(r, 'gegenpartei') ?? '').trim();
      // Schlüssel nur aus Datum, Betrag, reinem Verwendungszweck und Name – unabhängig vom Export-Format der Bank
      const k = [datum, r2(betrag), normNr(zw).slice(0, 60), normNr(gp).slice(0, 30)].join('|'); seen[k] = (seen[k] || 0) + 1;
      out.push({ konto: String(get(r, 'konto') ?? '').trim() || null, datum, valuta: parseDate(get(r, 'valuta')), betrag: r2(betrag), gegenpartei: gp || null,
        iban: String(get(r, 'iban') ?? '').replace(/\s/g, '').toUpperCase() || null, zweck: zweck || null, schluessel: 'B' + hashStr(k + '|' + seen[k]), _line: line });
    }
  });
  return { out, skipped };
}

/* ---------- Ablauf: Datei → Zuordnungsfenster → Import ---------- */
async function importFile(type, file) {
  let tbl; try { busy(true, 'Lese ' + file.name + ' …'); tbl = await readTable(file); } catch (e) { busy(false); return toast('Datei nicht lesbar: ' + e.message); } finally { busy(false); }
  if (!tbl.sheets.length) return toast('Die Datei ist leer.');
  let si = 0;
  const st = { type, file, tbl };
  const prep = () => {
    const rows = tbl.sheets[si].rows, hi = findHeader(rows, type), headers = (rows[hi] || []).map(h => String(h ?? '').trim());
    const sig = sigOf(headers), saved = (S.einstellungen['mapping_' + type] || {})[sig];
    Object.assign(st, { rows, hi, headers, sig, map: saved ? { ...saved } : autoMap(headers, type), remembered: !!saved });
    // alte, falsch gemerkte Zuordnung: Gegenkonto-IBAN lag unter „Eigenes Konto“ → richtigstellen
    if (type === 'bank' && st.map.konto != null && st.map.iban == null && /iban|kontonummer/i.test(headers[st.map.konto] || '') && !/auftrag|eigen/i.test(headers[st.map.konto] || '')) { st.map.iban = st.map.konto; st.map.konto = null; }
  };
  prep();
  const colOpts = (sel) => `<option value="">– nicht vorhanden –</option>` + st.headers.map((h, i) => `<option value="${i}" ${+sel === i && sel !== '' && sel != null ? 'selected' : ''}>${esc(h || 'Spalte ' + (i + 1))}${st.rows[st.hi + 1] ? ' · z. B. „' + esc(String(fmtCell(st.rows[st.hi + 1][i])).slice(0, 28)) + '“' : ''}</option>`).join('');
  const preview = () => {
    const { out, skipped } = convertRows(type, st.rows, st.map, st.hi);
    const cols = type === 'ausgang' ? [['nummer', 'Nr.'], ['datum', 'Datum', fmtD], ['partner', 'Kunde'], ['brutto', 'Brutto', fmtE], ['zahlart', 'Zahlart']]
      : type === 'sumup' ? [['datum', 'Datum', fmtD], ['betrag', 'Betrag', fmtE], ['gebuehr', 'Gebühr', fmtE], ['beschreibung', 'Beschreibung'], ['status', 'Status']]
        : [['datum', 'Datum', fmtD], ['betrag', 'Betrag', fmtE], ['gegenpartei', 'Name'], ['zweck', 'Verwendungszweck']];
    return `<div class="small muted">${out.length} Zeilen erkannt${skipped.length ? ` · ${skipped.length} übersprungen (leer/Summe)` : ''}. Vorschau:</div>
      <div class="tw"><table class="tb"><thead><tr>${cols.map(c => `<th>${c[1]}</th>`).join('')}</tr></thead><tbody>${out.slice(0, 6).map(r => `<tr>${cols.map(c => `<td>${esc(c[2] ? c[2](r[c[0]]) : (r[c[0]] ?? ''))}</td>`).join('')}</tr>`).join('') || '<tr><td colspan="9" class="muted">Noch nichts erkannt – Spalten zuordnen.</td></tr>'}</tbody></table></div>`;
  };
  const body = () => `
    ${tbl.sheets.length > 1 ? `<label class="fld">Tabellenblatt <select id="imSheet">${tbl.sheets.map((s, i) => `<option value="${i}" ${i === si ? 'selected' : ''}>${esc(s.name)} (${s.rows.length} Zeilen)</option>`).join('')}</select></label>` : ''}
    <p class="small muted">${esc(file.name)} · Überschriften in Zeile ${st.hi + 1}. ${st.remembered ? '✓ Spaltenzuordnung von früher übernommen.' : 'Spalten automatisch erkannt – bitte kurz prüfen.'}</p>
    <div class="map-grid">${IMP[type].fields.map(f => `<label class="fld"><span>${esc(f[1])}${IMP[type].need.includes(f[0]) ? ' *' : ''}</span><select data-f="${f[0]}">${colOpts(st.map[f[0]])}</select></label>`).join('')}</div>
    ${DB.aiOn ? '<button class="btn sm" id="imAI">✨ Spalten von der KI zuordnen lassen</button>' : ''}
    <div id="imPrev">${preview()}</div>`;
  const d = openSheet({
    title: IMP[type].label + ' importieren', wide: true, okLabel: 'Importieren', html: body(),
    onOk: async () => {
      const miss = IMP[type].need.filter(k => st.map[k] == null && !(type === 'bank' && k === 'betrag'));
      if (type === 'bank' && st.map.betrag == null && st.map.soll == null && st.map.haben == null) miss.push('betrag');
      if (miss.length) { toast('Bitte zuordnen: ' + miss.map(k => IMP[type].fields.find(f => f[0] === k)[1]).join(', ')); return false; }
      const all = { ...(S.einstellungen['mapping_' + type] || {}) }; all[st.sig] = st.map;
      DB.setSetting('mapping_' + type, all).catch(() => { });
      await runImport(type, file.name, convertRows(type, st.rows, st.map, st.hi));
    }
  });
  const wire = () => {
    $$('select[data-f]', d).forEach(s => s.onchange = () => { st.map[s.dataset.f] = s.value === '' ? null : +s.value; $('#imPrev', d).innerHTML = preview(); });
    const sh = $('#imSheet', d); if (sh) sh.onchange = () => { si = +sh.value; prep(); $('.sheet-body', d).innerHTML = body(); wire(); };
    const ai = $('#imAI', d); if (ai) ai.onclick = async () => {
      ai.disabled = true; ai.textContent = '✨ KI ordnet zu …';
      try {
        const sample = st.rows.slice(st.hi + 1, st.hi + 5).map(r => r.map(fmtCell));
        const r = await DB.aiJson(`Ordne die Spalten einer ${IMP[type].label}-Tabelle (Kfz-Werkstatt, Deutschland) den Feldern zu.
Spalten (Index: Überschrift): ${st.headers.map((h, i) => i + ': ' + h).join(' | ')}
Beispielzeilen: ${JSON.stringify(sample)}
Felder: ${IMP[type].fields.map(f => f[0] + ' = ' + f[1]).join('; ')}
Antworte nur mit JSON {"feld": Spaltenindex oder null}.`, { tier: 'quick' });
        IMP[type].fields.forEach(f => { const v = r[f[0]]; st.map[f[0]] = Number.isInteger(v) && v >= 0 && v < st.headers.length ? v : null; });
        $('.sheet-body', d).innerHTML = body(); wire(); toast('KI-Zuordnung übernommen – bitte prüfen.');
      } catch (e) { toast(aiErr(e)); ai.disabled = false; ai.textContent = '✨ Spalten von der KI zuordnen lassen'; }
    };
  };
  wire();
}
const fmtCell = v => v instanceof Date ? fmtD(parseDate(v)) : (v ?? '');

async function runImport(type, fileName, { out, skipped }) {
  const vor2026 = out.filter(r => r.datum && r.datum < START_DATUM).length; out = out.filter(r => !r.datum || r.datum >= START_DATUM);   // nur ab 2026
  if (vor2026) skipped = skipped.concat(Array(vor2026).fill({ why: 'vor 2026' }));
  if (!out.length) { toast(vor2026 ? 'Alle Zeilen sind vor 2026 – nichts übernommen.' : 'Keine Zeilen zum Importieren.'); return; }
  busy(true, 'Importiere ' + out.length + ' Zeilen …');
  try {
    const table = type === 'ausgang' ? 'rechnungen' : type;
    // Zeilen, die schon vorhanden sind, aber andere Beträge haben → Hinweis
    const key = type === 'sumup' ? 'transaktion' : 'schluessel';
    const have = new Map(S[table].map(r => [r[key], r]));
    const changed = type === 'ausgang' ? out.filter(r => have.has(r.schluessel) && !eq(have.get(r.schluessel).brutto, r.brutto)) : [];
    // Doppelte innerhalb derselben Datei (gleiche Rechnungsnummer zweimal)
    const inFile = {}; out.forEach(r => { inFile[r[key]] = (inFile[r[key]] || 0) + 1; });
    const dupInFile = type === 'ausgang' ? Object.entries(inFile).filter(([, n]) => n > 1).map(([k]) => k.replace(/^A:/, '')) : [];
    const [imp] = await DB.insert('importe', [{ art: type, datei: fileName, zeilen: out.length }]);
    const rows = out.map(r => ({ ...r, import_id: imp.id }));
    if (type === 'bank') markBankArten(rows);
    const added = await DB.insert(table, rows);
    const doppelt = out.length - added.length;
    DB.update('importe', imp.id, { neu: added.length, doppelt }).catch(() => { });
    // Bar bezahlte Ausgangsrechnungen gleich als bezahlt (bar) buchen
    if (type === 'ausgang') {
      const bar = added.filter(r => r.zahlart === 'bar');
      if (bar.length) await DB.insert('zuordnungen', bar.map(r => ({ rechnung_id: r.id, betrag: r.brutto, art: 'bar', datum: r.datum, notiz: 'Laut Excel bar bezahlt' })));
    }
    busy(true, 'Gleiche Zahlungen ab …');
    const res = await autoAbgleich();
    busy(false);
    openSheet({
      title: 'Import fertig', noOk: true, html: `
      <p><b>${added.length}</b> neu übernommen${doppelt ? ` · <b>${doppelt}</b> waren schon vorhanden und wurden übersprungen` : ''}${skipped.length ? ` · ${skipped.length} Zeilen ohne Inhalt/Summen ignoriert` : ''}.</p>
      ${res.n ? `<p>✓ Automatischer Abgleich: <b>${res.n}</b> Zahlung${res.n === 1 ? '' : 'en'} zugeordnet.</p>` : ''}
      ${dupInFile.length ? `<div class="warn">⚠ Doppelte Rechnungsnummer in der Datei: ${dupInFile.slice(0, 15).map(esc).join(', ')}${dupInFile.length > 15 ? ' …' : ''} – nur der erste Eintrag wurde übernommen.</div>` : ''}
      ${changed.length ? `<div class="warn">⚠ ${changed.length} Rechnung${changed.length === 1 ? '' : 'en'} gibt es schon mit anderem Betrag: ${changed.slice(0, 10).map(r => esc(r.nummer) + ' (jetzt ' + fmtE(r.brutto) + ', gespeichert ' + fmtE(have.get(r.schluessel).brutto) + ')').join(', ')}. Bitte von Hand prüfen.</div>` : ''}`
    });
    render();
  } catch (e) { busy(false); console.error(e); toast('Import fehlgeschlagen: ' + (e.message || e)); }
}

// Bereits importierte Buchungen, bei denen die Gegenkonto-IBAN im Feld „konto“ gelandet ist: im Speicher richtigstellen,
// damit der Abgleich die IBAN nutzen kann (eigenes Konto wäre in einem Import immer dasselbe – hier wechselt es von Zeile zu Zeile)
function bankIbanFix() {
  const gr = {}; S.bank.forEach(b => { if (!b.iban && b.konto) (gr[b.import_id || '-'] = gr[b.import_id || '-'] || []).push(b); });
  Object.values(gr).forEach(l => { if (new Set(l.map(b => b.konto)).size >= 3) l.forEach(b => { if (/^[A-Z]{2}\d{2}[A-Z0-9]{8,}$/.test(String(b.konto).replace(/\s/g, ''))) b.iban = String(b.konto).replace(/\s/g, '').toUpperCase(); }); });
}

/* ---------- Bank: SumUp-Auszahlungen erkennen, Kostenart vorschlagen ---------- */
// GuV-Gliederung wie im Blatt „GuV“ der Excel-Mappe (SKR03-Konten). typ: e = Ertrag, k = Kosten
const GUV = [
  { k: 'Umsatzerlöse', konto: '8200 - 8400', typ: 'e', subs: [] },
  { k: 'sonstige betriebliche Erträge', konto: '8402, 2650', typ: 'e', subs: [] },
  { k: 'Materialaufwand', konto: '3100-3425', typ: 'k', subs: [] },
  { k: 'Personalkosten', konto: '4100-4198', typ: 'k', subs: [] },
  { k: 'Raumkosten', typ: 'k', subs: [['Mietkosten (inkl. NK)', '4210-4242'], ['Reinigung und Instandhaltung betr. Räume', '4250, 4260'], ['betriebliche Steuern (Kfz-Steuer)', '4510'], ['Versicherungen/Beiträge/Gebühren', '4360-4396']] },
  { k: 'Fahrzeugkosten', typ: 'k', subs: [['KFZ Versicherung', '4520'], ['KFZ Kosten (lfd. + Reparaturen)', '4530 - 4540'], ['KFZ Leasing', '4570']] },
  { k: 'Werbe-/Reisekosten', typ: 'k', subs: [['Werbekosten', '4600'], ['Personalrekrutierung', '4601'], ['Sponsoring, Geschenke, Bewirtung etc.', '4602-4668']] },
  { k: 'Kosten Warenabgabe', konto: '4760', typ: 'k', subs: [] },
  { k: 'Abschreibungen', konto: '4830-4862', typ: 'k', subs: [] },
  { k: 'Reparatur/Instandhaltung', typ: 'k', subs: [['Wartungskosten Hard- & Software', '4806'], ['sonstige Reparaturen u. Instandhaltungen', '4809']] },
  { k: 'sonstige Kosten', typ: 'k', subs: [['Mietleasing bewegl. WG techn. Anlagen', '4810'], ['sonstige betriebliche Aufwendungen', '4900'], ['Telefon', '4920'], ['Bürobedarf + Porto', '4910+4930'], ['Fortbildungskosten', '4945'], ['Rechts- und Beratungskosten', '4950'], ['Lohn- und Buchführungskosten', '4955'], ['Abschluss- und Prüfungskosten', '4957'], ['Aufwendungen für Lizenzen, Konzessionen', '4964'], ['Aufwand Abraum-/Abfallbeseitigung', '4969'], ['Nebenkosten des Geldverkehrs', '4970'], ['sonstiger Betriebsbedarf', '4980'], ['Arbeitskleidung', '4981'], ['Werkzeuge und Kleingeräte', '4985']] },
  { k: 'Zinsaufwand', konto: '2102-2121', typ: 'k', subs: [] },
  { k: 'sonstiger neutraler Aufwand', konto: '2020-2451', typ: 'k', subs: [] },
];
const KOSTENARTEN = GUV.filter(g => g.typ === 'k').map(g => g.k).concat(['Umsatzerlöse', 'sonstige betriebliche Erträge']);
const UNTERKONTEN = k => (GUV.find(g => g.k === k) || { subs: [] }).subs.map(s => s[0]);
// [Muster, Kategorie, Unterposition]
const KOSTEN_REGELN = [
  [/sumup|kontofuehr|entgelt|gebuehr|abschlussentgelt|paypal/, 'sonstige Kosten', 'Nebenkosten des Geldverkehrs'],
  [/reifen|tyre|tire|pneu|vergoelst|interpneu|stahlgruber|wm ?se|wm fahrzeugteile|coparts|trost|autoteile|teile|bosch|hella|carat|matthies|lkq|rhiag|ad auto|autodis|oel|castrol|liqui ?moly|motul|ravenol|automobile|autohaus/, 'Materialaufwand', ''],
  [/miete|vermiet|grundbesitz|immobil|hausverwalt/, 'Raumkosten', 'Mietkosten (inkl. NK)'],
  [/stadtwerke|rhein ?energie|eon|e on|rwe|vattenfall|strom|enbw|westnetz|wasser/, 'Raumkosten', 'Mietkosten (inkl. NK)'],
  [/lohn|gehalt|loehne|aok|techniker|barmer|dak|ikk|bkk|knappschaft|berufsgenoss|bg ?etem|sozialvers|minijob/, 'Personalkosten', ''],
  [/kfz versicherung|kfz-versicherung/, 'Fahrzeugkosten', 'KFZ Versicherung'],
  [/versicherung|allianz|axa|huk|ergo|signal iduna|provinzial|gothaer|zurich|vhv|ihk|hwk|handwerkskammer|rundfunk|beitrag/, 'Raumkosten', 'Versicherungen/Beiträge/Gebühren'],
  [/leasing/, 'Fahrzeugkosten', 'KFZ Leasing'],
  [/tank|kraftstoff|aral|esso|jet\b|total|avia|shell/, 'Fahrzeugkosten', 'KFZ Kosten (lfd. + Reparaturen)'],
  [/wuerth|wurth|hazet|gedore|werkzeug|hoffmann/, 'sonstige Kosten', 'Werkzeuge und Kleingeräte'],
  [/telekom|vodafone|o2|1 ?1|telefonica|congstar|netcologne/, 'sonstige Kosten', 'Telefon'],
  [/microsoft|google|adobe|apple|software|lexware|datev|sevdesk|shopify|ionos|strato|werbas|carsystem|autodata|alldata|haynes/, 'Reparatur/Instandhaltung', 'Wartungskosten Hard- & Software'],
  [/steuerberat|buchhalt|kanzlei/, 'sonstige Kosten', 'Lohn- und Buchführungskosten'],
  [/entsorg|altoel|recycling|remondis|schrott/, 'sonstige Kosten', 'Aufwand Abraum-/Abfallbeseitigung'],
  [/werbung|google ads|facebook|marketing|anzeige/, 'Werbe-/Reisekosten', 'Werbekosten'],
  [/zinsen|darlehen|kredit/, 'Zinsaufwand', ''],
];
// Vorschlag: zuerst lernen aus bisherigen Belegen desselben Partners, sonst Stichwort-Regeln
function kostenartVorschlagVoll(text, partner) {
  const tok = nameTokens(partner || text).slice(0, 2);
  if (tok.length) {
    const cnt = {};
    S.rechnungen.forEach(r => { if (r.richtung === 'eingang' && r.kostenart && tok.every(w => nameTokens(r.partner).includes(w))) { const k = r.kostenart + '|' + (r.unterkonto || ''); cnt[k] = (cnt[k] || 0) + 1; } });
    const best = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0];
    if (best) { const [k, u] = best[0].split('|'); return { k, u }; }
  }
  const s = norm(text + ' ' + (partner || ''));
  for (const [re, k, u] of KOSTEN_REGELN) if (re.test(s)) return { k, u };
  return null;
}
const kostenartVorschlag = (text, partner) => (kostenartVorschlagVoll(text, partner) || {}).k || null;
function markBankArten(rows) {
  rows.forEach(b => {
    const t = (b.gegenpartei || '') + ' ' + (b.zweck || '');
    if (/sum ?up/i.test(t) && b.betrag > 0) b.art = 'sumup';
    if (b.betrag < 0 && !b.kostenart) { const k = kostenartVorschlag(b.zweck || '', b.gegenpartei); if (k) b.kostenart = k; }
  });
}
