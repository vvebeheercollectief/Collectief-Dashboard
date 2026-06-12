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
  const r=state._offerteActieRow, soort=state._offerteActieSoort;
  if(!r||!r.code){ sluitOfferteActieModal(); return; }
  if(!await ensureToken()){ alert('Inloggen mislukt.'); return; }
  const notitie=(document.getElementById('off-actie-notitie')?.value||'').trim();
  const who=getCurrentWho()||'?', ts=new Date().toISOString();
  const doorsturen=soort==='doorsturen';
  const veld=doorsturen?'E-mail':'Telefoon';
  const wie=doorsturen?'Bewoner/eigenaar':'Aannemer';
  const tekst=(doorsturen?'Offerte gedeeld met de eigenaren':'Nagebeld voor opvolging offerte')+(notitie?' — '+notitie:'');
  const entry={_row:0,timestamp:ts,code:r.code,sectie:'OFFERTE-TRAJECTEN',actie:'Contact',veld,oudeWaarde:wie,nieuweWaarde:tekst,gebruiker:who};
  const faseOud=r.fase||'';
  D.logboek.unshift(entry);                 // optimistisch: stil-teller reset direct
  if(doorsturen) r.fase='bij_vve';
  sluitOfferteActieModal();
  renderNtd();
  backgroundWrite(
    async()=>{
      await appendRange("'Logboek'!A:H",[ts,r.code,'OFFERTE-TRAJECTEN','Contact',veld,wie,tekst,who]);
      if(doorsturen&&r._row) await writeRange(`'Nog Te Doen'!O${r._row}`,['bij_vve']);
    },
    ()=>{ const i=D.logboek.indexOf(entry); if(i>-1)D.logboek.splice(i,1); r.fase=faseOud; },
    doorsturen?'Doorsturen vastleggen':'Nabellen vastleggen'
  );
}

export { openOfferteActieModal, sluitOfferteActieModal, offerteActieVastleggen };
