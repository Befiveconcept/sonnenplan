/* Mastercar Finanzen · Detailfenster und Formulare */
const payLabel = z => {
  if (z.bank_id) { const b = S.bank.find(x => x.id === z.bank_id); return b ? `Bank ${fmtD(b.datum)} · ${esc(b.gegenpartei || '')}` : 'Bank'; }
  if (z.sumup_id) { const s = S.sumup.find(x => x.id === z.sumup_id); return s ? `SumUp/EC ${fmtD(s.datum)}${s.beschreibung ? ' · ' + esc(s.beschreibung) : ''}` : 'SumUp'; }
  if (z.kasse_id) { const k = S.kasse.find(x => x.id === z.kasse_id); return k ? `Kasse ${fmtD(k.datum)}${k.belegnr ? ' · Beleg ' + esc(k.belegnr) : ''}${k.text ? ' · ' + esc(k.text) : ''}` : 'Kasse'; }
  return `Bar ${fmtD(z.datum)}`;
};

async function rechnungDetail(id) {
  buildIdx();
  const r = S.rechnungen.find(x => x.id === id); if (!r) return;
  const st = rStatus(r), isA = r.richtung === 'ausgang';
  // „bezahlt laut Liste“, aber keine Buchung verknüpft → passende freie Buchungen zum Öffnen/Zuordnen anbieten
  const ezv = st.key === 'extern' && !st.zahlungen.length ? zahlungVorschlaege(r, { ...st, offen: sollOf(r) }).filter(x => x.s >= 50).slice(0, 3) : [];
  const d = openSheet({
    title: (isA ? 'Kundenrechnung ' : 'Lieferantenrechnung ') + (r.nummer || ''), wide: true, noOk: true, html: `
    <div class="det ${r.datei ? 'with-doc' : ''}">
      <div>
        <div class="det-head"><label class="small muted">Status</label> ${stSelect(r)}${st.hint ? ` <span class="badge ${st.hint[1]} hint">${esc(st.hint[0])}</span>` : ''}</div>
        ${(() => { const du = rDoppelt(r.richtung).get(r.id); if (!du) return '';
          return `<div class="warn">⚠ ${du.sicher ? 'Doppelt erfasst' : 'Wahrscheinlich doppelt erfasst'} – gleicher Eintrag:<ul class="pays">${du.mit.map(x => `<li data-act="rechnung" data-id="${x.id}" style="cursor:pointer"><span>${esc(x.nummer || 'ohne Nr.')} · ${esc(x.partner || '')} · ${fmtD(x.datum)}${x.status_excel ? ' · ' + esc(x.status_excel) : ''}${(IDX.zByR.get(x.id) || []).length ? ' · Zahlung zugeordnet' : ''}${x.datei ? ' · mit PDF' : ''}</span><b>${fmtE(x.brutto)}</b></li>`).join('')}</ul><span class="small">Den überzähligen Eintrag löschen (am besten den ohne Zahlung und ohne PDF). Ist es keine Doppelung, in die Notiz „kein Duplikat“ schreiben.</span></div>`; })()}
        <dl class="dl">
          <dt>${isA ? 'Kunde' : 'Lieferant'}</dt><dd>${esc(r.partner || '–')}</dd>
          <dt>Rechnungsnr.</dt><dd class="mono">${esc(r.nummer || '–')}</dd>
          <dt>Datum</dt><dd>${fmtD(r.datum)}</dd><dt>Fällig</dt><dd>${fmtD(faelligAm(r))}</dd>
          ${isA ? `${r.kundennr ? `<dt>Kd.-Nr.</dt><dd class="mono">${esc(r.kundennr)}</dd>` : ''}<dt>Kennzeichen</dt><dd class="mono">${esc(r.kennzeichen || '–')}</dd><dt>Zahlart</dt><dd>${esc(ZA[r.zahlart] || '–')}</dd>
            ${r.lohn != null || r.teile != null ? `<dt>Aufteilung netto</dt><dd>Werkstatt ${fmtE(r.lohn || 0)} · Ersatzteile ${fmtE(r.teile || 0)}${r.sonstiges ? ' · Sonstiges ' + fmtE(r.sonstiges) : ''}${r.altteile ? ' · Altteile ' + fmtE(r.altteile) : ''}</dd>` : ''}`
            : `<dt>Kategorie (GuV)</dt><dd>${esc(r.kostenart || '–')}${r.unterkonto ? ' · ' + esc(r.unterkonto) : ''}${r.fix != null ? ' · ' + (r.fix ? 'Fixkosten' : 'variabel') : ''}</dd><dt>Art</dt><dd>${esc(r.art || '–')}</dd><dt>Zahlart</dt><dd>${esc(ZA[r.zahlart] || '–')}</dd><dt>IBAN</dt><dd class="mono">${esc(r.iban || '–')}</dd>`}
          ${r.skonto ? `<dt>Skonto</dt><dd>${fmtE(r.skonto)} → zu zahlen ${fmtE(sollOf(r))}</dd>` : ''}
          ${r.durchlaufend ? `<dt>Durchlaufender Posten</dt><dd>${fmtE(r.durchlaufend)}</dd>` : ''}
          ${r.beschreibung ? `<dt>Beschreibung</dt><dd>${esc(r.beschreibung)}</dd>` : ''}
          ${r.notiz ? `<dt>Notiz</dt><dd>${esc(r.notiz)}</dd>` : ''}
          <dt>Netto / MwSt.</dt><dd>${fmtE(r.netto)} / ${fmtE(r.mwst)}</dd>
          <dt>Brutto</dt><dd><b>${fmtE(r.brutto)}</b></dd>
          <dt>Bezahlt</dt><dd>${fmtE(st.bezahlt)}</dd>
          <dt>${st.offen < -0.01 ? 'Zu viel bezahlt' : 'Offen'}</dt><dd class="${Math.abs(st.offen) > 0.01 ? 'neg' : ''}"><b>${fmtE(Math.abs(st.offen))}</b></dd>
        </dl>
        ${isA ? `<details class="xl"><summary>Alle Spalten wie im Werkstatt Journal</summary><dl class="dl">${[['Bezahlt?', r.status_excel || st.label], ['Zahlart', ZA[r.zahlart] || ''], ['Überprüft?', r.geprueft ? 'Ja' : 'Nein'], ['Rech.-Nr.', r.nummer], ['Datum', fmtD(r.datum)], ['Firma/Name', r.partner], ['Kd-Nr.', r.kundennr],
          ['Bezahlt', eur(r.bezahlt_betrag)], ['Gesamt brutto', fmtE(r.brutto)], ['Werkstatt', eur(r.lohn)], ['Ersatzteile', eur(r.teile)], ['Sonstiges', eur(r.sonstiges)], ['MwSt.', eur(r.mwst)], ['Altteile', eur(r.altteile)], ['USt.Alt.', eur(r.ust_alt)], ['Dl.Posten', eur(r.durchlaufend)], ['Gesamt Netto', eur(r.netto)],
          ['Monat', r.datum ? MONATE_LANG[+r.datum.slice(5, 7) - 1] : ''], ['KW', r.datum ? String(isoWeek(r.datum).w) : ''], ['Quartal', r.datum ? 'Q' + Math.ceil(+r.datum.slice(5, 7) / 3) : ''], ['Notizen', r.notiz]].map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v || '–')}</dd>`).join('')}</dl></details>` : `<details class="xl"><summary>Alle Spalten wie in der Excel „Ein- und Ausgaben“</summary><dl class="dl">${eingangExcel(r).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v || '–')}</dd>`).join('')}</dl></details>`}
        ${(() => { const o = st.bezug, gs = st.gutschriften || [], av = typeof avisZu === 'function' ? avisZu(r.id) : []; if (!o && !gs.length && !av.length) return '';
          return `<h4>Verknüpft</h4><ul class="pays">${o ? `<li data-act="rechnung" data-id="${o.id}" style="cursor:pointer"><span>↔ gehört zu Rechnung <b>${esc(o.nummer || '')}</b> · ${esc(o.partner || '')} · ${fmtD(o.datum)}</span><b>${fmtE(o.brutto)}</b></li>` : ''}
            ${gs.map(g => `<li data-act="rechnung" data-id="${g.id}" style="cursor:pointer"><span>↔ ${esc(g.art || 'Gutschrift')} <b>${esc(g.nummer || '')}</b> · ${fmtD(g.datum)} <small class="muted">· verrechnet</small></span><b>${fmtE(g.brutto)}</b></li>`).join('')}
            ${av.map(a => `<li data-act="avisD" data-id="${a.id}" style="cursor:pointer"><span>📨 Zahlungsavis ${esc(a.nummer || '')} · ${fmtD(a.datum)} · ${a.bank_id ? 'abgebucht' : 'Abbuchung offen'}</span><b>${a.betrag != null ? fmtE(a.betrag) : ''}</b></li>`).join('')}</ul>`; })()}
        <h4>Zahlungen</h4>
        ${st.zahlungen.length ? `<ul class="pays">${st.zahlungen.map(z => `<li><span>${z.bank_id || z.sumup_id || z.kasse_id ? `<a href="#" data-zoeffnen="${z.id}" title="Zahlung öffnen">${payLabel(z)}</a>` : payLabel(z)}${z.art === 'auto' ? ' <small class="muted">· automatisch' + (z.notiz ? ': ' + esc(z.notiz) : '') + '</small>' : z.notiz ? ' <small class="muted">· ' + esc(z.notiz) + '</small>' : ''}</span><b>${fmtE(z.betrag)}</b>${z.bank_id || z.sumup_id || z.kasse_id ? `<button class="btn sm" data-zoeffnen="${z.id}" title="Diese Zahlung öffnen">${z.bank_id ? '🏦 Bank' : z.sumup_id ? '💳 EC' : '€ Kasse'} öffnen ›</button>` : ''}<button class="icon-btn" data-delz="${z.id}" title="Zuordnung lösen">✕</button></li>`).join('')}</ul>`
          : st.key === 'extern' ? `<p class="small">Laut Liste bezahlt${r.zahlart ? ' (' + esc(ZA[r.zahlart] || r.zahlart) + ')' : ''}, aber noch keine Buchung verknüpft.${ezv.length ? ' Passt eine davon?' : ''}</p>${ezv.length ? `<ul class="pays">${ezv.map((x, i) => `<li><span>${x.kind === 'bank' ? '🏦 Bank' : x.kind === 'kasse' ? '€ Kasse' : '💳 EC'} · ${fmtD(x.p.datum)} · ${esc(x.p.gegenpartei || '')}<br><small class="muted">${esc(zweckKurz(x.p.zweck).slice(0, 90))} · ${esc(x.why.join(', '))}</small></span><b>${fmtE(x.rest)}</b><button class="btn sm" data-vo="${i}">Öffnen ›</button><button class="btn sm primary" data-ez="${i}">Zuordnen</button></li>`).join('')}</ul>` : ''}`
          : '<p class="muted small">Noch keine Zahlung zugeordnet.</p>'}
        <div class="btnrow">
          <button class="btn primary" data-a="pay">Zahlung zuordnen</button>
          <button class="btn" data-a="bar">${isA ? 'Bar bezahlt' : '€ Aus der Kasse bezahlt'}</button>
          <button class="btn" data-a="erl">${r.erledigt ? 'Wieder öffnen' : 'Als erledigt markieren'}</button>
          <button class="btn" data-a="edit">Bearbeiten</button>
          ${(+r.brutto || 0) < 0 || ['Gutschrift', 'Korrektur', 'Storno'].includes(r.art) ? `<button class="btn" data-a="bezug">↔ ${r.bezug_id ? 'Andere Rechnung' : 'Mit Rechnung verknüpfen'}</button>${r.bezug_id ? '<button class="btn" data-a="bezugWeg">Verknüpfung lösen</button>' : ''}` : ''}
          <button class="btn ${r.datei ? '' : 'primary'}" data-a="beleg" title="PDF auswählen oder einfach in dieses Fenster ziehen">📎 ${r.datei ? 'PDF ersetzen' : 'PDF anhängen'}</button>
          <button class="btn" data-a="todo">☑ To-Do anlegen</button>
          ${r.geprueft ? '' : '<button class="btn" data-a="ok">✓ Geprüft</button>'}
          <button class="btn danger" data-a="del">Löschen</button>
        </div>
      </div>
      ${r.datei ? `<div class="doc" id="docPrev"><div class="muted small">Beleg wird geladen …</div></div>` : ''}
    </div>`
  });
  d.dataset.rid = r.id;   // PDF ins offene Fenster ziehen = an diese Rechnung hängen
  if (!r.datei) $('.sheet-body', d).insertAdjacentHTML('afterbegin', '<div class="note small">Zu dieser Rechnung ist noch keine PDF hinterlegt – einfach die PDF in dieses Fenster ziehen oder „📎 PDF anhängen“.</div>');
  if (r.datei) DB.fileUrl(r.datei).then(u => { const p = $('#docPrev', d); if (!p) return; p.innerHTML = !u ? 'Beleg nicht gefunden.' : /\.(png|jpe?g|webp|gif)$/i.test(r.datei) ? `<img src="${u}" alt="Beleg">` : `<iframe src="${u}" title="Beleg"></iframe><a class="small" href="${u}" target="_blank" rel="noopener">In neuem Fenster öffnen</a>`;
    p.insertAdjacentHTML('beforeend', ` <a class="small" href="#" id="docDl">⬇ ${esc(r.dateiname || 'Herunterladen')}</a>`);
    $('#docDl', d).onclick = async e => { e.preventDefault(); try { const b = await ablageBlob(r); if (!b) return toast('Beleg nicht gefunden.'); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = r.dateiname || belegName(r, dateiEndung(r.datei)); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); } catch (er) { toast('Download fehlgeschlagen.'); } };
  }).catch(() => { });
  const again = () => { render(); rechnungDetail(id); };
  // Noch offen? Passende, noch freie Bank-/Kassenbuchungen gleich hier vorschlagen (Name, Nummer, Betrag, Datum)
  const zv = !r.erledigt && st.offen > 0.005 && ['offen', 'ueberfaellig', 'teil'].includes(st.key) ? zahlungVorschlaege(r, st).filter(x => x.s >= 50).slice(0, 4) : [];
  if (zv.length) $('.sheet-body', d).insertAdjacentHTML('afterbegin', `<div class="note"><b>Passende Zahlung gefunden?</b> Diese ${isA ? 'Eingänge' : 'Abbuchungen'} sind noch keiner Rechnung zugeordnet:
    <ul class="pays">${zv.map((x, i) => `<li><span>${x.kind === 'bank' ? 'Bank' : x.kind === 'kasse' ? 'Kasse' : 'EC'} · ${fmtD(x.p.datum)} · ${esc(x.p.gegenpartei || '')}<br><small class="muted">${esc(zweckKurz(x.p.zweck).slice(0, 90))} · ${esc(x.why.join(', '))}</small></span><b>${fmtE(x.rest)}</b> <button class="btn sm primary" data-vz="${i}">Zuordnen</button></li>`).join('')}</ul></div>`);
  d.addEventListener('click', async e => {
    const vz = e.target.closest('[data-vz]');
    if (vz) { const x = zv[+vz.dataset.vz]; await zuordnen(r, x.p, x.kind, Math.min(x.rest, st.offen)); toast('Zugeordnet.'); return again(); }
    const dz = e.target.closest('[data-delz]'); if (dz) { await zuordnungLoeschen(dz.dataset.delz); return again(); }
    const vo = e.target.closest('[data-vo]'); if (vo) { const x = ezv[+vo.dataset.vo]; return x.kind === 'bank' ? bankDetail(x.p.id) : x.kind === 'kasse' ? kasseDetail(x.p.id) : sumupDetail(x.p.id); }
    const ez = e.target.closest('[data-ez]'); if (ez) { const x = ezv[+ez.dataset.ez]; await zuordnen(r, x.p, x.kind, Math.min(x.rest, sollOf(r))); toast('Zugeordnet.'); return again(); }
    const zo = e.target.closest('[data-zoeffnen]');
    if (zo) { e.preventDefault(); const z = S.zuordnungen.find(x => x.id === zo.dataset.zoeffnen); if (z) { if (z.bank_id) return bankDetail(z.bank_id); if (z.sumup_id) return sumupDetail(z.sumup_id); if (z.kasse_id) return kasseDetail(z.kasse_id); } return; }
    const a = e.target.closest('[data-a]')?.dataset.a; if (!a) return;
    if (a === 'pay') return zahlungPicker(r);
    if (a === 'bar') {
      const s0 = rStatus(r), rest = s0.key === 'extern' ? sollOf(r) : s0.offen; if (rest <= 0.005) return toast('Nichts offen.');
      // Lieferantenrechnung: passende, noch freie Kassen-Ausgabe (gleicher Betrag, ±14 Tage) direkt verknüpfen
      if (!isA) { const br = +r.brutto || 0, k = S.kasse.filter(q => q.betrag < 0 && (Math.abs(-q.betrag - rest) <= 0.01 || Math.abs(-q.betrag - br) <= 0.01) && r.datum && Math.abs(daysBetween(r.datum, q.datum)) <= 14 && kStatus(q).rest > 0.005)
          .sort((x, y) => Math.abs(daysBetween(r.datum, x.datum)) - Math.abs(daysBetween(r.datum, y.datum)))[0];
        if (k) { const bt = r2(-k.betrag);
          if (r.skonto && Math.abs(bt - br) <= 0.01) await DB.update('rechnungen', r.id, { skonto: null, skonto_satz: null, mit_skonto: null });   // bar voll bezahlt → kein Skonto
          await zuordnen(r, k, 'kasse', bt, 'Aus der Kasse bezahlt'); toast('Mit Kassenbuch ' + fmtD(k.datum) + ' verknüpft.'); return again(); } }
      await zuordnen(r, null, 'bar', rest, isA ? 'Bar bezahlt' : 'Aus der Barkasse bezahlt'); return again(); }
    if (a === 'erl') { await DB.update('rechnungen', r.id, { erledigt: !r.erledigt }); return again(); }
    if (a === 'ok') { await DB.update('rechnungen', r.id, { geprueft: true }); return again(); }
    if (a === 'edit') return rechnungForm(r.richtung, r);
    if (a === 'bezugWeg') { await DB.update('rechnungen', r.id, { bezug_id: null }); return again(); }
    if (a === 'bezug') {
      const vs = bezugFinden(null, r.partner, r), n = prompt('Nummer der Rechnung, zu der diese ' + (r.art || 'Gutschrift') + ' gehört:', vs ? vs.nummer : ''); if (!n) return;
      const o = bezugFinden(n.trim(), r.partner, r) || S.rechnungen.find(x => x.richtung === r.richtung && x.nummer && normNr(x.nummer) === normNr(n) && x.id !== r.id);
      if (!o) return toast('Rechnung ' + n + ' nicht gefunden.');
      await DB.update('rechnungen', r.id, { bezug_id: o.id }); toast(`Verknüpft mit ${o.nummer} – wird dort verrechnet.`); return again();
    }
    if (a === 'beleg') { const i = document.createElement('input'); i.type = 'file'; i.accept = '.pdf,image/*,.eml,.msg'; i.onchange = () => i.files[0] && belegZuRechnung(r.id, i.files[0]); i.click(); return; }
    if (a === 'todo') { const o = rStatus(r).offen; return todoForm(null, { rechnung_id: r.id, prio: st.key === 'ueberfaellig' || st.key === 'doppelt' ? 'hoch' : 'normal', faellig: addDays(todayISO(), 2),
      titel: isA ? (st.key === 'ueber' || st.key === 'doppelt' ? `${r.partner}: zu viel gezahlte ${fmtE(-o)} erstatten (${r.nummer || ''})` : `${r.partner} wegen offener Rechnung ${r.nummer || ''} (${fmtE(o)}) kontaktieren`) : `Rechnung ${r.nummer || ''} von ${r.partner} klären`, extern: r.partner }); }
    if (a === 'del') { if (!confirm('Rechnung ' + (r.nummer || '') + ' wirklich löschen? Zugeordnete Zahlungen werden wieder frei.')) return; await DB.remove('rechnungen', r.id); closeSheet(); buildIdx(); render(); toast('Gelöscht.'); }
  });
}

function rechnungForm(dir, r = null) {
  const isA = dir === 'ausgang', v = r || { richtung: dir, datum: todayISO() };
  const f = (k, label, type = 'text', extra = '') => `<label class="fld"><span>${label}</span><input class="inp" name="${k}" type="${type}" ${type === 'number' ? 'step="0.01"' : ''} value="${esc(v[k] ?? '')}" ${extra}></label>`;
  const d = openSheet({
    title: r ? 'Rechnung bearbeiten' : (isA ? 'Neue Kundenrechnung' : 'Neue Lieferantenrechnung'), html: `<form class="form2">
    ${f('partner', isA ? 'Kunde' : 'Lieferant', 'text', 'required')}${f('nummer', 'Rechnungsnummer')}
    ${f('datum', 'Datum', 'date')}${f('faellig', 'Fällig am', 'date')}
    ${f('netto', 'Netto', 'number')}${f('mwst', 'MwSt.', 'number')}${f('brutto', 'Brutto *', 'number', 'required')}
    ${isA ? f('kennzeichen', 'Kennzeichen') + `<label class="fld"><span>Zahlart</span><select class="inp" name="zahlart"><option value="">–</option>${Object.entries(ZA).map(([k, l]) => `<option value="${k}" ${v.zahlart === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>`
      : `<label class="fld"><span>Kategorie (GuV)</span><select class="inp" name="kostenart"><option value="">–</option>${KOSTENARTEN.map(k => `<option ${v.kostenart === k ? 'selected' : ''}>${esc(k)}</option>`).join('')}</select></label>
         <label class="fld"><span>Unterposition</span><select class="inp" name="unterkonto"><option value="">–</option>${UNTERKONTEN(v.kostenart).map(k => `<option ${v.unterkonto === k ? 'selected' : ''}>${esc(k)}</option>`).join('')}</select></label>
         <label class="fld"><span>Art</span><select class="inp" name="art">${['Rechnung', 'Gutschrift', 'Korrektur', 'Vertrag', 'Beleg', 'Storno', 'Zahlungsavis'].map(k => `<option ${(v.art || 'Rechnung') === k ? 'selected' : ''}>${k}</option>`).join('')}</select></label>
         <label class="fld"><span>Fix / variabel</span><select class="inp" name="fix"><option value="">–</option><option value="1" ${v.fix === true ? 'selected' : ''}>Fixkosten</option><option value="0" ${v.fix === false ? 'selected' : ''}>variabel</option></select></label>
         <label class="fld"><span>Zahlart</span><select class="inp" name="zahlart"><option value="">–</option>${Object.entries(ZA).map(([k, l]) => `<option value="${k}" ${v.zahlart === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
         ${f('skonto', 'Skonto (€)', 'number')}${f('durchlaufend', 'Durchlaufender Posten (€)', 'number')}
         <label class="fld"><span>Mwst.?</span><select class="inp" name="mwst_pflicht"><option value="">–</option><option value="1" ${v.mwst_pflicht === true ? 'selected' : ''}>Ja</option><option value="0" ${v.mwst_pflicht === false ? 'selected' : ''}>Nein</option></select></label>
         ${f('bankabgleich', 'Bankabgleich')}` + f('iban', 'IBAN Lieferant')}
    <label class="fld full"><span>Beschreibung</span><input class="inp" name="beschreibung" value="${esc(v.beschreibung || '')}"></label>
    <label class="fld full"><span>Notiz</span><input class="inp" name="notiz" value="${esc(v.notiz || '')}"></label>
    <label class="fld full"><span>📎 PDF der Rechnung ${v.datei ? '(ersetzt die vorhandene)' : ''}</span><input class="inp" name="beleg" type="file" accept=".pdf,image/*,.eml,.msg"></label></form>
    <p class="small muted">Tipp: Netto + MwSt. eintragen und Brutto leer lassen – wird ausgerechnet.</p>`,
    onOk: async dd => {
      const fd = Object.fromEntries(new FormData($('form', dd)));
      const n = k => parseNum(fd[k]);
      let brutto = n('brutto'); if (brutto == null && n('netto') != null) brutto = r2(n('netto') + (n('mwst') || 0));
      if (brutto == null) { toast('Bitte Brutto (oder Netto) eintragen.'); return false; }
      if (!fd.partner.trim()) { toast(isA ? 'Bitte Kunde eintragen.' : 'Bitte Lieferant eintragen.'); return false; }
      const row = { partner: fd.partner.trim(), nummer: fd.nummer.trim() || null, datum: fd.datum || null, faellig: fd.faellig || null, netto: n('netto'), mwst: n('mwst'), brutto: r2(brutto),
        beschreibung: fd.beschreibung || null, notiz: fd.notiz || null, geprueft: true };
      if (isA) Object.assign(row, { kennzeichen: (fd.kennzeichen || '').toUpperCase() || null, zahlart: fd.zahlart || null });
      else Object.assign(row, { kostenart: fd.kostenart || null, unterkonto: fd.unterkonto || null, art: fd.art || null, fix: fd.fix === '' ? null : fd.fix === '1', zahlart: fd.zahlart || null, skonto: n('skonto'),
        durchlaufend: n('durchlaufend'), mwst_pflicht: fd.mwst_pflicht === '' ? null : fd.mwst_pflicht === '1', bankabgleich: (fd.bankabgleich || '').trim() || null, nach_dlp: null, mit_skonto: null,   // werden aus Brutto/Skonto/durchl. Posten neu hergeleitet
        iban: (fd.iban || '').replace(/\s/g, '').toUpperCase() || null });
      // Gutschrift/Storno vom Lieferanten mindert Kosten: negativ speichern
      if (!isA && ['Gutschrift', 'Storno'].includes(fd.art) && row.brutto > 0) { row.brutto = -row.brutto; if (row.netto) row.netto = -Math.abs(row.netto); if (row.mwst) row.mwst = -Math.abs(row.mwst); }
      const key = row.nummer ? (isA ? 'A:' + normNr(row.nummer) : 'E:' + (nameTokens(row.partner)[0] || '') + ':' + normNr(row.nummer)) : null;
      if (r) {
        if (key && key !== r.schluessel && S.rechnungen.some(x => x.schluessel === key && x.id !== r.id)) { toast('Diese Rechnungsnummer gibt es schon.'); return false; }
        if (key) row.schluessel = key;
        const altName = r.dateiname;
        await DB.update('rechnungen', r.id, row);
        if (r.datei) await ablageUmbenennen(S.rechnungen.find(x => x.id === r.id) || r, altName);   // Beleg-Datei an neue Angaben anpassen
      } else {
        row.schluessel = key || (isA ? 'A#' : 'E#') + uid(); row.richtung = dir; row.quelle = 'manuell';
        if (!isA && row.fix == null) row.fix = fixVorschlag(row);   // nicht ausgewählt → wie beim selben Rechnungssteller bzw. nach Kostenart
        row.status_excel = row.zahlart === 'bar' ? 'Bezahlt' : row.zahlart === 'sepa' ? 'Abbuchung offen' : 'Offen';
        if (S.rechnungen.some(x => x.schluessel === row.schluessel)) { toast('Diese Rechnungsnummer gibt es schon.'); return false; }
        const [nr] = await DB.insert('rechnungen', [row]);
        if (isA && row.zahlart === 'bar' && nr) await zuordnen(nr, null, 'bar', nr.brutto, 'Bar bezahlt');
        if (nr && fd.beleg && fd.beleg.size) setTimeout(() => belegZuRechnung(nr.id, fd.beleg), 0);
        else if (nr) toast('Gespeichert – PDF fehlt noch (im Rechnungsfenster „📎 PDF anhängen“).');
      }
      buildIdx(); render();
      if (r && fd.beleg && fd.beleg.size) setTimeout(() => belegZuRechnung(r.id, fd.beleg), 0);
      else if (r) setTimeout(() => rechnungDetail(r.id), 0);
    }
  });
  // Brutto automatisch aus Netto + MwSt.
  const nIn = $('[name=netto]', d), mIn = $('[name=mwst]', d), bIn = $('[name=brutto]', d);
  const calc = () => { const n = parseNum(nIn.value), m = parseNum(mIn.value); if (n != null && !bIn.dataset.touched) bIn.value = r2(n + (m ?? n * 0.19)); if (n != null && mIn.value === '') mIn.placeholder = r2(n * 0.19); };
  nIn.addEventListener('input', calc); mIn.addEventListener('input', calc); bIn.addEventListener('input', () => bIn.dataset.touched = 1);
  // Unterpositionen passend zur Kategorie
  const ka = $('[name=kostenart]', d), uk = $('[name=unterkonto]', d);
  if (ka && uk) ka.onchange = () => { uk.innerHTML = '<option value="">–</option>' + UNTERKONTEN(ka.value).map(k => `<option>${esc(k)}</option>`).join(''); };
  // beim Bearbeiten Beträge positiv zeigen (Gutschriften sind intern negativ gespeichert)
  if (r && r.brutto < 0) ['netto', 'mwst', 'brutto'].forEach(k => { const i = $(`[name=${k}]`, d); if (i && i.value) i.value = Math.abs(parseNum(i.value)); });
}

// Offene (noch freie) Zahlungen zu einer Rechnung, die passendsten zuerst
// alle Zahlungen der passenden Richtung, bewertet; mitBelegt = auch schon zugeordnete / per Regel eingeordnete
function zahlungVorschlaege(r, st = rStatus(r), mitBelegt = false) {
  const isA = r.richtung === 'ausgang';
  return [
    ...S.bank.filter(b => (isA ? b.betrag > 0 : b.betrag < 0) && (mitBelegt || !b.art)).map(b => { const bs = bStatus(b); return { kind: 'bank', p: b, rest: bs.rest, zs: bs.zuordnungen, art: b.art }; }),
    ...(isA ? S.sumup.filter(sumOk).map(s => { const ss = sStatus(s); return { kind: 'sumup', p: { ...s, zweck: s.beschreibung }, rest: ss.rest, zs: ss.zuordnungen }; }) : []),
    ...S.kasse.filter(k => (isA ? k.betrag > 0 : k.betrag < 0)).map(k => { const ks = kStatus(k); return { kind: 'kasse', p: { ...k, zweck: k.text, gegenpartei: 'Kasse' }, rest: ks.rest, zs: ks.zuordnungen }; })
  ].filter(x => mitBelegt || x.rest > 0.005).map(x => ({ ...x, ...score(x.p, r, x.rest > 0.005 ? x.rest : Math.abs(x.p.betrag), st.offen) })).sort((a, b) => b.s - a.s || b.p.datum.localeCompare(a.p.datum));
}
// Für eine Rechnung eine Zahlung (Bank, SumUp, Kasse) aussuchen – auch eine, die (vielleicht falsch) schon woanders hängt
function zahlungPicker(r) {
  buildIdx();
  const st = rStatus(r);
  const pays = zahlungVorschlaege(r, st, true).filter(x => !(x.zs || []).some(z => z.rechnung_id === r.id));
  // Suchtext: Auftraggeber, Zweck, Betrag, Datum – dazu der Firmenname dieser Rechnung, wenn die Zahlung zu ihr passt („bghm“ findet „Berufsgenossenschaft Holz und Metall“)
  // und die Rechnungen, denen die Zahlung schon zugeordnet ist
  const RE = new Map(S.rechnungen.map(x => [x.id, x]));
  const belegtTxt = x => (x.zs || []).map(z => { const o = RE.get(z.rechnung_id); return o ? `${o.nummer || ''} ${o.partner || ''} (${fmtE(z.betrag)})` : ''; }).filter(Boolean).join(' · ');
  pays.forEach(x => { x.such = [x.p.gegenpartei, x.p.zweck, fmtE(x.p.betrag), x.p.betrag, fmtD(x.p.datum), partnerPasst(r, x.p) ? r.partner : '', belegtTxt(x), x.art ? B_ST[x.art]?.[0] : ''].join(' ').toLowerCase(); });
  const frei = x => x.rest > 0.005 && !x.art;
  const rowsHtml = q => {
    const w = q.toLowerCase().trim().split(/\s+/).filter(Boolean);
    // ohne Suche: freie Zahlungen + schon belegte, die sehr gut passen (Name und Betrag) – mit Suche: alles, was passt
    const l = w.length ? pays.filter(x => w.every(t => x.such.includes(t))) : pays.filter(x => frei(x) || x.s >= 50);
    return l.slice(0, 50).map(x => { const i = pays.indexOf(x), bt = belegtTxt(x);
      return `<tr><td>${x.kind === 'bank' ? 'Bank' : x.kind === 'kasse' ? 'Kasse' : 'EC'}</td><td>${fmtD(x.p.datum)}</td><td>${esc(x.p.gegenpartei || '')}<div class="zweck small">${esc(zweckKurz(x.p.zweck))}</div>
        ${bt ? `<div class="small"><span class="badge st-warn">schon zugeordnet</span> ${esc(bt)}</div>` : x.art ? `<div class="small"><span class="badge st-info">${esc(B_ST[x.art]?.[0] || x.art)}</span></div>` : ''}</td>
        <td class="num">${fmtE(Math.abs(x.p.betrag))}${x.rest > 0.005 && x.rest < Math.abs(x.p.betrag) - 0.005 ? `<div class="small muted">frei ${fmtE(x.rest)}</div>` : ''}</td>
        <td class="small">${x.s >= 50 ? '<b class="pos">passt gut</b><br>' : ''}${esc(x.why.join(', '))}</td>
        <td>${frei(x) || (x.art && !bt) ? `<button class="btn sm primary" data-pick="${i}">Zuordnen</button>` : `<button class="btn sm primary" data-teil="${i}" title="Eine Buchung für mehrere Rechnungen: Betrag aufteilen">Mit dazu (Sammelzahlung)</button> <button class="btn sm" data-umh="${i}" title="Von der anderen Rechnung lösen und dieser zuordnen">Hierher umhängen</button>`}</td></tr>`; }).join('')
      || `<tr><td colspan="6" class="empty">${w.length ? 'Keine Zahlung mit diesem Text gefunden – ist der Kontoauszug für den Zeitraum schon importiert?' : 'Keine offenen Zahlungen gefunden – oben suchen (Name, Betrag oder Datum), dann erscheinen auch schon zugeordnete.'}</td></tr>`;
  };
  const d = openSheet({
    title: 'Zahlung zuordnen · ' + (r.nummer || r.partner), wide: true, noOk: true, html: `
    <p class="small">Offen: <b>${fmtE(st.offen)}</b> von ${fmtE(r.brutto)}. Die passendsten Zahlungen stehen oben. Die Suche findet auch Zahlungen, die schon einer anderen Rechnung zugeordnet sind.</p>
    <input class="inp search" type="search" placeholder="Name, Verwendungszweck, Betrag, Datum …" id="pq">
    <label class="fld inline"><span>Betrag zuordnen</span><input class="inp" id="pb" type="number" step="0.01" placeholder="ganze offene Zahlung"></label>
    <div class="tw"><table class="tb"><tbody id="pl">${rowsHtml('')}</tbody></table></div>`
  });
  $('#pq', d).addEventListener('input', e => $('#pl', d).innerHTML = rowsHtml(e.target.value));
  d.addEventListener('click', async e => {
    const tl = e.target.closest('[data-teil]');
    if (tl) {
      // Sammelzahlung: die anderen Rechnungen behalten nur ihren eigenen Betrag, der Überschuss geht an diese Rechnung
      const x = pays[+tl.dataset.teil]; let freiB = x.rest > 0.005 ? x.rest : 0;
      for (const z of x.zs || []) {
        const o = RE.get(z.rechnung_id); if (!o) continue;
        const brauchtNoch = r2(sollOf(o) - (rStatus(o).bezahlt - z.betrag));
        if (z.betrag > brauchtNoch + 0.01) { const neu = Math.max(0, brauchtNoch); freiB = r2(freiB + z.betrag - neu);
          if (neu > 0.005) await DB.update('zuordnungen', z.id, { betrag: r2(neu), notiz: [z.notiz, 'Sammelzahlung aufgeteilt'].filter(Boolean).join(' · ') }); else await DB.remove('zuordnungen', z.id); }
      }
      const amt = parseNum($('#pb', d).value) ?? Math.min(st.offen > 0.005 ? st.offen : freiB, freiB);
      if (!(amt > 0.005)) { buildIdx(); return toast('Von dieser Buchung ist nichts mehr übrig – die andere Rechnung braucht den ganzen Betrag. Oben unter „Betrag zuordnen“ einen Betrag eintragen.'); }
      await zuordnen(r, x.p, x.kind, amt, 'Sammelzahlung'); await statusNachziehen(x.zs.map(z => z.rechnung_id));
      closeSheet(); render(); rechnungDetail(r.id); return toast('Als Sammelzahlung zugeordnet.');
    }
    const b = e.target.closest('[data-pick]'), u = e.target.closest('[data-umh]'); if (!b && !u) return;
    const x = pays[b ? +b.dataset.pick : +u.dataset.umh];
    if (u) {
      const alt = (x.zs || []).map(z => { const o = RE.get(z.rechnung_id); return o ? `${o.nummer || 'ohne Nr.'} · ${o.partner || ''} · ${fmtD(o.datum)} (${fmtE(z.betrag)})` : ''; }).filter(Boolean).join('\n');
      if (!confirm(`Diese Zahlung hängt schon an:\n${alt}\n\nDort lösen und dieser Rechnung (${r.nummer || r.partner}) zuordnen?\nDie andere Rechnung steht danach wieder auf „offen“.`)) return;
      for (const z of x.zs) await zuordnungLoeschen(z.id);
      const ids = x.zs.map(z => z.rechnung_id);
      for (const id of ids) { const o = S.rechnungen.find(y => y.id === id); if (o && istBezahltLaut(o.status_excel)) await DB.update('rechnungen', id, { status_excel: o.zahlart === 'sepa' ? 'Abbuchung offen' : 'Offen' }); }
    }
    const amt = parseNum($('#pb', d).value) ?? Math.min(st.offen > 0.005 ? st.offen : Math.abs(x.p.betrag), u ? Math.abs(x.p.betrag) : x.rest > 0.005 ? x.rest : Math.abs(x.p.betrag));
    await zuordnen(r, x.p, x.kind, amt); closeSheet(); render(); rechnungDetail(r.id); toast(u ? 'Umgehängt.' : 'Zugeordnet.');
  });
}

async function bankDetail(id) {
  buildIdx();
  const b = S.bank.find(x => x.id === id); if (!b) return;
  const st = bStatus(b), vs = vorschlaege(b, 'bank'), inc = b.betrag > 0;
  const d = openSheet({
    title: 'Bankumsatz ' + fmtD(b.datum), wide: true, noOk: true, html: `
    <div class="det-head">${badge(st)} <b class="${inc ? 'pos' : 'neg'} big">${fmtE(b.betrag)}</b></div>
    <dl class="dl"><dt>Name</dt><dd>${esc(b.gegenpartei || '–')}</dd><dt>IBAN</dt><dd class="mono">${esc(b.iban || '–')}</dd><dt>Verwendungszweck</dt><dd>${esc(zweckKurz(b.zweck) || '–')}${b.zweck && zweckKurz(b.zweck) !== String(b.zweck).trim() ? `<details class="small muted"><summary>vollständiger Text der Bank</summary><span class="mono" style="word-break:break-all">${esc(b.zweck)}</span></details>` : ''}</dd>${b.valuta ? `<dt>Valuta</dt><dd>${fmtD(b.valuta)}</dd>` : ''}${b.konto ? `<dt>Konto</dt><dd>${esc(b.konto)}</dd>` : ''}</dl>
    <div class="form2">
      <label class="fld"><span>Art</span><select class="inp" id="bArt"><option value="">Normale Zahlung</option>${[['sumup', 'SumUp-Auszahlung'], ['privat', 'Privat'], ['intern', 'Umbuchung (eigenes Konto)'], ['vorjahr', 'Gehört zu 2025 (zählt nicht in 2026)'], ['darlehen', 'Darlehen / Tilgung (keine Kosten)'], ['ignoriert', 'Ignorieren']].map(([k, l]) => `<option value="${k}" ${b.art === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      ${!inc ? `<label class="fld"><span>Kostenart (wenn es keine Rechnung gibt)</span><select class="inp" id="bKa"><option value="">–</option>${KOSTENARTEN.map(k => `<option ${b.kostenart === k ? 'selected' : ''}>${esc(k)}</option>`).join('')}</select></label>` : ''}
    </div>
    <h4>Zugeordnete Rechnungen</h4>
    ${st.zuordnungen.length ? `<ul class="pays">${st.zuordnungen.map(z => { const r = S.rechnungen.find(x => x.id === z.rechnung_id); return `<li><span><a href="#" data-r="${z.rechnung_id}">${esc((r?.nummer || '') + ' · ' + (r?.partner || ''))}</a>${z.notiz ? ' <small class="muted">· ' + esc(z.notiz) + '</small>' : ''}</span><b>${fmtE(z.betrag)}</b><button class="icon-btn" data-delz="${z.id}" title="Lösen">✕</button></li>`; }).join('')}</ul>` : '<p class="muted small">Noch keine.</p>'}
    ${st.rest > 0.005 && !b.art ? `<h4>Passende Rechnungen ${st.zuordnungen.length ? '(Rest ' + fmtE(st.rest) + ')' : ''}</h4>
      <p class="small muted">Eine Buchung für mehrere Rechnungen (Sammelzahlung)? Rechnungen anhaken und unten „Ausgewählte zuordnen“.</p>
      ${vs.length ? `<div class="tw"><table class="tb"><tbody>${vs.map((x, i) => `<tr><td><input type="checkbox" data-sel="${x.r.id}" aria-label="auswählen"></td><td class="small">${x.r.richtung === 'ausgang' ? '↗' : '↘'} ${(+x.r.brutto || 0) < 0 ? 'Gutschrift' : 'Rechnung'}</td><td class="mono">${esc(x.r.nummer || '–')}</td><td>${fmtD(x.r.datum)}</td><td>${esc(x.r.partner || '')}</td><td class="num">${fmtE(x.r.brutto)}${x.st.offen > 0.005 && x.st.offen < Math.abs(x.r.brutto) - 0.005 ? `<div class="small muted">offen ${fmtE(x.st.offen)}</div>` : ''}</td><td>${badge(x.st)}</td><td class="small">${esc(x.why.join(', '))}</td><td><button class="btn sm primary" data-v="${i}">Zuordnen</button></td></tr>`).join('')}</tbody></table></div>` : '<p class="muted small">Kein klarer Treffer. Rechnung suchen:</p>'}
      <input class="inp search" type="search" id="rq" placeholder="Rechnung suchen: Nr., Name, Betrag …"><div class="tw"><table class="tb"><tbody id="rl"></tbody></table></div>
      <div id="selbar" class="note small" hidden></div>` : ''}
    ${!inc && DB.aiOn && !b.kostenart && !st.zuordnungen.length ? '<button class="btn sm" data-a="kika">✨ Kostenart von der KI vorschlagen</button>' : ''}`
  });
  const again = () => { render(); bankDetail(id); };
  // Verrechnung: Rechnungen und Gutschriften können gemeinsam in einer Buchung stecken (z. B. Altteile-Gutschriften minus Rechnungen).
  // „gleich“ = die Rechnung bewegt Geld in dieselbe Richtung wie die Buchung, „gegen“ = wird mit ihr verrechnet.
  const sg = Math.sign(b.betrag || 1), dirR = r => r.richtung === 'eingang' ? -1 : 1;
  const offenVon = r => { const s = rStatus(r); return s.key === 'extern' ? sollOf(r) : s.offen; };   // „laut Liste bezahlt“ ohne Buchung: voller Betrag
  const fluss = r => r2(sg * dirR(r) * offenVon(r));   // Beitrag zur Buchung (+ = deckt die Buchung, − = wird gegengerechnet)
  // Betrag der Zuordnung (im Vorzeichen der Rechnung): gleich → höchstens der Rest der Buchung; gegen → voller offener Betrag
  const anteil = (r, rest) => { const o = offenVon(r);
    if (Math.abs(o) <= 0.005) return r2(rest * sg * dirR(r));
    return fluss(r) > 0 ? r2(Math.sign(o) * Math.min(rest, Math.abs(o))) : r2(o); };
  const pick = async r => { await zuordnen(r, b, 'bank', anteil(r, st.rest)); again(); toast('Zugeordnet.'); };
  const sel = new Map();
  const selZeigen = () => { const bar = $('#selbar', d); if (!bar) return; const l = [...sel.values()], s = r2(l.reduce((a, r) => a + fluss(r), 0)), gegen = l.filter(r => fluss(r) < 0).length;
    bar.hidden = !l.length;
    bar.innerHTML = l.length ? `<b>${l.length}</b> ausgewählt · ${gegen ? 'verrechnet' : 'offen'} zusammen <b>${fmtE(s)}</b>${gegen ? ` <small class="muted">(${gegen} davon gegengerechnet)</small>` : ''} · Buchung ${fmtE(st.rest)} ${Math.abs(s - st.rest) <= 0.01 ? '<span class="pos">✓ passt genau</span>' : `<span class="neg">Differenz ${fmtE(r2(st.rest - s))}</span>`} <button class="btn sm primary" data-selgo>Ausgewählte zuordnen</button>` : ''; };
  // Belege aus dem Verwendungszweck, die zusammen genau den offenen Betrag ergeben → schon anhaken
  if (st.rest > 0.005 && !b.art) { const zh = vs.filter(x => x.imZweck || belegeImZweck(b).some(r => r.id === x.r.id)).map(x => x.r).filter(r => !st.zuordnungen.some(z => z.rechnung_id === r.id));
    if (zh.length && Math.abs(r2(zh.reduce((a, r) => a + fluss(r), 0)) - st.rest) <= 0.01) { zh.forEach(r => { sel.set(r.id, r); const c = d.querySelector(`[data-sel="${r.id}"]`); if (c) c.checked = true; }); selZeigen(); } }
  d.addEventListener('change', e => { const c = e.target.closest('[data-sel]'); if (!c) return; const r = S.rechnungen.find(x => x.id === c.dataset.sel); if (c.checked && r) sel.set(r.id, r); else sel.delete(c.dataset.sel); selZeigen(); });
  $('#bArt', d).onchange = async e => {
    const v = e.target.value || null;
    // „Gehört zu 2025“, Privat, Umbuchung, Ignorieren: hängt die Buchung (z. B. automatisch) an Rechnungen, diese Zuordnungen lösen
    if (v && v !== 'sumup' && st.zuordnungen.length) {
      if (!confirm(`Diese Buchung ist ${st.zuordnungen.length} Rechnung(en) zugeordnet. Zuordnung lösen und als „${(B_ST[v] || [v])[0]}“ markieren?`)) { e.target.value = b.art || ''; return; }
      const ids = st.zuordnungen.map(z => z.rechnung_id);
      await DB.remove('zuordnungen', st.zuordnungen.map(z => z.id));
      buildIdx(); if (typeof statusNachziehen === 'function') await statusNachziehen(ids).catch(() => { });
    }
    await DB.update('bank', id, { art: v }); again();
  };
  const ka = $('#bKa', d); if (ka) ka.onchange = async e => { await DB.update('bank', id, { kostenart: e.target.value || null }); render(); toast('Gespeichert.'); };
  const rq = $('#rq', d); if (rq) rq.addEventListener('input', () => {
    const q = rq.value.toLowerCase().trim(); if (q.length < 2) return $('#rl', d).innerHTML = '';
    // Ein- und Ausgangsrechnungen sowie Gutschriften – die zur Buchungsrichtung passenden zuerst
    const l = S.rechnungen.filter(r => !DOK_ARTEN.includes(r.art) && q.split(/\s+/).every(w => textOf(r).includes(w)))
      .sort((a, c) => (sg * dirR(c) * Math.sign(+c.brutto || 1) > 0) - (sg * dirR(a) * Math.sign(+a.brutto || 1) > 0) || (c.datum || '').localeCompare(a.datum || '')).slice(0, 30);
    $('#rl', d).innerHTML = l.map(r => `<tr><td><input type="checkbox" data-sel="${r.id}" ${sel.has(r.id) ? 'checked' : ''} aria-label="auswählen"></td><td class="small">${r.richtung === 'ausgang' ? '↗' : '↘'} ${(+r.brutto || 0) < 0 ? 'Gutschrift' : 'Rechnung'}</td><td class="mono">${esc(r.nummer || '–')}</td><td>${fmtD(r.datum)}</td><td>${esc(r.partner || '')}</td><td class="num">${fmtE(r.brutto)}</td><td>${badge(rStatus(r))}</td><td><button class="btn sm primary" data-rid="${r.id}">Zuordnen</button></td></tr>`).join('') || '<tr><td class="empty">Nichts gefunden.</td></tr>';
  });
  d.addEventListener('click', async e => {
    const t = e.target;
    if (t.closest('[data-delz]')) { await zuordnungLoeschen(t.closest('[data-delz]').dataset.delz); return again(); }
    if (t.closest('[data-r]')) { e.preventDefault(); return rechnungDetail(t.closest('[data-r]').dataset.r); }
    if (t.closest('[data-v]')) { const x = vs[+t.closest('[data-v]').dataset.v]; return pick(x.r); }
    if (t.closest('[data-rid]')) { const r = S.rechnungen.find(x => x.id === t.closest('[data-rid]').dataset.rid); return pick(r); }
    if (t.closest('[data-selgo]')) {
      // erst die gegengerechneten (Gutschriften bzw. Gegenrechnungen) – sie erhöhen, was für die übrigen übrig ist
      let rest = st.rest; const l = [...sel.values()].sort((a, c) => (fluss(a) < 0 ? 0 : 1) - (fluss(c) < 0 ? 0 : 1) || (a.datum || '').localeCompare(c.datum || ''));
      const gegen = l.some(r => fluss(r) < 0), notiz = l.length > 1 ? (gegen ? 'Verrechnung (' + l.length + ' Belege)' : 'Sammelzahlung (' + l.length + ' Rechnungen)') : null;
      for (const r of l) { const f = fluss(r); if (f > 0 && rest <= 0.005) break; const a = anteil(r, rest); await zuordnen(r, b, 'bank', a, notiz); rest = r2(rest - sg * dirR(r) * a); }
      again(); return toast(l.length + ' Rechnungen zugeordnet.');
    }
    if (t.closest('[data-a=kika]')) {
      t.disabled = true; t.textContent = '✨ KI überlegt …';
      try { const x = await DB.aiJson(`Ordne diesen Bankabgang einer Kfz-Werkstatt einer Kostenart zu. Name: ${b.gegenpartei}. Verwendungszweck: ${b.zweck}. Betrag: ${b.betrag} EUR.
Kostenarten: ${KOSTENARTEN.join(', ')}. Antworte nur mit JSON {"kostenart":"…","grund":"kurz"}`, { tier: 'quick' });
        if (KOSTENARTEN.includes(x.kostenart)) { await DB.update('bank', id, { kostenart: x.kostenart }); toast('KI: ' + x.kostenart + ' – ' + (x.grund || '')); again(); } else toast('Keine eindeutige Kostenart.');
      } catch (err) { toast(aiErr(err)); t.disabled = false; }
    }
  });
}

async function sumupDetail(id) {
  buildIdx();
  const s = S.sumup.find(x => x.id === id); if (!s) return;
  const st = sStatus(s), vs = sumOk(s) ? vorschlaege({ ...s, zweck: s.beschreibung }, 'sumup') : [], bk = s.bank_id && S.bank.find(b => b.id === s.bank_id);
  const d = openSheet({
    title: 'EC-Zahlung (SumUp) ' + fmtD(s.datum), wide: true, noOk: true, html: `
    <div class="det-head">${badge(st)} <b class="big">${fmtE(s.betrag)}</b></div>
    <dl class="dl"><dt>Beschreibung</dt><dd>${esc(s.beschreibung || '–')}</dd><dt>Karte</dt><dd>${esc(s.zahlungsart || '–')}</dd><dt>Transaktion</dt><dd class="mono">${esc(s.transaktion || '–')}</dd>
      <dt>Gebühr</dt><dd>${fmtE(s.gebuehr)}</dd><dt>Auszahlung</dt><dd>${s.auszahlung != null ? fmtE(s.auszahlung) : '–'} ${s.auszahlung_datum ? 'am ' + fmtD(s.auszahlung_datum) : ''}${bk ? ' · ✓ auf dem Konto am ' + fmtD(bk.datum) : ''}</dd></dl>
    <h4>Rechnung</h4>
    ${st.zuordnungen.length ? `<ul class="pays">${st.zuordnungen.map(z => { const r = S.rechnungen.find(x => x.id === z.rechnung_id); return `<li><span><a href="#" data-r="${z.rechnung_id}">${esc((r?.nummer || '') + ' · ' + (r?.partner || ''))}</a></span><b>${fmtE(z.betrag)}</b><button class="icon-btn" data-delz="${z.id}">✕</button></li>`; }).join('')}</ul>` : ''}
    ${st.rest > 0.005 ? `${vs.length ? `<div class="tw"><table class="tb"><tbody>${vs.map((x, i) => `<tr><td class="mono">${esc(x.r.nummer || '–')}</td><td>${fmtD(x.r.datum)}</td><td>${esc(x.r.partner || '')}</td><td class="num">${fmtE(x.r.brutto)}</td><td>${badge(x.st)}</td><td><button class="btn sm primary" data-v="${i}">Zuordnen</button></td></tr>`).join('')}</tbody></table></div>` : '<p class="muted small">Kein klarer Treffer.</p>'}
      <input class="inp search" type="search" id="rq" placeholder="Rechnung suchen: Nr., Kunde, Betrag …"><div class="tw"><table class="tb"><tbody id="rl"></tbody></table></div>` : ''}`
  });
  const again = () => { render(); sumupDetail(id); };
  const rq = $('#rq', d); if (rq) rq.addEventListener('input', () => {
    const q = rq.value.toLowerCase().trim(); if (q.length < 2) return $('#rl', d).innerHTML = '';
    const l = S.rechnungen.filter(r => r.richtung === 'ausgang' && q.split(/\s+/).every(w => textOf(r).includes(w))).slice(0, 20);
    $('#rl', d).innerHTML = l.map(r => `<tr><td class="mono">${esc(r.nummer || '–')}</td><td>${fmtD(r.datum)}</td><td>${esc(r.partner || '')}</td><td class="num">${fmtE(r.brutto)}</td><td><button class="btn sm primary" data-rid="${r.id}">Zuordnen</button></td></tr>`).join('');
  });
  d.addEventListener('click', async e => {
    const t = e.target;
    if (t.closest('[data-delz]')) { await zuordnungLoeschen(t.closest('[data-delz]').dataset.delz); return again(); }
    if (t.closest('[data-r]')) { e.preventDefault(); return rechnungDetail(t.closest('[data-r]').dataset.r); }
    const r = t.closest('[data-v]') ? vs[+t.closest('[data-v]').dataset.v].r : t.closest('[data-rid]') ? S.rechnungen.find(x => x.id === t.closest('[data-rid]').dataset.rid) : null;
    if (r) { await zuordnen(r, s, 'sumup', st.rest); again(); toast('Zugeordnet.'); }
  });
}
