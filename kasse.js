/* Mastercar Finanzen · Kassenbuch: alle Bar-Einnahmen und -Ausgaben mit laufendem Bestand */
const kasseAnfang = () => +(S.einstellungen.kasse_anfang ?? 0);
const kasseSort = (a, b) => a.datum.localeCompare(b.datum) || (parseInt(a.belegnr) || 0) - (parseInt(b.belegnr) || 0) || (a.created_at || '').localeCompare(b.created_at || '');
// Laufender Bestand über alle Einträge (chronologisch)
function kasseBestand() {
  let b = kasseAnfang(); const map = new Map(); let minus = null;
  [...S.kasse].sort(kasseSort).forEach(k => { b = r2(b + (+k.betrag || 0)); map.set(k.id, b); if (b < -0.005 && !minus) minus = { datum: k.datum, b }; });
  return { map, bestand: b, minus };
}
// Mögliche Doppel-Einträge: gleiches Datum, gleicher Betrag, gleiche Beleg-Nr.
function kasseDoppelt() {
  const g = {}; S.kasse.forEach(k => { const key = k.datum + '|' + r2(k.betrag) + '|' + (k.belegnr || ''); (g[key] = g[key] || []).push(k.id); });
  return new Set(Object.values(g).filter(a => a.length > 1).flat());
}
function viewKasse() {
  buildIdx();
  const range = periodRange(UI.period), B = kasseBestand(), DUP = kasseDoppelt();
  let list = S.kasse.filter(k => UI.period === 'alle' || inP(k.datum, range)).map(k => ({ k, st: kStatus(k) }));
  const f = UI.filt.kasse || 'alle';
  if (f === 'ein') list = list.filter(x => x.k.betrag > 0); else if (f === 'aus') list = list.filter(x => x.k.betrag < 0); else if (f === 'ohne') list = list.filter(x => x.st.key === 'offen'); else if (f === 'doppelt') list = list.filter(x => DUP.has(x.k.id));
  const q = (UI.q.kasse || '').toLowerCase().trim(); if (q) list = list.filter(x => q.split(/\s+/).every(w => [x.k.text, x.k.belegnr, x.k.kostenart, fmtE(x.k.betrag), x.k.betrag, fmtD(x.k.datum)].join(' ').toLowerCase().includes(w)));
  list.sort((a, b) => kasseSort(b.k, a.k));
  const kRe = x => x.st.zuordnungen.map(z => S.rechnungen.find(r => r.id === z.rechnung_id)).filter(Boolean).map(r => (r.nummer || '') + ' ' + (r.partner || '')).join(' ') || x.k.kostenart || '';
  const cols = [colDat('datum', 'Datum', x => x.k.datum), colTxt('beleg', 'Beleg', x => x.k.belegnr), colTxt('text', 'Text', x => x.k.text),
    colNum('ein', 'Einnahme', x => x.k.betrag > 0 ? x.k.betrag : null), colNum('aus', 'Ausgabe', x => x.k.betrag < 0 ? -x.k.betrag : null), colNum('bestand', 'Bestand', x => B.map.get(x.k.id)),
    colTxt('re', 'Rechnung / Kostenart', kRe), { k: 'st', l: 'Status', v: x => x.st.label, sel: true }];
  const base = list; list = colApply('kasse', list, cols);
  const ein = sum(list.filter(x => x.k.betrag > 0), x => x.k.betrag), aus = sum(list.filter(x => x.k.betrag < 0), x => x.k.betrag), lim = UI.more.kasse || 300;
  return `
  <div class="toolbar"><h1>Kassenbuch</h1><span class="sp"></span><button class="btn primary" data-act="kasseNeu" data-a="aus">− Ausgabe</button><button class="btn primary" data-act="kasseNeu" data-a="ein">＋ Einnahme</button><button class="btn" data-act="auto" title="Neue Rechnungen und Kassenbuchungen nochmal abgleichen">⟳ Abgleichen</button><button class="btn" data-act="csv" data-v="kasse">CSV</button></div>
  ${DUP.size ? `<div class="warn">⚠ ${DUP.size} Einträge sehen doppelt aus (gleiches Datum, gleicher Betrag, gleiche Beleg-Nr.) – <a href="#" data-act="filt" data-v="kasse" data-f="doppelt">anzeigen</a> und ggf. löschen.</div>` : ''}
  ${B.minus ? `<div class="warn">⚠ Der Kassenbestand war am ${fmtD(B.minus.datum)} negativ (${fmtE(B.minus.b)}). Eine Kasse darf nie unter null fallen – bitte Einträge prüfen.</div>` : ''}
  <section class="kpi">
    <div class="k hi"><div class="kv">${fmtE(B.bestand)}</div><div class="kl">Aktueller Kassenbestand</div></div>
    <div class="k"><div class="kv">${fmtE(ein)}</div><div class="kl">Einnahmen im Zeitraum</div></div>
    <div class="k"><div class="kv">${fmtE(aus)}</div><div class="kl">Ausgaben im Zeitraum</div></div>
    <button class="k" data-act="filt" data-v="kasse" data-f="ohne"><div class="kv">${list.filter(x => x.st.key === 'offen').length}</div><div class="kl">ohne zugeordneten Beleg</div></button>
  </section>
  <div class="filters">${chips('kasse', [['alle', 'Alle'], ['ein', 'Einnahmen'], ['aus', 'Ausgaben'], ['ohne', 'Ohne Beleg'], ...(DUP.size ? [['doppelt', 'Doppelt?']] : [])])}${searchIn('kasse', 'Text, Beleg-Nr., Betrag …')}
    <select class="inp" data-chg="period">${PERIODS.map(p => `<option value="${p[0]}" ${UI.period === p[0] ? 'selected' : ''}>${p[1]}</option>`).join('')}</select>
    <label class="small">Anfangsbestand <input class="inp num-in" type="number" step="0.01" value="${kasseAnfang()}" data-chg="kasseAnfang"></label>${colReset('kasse')}</div>
  <div class="tw"><table class="tb click">${colHead('kasse', cols, base)}<tbody>
  ${list.slice(0, lim).map(({ k, st }) => { const rs = st.zuordnungen.map(z => S.rechnungen.find(r => r.id === z.rechnung_id)).filter(Boolean);
    return `<tr data-act="kasseD" data-id="${k.id}"><td>${fmtD(k.datum)}</td><td class="mono">${esc(k.belegnr || '')}</td><td>${esc(k.text || '')}</td><td class="num pos">${k.betrag > 0 ? fmtE(k.betrag) : ''}</td><td class="num neg">${k.betrag < 0 ? fmtE(-k.betrag) : ''}</td>
    <td class="num ${B.map.get(k.id) < 0 ? 'neg' : ''}">${fmtE(B.map.get(k.id))}</td><td class="small">${rs.length ? rs.map(r => esc((r.nummer || '') + ' ' + (r.partner || ''))).join(' · ') : esc(k.kostenart || '')}</td><td>${badge(st)}${DUP.has(k.id) ? ' ' + badge({ cls: 'st-bad', label: 'doppelt?' }) : ''}</td></tr>`; }).join('') || '<tr><td colspan="8" class="empty">Keine Einträge.</td></tr>'}
  </tbody></table></div>${moreBtn('kasse', list.length, lim)}`;
}
function kasseForm(k, art) {
  const neu = !k, aus = k ? k.betrag < 0 : art === 'aus';
  const nextNr = () => String(Math.max(0, ...S.kasse.map(x => parseInt(x.belegnr) || 0)) + 1);
  const v = k || { datum: todayISO(), belegnr: nextNr() };
  openSheet({
    title: neu ? (aus ? 'Bar-Ausgabe' : 'Bar-Einnahme') : 'Kassenbuch-Eintrag', html: `<form class="form2">
    <label class="fld"><span>Datum</span><input class="inp" type="date" name="datum" value="${esc(v.datum)}" required></label>
    <label class="fld"><span>Beleg-Nr.</span><input class="inp" name="belegnr" value="${esc(v.belegnr || '')}"></label>
    <label class="fld"><span>Betrag (€)</span><input class="inp" type="number" step="0.01" min="0" name="betrag" value="${k ? Math.abs(k.betrag) : ''}" required></label>
    <label class="fld"><span>Art</span><select class="inp" name="art"><option value="ein" ${!aus ? 'selected' : ''}>Einnahme</option><option value="aus" ${aus ? 'selected' : ''}>Ausgabe</option></select></label>
    <label class="fld full"><span>Text (z. B. Rechnungsnr. „R26-0123“ oder „Kraftstoff“)</span><input class="inp" name="text" value="${esc(v.text || '')}"></label>
    <label class="fld"><span>Kostenart (bei Ausgaben ohne Beleg)</span><select class="inp" name="kostenart"><option value="">–</option>${KOSTENARTEN.map(x => `<option ${v.kostenart === x ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></label>
    <label class="fld"><span>Notiz</span><input class="inp" name="notiz" value="${esc(v.notiz || '')}"></label></form>`,
    onOk: async d => {
      const fd = Object.fromEntries(new FormData($('form', d))), b = parseNum(fd.betrag);
      if (!b || !fd.datum) { toast('Bitte Datum und Betrag eintragen.'); return false; }
      const row = { datum: fd.datum, belegnr: fd.belegnr || null, betrag: r2(fd.art === 'aus' ? -Math.abs(b) : Math.abs(b)), text: fd.text || null, kostenart: fd.kostenart || (fd.art === 'aus' ? kostenartVorschlag(fd.text, fd.text) : null), notiz: fd.notiz || null };
      if (k) await DB.update('kasse', k.id, row); else await DB.insert('kasse', [{ ...row, schluessel: 'KM' + uid() }]);
      await autoAbgleich(); render(); toast('Gespeichert.');
    }
  });
}
function kasseDetail(id) {
  buildIdx();
  const k = S.kasse.find(x => x.id === id); if (!k) return;
  const st = kStatus(k), vs = vorschlaege(k, 'kasse');
  const d = openSheet({
    title: 'Kassenbuch ' + fmtD(k.datum) + (k.belegnr ? ' · Beleg ' + k.belegnr : ''), wide: true, noOk: true, html: `
    <div class="det-head">${badge(st)} <b class="big ${k.betrag < 0 ? 'neg' : 'pos'}">${fmtE(k.betrag)}</b></div>
    <dl class="dl"><dt>Text</dt><dd>${esc(k.text || '–')}</dd><dt>Kostenart</dt><dd>${esc(k.kostenart || '–')}</dd>${k.notiz ? `<dt>Notiz</dt><dd>${esc(k.notiz)}</dd>` : ''}<dt>Bestand danach</dt><dd>${fmtE(kasseBestand().map.get(k.id))}</dd></dl>
    <h4>Beleg / Rechnung</h4>
    ${st.zuordnungen.length ? `<ul class="pays">${st.zuordnungen.map(z => { const r = S.rechnungen.find(x => x.id === z.rechnung_id); return `<li><span><a href="#" data-r="${z.rechnung_id}">${esc((r?.nummer || '') + ' · ' + (r?.partner || ''))}</a></span><b>${fmtE(z.betrag)}</b><button class="icon-btn" data-delz="${z.id}">✕</button></li>`; }).join('')}</ul>` : '<p class="muted small">Noch keiner zugeordnet.</p>'}
    ${st.rest > 0.005 ? `${vs.length ? `<div class="tw"><table class="tb"><tbody>${vs.map((x, i) => `<tr><td class="mono">${esc(x.r.nummer || '–')}</td><td>${fmtD(x.r.datum)}</td><td>${esc(x.r.partner || '')}</td><td class="num">${fmtE(x.r.brutto)}</td><td>${badge(x.st)}</td><td><button class="btn sm primary" data-v="${i}">Zuordnen</button></td></tr>`).join('')}</tbody></table></div>` : ''}
      <input class="inp search" type="search" id="rq" placeholder="Rechnung suchen: Nr., Name, Betrag …"><div class="tw"><table class="tb"><tbody id="rl"></tbody></table></div>` : ''}
    <div class="btnrow"><button class="btn" data-a="edit">Bearbeiten</button><button class="btn danger" data-a="del">Löschen</button></div>`
  });
  const again = () => { render(); kasseDetail(id); };
  const rq = $('#rq', d); if (rq) rq.addEventListener('input', () => {
    const q = rq.value.toLowerCase().trim(); if (q.length < 2) return $('#rl', d).innerHTML = '';
    $('#rl', d).innerHTML = S.rechnungen.filter(r => r.richtung === (k.betrag > 0 ? 'ausgang' : 'eingang') && q.split(/\s+/).every(w => textOf(r).includes(w))).slice(0, 20)
      .map(r => `<tr><td class="mono">${esc(r.nummer || '–')}</td><td>${fmtD(r.datum)}</td><td>${esc(r.partner || '')}</td><td class="num">${fmtE(r.brutto)}</td><td><button class="btn sm primary" data-rid="${r.id}">Zuordnen</button></td></tr>`).join('');
  });
  d.addEventListener('click', async e => {
    const t = e.target;
    if (t.closest('[data-delz]')) { await zuordnungLoeschen(t.closest('[data-delz]').dataset.delz); return again(); }
    if (t.closest('[data-r]')) { e.preventDefault(); return rechnungDetail(t.closest('[data-r]').dataset.r); }
    const a = t.closest('[data-a]')?.dataset.a;
    if (a === 'edit') return kasseForm(k);
    if (a === 'del') { if (confirm('Eintrag löschen?')) { await DB.remove('kasse', id); closeSheet(); render(); } return; }
    const r = t.closest('[data-v]') ? vs[+t.closest('[data-v]').dataset.v].r : t.closest('[data-rid]') ? S.rechnungen.find(x => x.id === t.closest('[data-rid]').dataset.rid) : null;
    if (r) { await zuordnen(r, k, 'kasse', st.rest); again(); toast('Zugeordnet.'); }
  });
}
