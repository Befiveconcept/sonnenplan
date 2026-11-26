/* Mastercar Finanzen · Prüfliste für neu ausgelesene Eingangsrechnungen
   Nach dem Hochladen erscheinen die von der KI gelesenen Rechnungen als Tabelle im Look der Excel-Mappe („Ein- und Ausgaben“).
   Jede Zelle ist direkt änderbar, PDF per Klick ansehen, Stichproben abhaken und freigeben – oder alles auf einmal.
   Auf Wunsch als echte Excel-Datei (.xlsx) herunterladen. Freigegeben = „geprüft“. */

const pruefOffen = () => S.rechnungen.filter(r => r.richtung === 'eingang' && !r.geprueft && !DOK_ARTEN.includes(r.art))
  .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || '') || (b.datum || '').localeCompare(a.datum || ''));

const PR_SPALTEN = [
  ['datum', 'Rechnungsdatum', 'date'], ['partner', 'Firma', 'text'], ['art', 'Art', 'art'], ['nummer', 'Rechnungsnr.', 'text'], ['kostenart', 'Kategorie', 'kat'],
  ['fix', 'Variabel / fix', 'fix'], ['zahlart', 'Zahlart', 'za'], ['brutto', 'Preis gesamt brutto', 'num'], ['netto', 'Preis netto', 'num'], ['mwst', 'MwSt.', 'num'],
  ['skonto', 'Skonto', 'num'], ['durchlaufend', 'Durchl. Posten', 'num'], ['faellig', 'Fällig', 'date'], ['status_excel', 'Erledigt?', 'st'], ['iban', 'IBAN', 'text'], ['notiz', 'Notiz', 'text']
];
const prOpt = (l, v) => l.map(([k, t]) => `<option value="${esc(k)}" ${String(v ?? '') === String(k) ? 'selected' : ''}>${esc(t)}</option>`).join('');
function prZelle(r, [k, , typ]) {
  const v = r[k], n = `data-f="${k}"`;
  if (typ === 'date') return `<input class="pr-i" type="date" ${n} value="${esc(v || '')}">`;
  if (typ === 'num') return `<input class="pr-i num" type="text" inputmode="decimal" ${n} value="${v == null ? '' : String(r2(Math.abs(v))).replace('.', ',')}">`;
  if (typ === 'art') return `<select class="pr-i" ${n}>${prOpt(['Rechnung', 'Gutschrift', 'Korrektur', 'Vertrag', 'Beleg', 'Storno'].map(x => [x, x]), v || 'Rechnung')}</select>`;
  if (typ === 'kat') return `<select class="pr-i" ${n}><option value="">–</option>${prOpt(KOSTENARTEN.map(x => [x, x]), v)}</select>`;
  if (typ === 'fix') return `<select class="pr-i" ${n}>${prOpt([['0', 'Variabel'], ['1', 'Fix']], v ? '1' : '0')}</select>`;
  if (typ === 'za') return `<select class="pr-i" ${n}><option value="">–</option>${prOpt(Object.entries(ZA), v)}</select>`;
  if (typ === 'st') return `<select class="pr-i" ${n}>${prOpt(stListe('eingang').map(x => [x, x]), v || 'Offen')}</select>`;
  return `<input class="pr-i" type="text" ${n} value="${esc(v || '')}">`;
}
// Werte einer Zeile aus den Feldern lesen (Gutschrift/Storno negativ wie überall)
function prWerte(tr) {
  const g = k => tr.querySelector(`[data-f="${k}"]`)?.value ?? '', n = k => { const x = parseNum(g(k)); return x == null ? null : Math.abs(x); };
  const art = g('art'), neg = ['Gutschrift', 'Storno'].includes(art) ? -1 : 1, sg = x => x == null ? null : r2(neg * x);
  return { datum: g('datum') || null, partner: g('partner').trim(), art, nummer: g('nummer').trim() || null, kostenart: g('kostenart') || null, fix: g('fix') === '1', zahlart: g('zahlart') || null,
    brutto: sg(n('brutto')) ?? 0, netto: sg(n('netto')), mwst: sg(n('mwst')), skonto: sg(n('skonto')), durchlaufend: n('durchlaufend'), faellig: g('faellig') || null, status_excel: g('status_excel') || null,
    iban: g('iban').replace(/\s/g, '').toUpperCase() || null, notiz: g('notiz').trim() || null };
}

function pruefAnsicht(ids, vorspann = '') {
  const list = (ids ? ids.map(id => S.rechnungen.find(r => r.id === id)).filter(Boolean) : pruefOffen());
  const d = openSheet({
    title: `Eingangsrechnungen prüfen & freigeben (${list.length})`, wide: true, noOk: true, html: `
    ${vorspann}
    <p class="small muted">So wie in eurer Excel „Ein- und Ausgaben“. Jede Zelle lässt sich direkt ändern. Stichproben ansehen (📄), abhaken und freigeben – oder „Alle freigeben“. Freigegebene verschwinden aus dieser Liste.</p>
    ${list.length ? `<div class="pr-bar"><label class="chk inline"><input type="checkbox" id="prAlle"> alle markieren</label><span class="sp"></span>
      <button class="btn" data-pr="xlsx">⬇ Als Excel</button><button class="btn" data-pr="markiert">✓ Markierte freigeben</button><button class="btn primary" data-pr="alle">✓ Alle ${list.length} freigeben</button></div>
    <div class="tw pr-tw"><table class="tb pr-tab"><thead><tr><th>✓</th><th>PDF</th>${PR_SPALTEN.map(s => `<th>${esc(s[1])}</th>`).join('')}</tr></thead><tbody>
      ${list.map(r => `<tr data-id="${r.id}" class="${r.quelle === 'ki' ? 'pr-ki' : ''}"><td><input type="checkbox" class="pr-ok"></td><td>${r.datei ? `<button class="icon-btn" data-pdf="${r.id}" title="PDF ansehen">📄</button>` : ''}</td>${PR_SPALTEN.map(s => `<td class="c-${s[0]}">${prZelle(r, s)}</td>`).join('')}</tr>`).join('')}
    </tbody></table></div>` : '<div class="empty">Alles geprüft – nichts offen. ✓</div>'}` });
  const geaendert = new Set();
  d.addEventListener('input', e => { const tr = e.target.closest('tr[data-id]'); if (tr && e.target.classList.contains('pr-i')) { geaendert.add(tr.dataset.id); tr.classList.add('pr-dirty'); } });
  d.addEventListener('change', e => {
    if (e.target.id === 'prAlle') $$('.pr-ok', d).forEach(c => c.checked = e.target.checked);
    const tr = e.target.closest('tr[data-id]'); if (tr && e.target.classList.contains('pr-i')) { geaendert.add(tr.dataset.id); tr.classList.add('pr-dirty'); }
  });
  const freigeben = async trs => {
    if (!trs.length) return toast('Bitte erst Zeilen abhaken.');
    busy(true, 'Freigeben …');
    try {
      for (const tr of trs) { const id = tr.dataset.id, p = { geprueft: true }; if (geaendert.has(id)) Object.assign(p, prWerte(tr)); await DB.update('rechnungen', id, p); tr.remove(); }
      await autoAbgleich().catch(() => { });
    } finally { busy(false); }
    toast(`${trs.length} Rechnung${trs.length === 1 ? '' : 'en'} freigegeben.`); render();
    const rest = $$('tr[data-id]', d).length; $('h2', d).textContent = `Eingangsrechnungen prüfen & freigeben (${rest})`;
    if (!rest) closeSheet();
  };
  d.addEventListener('click', async e => {
    const b = e.target.closest('[data-pr]')?.dataset.pr;
    if (b === 'alle') return freigeben($$('tr[data-id]', d));
    if (b === 'markiert') return freigeben($$('tr[data-id]', d).filter(tr => $('.pr-ok', tr).checked));
    if (b === 'xlsx') return pruefExcel($$('tr[data-id]', d));
    const p = e.target.closest('[data-pdf]');
    if (p) { const r = S.rechnungen.find(x => x.id === p.dataset.pdf), w = window.open('', '_blank'); try { const u = await DB.fileUrl(r.datei); if (w) w.location = u; } catch (er) { if (w) w.close(); toast('PDF nicht gefunden.'); } }
  });
  return d;
}

// Prüfliste als echte Excel-Datei (gleiche Spalten wie in der Mappe)
function pruefExcel(trs) {
  const rows = trs.map(tr => { const w = prWerte(tr), r = S.rechnungen.find(x => x.id === tr.dataset.id) || {}; const o = {};
    PR_SPALTEN.forEach(([k, t, typ]) => { let v = w[k]; if (typ === 'fix') v = v ? 'Fix' : 'Variabel'; else if (typ === 'za') v = ZA[v] || ''; else if (typ === 'date') v = v ? fmtD(v) : ''; o[t] = v ?? ''; });
    o['Einnahme/ Ausgabe'] = (w.brutto || 0) < 0 ? 'Einnahme' : 'Ausgabe'; o['Datei'] = r.dateiname || ''; return o; });
  const ws = XLSX.utils.json_to_sheet(rows), wb = XLSX.utils.book_new();
  ws['!cols'] = Object.keys(rows[0] || {}).map(k => ({ wch: Math.min(40, Math.max(10, k.length + 2)) }));
  XLSX.utils.book_append_sheet(wb, ws, 'Zur Prüfung');
  XLSX.writeFile(wb, `Eingangsrechnungen zur Prüfung ${fmtD(todayISO())}.xlsx`);
}
