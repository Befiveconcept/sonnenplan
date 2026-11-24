/* Mastercar Finanzen · Datenhaltung: Supabase (online) oder Browser-Speicher (Demo-Modus) */
const TABLES = ['rechnungen', 'bank', 'sumup', 'zuordnungen', 'importe', 'kasse', 'todos', 'hebebuehne', 'avise'];
const S = { rechnungen: [], bank: [], sumup: [], zuordnungen: [], importe: [], kasse: [], todos: [], hebebuehne: [], avise: [], einstellungen: {}, user: null };
// Die Software arbeitet nur mit Daten ab 2026 – Älteres wird beim Import übersprungen und beim Laden ausgeblendet (bleibt in der Datenbank)
const START_DATUM = '2026-01-01';
const MIT_DATUM = ['rechnungen', 'bank', 'sumup', 'kasse', 'hebebuehne', 'avise'];
const VOR_START = /\b(19|20)(?:[01]\d|2[0-5])\b/;   // Jahreszahlen bis 2025
const istAlt = (t, r) => {
  if (!MIT_DATUM.includes(t)) return false;
  if (r.datum && String(r.datum) < START_DATUM) return true;
  // Rechnungen ohne Datum oder Überträge/Nummern aus dem Vorjahr („R25-0708“, „Übertrag aus Ende 2025“)
  if (t === 'rechnungen' && (/^\s*R\s?25\s?[-\/]/i.test(r.nummer || '') || /(übertrag|uebertrag|vortrag|aus)\s.*20[0-2][0-5]/i.test((r.partner || '') + ' ' + (r.beschreibung || '')) || (!r.datum && VOR_START.test(r.nummer || '')))) return true;
  return false;
};
const abStart = (t, r) => !istAlt(t, r);
const CONFLICT = { rechnungen: 'schluessel', bank: 'schluessel', sumup: 'transaktion', kasse: 'schluessel', todos: 'schluessel', hebebuehne: 'schluessel', avise: 'schluessel' };

const DB = (() => {
  const cfg = window.MC_CONFIG || {};
  const cloud = !!(cfg.url && cfg.key) && !/[?&]demo\b/.test(location.search);   // „?demo“ an der Adresse = Demo-Modus zum Ausprobieren
  let sb = null;

  /* ---------- Demo-Modus: localStorage + IndexedDB für Dateien ---------- */
  const LS = 'mastercar-finanzen-v1';
  const local = () => { try { return JSON.parse(localStorage.getItem(LS)) || {}; } catch (e) { return {}; } };
  const saveLocal = () => { try { const o = {}; TABLES.forEach(t => o[t] = S[t]); o.einstellungen = S.einstellungen; localStorage.setItem(LS, JSON.stringify(o)); } catch (e) { toast('Browser-Speicher voll – bitte Supabase einrichten.'); } };
  const idb = () => new Promise((res, rej) => { const r = indexedDB.open('mastercar-belege', 1); r.onupgradeneeded = () => r.result.createObjectStore('f'); r.onsuccess = () => res(r.result); r.onerror = rej; });
  const idbPut = async (k, v) => { const d = await idb(); return new Promise((res, rej) => { const tx = d.transaction('f', 'readwrite'); tx.objectStore('f').put(v, k); tx.oncomplete = res; tx.onerror = rej; }); };
  const idbGet = async k => { const d = await idb(); return new Promise((res, rej) => { const r = d.transaction('f').objectStore('f').get(k); r.onsuccess = () => res(r.result); r.onerror = rej; }); };

  async function init() {
    if (!cloud) { S.user = { email: 'demo@lokal', id: 'demo' }; return S.user; }
    sb = window.supabase.createClient(cfg.url, cfg.key, { auth: { persistSession: true, autoRefreshToken: true } });
    const { data } = await sb.auth.getSession();
    S.user = data.session ? data.session.user : null;
    return S.user;
  }
  async function signIn(email, password) {
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message === 'Invalid login credentials' ? 'E-Mail oder Passwort falsch.' : error.message);
    S.user = data.user; return data.user;
  }
  async function resetPw(email) { const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.href.split('#')[0] }); if (error) throw error; }
  async function setPw(pw) { const { error } = await sb.auth.updateUser({ password: pw }); if (error) throw error; }
  async function signOut() { if (sb) await sb.auth.signOut(); S.user = null; location.reload(); }
  async function isStaff() { if (!cloud) return true; const { data, error } = await sb.rpc('is_staff'); return !error && data === true; }

  async function selectAll(t) {
    const out = []; const step = 1000;
    for (let from = 0; ; from += step) {
      const { data, error } = await sb.from(t).select('*').range(from, from + step - 1);
      if (error) throw error; out.push(...data); if (data.length < step) break;
    }
    return out;
  }
  // „max.mustermann@…“ → „Max Mustermann“ (Rollenadressen wie info@ ergeben keinen Namen)
  function nameAusMail(m) {
    const p = String(m || '').split('@')[0]; if (!p || /^(info|kontakt|office|buero|werkstatt|admin|mail)$/i.test(p)) return '';
    return p.split(/[._-]+/).filter(Boolean).map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
  }
  async function loadAll() {
    if (!cloud) { const o = local(); TABLES.forEach(t => S[t] = (o[t] || []).filter(r => abStart(t, r))); S.einstellungen = o.einstellungen || {}; S.meName = 'Demo'; return; }
    // Tabellen der Erweiterung (02_erweiterung.sql) dürfen noch fehlen – dann leer und Hinweis
    const res = await Promise.all(TABLES.map(t => selectAll(t).catch(e => { if (['kasse', 'todos', 'hebebuehne', 'avise'].includes(t)) { S._fehlt = (S._fehlt || []).concat(t); return []; } throw e; })));
    TABLES.forEach((t, i) => S[t] = res[i].filter(r => abStart(t, r)));
    const { data } = await sb.from('einstellungen').select('*');
    S.einstellungen = Object.fromEntries((data || []).map(r => [r.schluessel, r.wert]));
    const { data: tm } = await sb.from('team').select('email,name');
    S.team = tm || [];
    const me = S.team.find(t => (t.email || '').toLowerCase() === (S.user?.email || '').toLowerCase());
    S.meName = me && me.name ? me.name : nameAusMail(S.user?.email);
  }
  const clean = r => { const o = {}; for (const k in r) if (r[k] !== undefined && !k.startsWith('_')) o[k] = r[k] === '' ? null : r[k]; return o; };

  // Einfügen; doppelte (gleicher Schlüssel) werden übersprungen. Gibt die neu angelegten Zeilen zurück.
  async function insert(t, rows) {
    rows = rows.map(clean).filter(r => abStart(t, r)); if (!rows.length) return [];   // vor 2026 wird nichts übernommen
    const key = CONFLICT[t];
    if (!cloud) {
      const have = new Set(key ? S[t].map(r => r[key]).filter(Boolean) : []); const added = [];
      rows.forEach(r => { if (key && r[key] && have.has(r[key])) return; const n = { id: r.id || uid(), created_at: new Date().toISOString(), ...r }; if (key && r[key]) have.add(r[key]); S[t].push(n); added.push(n); });
      saveLocal(); return added;
    }
    const added = [];
    for (let i = 0; i < rows.length; i += 500) {
      const part = rows.slice(i, i + 500);
      const send = p => (key ? sb.from(t).upsert(p, { onConflict: key, ignoreDuplicates: true }) : sb.from(t).insert(p)).select();
      let { data, error } = await send(part);
      // Spalte fehlt in der Datenbank (neueres SQL noch nicht ausgeführt) → ohne diese Spalte speichern und Hinweis merken
      for (let tries = 0; error && tries < 5; tries++) {
        const m = String(error.message || '').match(/find the '([^']+)' column/); if (!m) break;
        S._fehlt = (S._fehlt || []).concat(t + '.' + m[1]);
        part.forEach(r => delete r[m[1]]); ({ data, error } = await send(part));
      }
      if (error) throw error; added.push(...(data || []));
    }
    S[t].push(...added); return added;
  }
  async function update(t, id, patch) {
    patch = clean(patch);
    if (cloud) {
      let { error } = await sb.from(t).update(patch).eq('id', id);
      for (let tries = 0; error && tries < 8; tries++) {   // Spalte fehlt noch (SQL nicht ausgeführt) → ohne sie speichern
        const m = String(error.message || '').match(/find the '([^']+)' column/); if (!m) break;
        S._fehlt = (S._fehlt || []).concat(t + '.' + m[1]); delete patch[m[1]]; if (!Object.keys(patch).length) { error = null; break; }
        ({ error } = await sb.from(t).update(patch).eq('id', id));
      }
      if (error) throw error;
    }
    const r = S[t].find(x => x.id === id); if (r) Object.assign(r, patch);
    if (!cloud) saveLocal();
  }
  async function remove(t, ids) {
    ids = [].concat(ids); if (!ids.length) return;
    if (cloud) for (let i = 0; i < ids.length; i += 200) { const { error } = await sb.from(t).delete().in('id', ids.slice(i, i + 200)); if (error) throw error; }
    const set = new Set(ids); S[t] = S[t].filter(r => !set.has(r.id));
    // abhängige Zuordnungen wie in der Datenbank (on delete cascade) auch im Speicher entfernen
    if (t === 'rechnungen') { S.zuordnungen = S.zuordnungen.filter(z => !set.has(z.rechnung_id)); S.todos.forEach(x => { if (set.has(x.rechnung_id)) x.rechnung_id = null; }); }
    if (t === 'kasse') S.zuordnungen = S.zuordnungen.filter(z => !set.has(z.kasse_id));
    if (t === 'bank') { S.zuordnungen = S.zuordnungen.filter(z => !set.has(z.bank_id)); S.sumup.forEach(s => { if (set.has(s.bank_id)) s.bank_id = null; }); S.avise.forEach(a => { if (set.has(a.bank_id)) a.bank_id = null; }); }
    if (t === 'sumup') S.zuordnungen = S.zuordnungen.filter(z => !set.has(z.sumup_id));
    if (!cloud) saveLocal();
  }
  async function setSetting(k, v) {
    S.einstellungen[k] = v;
    if (cloud) { const { error } = await sb.from('einstellungen').upsert({ schluessel: k, wert: v, updated_at: new Date().toISOString() }); if (error) throw error; }
    else saveLocal();
  }
  async function upload(path, blob) {
    if (!cloud) { await idbPut(path, blob); return path; }
    return nochmal(async () => {
      const { error } = await sb.storage.from('belege').upload(path, blob, { contentType: blob.type || 'application/octet-stream', upsert: true });
      if (error) throw error; return path;
    });
  }
  async function removeFile(path) {
    if (!path) return;
    if (!cloud) { const d = await idb(); return new Promise(res => { const tx = d.transaction('f', 'readwrite'); tx.objectStore('f').delete(path); tx.oncomplete = res; tx.onerror = res; }); }
    const { error } = await sb.storage.from('belege').remove([path]); if (error) throw error;
  }
  async function fileUrl(path) {
    if (!path) return null;
    if (!cloud) { const b = await idbGet(path); return b ? URL.createObjectURL(b) : null; }
    const { data, error } = await sb.storage.from('belege').createSignedUrl(path, 600); if (error) throw error; return data.signedUrl;
  }

  // KI über die Edge Function. files: [{type, data(base64)}]
  const aiOn = cloud;
  // Bei Verbindungsabbruch / Überlastung automatisch bis zu 3 Versuche (2 s, 6 s Pause)
  const nochmal = async (f, versuche = 3) => {
    for (let i = 1; ; i++) {
      try { return await f(); }
      catch (e) { const vorüber = e.code === 'rate_limited' || e.code === 'unavailable' || e.code === 'overloaded' || /fetch|network|timeout|load failed|5\d\d/i.test(String(e.message || e));
        if (!vorüber || i >= versuche) throw e; await new Promise(r => setTimeout(r, i === 1 ? 2000 : 6000)); }
    }
  };
  async function ai(prompt, { files = [], tier = 'default' } = {}) {
    if (!aiOn) throw Object.assign(new Error('KI nur online verfügbar'), { code: 'offline' });
    const messages = [{ role: 'user', content: prompt }];
    return nochmal(async () => {
      const { data, error } = await sb.functions.invoke(cfg.aiFunction || 'claude', { body: { messages, tier, files } });
      if (error) {
        // Den eigentlichen Grund aus der Antwort der Edge Function lesen (sonst bleibt nur „non-2xx status code“)
        const ctx = error.context, st = ctx && ctx.status; let b = null;
        try { if (ctx && typeof ctx.json === 'function') b = await (ctx.bodyUsed ? null : ctx.json()); } catch (x) { }
        const det = String((b && (b.detail || b.message)) || '');
        let code = (b && b.error) || (st === 429 ? 'rate_limited' : st === 403 ? 'not_allowed' : st === 401 ? 'not_signed_in' : st === 413 ? 'too_large' : st === 504 || st === 546 ? 'timeout' : 'unavailable');
        if (/credit balance|billing|purchase credits|spend limit|usage limit/i.test(det)) code = 'credit';
        else if (b && (b.status === 529 || b.status === 503) || /overloaded/i.test(det)) code = 'overloaded';
        else if (/too large|too long|exceeds|maximum/i.test(det) && /pdf|page|size|byte|token|prompt/i.test(det)) code = 'too_large';
        console.warn('KI-Fehler', st, b || error.message);
        throw Object.assign(new Error(det || error.message), { code, detail: det, status: (b && b.status) || st });
      }
      if (data && data.error) throw Object.assign(new Error(data.error), { code: data.error });
      return String(data && data.text || '');
    });
  }
  async function aiJson(prompt, opts) {
    const t = (await ai(prompt, opts)).replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
    const a = t.indexOf('{'), b = t.indexOf('[');
    const s = a >= 0 && (b < 0 || a < b) ? t.slice(a, t.lastIndexOf('}') + 1) : t.slice(b, t.lastIndexOf(']') + 1);
    try { return JSON.parse(s); } catch (e) { throw Object.assign(new Error('Antwort war kein JSON'), { code: 'bad_json' }); }
  }
  // Demo: alles löschen
  function resetLocal() { if (!cloud) { localStorage.removeItem(LS); TABLES.forEach(t => S[t] = []); S.einstellungen = {}; } }

  return { cloud, aiOn, init, signIn, signOut, resetPw, setPw, isStaff, loadAll, insert, update, remove, setSetting, upload, fileUrl, removeFile, ai, aiJson, resetLocal, saveLocal, get sb() { return sb; } };
})();

const AI_ERR = { offline: 'Die KI ist nur in der Online-Version (mit Supabase) verfügbar.', rate_limited: 'Die KI ist gerade ausgelastet – bitte gleich nochmal.', not_allowed: 'Kein Zugriff auf die KI (E-Mail nicht im Team?).', not_signed_in: 'Bitte neu anmelden.', bad_json: 'Die KI-Antwort war unvollständig – bitte nochmal versuchen.', refused: 'Die KI hat die Anfrage abgelehnt.', api_key_invalid: 'Anthropic-API-Schlüssel in Supabase fehlt oder ist ungültig.',
  credit: 'Das Guthaben beim KI-Anbieter (Anthropic) ist aufgebraucht oder das Monatslimit erreicht – bitte in der Anthropic Console unter „Billing“ aufladen bzw. das Limit erhöhen, dann den Stapel erneut verarbeiten.',
  overloaded: 'Die KI ist gerade überlastet (Störung bei Anthropic) – in ein paar Minuten nochmal versuchen.',
  too_large: 'Die Datei ist zu groß für die KI (max. ca. 30 MB bzw. 100 Seiten) – bitte verkleinern oder aufteilen.',
  timeout: 'Die KI hat für diese Datei zu lange gebraucht (Zeitlimit) – bitte nochmal, notfalls die Datei einzeln hochladen.' };
const aiErr = e => {
  if (AI_ERR[e && e.code]) return AI_ERR[e.code];
  const d = e && e.detail ? ': ' + String(e.detail).slice(0, 180) : e && e.status ? ' (Fehler ' + e.status + ')' : '';
  if (e && (e.code === 'bad_request' || e.code === 'api_error')) return 'Die KI hat die Anfrage nicht angenommen' + d + '.';
  return 'Die KI ist gerade nicht erreichbar' + d + '.';
};
