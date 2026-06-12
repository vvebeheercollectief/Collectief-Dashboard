// ══════════════════════════════════════
//  OFFERTE-ACTIES — één-klik opvolging Nabellen/Doorsturen (offerte-motor Fase 3)
//  Legt een contactmoment vast in het Logboek; de stil-teller reset daardoor
//  vanzelf via _offerteActiviteitMap. Bij Doorsturen wordt óók de fase
//  gepersisteerd: 'bij_vve' in kolom O van 'Nog Te Doen'.
// ══════════════════════════════════════
import { state, D } from "./state.js";
import { appendRange, writeRange } from "./api.js";
import { backgroundWrite } from "./data.js";
import { ensureToken } from "./auth.js";
import { getCurrentWho } from "./notifications.js";
import { renderNtd } from "./render-lijsten.js";

// Open de bevestigingsmodal voor een rij uit de rij-cache (soort: 'nabellen' | 'doorsturen').
function openOfferteActieModal(rid, soort){
  const r=state._rowCache[rid];
  if(!r) return;
  state._offerteActieRow=r;
  state._offerteActieSoort=soort;
  document.getElementById('off-actie-title').textContent=
    soort==='doorsturen' ? 'Offerte doorgestuurd' : 'Nabellen vastleggen';
  document.getElementById('off-actie-sub').textContent=`${r.code} — ${r.naam||''}`;
  document.getElementById('off-actie-notitie').value='';
  document.getElementById('off-actie-bg').classList.add('open');
}

function sluitOfferteActieModal(){
  document.getElementById('off-actie-bg').classList.remove('open');
  state._offerteActieRow=null;
  state._offerteActieSoort=null;
}

// Eén-klik opvolging: logboek-regel + (bij doorsturen) fase → bij_vve in kolom O.
async function offerteActieVastleggen(){
  // F1: snapshot state + notitie lokaal, sluit modal synchroon VÓÓR de await;
  // een tweede klik strandt dan op de lege state (zelfde immuniteit als snooze-patroon).
  const r=state._offerteActieRow, soort=state._offerteActieSoort;
  if(!r||!r.code){ sluitOfferteActieModal(); return; }
  const notitie=(document.getElementById('off-actie-notitie')?.value||'').trim();
  sluitOfferteActieModal(); // synchroon sluiten vóór eerste await (bij token-faal: modal al dicht — geaccepteerd)
  if(!await ensureToken()){ alert('Inloggen mislukt.'); return; }
  const who=getCurrentWho()||'?', ts=new Date().toISOString();
  const doorsturen=soort==='doorsturen';
  const veld=doorsturen?'E-mail':'Telefoon';
  // Fix B: als de bal bij de VvE lag (nabellen = eigenaren herinneren), is de contactpartij ook Bewoner/eigenaar
  const balBij=(r._offStatus&&r._offStatus.balBij)||'aannemer';
  const wie=(doorsturen||balBij==='vve')?'Bewoner/eigenaar':'Aannemer';
  const tekst=(doorsturen?'Offerte gedeeld met de eigenaren':'Nagebeld voor opvolging offerte')+(notitie?' — '+notitie:'');
  const entry={_row:0,timestamp:ts,code:r.code,sectie:'OFFERTE-TRAJECTEN',actie:'Contact',veld,oudeWaarde:wie,nieuweWaarde:tekst,gebruiker:who};
  const faseOud=r.fase||'';
  // Fix A: snapshot opvolgdatum vóór optimistische wijziging
  const opvolgdatumOud=r.opvolgdatum||'';
  D.logboek.unshift(entry);                 // optimistisch: stil-teller reset direct
  if(doorsturen) r.fase='bij_vve';
  if(r.opvolgdatum) r.opvolgdatum='';      // verstreken opvolgdatum is afgehandeld door deze actie
  renderNtd();
  // F2: logGedaan-vlag overleeft _withRetry-herkansingen (closure);
  // voorkomt dat een geslaagde append bij een latere retry nogmaals wordt uitgevoerd.
  let logGedaan=false;
  backgroundWrite(
    async()=>{
      if(!logGedaan){ await appendRange("'Logboek'!A:H",[ts,r.code,'OFFERTE-TRAJECTEN','Contact',veld,wie,tekst,who]); logGedaan=true; }
      if(doorsturen&&r._row) await writeRange(`'Nog Te Doen'!O${r._row}`,['bij_vve']); // zonder _row geen O-write; resync zet de fase dan terug (zeldzaam, geaccepteerd)
      if(opvolgdatumOud&&r._row) await writeRange(`'Nog Te Doen'!L${r._row}`,['']); // Fix A: verstreken opvolgdatum wissen in Sheet
    },
    ()=>{ if(!logGedaan){ const i=D.logboek.indexOf(entry); if(i>-1)D.logboek.splice(i,1); } r.fase=faseOud; r.opvolgdatum=opvolgdatumOud; }, // Fix A: rollback opvolgdatum
    doorsturen?'Doorsturen vastleggen':'Nabellen vastleggen'
  );
}

export { openOfferteActieModal, sluitOfferteActieModal, offerteActieVastleggen };
