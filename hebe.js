/* Mastercar Finanzen · Hebebühne: Stunden je Tag und Mitarbeiter, Aufträge, Vergleich je KW
   „Auf Rechnung“ = Werkstatt-Lohn netto aus dem Rechnungsausgang · „Tatsächlich“ = Stunden × Stundensatz */
const STUNDENSATZ = () => +(S.einstellungen.stundensatz ?? 105);
const kwKey = d => { const k = isoWeek(d); return k.y + '-' + String(k.w).padStart(2, '0'); };
function hebeWochen(jahr) {
  const W = {};
  const get = k => W[k] = W[k] || { std: 0, lohn: 0, n: 0 };
  S.hebebuehne.forEach(h => { const k = kwKey(h.datum); if (!k.startsWith(jahr)) return; const w = get(k); w.std += +h.stunden || 0; w.n++; });
  // alle Ausgangsrechnungen inkl. Stornos (Storno-Gegenbuchung gleicht sich aus) – wie in der Excel-Mappe
  S.rechnungen.forEach(r => { if (r.richtung !== 'ausgang' || !r.datum) return; const k = kwKey(r.datum); if (!k.startsWith(jahr)) return; get(k).lohn += +r.lohn || 0; });
  return W;
}
function viewHebe() {
  const satz = STUNDENSATZ();
  const all = [...new Set(S.hebebuehne.map(h => kwKey(h.datum)))].sort();
  if (!UI.hebeKW) { const cur = kwKey(todayISO()); UI.hebeKW = all.includes(cur) || !all.length ? cur : all[all.length - 1]; }
  const [y, w] = UI.hebeKW.split('-').map(Number), mon = isoWeekMonday(y, w), days = [0, 1, 2, 3, 4, 5].map(i => addDays(mon, i));
  const W = hebeWochen(String(y)), cw = W[UI.hebeKW] || { std: 0, lohn: 0 };
  const maAlle = [...new Set(S.hebebuehne.map(h => h.mitarbeiter))].sort((a, b) => a.localeCompare(b, 'de'));
  // nur Mitarbeiter zeigen, die um diese Woche herum (±60 Tage) Einträge haben
  const ma = UI.hebeMa ? [UI.hebeMa] : maAlle.filter(m => S.hebebuehne.some(h => h.mitarbeiter === m && h.datum >= addDays(mon, -60) && h.datum <= addDays(mon, 60)));
  const zelle = (d, m) => {
    const es = S.hebebuehne.filter(h => h.datum === d && h.mitarbeiter === m);
    const std = sum(es, h => h.stunden);
    return `<td class="hb-c ${es.some(h => h.abwesend) ? 'abw' : ''}" data-act="hebeNeu" data-d="${d}" data-ma="${esc(m)}">${es.length ? `${std ? `<b>${String(std).replace('.', ',')} h</b>` : ''}${es.map(h => h.abwesend ? `<div class="small">${esc(h.abwesend)}</div>` : (h.auftraege || []).map(j => `<div class="hb-j" data-act="hebeE" data-id="${h.id}">${esc([j.name, j.auftrag].filter(Boolean).join(' · ') || j.kdnr)}</div>`).join('') || (h.stunden ? `<div class="hb-j" data-act="hebeE" data-id="${h.id}">ohne Auftrag</div>` : '')).join('')}` : '<span class="muted">＋</span>'}</td>`;
  };
  const kws = Object.keys(W).sort(), last16 = kws.filter(k => k <= UI.hebeKW).slice(-16);
  const jahrSum = { std: sum(Object.values(W), x => x.std), lohn: sum(Object.values(W), x => x.lohn) };
  return `
  <div class="toolbar"><h1>Hebebühne</h1><span class="sp"></span>
    <button class="btn" data-act="hebeKW" data-d="-1">‹</button><b class="kw-l">KW ${w} / ${y}<small>${fmtD(mon)} – ${fmtD(days[5])}</small></b><button class="btn" data-act="hebeKW" data-d="1">›</button><button class="btn" data-act="hebeKW" data-d="0">Heute</button>
    <button class="btn primary" data-act="hebeNeu">＋ Eintrag</button></div>
  <section class="kpi">
    <div class="k hi"><div class="kv">${String(r2(cw.std)).replace('.', ',')} h</div><div class="kl">Stunden an der Hebebühne in KW ${w}</div></div>
    <div class="k"><div class="kv">${fmtE(cw.lohn)}</div><div class="kl">Auf Rechnung (Werkstatt-Lohn netto)</div></div>
    <div class="k"><div class="kv">${fmtE(cw.std * satz)}</div><div class="kl">Tatsächlich (${String(cw.std).replace('.', ',')} h × ${fmtE(satz)})</div></div>
    <div class="k ${cw.lohn - cw.std * satz < -0.005 ? 'alarm' : ''}"><div class="kv ${cw.lohn - cw.std * satz < -0.005 ? 'neg' : ''}">${fmtE(cw.lohn - cw.std * satz)}</div><div class="kl">Differenz (Rechnung − tatsächlich)</div></div>
  </section>
  <div class="filters"><select class="inp" data-chg="hebeMa"><option value="">Alle Mitarbeiter</option>${maAlle.map(m => `<option ${m === UI.hebeMa ? 'selected' : ''}>${esc(m)}</option>`).join('')}</select>
    <label class="small">Stundensatz € <input class="inp num-in" type="number" step="1" value="${satz}" data-chg="stundensatz"></label></div>
  <div class="tw"><table class="tb hb-t"><thead><tr><th>Mitarbeiter</th>${days.map(d => `<th>${['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'][days.indexOf(d)]} ${fmtD(d).slice(0, 6)}</th>`).join('')}<th class="num">Summe</th></tr></thead><tbody>
    ${(ma.length ? ma : maAlle).map(m => `<tr><th>${esc(m)}</th>${days.map(d => zelle(d, m)).join('')}<td class="num"><b>${String(r2(sum(S.hebebuehne.filter(h => h.mitarbeiter === m && h.datum >= mon && h.datum <= days[5]), h => h.stunden))).replace('.', ',')} h</b></td></tr>`).join('') || '<tr><td colspan="8" class="empty">Noch keine Einträge – „＋ Eintrag“ oder die Excel-Mappe reinziehen.</td></tr>'}
  </tbody></table></div>
  <div class="grid2" style="margin-top:16px">
    <section class="card"><h3>Auf Rechnung vs. tatsächlich (letzte 16 Wochen)</h3>${barChart(last16.map(k => 'KW' + +k.slice(5)), [{ name: 'Auf Rechnung', cls: 'c1', data: last16.map(k => r2(W[k].lohn)) }, { name: 'Tatsächlich', cls: 'c2', data: last16.map(k => r2(W[k].std * satz)) }])}</section>
    <section class="card"><h3>Kalenderwochen ${y}</h3><p class="small muted">Gesamt: ${String(r2(jahrSum.std)).replace('.', ',')} h · auf Rechnung ${fmtE(jahrSum.lohn)} · tatsächlich ${fmtE(jahrSum.std * satz)} · Differenz ${fmtE(jahrSum.lohn - jahrSum.std * satz)}</p>
      <div class="tw" style="max-height:340px;overflow:auto"><table class="tb click"><thead><tr><th>KW</th><th class="num">Stunden</th><th class="num">Auf Rechnung</th><th class="num">Tatsächlich</th><th class="num">Differenz</th></tr></thead><tbody>
      ${kws.slice().reverse().map(k => { const x = W[k], diff = x.lohn - x.std * satz; return `<tr data-act="hebeGo" data-k="${k}" class="${k === UI.hebeKW ? 'sel' : ''}"><td>KW ${+k.slice(5)}</td><td class="num">${String(r2(x.std)).replace('.', ',')}</td><td class="num">${fmtE(x.lohn)}</td><td class="num">${fmtE(x.std * satz)}</td><td class="num ${diff < 0 ? 'neg' : 'pos'}">${fmtE(diff)}</td></tr>`; }).join('')}</tbody></table></div></section>
  </div>`;
}
function hebeForm(h, pre) {
  const neu = !h; h = h || { datum: todayISO(), auftraege: [], ...(pre || {}) };
  const jobs = [0, 1, 2].map(i => h.auftraege?.[i] || {});
  openSheet({
    title: neu ? 'Hebebühne – neuer Eintrag' : 'Hebebühne – Eintrag', html: `<form class="form2">
    <label class="fld"><span>Datum</span><input class="inp" type="date" name="datum" value="${esc(h.datum)}" required></label>
    <label class="fld"><span>Mitarbeiter</span><input class="inp" name="mitarbeiter" list="maList2" value="${esc(h.mitarbeiter || '')}" required><datalist id="maList2">${mitarbeiter().map(m => `<option value="${esc(m)}">`).join('')}</datalist></label>
    <label class="fld"><span>Stunden an der Hebebühne</span><input class="inp" type="number" step="0.25" min="0" name="stunden" value="${h.stunden ?? ''}"></label>
    <label class="fld"><span>Abwesend (krank, Urlaub …)</span><input class="inp" name="abwesend" value="${esc(h.abwesend || '')}"></label>
    ${jobs.map((j, i) => `<div class="fld full hb-jobrow"><span>${i + 1}. Auftrag</span><div class="hb-job3"><input class="inp" name="n${i}" placeholder="Firma / Name" value="${esc(j.name || '')}"><input class="inp" name="k${i}" placeholder="Auftrags-/Kd.-Nr. (w26-…)" value="${esc(j.kdnr || '')}"><input class="inp" name="a${i}" placeholder="Kennzeichen" value="${esc(j.auftrag || '')}"></div></div>`).join('')}
    <label class="fld full"><span>Notiz</span><input class="inp" name="notiz" value="${esc(h.notiz || '')}"></label></form>
    ${neu ? '' : '<button type="button" class="btn danger" id="hbDel">Eintrag löschen</button>'}`,
    onOk: async d => {
      const fd = Object.fromEntries(new FormData($('form', d)));
      if (!fd.datum || !fd.mitarbeiter.trim()) { toast('Bitte Datum und Mitarbeiter eintragen.'); return false; }
      const row = { datum: fd.datum, mitarbeiter: fd.mitarbeiter.trim(), stunden: parseNum(fd.stunden), abwesend: fd.abwesend || null, notiz: fd.notiz || null,
        auftraege: [0, 1, 2].map(i => ({ name: fd['n' + i].trim(), kdnr: fd['k' + i].trim(), auftrag: fd['a' + i].trim().toUpperCase() })).filter(j => j.name || j.kdnr || j.auftrag) };
      if (neu) await DB.insert('hebebuehne', [{ ...row, schluessel: 'HM' + uid() }]); else await DB.update('hebebuehne', h.id, row);
      UI.hebeKW = kwKey(row.datum); render(); toast('Gespeichert.');
    }
  });
  const del = $('#hbDel'); if (del) del.onclick = async () => { if (confirm('Eintrag löschen?')) { await DB.remove('hebebuehne', h.id); closeSheet(); render(); } };
}
