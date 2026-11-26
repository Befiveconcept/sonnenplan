/* Mastercar Finanzen · Hilfsfunktionen */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2));
const r2 = n => Math.round((+n || 0) * 100) / 100;
const eq = (a, b, tol = 0.01) => Math.abs(r2(a) - r2(b)) <= tol;

const EUR = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
const fmtE = n => (n == null || n === '' || isNaN(n)) ? '–' : EUR.format(+n);
const fmtN = n => (+n || 0).toLocaleString('de-DE');
const todayISO = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const fmtD = iso => { if (!iso) return '–'; const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}.${m[2]}.${m[1]}` : String(iso); };
const MONATE = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
const monthKey = iso => String(iso || '').slice(0, 7);
const monthLabel = k => { const [y, m] = k.split('-'); return MONATE[+m - 1] + ' ' + y.slice(2); };
const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
// ISO-Kalenderwoche
function isoWeek(iso) { const d = new Date(iso + 'T12:00:00'); const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); const day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day); const y = t.getUTCFullYear(); return { y, w: Math.ceil(((t - Date.UTC(y, 0, 1)) / 864e5 + 1) / 7) }; }
function isoWeekMonday(y, w) { const j4 = new Date(Date.UTC(y, 0, 4)); const day = j4.getUTCDay() || 7; j4.setUTCDate(j4.getUTCDate() - day + 1 + (w - 1) * 7); return j4.toISOString().slice(0, 10); }
const daysBetween =(a, b) => Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 864e5);

// Zahl aus deutschem oder englischem Format: "1.234,56", "-1234,56", "1,234.56", "1234.56 €", "(12,00)"
function parseNum(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return isFinite(v) ? v : null;
  let s = String(v).trim().replace(/\s|€|EUR/gi, '');
  if (!s) return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  if (/-$/.test(s)) { neg = true; s = s.slice(0, -1); }   // "12,50-" (manche Banken)
  if (/^[+-]/.test(s)) { if (s[0] === '-') neg = !neg; s = s.slice(1); }
  const lc = s.lastIndexOf(','), ld = s.lastIndexOf('.');
  if (lc > ld) s = s.replace(/\./g, '').replace(',', '.');           // deutsch
  else if (ld > lc && lc >= 0) s = s.replace(/,/g, '');              // englisch mit Tausender-Komma
  else if (ld >= 0 && lc < 0 && /^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, ''); // "1.234" = Tausender
  const n = parseFloat(s);
  return isNaN(n) ? null : (neg ? -n : n);
}
// Datum aus "19.11.2026", "19.11.26", "2026-11-19", "19/11/2026", Excel-Seriennummer oder Date-Objekt
function parseDate(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date && !isNaN(v)) return new Date(v.getTime() - v.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
  if (typeof v === 'number' && v > 20000 && v < 80000) { const d = new Date(Math.round((v - 25569) * 864e5)); return d.toISOString().slice(0, 10); }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{2,4})/);
  if (m) { let y = +m[3]; if (y < 100) y += 2000; return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; }
  return null;
}
// Zum Vergleichen: Kleinbuchstaben, Umlaute vereinfacht, nur Buchstaben/Ziffern
const norm = s => String(s || '').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, ' ').trim();
const normNr = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const STOP = new Set(['gmbh', 'ug', 'kg', 'ag', 'co', 'und', 'der', 'die', 'das', 'mbh', 'ohg', 'gbr', 'ev', 'e', 'k', 'herr', 'frau', 'firma', 'haftungsbeschraenkt', 'sepa', 'gutschrift', 'ueberweisung', 'lastschrift', 'rechnung', 're', 'nr', 'kunde', 'kd']);
const nameTokens = s => norm(s).split(' ').filter(w => w.length >= 3 && !STOP.has(w) && !/^\d+$/.test(w));

// Kleine Prüfsumme für Duplikat-Schlüssel
function hashStr(s) { let h1 = 0xdeadbeef, h2 = 0x41c6ce57; for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); } h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909); h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909); return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36); }

function toast(msg, ms = 3500) {
  let t = $('#toast'); if (!t) { t = document.createElement('div'); t.id = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
  t.textContent = msg; t.classList.add('on'); clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('on'), ms);
}

// Fenster (Dialog) – html + Knöpfe; onOk bekommt das Dialog-Element
/* Fenster-Verlauf: wird aus einem Fenster heraus ein weiteres geöffnet (Klick auf Rechnung, Zahlung, Bankbuchung …),
   bleibt das alte im Hintergrund erhalten und das neue bekommt „← Zurück“ – genau an die Stelle, wo man war. */
const SHEET_STACK = []; let SHEET_KLICK = 0;
document.addEventListener('click', e => { if (e.target.closest && e.target.closest('#sheet') && !e.target.closest('[data-x],[data-ok],[data-zurueck-sheet]')) SHEET_KLICK = Date.now(); }, true);
function openSheet({ title, html, okLabel = 'Speichern', onOk, wide = false, cancelLabel = 'Abbrechen', noOk = false }) {
  const alt = $('#sheet');
  // aus dem Fenster heraus geöffnet (und nicht nur dasselbe Fenster neu gezeichnet) → merken statt schließen
  if (alt && Date.now() - SHEET_KLICK < 2500 && alt.dataset.title !== title) { alt.removeAttribute('id'); alt.remove(); SHEET_STACK.push(alt); }
  else { $('#sheet')?.remove(); if (!alt) SHEET_STACK.length = 0; }
  SHEET_KLICK = 0;
  const d = document.createElement('div'); d.className = 'sheet-bg'; d.id = 'sheet'; d.dataset.title = title;
  d.innerHTML = `<div class="sheet ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <header>${SHEET_STACK.length ? `<button class="btn sm" data-zurueck-sheet title="Zurück zum vorherigen Fenster">← Zurück</button>` : ''}<h2>${esc(title)}</h2><button class="icon-btn" data-x aria-label="Schließen">✕</button></header>
    <div class="sheet-body">${html}</div>
    <footer>${noOk ? '' : `<button class="btn primary" data-ok>${esc(okLabel)}</button>`}<button class="btn" data-x>${esc(noOk ? 'Schließen' : cancelLabel)}</button></footer></div>`;
  document.body.appendChild(d);
  d.addEventListener('click', e => { if (e.target.closest('[data-zurueck-sheet]')) return sheetZurueck(); if (e.target === d || e.target.closest('[data-x]')) closeSheet(); });
  const ok = d.querySelector('[data-ok]');
  // nach „Speichern“ zurück ins vorherige Fenster (falls aus einem geöffnet), sonst schließen
  if (ok) ok.onclick = async () => { ok.disabled = true; try { const r = await onOk?.(d); if (r !== false) { if ($('#sheet') === d && SHEET_STACK.length) sheetZurueck(); else closeSheet(); } } catch (err) { console.error(err); toast('Fehler: ' + (err.message || err)); } finally { ok.disabled = false; } };
  setTimeout(() => d.querySelector('input:not([type=hidden]),select,textarea')?.focus(), 30);
  return d;
}
function sheetZurueck() {
  $('#sheet')?.remove();
  const p = SHEET_STACK.pop(); if (!p) return;
  p.id = 'sheet'; document.body.appendChild(p);
}
function closeSheet() { $('#sheet')?.remove(); SHEET_STACK.length = 0; }
document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('#sheet')) closeSheet(); });

function busy(on, text) {
  let b = $('#busy'); if (!b) { b = document.createElement('div'); b.id = 'busy'; b.innerHTML = '<div class="wheel"></div><span></span>'; document.body.appendChild(b); }
  b.querySelector('span').textContent = text || ''; b.classList.toggle('on', !!on);
}

const fileToB64 = blob => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.onerror = rej; r.readAsDataURL(blob); });
const download = (name, text, type = 'text/csv;charset=utf-8') => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + text], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); };
const csvRow = arr => arr.map(v => { const s = String(v ?? ''); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(';');
const numDE = n => (n == null || n === '') ? '' : (+n).toFixed(2).replace('.', ',');
