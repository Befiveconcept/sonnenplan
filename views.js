/* Mastercar Finanzen · Ansichten */
const UI = { view: 'start', period: 'jahr', filt: { ausgang: 'alle', eingang: 'alle', bank: 'offen', sumup: 'alle', kasse: 'alle', todos: 'offen' }, q: {}, more: {} };
const NAV = [
  ['start', 'Übersicht', '◧'], ['todos', 'To-Dos', '☑'], ['ausgang', 'Rechnungsausgang', '↗'], ['eingang', 'Rechnungseingang', '↘'],
  ['bank', 'Bank', '⇄'], ['sumup', 'SumUp / EC', '▭'], ['kasse', 'Kassenbuch', '€'], ['hebe', 'Hebebühne', '⇡'],
  ['avis', 'Zahlungsavis', '✉'], ['ablage', 'Ablage', '🗂'], ['guv', 'Auswertungen', 'Σ'], ['abgleich', 'Abgleich & Probleme', '⚑'], ['einst', 'Einstellungen', '⚙']
];
const PERIODS = [['monat', 'Dieser Monat'], ['vormonat', 'Letzter Monat'], ['quartal', 'Dieses Quartal'], ['jahr', 'Dieses Jahr'], ['12m', 'Letzte 12 Monate'], ['alle', 'Alles (ab 2026)']];
function periodRange(p) {
  const t = todayISO(), y = +t.slice(0, 4), m = +t.slice(5, 7), pad = n => String(n).padStart(2, '0');
  const end = (yy, mm) => `${yy}-${pad(mm)}-${pad(new Date(yy, mm, 0).getDate())}`; // letzter Tag des Monats
  switch (p) {
    case 'monat': return [`${y}-${pad(m)}-01`, end(y, m)];
    case 'vormonat': { const yy = m === 1 ? y - 1 : y, mm = m === 1 ? 12 : m - 1; return [`${yy}-${pad(mm)}-01`, end(yy, mm)]; }
    case 'quartal': { const q0 = Math.floor((m - 1) / 3) * 3 + 1; return [`${y}-${pad(q0)}-01`, end(y, q0 + 2)]; }
    case 'jahr': return [`${y}-01-01`, `${y}-12-31`];
    case 'vorjahr': return [`${y - 1}-01-01`, `${y - 1}-12-31`];
    case '12m': { const yy = m === 12 ? y : y - 1, mm = m === 12 ? 1 : m + 1; return [`${yy}-${pad(mm)}-01`, end(y, m)]; }
    default: return ['0000-01-01', '9999-12-31'];
  }
}
const inP = (d, [a, b]) => d && d >= a && d <= b;
const badge = st => `<span class="badge ${st.cls}">${esc(st.label)}</span>${st.hint ? ` <span class="badge ${st.hint[1]} hint">${esc(st.hint[0])}</span>` : ''}`;
// Status direkt in der Liste ändern (wie in der Excel-Spalte)
const stSelect = r => `<select class="st-sel ${ST_CLS(rStatus(r).label)}" data-chg="rstatus" data-id="${r.id}" aria-label="Status">${stListe(r.richtung).map(s => `<option ${s === rStatus(r).label ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select>`;
const ZA = { bank: 'Überweisung', sepa: 'SEPA-Lastschrift', ec: 'EC / SumUp', bar: 'Bar' };

/* ---------- Kennzahlen ---------- */
function kennzahlen(range) {
  const aus = S.rechnungen.filter(r => r.richtung === 'ausgang' && inP(r.datum, range));
  const ein = S.rechnungen.filter(r => r.richtung === 'eingang' && inP(r.datum, range));
  const bankKosten = S.bank.filter(b => b.betrag < 0 && inP(b.datum, range) && !['privat', 'intern', 'ignoriert', 'vorjahr'].includes(b.art) && !(IDX.zByB.get(b.id) || []).length && !bankNeutral(b));
  // netto wie in der Excel-Mappe (ohne durchlaufende Posten); Gutschriften mindern die Kosten
  const einnahmen = sum(aus, nettoA), einNetto = einnahmen, einBrutto = sum(aus, r => r.brutto);
  const ausgaben = sum(ein, nettoE), bankOhne = sum(bankKosten, b => -b.betrag);
  const allA = S.rechnungen.filter(r => r.richtung === 'ausgang').map(r => ({ r, st: rStatus(r) }));
  const allE = S.rechnungen.filter(r => r.richtung === 'eingang').map(r => ({ r, st: rStatus(r) }));
  const offenA = allA.filter(x => ['offen', 'ueberfaellig', 'teil'].includes(x.st.key));
  const ueberA = allA.filter(x => x.st.key === 'ueberfaellig');
  const offenE = allE.filter(x => ['offen', 'ueberfaellig', 'teil'].includes(x.st.key));
  const probleme = [...allA, ...allE].filter(x => ['ueber', 'doppelt', 'teil'].includes(x.st.key));
  const stand = ausgangStand();
  const bankOffen = S.bank.filter(b => b.betrag > 0 && bStatus(b).key === 'offen' && !wartetAufRechnung((b.zweck || '') + ' ' + (b.gegenpartei || ''), b.datum, stand));
  const pruefen = S.rechnungen.filter(r => !r.geprueft);
  // Kostenarten
  const ka = {}; ein.forEach(r => { const k = kostenartE(r) || 'Ohne Kategorie'; ka[k] = (ka[k] || 0) + nettoE(r); });
  // Zahlarten der Ausgangsrechnungen (gefundene Zahlung, sonst Zahlart laut Liste)
  const zaSum = { bank: 0, ec: 0, bar: 0, offen: 0 };
  aus.forEach(r => { if (r.erledigt) return; const st = rStatus(r), zs = st.zahlungen; let rest = sollOf(r);
    zs.forEach(z => { const k = z.kasse_id || z.art === 'bar' ? 'bar' : z.sumup_id ? 'ec' : 'bank'; zaSum[k] += +z.betrag; rest -= +z.betrag; });
    if (st.key === 'extern' && rest > 0.01) { zaSum[r.zahlart === 'bar' ? 'bar' : r.zahlart === 'ec' ? 'ec' : 'bank'] += rest; rest = 0; }
    if (rest > 0.01) zaSum.offen += rest; });
  // Monate (netto) und Umsatz nach Bereich (wie Blatt „Grafik“)
  const mon = {}, mk = d => monthKey(d), um = {};
  aus.forEach(r => { const k = mk(r.datum); (mon[k] = mon[k] || { e: 0, a: 0 }).e += nettoA(r); const u = um[k] = um[k] || { l: 0, t: 0, s: 0 }; const l = +r.lohn || 0, t = +r.teile || 0; u.l += l; u.t += t; u.s += nettoA(r) - l - t; });
  ein.forEach(r => { const k = mk(r.datum); (mon[k] = mon[k] || { e: 0, a: 0 }).a += nettoE(r); });
  // Kontobewegungen (Ist)
  const bankP = S.bank.filter(b => inP(b.datum, range) && !['intern', 'ignoriert'].includes(b.art));
  return { aus, ein, einnahmen, einNetto, einBrutto, ausgaben, bankOhne, bankKosten, um, ergebnis: r2(einnahmen - ausgaben), offenA, ueberA, offenE, probleme, bankOffen, pruefen, ka, zaSum, mon,
    bankIn: sum(bankP.filter(b => b.betrag > 0), b => b.betrag), bankOut: sum(bankP.filter(b => b.betrag < 0), b => -b.betrag) };
}

/* ---------- Diagramme (SVG) ---------- */
function barChart(labels, series, { h = 220 } = {}) {
  if (!labels.length) return '<div class="empty small">Noch keine Daten im Zeitraum.</div>';
  const W = 640, H = h, pl = 56, pb = 28, pt = 12, iw = W - pl - 8, ih = H - pb - pt;
  const max = Math.max(1, ...series.flatMap(s => s.data)), step = Math.pow(10, Math.floor(Math.log10(max))), top = Math.ceil(max / step) * step;
  const y = v => pt + ih - (v / top) * ih, gw = iw / labels.length, bw = Math.min(26, gw * 0.8 / series.length);
  const grid = [0, .5, 1].map(f => `<line x1="${pl}" x2="${W - 8}" y1="${y(top * f)}" y2="${y(top * f)}" class="gl"/><text x="${pl - 6}" y="${y(top * f) + 4}" text-anchor="end" class="ax">${Math.round(top * f).toLocaleString('de-DE')}</text>`).join('');
  const bars = series.map((s, k) => s.data.map((v, i) => { const x = pl + gw * i + (gw - bw * series.length) / 2 + bw * k; return `<rect x="${x.toFixed(1)}" y="${y(v).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(0, pt + ih - y(v)).toFixed(1)}" rx="3" class="${s.cls}"><title>${esc(labels[i])} · ${esc(s.name)}: ${fmtE(v)}</title></rect>`; }).join('')).join('');
  const xl = labels.map((l, i) => `<text x="${pl + gw * i + gw / 2}" y="${H - 8}" text-anchor="middle" class="ax">${esc(l)}</text>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="Diagramm">${grid}${bars}${xl}</svg>
    <div class="legend">${series.map(s => `<span><i class="${s.cls}"></i>${esc(s.name)}</span>`).join('')}</div>`;
}
function hbars(items, total) {
  if (!items.length) return '<div class="empty small">Noch keine Ausgaben im Zeitraum.</div>';
  const max = Math.max(...items.map(x => x[1]));
  return `<div class="hb">${items.map(([k, v]) => `<div class="hb-r"><span class="hb-l">${esc(k)}</span><span class="hb-b"><i style="width:${(v / max * 100).toFixed(1)}%"></i></span><span class="hb-v">${fmtE(v)}<small>${total ? Math.round(v / total * 100) + ' %' : ''}</small></span></div>`).join('')}</div>`;
}

/* ---------- Übersicht ---------- */
function viewStart() {
  const range = periodRange(UI.period), K = kennzahlen(range);
  const months = Object.keys(K.mon).sort().slice(-12);
  const kaItems = Object.entries(K.ka).filter(x => x[1] > 0.005).sort((a, b) => b[1] - a[1]);
  const kaTot = sum(kaItems, x => x[1]);
  const za = K.zaSum, zaTot = za.bank + za.ec + za.bar + za.offen;
  const empty = !S.rechnungen.length && !S.bank.length && !S.sumup.length;
  const umM = Object.keys(K.um).sort().slice(-12);
  return `
  ${startHero()}
  <div id="omniSlot"></div>
  ${empty ? `<div class="hero-empty"><h2>Willkommen bei Mastercar Finanzen</h2><p>Zieh einfach Dateien in die Leiste: die ganze <b>Excel-Mappe „Ein- und Ausgaben“</b>, einen <b>SumUp-Export</b>, ein <b>Bank-CSV</b> oder <b>Eingangsrechnungen</b> (PDF, Foto, Outlook-Mail). Die App erkennt selbst, was es ist.</p>
     ${!DB.cloud ? '<button class="btn" data-act="demo">Demo-Daten laden</button>' : ''}</div>` : ''}
  <div class="toolbar sec"><h2>Zahlen</h2><span class="sp"></span>
    <select class="inp" data-chg="period" aria-label="Zeitraum">${PERIODS.map(p => `<option value="${p[0]}" ${UI.period === p[0] ? 'selected' : ''}>${p[1]}</option>`).join('')}</select></div>
  <section class="kpi">
    <div class="k hi"><div class="kv">${fmtE(K.einnahmen)}</div><div class="kl">Umsatz netto (Rechnungsausgang)</div></div>
    <div class="k"><div class="kv">${fmtE(K.ausgaben)}</div><div class="kl">Kosten netto (Rechnungseingang)</div></div>
    <button class="k" data-act="go" data-v="guv" data-t="guv"><div class="kv ${K.ergebnis < 0 ? 'neg' : ''}">${fmtE(K.ergebnis)}</div><div class="kl">Ergebnis netto → GuV</div></button>
    <button class="k" data-act="go" data-v="ausgang" data-f="offen"><div class="kv">${fmtE(sum(K.offenA, x => x.st.offen))}</div><div class="kl">Offene Kundenrechnungen · ${K.offenA.length}</div></button>
    <button class="k" data-act="go" data-v="eingang" data-f="offen"><div class="kv">${fmtE(sum(K.offenE, x => x.st.offen))}</div><div class="kl">Offene Lieferantenrechnungen · ${K.offenE.length}</div></button>
  </section>
  <div class="grid2">
    <section class="card"><h3>Umsatz und Kosten je Monat (netto)</h3>${barChart(months.map(monthLabel), [{ name: 'Umsatz', cls: 'c1', data: months.map(k => r2(K.mon[k].e)) }, { name: 'Kosten', cls: 'c2', data: months.map(k => r2(K.mon[k].a)) }])}</section>
    <section class="card"><h3>Umsatz nach Bereich (netto)</h3>${barChart(umM.map(monthLabel), [{ name: 'Werkstatt (Lohn)', cls: 'c1', data: umM.map(k => r2(K.um[k].l)) }, { name: 'Ersatzteile', cls: 'c2', data: umM.map(k => r2(K.um[k].t)) }, { name: 'Sonstiges', cls: 'c3', data: umM.map(k => r2(K.um[k].s)) }])}</section>
    <section class="card"><h3>Kosten nach Kategorie (netto)</h3>${hbars(kaItems.slice(0, 12), kaTot)}${K.bankOhne > 0.005 ? `<p class="small muted">Dazu ${fmtE(K.bankOhne)} Bankabgänge ohne Beleg – <a href="#" data-act="go" data-v="bank" data-f="kosten">ansehen</a>.</p>` : ''}</section>
    <section class="card"><h3>Wie bezahlen die Kunden?</h3>${zaTot ? hbars([['Überweisung', za.bank], ['EC / SumUp', za.ec], ['Bar', za.bar], ['Noch offen', za.offen]].filter(x => x[1] > 0.005), zaTot) : '<div class="empty small">Noch keine Ausgangsrechnungen im Zeitraum.</div>'}</section>
    <section class="card"><h3>Kontobewegungen im Zeitraum</h3>
      <div class="kv2"><span>Geldeingang Bank</span><b class="pos">${fmtE(K.bankIn)}</b></div>
      <div class="kv2"><span>Geldausgang Bank</span><b class="neg">${fmtE(K.bankOut ? -K.bankOut : 0)}</b></div>
      <div class="kv2 tot"><span>Saldo</span><b>${fmtE(K.bankIn - K.bankOut)}</b></div>
      <div class="kv2"><span>Umsatz brutto (Ausgang)</span><b>${fmtE(K.einBrutto)}</b></div>
      <p class="small muted">Umbuchungen und als „ignoriert“ markierte Umsätze sind nicht enthalten.</p></section>
  </div>`;
}
// Begrüßung wie im Sonnenplan: Datum, „Guten Tag, Name.“ und was heute ansteht
function startHero() {
  const h = new Date().getHours(), gruss = h < 11 ? 'Guten Morgen' : h < 18 ? 'Guten Tag' : 'Guten Abend';
  const first = (S.meName || '').split(' ')[0];
  const datum = new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const meine = S.todos.filter(t => !t.erledigt && (!S.meName || !t.wer || t.wer === S.meName));
  const faellig = meine.filter(t => todoDue(t) && todoDue(t) <= todayISO());
  const ueberA = S.rechnungen.filter(r => r.richtung === 'ausgang' && rStatus(r).key === 'ueberfaellig');
  const lief = S.rechnungen.filter(r => r.richtung === 'eingang' && ['offen', 'ueberfaellig'].includes(rStatus(r).key) && faelligAm(r) && faelligAm(r) <= addDays(todayISO(), 7));
  const kw = isoWeek(todayISO()), hebeKW = sum(S.hebebuehne.filter(x => kwKey(x.datum) === kwKey(todayISO())), x => x.stunden);
  const items = [
    faellig.length ? `<button class="hi-i" data-act="go" data-v="todos"><b>${faellig.length}</b> To-Do${faellig.length === 1 ? '' : 's'} fällig</button>` : `<span class="hi-i">${meine.length} offene To-Dos</span>`,
    ueberA.length ? `<button class="hi-i warn" data-act="go" data-v="ausgang" data-f="ueberfaellig"><b>${ueberA.length}</b> Kundenrechnung${ueberA.length === 1 ? '' : 'en'} überfällig · ${fmtE(sum(ueberA, r => rStatus(r).offen))}</button>` : '',
    lief.length ? `<button class="hi-i" data-act="go" data-v="eingang" data-f="offen"><b>${lief.length}</b> Lieferantenrechnung${lief.length === 1 ? '' : 'en'} in den nächsten 7 Tagen fällig</button>` : '',
    S.hebebuehne.length ? `<button class="hi-i" data-act="go" data-v="hebe">Hebebühne KW ${kw.w}: <b>${String(r2(hebeKW)).replace('.', ',')} h</b></button>` : ''
  ].filter(Boolean);
  return `<section class="hero"><div class="hero-ey">${esc(datum)}</div><h1>${gruss}${first ? ', <span>' + esc(first) + '</span>' : ''}.</h1>
    <div class="hero-items">${items.join('')}</div>
    ${faellig.length ? `<div class="hero-td">${faellig.slice(0, 4).map(todoLi).join('')}${faellig.length > 4 ? `<button class="lnk" data-act="go" data-v="todos">+ ${faellig.length - 4} weitere</button>` : ''}</div>` : ''}</section>`;
}

/* ---------- Listen ---------- */
const FILT_R = [['alle', 'Alle'], ['offen', 'Offen'], ['ueberfaellig', 'Überfällig'], ['probleme', 'Zu viel / zu wenig / doppelt'], ['bezahlt', 'Bezahlt'], ['pruefen', 'Zu prüfen']];
// Vermerk „Verknüpft“: Zahlungsavis, Gutschrift ↔ Rechnung
function verkTxt(r) {
  const t = [];
  // Zuerst: Zahlung gefunden? (Bank / SumUp / Kasse / bar) – sonst Hinweis
  if (!DOK_ARTEN.includes(r.art) && (+r.brutto || 0) > 0) {
    const zs = IDX.zByR.get(r.id) || [];
    zs.forEach(z => {
      if (z.bank_id) { const b = S.bank.find(x => x.id === z.bank_id); t.push(`🏦 Bank ${b ? fmtD(b.datum) : ''} · ${fmtE(z.betrag)}`); }
      else if (z.sumup_id) { const s = S.sumup.find(x => x.id === z.sumup_id); t.push(`💳 SumUp ${s ? fmtD(s.datum) : ''} · ${fmtE(z.betrag)}`); }
      else if (z.kasse_id) { const k = S.kasse.find(x => x.id === z.kasse_id); t.push(`💵 Kasse ${k ? fmtD(k.datum) : ''} · ${fmtE(z.betrag)}`); }
      else t.push(`💵 bar ${fmtD(z.datum)} · ${fmtE(z.betrag)}`);
    });
    if (!zs.length) { const k = rStatus(r).key; t.push(k === 'extern' ? '⚠ laut Liste bezahlt – keine Buchung gefunden' : ['erledigt', 'storno', 'verrechnet'].includes(k) ? '' : '– noch keine Zahlung gefunden'); }
  }
  const av = typeof avisVermerk === 'function' ? avisVermerk(r) : ''; if (av) t.push(av);
  if (r.bezug_id) { const o = S.rechnungen.find(x => x.id === r.bezug_id); if (o) t.push(`↔ gehört zu RE ${o.nummer || ''}`); }
  (IDX.gsByR && IDX.gsByR.get(r.id) || []).forEach(g => t.push(`↔ ${g.art || 'Gutschrift'} ${g.nummer || ''} ${fmtE(g.brutto)}`.replace(/\s+/g, ' ')));
  return t.filter(Boolean).join(' · ');
}
// Kurz für die Tabelle: „🏦 Bank“ (anklickbar → Fenster mit den Zahlungsdaten), „bez. ohne Zuordnung“, „nicht gefunden“ + kleine Marken für Avis/Gutschrift
function verkKurz(r) {
  const t = [];
  if (!DOK_ARTEN.includes(r.art) && (+r.brutto || 0) > 0) {
    const zs = IDX.zByR.get(r.id) || [];
    if (zs.length) {
      const arten = [...new Set(zs.map(z => z.bank_id ? '🏦 Bank' : z.sumup_id ? '💳 SumUp' : z.kasse_id ? '💵 Kasse' : '💵 bar'))];
      t.push(`<button class="vk-btn" data-act="zahlD" data-id="${r.id}">${arten.join(' + ')}${zs.length > arten.length ? ` ×${zs.length}` : ''}</button>`);
    } else {
      const k = rStatus(r).key;
      if (k === 'extern') t.push('bez. ohne Zuordnung'); else if (!['erledigt', 'storno', 'verrechnet'].includes(k)) t.push('nicht gefunden');
    }
  }
  if (typeof avisZu === 'function' && avisZu(r.id).length) t.push('📨 Avis');
  if (r.bezug_id) t.push('↔ zu RE');
  if ((IDX.gsByR && IDX.gsByR.get(r.id) || []).length) t.push('↔ Gutschrift');
  return t.join(' · ');
}
// Fenster mit den zugeordneten Zahlungen einer Rechnung (eine Zahlung → gleich deren Daten)
function zahlungenFenster(id) {
  const r = S.rechnungen.find(x => x.id === id); if (!r) return; const zs = IDX.zByR.get(r.id) || [];
  if (zs.length === 1) { const z = zs[0]; if (z.bank_id) return bankDetail(z.bank_id); if (z.sumup_id) return sumupDetail(z.sumup_id); if (z.kasse_id) return kasseDetail(z.kasse_id); }
  openSheet({ title: 'Zahlungen zu ' + (r.nummer || 'Rechnung'), noOk: true, html: `<ul class="pays">${zs.map(z => `<li ${z.bank_id ? `data-act="bank" data-id="${z.bank_id}"` : z.sumup_id ? `data-act="sumup" data-id="${z.sumup_id}"` : z.kasse_id ? `data-act="kasseD" data-id="${z.kasse_id}"` : ''} style="cursor:pointer"><span>${payLabel(z)}${z.notiz ? ` <small class="muted">· ${esc(z.notiz)}</small>` : ''}</span><b>${fmtE(z.betrag)}</b></li>`).join('')}</ul>` });
}
// Kurzform für den Filter „Zahlung“: Bank / SumUp / Kasse / bar / keine
const zahlQuelle = r => { const zs = IDX.zByR.get(r.id) || []; if (!zs.length) return rStatus(r).key === 'extern' ? 'bez. ohne Zuordnung' : 'keine'; return [...new Set(zs.map(z => z.bank_id ? 'Bank' : z.sumup_id ? 'SumUp' : z.kasse_id ? 'Kasse' : 'bar'))].join(' + '); };
const DOK_ARTEN = ['Zahlungsavis', 'Mahnung'];   // reine Dokumente (Betrag 0), keine Buchung
/* Mögliche doppelt erfasste Rechnungen: gleiche Firma, gleicher Betrag, gleiches Datum.
   „sicher“ = zusätzlich dieselbe Rechnungsnummer (Ziffern ohne führende Nullen); „wahrscheinlich“ = bei einem fehlt die Nummer (nur Eingang).
   Steht in der Notiz „kein Duplikat“, wird der Eintrag nicht mehr markiert. Liefert Map id → { sicher, mit: [andere Rechnungen] } */
const KEIN_DUP = /kein(e)?\s*(duplikat|doppel)/i;
function rDoppelt(dir) {
  const kern = n => String(n || '').replace(/\D/g, '').replace(/^0+/, ''), firma = p => nameTokens(p)[0] || norm(p);
  const g = new Map();
  S.rechnungen.forEach(r => {
    if (r.richtung !== dir || DOK_ARTEN.includes(r.art) || !r.datum || Math.abs(+r.brutto || 0) < 0.005 || KEIN_DUP.test(r.notiz || '')) return;
    const k = firma(r.partner) + '|' + r2(r.brutto) + '|' + r.datum; if (!g.has(k)) g.set(k, []); g.get(k).push(r);
  });
  const M = new Map();
  for (const l of g.values()) {
    if (l.length < 2) continue;
    l.forEach(r => {
      // verschiedene Rechnungsnummern = verschiedene Rechnungen (z. B. zwei Ölwechsel am selben Tag) → nicht markieren
      // gleiche Nummer: genau gleich (ohne Sonderzeichen) oder dieselben Ziffern („RE-0390016“ = „390016“)
      const gleich = (a, b) => !!normNr(a) && (normNr(a) === normNr(b) || (kern(a).length >= 3 && kern(a) === kern(b)));
      const mit = l.filter(x => x.id !== r.id && x.bezug_id !== r.id && r.bezug_id !== x.id && (gleich(r.nummer, x.nummer) || (dir === 'eingang' && (!normNr(r.nummer) || !normNr(x.nummer)))));
      if (!mit.length) return;
      M.set(r.id, { sicher: mit.some(x => gleich(r.nummer, x.nummer)), mit });
    });
  }
  return M;
}
// Lieferantenrechnung wird abgebucht (SEPA-Lastschrift / Status „Abbuchung offen“) – sonst müssen wir selbst überweisen
const istAbbuchung = r => r.zahlart === 'sepa' || /^abbuchung/i.test(r.status_excel || '');
function filterR(list, f) {
  if (f === 'alle') return list;
  if (f === 'offen') return list.filter(x => ['offen', 'ueberfaellig', 'teil'].includes(x.st.key));
  if (f === 'abb') return list.filter(x => ['offen', 'ueberfaellig', 'teil'].includes(x.st.key) && istAbbuchung(x.r));
  if (f === 'manuell') return list.filter(x => ['offen', 'ueberfaellig', 'teil'].includes(x.st.key) && !istAbbuchung(x.r));
  if (f === 'probleme') return list.filter(x => ['ueber', 'doppelt', 'teil'].includes(x.st.key));
  if (f === 'bezahlt') return list.filter(x => ['bezahlt', 'erledigt', 'extern', 'storno', 'verrechnet'].includes(x.st.key));
  if (f === 'pruefen') return list.filter(x => !x.r.geprueft);
  if (String(f).startsWith('s:')) return list.filter(x => x.st.label === f.slice(2) && !DOK_ARTEN.includes(x.r.art));
  if (String(f).startsWith('art:')) return list.filter(x => x.r.art === f.slice(4));
  if (f === 'avis') return list.filter(x => avisZu(x.r.id).length);
  return list.filter(x => x.st.key === f);
}
const textOf = r => [r.nummer, r.partner, r.kundennr, r.kennzeichen, r.beschreibung, r.kostenart, r.unterkonto, r.art, r.notiz, r.brutto, fmtE(r.brutto), fmtD(r.datum)].join(' ').toLowerCase();
function chips(view, opts) { return `<div class="chips">${opts.map(([k, l]) => `<button class="chip ${UI.filt[view] === k ? 'on' : ''}" data-act="filt" data-v="${view}" data-f="${k}">${l}</button>`).join('')}</div>`; }
// Offene Kundenrechnungen als schlichte Tabelle zum Kopieren (z. B. in eine Mail – Outlook übernimmt die Tabelle)
function offeneListe() {
  const heute = todayISO();
  const l = S.rechnungen.filter(r => r.richtung === 'ausgang' && r.art !== 'Mahnung').map(r => ({ r, st: rStatus(r) }))
    .filter(x => ['offen', 'ueberfaellig', 'teil'].includes(x.st.key) && x.st.offen > 0.01)
    .sort((a, b) => (a.r.datum || '').localeCompare(b.r.datum || ''));
  const td = 'border:1px solid #bbb;padding:4px 8px;font-family:Arial,sans-serif;font-size:13px', th = td + ';background:#eee;text-align:left';
  const num = ';text-align:right;white-space:nowrap';
  const kopf = ['Rechnungsnr.', 'Datum', 'Kunde', 'Kennzeichen', 'Fällig', 'Tage über', 'Brutto', 'Offen', 'Notiz'];
  const zahl = i => i >= 5 && i <= 7;
  const zeilen = l.map(({ r, st }) => { const f = faelligAm(r), tage = f && f < heute ? daysBetween(f, heute) : '';
    return [r.nummer || '', fmtD(r.datum), r.partner || '', r.kennzeichen || '', fmtD(f), String(tage), fmtE(r.brutto), fmtE(st.offen), String(r.notiz || '').replace(/\s+/g, ' ').trim()]; });
  const summe = sum(l, x => x.st.offen);
  const tabelle = `<table style="border-collapse:collapse"><thead><tr>${kopf.map((k, i) => `<th style="${th}${zahl(i) ? num : ''}">${k}</th>`).join('')}</tr></thead><tbody>
    ${zeilen.map(z => `<tr>${z.map((v, i) => `<td style="${td}${zahl(i) ? num : ''}">${esc(v)}</td>`).join('')}</tr>`).join('')}
    <tr><td style="${td};font-weight:bold" colspan="7">Summe offen (${l.length} Rechnungen)</td><td style="${td}${num};font-weight:bold">${fmtE(summe)}</td><td style="${td}"></td></tr></tbody></table>`;
  const text = [kopf, ...zeilen, ['Summe offen', '', '', '', '', '', '', fmtE(summe), '']].map(z => z.join('\t')).join('\n');
  openSheet({ title: `Offene Kundenrechnungen (${l.length})`, wide: true, okLabel: '📋 Tabelle kopieren', cancelLabel: 'Schließen',
    html: `<p class="small muted">Stand ${fmtD(heute)}. „Tabelle kopieren“ und in die Mail einfügen (Strg + V) – die Tabelle bleibt erhalten.</p><div class="tw">${tabelle}</div>`,
    onOk: async () => {
      try { await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([tabelle], { type: 'text/html' }), 'text/plain': new Blob([text], { type: 'text/plain' }) })]); }
      catch (e) { await navigator.clipboard.writeText(text); }
      toast('Tabelle kopiert – jetzt in die Mail einfügen.'); return false;
    } });
}
// Fortlaufende Nummern der Ausgangsrechnungen (R26-0001 …) je Jahr prüfen: Lücken und doppelte Nummern
function nrPruefung() {
  const jahre = {};
  // zwei Nummernkreise: R26-0001 (Werkstatt) und PR26001 (PR-Rechnungen)
  S.rechnungen.forEach(r => { if (r.richtung !== 'ausgang') return; const s = String(r.nummer || '').trim();
    const m = s.match(/^R\s?(\d{2})\s?-\s?(\d{1,5})$/i) || s.match(/^(PR)(\d{2})(\d{3})$/i); if (!m) return;
    const key = m.length === 4 ? 'PR' + m[2] : 'R' + m[1], lauf = +(m.length === 4 ? m[3] : m[2]);
    const j = jahre[key] = jahre[key] || {}; (j[lauf] = j[lauf] || []).push(r); });
  return Object.entries(jahre).sort().map(([key, n]) => {
    const pr = key.startsWith('PR'), jj = key.replace(/\D/g, '');
    const ks = Object.keys(n).map(Number), max = Math.max(...ks), nr = i => pr ? `PR${jj}${String(i).padStart(3, '0')}` : `R${jj}-${String(i).padStart(4, '0')}`, fehlt = [];
    for (let i = 1; i <= max; i++) if (!n[i]) fehlt.push(nr(i));
    return { jahr: '20' + jj, von: nr(1), bis: nr(max), anzahl: ks.length, fehlt, doppelt: ks.filter(k => n[k].length > 1).map(nr) };
  });
}
function nrHinweis() {
  const p = nrPruefung(); if (!p.length) return '';
  const fehler = p.filter(x => x.fehlt.length || x.doppelt.length);
  if (!fehler.length) return `<p class="small muted">✓ Nummern lückenlos: ${p.map(x => `${x.von} bis ${x.bis}`).join(', ')}</p>`;
  return `<div class="warn">⚠ Fortlaufende Rechnungsnummern nicht vollständig: ${fehler.map(x => [x.fehlt.length ? `<b>fehlt</b> ${x.fehlt.slice(0, 30).map(esc).join(', ')}${x.fehlt.length > 30 ? ` … (${x.fehlt.length} insgesamt)` : ''}` : '', x.doppelt.length ? `<b>doppelt</b> ${x.doppelt.map(esc).join(', ')}` : ''].filter(Boolean).join(' · ')).join(' | ')}. Bitte die fehlenden Rechnungen aus dem Werkstatt Journal bzw. als PDF nachladen.</div>`;
}
// Mehrfach-Filter: aufklappbare Liste mit Häkchen; mehrere Themen = alles, was zu einem davon passt
const filtListe = view => [].concat(UI.filt[view] || 'alle').filter(k => k && k !== 'alle');
function filtMulti(view, opts) {
  const sel = filtListe(view), lab = k => String((opts.find(o => o[0] === k) || [k, k])[1]).replace(/<[^>]+>/g, '');
  const titel = !sel.length ? 'Alle' : sel.length <= 2 ? sel.map(lab).join(' + ') : `${lab(sel[0])} + ${sel.length - 1} weitere`;
  UI.mselAuf = UI.mselAuf || {};
  return `<details class="msel" data-msel="${view}" ${UI.mselAuf[view] ? 'open' : ''}><summary class="inp">Anzeigen: <b>${esc(titel)}</b> ▾</summary><div class="msel-pop">
    ${opts.map(([k, l]) => `<label class="msel-o"><input type="checkbox" data-chg="filtM" data-v="${view}" data-k="${esc(k)}" ${k === 'alle' ? (!sel.length ? 'checked' : '') : sel.includes(k) ? 'checked' : ''}> ${esc(String(l).replace(/<[^>]+>/g, ''))}</label>`).join('')}
    ${sel.length ? `<button class="btn sm" data-act="filtLeer" data-v="${view}">Alle Filter aus</button>` : ''}</div></details>`;
}
// Filter als Auswahlliste statt vieler Knöpfe
function filtSel(view, opts) {
  const cur = UI.filt[view], hat = opts.some(([k]) => k === cur);
  return `<select class="inp filtsel" data-chg="filt" data-v="${view}" aria-label="Anzeigen">${hat ? '' : `<option value="${esc(cur || '')}" selected>${esc(cur || 'Alle')}</option>`}${opts.map(([k, l]) => `<option value="${esc(k)}" ${cur === k ? 'selected' : ''}>${esc(String(l).replace(/<[^>]+>/g, ''))}</option>`).join('')}</select>`;
}
function searchIn(view, ph) { return `<input class="inp search" type="search" placeholder="${ph}" value="${esc(UI.q[view] || '')}" data-q="${view}" aria-label="${ph}">`; }
function moreBtn(view, n, lim) { return n > lim ? `<button class="btn sm more" data-act="more" data-v="${view}">Weitere ${Math.min(300, n - lim)} von ${n - lim} anzeigen</button>` : ''; }

/* ---------- Spaltenkopf wie in Excel: Klick auf die Überschrift = sortieren, darunter Filter je Spalte ----------
   cols: [{ k, l (Überschrift), v: x => Sortierwert, t: x => Filtertext (sonst v), num, sel (Auswahlliste statt Textfeld), nof (kein Filter) }]
   Zahlenspalten verstehen auch „>100“, „<50“, „>=12,5“ oder „=79,99“. */
UI.cs = UI.cs || {};
const colT = (c, x) => { const t = c.t ? c.t(x) : c.v(x); return t == null ? '' : String(t); };
function colMatch(c, x, q) {
  const m = c.num && q.match(/^(>=|<=|>|<|=)\s*(-?[\d.,]+)$/);
  if (m) { const v = Number(c.v(x)), n = parseNum(m[2]); if (c.v(x) == null || !isFinite(v) || n == null || !isFinite(n)) return false;
    return m[1] === '>' ? v > n : m[1] === '<' ? v < n : m[1] === '>=' ? v >= n - 0.005 : m[1] === '<=' ? v <= n + 0.005 : Math.abs(v - n) < 0.005; }
  const t = colT(c, x).toLowerCase(); return q.split(/\s+/).every(w => t.includes(w));
}
function colApply(view, list, cols) {
  const st = UI.cs[view] || {};
  cols.forEach(c => {
    if (c.nof) return;
    if (c.sel) { const f = cfListe(st, c.k); if (f.length) list = list.filter(x => f.includes(colT(c, x))); return; }   // Mehrfachauswahl: alles, was zu einem der Werte passt
    const q = (UI.q[view + '|' + c.k] || '').toLowerCase().trim(); if (q) list = list.filter(x => colMatch(c, x, q));
  });
  const c = st.k && cols.find(c => c.k === st.k);
  if (c) {
    const d = st.d === 'desc' ? -1 : 1, leer = v => v == null || v === '' || (typeof v === 'number' && !isFinite(v));
    list = list.slice().sort((a, b) => { const va = c.v(a), vb = c.v(b);
      if (leer(va) || leer(vb)) return leer(va) - leer(vb);   // Leere immer ans Ende
      return (typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'de', { numeric: true })) * d; });
  }
  return list;
}
const cfListe = (st, k) => [].concat((st.f && st.f[k]) ?? []).filter(v => v != null && v !== '');   // Spaltenfilter: früher ein Wert, jetzt Liste
function colAktiv(view) { const st = UI.cs[view] || {}; return !!(st.k || Object.keys(st.f || {}).some(k => cfListe(st, k).length) || Object.keys(UI.q).some(k => k.startsWith(view + '|') && UI.q[k])); }
// base = Liste vor den Spaltenfiltern (für die Auswahllisten)
function colHead(view, cols, base) {
  const st = UI.cs[view] || {};
  const nm = c => NAME_SPALTEN.includes(c.k) ? ' data-name="1"' : '';
  const r1 = cols.map(c => `<th class="srt ${c.num ? 'num' : ''} ${st.k === c.k ? 'on' : ''}" data-act="colSort" data-v="${view}" data-k="${c.k}"${nm(c)} title="Klick = sortieren · Ziehen = Spalte verschieben">${c.l}<span class="sa">${st.k === c.k ? (st.d === 'desc' ? '▼' : '▲') : '↕'}</span></th>`).join('');
  const fz = cols.map(c => {
    if (c.nof) return '<th></th>';
    if (c.sel) { const f = cfListe(st, c.k), opts = [...new Set(base.map(x => colT(c, x)))].filter(Boolean).sort((a, b) => a.localeCompare(b, 'de', { numeric: true }));
      const anz = o => base.filter(x => colT(c, x) === o).length, mk = 'cf:' + view + ':' + c.k, auf = UI.mselAuf && UI.mselAuf[mk];
      const titel = !f.length ? 'Alle' : f.length === 1 ? f[0] : f.length + ' gewählt';
      // Mehrfachauswahl mit Häkchen (z. B. Status „Mahnung“ + „2. Mahnung“ + „3. Mahnung“ gleichzeitig)
      return `<th><details class="msel cfm" data-msel="${esc(mk)}" ${auf ? 'open' : ''}><summary class="cf ${f.length ? 'on' : ''}" aria-label="Filter ${c.l}">${esc(titel)} ▾</summary><div class="msel-pop">
        <label class="msel-o"><input type="checkbox" data-chg="colFM" data-v="${view}" data-k="${c.k}" data-o="" ${f.length ? '' : 'checked'}> Alle</label>
        ${opts.map(o => `<label class="msel-o"><input type="checkbox" data-chg="colFM" data-v="${view}" data-k="${c.k}" data-o="${esc(o)}" ${f.includes(o) ? 'checked' : ''}> ${esc(o)} <small class="muted">${anz(o)}</small></label>`).join('')}</div></details></th>`; }
    const v = UI.q[view + '|' + c.k] || '';
    return `<th><input class="cf ${v ? 'on' : ''}" type="search" data-q="${view}|${c.k}" value="${esc(v)}" placeholder="${c.num ? 'z. B. >100' : 'Filter'}" aria-label="Filter ${c.l}"></th>`;
  }).map((h, i) => h.replace('<th', `<th data-k="${cols[i].k}"`)).join('');
  // Summenzeile unten: Summe aller Betragsspalten über ALLE gefilterten Einträge (nicht nur die angezeigten)
  let foot = '';
  if (cols.some(c => c.geld) && base.length) {
    const l = colApply(view, base, cols), sx = c => r2(l.reduce((a, x) => a + (+c.v(x) || 0), 0));
    foot = `<tfoot><tr class="sumfoot">${cols.map((c, i) => c.geld ? `<td class="num" data-k="${c.k}"><b>${fmtE(sx(c))}</b></td>` : i === 0 ? `<td data-k="${c.k}"><b>Σ ${l.length}</b></td>` : `<td data-k="${c.k}"></td>`).join('')}</tr></tfoot>`;
  }
  return `<thead><tr>${r1}</tr><tr class="frow">${fz}</tr></thead>${foot}`;
}
// Diese Spalte bleibt beim seitlichen Schieben links stehen (Kunde, Firma, Name, Partner …)
const NAME_SPALTEN = ['kunde', 'lief', 'name', 'partner', 'beschr', 'text'];
const colTxt = (k, l, f) => ({ k, l, v: x => f(x) || '' });
const eur = v => v == null || v === '' || Math.abs(+v) < 0.005 ? '' : fmtE(v);   // leere/Null-Beträge wie in Excel leer lassen
const colDat = (k, l, f) => ({ k, l, v: x => f(x) || '', t: x => f(x) ? fmtD(f(x)) + ' ' + f(x) : '' });
const colNum = (k, l, f) => ({ k, l, num: true, geld: true, v: x => { const v = f(x); return v == null || v === '' ? null : Number(v); }, t: x => { const v = f(x); return v == null || v === '' ? '' : fmtE(v) + ' ' + v; } });
/* Alle Spalten des Blatts „Ein- und Ausgaben“ in Excel-Reihenfolge (berechnete wie Jahr/KW/tatsächl. werden hergeleitet) */
const MONATE_LANG = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const fixTxt = r => r.fix === true ? 'Fix' : r.fix === false ? 'Variabel' : '';
const jaNein = v => v === true ? 'Ja' : v === false ? 'Nein' : '';
function eingangExcel(r) {
  const d = r.datum || '', m = d ? +d.slice(5, 7) : 0, einn = (r.brutto || 0) < 0, st = rStatus(r);
  const nach = r.nach_dlp != null ? r.nach_dlp : r2((r.brutto || 0) - (einn ? -1 : 1) * Math.abs(r.durchlaufend || 0));
  const e = v => v == null || v === '' ? '' : fmtE(Math.abs(v));
  return [['Jahr', d.slice(0, 4)], ['Quartal', m ? 'Q' + Math.ceil(m / 3) : ''], ['Monat', m ? MONATE_LANG[m - 1] : ''], ['KW', d ? String(isoWeek(d).w) : ''],
    ['Rechnungsdatum', fmtD(d)], ['Rechnungsein-/ausgang', r.ein_ausgang || 'Rechnungseingang'], ['Einnahme/ Ausgabe', einn ? 'Einnahme' : 'Ausgabe'], ['Variabel / fix', fixTxt(r)],
    ['Kategorie', r.kostenart || ''], ['Firma', r.partner || ''], ['Art', r.art || ''], ['Rechnungsnr.', r.nummer || ''], ['Zahlart', ZA[r.zahlart] || ''],
    ['Preis gesamt brutto', e(r.brutto)], ['Erledigt?', st.label], ['Skonto', r.skonto_satz ? String(r2(r.skonto_satz * 100)).replace('.', ',') + ' %' : r.skonto ? fmtE(Math.abs(r.skonto)) : ''],
    ['Mit Skonto', e(r.mit_skonto != null ? r.mit_skonto : r.skonto ? Math.abs(r.brutto) - Math.abs(r.skonto) : r.brutto)], ['Durchlaufender Posten', e(r.durchlaufend)],
    ['Nach durchl. Posten', e(nach)], ['Mwst.?', jaNein(r.mwst_pflicht != null ? r.mwst_pflicht : Math.abs(r.mwst || 0) > 0.005)], ['Preis netto', e(r.netto)],
    ['Einnahme/ Ausgabe tatsächl. brutto', fmtE(-nach)], ['Einnahme/ Ausgabe tatsächl. netto', fmtE(-(r.netto || 0))], ['Bankabgleich', r.bankabgleich || ''], ['Notiz', r.notiz || '']];
}
const COL = { nr: colTxt('nr', 'Nr.', x => x.r.nummer), datum: colDat('datum', 'Datum', x => x.r.datum) };
const colReset = view => colAktiv(view) ? ` <button class="btn sm" data-act="colReset" data-v="${view}">✕ Spaltenfilter zurücksetzen</button>` : '';

function viewRechnungen(dir) {
  const view = dir, range = periodRange(UI.period);
  // Mahnungen/Zahlungserinnerungen sind keine eigenen Zeilen – sie stehen nur als Status an der Rechnung
  let list = S.rechnungen.filter(r => r.richtung === dir && r.art !== 'Mahnung' && (UI.period === 'alle' || inP(r.datum, range) || !['bezahlt', 'erledigt', 'extern', 'storno'].includes(rStatus(r).key))).map(r => ({ r, st: rStatus(r) }));
  // Filter: „Alle“, „Offen“ (alles nicht Bezahlte), dann jeder Status aus der Liste mit Anzahl, dazu überfällig/Abgleich-Probleme/ungeprüft
  const cnt = {}; list.forEach(x => { const k = DOK_ARTEN.includes(x.r.art) ? 'art:' + x.r.art : x.st.label; cnt[k] = (cnt[k] || 0) + 1; });
  // „Alles Offene“ und dann jeder Status aus der Liste (die eigenen Filter „noch Abbuchung offen / noch manuell zu zahlen“ wären doppelt)
  const chipOpts = [['alle', 'Alle'], ['offen', 'Alles Offene · ' + list.filter(x => ['offen', 'ueberfaellig', 'teil'].includes(x.st.key)).length]].concat(stListe(dir).filter(s => cnt[s]).map(s => ['s:' + s, s + ' · ' + cnt[s]]),
    [['ueberfaellig', 'überfällig · ' + list.filter(x => x.st.key === 'ueberfaellig').length], ['probleme', 'Abgleich: zu viel / zu wenig / doppelt · ' + list.filter(x => ['ueber', 'doppelt', 'teil'].includes(x.st.key)).length]],
    dir === 'eingang' ? [['avis', '📨 mit Zahlungsavis · ' + list.filter(x => avisZu(x.r.id).length).length]] : []);
  const DUP = rDoppelt(dir), dupN = [...DUP.values()].filter(d => d.sicher).length, dupW = DUP.size - dupN;
  if (DUP.size) chipOpts.push(['dup', '⚠ Doppelt? · ' + DUP.size]);
  const fsel = filtListe(view);
  if (fsel.length) { const treffer = new Set(); fsel.forEach(f => (f === 'dup' ? list.filter(x => DUP.has(x.r.id)) : filterR(list, f)).forEach(x => treffer.add(x))); list = list.filter(x => treffer.has(x)); }
  const q = (UI.q[view] || '').toLowerCase().trim(); if (q) list = list.filter(x => q.split(/\s+/).every(w => textOf(x.r).includes(w)));
  // Standard-Sortierung: Firmenname (A–Z), dann Datum (ältestes oben), dann Nummer – ein Klick auf eine Spalte sortiert anders
  // Rechnungsausgang: neueste oben (Datum, dann Nummer absteigend)
  if (dir === 'ausgang') list.sort((a, b) => (b.r.datum || '').localeCompare(a.r.datum || '') || String(b.r.nummer || '').localeCompare(String(a.r.nummer || ''), 'de', { numeric: true }));
  else list.sort((a, b) => String(a.r.partner || '').trim().localeCompare(String(b.r.partner || '').trim(), 'de', { sensitivity: 'base' })
    || (a.r.datum || '').localeCompare(b.r.datum || '') || String(a.r.nummer || '').localeCompare(String(b.r.nummer || ''), 'de', { numeric: true }));
  const isA = dir === 'ausgang';
  const cols = isA ? [COL.nr, COL.datum, colTxt('kunde', 'Kunde', x => x.r.partner)]
    : [COL.datum, { k: 'kw', l: 'KW', num: true, v: x => x.r.datum ? isoWeek(x.r.datum).w : null, t: x => x.r.datum ? String(isoWeek(x.r.datum).w) : '' }, colTxt('lief', 'Firma', x => x.r.partner),
      { k: 'ea', l: 'Einn./Ausg.', v: x => (x.r.brutto || 0) < 0 ? 'Einnahme' : 'Ausgabe', sel: true }, { k: 'fix', l: 'Var./fix', v: x => fixTxt(x.r), sel: true },
      { k: 'ka', l: 'Kategorie', v: x => x.r.kostenart || '', sel: true }, { k: 'art', l: 'Art', v: x => x.r.art || '', sel: true }, COL.nr, { k: 'za', l: 'Zahlart', v: x => ZA[x.r.zahlart] || '', sel: true }];
  // Rechnungsausgang: alle Spalten des Werkstatt Journals (Reihenfolge wie dort) + was die App dazu weiß
  if (isA) cols.push(colTxt('kd', 'Kd-Nr.', x => x.r.kundennr),{ k: 'za', l: 'Zahlart', v: x => ZA[x.r.zahlart] || '', sel: true },
    colNum('bezb', 'Bezahlt', x => x.r.bezahlt_betrag), colNum('brutto', 'Gesamt brutto', x => x.r.brutto), colNum('lohn', 'Werkstatt', x => x.r.lohn), colNum('teile', 'Ersatzteile', x => x.r.teile),
    colNum('sonst', 'Sonstiges', x => x.r.sonstiges), colNum('mwst', 'MwSt.', x => x.r.mwst), colNum('alt', 'Altteile', x => x.r.altteile), colNum('ustalt', 'USt.Alt.', x => x.r.ust_alt),
    colNum('dlp', 'Dl.Posten', x => x.r.durchlaufend), colNum('netto', 'Gesamt Netto', x => x.r.netto),
    { k: 'monat', l: 'Monat', v: x => x.r.datum || '', t: x => x.r.datum ? MONATE_LANG[+x.r.datum.slice(5, 7) - 1] : '', sel: true }, { k: 'kw', l: 'KW', num: true, v: x => x.r.datum ? isoWeek(x.r.datum).w : null, t: x => x.r.datum ? String(isoWeek(x.r.datum).w) : '' },
    { k: 'quartal', l: 'Quartal', v: x => x.r.datum ? 'Q' + Math.ceil(+x.r.datum.slice(5, 7) / 3) : '', sel: true }, colTxt('notiz', 'Notizen', x => x.r.notiz),
    colNum('bez', 'Zahlung gefunden', x => x.st.bezahlt), colNum('offen', 'Offen', x => r2(x.st.offen)), { k: 'beleg', l: 'PDF', v: x => x.r.datei ? 'mit PDF' : 'ohne PDF', sel: true });
  else cols.push(colNum('brutto', 'Brutto', x => x.r.brutto), colNum('skonto', 'Skonto', x => x.r.skonto ? Math.abs(x.r.skonto) : null), colNum('dlp', 'Durchl. Posten', x => x.r.durchlaufend || null),
    colNum('netto', 'Netto', x => x.r.netto), { k: 'mw', l: 'MwSt.?', v: x => jaNein(x.r.mwst_pflicht != null ? x.r.mwst_pflicht : Math.abs(x.r.mwst || 0) > 0.005), sel: true },
    colNum('bez', 'Bezahlt', x => x.st.bezahlt), colNum('offen', 'Offen', x => r2(x.st.offen)), { k: 'beleg', l: 'PDF', v: x => x.r.datei ? 'mit PDF' : 'ohne PDF', sel: true },
    colTxt('notiz', 'Notiz', x => x.r.notiz));
  cols.push({ k: 'verk', l: 'Verknüpft', v: x => zahlQuelle(x.r), t: x => zahlQuelle(x.r), sel: true });   // Auswahl: Bank / SumUp / Kasse / bar / keine
  cols.push({ k: 'st', l: 'Status', v: x => x.st.label, sel: true });
  const base = list; list = colApply(view, list, cols);
  const lim = UI.more[view] || 300, tot = sum(list, x => x.r.brutto), offen = sum(list, x => Math.max(0, x.st.offen));
  return `
  <div class="toolbar"><h1>${isA ? 'Rechnungsausgang' : 'Rechnungseingang'}</h1><span class="sp"></span>
    ${isA ? `<button class="btn" data-act="offeneListe">📋 Offene als Liste</button><button class="btn primary" data-act="pick" data-t="ausgang">⬆ Excel importieren</button>` : `${pruefOffen().length ? `<button class="btn primary" data-act="pruefen">✓ Prüfen & freigeben <span class="cnt">${pruefOffen().length}</span></button>` : ''}<button class="btn primary" data-act="bezahlen">💸 Bezahlen <span class="cnt">${zuZahlen().length}</span></button><button class="btn" data-act="pickBeleg">⬆ Belege hochladen</button>`}
    <button class="btn" data-act="auto" title="Neue Rechnungen, Bankbuchungen, SumUp und Kasse nochmal gegeneinander abgleichen">⟳ Abgleichen</button>
    <button class="btn" data-act="neuR" data-dir="${dir}">＋ Von Hand</button>
    <button class="btn" data-act="csv" data-v="${view}">CSV</button></div>
  ${isA ? nrHinweis() : ''}
  <div class="filters">${filtMulti(view, chipOpts)}${searchIn(view, isA ? 'Nr., Kunde, Kennzeichen, Betrag …' : 'Lieferant, Nr., Kostenart, Betrag …')}
    <select class="inp" data-chg="period">${PERIODS.map(p => `<option value="${p[0]}" ${UI.period === p[0] ? 'selected' : ''}>${p[1]}</option>`).join('')}</select></div>
  ${isA ? (colAktiv(view) ? `<div class="sumline">${list.length} Rechnungen${colReset(view)}</div>` : '') : `<div class="sumline">${list.length} Rechnungen · Summe ${fmtE(tot)} · offen ${fmtE(offen)}${!isA && offen > 0.005 ? ` (noch Abbuchung ${fmtE(sum(list.filter(x => istAbbuchung(x.r)), x => Math.max(0, x.st.offen)))} · noch manuell ${fmtE(sum(list.filter(x => !istAbbuchung(x.r)), x => Math.max(0, x.st.offen)))})` : ''}${colReset(view)}</div>`}
  ${isA ? (() => { const s = f => sum(list, x => x.r[f]);   // Storno = Original (+) und Storno-Rechnung (−) → heben sich auf; passen sich jedem Filter an
    const t = [['Gesamt Netto', s('netto')], ['Gesamt brutto', s('brutto')]];
    // Umsatz je Monat (netto) zum Aufklappen – passt sich Filter und Zeitraum an
    const mon = {}; list.forEach(x => { if (!x.r.datum) return; const k = x.r.datum.slice(0, 7), m = mon[k] = mon[k] || { n: 0, b: 0, a: 0 }; m.n += nettoA(x.r); m.b += +x.r.brutto || 0; m.a++; });
    const mk = Object.keys(mon).sort(), mt = { n: sum(mk, k => mon[k].n), b: sum(mk, k => mon[k].b), a: sum(mk, k => mon[k].a) };
    UI.auf = UI.auf || {};
    const monTab = mk.length ? `<details class="xl" data-auf="ausgangMon" ${UI.auf.ausgangMon ? 'open' : ''}><summary>📅 Umsatz je Monat (netto)</summary><div class="tw"><table class="tb"><thead><tr><th>Monat</th><th class="num">Rechnungen</th><th class="num">Netto</th><th class="num">Brutto</th></tr></thead><tbody>
      ${mk.map(k => `<tr><td>${MONATE_LANG[+k.slice(5, 7) - 1]} ${k.slice(0, 4)}</td><td class="num">${mon[k].a}</td><td class="num"><b>${fmtE(mon[k].n)}</b></td><td class="num">${fmtE(mon[k].b)}</td></tr>`).join('')}
      <tr><td><b>Summe</b></td><td class="num"><b>${mt.a}</b></td><td class="num"><b>${fmtE(mt.n)}</b></td><td class="num"><b>${fmtE(mt.b)}</b></td></tr></tbody></table></div></details>` : '';
    return `<div class="sumrow"><button class="sum-klick" data-act="offeneZeigen" title="Nur offene Rechnungen anzeigen, älteste oben"><small>Offene Rechnungen ›</small><b>${fmtE(offen)}</b></button>${t.map(([l, v]) => `<span><small>${l}</small><b>${fmtE(v)}</b></span>`).join('')}</div>${monTab}`; })()
  : (() => { const l2 = list.filter(x => !DOK_ARTEN.includes(x.r.art)), s = f => sum(l2, x => x.r[f]);
    const t = [['Netto', s('netto')], ['MwSt.', s('mwst')], ['Brutto', s('brutto')], ['davon fix', sum(l2.filter(x => x.r.fix), x => x.r.netto)], ['davon variabel', sum(l2.filter(x => x.r.fix === false), x => x.r.netto)]];
    return `<div class="sumrow">${t.map(([l, v]) => `<span><small>${l}</small><b>${fmtE(v)}</b></span>`).join('')}</div>`; })()}
  <div class="tw"><table class="tb click">${colHead(view, cols, base)}<tbody>
  ${list.slice(0, lim).map(({ r, st }) => `<tr data-act="rechnung" data-id="${r.id}">
    ${isA ? `<td class="mono">${esc(r.nummer || '–')}</td><td>${fmtD(r.datum)}</td><td>${esc(r.partner || '')}</td><td>${esc(r.kundennr || '')}</td><td>${esc(ZA[r.zahlart] || '')}</td>
      <td class="num">${eur(r.bezahlt_betrag)}</td><td class="num">${fmtE(r.brutto)}</td><td class="num">${eur(r.lohn)}</td><td class="num">${eur(r.teile)}</td><td class="num">${eur(r.sonstiges)}</td><td class="num">${eur(r.mwst)}</td>
      <td class="num">${eur(r.altteile)}</td><td class="num">${eur(r.ust_alt)}</td><td class="num">${eur(r.durchlaufend)}</td><td class="num">${eur(r.netto)}</td>
      <td>${r.datum ? MONATE_LANG[+r.datum.slice(5, 7) - 1] : ''}</td><td class="num">${r.datum ? isoWeek(r.datum).w : ''}</td><td>${r.datum ? 'Q' + Math.ceil(+r.datum.slice(5, 7) / 3) : ''}</td><td class="small zweck">${esc(r.notiz || '')}</td>
      <td class="num">${st.bezahlt ? fmtE(st.bezahlt) : ''}</td><td class="num ${st.offen > 0.01 ? 'neg' : ''}">${Math.abs(st.offen) > 0.01 ? fmtE(st.offen) : ''}</td><td>${r.datei ? '📄' : ''}</td>`
      : `<td>${fmtD(r.datum)}</td><td class="num">${r.datum ? isoWeek(r.datum).w : ''}</td><td>${esc(r.partner || '')}</td><td class="${(r.brutto || 0) < 0 ? 'x-ein' : 'x-aus'}">${(r.brutto || 0) < 0 ? 'Einnahme' : 'Ausgabe'}</td><td>${fixTxt(r)}</td>
      <td>${esc(r.kostenart || '–')}${r.unterkonto ? ` <small class="muted">· ${esc(r.unterkonto)}</small>` : ''}</td><td class="${/rechnung|vertrag|korrektur/i.test(r.art || 'Rechnung') ? 'x-art-r' : 'x-art-g'}">${esc(r.art || '')}</td><td class="mono">${esc(r.nummer || '–')}</td><td>${esc(ZA[r.zahlart] || '')}</td>
      <td class="num">${fmtE(r.brutto)}</td><td class="num">${r.skonto ? fmtE(Math.abs(r.skonto)) : ''}</td><td class="num">${r.durchlaufend ? fmtE(r.durchlaufend) : ''}</td><td class="num">${r.netto != null ? fmtE(r.netto) : ''}</td>
      <td>${jaNein(r.mwst_pflicht != null ? r.mwst_pflicht : Math.abs(r.mwst || 0) > 0.005)}</td>
      <td class="num">${st.bezahlt ? fmtE(st.bezahlt) : ''}</td><td class="num ${st.offen > 0.01 ? 'neg' : ''}">${Math.abs(st.offen) > 0.01 ? fmtE(st.offen) : ''}</td><td>${r.datei ? '📄' : ''}</td><td class="small zweck">${esc(r.notiz || '')}</td>`}
    <td class="verk ${(() => { const q = zahlQuelle(r); return /ohne Zuordnung/.test(q) ? 'x-vk-warn' : ''; })()}" title="${esc(verkTxt(r))}">${verkKurz(r)}</td>
    <td class="st-td x-${st.cls}">${stSelect(r)}${st.hint ? ` <span class="badge ${st.hint[1]} hint">${esc(st.hint[0])}</span>` : ''}${(() => { const d = DUP.get(r.id); return d ? ` <span class="badge ${d.sicher ? 'st-bad' : 'st-warn'}" title="${esc('Gleicher Eintrag: ' + d.mit.map(x => (x.nummer || 'ohne Nr.') + ' · ' + fmtD(x.datum) + ' · ' + fmtE(x.brutto) + (x.status_excel ? ' · ' + x.status_excel : '')).join(' | '))}">${d.sicher ? 'doppelt' : 'doppelt?'}</span>` : ''; })()}</td></tr>`).join('') || `<tr><td colspan="${cols.length}" class="empty">Keine Rechnungen${fsel.length || q ? ' für diesen Filter' : ''}.</td></tr>`}
  </tbody></table></div>${moreBtn(view, list.length, lim)}`;
}

/* Bank-Filter: mehrere gleichzeitig. Innerhalb einer Gruppe „oder“, zwischen den Gruppen „und“
   (z. B. Eingänge + Nicht zugeordnet = nicht zugeordnete Eingänge; Nicht zugeordnet + Kosten ohne Beleg = beides) */
const FILT_B = [['alle', 'Alle'], ['ein', 'Eingänge'], ['aus', 'Ausgänge'], ['offen', 'Nicht zugeordnet'], ['zug', 'Zugeordnet'], ['sumup', 'SumUp-Auszahlungen'], ['kosten', 'Kosten ohne Beleg'], ['auto', 'Ohne Rechnung (Erstattung, Gebühr …)'], ['neutral', 'Privat / Umbuchung / Darlehen / 2025']];
const FILT_B_TEST = {
  ein: x => x.b.betrag > 0, aus: x => x.b.betrag < 0,
  offen: x => ['offen', 'teilweise'].includes(x.st.key), zug: x => ['zugeordnet', 'teilweise'].includes(x.st.key), sumup: x => x.b.art === 'sumup',
  kosten: x => x.st.key === 'kosten', auto: x => x.st.key === 'auto', neutral: x => ['privat', 'intern', 'ignoriert', 'vorjahr', 'darlehen'].includes(x.st.key)
};
function chipsMulti(view, opts) {
  const sel = filtListe(view);
  return `<div class="chips">${opts.map(([k, l]) => `<button class="chip ${k === 'alle' ? (!sel.length ? 'on' : '') : sel.includes(k) ? 'on' : ''}" data-act="filtT" data-v="${view}" data-f="${k}" title="${k === 'alle' ? 'Alle Filter aus' : 'Klick = an/aus · mehrere gleichzeitig möglich'}">${l}</button>`).join('')}</div>`;
}
function viewBank() {
  const range = periodRange(UI.period);
  let list = S.bank.filter(b => UI.period === 'alle' || inP(b.datum, range)).map(b => ({ b, st: bStatus(b) }));
  const fs = filtListe('bank').filter(k => FILT_B_TEST[k]), richt = fs.filter(k => k === 'ein' || k === 'aus'), stat = fs.filter(k => k !== 'ein' && k !== 'aus');
  if (richt.length) list = list.filter(x => richt.some(k => FILT_B_TEST[k](x)));
  if (stat.length) list = list.filter(x => stat.some(k => FILT_B_TEST[k](x)));
  const q = (UI.q.bank || '').toLowerCase().trim(); if (q) list = list.filter(x => q.split(/\s+/).every(w => [x.b.gegenpartei, x.b.zweck, x.b.kostenart, x.b.iban, fmtE(x.b.betrag), x.b.betrag, fmtD(x.b.datum)].join(' ').toLowerCase().includes(w)));
  list.sort((a, b) => b.b.datum.localeCompare(a.b.datum));
  const bRe = x => x.st.zuordnungen.map(z => S.rechnungen.find(r => r.id === z.rechnung_id)).filter(Boolean).map(r => (r.nummer || '') + ' ' + (r.partner || '')).join(' ') || x.b.kostenart || '';
  const cols = [colDat('datum', 'Datum', x => x.b.datum), colTxt('name', 'Name', x => x.b.gegenpartei), colTxt('zweck', 'Verwendungszweck', x => zweckKurz(x.b.zweck)),
    colNum('betrag', 'Betrag', x => x.b.betrag), colTxt('re', 'Kostenart / Rechnung', bRe), { k: 'st', l: 'Status', v: x => x.st.label, sel: true }];
  const base = list; list = colApply('bank', list, cols);
  const lim = UI.more.bank || 300;
  return `
  <div class="toolbar"><h1>Bank</h1><span class="sp"></span><button class="btn primary" data-act="korbPick" title="PDF-Kontoauszüge, CSV oder Excel – auch mehrere auf einmal">⬆ Kontoauszüge (PDF, Excel, CSV)</button><button class="btn" data-act="auto">⟳ Automatisch abgleichen</button><button class="btn" data-act="csv" data-v="bank">CSV</button></div>
  <div class="filters">${chipsMulti('bank', FILT_B)}${searchIn('bank', 'Name, Verwendungszweck, Betrag …')}
    <select class="inp" data-chg="period">${PERIODS.map(p => `<option value="${p[0]}" ${UI.period === p[0] ? 'selected' : ''}>${p[1]}</option>`).join('')}</select></div>
  <div class="sumline">${list.length} Umsätze · Eingänge ${fmtE(sum(list.filter(x => x.b.betrag > 0), x => x.b.betrag))} · Ausgänge ${fmtE(sum(list.filter(x => x.b.betrag < 0), x => x.b.betrag))}${colReset('bank')}</div>
  <div class="tw"><table class="tb click">${colHead('bank', cols, base)}<tbody>
  ${list.slice(0, lim).map(({ b, st }) => { const rs = st.zuordnungen.map(z => S.rechnungen.find(r => r.id === z.rechnung_id)).filter(Boolean);
    return `<tr data-act="bank" data-id="${b.id}"><td>${fmtD(b.datum)}</td><td>${esc(b.gegenpartei || '')}</td><td class="zweck" title="${esc(b.zweck || '')}">${esc(zweckKurz(b.zweck))}</td><td class="num ${b.betrag < 0 ? 'neg' : 'pos'}">${fmtE(b.betrag)}</td>
    <td class="small">${rs.length ? rs.map(r => esc((r.nummer || '') + ' ' + (r.partner || ''))).join(' · ') : esc(b.kostenart || '')}</td><td>${badge(st)}</td></tr>`; }).join('') || '<tr><td colspan="6" class="empty">Keine Bankumsätze für diesen Filter.</td></tr>'}
  </tbody></table></div>${moreBtn('bank', list.length, lim)}`;
}

const FILT_S = [['alle', 'Alle'], ['offen', 'Keiner Rechnung zugeordnet'], ['zugeordnet', 'Zugeordnet']];
function viewSumup() {
  const range = periodRange(UI.period);
  let list = S.sumup.filter(s => UI.period === 'alle' || inP(s.datum, range)).map(s => ({ s, st: sStatus(s) }));
  if (UI.filt.sumup !== 'alle') list = list.filter(x => x.st.key === UI.filt.sumup);
  const q = (UI.q.sumup || '').toLowerCase().trim(); if (q) list = list.filter(x => q.split(/\s+/).every(w => [x.s.beschreibung, x.s.transaktion, x.s.zahlungsart, fmtE(x.s.betrag), x.s.betrag, fmtD(x.s.datum)].join(' ').toLowerCase().includes(w)));
  list.sort((a, b) => b.s.datum.localeCompare(a.s.datum));
  const sRe = x => x.st.zuordnungen.map(z => S.rechnungen.find(r => r.id === z.rechnung_id)).filter(Boolean).map(r => (r.nummer || '') + ' ' + (r.partner || '')).join(' ');
  const sAus = x => { const bk = x.s.bank_id && S.bank.find(b => b.id === x.s.bank_id); return bk ? bk.datum : x.s.auszahlung_datum || ''; };
  const cols = [colDat('datum', 'Datum', x => x.s.datum), colTxt('beschr', 'Beschreibung', x => x.s.beschreibung), { k: 'karte', l: 'Karte', v: x => x.s.zahlungsart || '', sel: true },
    colNum('betrag', 'Betrag', x => x.s.betrag), colNum('geb', 'Gebühr', x => x.s.gebuehr), colTxt('re', 'Rechnung', sRe), colDat('aus', 'Auszahlung', sAus), { k: 'st', l: 'Status', v: x => x.st.label, sel: true }];
  const base = list; list = colApply('sumup', list, cols);
  const ok = list.filter(x => x.st.key !== 'fehl'), lim = UI.more.sumup || 300;
  return `
  <div class="toolbar"><h1>SumUp / EC-Zahlungen</h1><span class="sp"></span><button class="btn primary" data-act="pick" data-t="sumup">⬆ SumUp-Export importieren</button><button class="btn" data-act="auto">⟳ Automatisch abgleichen</button><button class="btn" data-act="csv" data-v="sumup">CSV</button></div>
  <div class="filters">${chips('sumup', FILT_S)}${searchIn('sumup', 'Beschreibung, Betrag, Transaktion …')}
    <select class="inp" data-chg="period">${PERIODS.map(p => `<option value="${p[0]}" ${UI.period === p[0] ? 'selected' : ''}>${p[1]}</option>`).join('')}</select></div>
  <div class="sumline">${ok.length} Zahlungen · ${fmtE(sum(ok, x => x.s.betrag))} · Gebühren ${fmtE(sum(ok, x => x.s.gebuehr))}${colReset('sumup')}</div>
  <div class="tw"><table class="tb click">${colHead('sumup', cols, base)}<tbody>
  ${list.slice(0, lim).map(({ s, st }) => { const rs = st.zuordnungen.map(z => S.rechnungen.find(r => r.id === z.rechnung_id)).filter(Boolean); const bk = s.bank_id && S.bank.find(b => b.id === s.bank_id);
    return `<tr data-act="sumup" data-id="${s.id}"><td>${fmtD(s.datum)}</td><td>${sumTxt(s)}</td><td>${esc(s.zahlungsart || '')}</td><td class="num">${fmtE(s.betrag)}</td><td class="num">${s.gebuehr != null ? fmtE(s.gebuehr) : ''}</td>
    <td class="small">${rs.map(r => esc((r.nummer || '') + ' ' + (r.partner || ''))).join(' · ')}</td><td class="small">${bk ? '✓ ' + fmtD(bk.datum) : s.auszahlung_datum ? fmtD(s.auszahlung_datum) : ''}</td><td>${badge(st)}</td></tr>`; }).join('') || '<tr><td colspan="8" class="empty">Keine SumUp-Zahlungen.</td></tr>'}
  </tbody></table></div>${moreBtn('sumup', list.length, lim)}`;
}

/* Zahlung gehört (wahrscheinlich) zu einer Ausgangsrechnung, die noch gar nicht importiert ist:
   – Nummer im Text liegt hinter der höchsten vorhandenen Rechnungsnummer des Jahres (z. B. „r26/1745“, letzte ist R26-1741), oder
   – ohne Nummer und nach dem Datum der letzten vorhandenen Ausgangsrechnung. */
function ausgangStand() {
  const max = {}; let letzt = '';
  S.rechnungen.forEach(r => { if (r.richtung !== 'ausgang') return; const m = String(r.nummer || '').match(/R\s?(\d{2})\s?[-\/]\s?(\d{3,5})/i); if (m) max[m[1]] = Math.max(max[m[1]] || 0, +m[2]); if (r.datum && r.datum > letzt) letzt = r.datum; });
  return { max, letzt };
}
function wartetAufRechnung(text, datum, stand) {
  const nrs = [...String(text || '').matchAll(/r\s?(\d{2})\s?[-\/ ]\s?(\d{3,5})/gi)];
  if (nrs.length) return nrs.some(m => (stand.max[m[1]] && +m[2] > stand.max[m[1]]) || +m[1] < +START_DATUM.slice(2, 4));   // noch nicht importiert – oder Rechnung von vor 2026
  return !!(datum && stand.letzt && datum > stand.letzt);
}

/* ---------- Abgleich & Probleme ---------- */
function viewAbgleich() {
  const all = S.rechnungen.map(r => ({ r, st: rStatus(r) }));
  const grp = k => all.filter(x => x.st.key === k);
  const dupIds = new Set([...rDoppelt('eingang').keys(), ...rDoppelt('ausgang').keys()]), dupErf = all.filter(x => dupIds.has(x.r.id))
    .sort((a, b) => String(a.r.partner || '').localeCompare(String(b.r.partner || ''), 'de') || String(a.r.nummer || '').localeCompare(String(b.r.nummer || '')));
  const rCols = dirCol => [...(dirCol ? [{ k: 'dir', l: '', v: x => x.r.richtung === 'ausgang' ? '↗ Ausgang' : '↘ Eingang', sel: true }] : []), COL.nr, COL.datum, colTxt('partner', 'Partner', x => x.r.partner),
    colNum('brutto', 'Brutto', x => x.r.brutto), colNum('bez', 'Bezahlt', x => x.st.bezahlt), colNum('diff', 'Differenz', x => r2(-x.st.offen)),
    { k: 'za', l: 'Zahlart', v: x => ZA[x.r.zahlart] || '', sel: true }, { k: 'st', l: 'Status', v: x => x.st.label, sel: true },
    colTxt('zahl', 'Zahlungen', x => x.st.zahlungen.map(payLabel).join(' ')), colTxt('notiz', 'Notiz', x => x.r.notiz)];
  const rows = (l0, dirCol = true, key = 'abg') => { if (!l0.length) return '<div class="empty small">Nichts – alles gut.</div>'; const cols = rCols(dirCol), l = colApply(key, l0, cols);
    return `<div class="tw"><table class="tb click">${colHead(key, cols, l0)}<tbody>
    ${l.map(({ r, st }) => `<tr data-act="rechnung" data-id="${r.id}">${dirCol ? `<td>${r.richtung === 'ausgang' ? '↗' : '↘'}</td>` : ''}<td class="mono">${esc(r.nummer || '–')}</td><td>${fmtD(r.datum)}</td><td>${esc(r.partner || '')}</td><td class="num">${fmtE(r.brutto)}</td><td class="num">${fmtE(st.bezahlt)}</td><td class="num neg">${fmtE(-st.offen)}</td>
      <td>${esc(ZA[r.zahlart] || '')}</td><td>${badge(st)}</td><td class="small">${st.zahlungen.map(z => payLabel(z) + ' · ' + fmtE(z.betrag)).join(' · ')}</td><td class="small zweck">${esc(r.notiz || '')}</td></tr>`).join('') || `<tr><td colspan="${cols.length}" class="empty small">Nichts für diesen Filter.</td></tr>`}</tbody></table></div>`; };
  const stand = ausgangStand();
  const bankAlle = S.bank.filter(b => b.betrag > 0 && ['offen', 'teilweise'].includes(bStatus(b).key)).sort((a, b) => b.datum.localeCompare(a.datum));
  const bankOffen = bankAlle.filter(b => !wartetAufRechnung((b.zweck || '') + ' ' + (b.gegenpartei || ''), b.datum, stand));
  const bankAusOffen = S.bank.filter(b => b.betrag < 0 && bStatus(b).key === 'offen').sort((a, b) => b.datum.localeCompare(a.datum));
  const sumAlle = S.sumup.filter(s => sStatus(s).key === 'offen').sort((a, b) => b.datum.localeCompare(a.datum));
  const sumOffen = sumAlle.filter(s => !wartetAufRechnung(s.beschreibung, s.datum, stand));
  const warten = bankAlle.length - bankOffen.length + sumAlle.length - sumOffen.length;
  const nextNr = Object.entries(stand.max).sort().slice(-1).map(([y, n]) => `R${y}-${String(n + 1).padStart(4, '0')}`)[0];
  const ueberf = grp('ueberfaellig').filter(x => x.r.richtung === 'ausgang').sort((a, b) => (a.r.datum || '').localeCompare(b.r.datum || ''));
  const blCols = [colDat('datum', 'Datum', b => b.datum), colTxt('name', 'Name', b => b.gegenpartei), colTxt('zweck', 'Verwendungszweck', b => zweckKurz(b.zweck)), colNum('betrag', 'Betrag', b => b.betrag)];
  const bl = (l0, key) => { if (!l0.length) return '<div class="empty small">Nichts offen.</div>'; const l = colApply(key, l0, blCols);
    return `<div class="tw"><table class="tb click">${colHead(key, blCols, l0)}<tbody>${l.slice(0, 300).map(b => `<tr data-act="bank" data-id="${b.id}"><td>${fmtD(b.datum)}</td><td>${esc(b.gegenpartei || '')}</td><td class="zweck" title="${esc(b.zweck || '')}">${esc(zweckKurz(b.zweck))}</td><td class="num">${fmtE(b.betrag)}</td></tr>`).join('') || '<tr><td colspan="4" class="empty small">Nichts für diesen Filter.</td></tr>'}</tbody></table></div>${l.length > 300 ? `<p class="small muted">+ ${l.length - 300} weitere unter „Bank“.</p>` : ''}`; };
  const suCols = [colDat('datum', 'Datum', s => s.datum), colTxt('beschr', 'Beschreibung', s => s.beschreibung || [s.zahlungsart, s.transaktion].filter(Boolean).join(' ')), colNum('betrag', 'Betrag', s => s.betrag)];
  const sl = (l0, key) => { if (!l0.length) return '<div class="empty small">Nichts offen.</div>'; const l = colApply(key, l0, suCols);
    return `<div class="tw"><table class="tb click">${colHead(key, suCols, l0)}<tbody>${l.slice(0, 300).map(s => `<tr data-act="sumup" data-id="${s.id}"><td>${fmtD(s.datum)}</td><td>${sumTxt(s)}</td><td class="num">${fmtE(s.betrag)}</td></tr>`).join('') || '<tr><td colspan="3" class="empty small">Nichts für diesen Filter.</td></tr>'}</tbody></table></div>${l.length > 300 ? `<p class="small muted">+ ${l.length - 300} weitere unter „SumUp“.</p>` : ''}`; };
  const bankAuto = S.bank.filter(b => bStatus(b).key === 'auto').sort((a, b) => b.datum.localeCompare(a.datum));
  const blA = (l0, key) => { const c = [colTxt('art', 'Erkannt als', b => bStatus(b).label), ...blCols], l = colApply(key, l0, c);
    return `<div class="tw"><table class="tb click">${colHead(key, c, l0)}<tbody>${l.slice(0, 300).map(b => `<tr data-act="bank" data-id="${b.id}"><td>${badge(bStatus(b))}</td><td>${fmtD(b.datum)}</td><td>${esc(b.gegenpartei || '')}</td><td class="zweck" title="${esc(b.zweck || '')}">${esc(zweckKurz(b.zweck))}</td><td class="num">${fmtE(b.betrag)}</td></tr>`).join('')}</tbody></table></div>`; };
  const ek = all.filter(x => x.st.erklaert), ohneBeleg = bankAusOffen.filter(b => !b.kostenart);
  const ekCols = [COL.nr, colTxt('partner', 'Partner', x => x.r.partner), COL.datum, colNum('brutto', 'Brutto', x => x.r.brutto), colTxt('grund', 'Begründung', x => x.st.hint[0]), colTxt('notiz', 'Notiz', x => x.r.notiz)];
  const ekTab = () => { const l = colApply('abgE', ek, ekCols); return `<div class="tw"><table class="tb click">${colHead('abgE', ekCols, ek)}<tbody>${l.map(({ r, st }) => `<tr data-act="rechnung" data-id="${r.id}"><td class="mono">${esc(r.nummer || '–')}</td><td>${esc(r.partner || '')}</td><td>${fmtD(r.datum)}</td><td class="num">${fmtE(r.brutto)}</td><td class="small">${esc(st.hint[0])}</td><td class="small zweck">${esc(r.notiz || '')}</td></tr>`).join('')}</tbody></table></div>`; };
  // Rubriken: Titel, Anzahl, Summe, Inhalt – aufklappbar, volle Breite
  const R = [
    { k: 'doppelt', t: '⚠ Doppelt bezahlt', ton: 'bad', l: grp('doppelt'), s: x => -x.st.offen, html: () => rows(grp('doppelt'), true, 'abgD'), info: 'Dieselbe Rechnung wurde zweimal bezahlt – Rückzahlung prüfen.' },
    { k: 'ueber', t: 'Zu viel bezahlt', ton: 'warn', l: grp('ueber'), s: x => -x.st.offen, html: () => rows(grp('ueber'), true, 'abgU') },
    { k: 'teil', t: 'Zu wenig bezahlt', ton: 'warn', l: grp('teil'), s: x => x.st.offen, html: () => rows(grp('teil'), true, 'abgT') },
    { k: 'dupErf', t: '⚠ Doppelt erfasste Rechnungen', ton: 'bad', l: dupErf, s: x => x.r.brutto, html: () => rows(dupErf, true, 'abgDE'),
      info: 'Gleiche Firma, Nummer, Betrag und Datum (bzw. einmal ohne Nummer). Den überzähligen Eintrag öffnen und löschen – am besten den ohne Zahlung und ohne PDF. Ist es keine Doppelung, in die Notiz „kein Duplikat“ schreiben.' },
    { k: 'ueberf', t: 'Überfällige Kundenrechnungen', ton: 'bad', l: ueberf, s: x => x.st.offen, html: () => rows(ueberf, false, 'abgF'), info: 'Zahlungsziel überschritten, noch keine Zahlung gefunden.' },
    { k: 'bank', t: 'Zahlungseingänge ohne Rechnung', ton: 'warn', l: bankOffen, s: b => b.betrag, html: () => bl(bankOffen, 'abgB') },
    { k: 'sumup', t: 'EC-Zahlungen (SumUp) ohne Rechnung', ton: 'warn', l: sumOffen, s: s => s.betrag, html: () => sl(sumOffen, 'abgS'),
      info: warten ? `Nicht aufgeführt: ${warten} Zahlung${warten === 1 ? '' : 'en'} zu Rechnungen, die noch nicht importiert sind${nextNr ? ` (ab ${nextNr} bzw. nach dem ${fmtD(stand.letzt)})` : ''} oder von vor 2026 stammen – sie werden zugeordnet, sobald das nächste Werkstatt Journal kommt.` : '' },
    { k: 'kosten', t: 'Bankabgänge ohne Beleg und ohne Kostenart', ton: 'warn', l: ohneBeleg, s: b => -b.betrag, html: () => bl(ohneBeleg, 'abgK') },
    { k: 'regeln', t: '📝 Eigene Regeln & Hinweise', ton: 'ok', l: regeln(), s: () => 0, html: regelnHtml, immer: true },
    { k: 'ohneR', t: '✓ Ohne Rechnung (automatisch erkannt)', ton: 'ok', l: bankAuto, s: b => b.betrag, html: () => blA(bankAuto, 'abgA'), info: 'Rücklastschriften, Erstattungen, Zahlungen zu Rechnungen aus 2025, Darlehen, Bankgebühren, Rückzahlungen an Kunden – dazu gibt es keine Rechnung. Falsch erkannt? Buchung anklicken und von Hand zuordnen.' },
    { k: 'erkl', t: '✓ Abweichung erklärt', ton: 'ok', l: ek, s: () => 0, html: ekTab, info: 'Cent-Differenzen, Rückzahlung laut Notiz oder laut Liste bezahlt – kein Handlungsbedarf.' }
  ];
  UI.abgOpen = UI.abgOpen || (() => { const f = R.find(x => x.l.length && x.ton !== 'ok'); return f ? { [f.k]: true } : {}; })();
  const offenProbleme = R.filter(x => x.ton !== 'ok').reduce((s, x) => s + x.l.length, 0);
  return `
  <div class="toolbar"><h1>Abgleich & Probleme</h1><span class="sp"></span><button class="btn primary" data-act="auto">⟳ Automatisch abgleichen</button><button class="btn" data-act="neuAbgleich" title="Alle automatischen Zuordnungen verwerfen und mit den aktuellen Regeln neu berechnen – eigene (von Hand) bleiben">↻ Neu berechnen</button></div>
  <p class="muted small">Rubrik antippen zum Auf- und Zuklappen. Unklare Fälle anklicken und von Hand zuordnen. ${offenProbleme ? `<b>${offenProbleme}</b> Einträge brauchen einen Blick.` : '✓ Nichts offen.'}
    <button class="lnk" data-act="abgAlle" data-v="1">alle aufklappen</button> · <button class="lnk" data-act="abgAlle" data-v="0">alle zuklappen</button></p>
  <div class="abg-list">${[...R.filter(x => x.l.length && x.ton !== 'ok'), ...R.filter(x => x.l.length && x.ton === 'ok'), ...R.filter(x => !x.l.length)].map(x => {   // Rubriken mit Einträgen oben, leere unten
    const n = x.l.length, su = sum(x.l, x.s), auf = !!UI.abgOpen[x.k];
    return `<details class="abg ton-${n ? x.ton : 'leer'}" data-abg="${x.k}" ${auf ? 'open' : ''}>
      <summary><span class="abg-t">${x.t}</span><span class="cnt">${n}</span>${n && su ? `<span class="abg-s">${fmtE(su)}</span>` : ''}<span class="sp"></span><span class="abg-z">${n ? '' : 'alles gut'}</span><span class="abg-c" aria-hidden="true">▾</span></summary>
      <div class="abg-b">${x.info ? `<p class="small muted">${x.info}</p>` : ''}${auf ? (n || x.immer ? x.html() : '<div class="empty small">Nichts – alles gut.</div>') : ''}</div>
    </details>`; }).join('')}</div>`;
}

// SumUp-Text: Beschreibung aus dem Export; fehlt sie (in SumUp nichts eingegeben), Kartenart und Transaktionscode zeigen
 const sumTxt = s => s.beschreibung ? esc(s.beschreibung) : `<span class="muted">ohne Text · ${esc([s.zahlungsart, s.transaktion].filter(Boolean).join(' · '))}</span>`;
/* ---------- Ablage: alle Belege als Ordner + eigene Dokumente ---------- */
// Pfad UI.abl: '' = oberste Ebene · 'eingang/2026/Firma' · 'ausgang/2026/11' · 'avis/2026/Firma' · 'dok/Verträge/…'
// „Dokumente“ liegen im Cloud-Speicher unter ablage/… (Ordner = Pfad, leere Ordner mit Platzhalter „.ordner“)
const DOK = { cache: {}, laedt: {} };
const DOK_PLATZ = '.ordner';
// Ordnernamen für den Speicher: Umlaute ausschreiben, nur erlaubte Zeichen
const dokOrdnerName = (n, max = 60) => String(n || '').trim().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/Ä/g, 'Ae').replace(/Ö/g, 'Oe').replace(/Ü/g, 'Ue').replace(/ß/g, 'ss')
  .normalize('NFKD').replace(/[^\w .()&+,-]+/g, '_').replace(/\s+/g, ' ').slice(-max).trim();
(() => { const s = document.createElement('style'); s.textContent = `.abl-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px;margin:10px 0 16px}
.abl-o{display:flex;flex-direction:column;align-items:flex-start;gap:2px;padding:14px;border:1px solid var(--line);border-radius:12px;background:var(--bg2);color:inherit;text-align:left;cursor:pointer;font:inherit}
.abl-o:hover{border-color:var(--y)}.tw tfoot td{position:sticky;bottom:0;z-index:2;background:var(--bg2);border-top:2px solid var(--line);white-space:nowrap}.msel{position:relative}.msel>summary{list-style:none;cursor:pointer;white-space:nowrap}.msel>summary::-webkit-details-marker{display:none}
.msel-pop{position:absolute;z-index:30;top:calc(100% + 4px);left:0;min-width:260px;max-height:60vh;overflow:auto;background:var(--bg2);border:1px solid var(--line);border-radius:12px;padding:8px;box-shadow:0 8px 24px rgba(0,0,0,.25);display:flex;flex-direction:column;gap:2px}
.cfm>summary{display:block;max-width:170px;overflow:hidden;text-overflow:ellipsis;font-weight:400}.cfm .msel-pop{position:fixed;z-index:60;font-weight:400;text-transform:none;letter-spacing:0}
.msel-o{display:flex;gap:8px;align-items:center;padding:5px 6px;border-radius:8px;cursor:pointer;white-space:nowrap}.msel-o:hover{background:var(--y-soft)}.sum-klick{display:flex;flex-direction:column;align-items:flex-start;background:none;border:1px solid var(--y);border-radius:10px;padding:4px 10px;color:inherit;font:inherit;cursor:pointer}.sum-klick:hover{background:var(--y-soft)}.abl-o b{word-break:break-word}.abl-i{font-size:26px;line-height:1}.abl-pfad{margin:4px 0 12px;display:flex;flex-wrap:wrap;gap:6px;align-items:center}.nowrap{white-space:nowrap}`; document.head.appendChild(s); })();
const dokPrefix = pfad => 'ablage' + (pfad ? '/' + pfad : '');
const dokName = n => String(n || '').replace(/^\d{10,}_/, '');   // Zeitstempel vorne ausblenden
async function dokLaden(pfad, neu) {
  const pre = dokPrefix(pfad); if (!neu && DOK.cache[pre]) return DOK.cache[pre];
  if (!DB.cloud) return (DOK.cache[pre] = { ordner: [], dateien: [] });
  const { data, error } = await DB.sb.storage.from('belege').list(pre, { limit: 1000, sortBy: { column: 'name', order: 'asc' } });
  if (error) throw error;
  const ordner = [], dateien = [];
  (data || []).forEach(o => { if (o.name === DOK_PLATZ) return; if (!o.id) ordner.push(o.name); else dateien.push({ name: o.name, pfad: pre + '/' + o.name, groesse: o.metadata?.size, datum: (o.created_at || '').slice(0, 10) }); });
  return (DOK.cache[pre] = { ordner, dateien });
}
function ablBaum() {
  // Belege aus der App, nach Bereich → Jahr → Firma/Monat
  const t = { eingang: {}, ausgang: {}, avis: {} }, add = (o, ks, x) => { let n = o; ks.forEach((k, i) => { n = n[k] = n[k] || (i === ks.length - 1 ? [] : {}); }); n.push(x); };
  S.rechnungen.forEach(r => { if (!r.datei) return; const j = (r.datum || '').slice(0, 4) || 'ohne Datum';
    if (r.richtung === 'ausgang') add(t.ausgang, [j, MONATE_LANG[+(r.datum || '').slice(5, 7) - 1] || 'ohne Datum'], { r, typ: 'r' });
    else add(t.eingang, [j, String(r.partner || 'Unbekannt').trim() || 'Unbekannt'], { r, typ: 'r' }); });
  (S.avise || []).forEach(a => { if (!a.datei) return; add(t.avis, [(a.datum || '').slice(0, 4) || 'ohne Datum', String(a.partner || 'Unbekannt').trim() || 'Unbekannt'], { r: a, typ: 'a' }); });
  return t;
}
const ablZahl = n => Array.isArray(n) ? n.length : Object.values(n).reduce((s, x) => s + ablZahl(x), 0);
function viewAblage() {
  const pfad = UI.abl || '', teile = pfad ? pfad.split('/') : [], bereich = teile[0];
  const NAMEN = { eingang: 'Rechnungseingang', ausgang: 'Rechnungsausgang', avis: 'Zahlungsavise', dok: 'Dokumente' };
  const kr = [`<button class="lnk" data-act="ablGo" data-p="">Ablage</button>`].concat(teile.map((t, i) => `<button class="lnk" data-act="ablGo" data-p="${esc(teile.slice(0, i + 1).join('/'))}">${esc(i === 0 ? NAMEN[t] || t : t)}</button>`)).join(' <span class="muted">›</span> ');
  const ordnerKachel = (p, name, n, ic = '📁') => `<button class="abl-o" data-act="ablGo" data-p="${esc(p)}"><span class="abl-i">${ic}</span><b>${esc(name)}</b><small class="muted">${n === '' ? '' : n + ' Datei' + (n === 1 ? '' : 'en')}</small></button>`;
  const q = (UI.q.ablage || '').toLowerCase().trim();
  const baum = ablBaum();
  let inhalt = '';
  const belegZeilen = l => `<div class="tw"><table class="tb click"><thead><tr><th>Datei</th><th>Datum</th><th>Firma / Kunde</th><th>Nr.</th><th class="num">Betrag</th><th></th></tr></thead><tbody>${l.map(({ r, typ }) =>
    `<tr data-act="${typ === 'a' ? 'avisD' : 'rechnung'}" data-id="${r.id}"><td>📄 ${esc(r.dateiname || r.datei.split('/').pop())}</td><td>${fmtD(r.datum)}</td><td>${esc(r.partner || '')}</td><td class="mono">${esc(r.nummer || '')}</td><td class="num">${r.brutto != null ? fmtE(r.brutto) : r.betrag != null ? fmtE(r.betrag) : ''}</td><td><button class="btn sm" data-act="ablOeffnen" data-f="${esc(r.datei)}">Öffnen</button></td></tr>`).join('')}</tbody></table></div>`;
  if (q) {   // Suche über alle Belege der App
    const alle = []; const lauf = n => Array.isArray(n) ? alle.push(...n) : Object.values(n).forEach(lauf); lauf(baum);
    const treffer = alle.filter(({ r }) => [r.dateiname, r.partner, r.nummer, r.datum, r.brutto, r.betrag].join(' ').toLowerCase().includes(q));
    inhalt = `<p class="small muted">${treffer.length} Treffer in den Belegen der App${treffer.length > 300 ? ' (die ersten 300)' : ''}.</p>` + (treffer.length ? belegZeilen(treffer.sort((a, b) => (b.r.datum || '').localeCompare(a.r.datum || '')).slice(0, 300)) : '');
  } else if (!bereich) {
    inhalt = `<div class="abl-grid">${['eingang', 'ausgang', 'avis'].map(k => ordnerKachel(k, NAMEN[k], ablZahl(baum[k]))).join('')}${ordnerKachel('dok', 'Dokumente', '', '🗂')}</div>
      <p class="small muted">Rechnungseingang, Rechnungsausgang und Zahlungsavise füllen sich von selbst mit jeder hochgeladenen PDF. Unter „Dokumente“ kannst du eigene Ordner für alles andere anlegen – Verträge, Versicherungen, Mietvertrag, TÜV, Personal …</p>`;
  } else if (bereich !== 'dok') {
    let n = baum[bereich]; for (const t of teile.slice(1)) n = n && n[t];
    if (!n) inhalt = '<div class="empty">Ordner nicht gefunden.</div>';
    else if (Array.isArray(n)) inhalt = belegZeilen(n.slice().sort((a, b) => (b.r.datum || '').localeCompare(a.r.datum || '')));
    else { const ks = Object.keys(n).sort((a, b) => teile.length === 1 ? b.localeCompare(a) : bereich === 'ausgang' ? MONATE_LANG.indexOf(b) - MONATE_LANG.indexOf(a) : a.localeCompare(b, 'de', { sensitivity: 'base' }));
      inhalt = `<div class="abl-grid">${ks.map(k => ordnerKachel(pfad + '/' + k, k, ablZahl(n[k]))).join('')}</div>`; }
  } else {
    const sub = teile.slice(1).join('/'), pre = dokPrefix(sub), d = DOK.cache[pre];
    if (!DB.cloud) inhalt = '<div class="empty">Eigene Dokumente gehen nur in der Online-Version.</div>';
    else if (!d) { if (!DOK.laedt[pre]) { DOK.laedt[pre] = 1; dokLaden(sub).catch(e => toast('Ordner nicht geladen: ' + e.message)).finally(() => { delete DOK.laedt[pre]; if (UI.view === 'ablage') render(); }); } inhalt = '<div class="empty small">Lade …</div>'; }
    else inhalt = `<div class="btnrow"><button class="btn primary" data-act="dokHoch">⬆ Dateien hochladen</button><button class="btn" data-act="dokOrdner">＋ Neuer Ordner</button>${sub && !d.ordner.length && !d.dateien.length ? '<button class="btn danger" data-act="dokOrdnerWeg">Leeren Ordner löschen</button>' : ''}</div>
      <p class="small muted">Dateien einfach in dieses Fenster ziehen – sie landen in diesem Ordner.</p>
      ${d.ordner.length ? `<div class="abl-grid">${d.ordner.map(o => ordnerKachel(pfad + '/' + o, o, '')).join('')}</div>` : ''}
      ${d.dateien.length ? `<div class="tw"><table class="tb"><thead><tr><th>Datei</th><th>Hochgeladen</th><th class="num">Größe</th><th></th></tr></thead><tbody>${d.dateien.map(f => `<tr><td>📄 ${esc(dokName(f.name))}</td><td>${fmtD(f.datum)}</td><td class="num">${f.groesse ? kb(f.groesse) : ''}</td><td class="nowrap"><button class="btn sm" data-act="ablOeffnen" data-f="${esc(f.pfad)}">Öffnen</button> <button class="btn sm danger" data-act="dokWeg" data-f="${esc(f.pfad)}">Löschen</button></td></tr>`).join('')}</tbody></table></div>`
        : !d.ordner.length ? '<div class="empty small">Noch leer.</div>' : ''}`;
  }
  return `<div class="toolbar"><h1>Ablage</h1><span class="sp"></span>${searchIn('ablage', 'Datei, Firma, Nummer, Betrag …')}</div>
    <div class="abl-pfad">${kr}</div>${inhalt}`;
}
async function dokHochladen(files) {
  const sub = (UI.abl || '').split('/').slice(1).join('/'); if (!files.length) return;
  busy(true, `Lade ${files.length} Datei${files.length === 1 ? '' : 'en'} hoch …`);
  let ok = 0; for (const f of files) { try { await DB.upload(`${dokPrefix(sub)}/${Date.now()}_${dokOrdnerName(f.name, 120) || 'Datei'}`, f); ok++; } catch (e) { toast(f.name + ': ' + e.message); } }
  await dokLaden(sub, true).catch(() => { }); busy(false); render(); toast(`${ok} Datei${ok === 1 ? '' : 'en'} abgelegt.`);
}

/* ---------- Einstellungen ---------- */
function viewEinst() {
  const imps = [...S.importe].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  const ART = { ausgang: 'Rechnungsausgang', sumup: 'SumUp', bank: 'Bank', eingang: 'Eingang' };
  return `
  <div class="toolbar"><h1>Einstellungen</h1></div>
  <div class="grid2">
  <section class="card"><h3>Allgemein</h3>
    <label class="fld"><span>Kundenrechnungen sind überfällig ab … Tagen nach Rechnungsdatum</span><input class="inp" type="number" min="0" max="120" value="${ZIEL_TAGE()}" data-chg="ziel"></label>
    <p class="small muted">Danach gilt eine Rechnung als überfällig.</p>
    <p class="small">Verbindung: ${DB.cloud ? '● Supabase (online, alle Geräte)' : '○ Demo-Modus – Daten nur in diesem Browser'} · KI: ${DB.aiOn ? 'an' : 'aus'}${S.user ? ' · angemeldet als ' + esc(S.user.email) : ''}</p>
    ${DB.cloud ? '<button class="btn" data-act="pw">Passwort ändern</button> <button class="btn" data-act="logout">Abmelden</button>' : '<button class="btn" data-act="demo">Demo-Daten laden</button> <button class="btn danger" data-act="resetDemo">Demo-Daten löschen</button>'}
  </section>
  <section class="card"><h3>Beleg-Ablage</h3>
    <p class="small">Eingangsrechnungen werden automatisch benannt:<br><span class="mono small">VE Sport_Lieferant_Art_Nummer_Datum.pdf</span><br><span class="muted">z. B. ${esc(belegName({ partner: 'Stahlgruber GmbH', art: 'Rechnung', nummer: '4711-0815', datum: '2026-11-20' }))}</span></p>
    ${ablageMoeglich() ? `
    <p class="small"><b>Rechnungseingang</b> (umbenannt): ${ABLAGE ? `<b>📁 ${esc(ABLAGE.name)}</b>` : '<span class="muted">noch kein Ordner</span>'}</p>
    <div class="btnrow" style="margin-top:4px"><button class="btn ${ABLAGE ? '' : 'primary'}" data-act="ablageWahl" data-art="eingang">${ABLAGE ? 'Anderen Ordner' : '📁 Ordner wählen'}</button>${ABLAGE ? '<button class="btn" data-act="ablageAus" data-art="eingang">Aus</button>' : ''}</div>
    <p class="small" style="margin-top:12px"><b>Rechnungsausgang</b> (Originalname bleibt): ${ABLAGE_A ? `<b>📁 ${esc(ABLAGE_A.name)}</b>` : '<span class="muted">noch kein Ordner</span>'}</p>
    <div class="btnrow" style="margin-top:4px"><button class="btn ${ABLAGE_A ? '' : 'primary'}" data-act="ablageWahl" data-art="ausgang">${ABLAGE_A ? 'Anderen Ordner' : '📁 Ordner wählen'}</button>${ABLAGE_A ? '<button class="btn" data-act="ablageAus" data-art="ausgang">Aus</button>' : ''}</div>
    ${ABLAGE || ABLAGE_A ? `<div class="btnrow"><button class="btn" data-act="ablageAlle">Vorhandene Belege jetzt ablegen</button></div>` : ''}
    <p class="small muted">Jede reingezogene Rechnung wird zusätzlich in den passenden Ordner gelegt (z. B. OneDrive). Eingangsrechnungen werden nach dem Schema benannt und bei Änderungen umbenannt; eure eigenen Ausgangsrechnungen behalten den Namen, den sie haben. Die Ordner gelten für diesen Browser; der Browser fragt beim ersten Mal nach Erlaubnis.</p>`
    : '<p class="small muted">Die Ablage in einen Ordner auf dem PC geht nur in Chrome oder Edge. Die Belege liegen trotzdem sicher in der App und lassen sich mit dem richtigen Namen herunterladen.</p>'}
  </section>
  <section class="card"><h3>Importe</h3><p class="small muted">Ein falscher Import lässt sich hier komplett rückgängig machen.</p>
    ${imps.length ? `<div class="tw"><table class="tb"><thead><tr><th>Wann</th><th>Art</th><th>Datei</th><th class="num">Neu</th><th class="num">Doppelt</th><th></th></tr></thead><tbody>
    ${imps.slice(0, 60).map(i => `<tr><td>${fmtD((i.created_at || '').slice(0, 10))}</td><td>${ART[i.art] || i.art}</td><td>${esc(i.datei || '')}</td><td class="num">${i.neu ?? ''}</td><td class="num">${i.doppelt ?? ''}</td><td><button class="btn sm danger" data-act="undoImp" data-id="${i.id}">Rückgängig</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty small">Noch keine Importe.</div>'}
  </section></div>`;
}
