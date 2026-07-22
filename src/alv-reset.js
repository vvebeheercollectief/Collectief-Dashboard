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
    if(!bereik.aaneengesloten)
      throw new Error('De VvE-rijen zijn niet aaneengesloten — reset afgebroken uit voorzorg. Meld dit even.');

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

    // Archiveren. Het archief komt DIRECT NA 'ALV's overzicht', nooit achteraan:
    // de oude verplaatsALV-trigger schrijft afgeronde ALV's naar het láátste tabblad,
    // dus een archief achteraan zou die stil opslokken.
    const arch=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SID}:batchUpdate`,{
      method:'POST',
      headers:{Authorization:`Bearer ${state.oauthToken}`,'Content-Type':'application/json'},
      body:JSON.stringify({requests:[{duplicateSheet:{
        sourceSheetId:bron.sheetId, insertSheetIndex:bron.index+1, newSheetName:naam
      }}]})
    });
    if(!arch.ok) throw new Error(`Archiveren mislukt: HTTP ${arch.status} — er is niets gewist.`);

    // Wissen: vier repeatCell-verzoeken in één batchUpdate, alleen over het VvE-bereik,
    // zodat de samenvattingsregels onderaan het tabblad ongemoeid blijven.
    const wis=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SID}:batchUpdate`,{
      method:'POST',
      headers:{Authorization:`Bearer ${state.oauthToken}`,'Content-Type':'application/json'},
      body:JSON.stringify({requests:RESET_KOLOMMEN.map(col=>({repeatCell:{
        range:{sheetId:bron.sheetId,startRowIndex:bereik.start-1,endRowIndex:bereik.eind,
               startColumnIndex:col,endColumnIndex:col+1},
        cell:{userEnteredValue:{boolValue:false}},
        fields:'userEnteredValue'
      }}))})
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

export { _resetBereik, _archiefNaam, openResetModal, closeResetModal, doeReset };
