/* Mastercar Finanzen · Import der Excel-Arbeitsmappe „Ein- und Ausgaben 2026“ (.xlsb/.xlsx)
   Ein- und Ausgaben → Rechnungseingang · Werkstatt Journal → Rechnungsausgang · Kassenbuch → Kasse
   Actions → To-Dos · Hebebühne → Hebebühne · (Grafik/GuV werden in der App neu berechnet, Actions Archiv entfällt) */
const MAPPE_BLATT = [
  { key: 'eingang', re: /^ein- ?und ausgaben/i, label: 'Ein- und Ausgaben → Rechnungseingang' },
  { key: 'ausgang', re: /^werkstatt ?journal/i, label: 'Werkstatt Journal → Rechnungsausgang' },
  { key: 'kasse', re: /^kassenbuch/i, label: 'Kassenbuch' },
  { key: 'todos', re: /^actions$/i, label: 'Actions → To-Dos' },
  { key: 'hebe', re: /^hebeb/i, label: 'Hebebühne' },
];
// Überschriftenzeile finden: die Zeile, in der alle Pflicht-Überschriften vorkommen
const hNorm = s => String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
function findKopf(rows, must) {
  for (let i = 0; i < Math.min(rows.length, 60); i++) { const H = rows[i].map(hNorm); if (must.every(m => H.includes(m))) return i; }
  return -1;
}
function colIdx(head, ...names) { const H = head.map(hNorm); for (const n of names) { const i = H.indexOf(hNorm(n)); if (i >= 0) return i; } return -1; }
const cell = (r, i) => i >= 0 ? r[i] : '';
const txt = (r, i) => String(cell(r, i) ?? '').trim();
const ZA_MAP = v => { const s = norm(v); if (!s) return null; if (/sepa|lastschrift/.test(s)) return 'sepa'; if (/ueberweis|bank/.test(s)) return 'bank'; if (/\bbar\b/.test(s)) return 'bar'; if (/\bec\b|karte|sumup/.test(s)) return 'ec'; return null; };
const PRIO_MAP = v => { const s = norm(v); return /dring|sofort|kritisch/.test(s) ? 'dringend' : /hoch|high/.test(s) ? 'hoch' : /niedrig|low|gering/.test(s) ? 'niedrig' : 'normal'; };

// Unterposition nur aus den Stichwort-Regeln, und nur wenn sie zur Kategorie aus der Liste passt
function unterkontoVorschlag(kat, firma) {
  if (!UNTERKONTEN(kat).length) return null; const s = norm(firma);
  for (const [re, k, u] of KOSTEN_REGELN) if (k === kat && u && re.test(s)) return u;
  return null;
}
function parseEingang(rows) {
  const hi = findKopf(rows, ['rechnungsdatum', 'firma']); if (hi < 0) return null;
  const h = rows[hi], c = {
    datum: colIdx(h, 'Rechnungsdatum'), ea: colIdx(h, 'Einnahme/ Ausgabe', 'Einnahme/Ausgabe'), fix: colIdx(h, 'Variabel / fix'), kat: colIdx(h, 'Kategorie'), firma: colIdx(h, 'Firma'),
    art: colIdx(h, 'Art'), nr: colIdx(h, 'Rechnungsnr.'), za: colIdx(h, 'Zahlart'), brutto: colIdx(h, 'Preis gesamt brutto'), status: colIdx(h, 'Erledigt?'), skonto: colIdx(h, 'Skonto'),
    mitSkonto: colIdx(h, 'Mit Skonto'), dlp: colIdx(h, 'Durchlaufender Posten'), netto: colIdx(h, 'Preis netto'), notiz: colIdx(h, 'Notiz'), unter: colIdx(h, 'Unterkategorie', 'Konto'),
    einaus: colIdx(h, 'Rechnungsein-/ausgang', 'Rechnungsein-/ ausgang'), nachDlp: colIdx(h, 'Nach durchl. Posten', 'Nach durchl. Posten'), mw: colIdx(h, 'Mwst.?', 'MwSt.?', 'Mwst?'), bank: colIdx(h, 'Bankabgleich')
  };
  const out = [], seen = {};
  rows.slice(hi + 1).forEach(r => {
    const datum = parseDate(cell(r, c.datum)), firma = txt(r, c.firma), b = parseNum(cell(r, c.brutto));
    if (!datum || !firma || b == null) return;                       // Summenzeilen u. Ä.
    const einnahme = /einnahme/i.test(txt(r, c.ea)), sign = einnahme ? -1 : 1;
    let netto = parseNum(cell(r, c.netto)); if (netto == null) netto = b;
    const mit = parseNum(cell(r, c.mitSkonto)), sk = parseNum(cell(r, c.skonto));
    // Skonto-Betrag: Differenz Brutto → „Mit Skonto“; sonst aus dem Satz
    const skonto = mit != null && mit < Math.abs(b) - 0.005 ? r2(Math.abs(b) - mit) : (sk != null && sk > 0 && sk < Math.abs(b) ? r2(sk < 1 ? Math.abs(b) * sk : sk) : null);
    const dlp = parseNum(cell(r, c.dlp)), nach = parseNum(cell(r, c.nachDlp)), mwTxt = txt(r, c.mw);
    // MwSt. = Betrag ohne durchlaufende Posten minus Netto (TÜV-Gebühr u. Ä. enthalten keine MwSt.)
    const basis = nach != null ? Math.abs(nach) : Math.max(0, Math.abs(b) - Math.abs(dlp || 0));
    const st = txt(r, c.status), nummer = txt(r, c.nr), art = txt(r, c.art) || null;
    const kat = txt(r, c.kat), katOk = KOSTENARTEN.find(k => norm(k) === norm(kat)) || (kat || null);
    const base = nummer ? 'E:' + (nameTokens(firma)[0] || norm(firma).slice(0, 12)) + ':' + normNr(nummer) + ':' + (sign < 0 ? 'G' : 'R') : null;
    const k0 = base || 'EX#' + hashStr([datum, r2(b), norm(firma), art, sign].join('|'));
    seen[k0] = (seen[k0] || 0) + 1;
    out.push({
      richtung: 'eingang', datum, partner: firma, nummer: nummer || null, art, fix: /fix/i.test(txt(r, c.fix)) ? true : /variab/i.test(txt(r, c.fix)) ? false : null,
      kostenart: katOk, unterkonto: txt(r, c.unter) || unterkontoVorschlag(katOk, firma), zahlart: ZA_MAP(txt(r, c.za)), brutto: r2(sign * Math.abs(b)), netto: r2(sign * Math.abs(netto)),
      mwst: r2(sign * Math.max(0, basis - Math.abs(netto))), skonto: skonto ? r2(sign * skonto) : null, durchlaufend: dlp ? r2(dlp) : null,
      ein_ausgang: txt(r, c.einaus) || null, mwst_pflicht: /^ja/i.test(mwTxt) ? true : /^nein/i.test(mwTxt) ? false : null,
      skonto_satz: sk != null && sk > 0 && sk < 1 ? sk : null, mit_skonto: mit != null ? r2(sign * Math.abs(mit)) : null,
      nach_dlp: nach != null ? r2(sign * Math.abs(nach)) : null, bankabgleich: txt(r, c.bank) || null,
      status_excel: stNorm(st, 'eingang'), bezahlt_extern: istBezahltLaut(st),
      notiz: txt(r, c.notiz) || null, quelle: 'excel', geprueft: true, schluessel: seen[k0] > 1 ? k0 + '#' + seen[k0] : k0
    });
  });
  return out;
}
function parseAusgang(rows) {
  const hi = findKopf(rows, ['rech.-nr.', 'datum']); if (hi < 0) return null;
  const h = rows[hi], c = {
    st: colIdx(h, 'Bezahlt?'), za: colIdx(h, 'Zahlart'), gep: colIdx(h, 'Überprüft?'), nr: colIdx(h, 'Rech.-Nr.'), datum: colIdx(h, 'Datum'), name: colIdx(h, 'Firma/Name'), kd: colIdx(h, 'Kd-Nr.'),
    brutto: colIdx(h, 'Gesamt brutto'), lohn: colIdx(h, 'Werkstatt'), teile: colIdx(h, 'Ersatzteile'), sonst: colIdx(h, 'Sonstiges'), mwst: colIdx(h, 'MwSt.'), alt: colIdx(h, 'Altteile'),
    ustAlt: colIdx(h, 'USt.Alt.'), dlp: colIdx(h, 'Dl.Posten'), netto: colIdx(h, 'Gesamt Netto'), notiz: colIdx(h, 'Notizen', 'Notiz'), kz: colIdx(h, 'Kennzeichen'),
    bez: colIdx(h, 'Bezahlt')   // Betrag (nicht „Bezahlt?“)
  };
  const out = [], seen = {};
  rows.slice(hi + 1).forEach(r => {
    const nummer = txt(r, c.nr), datum = parseDate(cell(r, c.datum)), b = parseNum(cell(r, c.brutto)), st = txt(r, c.st);
    if (!datum || b == null || /ergebnis|summe/i.test(st)) return;   // vorbelegte leere Nummern, Summenzeile
    const za = txt(r, c.za), storno = /storn/i.test(st + ' ' + za);
    const k0 = nummer ? 'A:' + normNr(nummer) : 'A#' + hashStr([datum, r2(b), norm(txt(r, c.name))].join('|'));
    seen[k0] = (seen[k0] || 0) + 1;
    out.push({
      richtung: 'ausgang', nummer: nummer || null, datum, partner: txt(r, c.name), kundennr: txt(r, c.kd) || null, kennzeichen: txt(r, c.kz).toUpperCase() || null,
      brutto: r2(b), netto: parseNum(cell(r, c.netto)), mwst: parseNum(cell(r, c.mwst)), ust_alt: parseNum(cell(r, c.ustAlt)), bezahlt_betrag: parseNum(cell(r, c.bez)),
      lohn: parseNum(cell(r, c.lohn)), teile: parseNum(cell(r, c.teile)), sonstiges: parseNum(cell(r, c.sonst)), altteile: parseNum(cell(r, c.alt)), durchlaufend: parseNum(cell(r, c.dlp)),
      zahlart: ZA_MAP(za), status_excel: stNorm(st, 'ausgang') || (storno ? 'storniert' : null), bezahlt_extern: istBezahltLaut(st), erledigt: storno, art: storno ? 'Storno' : 'Rechnung',
      geprueft: !/nein/i.test(txt(r, c.gep)), notiz: txt(r, c.notiz) || null, quelle: 'excel', schluessel: seen[k0] > 1 ? k0 + '#' + seen[k0] : k0
    });
  });
  return out;
}
function parseKasse(rows) {
  const hi = findKopf(rows, ['einnahmen', 'ausgaben', 'datum']); if (hi < 0) return null;
  const h = rows[hi], c = { ein: colIdx(h, 'Einnahmen'), aus: colIdx(h, 'Ausgaben'), gk: colIdx(h, 'Nr.'), beleg: colIdx(h, 'Nr.2', 'Beleg-Nr.'), datum: colIdx(h, 'Datum'), kto: colIdx(h, 'Kto.'), text: colIdx(h, 'Spalte3', 'Text'), best: colIdx(h, 'Bestand') };
  const out = [], seen = {}; let anfang = null, jahr = null;
  rows.slice(hi + 1).forEach(r => {
    const t = txt(r, c.text);
    if (/anfangsbestand/i.test(t)) { anfang = parseNum(cell(r, c.best)); return; }
    let datum = parseDate(cell(r, c.datum)); const ein = parseNum(cell(r, c.ein)) || 0, aus = parseNum(cell(r, c.aus)) || 0;
    // Datum ohne Jahr in der Excel (wird zu 1900-01-28): Jahr der Zeilen davor übernehmen
    if (datum && +datum.slice(0, 4) < 2000) datum = (jahr || START_DATUM.slice(0, 4)) + datum.slice(4); else if (datum) jahr = datum.slice(0, 4);
    if (!datum || (!ein && !aus)) return;
    const betrag = r2(ein - Math.abs(aus)), k0 = 'K' + hashStr([datum, betrag, norm(t), txt(r, c.beleg)].join('|')); seen[k0] = (seen[k0] || 0) + 1;
    out.push({ datum, betrag, belegnr: txt(r, c.beleg) || null, konto: txt(r, c.kto) || null, gegenkonto: txt(r, c.gk) || null, text: t || null,
      kostenart: betrag < 0 ? kostenartVorschlag(t, t) : null, schluessel: seen[k0] > 1 ? k0 + '#' + seen[k0] : k0 });
  });
  return { rows: out, anfang };
}
function parseTodos(rows) {
  const hi = findKopf(rows, ['thema']); if (hi < 0) return null;
  const h = rows[hi], c = { prio: colIdx(h, 'Priorität'), status: colIdx(h, 'Status'), rest: colIdx(h, 'restl. Zeit'), thema: colIdx(h, 'Thema'), det: colIdx(h, 'Details'), wer: colIdx(h, 'Verantwl.', 'Verantwortlich'), kom: colIdx(h, 'Kommentar'), dl: colIdx(h, 'Deadline') };
  const out = [];
  rows.slice(hi + 1).forEach(r => {
    const thema = txt(r, c.thema), det = txt(r, c.det); if (!thema && !det) return;
    const st = txt(r, c.status), kom = txt(r, c.kom);
    out.push({ titel: (thema || det).slice(0, 300), thema: thema || null, details: thema && det ? det : null, wer: txt(r, c.wer) || null, faellig: parseDate(cell(r, c.dl)), prio: PRIO_MAP(txt(r, c.prio)),
      status: st || null, erledigt: /erledigt|done|abgeschlossen|closed|fertig/i.test(st), updates: kom ? [{ d: todayISO(), wer: 'Excel', text: kom }] : [],
      schluessel: 'T#' + hashStr([norm(thema), norm(det), norm(txt(r, c.wer))].join('|')) });
  });
  return out;
}
function parseHebe(rows) {
  const hi = findKopf(rows, ['datum', 'mitarbeiter']); if (hi < 0) return null;
  const h = rows[hi], H = h.map(hNorm), c = { kw: colIdx(h, 'KW'), datum: colIdx(h, 'Datum'), ma: colIdx(h, 'Mitarbeiter'), std: H.findIndex(x => x.startsWith('stunden')) };
  const jobs = [1, 2, 3].map(n => ({ name: H.findIndex(x => x.startsWith(n + '. firma')), kd: H.findIndex(x => x.startsWith(n + '.') && x.includes('kundennummer')), auf: H.findIndex(x => x.startsWith(n + '. auftrag')) }));
  // Hauptjahr = häufigstes Jahr; Ausreißer (Tippfehler wie 2226) über die KW ins Hauptjahr setzen, Wochentag bleibt
  const yc = {}; rows.slice(hi + 1).forEach(r => { const d = parseDate(cell(r, c.datum)); if (d) yc[d.slice(0, 4)] = (yc[d.slice(0, 4)] || 0) + 1; });
  const mainY = +(Object.entries(yc).sort((a, b) => b[1] - a[1])[0] || [todayISO().slice(0, 4)])[0];
  const out = [], seen = {}; let fixed = 0;
  rows.slice(hi + 1).forEach(r => {
    let datum = parseDate(cell(r, c.datum)); const ma = txt(r, c.ma); if (!datum || !ma) return;
    let notiz = null;
    if (+datum.slice(0, 4) !== mainY) {   // das Blatt gilt für ein Jahr – jede Abweichung (2025, 2226 …) ist ein Tippfehler
      const kw = parseNum(cell(r, c.kw)), wd = (new Date(datum + 'T12:00:00').getDay() + 6) % 7;
      const nd = kw >= 1 && kw <= 53 ? addDays(isoWeekMonday(mainY, kw), wd) : mainY + datum.slice(4);
      notiz = 'Datum korrigiert (in Excel: ' + fmtD(datum) + ')'; datum = nd; fixed++;
    }
    const std = parseNum(cell(r, c.std));
    const auftraege = jobs.map(j => ({ name: txt(r, j.name), kdnr: txt(r, j.kd), auftrag: txt(r, j.auf) })).filter(j => j.name || j.kdnr || j.auftrag);
    const abw = !std && auftraege.length && auftraege.every(j => !j.name && !j.kdnr && /krank|urlaub|frei|schule|feiertag|abwesend|ueberstund|überstund/i.test(j.auftrag)) ? auftraege.map(j => j.auftrag).join(', ') : null;
    const k0 = 'H' + hashStr([datum, norm(ma), std, JSON.stringify(auftraege)].join('|')); seen[k0] = (seen[k0] || 0) + 1;
    out.push({ datum, mitarbeiter: ma, stunden: std, abwesend: abw, auftraege: abw ? [] : auftraege, notiz, schluessel: seen[k0] > 1 ? k0 + '#' + seen[k0] : k0 });
  });
  return { rows: out, fixed };
}

// Blätter erkennen: am Namen oder – bei Einzeldateien wie „Werkstatt Journal.xlsx“ oder der Barkasse – an den Überschriften
const MAPPE_KOPF = { eingang: ['rechnungsdatum', 'firma'], ausgang: ['rech.-nr.', 'datum'], kasse: ['einnahmen', 'ausgaben', 'datum'], todos: ['thema', 'priorität'], hebe: ['datum', 'mitarbeiter'] };
function mappeBlaetter(t) {
  const out = {}, used = new Set();
  for (const m of MAPPE_BLATT) {
    const s = t.sheets.find(s => m.re.test(s.name)) || t.sheets.find(s => !used.has(s) && !/archiv/i.test(s.name) && findKopf(s.rows, MAPPE_KOPF[m.key]) >= 0);
    if (s) { out[m.key] = s.rows; used.add(s); }
  }
  return out;
}
// Rechnungen, die es schon gibt: geänderte Felder übernehmen (z. B. Status „Offen“ → „Bezahlt“ im Werkstatt Journal)
const UPD_FELDER = { ausgang: ['partner', 'kundennr', 'kennzeichen', 'datum', 'brutto', 'netto', 'mwst', 'ust_alt', 'bezahlt_betrag', 'lohn', 'teile', 'sonstiges', 'altteile', 'durchlaufend', 'zahlart', 'geprueft', 'notiz', 'erledigt', 'art'],
  eingang: ['partner', 'datum', 'brutto', 'netto', 'mwst', 'skonto', 'durchlaufend', 'zahlart', 'art', 'fix', 'notiz', 'ein_ausgang', 'mwst_pflicht', 'skonto_satz', 'mit_skonto', 'nach_dlp', 'bankabgleich'] };
const leer = v => v == null || v === '';
const gleich = (a, b) => (leer(a) && leer(b)) || (typeof a === 'number' || typeof b === 'number' ? !leer(a) && !leer(b) && eq(+a, +b) : String(a) === String(b));
function aenderungen(rows, dir) {
  buildIdx();
  const byKey = new Map(S.rechnungen.map(r => [r.schluessel, r])), neu = [], upd = [];
  (rows || []).forEach(x => {
    const r = byKey.get(x.schluessel); if (!r) { neu.push(x); return; }
    const p = {};
    UPD_FELDER[dir].forEach(k => { if (!leer(x[k]) && !gleich(x[k], r[k])) p[k] = x[k]; });   // leere Excel-Zellen löschen nichts
    if (x.status_excel && x.status_excel !== r.status_excel) {
      // Liste gewinnt – außer die App hat die Zahlung schon gefunden und die Liste steht noch auf „Offen“/„Abbuchung offen“
      const appBezahlt = istBezahltLaut(r.status_excel) && (IDX.zByR.get(r.id) || []).length;
      if (!(appBezahlt && /^(offen|abbuchung)/i.test(x.status_excel))) { p.status_excel = x.status_excel; p.bezahlt_extern = x.bezahlt_extern; }
    }
    if (Object.keys(p).length) upd.push({ r, p });
  });
  return { neu, upd };
}

async function importMappe(file, tbl) {
  busy(true, 'Lese Datei …');
  let t = tbl; try { t = t || await readTable(file); } catch (e) { busy(false); return toast('Datei nicht lesbar: ' + e.message); }
  const B = mappeBlaetter(t), get = key => B[key] || null;
  const P = {};
  try {
    if (get('eingang')) P.eingang = parseEingang(get('eingang'));
    if (get('ausgang')) P.ausgang = parseAusgang(get('ausgang'));
    if (get('kasse')) P.kasse = parseKasse(get('kasse'));
    if (get('todos')) P.todos = parseTodos(get('todos'));
    if (get('hebe')) P.hebe = parseHebe(get('hebe'));
  } catch (e) { busy(false); console.error(e); return toast('Fehler beim Lesen: ' + e.message); }
  // Nur ab 2026: ältere Zeilen (z. B. Rechnungen aus 2025) gar nicht erst anbieten
  const vor = { n: 0 }, ab2026 = l => l ? l.filter(r => { const ok = !r.datum || r.datum >= START_DATUM; if (!ok) vor.n++; return ok; }) : l;
  P.eingang = ab2026(P.eingang); P.ausgang = ab2026(P.ausgang); if (P.kasse) P.kasse.rows = ab2026(P.kasse.rows); if (P.hebe) P.hebe.rows = ab2026(P.hebe.rows);
  busy(false);
  const n = { eingang: P.eingang?.length, ausgang: P.ausgang?.length, kasse: P.kasse?.rows.length, todos: P.todos?.length, hebe: P.hebe?.rows.length };
  const exist = { kasse: new Set(S.kasse.map(r => r.schluessel)), todos: new Set(S.todos.map(r => r.schluessel)), hebe: new Set(S.hebebuehne.map(r => r.schluessel)) };
  const AE = { eingang: aenderungen(P.eingang, 'eingang'), ausgang: aenderungen(P.ausgang, 'ausgang') };
  const neu = { eingang: AE.eingang.neu.length, ausgang: AE.ausgang.neu.length, kasse: P.kasse?.rows.filter(r => !exist.kasse.has(r.schluessel)).length, todos: P.todos?.filter(r => !exist.todos.has(r.schluessel)).length, hebe: P.hebe?.rows.filter(r => !exist.hebe.has(r.schluessel)).length };
  const geaendert = { eingang: AE.eingang.upd.length, ausgang: AE.ausgang.upd.length };
  const stWechsel = k => AE[k].upd.filter(u => u.p.status_excel).length;
  const line = (key, label, extra = '') => n[key] != null ? `<label class="chk"><input type="checkbox" data-k="${key}" ${neu[key] || geaendert[key] ? 'checked' : ''}> <span><b>${label}</b> · ${fmtN(n[key])} Einträge: <b>${fmtN(neu[key])} neu</b>${geaendert[key] ? ` · <b>${fmtN(geaendert[key])} geändert</b>${stWechsel(key) ? ` (davon ${fmtN(stWechsel(key))} mit neuem Status)` : ''}` : ''}${extra}</span></label>` : '';
  const anz = Object.values(n).filter(v => v != null).length;
  if (!anz) return toast('In der Datei wurde nichts Bekanntes gefunden (Werkstatt Journal, Kassenbuch, Ein- und Ausgaben …).');
  const TITEL = { eingang: 'Ein- und Ausgaben übernehmen', ausgang: 'Werkstatt Journal übernehmen', kasse: 'Barkasse übernehmen', todos: 'To-Dos übernehmen', hebe: 'Hebebühne übernehmen' };
  openSheet({
    title: anz === 1 ? TITEL[Object.keys(n).find(k => n[k] != null)] : 'Arbeitsmappe übernehmen', wide: true, okLabel: 'Übernehmen', html: `
    <p class="small muted">${esc(file.name)} · Neue Einträge werden angelegt. Rechnungen, die es schon gibt, bekommen die Änderungen aus der Datei (z. B. Status „Bezahlt“ oder „Mahnung“); alles andere bleibt, wie es ist. Die Datei kann also jede Woche wieder reingezogen werden.${vor.n ? ` <b>${vor.n} Zeilen vor 2026 werden übersprungen.</b>` : ''}</p>
    <div class="chklist">
      ${line('eingang', 'Ein- und Ausgaben → Rechnungseingang', ' (inkl. Gutschriften, Verträge, Stornos)')}
      ${line('ausgang', 'Werkstatt Journal → Rechnungsausgang')}
      ${line('kasse', 'Kassenbuch', P.kasse && P.kasse.anfang != null ? ' · Anfangsbestand ' + fmtE(P.kasse.anfang) : '')}
      ${line('todos', 'Actions → To-Dos')}
      ${line('hebe', 'Hebebühne', P.hebe && P.hebe.fixed ? ` · <span class="warn-t">${P.hebe.fixed} Datum(e) mit falschem Jahr über die Kalenderwoche korrigiert</span>` : '')}
    </div>
    ${anz > 1 ? '<p class="small muted">„Grafik“ und „GuV“ rechnet die App selbst aus den Daten. „Actions Archiv“ wird nicht übernommen.</p>' : ''}`,
    onOk: async d => {
      const on = k => $(`[data-k="${k}"]`, d)?.checked;
      busy(true, 'Übernehme …');
      const res = [];
      const run = async (key, art, table, rows, upd = []) => {
        if (!on(key) || !rows || (!rows.length && !upd.length)) return;
        busy(true, 'Übernehme ' + art + ' …');
        let added = [];
        if (rows.length) {
          const [imp] = await DB.insert('importe', [{ art, datei: file.name, zeilen: rows.length }]);
          added = await DB.insert(table, rows.map(r => ({ ...r, import_id: imp.id })));
          DB.update('importe', imp.id, { neu: added.length, doppelt: rows.length - added.length }).catch(() => { });
        }
        for (let i = 0; i < upd.length; i += 10) { busy(true, `Aktualisiere ${art}: ${Math.min(i + 10, upd.length)} von ${upd.length} …`); await Promise.all(upd.slice(i, i + 10).map(u => DB.update(table, u.r.id, u.p))); }
        res.push([art, added.length, upd.length]);
      };
      try {
        await run('eingang', 'eingang', 'rechnungen', AE.eingang.neu, AE.eingang.upd);
        await run('ausgang', 'ausgang', 'rechnungen', AE.ausgang.neu, AE.ausgang.upd);
        if (on('kasse') && P.kasse) { await run('kasse', 'kasse', 'kasse', P.kasse.rows); if (P.kasse.anfang != null && S.einstellungen.kasse_anfang == null) await DB.setSetting('kasse_anfang', P.kasse.anfang); }
        await run('todos', 'todos', 'todos', P.todos);
        await run('hebe', 'hebebuehne', 'hebebuehne', P.hebe?.rows);
        busy(true, 'Gleiche Zahlungen ab …');
        const ab = await autoAbgleich();
        busy(false); render();
        const L = { eingang: 'Rechnungseingang', ausgang: 'Rechnungsausgang', kasse: 'Kassenbuch', todos: 'To-Dos', hebebuehne: 'Hebebühne' };
        setTimeout(() => openSheet({ title: 'Übernommen', noOk: true, html: `<ul>${res.map(([a, nn, uu]) => `<li><b>${L[a]}</b>: ${fmtN(nn)} neu${uu ? `, ${fmtN(uu)} aktualisiert` : ''}</li>`).join('') || '<li>Nichts Neues.</li>'}</ul>${ab.n ? `<p>✓ ${ab.n} Zahlungen automatisch zugeordnet.</p>` : ''}` }), 50);
      } catch (e) { busy(false); console.error(e); toast('Fehler: ' + (e.message || e) + (/kasse|todos|hebebuehne/.test(String(e.message)) ? ' – wurde 02_erweiterung.sql in Supabase ausgeführt?' : '')); return false; }
    }
  });
}
