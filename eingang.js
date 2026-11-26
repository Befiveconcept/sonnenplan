/* Mastercar Finanzen · Rechnungseingang: PDFs, Fotos oder ganze Mails (Outlook .msg / .eml) reinziehen.
   Die KI liest Lieferant, Nummer, Datum, Beträge, IBAN und Kostenart aus; der Beleg wird im Speicher abgelegt. */
const safeName = n => String(n || 'beleg').normalize('NFKD').replace(/[^\w.\-]+/g, '_').slice(-80);
async function fileHash(file) {
  try { const b = await file.slice(0, 2e6).arrayBuffer(); const h = await crypto.subtle.digest('SHA-256', b); return [...new Uint8Array(h)].slice(0, 12).map(x => x.toString(16).padStart(2, '0')).join('') + '-' + file.size; }
  catch (e) { return hashStr(file.name + file.size); }
}
const isTable = f => /\.(xlsx|xlsm|xlsb|xls|csv)$/i.test(f.name || '');

async function kiBelegLesen(b) {
  const files = [];
  if (/pdf|image\//.test(b.type) && b.file.size < 15e6) files.push({ type: b.type === 'image/jpg' ? 'image/jpeg' : b.type, data: await fileToB64(b.file) });
  const mail = b.mail ? `\nDie Rechnung kam per E-Mail. Betreff: ${b.mail.subject}\nVon: ${b.mail.from}\nMailtext (Auszug): """${b.mail.text.slice(0, 3000)}"""\n` : '';
  if (!files.length && !mail) return null;
  return DB.aiJson(`Du liest eine Eingangsrechnung für die Kfz-Werkstatt „Mastercar Bornheim“ (Rechnungsempfänger: VE Sportmanagement UG (haftungsbeschränkt)).${mail}
Lies den Beleg genau. Beträge als Zahl (Punkt als Dezimaltrenner), Datum als JJJJ-MM-TT. Wenn ein Zahlungsziel in Tagen steht, das Fälligkeitsdatum ausrechnen.
Kostenart (GuV-Kategorie) genau eine aus: ${KOSTENARTEN.join(', ')}. Unterposition nur wenn passend, aus: ${GUV.filter(g => g.subs.length).map(g => g.k + ' → ' + g.subs.map(s => s[0]).join(' / ')).join('; ')}.
Antworte nur mit JSON:
{"ist_rechnung":true,"kontoauszug":false,"eigene_rechnung":false,"lieferant":"","nummer":"","datum":"","faellig":"","netto":0,"mwst":0,"brutto":0,"iban":"","kostenart":"","unterkonto":"","art":"Rechnung|Gutschrift|Korrektur|Vertrag|Beleg|Zahlungsavis","avis_betrag":0,"avis_rechnungen":[],"mahnung":0,"mahnung_rechnungen":[],"bezug_rechnung":"","kennzeichen":"","kundennr":"","zahlart":"bar|ec|ueberweisung|","lohn":0,"teile":0,"beschreibung":"kurz: was wurde geliefert/geleistet","bezahlung":"offen|lastschrift|bereits_bezahlt","zahlweg":"lastschrift|ueberweisung|bar|karte|paypal|","gutschrift":false,"durchlaufend":0}
durchlaufend = Summe der durchlaufenden Posten ohne MwSt (amtliche Gebühren: HU/AU-Prüfgebühren, Plaketten, Zulassungs- und Behördengebühren, Gebühren „gem. GebOSt“ oder „nicht umsatzsteuerbar/ohne MwSt“ im Namen und für Rechnung Dritter). Bei TÜV, DEKRA, GTÜ, KÜS ist das meist der ganze Betrag. Diese Beträge NICHT in netto/mwst rechnen; 0, wenn es keine gibt.
ist_rechnung=false, wenn es keine Rechnung/Gutschrift ist (z. B. AGB, Lieferschein, Werbung).
zahlweg: wie laut Rechnung bezahlt wird – "lastschrift" (SEPA-Lastschrift, „wird abgebucht“, „Einzug“, Mandatsreferenz), "ueberweisung" (Bankverbindung zum Überweisen, „zahlbar bis“, „bitte überweisen“), "bar", "karte" (EC/Kreditkarte), "paypal"; leer, wenn nichts dazu draufsteht.
kontoauszug=true (und sonst nichts ausfüllen), wenn es ein Kontoauszug / eine Umsatzliste einer Bank ist.
Zahlungsavis (Zahlungsankündigung, Lastschrift-Vorabinformation, Zahlungsbestätigung/Überweisungsavis eines Kunden oder Lieferanten): ist_rechnung=true, art="Zahlungsavis", lieferant = wer das Avis geschickt hat, nummer = die Nummer des Avis (steht als Avis-Nr., Zahlungsavis-Nr., Zahlungsnummer, Belegnummer, Referenz oder Dokumentnummer – unbedingt angeben, nie leer lassen, wenn irgendeine solche Nummer vorkommt), datum = Datum des Avis, brutto=0, netto=0, mwst=0, avis_betrag = genannte Zahlungssumme, avis_rechnungen = alle genannten Rechnungsnummern (z. B. ["R26-0491","4711"]).
bezug_rechnung: bei Gutschrift, Korrektur oder Storno die Nummer der ursprünglichen Rechnung, auf die sie sich bezieht (steht meist als „zu Rechnung …“, „Bezug“, „Originalrechnung“), sonst "". Gutschriften und Korrekturen, die den Betrag mindern (Rückgabe, Kundenrückgabe, Gutschriftsbetrag, negative Summen), mit gutschrift=true und netto/mwst/brutto NEGATIV, so wie auf dem Beleg (z. B. -162.65). art="Korrektur" bei „Korrekturrechnung“. Nur wenn eine Korrektur den Betrag ERHÖHT (Nachberechnung, wir müssen mehr zahlen): "nachberechnung":true und Beträge positiv.
mahnung: 0 = keine Mahnung. 1 = Zahlungserinnerung, 1. Mahnung oder Mail/Schreiben, dass eine Rechnung „noch offen“ ist. 2 = 2. Mahnung. 3 = 3./letzte Mahnung, Inkasso-Androhung. Gilt auch, wenn die Rechnung selbst nur angehängt ist und Mail oder Schreiben auf die offene Zahlung hinweist; dann die Felder der angehängten Rechnung trotzdem ausfüllen. mahnung_rechnungen = alle angemahnten Rechnungsnummern.
eigene_rechnung=true, wenn Mastercar Bornheim / VE Sportmanagement selbst die Rechnung AUSGESTELLT hat (Kundenrechnung der Werkstatt, Nummer wie R26-0491); dann bei "lieferant" den KUNDEN eintragen, dazu kennzeichen, kundennr, zahlart (falls angegeben: bar, ec/Karte, Überweisung), lohn = Arbeitslohn netto, teile = Ersatzteile netto.`, { files, tier: 'quick' });
}

/* ---------- Kontoauszug als PDF (oder Foto): KI liest alle Buchungen → Bank, gleicher Schlüssel wie beim CSV/Excel-Import,
   damit dieselbe Buchung aus PDF und Excel nicht doppelt entsteht. Danach automatischer Abgleich mit Ein- und Ausgaben. */
const istAuszugName = n => /konto.?auszug|kontoauszug|\bauszug\b|bank.?statement|ums(a|ä)tze|statement/i.test(n || '');
async function kontoauszugLesen(b) {
  const data = await fileToB64(b.file);
  return DB.aiJson(`Das ist ein Kontoauszug der Firma VE Sportmanagement UG / Mastercar Bornheim. Lies ALLE Buchungen vollständig ab (keine auslassen, keine Summenzeilen).
Antworte nur mit JSON:
{"konto":"IBAN oder Kontonummer des Kontos","bank":"","von":"JJJJ-MM-TT","bis":"JJJJ-MM-TT","anfangssaldo":0,"endsaldo":0,
 "buchungen":[{"datum":"JJJJ-MM-TT (Buchungstag)","valuta":"JJJJ-MM-TT","betrag":-12.34,"gegenpartei":"Name des Zahlungsempfängers bzw. Auftraggebers","iban":"","buchungstext":"z. B. Lastschrift, Überweisung, Gutschrift, Kartenzahlung, Entgelt","zweck":"Verwendungszweck vollständig, inkl. Rechnungs-/Mandatsnummern"}]}
Betrag: Abbuchung/Belastung NEGATIV, Gutschrift/Eingang POSITIV. Datum immer mit Jahr.`, { files: [{ type: /pdf/.test(b.type) ? 'application/pdf' : b.type, data }], tier: 'default' });
}
function auszugZeilen(j) {
  const seen = {}, out = [];
  (j.buchungen || []).forEach(x => {
    const datum = parseDate(x.datum), betrag = parseNum(x.betrag); if (!datum || betrag == null) return;
    const zw = String(x.zweck || '').replace(/\s+/g, ' ').trim(), gp = String(x.gegenpartei || '').trim(), bt = String(x.buchungstext || '').trim();
    const k = [datum, r2(betrag), normNr(zw).slice(0, 60), normNr(gp).slice(0, 30)].join('|'); seen[k] = (seen[k] || 0) + 1;   // wie importer.js
    out.push({ konto: String(j.konto || '').replace(/\s/g, '') || null, datum, valuta: parseDate(x.valuta), betrag: r2(betrag), gegenpartei: gp || null,
      iban: String(x.iban || '').replace(/\s/g, '').toUpperCase() || null, zweck: [bt, zw].filter(Boolean).join(': ') || null, schluessel: 'B' + hashStr(k + '|' + seen[k]) });
  });
  return out;
}
async function kontoauszugImport(b) {
  const j = await kontoauszugLesen(b), rows = auszugZeilen(j);
  if (!rows.length) throw new Error('keine Buchungen erkannt');
  // Saldo-Probe: Anfangssaldo + Buchungen = Endsaldo?
  const a = parseNum(j.anfangssaldo), e = parseNum(j.endsaldo), summe = sum(rows, r => r.betrag);
  const probe = a != null && e != null ? (eq(r2(a + summe), e) ? 'ok' : `Saldo passt nicht: ${fmtE(a)} + ${fmtE(summe)} ≠ ${fmtE(e)} – evtl. fehlt eine Buchung`) : null;
  const [imp] = await DB.insert('importe', [{ art: 'bank', datei: b.name, zeilen: rows.length }]);
  const mit = rows.map(r => ({ ...r, import_id: imp.id })); markBankArten(mit);
  const added = await DB.insert('bank', mit);
  DB.update('importe', imp.id, { neu: added.length, doppelt: rows.length - added.length }).catch(() => { });
  return { name: b.name, n: rows.length, neu: added.length, von: parseDate(j.von), bis: parseDate(j.bis), probe, summe };
}

/* Variabel / fix: 1) wie bei den bisherigen Buchungen desselben Rechnungsstellers (Mehrheit, neueste gewinnt bei Gleichstand),
   2) sonst nach Art der Kosten: Personal/HR, Miete, Strom, Versicherung, Leasing, Telefon, Steuerberater, Verträge = fix; Material & Co. = variabel */
const FIX_KAT = ['Personalkosten', 'Raumkosten', 'Abschreibungen', 'Zinsaufwand'];
const FIX_UNTER = /miet|leasing|versicherung|kfz versicherung|telefon|lohn- und buchf|wartungskosten|abschluss|lizenzen|betriebliche steuern/i;
const FIX_NAME = /strom|energie|stadtwerke|rheinenergie|\be\.?on\b|\bgas\b|\bwasser\b|\bmiete\b|vermiet|telekom|vodafone|o2|1&1|versicherung|allianz|axa|ergo|huk|leasing|aok|barmer|techniker|krankenkasse|ikk|dak|bkk|knappschaft|berufsgenossenschaft|bghm|\bbg\b|lohn|gehalt|minijob|finanzamt|steuerberat|rundfunk|gez|software|abo|lizenz/i;
// Gleicher Rechnungssteller? Gleicher Name – oder gleiches erstes Wort, wenn es aussagekräftig ist („Dederichs“, nicht „Neue“, „Auto“, „Stadt“ …)
const ALLGEMEIN = new Set(['neue', 'neuer', 'auto', 'autohaus', 'stadt', 'stadtwerke', 'deutsche', 'firma', 'haus', 'kfz', 'reifen', 'service', 'services', 'handel', 'media', 'medien', 'gebr', 'gebrueder', 'dr', 'die', 'der', 'das', 'tankstelle', 'total', 'bau', 'autoteile', 'werkstatt']);
function gleicherSteller(a, b) {
  const na = norm(a || ''), nb = norm(b || ''); if (!na || !nb) return false; if (na === nb) return true;
  const ta = na.split(' '), tb = nb.split(' ');
  if (ta[0] === tb[0] && ta[0].length >= 4 && !ALLGEMEIN.has(ta[0])) return true;
  return ALLGEMEIN.has(ta[0]) && ta.length > 1 && tb.length > 1 && ta[0] === tb[0] && ta[1] === tb[1];   // „Autohaus Nolden“ = „Autohaus Nolden GmbH“
}
/* Durchlaufende Posten (ohne MwSt): amtliche Prüf-/Behördengebühren. TÜV, DEKRA, GTÜ, KÜS, Zulassungsstelle → ganzer Betrag
   (so steht es auch in der Excel: netto 0, MwSt 0, „Mwst.?“ Nein). Sonst wie bisher beim selben Rechnungssteller, sonst der von der KI gelesene Teilbetrag. */
const DLP_STELLER = /t(ü|ue)v\b|t(ü|ue)v |dekra|\bgt(ü|ue)\b|\bk(ü|ue)s\b|zulassungsstelle|stra(ß|ss)enverkehrsamt|kfz.?zulassung|kraftfahrt.?bundesamt/i;
function dlpAnwenden(row, x) {
  const b = +row.brutto || 0; if (!b) return;
  const vor = row.partner ? S.rechnungen.filter(r => r.richtung === 'eingang' && r.id !== row.id && (+r.brutto || 0) !== 0 && gleicherSteller(r.partner, row.partner)) : [];
  const vorVoll = vor.length && vor.filter(r => eq(Math.abs(+r.durchlaufend || 0), Math.abs(+r.brutto))).length > vor.length / 2;
  const ki = Math.abs(parseNum(x && x.durchlaufend) || 0);
  const voll = DLP_STELLER.test(row.partner || '') || vorVoll || (ki > 0 && eq(ki, Math.abs(b)));
  if (voll) Object.assign(row, { durchlaufend: b, netto: 0, mwst: 0, nach_dlp: 0, mwst_pflicht: false, notiz: [row.notiz, 'Durchlaufender Posten (ohne MwSt)'].filter(Boolean).join(' · ') });
  else if (ki > 0.005 && ki < Math.abs(b)) { const d = Math.sign(b) * ki; Object.assign(row, { durchlaufend: r2(d), nach_dlp: r2(b - d), mwst_pflicht: Math.abs(+row.mwst || 0) > 0.005 }); }
  // Kategorie wie bisher beim selben Rechnungssteller (TÜV steht in der Excel z. B. unter Materialaufwand)
  if (voll && vor.length) { const n = {}; vor.forEach(r => { if (r.kostenart) n[r.kostenart] = (n[r.kostenart] || 0) + 1; }); const k = Object.keys(n).sort((a, c) => n[c] - n[a])[0]; if (k) { row.kostenart = k; row.unterkonto = null; } }
}
// Schon angelegte Belege von TÜV/DEKRA & Co. ohne durchlaufenden Posten nachträglich richtigstellen (Excel-Zeilen bleiben wie sie sind)
async function dlpNachziehen() {
  const l = S.rechnungen.filter(r => r.richtung === 'eingang' && r.quelle !== 'excel' && !DOK_ARTEN.includes(r.art) && (+r.brutto || 0) !== 0 && !(+r.durchlaufend) && DLP_STELLER.test(r.partner || ''));
  for (const r of l) { const neu = { ...r, notiz: r.notiz }; dlpAnwenden(neu, null); await DB.update('rechnungen', r.id, { durchlaufend: neu.durchlaufend, netto: neu.netto, mwst: neu.mwst, nach_dlp: neu.nach_dlp, mwst_pflicht: neu.mwst_pflicht, kostenart: neu.kostenart, unterkonto: neu.unterkonto, notiz: neu.notiz }); }
  return l.length;
}
function fixVorschlag(r) {
  if (r.partner) {
    const vor = S.rechnungen.filter(x => x.richtung === 'eingang' && x.id !== r.id && x.fix != null && gleicherSteller(x.partner, r.partner)).sort((a, b) => (b.datum || '').localeCompare(a.datum || ''));
    if (vor.length) { const f = vor.filter(x => x.fix).length, v = vor.length - f; return f === v ? !!vor[0].fix : f > v; }
  }
  if (r.art === 'Vertrag') return true;
  if (FIX_KAT.includes(r.kostenart) || FIX_UNTER.test(r.unterkonto || '') || FIX_NAME.test(r.partner || '')) return true;
  return false;   // Material, Ersatzteile, Werkzeug, Werbung … = variabel
}
// Zahlart: 1) was auf der Rechnung steht (Lastschrift/SEPA, Überweisung, bar, Karte), 2) sonst wie bisher beim selben Rechnungssteller
function zahlartVorschlag(partner, x = {}) {
  const w = String(x.zahlweg || '').toLowerCase();
  if (/lastschrift|sepa|einzug/.test(w) || x.bezahlung === 'lastschrift') return 'sepa';
  if (/ueberweis|überweis/.test(w)) return 'bank';
  if (/bar/.test(w)) return 'bar';
  if (/karte|ec|paypal/.test(w)) return 'ec';
  if (!partner) return null;
  const vor = S.rechnungen.filter(r => r.richtung === 'eingang' && r.zahlart && gleicherSteller(r.partner, partner)).sort((a, b) => (b.datum || '').localeCompare(a.datum || ''));
  if (!vor.length) return null;
  const n = {}; vor.forEach(r => n[r.zahlart] = (n[r.zahlart] || 0) + 1);
  const best = Object.entries(n).sort((a, b) => b[1] - a[1] || (a[0] === vor[0].zahlart ? -1 : 1))[0][0];   // Mehrheit, bei Gleichstand die neueste
  return best;
}
// Fehlende Angaben nachtragen (z. B. bei per PDF angelegten Rechnungen)
async function fixNachziehen() {
  const l = S.rechnungen.filter(r => r.richtung === 'eingang' && r.fix == null && !DOK_ARTEN.includes(r.art) && (+r.brutto || 0) !== 0);
  for (let i = 0; i < l.length; i += 10) await Promise.all(l.slice(i, i + 10).map(r => DB.update('rechnungen', r.id, { fix: fixVorschlag(r) })));
  return l.length;
}

// Ursprüngliche Rechnung zu einer Gutschrift/Korrektur finden: Nummer laut Beleg (gleicher Lieferant bevorzugt),
// sonst eindeutig: gleicher Lieferant, Rechnung mit genau dem Betrag der Gutschrift in den 120 Tagen davor
function bezugFinden(nr, partner, g) {
  const tok = nameTokens(partner || '')[0] || '', gleich = r => tok && (nameTokens(r.partner || '')[0] || '') === tok;
  const kand = S.rechnungen.filter(r => r.richtung === (g.richtung || 'eingang') && r.id !== g.id && (+r.brutto || 0) > 0);
  if (nr) { const k = kand.filter(r => r.nummer && normNr(r.nummer) === normNr(nr)); const t = k.find(gleich) || (k.length === 1 ? k[0] : null); if (t) return t; }
  if (!tok || !g.brutto) return null;
  const k = kand.filter(r => gleich(r) && eq(+r.brutto, Math.abs(+g.brutto)) && (!g.datum || !r.datum || (r.datum <= g.datum && r.datum >= addDays(g.datum, -120))));
  return k.length === 1 ? k[0] : null;
}
const MLABEL = ['Mahnung', '2. Mahnung', '3. Mahnung'];
const MSTUFE = { 'Mahnung': 1, '2. Mahnung': 2, '3. Mahnung': 3 };
const MAHN_MERK = 'Aus Mahnung angelegt – Rechnungs-PDF fehlt noch';

/* ---------- Sammelkorb: Dateien erst sammeln (mehrmals reinziehen/auswählen), dann mit einem Klick verarbeiten ---------- */
const KORB = [];
const kb = n => n > 1e6 ? (n / 1e6).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(n / 1e3)) + ' KB';
const korbIcon = f => isTable(f) ? '📊' : /\.(eml|msg)$/i.test(f.name) ? '✉️' : /^image\//.test(f.type) ? '🖼' : '📄';
function korbAdd(files) {
  let neu = 0;
  [...files].forEach(f => { if (!KORB.some(k => k.name === f.name && k.size === f.size && k.lastModified === f.lastModified)) { KORB.push(f); neu++; } });
  korbRender(true); if (neu) toast(`${neu} Datei${neu === 1 ? '' : 'en'} im Stapel – weitere dazu oder „Verarbeiten“.`);
}
function korbRender(auf) {
  let el = $('#korb'); if (!KORB.length) { el?.remove(); return; }
  if (!el) { el = document.createElement('section'); el.id = 'korb'; el.className = 'korb'; el.setAttribute('aria-label', 'Stapel zum Verarbeiten'); document.body.appendChild(el); }
  if (auf) el.classList.remove('zu');
  const tab = KORB.filter(isTable).length, doc = KORB.length - tab;
  el.innerHTML = `<header data-act="korbZu"><b>📥 Stapel: ${KORB.length} Datei${KORB.length === 1 ? '' : 'en'}</b><span class="small muted">${[doc ? doc + ' Beleg' + (doc === 1 ? '' : 'e') : '', tab ? tab + ' Excel/CSV' : ''].filter(Boolean).join(' · ')}</span><span class="sp"></span><span class="kz">▾</span></header>
    <ul>${KORB.map((f, i) => `<li><span>${korbIcon(f)}</span><span class="kn" title="${esc(f.name)}">${esc(f.name)}</span><small class="muted">${kb(f.size)}</small><button class="icon-btn" data-act="korbDel" data-i="${i}" aria-label="${esc(f.name)} entfernen">✕</button></li>`).join('')}</ul>
    <p class="small muted">Weitere Dateien einfach ins Fenster ziehen – sie kommen dazu.</p>
    ${ablageMoeglich() ? (ABLAGE ? `<p class="small">📁 Umbenannte Belege kommen in: <b>${esc(ABLAGE.name)}</b></p>`
      : `<div class="warn small">Noch kein OneDrive-Ordner gewählt – die Belege würden nur in der App liegen. <button class="btn sm" data-act="ablageWahl" data-art="eingang">📁 Ordner wählen</button></div>`) : ''}
    ${ablageMoeglich() ? (ABLAGE_A ? `<p class="small">📁 Ausgangsrechnungen (Originalname) kommen in: <b>${esc(ABLAGE_A.name)}</b></p>`
      : `<div class="note small">Für eure eigenen Ausgangsrechnungen ist noch kein Ordner gewählt. <button class="btn sm" data-act="ablageWahl" data-art="ausgang">📁 Ordner Rechnungsausgang</button></div>`) : ''}
    <div class="btnrow"><button class="btn primary" data-act="korbGo">✓ Alle ${KORB.length} verarbeiten</button><button class="btn" data-act="korbPick">＋ Dateien</button><button class="btn" data-act="korbLeer">Leeren</button></div>`;
}
async function korbVerarbeiten() {
  const fs = KORB.splice(0); korbRender();
  if (!fs.length) return;
  try { await eingangDrop(fs); }
  catch (e) {   // nie mehr stillschweigend hängen bleiben: Fehler zeigen, Dateien zurück in den Stapel
    console.error(e); busy(false);
    fs.forEach(f => { if (!KORB.includes(f)) KORB.push(f); }); korbRender(true);
    toast('Verarbeiten abgebrochen: ' + (e.message || e) + ' – die Dateien liegen wieder im Stapel.');
  }
}
// Ordner-Erlaubnis abfragen, aber nicht ewig warten (die Browser-Abfrage oben an der Adresszeile wird leicht übersehen)
const ablageKurz = art => Promise.race([ablageOrdner(true, art).catch(() => null), new Promise(r => setTimeout(() => r(null), 15000))]);

async function eingangDrop(fileList) {
  const files = [...fileList];
  const tables = files.filter(isTable);
  if (tables.length) { tables.forEach(f => importAuto(f)); }
  const docs = files.filter(f => !isTable(f)); if (!docs.length) return;
  busy(true, (ABLAGE || ABLAGE_A) ? 'Ordner-Zugriff … falls oben im Browser gefragt wird: „Bearbeiten zulassen“' : 'Lese Belege …');
  // gleich beim Klick fragen – nur dann darf der Browser um Erlaubnis bitten; beide Ordner gleichzeitig, höchstens 15 s warten
  const [ablage, ablageA] = await Promise.all([ablageKurz('eingang'), ablageKurz('ausgang')]), logStart = ABLAGE_LOG.length;
  busy(true, 'Lese Belege …');
  const belege = []; for (const f of docs) { try { belege.push(...(await fileToBelege(f)).map(b => ({ ...b, quelle: f }))); } catch (e) { console.warn(e); } }   // quelle = Originaldatei (für „zurück in den Stapel“)
  if (!belege.length) { busy(false); return toast('Kein Beleg (PDF/Bild) gefunden.'); }
  const neu = [], doppelt = [], fehler = [], keine = [], ergaenzt = [], avise = [], mahnungen = [], mahnGesehen = new Set(), verknuepft = [], auszuege = [], ausgangNeu = [], umbenannt = [], zurueck = new Set();
  buildIdx();
  // Viele PDFs: immer 3 gleichzeitig von der KI lesen lassen
  let fertig = 0;
  busy(true, `${belege.length} Beleg${belege.length === 1 ? '' : 'e'}` + (DB.aiOn ? ' – KI liest …' : ' …'));
  // PDF an eine schon vorhandene Rechnung (z. B. aus der Excel) hängen statt sie doppelt anzulegen
  const anhaengen = async (r, b) => {
    // Ausgangsrechnung, deren Datei noch den alten Namen hat: neu ablegen als „R26-1526.pdf“, alte Datei entfernen
    if (r.datei && r.richtung === 'ausgang' && !/^R\d{2}-/i.test(r.dateiname || '')) {
      const alt = r.datei; await belegAnhaengen(r, b.file); await DB.removeFile(alt).catch(e => console.warn(e));
      umbenannt.push(S.rechnungen.find(x => x.id === r.id) || r); return;
    }
    // Rechnung wurde aus einer Mahnung angelegt (PDF = Mahnschreiben) → jetzt die echte Rechnungs-PDF hinterlegen
    if (r.datei && String(r.notiz || '').includes(MAHN_MERK)) {
      const alt = r.datei; await belegAnhaengen(r, b.file); await DB.removeFile(alt).catch(e => console.warn(e));
      const neu = S.rechnungen.find(x => x.id === r.id) || r;
      await DB.update('rechnungen', r.id, { notiz: String(neu.notiz || '').split(' · ').filter(t => t !== MAHN_MERK).join(' · ') || null });
      ergaenzt.push(neu); return;
    }
    if (r.datei) { doppelt.push(b.name + (r.nummer ? ' (Nr. ' + r.nummer + ', hat schon eine PDF)' : '')); return; }
    await belegAnhaengen(r, b.file); ergaenzt.push(r);
  };
  // Zahlungsavis: eigener Eintrag (Art „Zahlungsavis“, Betrag 0 → zählt nicht in GuV/Offene Posten), PDF benannt und abgelegt,
  // bei den genannten Rechnungen wird ein Hinweis in die Notiz geschrieben
  const avisAnlegen = async (x, b) => { const res = await avisSpeichern(x, b); if (!res) { doppelt.push(b.name); return; } avise.push(res); };
  // Mahnung / Zahlungserinnerung: angemahnte Rechnung(en) suchen, Status hochsetzen (Mahnung → 2. → 3. Mahnung),
  // fehlende Rechnungs-PDF ergänzen; das Mahnschreiben selbst wird als eigener Eintrag (Art „Mahnung“) mit PDF abgelegt.
  // Gibt true zurück, wenn nichts weiter zu tun ist; false = Rechnung noch nicht da → normal anlegen (mit Mahnstatus).
  const mahnungVerarbeiten = async (x, b) => {
    const stufe = Math.min(3, Math.max(1, parseInt(x.mahnung) || 1));
    const nrn = [...new Set([...(Array.isArray(x.mahnung_rechnungen) ? x.mahnung_rechnungen : []), x.nummer].map(n => String(n || '').trim()).filter(Boolean))];
    const ziele = S.rechnungen.filter(r => r.richtung === 'eingang' && r.art !== 'Mahnung' && r.art !== 'Zahlungsavis' && r.nummer && nrn.some(n => normNr(n) === normNr(r.nummer)));
    const mailKey = b.mail || b;   // eine Mail mit mehreren Anhängen nur einmal als Mahnung zählen
    const ersteMal = !mahnGesehen.has(mailKey); mahnGesehen.add(mailKey);
    const datum = parseDate(b.mail && b.mail.date) || parseDate(x.datum) || todayISO();
    // Zahlungserinnerung = 1. Mahnung. Es wird KEINE eigene Zeile angelegt – nur der Status der eigentlichen Rechnung geändert.
    if (ersteMal) {
      for (const r of ziele) {
        const merk = `am ${fmtD(datum)} erhalten`;
        if (String(r.notiz || '').includes(merk)) continue;   // dieselbe Erinnerung nochmal hochgeladen → nicht doppelt hochstufen
        const cur = MSTUFE[r.status_excel] || 0, neu = Math.min(3, Math.max(stufe, cur + 1)), label = MLABEL[neu - 1];
        const bezahlt = istBezahltLaut(r.status_excel) || (IDX.zByR.get(r.id) || []).length;
        const z = `${label} ${merk}${bezahlt ? ' – war als bezahlt markiert, bitte prüfen' : ''}`;
        await DB.update('rechnungen', r.id, { status_excel: label, bezahlt_extern: false, notiz: [r.notiz, z].filter(Boolean).join(' · ') });
      }
      if (ziele.length) mahnungen.push({ label: MLABEL[stufe - 1], partner: ziele[0].partner, nrn, ziele: ziele.map(r => S.rechnungen.find(y => y.id === r.id)) });
    }
    if (ziele.length) {
      // Rechnung hängt an der Mahnung und hat noch keine PDF → ergänzen
      const r = x.nummer && ziele.find(r => normNr(r.nummer) === normNr(x.nummer));
      if (r && !r.datei && x.ist_rechnung !== false && x.brutto) { await belegAnhaengen(r, b.file); ergaenzt.push(r); }
      return true;
    }
    // Angemahnte Rechnung ist noch nicht in der App: mit Nummer und Betrag direkt als Rechnung mit Mahnstatus anlegen
    if (x.nummer && x.brutto) { x._mahnStatus = MLABEL[stufe - 1]; x._ausMahnung = x.ist_rechnung === false; x.ist_rechnung = true; if (!['Rechnung', 'Korrektur'].includes(x.art)) x.art = 'Rechnung'; return false; }
    if (ersteMal) mahnungen.push({ label: MLABEL[stufe - 1], partner: String(x.lieferant || '').trim() || b.name, nrn, ziele: [], fehlt: true });
    return true;
  };
  const eins = async b => {
    try {
      // Mail ohne PDF-Anhang: aus dem Mailtext eine PDF machen, damit jede Buchung eine PDF hat
      if (b.type === 'message/rfc822' && b.mail) { b.file = new File([textPdf(b.mail.subject || 'E-Mail', `Von: ${b.mail.from}\n\n${b.mail.text}`)], (b.mail.subject || 'Mail') + '.pdf', { type: 'application/pdf' }); b.type = 'application/pdf'; b.name = b.file.name; }
      // Eigene Kundenrechnung (R26-…) am Dateinamen erkannt → PDF direkt an die Ausgangsrechnung, ohne KI
      const eigen = ausgangAusText(b.name); if (eigen) return anhaengen(eigen, b);
      // Kontoauszug (am Dateinamen erkannt) → alle Buchungen in die Bank
      if (istAuszugName(b.name) && DB.aiOn) { auszuege.push(await kontoauszugImport(b)); return; }
      let x = null;
      // KI nicht erreichbar (nach 3 Versuchen): nichts Halbes anlegen – Datei zurück in den Stapel zum erneuten Verarbeiten
      if (DB.aiOn) { try { x = await kiBelegLesen(b); } catch (e) { zurueck.add(b.quelle || b.file); fehler.push(b.name + ': ' + aiErr(e) + ' – liegt wieder im Stapel'); return; } }
      if (x && x.kontoauszug) { auszuege.push(await kontoauszugImport(b)); return; }   // KI hat einen Kontoauszug erkannt
      if (x && +x.mahnung > 0 && await mahnungVerarbeiten(x, b)) return;
      if (x && x.ist_rechnung === false) { keine.push(b.name); return; }
      x = x || {};
      if (x.art === 'Zahlungsavis') return avisAnlegen(x, b);
      if (x.eigene_rechnung) {
        const r = ausgangAusText(x.nummer) || ausgangAusText(b.name); if (r) return anhaengen(r, b);
        // Noch nicht im Werkstatt Journal: Ausgangsrechnung aus der PDF anlegen (Originalname, Ordner „Rechnungsausgang“)
        const nummer = String(x.nummer || '').trim(), datum = parseDate(x.datum) || todayISO();
        if (!nummer) { fehler.push(`${b.name}: eigene Rechnung ohne erkennbare Nummer – bitte von Hand anlegen`); return; }
        const za = /bar/i.test(x.zahlart) ? 'bar' : /ec|karte/i.test(x.zahlart) ? 'ec' : /ueberw|überw|bank/i.test(x.zahlart) ? 'bank' : null;
        const brutto = parseNum(x.brutto), netto = parseNum(x.netto);
        const row = { richtung: 'ausgang', nummer, datum, faellig: parseDate(x.faellig), partner: String(x.lieferant || '').trim() || 'Kunde', kennzeichen: String(x.kennzeichen || '').toUpperCase().trim() || null,
          kundennr: String(x.kundennr || '').trim() || null, brutto: r2(brutto || 0), netto, mwst: parseNum(x.mwst), lohn: parseNum(x.lohn), teile: parseNum(x.teile), zahlart: za,
          status_excel: za === 'bar' || za === 'ec' ? 'Bezahlt' : 'Offen', quelle: 'ki', geprueft: false, schluessel: 'A:' + normNr(nummer), dateiname: b.name };
        Object.assign(row, await belegSpeichern(row, b.file));
        const [neuA] = await DB.insert('rechnungen', [row]); if (!neuA) { doppelt.push(b.name); return; }
        if (za === 'bar') await DB.insert('zuordnungen', [{ rechnung_id: neuA.id, betrag: neuA.brutto, art: 'bar', datum, notiz: 'Laut Rechnung bar bezahlt' }]);
        ausgangNeu.push(neuA); return;
      }
      const fh = await fileHash(b.file);
      let brutto = parseNum(x.brutto), netto = parseNum(x.netto), mwst = parseNum(x.mwst);
      if (brutto == null && netto != null) brutto = r2(netto + (mwst || 0));
      // Gutschrift / mindernde Korrektur / Storno = Einnahme → immer negativ (die KI liefert Beträge mal mit, mal ohne Minus)
      const mindert = x.gutschrift || (brutto != null && brutto < 0) || (netto != null && netto < 0) || ['Gutschrift', 'Storno'].includes(x.art) || (x.art === 'Korrektur' && (x.nachberechnung !== true || /r(ü|ue)ckgabe|retoure?|return|gutschrift|erstatt|storn/i.test(String(x.beschreibung || ''))));   // Rückgabe/Retoure = immer Minderung
      if (mindert) { if (brutto != null) brutto = -Math.abs(brutto); if (netto) netto = -Math.abs(netto); if (mwst) mwst = -Math.abs(mwst); if (x.art !== 'Korrektur' && x.art !== 'Storno') x.gutschrift = true; }
      const partner = String(x.lieferant || '').trim() || (b.mail && b.mail.from ? b.mail.from.replace(/<.*>/, '').trim() : '');
      const nummer = String(x.nummer || '').trim();
      const schluessel = nummer ? 'E:' + (nameTokens(partner)[0] || '') + ':' + normNr(nummer) : 'F:' + fh;
      if (S.rechnungen.some(r => r.schluessel === 'F:' + fh)) { doppelt.push(b.name); return; }
      // Gleiche Rechnung schon da (auch aus der Excel, dort hat der Schlüssel noch „:R“/„:G“) → nur die PDF ergänzen
      const tok = nameTokens(partner)[0] || '';
      // gleiche Nummer – auch anders geschrieben („RE-0390016“ = „390016“): nur die Ziffern ohne führende Nullen vergleichen
      const kern = n => String(n || '').replace(/\D/g, '').replace(/^0+/, ''), nk = kern(nummer);
      const gleicheNr = r => normNr(r.nummer) === normNr(nummer) || (nk.length >= 4 && kern(r.nummer) === nk);
      const da = nummer && S.rechnungen.find(r => r.richtung === 'eingang' && r.nummer && gleicheNr(r) && !(brutto && (+r.brutto || 0) * brutto < 0) &&   // Gutschrift ≠ Rechnung
        (r.schluessel === schluessel || (tok && (nameTokens(r.partner || '')[0] || '') === tok) || (brutto != null && eq(Math.abs(r.brutto || 0), Math.abs(brutto)))));
      if (da) return anhaengen(da, b);
      const datum = parseDate(x.datum) || todayISO();
      // Buchung aus der Excel ohne (oder mit anders geschriebener) Rechnungsnummer: gleiche Firma, gleicher Betrag, Datum ±5 Tage, noch keine PDF → PDF dort anhängen
      if (tok && brutto != null) {
        const c = S.rechnungen.filter(r => r.richtung === 'eingang' && !r.datei && !DOK_ARTEN.includes(r.art) && eq(+r.brutto || 0, brutto) && (nameTokens(r.partner || '')[0] || '') === tok
          && r.datum && Math.abs(daysBetween(r.datum, datum)) <= 5 && !(nummer && r.nummer && normNr(r.nummer) !== normNr(nummer) && !normNr(r.nummer).includes(normNr(nummer)) && !normNr(nummer).includes(normNr(r.nummer))));
        if (c.length === 1) { if (nummer && !c[0].nummer) await DB.update('rechnungen', c[0].id, { nummer }); return anhaengen(S.rechnungen.find(r => r.id === c[0].id) || c[0], b); }
      }
      const row = { richtung: 'eingang', nummer: nummer || null, datum, faellig: parseDate(x.faellig), partner: partner || b.name, netto, mwst, brutto: r2(brutto || 0),
        kostenart: KOSTENARTEN.includes(x.kostenart) ? x.kostenart : kostenartVorschlag('', partner),
        unterkonto: UNTERKONTEN(x.kostenart).includes(x.unterkonto) ? x.unterkonto : null, art: x.gutschrift ? 'Gutschrift' : (['Rechnung', 'Korrektur', 'Vertrag', 'Beleg'].includes(x.art) ? x.art : 'Rechnung'), iban: String(x.iban || '').replace(/\s/g, '').toUpperCase() || null,
        beschreibung: String(x.beschreibung || '').trim() || (b.mail ? b.mail.subject : null), zahlart: zahlartVorschlag(partner, x),
        datei: null, dateiname: b.name, quelle: DB.aiOn && x.brutto != null ? 'ki' : 'manuell', geprueft: false, schluessel,
        status_excel: x._mahnStatus ? x._mahnStatus : x.bezahlung === 'bereits_bezahlt' ? 'Bezahlt' : (x.bezahlung === 'lastschrift' || zahlartVorschlag(partner, x) === 'sepa') ? 'Abbuchung offen' : 'Offen',
        notiz: x._ausMahnung ? `${x._mahnStatus} ${'am ' + fmtD(parseDate(b.mail && b.mail.date) || datum) + ' erhalten'} · ${MAHN_MERK}` : x.bezahlung === 'lastschrift' ? 'Laut Beleg per Lastschrift' : x.bezahlung === 'bereits_bezahlt' ? 'Laut Beleg bereits bezahlt' : null };
      // Datei nach Schema benennen: VE Sport_Lieferant_Art_Nummer_Datum.pdf – in der Cloud und (falls gewählt) im Ablage-Ordner
      row.fix = fixVorschlag(row);   // variabel / fix wie bisher beim selben Rechnungssteller
      dlpAnwenden(row, x);           // TÜV/DEKRA & Co.: durchlaufender Posten, keine MwSt
      // Gutschrift / Korrektur / Storno zu einer Rechnung → direkt verknüpfen (wird dort verrechnet)
      if (x.art === 'Korrektur' || x.art === 'Storno') row.art = x.art;
      const orig = (['Gutschrift', 'Korrektur', 'Storno'].includes(row.art) || row.brutto < 0) ? bezugFinden(x.bezug_rechnung, partner, row) : null;
      if (orig) { row.bezug_id = orig.id; row.notiz = [row.notiz, `Gehört zu Rechnung ${orig.nummer || ''}`].filter(Boolean).join(' · '); }
      Object.assign(row, await belegSpeichern(row, b.file));
      const added = await DB.insert('rechnungen', [row]);
      if (orig && added.length) verknuepft.push({ g: added[0], r: orig });
      if (added.length) neu.push(added[0]); else doppelt.push(b.name);
    } catch (e) { console.error(e); const netz = /fetch|network|timeout|load failed/i.test(String(e.message || e)); if (netz) zurueck.add(b.quelle || b.file);
      fehler.push(b.name + ': ' + (netz ? 'Verbindung unterbrochen – liegt wieder im Stapel' : (e.message || e))); }
    finally { fertig++; busy(true, `Belege: ${fertig} von ${belege.length} fertig` + (DB.aiOn ? ' – KI liest …' : ' …')); }
  };
  const warte = belege.slice();
  await Promise.all([0, 1, 2].map(async () => { while (warte.length) await eins(warte.shift()); }));
  if (zurueck.size) { [...zurueck].forEach(f => { if (!KORB.includes(f)) KORB.push(f); }); korbRender(true); }   // gescheiterte Dateien liegen wieder im Stapel → einfach nochmal „Verarbeiten“
  busy(true, 'Gleiche mit Bank ab …');
  const res = await autoAbgleich().catch(() => ({ n: 0 }));
  const nurAusgang = (ausgangNeu.length || ergaenzt.some(r => r.richtung === 'ausgang')) && !neu.length && !avise.length && !ergaenzt.some(r => r.richtung === 'eingang');
  busy(false); UI.view = auszuege.length && !neu.length && !ergaenzt.length && !avise.length && !ausgangNeu.length ? 'bank' : nurAusgang ? 'ausgang' : 'eingang'; render();
  // Neue Eingangsrechnungen → gleich als Prüfliste im Excel-Look (prüfen, korrigieren, freigeben); alles andere darüber
  const kopf = `${neu.length ? `<p><b>${neu.length}</b> Eingangsrechnung${neu.length === 1 ? '' : 'en'} ${DB.aiOn ? 'von der KI ausgelesen' : 'angelegt (Beträge bitte eintragen – KI nur online)'}.${res.n ? ' ' + res.n + ' Zahlung(en) automatisch zugeordnet.' : ''}</p>` : ''}
    ${ablageMeldung(ABLAGE_LOG.slice(logStart))}`;
  const weitere = `
    ${ergaenzt.length ? `<p><b>${ergaenzt.length}</b> PDF${ergaenzt.length === 1 ? '' : 's'} an vorhandene Rechnungen gehängt:</p><div class="tw"><table class="tb click"><tbody>${ergaenzt.map(r => `<tr data-act="rechnung" data-id="${r.id}"><td>${r.richtung === 'ausgang' ? '↗ Ausgang' : '↘ Eingang'}</td><td>${esc(r.partner || '')}</td><td class="mono">${esc(r.nummer || '–')}</td><td>${fmtD(r.datum)}</td><td class="num">${fmtE(r.brutto)}</td></tr>`).join('')}</tbody></table></div>` : ''}
    ${umbenannt.length ? `<p><b>${umbenannt.length}</b> Ausgangsrechnung${umbenannt.length === 1 ? '' : 'en'}: PDF neu abgelegt unter der Rechnungsnummer (in der App, im Ordner und ab der nächsten Sicherung):</p><div class="tw"><table class="tb click"><tbody>${umbenannt.slice(0, 50).map(r => `<tr data-act="rechnung" data-id="${r.id}"><td class="mono">${esc(r.nummer || '')}</td><td>${esc(r.partner || '')}</td><td class="small">${esc(r.dateiname || '')}</td></tr>`).join('')}</tbody></table></div>${umbenannt.length > 50 ? `<p class="small muted">… und ${umbenannt.length - 50} weitere</p>` : ''}` : ''}
    ${ausgangNeu.length ? `<p><b>${ausgangNeu.length}</b> Ausgangsrechnung${ausgangNeu.length === 1 ? '' : 'en'} aus der PDF angelegt (Dateiname = Rechnungsnummer) – bitte kurz prüfen:</p><div class="tw"><table class="tb click"><tbody>${ausgangNeu.map(r => `<tr data-act="rechnung" data-id="${r.id}"><td class="mono">${esc(r.nummer)}</td><td>${esc(r.partner || '')}</td><td>${fmtD(r.datum)}</td><td class="num">${fmtE(r.brutto)}</td><td class="small">${esc(r.dateiname || '')}</td></tr>`).join('')}</tbody></table></div>` : ''}
    ${auszuege.length ? `<p><b>${auszuege.length}</b> ${auszuege.length === 1 ? 'Kontoauszug' : 'Kontoauszüge'} eingelesen und mit den Ein- und Ausgaben abgeglichen${res.n ? ` – <b>${res.n}</b> Zahlung${res.n === 1 ? '' : 'en'} automatisch zugeordnet` : ''}:</p><div class="tw"><table class="tb click"><tbody>${auszuege.map(x => `<tr><td>🏦 ${esc(x.name)}</td><td>${x.von ? fmtD(x.von) + ' – ' + fmtD(x.bis) : ''}</td><td class="num">${x.n} Buchungen</td><td>${x.neu} neu${x.n - x.neu ? ', ' + (x.n - x.neu) + ' schon da' : ''}</td><td>${x.probe === 'ok' ? badge({ cls: 'st-ok', label: '✓ Saldo stimmt' }) : x.probe ? badge({ cls: 'st-warn', label: x.probe }) : ''}</td></tr>`).join('')}</tbody></table></div>` : ''}
    ${verknuepft.length ? `<p><b>${verknuepft.length}</b> Gutschrift${verknuepft.length === 1 ? '' : 'en'}/Korrektur${verknuepft.length === 1 ? '' : 'en'} direkt mit der Rechnung verknüpft:</p><div class="tw"><table class="tb click"><tbody>${verknuepft.map(({ g, r }) => `<tr data-act="rechnung" data-id="${r.id}"><td>${esc(g.art || 'Gutschrift')} ${esc(g.nummer || '')}</td><td class="num">${fmtE(g.brutto)}</td><td>→ ${esc(r.nummer || '')} ${esc(r.partner || '')}</td><td class="num">${fmtE(r.brutto)}</td><td>noch offen ${fmtE(Math.max(0, rStatus(r).offen))}</td></tr>`).join('')}</tbody></table></div>` : ''}
    ${mahnungen.length ? `<p><b>${mahnungen.length}</b> Mahnung${mahnungen.length === 1 ? '' : 'en'} erkannt:</p><div class="tw"><table class="tb click"><tbody>${mahnungen.map(m => m.ziele.length ? m.ziele.map(r => `<tr data-act="rechnung" data-id="${r.id}"><td>${esc(m.label)}</td><td>${esc(r.partner || '')}</td><td class="mono">${esc(r.nummer || '')}</td><td class="num">${fmtE(r.brutto)}</td><td>→ Status jetzt <b>${esc(r.status_excel)}</b></td></tr>`).join('')
      : `<tr><td>${esc(m.label)}</td><td>${esc(m.partner)}</td><td class="mono">${esc(m.nrn.join(', '))}</td><td></td><td class="muted">Rechnung ist noch nicht in der App und in der Mahnung stand kein Betrag – bitte die Rechnung hochladen, dann die Mahnung nochmal</td></tr>`).join('')}</tbody></table></div>` : ''}
    ${avise.length ? `<p><b>${avise.length}</b> Zahlungsavis abgelegt (unter „Zahlungsavis“, nicht im Rechnungseingang):</p><div class="tw"><table class="tb click"><tbody>${avise.map(({ a, bezug }) => `<tr data-act="avisD" data-id="${a.id}"><td>📨 ${esc(a.partner || '')}</td><td>${fmtD(a.datum)}</td><td class="num">${a.betrag != null ? fmtE(a.betrag) : ''}</td><td class="small">${bezug.length ? '→ ' + bezug.map(x => esc(x.nummer || '') + ' (' + esc(x.status_excel || '') + ')').join(', ') : '<span class="muted">keine passende Rechnung gefunden</span>'}</td><td>${a.bank_id ? badge({ cls: 'st-ok', label: '✓ in Bank' }) : badge({ cls: 'st-warn', label: 'Abbuchung offen' })}</td></tr>`).join('')}</tbody></table></div>` : ''}
    ${doppelt.length ? `<div class="warn">Schon vorhanden, nicht nochmal angelegt: ${doppelt.map(esc).join(', ')}</div>` : ''}
    ${keine.length ? `<div class="note">Keine Rechnung (übersprungen): ${keine.map(esc).join(', ')}</div>` : ''}
    ${zurueck.size ? `<div class="warn"><b>${zurueck.size} Datei${zurueck.size === 1 ? '' : 'en'}</b> konnte${zurueck.size === 1 ? '' : 'n'} wegen einer Verbindungsstörung nicht verarbeitet werden (auch nach 3 Versuchen). Sie liegen wieder unten rechts im Stapel – einfach nochmal „Verarbeiten“ klicken. Es wurde für sie nichts angelegt.</div>` : ''}
    ${fehler.length ? `<details class="xl"><summary>Probleme im Einzelnen (${fehler.length})</summary><div class="small">${fehler.map(esc).join('<br>')}</div></details>` : ''}`;
  if (neu.length) pruefAnsicht(neu.map(r => r.id), kopf + (weitere.trim() ? `<details class="xl"><summary>Weitere Ergebnisse dieses Stapels</summary>${weitere}</details>` : ''));
  else openSheet({ title: 'Belege übernommen', noOk: true, wide: true, html: kopf + weitere });
}

// Excel/CSV erkannt: anhand der Spalten raten, welcher Import gemeint ist
async function importAuto(file) {
  try {
    const t = await readTable(file);
    if (Object.keys(mappeBlaetter(t)).length) return importMappe(file, t);   // Arbeitsmappe, Werkstatt Journal oder Barkasse (am Namen oder an den Überschriften erkannt)
    const rows = t.sheets[0]?.rows || [];
    const type = detectType(rows);
    toast('Erkannt: ' + IMP[type].label);
    importFile(type, file);
  } catch (e) { toast('Datei nicht lesbar: ' + e.message); }
}
