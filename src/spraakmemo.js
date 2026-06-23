// ══════════════════════════════════════
//  SPRAAKMEMO — recorder + player + upload + render (per taak)
//  Audio in Drive via het Apps Script "memo-loket"; metadata in D.memos.
// ══════════════════════════════════════
import { esc, displayName } from "./util.js";
import { state, D } from "./state.js";
import { MEMO_MAX_SEC, LIST_ID_COL, LIST_SHEET } from "./config.js";
import { callMemoLoket, writeRange, assertRowMatch } from "./api.js";
import { ensureToken } from "./auth.js";
import { showToast, getCurrentWho } from "./notifications.js";

// ── Identiteit ──────────────────────────────────────────────────────────
// 4 willekeurige base36-tekens (0-9a-z).
function _rand4(){
  let s='';
  for(let i=0;i<4;i++) s+=Math.floor(Math.random()*36).toString(36);
  return s;
}
// Stabiel, kort item-ID: "IT-<base36 tijd>-<4 random>". Bewust andere prefix dan
// een memo-ID ("M-…", server-side) zodat ze nooit verwisseld worden.
function genItemId(){ return 'IT-'+Date.now().toString(36)+'-'+_rand4(); }

// Kolomletter (A, B, … Z, AA…) uit een 0-based index.
function _colLetter(idx){
  let s='';
  for(idx=idx|0; idx>=0; idx=Math.floor(idx/26)-1){ s=String.fromCharCode(65+(idx%26))+s; }
  return s;
}
// A1-range van de verborgen ID-cel van één rij. Escapet apostrofs in de
// tabbladnaam (bv. "ALV's overzicht" → 'ALV''s overzicht'!G3), net als _a1ColA.
function idCellA1(list, row){
  const sheet=(LIST_SHEET[list]||'').replace(/'/g,"''");
  const col=_colLetter(LIST_ID_COL[list]);
  return `'${sheet}'!${col}${row}`;
}

// Kolom-A-sleutel van een item (voor assertRowMatch): ONTW heeft de titel in
// kolom A, de overige lijsten de VvE-code.
function _itemKeyColA(item, list){
  return list==='ONTW' ? (item.titel||'') : (item.code||'');
}

// Zorgt dat een item een stabiel verborgen ID heeft. Lazy: bestaand ID wordt
// hergebruikt; anders genereren, in de ID-cel schrijven (met assertRowMatch-
// bescherming tegen verschoven rijen) en lokaal op het item zetten. Retourneert
// het ID. Gooit door bij schrijffout/rij-mismatch zodat de aanroeper kan stoppen.
async function ensureItemId(item, list){
  if(item && item.itemId) return item.itemId;
  if(!item || !item._row) throw new Error('Item zonder rij — kan geen ID toekennen');
  if(!await ensureToken()) throw new Error('Niet ingelogd');
  const id=genItemId();
  await assertRowMatch(item._row, _itemKeyColA(item, list), LIST_SHEET[list]);
  await writeRange(idCellA1(list, item._row), [id]);
  item.itemId=id;
  return id;
}

// ── Retentie-spiegel ──────────────────────────────────────────────────────
// Spiegel van cd_cleanupMemos-selectie (Apps Script, Taak 15). Pure helper zodat de
// 30-dagen-grens in de browser-harness getest kan worden; de .gs gebruikt exact dezelfde
// rekenregel. tsIso = ISO-string (kol A), dagen = MEMO_RETENTIE_DAGEN, nuMs = referentie-tijd
// (Date.now()). Verlopen = leeftijd STRIKT groter dan de retentie (gelijk op de grens blijft staan).
function memoIsVerlopen(tsIso, dagen, nuMs){
  const t=Date.parse(tsIso);
  if(isNaN(t)) return false;               // lege/onleesbare datum → overslaan (niet weggooien)
  return (nuMs - t) > dagen * 86400000;
}

// ── Metadata-parsing ────────────────────────────────────────────────────
// Leest tab "Spraakmemo's" (kol A..L). Slaat de koprij over, negeert
// VERWIJDERD-rijen en rijen zonder list/itemId, en groepeert per `${list}|${itemId}`
// met de nieuwste memo eerst. Retourneert een object (sleutel → array memo-objs).
function parseMemos(rows){
  const out={};
  if(!rows||rows.length<2) return out;
  for(let i=1;i<rows.length;i++){
    const r=rows[i]||[];
    const status=((r[11]||'')+'').trim().toUpperCase();
    if(status==='VERWIJDERD') continue;
    const itemId=((r[5]||'')+'').trim();
    const list=((r[2]||'')+'').trim();
    if(!itemId || !list) continue;
    const memo={
      memoId:((r[1]||'')+'').trim(), list, code:((r[3]||'')+'').trim(),
      sectie:((r[4]||'')+'').trim(), itemId, snapshot:((r[6]||'')+'').trim(),
      door:((r[7]||'')+'').trim(), fileId:((r[8]||'')+'').trim(),
      duur:parseInt(r[9],10)||0, mime:((r[10]||'')+'').trim(),
      ts:((r[0]||'')+'').trim(), _row:i+1,
    };
    const key=list+'|'+itemId;
    (out[key]||(out[key]=[])).push(memo);
  }
  Object.keys(out).forEach(k=>{ out[k].sort((a,b)=>(b.ts||'').localeCompare(a.ts||'')); });
  return out;
}

// Aantal actieve memo's op een item (0 bij onbekend/leeg).
function memoCount(list, itemId){
  if(!itemId) return 0;
  return ((D.memos||{})[(list||'')+'|'+itemId]||[]).length;
}

// Kies een door MediaRecorder ondersteund audio-mime. iOS Safari heeft geen webm → mp4/aac.
// De gekozen MIME wordt mee-opgeslagen (kol K) zodat afspelen het juiste type gebruikt.
function pickMimeType(){
  const MR=window.MediaRecorder;
  if(!MR||typeof MR.isTypeSupported!=='function') return '';
  const kandidaten=['audio/webm;codecs=opus','audio/webm','audio/mp4;codecs=mp4a.40.2','audio/mp4'];
  for(const t of kandidaten){ if(MR.isTypeSupported(t)) return t; }
  return '';
}

// Mic-icoon (inline SVG, DASH_ICONS-stijl) — gedeeld door badge en knoppen.
const MIC_SVG='<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="2.5" width="6" height="11" rx="3" fill="currentColor" fill-opacity="0.18"/><path d="M5.5 11a6.5 6.5 0 0013 0"/><path d="M12 17.5V21M8.5 21h7"/></svg>';

// Teller-badge op een item met memo's. Echte <button> met aria-label; klik → memo-open.
function memoBadgeHtml(list, itemId){
  const n=memoCount(list, itemId);
  if(!n) return '';
  return `<button type="button" class="memo-badge" data-action="memo-open" data-list="${esc(list)}" data-itemid="${esc(itemId)}" title="${n} spraakmemo${n===1?'':"'s"}" aria-label="${n} spraakmemo${n===1?'':"'s"} — open">${MIC_SVG}<span class="memo-badge-n">${n}</span></button>`;
}

// Bouwt de exacte upload-payload voor callMemoLoket('uploadmemo', …). Eén bron zodat de
// sleutels nooit uiteenlopen met het Apps Script-loket. durationSec → hele seconden (kol J).
// snapshot = leesbare itemtekst als vangnet (actiepunt → periode → code), conform §7-kol G.
function buildUploadPayload(item, list, sectie, durationSec, mime, audioB64){
  const snapshot = (item.actiepunt || item.periode || item.code || '').toString();
  return {
    list,
    code: (item.code || '').toString(),
    sectie: sectie || '',
    itemId: (item.itemId || '').toString(),
    snapshot,
    durationSec: Math.round(durationSec || 0),
    mime: mime || '',
    audioB64: audioB64 || '',
  };
}

// Wisselende helptekst onder het afrond-vinkje "Spraakmemo's direct verwijderen".
// uit = nog 30 dagen bewaren (de cleanup-trigger ruimt later op), aan = nu meteen weg.
function memoAfrondHelp(checked){
  return checked
    ? 'Memo’s van deze taak worden direct verwijderd.'
    : 'Memo’s blijven nog 30 dagen bewaard en worden daarna automatisch verwijderd.';
}

// ── Opname ──────────────────────────────────────────────────────────────

// Blob → base64 (zonder data:-prefix), voor de upload-payload.
function _blobNaarB64(blob){
  return new Promise((resolve,reject)=>{
    const fr=new FileReader();
    fr.onerror=()=>reject(new Error('Kon audio niet lezen'));
    fr.onload=()=>{ const s=(''+fr.result); const i=s.indexOf(','); resolve(i>=0?s.slice(i+1):s); };
    fr.readAsDataURL(blob);
  });
}

// Opname-paneel bij een item: mic-knop + lopende teller + stoppen&versturen.
// Stopt automatisch op MEMO_MAX_SEC. Op stop → upload via het memo-loket.
async function openMemoRecorder(item, list, anchorEl){
  document.querySelector('.memo-recorder')?.remove();
  let stream;
  try{ stream=await navigator.mediaDevices.getUserMedia({audio:true}); }
  catch(e){ showToast('Microfoon geblokkeerd','Geef toestemming voor de microfoon en probeer opnieuw.','var(--rd)'); return; }
  const mime=pickMimeType();
  let rec;
  try{ rec=mime?new MediaRecorder(stream,{mimeType:mime}):new MediaRecorder(stream); }
  catch(e){ rec=new MediaRecorder(stream); }
  const brokken=[];
  rec.ondataavailable=e=>{ if(e.data&&e.data.size) brokken.push(e.data); };

  const paneel=document.createElement('div');
  paneel.className='memo-recorder';
  paneel.innerHTML=`
    <span class="memo-rec-dot" aria-hidden="true"></span>
    <span class="memo-rec-tijd" role="timer" aria-live="polite">0:00</span>
    <div class="memo-rec-golf"><span></span><span></span><span></span><span></span><span></span></div>
    <button type="button" class="btn btn-pri btn-sm memo-rec-stop">Stoppen &amp; versturen</button>
    <button type="button" class="btn btn-sec btn-sm memo-rec-annuleer" aria-label="Opname annuleren">Annuleren</button>`;
  (anchorEl&&anchorEl.parentNode?anchorEl.parentNode:document.body).insertBefore(paneel, anchorEl?anchorEl.nextSibling:null);

  const tijdEl=paneel.querySelector('.memo-rec-tijd');
  const start=Date.now();
  let duurSec=0, klaar=false;
  const tik=setInterval(()=>{
    duurSec=Math.floor((Date.now()-start)/1000);
    tijdEl.textContent=Math.floor(duurSec/60)+':'+String(duurSec%60).padStart(2,'0');
    if(duurSec>=MEMO_MAX_SEC) stop();
  },250);

  function opruimen(){ clearInterval(tik); stream.getTracks().forEach(t=>t.stop()); paneel.remove(); }

  async function verstuur(blob){
    const itemId=await ensureItemId(item, list);
    const durationSec=Math.max(1, Math.min(MEMO_MAX_SEC, duurSec||1));
    const recMime=(rec.mimeType||mime||blob.type||'audio/webm');
    let audioB64;
    try{ audioB64=await _blobNaarB64(blob); }
    catch(e){ showToast('Opname mislukt', e.message, 'var(--rd)'); return; }
    const who=getCurrentWho()||'?';
    const snapshot=item.actiepunt||item.periode||item.titel||item.code||'';
    const optim={ memoId:'M-pending-'+Date.now().toString(36), list, code:item.code||'',
      sectie:item._sec||'', itemId, snapshot, door:who, fileId:'', duur:durationSec,
      mime:recMime, ts:new Date().toISOString(), _row:0, _pending:true };
    D.memos=D.memos||{};
    (D.memos[list+'|'+itemId]=D.memos[list+'|'+itemId]||[]).unshift(optim);
    _herrenderMemoUI(list, itemId);
    try{
      const res=await callMemoLoket('uploadmemo', buildUploadPayload(
        Object.assign({}, item, {itemId}), list, item._sec||'', durationSec, recMime, audioB64));
      optim.memoId=res.memoId||optim.memoId; optim.fileId=res.fileId||optim.fileId;
      optim.ts=res.timestamp||optim.ts; optim._pending=false;
      showToast('Memo verstuurd', (item.code||'')+' · '+durationSec+'s', 'var(--ac)');
    }catch(e){
      const arr=D.memos[list+'|'+itemId]||[];
      const i=arr.indexOf(optim); if(i>-1) arr.splice(i,1);
      showToast('Niet verzonden', 'Probeer opnieuw — '+(e.message||''), 'var(--rd)');
    }
    _herrenderMemoUI(list, itemId);
  }

  function stop(){
    if(klaar) return; klaar=true;
    rec.onstop=async ()=>{
      const blob=new Blob(brokken,{type:(rec.mimeType||mime||'audio/webm')});
      opruimen();
      if(blob.size) await verstuur(blob);
    };
    try{ rec.stop(); }catch(e){ opruimen(); }
  }

  paneel.querySelector('.memo-rec-stop').onclick=stop;
  paneel.querySelector('.memo-rec-annuleer').onclick=()=>{ klaar=true; try{rec.stop();}catch(e){} opruimen(); };
  rec.start();
}

// Hertekent de open memo-lijst-container van dit item (indien zichtbaar) na een mutatie.
function _herrenderMemoUI(list, itemId){
  document.querySelectorAll(`.memo-sectie[data-list="${list}"][data-itemid="${itemId}"]`).forEach(c=>{
    renderMemoList(c, c._memoItem||{itemId, code:c.dataset.code, _sec:c.dataset.sec}, list);
  });
}

// ── Afspelen ─────────────────────────────────────────────────────────────

const _memoUrlCache=new Map();
let _huidigeAudio=null, _huidigeBtn=null;

function _b64NaarBlob(b64, mime){
  const bin=atob(b64), len=bin.length, bytes=new Uint8Array(len);
  for(let i=0;i<len;i++) bytes[i]=bin.charCodeAt(i);
  return new Blob([bytes],{type:mime||'audio/webm'});
}
const MEMO_PLAY_SVG='<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';
const MEMO_PAUSE_SVG='<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M7 5h3v14H7zM14 5h3v14h-3z"/></svg>';
function _zetSpeelIcoon(btnEl, spelend){
  btnEl.classList.toggle('memo-speelt', spelend);
  btnEl.setAttribute('aria-label', spelend?'Pauzeer':'Speel af');
  btnEl.innerHTML=spelend?MEMO_PAUSE_SVG:MEMO_PLAY_SVG;
}

// Speelt/pauzeert een memo. Eerste keer: getmemo → Blob → object-URL (gecachet).
async function playMemo(memoId, btnEl){
  if(_huidigeAudio && _huidigeBtn && _huidigeBtn!==btnEl){ _huidigeAudio.pause(); _zetSpeelIcoon(_huidigeBtn,false); }
  if(btnEl._audio && !btnEl._audio.paused){ btnEl._audio.pause(); _zetSpeelIcoon(btnEl,false); return; }
  if(btnEl._audio && btnEl._audio.paused && btnEl._audio.currentTime>0){
    btnEl._audio.play(); _zetSpeelIcoon(btnEl,true); _huidigeAudio=btnEl._audio; _huidigeBtn=btnEl; return;
  }
  const oudHtml=btnEl.innerHTML;
  btnEl.disabled=true; btnEl.innerHTML='…';
  try{
    let url=_memoUrlCache.get(memoId);
    if(!url){
      const res=await callMemoLoket('getmemo',{memoId});
      url=URL.createObjectURL(_b64NaarBlob(res.audioB64, res.mime));
      _memoUrlCache.set(memoId, url);
    }
    const audio=new Audio(url);
    btnEl._audio=audio;
    const bar=btnEl.closest('.memo-item')?.querySelector('.memo-prog-fill');
    audio.ontimeupdate=()=>{ if(bar&&audio.duration) bar.style.width=(audio.currentTime/audio.duration*100)+'%'; };
    audio.onended=()=>{ _zetSpeelIcoon(btnEl,false); if(bar) bar.style.width='0%'; };
    btnEl.disabled=false; btnEl.innerHTML=oudHtml;
    audio.play(); _zetSpeelIcoon(btnEl,true);
    _huidigeAudio=audio; _huidigeBtn=btnEl;
  }catch(e){
    btnEl.disabled=false; btnEl.innerHTML=oudHtml;
    showToast('Afspelen mislukt', e.message||'Loket onbereikbaar', 'var(--rd)');
  }
}

// ── Lijst-render + sectie open/dicht + verwijderen + item-opruiming ──────

const _MEMO_AVKLEUR={Jer:'var(--ac)',Cihad:'var(--pu)',Gabos:'var(--pk)',Cihan:'var(--am)'};
function _memoDatum(iso){
  const d=new Date(iso);
  if(isNaN(d)) return '';
  return d.toLocaleDateString('nl-NL',{day:'numeric',month:'short'})+', '+d.toLocaleTimeString('nl-NL',{hour:'2-digit',minute:'2-digit'});
}
function _duurLbl(sec){ return Math.floor(sec/60)+':'+String(sec%60).padStart(2,'0'); }

// Rendert de memo-lijst (nieuwste boven) + "Memo inspreken" in `container`.
function renderMemoList(container, item, list){
  if(!container) return;
  const itemId=item.itemId||'';
  container._memoItem=item;
  container.classList.add('memo-sectie');
  container.dataset.list=list; container.dataset.itemid=itemId;
  container.dataset.code=item.code||''; container.dataset.sec=item._sec||'';
  const memos=itemId?((D.memos||{})[list+'|'+itemId]||[]):[];
  const rij=m=>{
    const naam=esc(displayName(m.door)||m.door||'?');
    const init=(naam||'?').charAt(0).toUpperCase();
    const kleur=_MEMO_AVKLEUR[displayName(m.door)]||'var(--nv)';
    const pend=m._pending?' memo-item-pending':'';
    const delBtn=m._pending?'' :`<button type="button" class="memo-del" data-action="memo-verwijderen" data-memoid="${esc(m.memoId)}" data-list="${esc(list)}" data-itemid="${esc(itemId)}" title="Verwijderen" aria-label="Memo verwijderen"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2M6 7l1 13a1 1 0 001 1h8a1 1 0 001-1l1-13"/></svg></button>`;
    return `<div class="memo-item${pend}" data-memoid="${esc(m.memoId)}">
      <span class="memo-av" style="background:${kleur}">${esc(init)}</span>
      <div class="memo-mid">
        <div class="memo-meta"><b>${naam}</b> <span class="memo-dt">${esc(_memoDatum(m.ts))}</span></div>
        <div class="memo-speler">
          <button type="button" class="memo-play" data-action="memo-afspelen" data-memoid="${esc(m.memoId)}" aria-label="Speel af"${m._pending?' disabled':''}>${MEMO_PLAY_SVG}</button>
          <div class="memo-prog"><div class="memo-prog-fill"></div></div>
          <span class="memo-duur">${esc(_duurLbl(m.duur||0))}</span>
        </div>
      </div>
      ${delBtn}
    </div>`;
  };
  const lijst=memos.length?memos.map(rij).join(''):'<div class="memo-leeg">Nog geen spraakmemo\'s op deze taak.</div>';
  container.innerHTML=`
    <div class="memo-lijst">${lijst}</div>
    <button type="button" class="btn btn-sec btn-sm memo-inspreken" data-action="memo-inspreken" data-list="${esc(list)}" data-itemid="${esc(itemId)}">${MIC_SVG} Memo inspreken</button>`;
}

// Klik op de badge: open/sluit een memo-sectie net ná de itemrij/-knop.
function toggleMemoSectie(list, itemId, anchorEl){
  const bestaand=document.querySelector(`.memo-sectie[data-list="${list}"][data-itemid="${itemId}"]`);
  if(bestaand){ bestaand.closest('.memo-tr')?.remove(); if(bestaand.parentNode) bestaand.remove(); return; }
  let item=null;
  const tr=anchorEl.closest('tr[data-row]');
  if(tr){ item=(state._rowCache||[]).find(r=>r&&r.itemId===itemId)||null; }
  if(!item) item={ itemId, code:anchorEl.dataset.code||'', _sec:anchorEl.dataset.sec||'' };
  const sectie=document.createElement('div');
  if(tr){
    const nieuweTr=document.createElement('tr');
    nieuweTr.className='memo-tr';
    const td=document.createElement('td');
    td.colSpan=tr.children.length; td.appendChild(sectie);
    nieuweTr.appendChild(td);
    tr.parentNode.insertBefore(nieuweTr, tr.nextSibling);
  } else {
    anchorEl.parentNode.insertBefore(sectie, anchorEl.nextSibling);
  }
  renderMemoList(sectie, item, list);
}

// Verwijder één memo (verwijderknop in de lijst). Optimistisch + server.
async function verwijderMemo(memoId, list, itemId){
  if(!confirm('Deze spraakmemo verwijderen?')) return;
  const arr=(D.memos||{})[list+'|'+itemId]||[];
  const i=arr.findIndex(m=>m.memoId===memoId);
  const verwijderd=i>-1?arr.splice(i,1)[0]:null;
  _memoUrlCache.delete(memoId);
  _herrenderMemoUI(list, itemId);
  try{ await callMemoLoket('deletememo',{memoId}); showToast('Memo verwijderd','', 'var(--ac)'); }
  catch(e){ if(verwijderd){ arr.splice(Math.min(i,arr.length),0,verwijderd); _herrenderMemoUI(list, itemId); } showToast('Verwijderen mislukt', e.message||'', 'var(--rd)'); }
}

// Verwijder alle memo's van één item (afrond-vink "direct verwijderen"). Aangeroepen door crud.js.
async function deleteItemMemos(list, itemId){
  if(!itemId) return;
  try{ await callMemoLoket('deleteitemmemos',{list, itemId}); }
  catch(e){ showToast('Memo-opruiming mislukt', e.message||'', 'var(--rd)'); }
  if(D.memos) delete D.memos[list+'|'+itemId];
}

export { genItemId, idCellA1, ensureItemId, parseMemos, memoCount, pickMimeType, memoBadgeHtml, MIC_SVG, buildUploadPayload, memoAfrondHelp, memoIsVerlopen, openMemoRecorder, playMemo, renderMemoList, toggleMemoSectie, verwijderMemo, deleteItemMemos, _herrenderMemoUI };
