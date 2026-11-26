/* Mastercar Finanzen · E-Mails (.eml / Outlook .msg) lesen – übernommen aus dem Sonnenplan (nutz die Sonne) */
const latin1=buf=>new TextDecoder('latin1').decode(buf);
function decodeWords(s){ return String(s||'').replace(/=\?([^?]+)\?([BQ])\?([^?]*)\?=/gi,(m,cs,enc,txt)=>{ try{ let bytes; if(enc.toUpperCase()==='B'){ bytes=Uint8Array.from(atob(txt),c=>c.charCodeAt(0)); } else { const q=txt.replace(/_/g,' ').replace(/=([0-9A-F]{2})/gi,(x,h)=>String.fromCharCode(parseInt(h,16))); bytes=Uint8Array.from(q,c=>c.charCodeAt(0)); } return new TextDecoder(cs).decode(bytes); }catch(e){ return txt; } }).replace(/\s+/g,' ').trim(); }
function parseHeaders(h){ const o={}; h.replace(/\r?\n[ \t]+/g,' ').split(/\r?\n/).forEach(l=>{ const i=l.indexOf(':'); if(i>0){ const k=l.slice(0,i).trim().toLowerCase(); if(!(k in o)) o[k]=l.slice(i+1).trim(); } }); return o; }
const hParam=(v,name)=>{ const m=String(v||'').match(new RegExp(name+'\\*?="?([^";]+)"?','i')); return m?decodeWords(m[1]):''; };
function decodeBody(raw,enc){ enc=String(enc||'').toLowerCase();
  if(enc.includes('base64')){ try{ return Uint8Array.from(atob(raw.replace(/[^A-Za-z0-9+/=]/g,'')),c=>c.charCodeAt(0)); }catch(e){ return new Uint8Array(); } }
  const s=enc.includes('quoted')?raw.replace(/=\r?\n/g,'').replace(/=([0-9A-F]{2})/gi,(x,h)=>String.fromCharCode(parseInt(h,16))):raw;
  return Uint8Array.from(s,c=>c.charCodeAt(0)&255); }
function parseMime(str,out){
  const sep=str.search(/\r?\n\r?\n/); const head=parseHeaders(sep<0?str:str.slice(0,sep)); const body=sep<0?'':str.slice(sep).replace(/^\r?\n\r?\n/,'');
  const ct=head['content-type']||'text/plain', type=ct.split(';')[0].trim().toLowerCase();
  if(type.startsWith('multipart/')){ const b=hParam(ct,'boundary'); if(b) body.split('--'+b).slice(1).forEach(part=>{ if(!part.startsWith('--')) parseMime(part.replace(/^\r?\n/,''),out); }); return head; }
  const name=hParam(head['content-disposition'],'filename')||hParam(ct,'name');
  const bytes=decodeBody(body,head['content-transfer-encoding']);
  if(name||/attachment/i.test(head['content-disposition']||'')||!type.startsWith('text/')){ if(bytes.length) out.att.push({name:name||'Anhang',type,blob:new Blob([bytes],{type})}); }
  else { let t=''; try{ t=new TextDecoder(hParam(ct,'charset')||'utf-8').decode(bytes); }catch(e){ t=latin1(bytes); }
    if(type==='text/html'){ t=t.replace(/<style[\s\S]*?<\/style>/gi,'').replace(/<br\s*\/?>|<\/p>|<\/div>|<\/tr>/gi,'\n').replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/[ \t]+/g,' ').replace(/\n\s*\n+/g,'\n'); out.html.push(t); } else out.text.push(t); }
  return head;
}
function parseEml(buf){ const out={text:[],html:[],att:[]}; const head=parseMime(latin1(buf),out);
  return {subject:decodeWords(head.subject),from:decodeWords(head.from),date:head.date||'',text:(out.text.join('\n')||out.html.join('\n')).trim(),att:out.att}; }
// Outlook .msg ist eine OLE-Verbunddatei: Streams lesen, Text-/HTML-/RTF-Body und Anhänge holen
function cfbRead(buf){
  const u8=new Uint8Array(buf), dv=new DataView(buf);
  if(u8.length<512||dv.getUint32(0,true)!==0xE011CFD0) return null;
  const ss=1<<dv.getUint16(30,true), mss=1<<dv.getUint16(32,true), dirStart=dv.getInt32(48,true), miniCut=dv.getUint32(56,true), miniFatStart=dv.getInt32(60,true), difStart=dv.getInt32(68,true);
  const sec=n=>512+n*ss, fatSecs=[];
  for(let i=0;i<109;i++){ const v=dv.getInt32(76+i*4,true); if(v>=0) fatSecs.push(v); }
  let d=difStart, guard=0; while(d>=0&&d<0xFFFFFFFA&&guard++<1000){ const o=sec(d); for(let i=0;i<ss/4-1;i++){ const v=dv.getInt32(o+i*4,true); if(v>=0) fatSecs.push(v); } d=dv.getInt32(o+ss-4,true); }
  const fat=[]; fatSecs.forEach(s=>{ const o=sec(s); for(let i=0;i<ss/4;i++) fat.push(dv.getInt32(o+i*4,true)); });
  const chain=(s,tbl)=>{ const out=[]; let g=0; while(s>=0&&g++<200000){ out.push(s); s=tbl[s]; } return out; };
  const readBig=(s,size)=>{ const out=new Uint8Array(size); let p=0; for(const c of chain(s,fat)){ const o=sec(c), n=Math.min(ss,size-p); if(n<=0) break; out.set(u8.subarray(o,o+n),p); p+=n; } return out; };
  const dirBytes=readBig(dirStart,chain(dirStart,fat).length*ss), dd=new DataView(dirBytes.buffer), ents=[];
  for(let o=0;o+128<=dirBytes.length;o+=128){ const nl=dd.getUint16(o+64,true); ents.push({name:new TextDecoder('utf-16le').decode(dirBytes.subarray(o,o+Math.max(0,nl-2))),type:dirBytes[o+66],l:dd.getInt32(o+68,true),r:dd.getInt32(o+72,true),c:dd.getInt32(o+76,true),start:dd.getInt32(o+116,true),size:dd.getUint32(o+120,true)}); }
  const root=ents[0]; const miniStream=root?readBig(root.start,root.size):new Uint8Array();
  const miniFat=[]; if(miniFatStart>=0) chain(miniFatStart,fat).forEach(s=>{ const o=sec(s); for(let i=0;i<ss/4;i++) miniFat.push(dv.getInt32(o+i*4,true)); });
  const readMini=(s,size)=>{ const out=new Uint8Array(size); let p=0; for(const c of chain(s,miniFat)){ const n=Math.min(mss,size-p); if(n<=0) break; out.set(miniStream.subarray(c*mss,c*mss+n),p); p+=n; } return out; };
  const data=e=>e.size<miniCut?readMini(e.start,e.size):readBig(e.start,e.size);
  const kids=i=>{ const out=[]; const walk=j=>{ if(j<0||j>=ents.length||out.length>5000) return; walk(ents[j].l); out.push(j); walk(ents[j].r); }; walk(ents[i].c); return out.map(j=>({...ents[j],idx:j})); };
  return {kids,data};
}
// Komprimiertes RTF (PR_RTF_COMPRESSED, „LZFu“) entpacken
function lzfu(b){
  const dv=new DataView(b.buffer,b.byteOffset,b.byteLength); const raw=dv.getUint32(4,true), magic=dv.getUint32(8,true);
  if(magic===0x414C454D) return b.subarray(16,16+raw);
  const pre='{\\rtf1\\ansi\\mac\\deff0\\deftab720{\\fonttbl;}{\\f0\\fnil \\froman \\fswiss \\fmodern \\fscript \\fdecor MS Sans SerifSymbolArialTimes New RomanCourier{\\colortbl\\red0\\green0\\blue0\r\n\\par \\pard\\plain\\f0\\fs20\\b\\i\\u\\tab\\tx';
  const dict=new Uint8Array(4096); for(let i=0;i<pre.length;i++) dict[i]=pre.charCodeAt(i);
  let w=pre.length, p=16; const out=[];
  while(p<b.length){ const ctl=b[p++];
    for(let bit=0;bit<8&&p<b.length;bit++){
      if(ctl&(1<<bit)){ const v=(b[p]<<8)|b[p+1]; p+=2; const off=v>>4, len=(v&15)+2; if(off===w) return new Uint8Array(out);
        for(let k=0;k<len;k++){ const c=dict[(off+k)&4095]; out.push(c); dict[w]=c; w=(w+1)&4095; } }
      else { const c=b[p++]; out.push(c); dict[w]=c; w=(w+1)&4095; } } }
  return new Uint8Array(out);
}
// RTF → Text; bei aus HTML erzeugtem RTF (\fromhtml) das eingebettete HTML zurückgeben
function rtfText(rtf){
  const s=latin1(rtf), html=/\\fromhtml/.test(s.slice(0,400)); const cp=new TextDecoder('windows-1252');
  const SKIP=/^(fonttbl|colortbl|stylesheet|info|pict|object|themedata|colorschememapping|latentstyles|datastore|xmlnsdecl|generator|listtable|listoverridetable|rsidtbl|mmathPr|header|footer|footnote)$/;
  let out='', i=0, uc=1, skipN=0; const st=[{skip:false,htmlrtf:false,tag:false}]; let cur=st[0];
  const emit=t=>{ if(skipN>0){ skipN-=t.length; return; } if(cur.skip) return; if(html&&cur.htmlrtf&&!cur.tag) return; out+=t; };
  while(i<s.length){ const ch=s[i];
    if(ch==='{'){ st.push(cur={...cur}); i++; if(s.startsWith('\\*',i)){ const m=/^\\\*\\([a-z]+)(-?\d+)?/.exec(s.slice(i,i+40)); if(m&&m[1]==='htmltag'){ cur.tag=true; } else cur.skip=true; } continue; }
    if(ch==='}'){ st.pop(); cur=st[st.length-1]||{skip:false}; i++; continue; }
    if(ch==='\\'){ const nx=s[i+1];
      if(nx==='\''){ emit(cp.decode(new Uint8Array([parseInt(s.substr(i+2,2),16)]))); i+=4; continue; }
      if(nx==='\\'||nx==='{'||nx==='}'){ emit(nx); i+=2; continue; }
      if(nx==='~'){ emit(' '); i+=2; continue; }
      if(nx==='\n'||nx==='\r'){ emit('\n'); i+=2; continue; }
      const m=/^\\([a-zA-Z]+)(-?\d+)? ?/.exec(s.slice(i,i+40)); if(!m){ i+=2; continue; } i+=m[0].length;
      const w=m[1], n=m[2]!=null?+m[2]:null;
      if(SKIP.test(w)){ cur.skip=true; continue; }
      if(w==='htmlrtf'){ cur.htmlrtf=n!==0; continue; }
      if(w==='htmltag'){ cur.tag=true; continue; }
      if(w==='uc'){ uc=n||0; continue; }
      if(w==='u'){ emit(String.fromCharCode(n<0?n+65536:n)); skipN=uc; continue; }
      if(w==='par'||w==='line'||w==='row') emit('\n'); else if(w==='tab'||w==='cell') emit('\t'); else if(w==='emdash') emit('—'); else if(w==='endash') emit('–'); else if(w==='bullet') emit('•'); else if(w==='lquote'||w==='rquote') emit('\''); else if(w==='ldblquote'||w==='rdblquote') emit('"');
      continue; }
    if(ch==='\r'||ch==='\n'){ i++; continue; }
    emit(ch); i++; }
  return {text:out,html};
}
const htmlToText=t=>t.replace(/<(style|script|head)[\s\S]*?<\/\1>/gi,'').replace(/<br\s*\/?>|<\/p>|<\/div>|<\/tr>|<\/li>|<\/h\d>/gi,'\n').replace(/<\/t[dh]>/gi,'\t').replace(/<[^>]+>/g,' ')
  .replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&euro;/g,'€').replace(/&#(\d+);/g,(m,n)=>String.fromCharCode(+n))
  .replace(/[ \t]*\t[ \t]*/g,'\t').replace(/[ ]{2,}/g,' ').replace(/\n[ \t]+/g,'\n').replace(/\n{3,}/g,'\n\n').trim();
// Outlook-Datei am Inhalt erkennen, nicht am Typ: Beim Ziehen direkt aus Outlook meldet der Browser .msg oft als „message/rfc822“
const isOleMsg=buf=>{ const u=new Uint8Array(buf,0,Math.min(8,buf.byteLength)); return u.length>=4&&u[0]===0xD0&&u[1]===0xCF&&u[2]===0x11&&u[3]===0xE0; };
function parseMsg(buf){
  const cf=cfbRead(buf); if(!cf) return null;
  const top=cf.kids(0), get=(list,id)=>{ const e=list.find(x=>x.name.toUpperCase()==='__SUBSTG1.0_'+id); return e?cf.data(e):null; };
  const str=(list,id)=>{ let b=get(list,id+'001F'); if(b) return new TextDecoder('utf-16le').decode(b).replace(/\0+$/,''); b=get(list,id+'001E'); return b?latin1(b).replace(/\0+$/,''):''; };
  let text=str(top,'1000');
  const hb=get(top,'10130102'); if(hb&&hb.length) text=htmlToText(new TextDecoder('utf-8').decode(hb))||text;
  if(!text.trim()){ const r=get(top,'10090102'); if(r&&r.length>16){ try{ const x=rtfText(lzfu(r)); text=x.html?htmlToText(x.text):x.text.trim(); }catch(e){} } }
  const att=[]; top.filter(e=>/^__attach_version1\.0_/i.test(e.name)).forEach(a=>{ const k=cf.kids(a.idx), data=get(k,'37010102'); if(!data) return;
    const name=str(k,'3707')||str(k,'3704')||'Anhang', mime=str(k,'370E')||(/\.pdf$/i.test(name)?'application/pdf':'application/octet-stream');
    att.push({name,type:mime,blob:new Blob([data],{type:mime})}); });
  return {subject:str(top,'0037'),from:[str(top,'0C1A'),str(top,'5D01')||str(top,'0C1F')].filter(Boolean).join(' '),date:'',text:text.slice(0,20000),att};
}
// Fallback, falls die Verbunddatei nicht lesbar ist: Text grob aus UTF-16-Strings, PDF-Anhang über %PDF … %%EOF
function parseMsgLoose(buf){
  const u8=new Uint8Array(buf), s=latin1(u8); let pdf=null;
  const a=s.indexOf('%PDF-'); if(a>=0){ const e=s.lastIndexOf('%%EOF'); if(e>a) pdf=new Blob([u8.slice(a,e+5)],{type:'application/pdf'}); }
  // Zeilenstruktur behalten (Positionen stehen oft je Zeile), Reihenfolge wie in der Mail
  const pick=t=>(t.match(/[A-Za-zÄÖÜäöüßéèàáç0-9 .,;:!?()\[\]\-\/@€%&+'"#*_=\r\n\t°²³|x×]{16,}/g)||[]);
  const even=new TextDecoder('utf-16le').decode(u8.slice(0,u8.length-(u8.length%2))), odd=new TextDecoder('utf-16le').decode(u8.slice(1,u8.length-((u8.length-1)%2)));
  const clean=a=>a.map(x=>x.replace(/[ \t]+/g,' ').replace(/\s*\r?\n\s*/g,'\n').trim()).filter(x=>/[A-Za-zÄÖÜäöü]{3}/.test(x)&&!/^[\s\-_=*.]+$/.test(x)&&(x.match(/[ \n]/g)||[]).length>=2);
  const ra=clean(pick(even)), rb=clean(pick(odd)); const main=ra.join('').length>=rb.join('').length?ra:rb;
  const seen=new Set(), out=[]; main.forEach(x=>{ if(!seen.has(x)){ seen.add(x); out.push(x); } });
  // Lange Body-Blöcke zuerst behalten, dann in Originalreihenfolge ausgeben
  const keep=new Set([...out].sort((x,y)=>y.length-x.length).slice(0,40));
  return {subject:'',from:'',date:'',text:out.filter(x=>keep.has(x)).join('\n').slice(0,15000),pdf};
}

// Eine gezogene Datei in Belege zerlegen: PDF/Bild direkt, Mail → Anhänge (PDF/Bild) + Mailtext
async function fileToBelege(file) {
  const name = file.name || 'Beleg';
  const isMail = /\.(eml|msg)$/i.test(name) || /message\/rfc822|vnd\.ms-outlook/i.test(file.type);
  if (!isMail) return [{ file, name, type: file.type || (/\.pdf$/i.test(name) ? 'application/pdf' : ''), mail: null }];
  const buf = await file.arrayBuffer();
  let m = null;
  try { m = isOleMsg(buf) ? parseMsg(buf) : parseEml(buf); } catch (e) { m = null; }
  if (!m && isOleMsg(buf)) { const l = parseMsgLoose(buf); m = { subject: '', from: '', text: l.text, att: l.pdf ? [{ name: 'Anhang.pdf', type: 'application/pdf', blob: l.pdf }] : [] }; }
  if (!m) return [];
  const mail = { subject: m.subject || '', from: m.from || '', text: String(m.text || '').slice(0, 6000) };
  const att = (m.att || []).filter(a => /pdf|image\/(jpeg|png|webp|gif)/i.test(a.type) || /\.(pdf|jpe?g|png)$/i.test(a.name))
    .filter(a => !(/image/.test(a.type) && a.blob.size < 15000))   // kleine Logos/Signaturbilder weglassen
    .filter(a => !/^image\d{3}\.(png|jpe?g|gif)$/i.test(a.name));   // eingebettete Outlook-Bilder (Signatur, Logo)
  if (!att.length) return [{ file, name, type: 'message/rfc822', mail }];
  return att.map(a => ({ file: new File([a.blob], a.name, { type: /\.pdf$/i.test(a.name) ? 'application/pdf' : a.type }), name: a.name, type: /\.pdf$/i.test(a.name) ? 'application/pdf' : a.type, mail }));
}