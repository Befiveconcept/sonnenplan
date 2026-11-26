/* Mastercar Finanzen · Eigene Regeln („Hinweise“) für den Abgleich
   Ihr schreibt in eigenen Worten, was die App wissen soll – z. B.
   „Einzahlungen von Volksbank Köln Bonn sind die Summe der Barzahlungen von Kunden“ –
   die KI macht daraus eine Regel (Suchbegriffe + was zu tun ist). Die Regeln gelten bei jedem Abgleich.
   Gespeichert in einstellungen.regeln (für alle im Team gleich). */

const REGEL_AKTION = {
  umbuchung: 'Umbuchung Kasse ↔ Bank (keine Kundenzahlung, kein Beleg nötig)',
  privat: 'Privat (gehört nicht zur Firma)',
  ignorieren: 'Ignorieren (kein Beleg nötig)',
  kostenart: 'Kosten ohne Beleg mit Kostenart',
};
const REGEL_QUELLE = { bank: 'Bank', kasse: 'Kassenbuch', sumup: 'SumUp' };
const REGEL_RICHTUNG = { ein: 'Eingänge (+)', aus: 'Ausgänge (−)', beide: 'Ein- und Ausgänge' };

// Voreinstellung: Bareinzahlungen auf das Konto sind Umbuchungen aus der Kasse
const REGELN_START = [
  { id: 'bareinzahlung', text: 'Einzahlungen von Volksbank Köln Bonn sind die Summe der Barzahlungen von Kunden (Bargeld aus der Kasse aufs Konto).', quelle: 'bank', richtung: 'ein', suche: ['volksbank koeln bonn'], oder: ['bareinzahlung', 'einzahlung'], aktion: 'umbuchung' },
  { id: 'bargeld-konto', text: 'Im Kassenbuch ist „Bargeld auf Konto“ die Gegenbuchung zur Bareinzahlung.', quelle: 'kasse', richtung: 'aus', suche: [], oder: ['bargeld auf konto', 'bargeld aufs konto', 'auf konto eingezahlt', 'bank eingezahlt', 'einzahlung bank'], aktion: 'umbuchung' },
];
const regeln = () => Array.isArray(S.einstellungen.regeln) ? S.einstellungen.regeln : REGELN_START;
async function regelnSpeichern(l) { await DB.setSetting('regeln', l); }

const regelText = (q, x) => norm(q === 'bank' ? (x.gegenpartei || '') + ' ' + (x.zweck || '') + ' ' + (x.iban || '') : q === 'kasse' ? (x.text || '') + ' ' + (x.belegnr || '') : (x.beschreibung || ''));
function regelPasst(g, q, x) {
  if (g.quelle !== q) return false;
  if (g.richtung === 'ein' && !(x.betrag > 0)) return false;
  if (g.richtung === 'aus' && !(x.betrag < 0)) return false;
  const t = regelText(q, x), alle = (g.suche || []).map(norm).filter(Boolean), eins = (g.oder || []).map(norm).filter(Boolean);
  if (!alle.length && !eins.length) return false;
  return alle.every(w => t.includes(w)) && (!eins.length || eins.some(w => t.includes(w)) || (alle.length && !g.oderPflicht));
}
// Welche Einträge trifft eine Regel? (für Vorschau und Zähler)
function regelTreffer(g) { const l = g.quelle === 'bank' ? S.bank : g.quelle === 'kasse' ? S.kasse : S.sumup; return l.filter(x => regelPasst(g, g.quelle, x)); }

// Regeln anwenden: nur auf Einträge ohne Zuordnung, die noch nicht von Hand eingeordnet sind
async function regelnAnwenden() {
  buildIdx(); const jobs = []; let n = 0;
  for (const g of regeln()) {
    for (const x of regelTreffer(g)) {
      if (g.quelle === 'bank') {
        if ((IDX.zByB.get(x.id) || []).length || (x.art && x.art !== 'intern' && x.art !== 'privat' && x.art !== 'ignoriert')) continue;
        const art = g.aktion === 'umbuchung' ? 'intern' : g.aktion === 'privat' ? 'privat' : g.aktion === 'ignorieren' ? 'ignoriert' : null;
        const p = {}; if (art && x.art !== art) p.art = art; if (g.aktion === 'kostenart' && g.kostenart && x.kostenart !== g.kostenart) p.kostenart = g.kostenart;
        if (Object.keys(p).length) { jobs.push(() => DB.update('bank', x.id, p)); n++; }
      } else if (g.quelle === 'kasse') {
        if ((IDX.zByK.get(x.id) || []).length) continue;
        const ka = g.aktion === 'kostenart' ? g.kostenart : g.aktion === 'umbuchung' ? 'Umbuchung Kasse/Bank' : g.aktion === 'privat' ? 'Privat' : 'Ignoriert';
        if (ka && x.kostenart !== ka) { jobs.push(() => DB.update('kasse', x.id, { kostenart: ka })); n++; }
      } else if (g.quelle === 'sumup' && (g.aktion === 'ignorieren' || g.aktion === 'privat')) {
        if ((IDX.zByS.get(x.id) || []).length || /ignor/i.test(x.status || '')) continue;
        jobs.push(() => DB.update('sumup', x.id, { status: 'Ignoriert (Regel)' })); n++;
      }
    }
  }
  for (let i = 0; i < jobs.length; i += 10) await Promise.all(jobs.slice(i, i + 10).map(f => f()));
  return n;
}

// Freitext → Regel (KI); ohne KI: einfache Erkennung der Stichworte
async function regelAusText(text) {
  if (DB.aiOn) {
    const j = await DB.aiJson(`Ein Mitarbeiter der Kfz-Werkstatt Mastercar Bornheim beschreibt in eigenen Worten, wie bestimmte Zahlungen im Finanz-Abgleich zu behandeln sind:
"""${text}"""
Mach daraus GENAU EINE Regel als JSON:
{"quelle":"bank|kasse|sumup","richtung":"ein|aus|beide","suche":["Begriffe, die ALLE im Namen/Verwendungszweck/Text vorkommen müssen, kleingeschrieben"],"oder":["alternative Begriffe, von denen einer reicht (optional)"],"aktion":"umbuchung|privat|ignorieren|kostenart","kostenart":"nur bei aktion=kostenart, eine aus: ${KOSTENARTEN.join(', ')}","kurz":"die Regel in einem kurzen Satz"}
Hinweise: Bareinzahlungen/Einzahlungen von Bargeld aufs Konto und „Bargeld auf Konto“ in der Kasse sind aktion=umbuchung. Abbuchungen ohne Rechnung, die feste Kosten sind (Kontoführung, Gebühren, Versicherung …), sind aktion=kostenart.`, { tier: 'quick' });
    return { quelle: REGEL_QUELLE[j.quelle] ? j.quelle : 'bank', richtung: REGEL_RICHTUNG[j.richtung] ? j.richtung : 'beide', suche: (j.suche || []).map(String), oder: (j.oder || []).map(String), aktion: REGEL_AKTION[j.aktion] ? j.aktion : 'ignorieren', kostenart: KOSTENARTEN.includes(j.kostenart) ? j.kostenart : null, kurz: j.kurz || '' };
  }
  const t = norm(text);
  return { quelle: /kasse|kassenbuch/.test(t) ? 'kasse' : /sumup|ec-/.test(t) ? 'sumup' : 'bank', richtung: /einzahl|eingang|gutschrift/.test(t) ? 'ein' : /abbuch|ausgang|lastschrift/.test(t) ? 'aus' : 'beide',
    suche: [], oder: [], aktion: /einzahl|bargeld|umbuch/.test(t) ? 'umbuchung' : /privat/.test(t) ? 'privat' : 'ignorieren', kostenart: null, kurz: '' };
}

/* ---------- Oberfläche (Rubrik auf der Problemseite) ---------- */
function regelnHtml() {
  const l = regeln();
  return `<p class="small muted">Schreib einfach in eigenen Worten, was die App wissen soll. Die Regel gilt dann bei jedem Abgleich – für alle im Team.</p>
    <div class="rg-neu"><textarea class="inp" id="rgText" rows="2" placeholder="z. B. „Einzahlungen von Volksbank Köln Bonn sind die Summe der Barzahlungen von Kunden“ oder „Abbuchungen von der Allianz sind Kfz-Versicherung“"></textarea>
      <button class="btn primary" data-act="regelNeu">＋ Als Regel übernehmen</button></div>
    ${l.length ? `<div class="tw"><table class="tb"><thead><tr><th>Regel</th><th>Wo</th><th>Erkennen an</th><th>Dann</th><th class="num">Treffer</th><th></th></tr></thead><tbody>
      ${l.map((g, i) => `<tr><td>${esc(g.kurz || g.text || '')}</td><td class="small">${REGEL_QUELLE[g.quelle]} · ${REGEL_RICHTUNG[g.richtung] || ''}</td>
        <td class="small">${[...(g.suche || []).map(s => '„' + esc(s) + '“'), (g.oder || []).length ? 'eins von: ' + g.oder.map(s => '„' + esc(s) + '“').join(', ') : ''].filter(Boolean).join(' + ')}</td>
        <td class="small">${esc(REGEL_AKTION[g.aktion] || g.aktion)}${g.kostenart ? ': ' + esc(g.kostenart) : ''}</td><td class="num">${regelTreffer(g).length}</td>
        <td><button class="btn sm" data-act="regelEdit" data-i="${i}">Ändern</button> <button class="icon-btn" data-act="regelDel" data-i="${i}" aria-label="Regel löschen">✕</button></td></tr>`).join('')}</tbody></table></div>` : '<p class="muted small">Noch keine Regeln.</p>'}`;
}

function regelForm(g, i) {
  const opt = (o, v) => Object.entries(o).map(([k, l]) => `<option value="${k}" ${k === v ? 'selected' : ''}>${esc(l)}</option>`).join('');
  const d = openSheet({
    title: i == null ? 'Neue Regel prüfen' : 'Regel ändern', okLabel: 'Regel speichern', html: `
    ${g.text ? `<p class="note small">„${esc(g.text)}“</p>` : ''}
    <form class="form2">
      <label class="fld full"><span>Kurzbeschreibung</span><input class="inp" name="kurz" value="${esc(g.kurz || g.text || '')}"></label>
      <label class="fld"><span>Wo</span><select class="inp" name="quelle">${opt(REGEL_QUELLE, g.quelle)}</select></label>
      <label class="fld"><span>Richtung</span><select class="inp" name="richtung">${opt(REGEL_RICHTUNG, g.richtung)}</select></label>
      <label class="fld full"><span>Muss ALLES enthalten (Komma getrennt)</span><input class="inp" name="suche" value="${esc((g.suche || []).join(', '))}" placeholder="z. B. volksbank köln bonn"></label>
      <label class="fld full"><span>…oder EINES davon (Komma getrennt, optional)</span><input class="inp" name="oder" value="${esc((g.oder || []).join(', '))}" placeholder="z. B. bareinzahlung, einzahlung"></label>
      <label class="fld"><span>Dann</span><select class="inp" name="aktion">${opt(REGEL_AKTION, g.aktion)}</select></label>
      <label class="fld"><span>Kostenart (bei „Kosten“)</span><select class="inp" name="kostenart"><option value="">–</option>${KOSTENARTEN.map(k => `<option ${g.kostenart === k ? 'selected' : ''}>${esc(k)}</option>`).join('')}</select></label>
    </form>
    <div id="rgVor" class="small"></div>`,
    onOk: async dd => {
      const neu = rgAusForm(dd, g); if (!(neu.suche.length || neu.oder.length)) { toast('Bitte mindestens einen Suchbegriff eintragen.'); return false; }
      const l = regeln().slice(); if (i == null) l.push(neu); else l[i] = neu;
      await regelnSpeichern(l); const n = await regelnAnwenden(); await autoAbgleich().catch(() => { });
      toast(`Regel gespeichert – ${n} Eintr${n === 1 ? 'ag' : 'äge'} eingeordnet.`); render();
    }
  });
  const vor = () => { const x = rgAusForm(d, g), t = regelTreffer(x);
    $('#rgVor', d).innerHTML = `<b>${t.length}</b> Treffer${t.length ? ':' : ''}<ul class="pays">${t.slice(0, 8).map(y => `<li><span>${fmtD(y.datum)} · ${esc(y.gegenpartei || y.text || y.beschreibung || '')} <small class="muted">${esc((y.zweck || '').slice(0, 80))}</small></span><b>${fmtE(y.betrag)}</b></li>`).join('')}</ul>${t.length > 8 ? `<p class="muted">… und ${t.length - 8} weitere</p>` : ''}`; };
  d.addEventListener('input', vor); d.addEventListener('change', vor); vor();
}
function rgAusForm(d, g) {
  const fd = Object.fromEntries(new FormData($('form', d))), sp = s => String(s || '').split(',').map(x => x.trim()).filter(Boolean);
  return { id: g.id || uid(), text: g.text || fd.kurz, kurz: fd.kurz, quelle: fd.quelle, richtung: fd.richtung, suche: sp(fd.suche), oder: sp(fd.oder), aktion: fd.aktion, kostenart: fd.kostenart || null };
}
