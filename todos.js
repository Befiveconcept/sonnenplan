/* Mastercar Finanzen · To-Dos (wie im Sonnenplan): Zuständig, Fällig, Wiedervorlage, extern, Dringlichkeit, Updates mit Datum */
const PRIO = { dringend: ['Dringend', 3, 'st-bad'], hoch: ['Hoch', 2, 'st-warn'], normal: ['Normal', 1, 'st-open'], niedrig: ['Niedrig', 0, 'st-info'] };
// Mitarbeiter: aus Team, Hebebühne und bisherigen To-Dos
function mitarbeiter() {
  const s = new Set([...(S.einstellungen.mitarbeiter || []), ...S.hebebuehne.map(h => h.mitarbeiter), ...S.todos.map(t => t.wer)].filter(Boolean).map(x => String(x).trim()));
  if (S.meName) s.add(S.meName);
  return [...s].sort((a, b) => a.localeCompare(b, 'de'));
}
const todoOffen = t => !t.erledigt;
const todoDue = t => [t.faellig, t.wv].filter(Boolean).sort()[0] || null;
function todoGruppe(t) {
  if (t.erledigt) return 'Erledigt';
  const d = todoDue(t), heute = todayISO(); if (!d) return 'Ohne Datum';
  if (d < heute) return 'Überfällig'; if (d === heute) return 'Heute';
  if (d <= addDays(heute, 7 - ((new Date().getDay() + 6) % 7))) return 'Diese Woche'; return 'Später';
}
const todoFaelligAnz = () => S.todos.filter(t => todoOffen(t) && todoDue(t) && todoDue(t) <= todayISO()).length;
function todoLi(t) {
  const r = t.rechnung_id && S.rechnungen.find(x => x.id === t.rechnung_id), d = todoDue(t), late = d && d < todayISO() && !t.erledigt;
  return `<div class="td-li ${t.erledigt ? 'done' : ''} prio-${t.prio}" data-act="todo" data-id="${t.id}">
    <button class="td-chk" data-act="todoHaken" data-id="${t.id}" aria-label="${t.erledigt ? 'Wieder öffnen' : 'Erledigt'}">${t.erledigt ? '✓' : ''}</button>
    <div class="td-b"><b>${esc(t.titel)}</b><div class="td-m small">${t.prio !== 'normal' ? badge({ cls: PRIO[t.prio][2], label: PRIO[t.prio][0] }) + ' ' : ''}${t.wer ? '👤 ' + esc(t.wer) + ' · ' : ''}${t.faellig ? `<span class="${late ? 'neg' : ''}">fällig ${fmtD(t.faellig)}</span> · ` : ''}${t.wv ? '⏰ WV ' + fmtD(t.wv) + ' · ' : ''}${t.extern ? 'liegt bei ' + esc(t.extern) + ' · ' : ''}${t.status ? esc(t.status) + ' · ' : ''}${(t.updates || []).length ? '💬 ' + t.updates.length + ' · ' : ''}${r ? '📄 ' + esc(r.nummer || r.partner) : ''}</div></div></div>`;
}
function viewTodos() {
  const f = UI.filt.todos || 'offen', wer = UI.todoWer || '', q = (UI.q.todos || '').toLowerCase().trim();
  let l = S.todos.filter(t => f === 'alle' || (f === 'erledigt' ? t.erledigt : !t.erledigt));
  if (wer) l = l.filter(t => t.wer === wer);
  if (q) l = l.filter(t => q.split(/\s+/).every(w => [t.titel, t.details, t.thema, t.wer, t.extern, t.status, ...(t.updates || []).map(u => u.text)].join(' ').toLowerCase().includes(w)));
  const ORD = ['Überfällig', 'Heute', 'Diese Woche', 'Später', 'Ohne Datum', 'Erledigt'], G = {};
  l.forEach(t => (G[todoGruppe(t)] = G[todoGruppe(t)] || []).push(t));
  Object.values(G).forEach(a => a.sort((x, y) => (PRIO[y.prio]?.[1] ?? 1) - (PRIO[x.prio]?.[1] ?? 1) || (todoDue(x) || '9').localeCompare(todoDue(y) || '9')));
  return `
  <div class="toolbar"><h1>To-Dos</h1><span class="sp"></span><button class="btn primary" data-act="todoNeu">＋ Neues To-Do</button></div>
  <form class="td-quick" id="tdQuick"><input class="inp" id="tdQ" placeholder="Schnell anlegen: z. B. „Reifenlieferant wegen Gutschrift anrufen“ – Enter"><select class="inp" id="tdQW"><option value="">– wer? –</option>${mitarbeiter().map(m => `<option>${esc(m)}</option>`).join('')}</select><input class="inp" type="date" id="tdQD" aria-label="Fällig"><button class="btn">Anlegen</button></form>
  <div class="filters">${chips('todos', [['offen', 'Offen'], ['erledigt', 'Erledigt'], ['alle', 'Alle']])}
    <select class="inp" data-chg="todoWer"><option value="">Alle Mitarbeiter</option>${mitarbeiter().map(m => `<option ${m === wer ? 'selected' : ''}>${esc(m)}</option>`).join('')}</select>${searchIn('todos', 'To-Dos durchsuchen …')}</div>
  ${l.length ? ORD.filter(g => G[g]).map(g => `<section class="td-grp"><h3 class="${g === 'Überfällig' ? 'neg' : ''}">${g} <span class="cnt">${G[g].length}</span></h3>${G[g].slice(0, g === 'Erledigt' ? 100 : 400).map(todoLi).join('')}</section>`).join('') : '<div class="empty">Keine To-Dos. Oben eins anlegen – oder die KI fragen: „Leg mir ein To-Do an: …“</div>'}`;
}
function todoForm(t, pre) {
  const neu = !t; t = t ? JSON.parse(JSON.stringify(t)) : { prio: 'normal', updates: [], ...(pre || {}) };
  const ma = mitarbeiter();
  const d = openSheet({
    title: neu ? 'Neues To-Do' : 'To-Do bearbeiten', wide: !neu, html: `<form class="form2">
    <label class="fld full"><span>To-Do *</span><input class="inp" name="titel" value="${esc(t.titel || '')}" required></label>
    <label class="fld"><span>Zuständig</span><input class="inp" name="wer" list="maList" value="${esc(t.wer || '')}"><datalist id="maList">${ma.map(m => `<option value="${esc(m)}">`).join('')}</datalist></label>
    <label class="fld"><span>Fällig am</span><input class="inp" type="date" name="faellig" value="${esc(t.faellig || '')}"></label>
    <label class="fld"><span>Wiedervorlage am</span><input class="inp" type="date" name="wv" value="${esc(t.wv || '')}"></label>
    <div class="fld"><span>Schnell</span><div class="chips">${[['Morgen', 1], ['In 3 Tagen', 3], ['Nächste Woche', 7], ['In 2 Wochen', 14]].map(([l, n]) => `<button type="button" class="chip" data-wv="${n}">${l}</button>`).join('')}</div></div>
    <label class="fld full"><span>Woran erinnern? (Wiedervorlage)</span><input class="inp" name="wv_notiz" value="${esc(t.wv_notiz || '')}" placeholder="z. B. nachfassen, ob Gutschrift gekommen ist"></label>
    <label class="fld"><span>Liegt extern bei (Firma / Person)</span><input class="inp" name="extern" value="${esc(t.extern || '')}" placeholder="leer = intern"></label>
    <label class="fld"><span>Dringlichkeit</span><select class="inp" name="prio">${Object.entries(PRIO).map(([k, v]) => `<option value="${k}" ${t.prio === k ? 'selected' : ''}>${v[0]}</option>`).join('')}</select></label>
    <label class="fld"><span>Thema</span><input class="inp" name="thema" value="${esc(t.thema || '')}"></label>
    <label class="fld"><span>Status</span><input class="inp" name="status" value="${esc(t.status || '')}" placeholder="z. B. ongoing, wartet auf Antwort"></label>
    <label class="fld full"><span>Details / Notiz</span><textarea class="inp" name="details" rows="3">${esc(t.details || '')}</textarea></label></form>
    ${t.rechnung_id ? `<p class="small">📄 Verknüpft mit Rechnung <a href="#" data-r="${t.rechnung_id}">${esc((S.rechnungen.find(r => r.id === t.rechnung_id) || {}).nummer || 'öffnen')}</a></p>` : ''}
    ${neu ? '' : `<h4>Updates mit Datum</h4><ul class="td-upd">${(t.updates || []).slice().reverse().map(u => `<li><small>${fmtD(u.d)}${u.wer ? ' · ' + esc(u.wer) : ''}</small>${esc(u.text)}</li>`).join('') || '<li class="muted small">Noch keine.</li>'}</ul>
      <div class="td-upd-in"><input class="inp" id="tdUpd" placeholder="Neues Update – z. B. „angerufen, kommt Freitag“"><button type="button" class="btn sm" data-a="upd">Eintragen</button></div>
      <div class="btnrow">${t.erledigt ? '<button type="button" class="btn" data-a="open">Wieder öffnen</button>' : '<button type="button" class="btn primary" data-a="done">✓ Erledigt</button>'}<button type="button" class="btn" data-a="follow">＋ Folge-To-Do</button><button type="button" class="btn danger" data-a="del">Löschen</button></div>`}`,
    onOk: async dd => {
      const fd = Object.fromEntries(new FormData($('form', dd)));
      if (!fd.titel.trim()) { toast('Bitte das To-Do eintragen.'); return false; }
      const row = { titel: fd.titel.trim(), wer: fd.wer.trim() || null, faellig: fd.faellig || null, wv: fd.wv || null, wv_notiz: fd.wv ? fd.wv_notiz || null : null, extern: fd.extern || null, prio: fd.prio, thema: fd.thema || null, status: fd.status || null, details: fd.details || null };
      if (neu) await DB.insert('todos', [{ ...row, updates: [], rechnung_id: t.rechnung_id || null }]); else await DB.update('todos', t.id, row);
      render(); toast(neu ? 'To-Do angelegt.' : 'Gespeichert.');
    }
  });
  $$('[data-wv]', d).forEach(b => b.onclick = () => { $('[name=wv]', d).value = addDays(todayISO(), +b.dataset.wv); });
  d.addEventListener('click', async e => {
    if (e.target.closest('[data-r]')) { e.preventDefault(); return rechnungDetail(e.target.closest('[data-r]').dataset.r); }
    const a = e.target.closest('[data-a]')?.dataset.a; if (!a || neu) return;
    if (a === 'upd') { const v = $('#tdUpd', d).value.trim(); if (!v) return; const ups = [...(t.updates || []), { d: todayISO(), wer: S.meName || '', text: v }]; await DB.update('todos', t.id, { updates: ups }); render(); return todoForm(S.todos.find(x => x.id === t.id)); }
    if (a === 'done' || a === 'open') { await todoHaken(t.id); closeSheet(); return; }
    if (a === 'follow') { closeSheet(); return setTimeout(() => todoForm(null, { titel: '', wer: t.wer, thema: t.thema, rechnung_id: t.rechnung_id, details: 'Folge-To-Do zu „' + t.titel + '“' }), 50); }
    if (a === 'del') { if (confirm('To-Do löschen?')) { await DB.remove('todos', t.id); closeSheet(); render(); } }
  });
}
async function todoHaken(id) {
  const t = S.todos.find(x => x.id === id); if (!t) return;
  await DB.update('todos', id, { erledigt: !t.erledigt, erledigt_am: t.erledigt ? null : todayISO() });
  render(); toast(t.erledigt ? '✓ Erledigt.' : 'Wieder offen.');
}
document.addEventListener('submit', async e => {
  if (e.target.id !== 'tdQuick') return; e.preventDefault();
  const v = $('#tdQ').value.trim(); if (!v) return;
  await DB.insert('todos', [{ titel: v, wer: $('#tdQW').value || null, faellig: $('#tdQD').value || null, prio: 'normal', updates: [] }]);
  render(); toast('To-Do angelegt.'); setTimeout(() => $('#tdQ')?.focus(), 30);
});
