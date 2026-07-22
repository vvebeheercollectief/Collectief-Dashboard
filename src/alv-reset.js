// ══════════════════════════════════════
//  ALV-RESET — een nieuwe vergaderronde starten
//  Archiveert het tabblad "ALV's overzicht" en wist daarna de vier vinkjes
//  (C=Uitnodiging, D=Notulen, E=Begroting, G=Klaargezet).
//  Het papieren ritueel — elk jaar een nieuwe lijst uitprinten — als knop.
// ══════════════════════════════════════
import { state, D } from "./state.js";
import { SID } from "./config.js";
import { ensureToken } from "./auth.js";
import { loadAll } from "./data.js";
import { assertRowsMatch } from "./api.js";
import { showToast } from "./notifications.js";
import { logEvent } from "./render-overig.js";

// Welke rijen mag de reset raken? Onderaan het tabblad staan samenvattingsregels
// ('Totaal …', 'Uitnodigingen …') die parseAlvo overslaat; die mogen niet gewist worden.
// Daarom rekenen we het bereik uit de geparseerde VvE-rijen, nooit uit de laatste rij.
function _resetBereik(alvo){
  if(!alvo||!alvo.length) return {start:0,eind:0,aaneengesloten:false,aantal:0};
  const rijen=alvo.map(r=>r._row).sort((a,b)=>a-b);
  const start=rijen[0], eind=rijen[rijen.length-1];
  return {start,eind,aaneengesloten:(eind-start+1)===rijen.length,aantal:rijen.length};
}

// Groepeert de VvE-rijen in aaneengesloten blokken. Zit er een lege of overgeslagen rij
// tussen (parseAlvo filtert die weg), dan levert dat gewoon twee blokken op in plaats van
// één — zo raakt de wisactie nooit een rij die géén VvE is, en hoeft de reset niet te
// weigeren zodra het register één rommelige rij bevat.
function _resetBlokken(alvo){
  if(!alvo||!alvo.length) return [];
  const rijen=[...new Set(alvo.map(r=>r._row))].sort((a,b)=>a-b);
  const blokken=[{start:rijen[0],eind:rijen[0]}];
  for(const r of rijen.slice(1)){
    const laatste=blokken[blokken.length-1];
    if(r===laatste.eind+1) laatste.eind=r; else blokken.push({start:r,eind:r});
  }
  return blokken;
}

// Wijkt uit naar '(2)', '(3)', … als er in hetzelfde jaar al een archief staat.
function _archiefNaam(jaar,bestaandeNamen){
  const basis=`ALV-archief ${jaar}`;
  if(!bestaandeNamen.includes(basis)) return basis;
  let n=2;
  while(bestaandeNamen.includes(`${basis} (${n})`)) n++;
  return `${basis} (${n})`;
}

function openResetModal(){
  const b=_resetBereik(D.alvo||[]);
  if(!b.aantal){ alert('Er staan geen VvE-rijen in het overzicht om te resetten.'); return; }
  document.getElementById('alvoreset-tekst').textContent =
    `Alle vier de vinkjes gaan uit bij ${b.aantal} ${b.aantal===1?'VvE':"VvE's"}. `+
    `Elke VvE staat daarna weer op Open. De huidige ronde wordt eerst weggeschreven naar een `+
    `archieftabblad, dus er gaat niets verloren.`;
  document.getElementById('alvoreset-bg').classList.add('open');
}
function closeResetModal(){
  document.getElementById('alvoreset-bg').classList.remove('open');
}

// ── Uitvoering ────────────────────────────────────────────────────────
const ALVO_TAB="ALV's overzicht";
const RESET_KOLOMMEN=[2,3,4,6]; // 0-gebaseerd: C=Uitnodiging, D=Notulen, E=Begroting, G=Klaargezet
// De tabbladnaam kent in de praktijk varianten (hoofdletter-O, spatie erachter) — zie de
// fallbacks in toggleAlvoFlag. Vergelijk daarom tolerant, net als daar.
const _isAlvoTab=(titel)=>(titel||'').trim().toLowerCase()===ALVO_TAB.toLowerCase();

// Eén GET met alle tabblad-eigenschappen: nodig voor de invoegpositie, een vrije
// archiefnaam, de rasterbreedte, én de controle dat het laatste tabblad niet verschuift.
async function _tabbladen(){
  const resp=await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SID}?fields=sheets.properties(sheetId,title,index,gridProperties)`,
    {headers:{Authorization:`Bearer ${state.oauthToken}`}});
  if(!resp.ok) throw new Error(`Tabbladen ophalen mislukt: HTTP ${resp.status}`);
  const j=await resp.json();
  return (j.sheets||[]).map(s=>s.properties);
}

async function doeReset(){
  if(state._alvoResetBezig) return;
  if(!await ensureToken()){ showToast('Niet ingelogd','Kan niet resetten','var(--rd)'); return; }
  state._alvoResetBezig=true;
  const knop=document.getElementById('alvoreset-doe');
  if(knop){ knop.disabled=true; knop.textContent='Bezig…'; }

  try{
    await loadAll(true);                     // verse stand vóór een onomkeerbare bulkschrijfactie
    const bereik=_resetBereik(D.alvo||[]);
    if(!bereik.aantal) throw new Error('Geen VvE-rijen gevonden.');
    const blokken=_resetBlokken(D.alvo);

    // Rij-identiteit vóór een bulkschrijfactie: één GET over het hele bereik, gooit bij
    // de eerste rij die niet meer bij de verwachte VvE-code hoort. Niets geschreven.
    await assertRowsMatch(D.alvo.map(r=>({row:r._row,code:r.code})), ALVO_TAB);

    const props=await _tabbladen();
    const bron=props.find(p=>_isAlvoTab(p.title));
    if(!bron) throw new Error(`Tabblad '${ALVO_TAB}' niet gevonden.`);
    if((bron.gridProperties&&bron.gridProperties.columnCount||0)<7)
      throw new Error('Kolom G bestaat nog niet in dit tabblad — voeg hem eerst toe.');

    const laatsteVoor=props.slice().sort((a,b)=>a.index-b.index).pop().title;
    const naam=_archiefNaam(new Date().getFullYear(),props.map(p=>p.title));

    // Archiveren. Het archief komt DIRECT NA 'ALV's overzicht' — dat navigeert
    // prettiger dan achteraan. (Historisch ook noodzaak: verplaatsALV schreef naar het
    // láátste tabblad; sinds die op naam zoekt is de positie alleen nog voorkeur.)
    const arch=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SID}:batchUpdate`,{
      method:'POST',
      headers:{Authorization:`Bearer ${state.oauthToken}`,'Content-Type':'application/json'},
      body:JSON.stringify({requests:[{duplicateSheet:{
        sourceSheetId:bron.sheetId, insertSheetIndex:bron.index+1, newSheetName:naam
      }}]})
    });
    if(!arch.ok) throw new Error(`Archiveren mislukt: HTTP ${arch.status} — er is niets gewist.`);

    // Wissen: per blok × per vlagkolom één repeatCell, alles in één batchUpdate. Alleen
    // echte VvE-rijen, dus samenvattingsregels en lege rijen blijven ongemoeid.
    const verzoeken=[];
    for(const blok of blokken) for(const col of RESET_KOLOMMEN) verzoeken.push({repeatCell:{
      range:{sheetId:bron.sheetId,startRowIndex:blok.start-1,endRowIndex:blok.eind,
             startColumnIndex:col,endColumnIndex:col+1},
      cell:{userEnteredValue:{boolValue:false}},
      fields:'userEnteredValue'
    }});
    const wis=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SID}:batchUpdate`,{
      method:'POST',
      headers:{Authorization:`Bearer ${state.oauthToken}`,'Content-Type':'application/json'},
      body:JSON.stringify({requests:verzoeken})
    });
    if(!wis.ok) throw new Error(`Wissen mislukt: HTTP ${wis.status} — het archief '${naam}' is wel aangemaakt.`);

    const laatsteNa=(await _tabbladen()).slice().sort((a,b)=>a.index-b.index).pop().title;
    if(laatsteNa!==laatsteVoor)
      showToast('Let op','Het laatste tabblad is verschoven — controleer de spreadsheet','var(--am)');

    logEvent('','ALVS','Nieuwe ronde gestart',`${bereik.aantal} VvE's gereset, archief '${naam}'`,'','');
    closeResetModal();
    await loadAll(true);                     // loadAll hertekent zelf zodra de data wijzigt
    showToast('Nieuwe ronde gestart',`${bereik.aantal} VvE's op Open, archief '${naam}'`,'var(--gn)','herhaal');
  }catch(e){
    console.error('doeReset fout:',e);
    showToast('Reset mislukt',e.message||'Onbekende fout','var(--rd)');
  }finally{
    state._alvoResetBezig=false;
    const k=document.getElementById('alvoreset-doe');
    if(k){ k.disabled=false; k.textContent='Reset'; }
  }
}

export { _resetBereik, _resetBlokken, _archiefNaam, openResetModal, closeResetModal, doeReset };
