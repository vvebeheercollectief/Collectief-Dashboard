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

export { genItemId, idCellA1, ensureItemId, memoIsVerlopen, parseMemos, memoCount, pickMimeType, memoBadgeHtml, MIC_SVG, buildUploadPayload, memoAfrondHelp };
