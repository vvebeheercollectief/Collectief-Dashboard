// ══════════════════════════════════════
//  PARSE — Sheet-rijen omzetten naar objecten (puur, zonder DOM of netwerk)
// ══════════════════════════════════════
import { ALLE_SECTIES, SECS, TAKEN_KOP, ALVO_EERSTE_RIJ } from './config.js';
import { leegBijErfenis, naarSheetDatum } from './util.js';

const cel = (rij, i) => ((rij && rij[i] != null ? rij[i] : '') + '').trim();
const isKolomKop = rij => /^vve[- ]code$/i.test(cel(rij,0));

// ── 'Nog Te Doen' en 'Afgerond': blokken ────────────────────────────────
// Loopt het tabblad door en geeft per blok de kopregel (rij met de bloknaam), de kolomkoprij en de
// gevulde rijen terug. Rijnummers zijn 1-gebaseerd, zoals in de Sheet.
export function blokken(rijen){
  const uit={};
  let cur=null;
  for(let i=0;i<(rijen||[]).length;i++){
    const rij=rijen[i]||[];
    if(!rij.length) continue;                       // helemaal lege regel
    const eerste=cel(rij,0), boven=eerste.toUpperCase();
    if(ALLE_SECTIES.includes(boven)){ cur=uit[boven]={ kopRij:i+1, kolomKopRij:null, rijen:[] }; continue; }
    if(!cur) continue;
    // De eerste niet-lege regel na de bloknaam is de kolomkoprij, wat er ook in staat (zo las v15
    // het ook: parseSections met `skip`).
    if(cur.kolomKopRij===null){ cur.kolomKopRij=i+1; continue; }
    if(!eerste || isKolomKop(rij)) continue;
    cur.rijen.push({ row:i+1, waarden:rij });
  }
  return uit;
}
// De rij waarna een nieuwe taak in dit blok hoort: na de laatste gevulde rij, of na de kolomkop.
export function invoegNa(blok){
  if(!blok) return null;
  if(blok.rijen.length) return blok.rijen[blok.rijen.length-1].row;
  return blok.kolomKopRij || blok.kopRij;
}

// Eén dossier (LOD of Subsidie) uit een Sheet-rij.
export function dossierUitRij(sec, row, rij){
  const r={ _sec:sec, _row:row };
  SECS[sec].keys.forEach((k,j)=>{ r[k]=cel(rij,j); });
  r.inBehandeling = cel(rij,7).toUpperCase()==='TRUE';
  r.subcategorie = leegBijErfenis(rij[10]);   // K
  r.herhaalId    = leegBijErfenis(rij[12]);   // M (in 'Nog Te Doen')
  r.taakId       = leegBijErfenis(rij[16]);   // Q
  r.bundelId     = leegBijErfenis(rij[17]);   // R
  r.bundelVolg   = leegBijErfenis(rij[18]);   // S
  r._rest = (rij||[]).slice(8).map(v=>v==null?'':String(v));   // I.. ongewijzigd terugschrijven bij afronden-ongedaan
  return r;
}
export function parseDossiers(rijen){
  const b=blokken(rijen), uit={};
  Object.keys(SECS).forEach(sec=>{
    uit[sec]=((b[sec]&&b[sec].rijen)||[]).map(x=>dossierUitRij(sec, x.row, x.waarden)).filter(r=>r.code);
  });
  return uit;
}
// Wat er in kolom A..H staat, zoals wij het lezen — om te zien of een collega de rij intussen wijzigde.
// De deadline genormaliseerd: na ons eigen opslaan staat er '14-11-2026' in beeld, terwijl de Sheet
// (afhankelijk van de celopmaak) '14 november 2026' teruggeeft. Dat is geen wijziging van een collega.
export const dossierInhoud = (r) => SECS[r._sec].keys.map(k =>
  k==='inBehandeling' ? (r.inBehandeling?'TRUE':'') : k==='deadline' ? (naarSheetDatum(r[k]) || (r[k]||'')) : (r[k]||'')
).join('\x1f');
export const rijInhoud = (sec, rij) => dossierInhoud(dossierUitRij(sec, 0, rij));

// Een dossier terugvinden in vers gelezen rijen: op taaknummer (kolom Q), anders op inhoud.
// Geeft { row, waarden } of null. Bij twee gelijke kandidaten zonder taaknummer: de rij waar hij
// stond, of anders null — liever niets doen dan de verkeerde rij wijzigen.
export function vindDossier(rijen, r){
  const blok=blokken(rijen)[r._sec];
  if(!blok) return null;
  if(r.taakId){
    return blok.rijen.find(x=>leegBijErfenis(x.waarden[16])===r.taakId) || null;
  }
  const inhoud=dossierInhoud(r);
  const kand=blok.rijen.filter(x=>rijInhoud(r._sec, x.waarden)===inhoud);
  if(kand.length===1) return kand[0];
  return kand.find(x=>x.row===r._row) || null;
}

// ── 'Mijn taken' ────────────────────────────────────────────────────────
export function parseTaken(rijen){
  return (rijen||[]).slice(1).map((rij,i)=>({
    id: cel(rij,0), eigenaar: cel(rij,1), taak: cel(rij,2), code: cel(rij,3), vve: cel(rij,4),
    notitie: cel(rij,5), aangemaakt: cel(rij,6), afgevinkt: cel(rij,7), _row: i+2,
  })).filter(t=>t.id && t.taak);
}
export const takenKopKlopt = rij => TAKEN_KOP.every((k,i)=>cel(rij,i).toLowerCase()===k.toLowerCase());
// Rijnummer van een taak op ID, of 0.
export function vindTaakRij(kolomA, id){
  const i=(kolomA||[]).findIndex(r=>cel(r,0)===id);
  return i<0 ? 0 : i+1;
}

// ── ALV's ───────────────────────────────────────────────────────────────
const MAX_VVE_CODE_LEN = 12;
export function alvoStatus(r){
  return r.notulen ? 'Afgerond' : r.uitnodiging ? 'Gepland' : r.klaargezet ? 'Klaargezet' : 'Open';
}
export function parseAlvo(rijen){
  return (rijen||[]).slice(ALVO_EERSTE_RIJ-1).map((rij,i)=>{
    const code=cel(rij,0);
    if(!code || code.length>MAX_VVE_CODE_LEN) return null;
    if(['Totaal','Uitnodigingen','Notulen','Nog'].some(p=>code.startsWith(p))) return null;
    const waar = k => cel(rij,k).toUpperCase()==='TRUE';
    const opm=cel(rij,5);
    const r={ code, naam:cel(rij,1), uitnodiging:waar(2), notulen:waar(3), begroting:waar(4), klaargezet:waar(6),
      opmerkingen:opm, budget:/^budget(pakket)?$/i.test(opm), _row:i+ALVO_EERSTE_RIJ };
    r.status=alvoStatus(r);
    return r;
  }).filter(Boolean);
}
// Rijnummer van een VvE in kolom A van het ALV-overzicht, of 0 als hij er niet (of dubbel) staat.
export function vindAlvoRij(kolomA, code){
  const treffers=[];
  (kolomA||[]).forEach((r,i)=>{ if(i+1>=ALVO_EERSTE_RIJ && cel(r,0)===code) treffers.push(i+1); });
  return treffers.length===1 ? treffers[0] : 0;
}
export function parseAlfa(rijen){
  return (rijen||[]).slice(1).map(rij=>({ code:cel(rij,0), naam:cel(rij,1), datum:cel(rij,2) })).filter(r=>r.code);
}
