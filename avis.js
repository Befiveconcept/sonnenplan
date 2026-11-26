/* Mastercar Finanzen · Zahlungsavise
   Eigene Ablage (Tabelle „avise“), NICHT im Rechnungseingang. Ein Avis kündigt eine Abbuchung an:
   – die genannten Rechnungen bekommen den Status „Abbuchung offen“ (außer sie sind schon bezahlt / in der Bank gefunden)
     und in der Tabelle den Vermerk „📨 Avis …“
   – das Avis selbst wird mit der Bank abgeglichen (gleicher Betrag als Abbuchung, gleicher Absender, kurz vor/nach dem Avis-Datum). */

const AVIS_ZEITRAUM = [-10, 45];   // Tage vor/nach dem Avis-Datum, in denen die Abbuchung erwartet wird

// Welche Avise gehören zu einer Rechnung? (für den Vermerk in der Tabelle)
function avisZu(rid) { return (S.avise || []).filter(a => (a.rechnung_ids || []).includes(rid)); }
const avisVermerk = r => avisZu(r.id).map(a => `📨 Avis ${a.nummer || ''} ${fmtD(a.datum)}${a.betrag != null ? ' · ' + fmtE(a.betrag) : ''}`.replace(/\s+/g, ' ').trim()).join(' · ');

const istBezahltR = r => { const k = rStatus(r).key; return ['bezahlt', 'erledigt', 'extern', 'storno', 'ueber', 'doppelt', 'verrechnet'].includes(k); };

// Rechnungsnummern aus dem Avis in Rechnungen der App übersetzen
function avisRechnungen(nrn, partner) {
  const tok = nameTokens(partner || '')[0] || '';
  return nrn.map(n => {
    const kand = S.rechnungen.filter(r => r.nummer && normNr(r.nummer) === normNr(n));
    return kand.find(r => r.richtung === 'eingang' && tok && (nameTokens(r.partner || '')[0] || '') === tok) || kand.find(r => r.richtung === 'eingang') || ausgangAusText(n) || kand[0];
  }).filter(Boolean);
}

// Passende Abbuchung in der Bank suchen
function avisBank(a) {
  if (!a.betrag || !a.datum) return null;
  const tok = nameTokens(a.partner || '')[0] || '', bis = addDays(a.datum, AVIS_ZEITRAUM[1]), von = addDays(a.datum, AVIS_ZEITRAUM[0]);
  const vergeben = new Set((S.avise || []).filter(x => x.id !== a.id && x.bank_id).map(x => x.bank_id));
  const k = S.bank.filter(b => b.betrag < 0 && eq(Math.abs(b.betrag), Math.abs(a.betrag)) && b.datum >= von && b.datum <= bis && !vergeben.has(b.id));
  return k.find(b => tok && norm((b.gegenpartei || '') + ' ' + (b.zweck || '')).includes(tok)) || (k.length === 1 ? k[0] : null);
}

// Status der zugehörigen Rechnungen nachziehen: offen → „Abbuchung offen“
async function avisStatus(a) {
  for (const id of a.rechnung_ids || []) {
    const r = S.rechnungen.find(x => x.id === id); if (!r || r.richtung !== 'eingang' || istBezahltR(r)) continue;
    if (!/^(abbuchung offen|mahnung|2\. mahnung|3\. mahnung)$/i.test(r.status_excel || '')) await DB.update('rechnungen', r.id, { status_excel: 'Abbuchung offen', bezahlt_extern: false });
  }
}

// Neues Avis aus einem Beleg (x = KI-Ergebnis, b = Beleg). Gibt {a, bezug} oder null (schon vorhanden).
async function avisSpeichern(x, b) {
  const fh = await fileHash(b.file), schluessel = 'AV:' + fh;
  if ((S.avise || []).some(a => a.schluessel === schluessel)) return null;
  const partner = String(x.lieferant || '').trim() || (b.mail && b.mail.from ? b.mail.from.replace(/<.*>/, '').trim() : b.name);
  const datum = parseDate(x.datum) || todayISO(), betrag = parseNum(x.avis_betrag);
  const nrn = [...new Set((Array.isArray(x.avis_rechnungen) ? x.avis_rechnungen : []).map(n => String(n).trim()).filter(Boolean))];
  const bezug = avisRechnungen(nrn, partner);
  const row = { datum, partner, nummer: String(x.nummer || '').trim() || null, betrag: betrag != null ? r2(Math.abs(betrag)) : null, rechnung_ids: bezug.map(r => r.id), rechnung_nrn: nrn.join(', ') || null, schluessel };
  Object.assign(row, await belegSpeichern({ richtung: 'eingang', art: 'Zahlungsavis', partner, nummer: row.nummer, datum }, b.file));
  const bk = avisBank(row); if (bk) row.bank_id = bk.id;
  const [a] = await DB.insert('avise', [row]); if (!a) return null;
  await avisStatus(a);
  return { a, bezug };
}

// Nach jedem Bank-Import/Abgleich: Avise ohne Bankbuchung erneut prüfen
async function avisAbgleich() {
  let n = 0;
  for (const a of S.avise || []) {
    if (a.bank_id && S.bank.some(b => b.id === a.bank_id)) continue;
    const bk = avisBank(a); if (bk) { await DB.update('avise', a.id, { bank_id: bk.id }); n++; }
  }
  return n;
}

// Einmaliger Umzug: Avise, die früher als „Rechnung“ mit Art Zahlungsavis angelegt wurden, in die eigene Ablage verschieben
async function avisUmzug() {
  if (DB.cloud && (S._fehlt || []).includes('avise')) return;
  const alt = S.rechnungen.filter(r => r.art === 'Zahlungsavis'); if (!alt.length) return;
  const rows = alt.map(r => {
    const m = String(r.beschreibung || '').match(/über ([\d.]+,\d{2})/), f = String(r.beschreibung || '').match(/ für (.+)$/);
    const nrn = f ? f[1].split(/,\s*/).filter(Boolean) : [];
    return { datum: r.datum, partner: r.partner, nummer: r.nummer, betrag: m ? parseNum(m[1]) : null, rechnung_ids: avisRechnungen(nrn, r.partner).map(x => x.id), rechnung_nrn: nrn.join(', ') || null,
      datei: r.datei, dateiname: r.dateiname, notiz: r.notiz, schluessel: r.schluessel || 'AV#' + r.id };
  });
  const neu = await DB.insert('avise', rows);
  // nur löschen, was sicher in der neuen Ablage steht
  const ok = new Set((S.avise || []).map(a => a.schluessel));
  await DB.remove('rechnungen', alt.filter((r, i) => ok.has(rows[i].schluessel)).map(r => r.id));
  for (const a of S.avise) await avisStatus(a);
  await avisAbgleich();
  if (neu.length) toast(`${neu.length} Zahlungsavis in die eigene Ablage verschoben.`);
}

/* ---------- Ansicht ---------- */
function viewAvis() {
  if ((S._fehlt || []).includes('avise')) return `<div class="toolbar"><h1>Zahlungsavis</h1></div><div class="warn">Die Tabelle „avise“ fehlt noch – bitte <b>supabase/02_erweiterung.sql</b> im Supabase SQL Editor ausführen und neu laden.</div>`;
  let list = [...S.avise].sort((a, b) => (b.datum || '').localeCompare(a.datum || ''));
  const bk = a => a.bank_id && S.bank.find(b => b.id === a.bank_id);
  const rs = a => (a.rechnung_ids || []).map(id => S.rechnungen.find(r => r.id === id)).filter(Boolean);
  const cols = [colDat('datum', 'Datum', a => a.datum), colTxt('partner', 'Absender', a => a.partner), colTxt('nr', 'Avis-Nr.', a => a.nummer), colNum('betrag', 'Betrag', a => a.betrag),
    colTxt('re', 'Rechnungen', a => [a.rechnung_nrn, ...rs(a).map(r => r.nummer + ' ' + r.partner)].join(' ')),
    { k: 'bank', l: 'Bank', v: a => bk(a) ? 'abgebucht' : 'Abbuchung offen', sel: true }, { k: 'pdf', l: 'PDF', v: a => a.datei ? 'mit PDF' : 'ohne PDF', sel: true }];
  const base = list; list = colApply('avis', list, cols);
  return `
  <div class="toolbar"><h1>Zahlungsavis</h1><span class="sp"></span><button class="btn primary" data-act="pickBeleg">⬆ Avis hochladen</button></div>
  <p class="muted small">Zahlungsavise liegen nur hier – nicht im Rechnungseingang. Die zugehörigen Rechnungen stehen auf „Abbuchung offen“, bis die Abbuchung in der Bank gefunden ist, und tragen in der Tabelle den Vermerk 📨.</p>
  <div class="sumline">${list.length} Avis · ${fmtE(sum(list, a => a.betrag))} · noch nicht abgebucht: ${list.filter(a => !bk(a)).length}${colReset('avis')}</div>
  <div class="tw"><table class="tb click">${colHead('avis', cols, base)}<tbody>
  ${list.map(a => { const b = bk(a), r = rs(a); return `<tr data-act="avisD" data-id="${a.id}"><td>${fmtD(a.datum)}</td><td>${esc(a.partner || '')}</td><td class="mono">${esc(a.nummer || '–')}</td><td class="num">${a.betrag != null ? fmtE(a.betrag) : ''}</td>
    <td class="small">${r.length ? r.map(x => esc(x.nummer || '')).join(', ') : ''}${a.rechnung_nrn && r.length < a.rechnung_nrn.split(',').length ? ` <span class="muted">(laut Avis: ${esc(a.rechnung_nrn)})</span>` : ''}</td>
    <td>${b ? badge({ cls: 'st-ok', label: '✓ abgebucht ' + fmtD(b.datum) }) : badge({ cls: 'st-warn', label: 'Abbuchung offen' })}</td><td>${a.datei ? '📄' : ''}</td></tr>`; }).join('') || `<tr><td colspan="${cols.length}" class="empty">Noch keine Zahlungsavise. Einfach die PDF oder Mail reinziehen und „Verarbeiten“ – die KI erkennt Avise automatisch.</td></tr>`}
  </tbody></table></div>`;
}

function avisDetail(id) {
  const a = S.avise.find(x => x.id === id); if (!a) return;
  const b = a.bank_id && S.bank.find(x => x.id === a.bank_id), rs = (a.rechnung_ids || []).map(i => S.rechnungen.find(r => r.id === i)).filter(Boolean);
  const d = openSheet({ title: 'Zahlungsavis ' + (a.nummer || ''), wide: true, noOk: true, html: `
    <div class="det ${a.datei ? 'with-doc' : ''}"><div>
      <dl class="dl"><dt>Absender</dt><dd>${esc(a.partner || '–')}</dd><dt>Avis-Nr.</dt><dd class="mono">${esc(a.nummer || '–')}</dd><dt>Datum</dt><dd>${fmtD(a.datum)}</dd>
        <dt>Betrag</dt><dd><b>${a.betrag != null ? fmtE(a.betrag) : '–'}</b></dd><dt>Laut Avis</dt><dd>${esc(a.rechnung_nrn || '–')}</dd>
        <dt>Bank</dt><dd>${b ? `✓ abgebucht am ${fmtD(b.datum)} · ${esc(b.gegenpartei || '')} · ${fmtE(b.betrag)}` : '<span class="warn-t">Abbuchung noch nicht in der Bank gefunden</span>'}</dd>
        ${a.dateiname ? `<dt>Datei</dt><dd class="small">${esc(a.dateiname)}</dd>` : ''}</dl>
      <h4>Zugehörige Rechnungen</h4>
      ${rs.length ? `<div class="tw"><table class="tb click"><tbody>${rs.map(r => `<tr data-act="rechnung" data-id="${r.id}"><td class="mono">${esc(r.nummer || '–')}</td><td>${esc(r.partner || '')}</td><td>${fmtD(r.datum)}</td><td class="num">${fmtE(r.brutto)}</td><td>${badge(rStatus(r))}</td></tr>`).join('')}</tbody></table></div>`
        : '<p class="muted small">Keine Rechnung der App zugeordnet.</p>'}
      <div class="btnrow"><button class="btn" data-a="re">Rechnung zuordnen</button><button class="btn danger" data-a="del">Löschen</button></div>
    </div>${a.datei ? '<div class="doc" id="docPrev"><div class="muted small">PDF wird geladen …</div></div>' : ''}</div>` });
  if (a.datei) DB.fileUrl(a.datei).then(u => { const p = $('#docPrev', d); if (p) p.innerHTML = u ? `<iframe src="${u}" title="Avis"></iframe><a class="small" href="${u}" target="_blank" rel="noopener">In neuem Fenster öffnen</a>` : 'PDF nicht gefunden.'; }).catch(() => { });
  d.addEventListener('click', async e => {
    const x = e.target.closest('[data-a]')?.dataset.a; if (!x) return;
    if (x === 'del') { if (!confirm('Zahlungsavis löschen? Die Rechnungen bleiben, nur der Vermerk verschwindet.')) return; await DB.remove('avise', a.id); closeSheet(); render(); toast('Avis gelöscht.'); }
    if (x === 're') { const n = prompt('Rechnungsnummer(n), durch Komma getrennt:', a.rechnung_nrn || ''); if (n == null) return;
      const nrn = n.split(/[,;]\s*/).map(s => s.trim()).filter(Boolean), ids = avisRechnungen(nrn, a.partner).map(r => r.id);
      await DB.update('avise', a.id, { rechnung_nrn: nrn.join(', ') || null, rechnung_ids: ids }); await avisStatus(S.avise.find(y => y.id === a.id)); render(); avisDetail(a.id); }
  });
}
