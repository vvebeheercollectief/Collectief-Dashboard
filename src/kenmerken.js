// ══════════════════════════════════════
//  KENMERKEN — beheerderskenmerken per VvE (tab 'Kenmerken', kolommen A:F)
//  A=code  B=balkons  C=kozijnen  D=bron  E=gewijzigdDoor  F=gewijzigdOp
// ══════════════════════════════════════
import { state, D } from "./state.js";
import { writeRange, appendRange, assertRowMatch } from "./api.js";
import { ensureToken } from "./auth.js";
import { backgroundWrite, blokkeerOffline } from "./data.js";
import { logEvent } from "./render-overig.js";
import { getCurrentWho } from "./notifications.js";
import { renderVve } from "./render-vve.js";
// (kringverwijzing kenmerken ⇄ render-vve/data: zelfde live-bindings-patroon als crud ⇄ main)

export const KENMERK_WAARDEN = ['Onbekend','Gemeenschappelijk','Individueel'];
// Oude Ja/Nee-antwoorden (t/m v6.3, vraag was "… gemeenschappelijk?") lezen we als de
// nieuwe woorden, zodat ook een niet-gemigreerde Sheet-rij meteen goed toont en de
// eerstvolgende opslag de nieuwe waarde wegschrijft. (Sheet-data is eenmalig omgezet.)
const KENMERK_OUD = {Ja:'Gemeenschappelijk', Nee:'Individueel'};
const normKenmerk = v => KENMERK_OUD[v] || v;

// Pure parser: laatste rij per code wint (vangnet tegen dubbele appends)
function parseKenmerken(rows){
  if(!rows||rows.length<2) return [];
  const per={};
  rows.slice(1).forEach((r,i)=>{
    const code=((r&&r[0])||'').trim();
    if(!code) return;
    per[code]={_row:i+2,code,balkons:normKenmerk((r[1]||'').trim()),kozijnen:normKenmerk((r[2]||'').trim()),
      bron:(r[3]||'').trim(),gewijzigdDoor:(r[4]||'').trim(),gewijzigdOp:(r[5]||'').trim()};
  });
  return Object.values(per);
}

// Pure helper: kenmerk-record van één VvE, of leeg default — testbaar zonder DOM
function vveKenmerken(code, data){
  return (data.kenmerken||[]).find(k=>k.code===code)
    || {_row:0,code,balkons:'',kozijnen:'',bron:'',gewijzigdDoor:'',gewijzigdOp:''};
}

// Opslaan vanuit de bewerkmodus van het kenmerken-paneel (VvE-pagina).
// Optimistisch: lokaal bijwerken + audit-regels in D.logboek; serieel wegschrijven.
async function saveKenmerken(){
  const code=state.vveCode;
  if(!code) return;
  const norm=v=>v==='Onbekend'?'':(v||'').trim();
  const nieuw={
    balkons:norm(document.getElementById('kmk-balkons')?.value),
    kozijnen:norm(document.getElementById('kmk-kozijnen')?.value),
    bron:(document.getElementById('kmk-bron')?.value||'').trim(),
  };
  // KOPIE, geen verwijzing: vveKenmerken geeft het LEVENDE record uit D.kenmerken terug zodra dat
  // bestaat, en `Object.assign(rec,nieuw)` hieronder muteert dan ook `oud`. Het logboek kreeg
  // daardoor de nieuwe waarde als oude waarde te zien — in het dossier stond letterlijk
  // "Balkons: Individueel → Individueel". Op staging gemeten (30-07) en hier gerepareerd.
  const oud={...vveKenmerken(code,D)};
  const gewijzigd=[['Balkons','balkons'],['Kozijnen','kozijnen'],['Bron','bron']]
    .filter(([,k])=>nieuw[k]!==(oud[k]||''));
  // Offline-poort staat hier, vóór het sluiten van het bewerkscherm: doe je dit later, dan is de
  // invoer van de gebruiker weg terwijl er niets is opgeslagen.
  if(gewijzigd.length && blokkeerOffline()) return;
  state.kenmerkenEdit=false;
  if(!gewijzigd.length){ renderVve(); return; }
  if(!await ensureToken()){ renderVve(); alert('Inloggen mislukt.'); return; }
  const who=getCurrentWho()||'?', ts=new Date().toISOString();
  const sn={...oud};                       // snapshot voor rollback
  let rec=(D.kenmerken||[]).find(k=>k.code===code);
  if(!rec){ rec={...oud}; D.kenmerken.push(rec); }
  Object.assign(rec,nieuw,{gewijzigdDoor:who,gewijzigdOp:ts});
  // Optimistisch tonen mag meteen; de echte logboek-appends gaan hieronder de schrijf-keten in,
  // zodat ze onder de schrijfteller vallen (statusbalk/sluit-waarschuwing) en de resync niet
  // start terwijl ze nog lopen.
  // De regels worden vastgehouden zodat de rollback ze weer kan weghalen (zelfde patroon als
  // addContactLog in render-vve.js). Zonder dat bleven ze na een mislukte opslag staan: sinds het
  // logboek incrementeel wordt gelezen, wordt D.logboek niet meer elke ronde volledig vervangen,
  // dus een niet-opgeruimde optimistische regel is dan blijvend — en beweert in de tijdlijn dat
  // een wijziging is opgeslagen die juist is teruggedraaid.
  const optLog=gewijzigd.map(([lbl,k])=>({_row:0,timestamp:ts,code,sectie:'',actie:'Kenmerk',veld:lbl,
    oudeWaarde:oud[k]||'',nieuweWaarde:nieuw[k]||'',gebruiker:who}));
  optLog.forEach(r=>D.logboek.unshift(r));
  renderVve();
  const waarden=[code,rec.balkons,rec.kozijnen,rec.bron,who,ts];
  let gelogd=false;   // append is niet idempotent; overleeft _withRetry-herkansingen
  backgroundWrite(
    async ()=>{
      // Beslis append-vs-update BINNEN de schrijf-keten: een eerdere append heeft rec._row
      // dan al gezet, zodat een snelle tweede opslag niet nóg een rij toevoegt.
      if(rec._row>0){ await assertRowMatch(rec._row, code, 'Kenmerken'); await writeRange(`'Kenmerken'!A${rec._row}:F${rec._row}`,waarden); }
      else{
        const resp=await appendRange("'Kenmerken'!A:F",waarden);
        const m=(resp&&resp.updates&&resp.updates.updatedRange||'').match(/!A(\d+):/i);
        if(m) rec._row=+m[1];   // nieuw rijnummer onthouden → volgende opslag wordt een update
      }
      if(!gelogd){
        for(const [lbl,k] of gewijzigd) await logEvent(code,'','Kenmerk',lbl,oud[k]||'',nieuw[k]||'');
        gelogd=true;
      }
    },
    ()=>{
      // Het rijnummer NIET terugdraaien. Slaagde de append maar struikelde de logregel erna op een
      // niet-tijdelijke fout, dan bestaat die rij écht in de Sheet — en zou de momentopname hem
      // weer op 0 zetten. De eerstvolgende opslag koos dan opnieuw de append-tak en maakte een
      // TWEEDE rij voor dezelfde VvE, waarna vveKenmerken er willekeurig één van leest.
      const rijNu=rec._row;
      Object.assign(rec,sn);
      if(rijNu>0) rec._row=rijNu;
      // Ook de optimistische logregels terugnemen — alleen die van deze poging (op identiteit,
      // niet op inhoud), zodat een gelijkluidende regel van een andere opslag blijft staan.
      // vorm-ok: zelfde reden als in render-vve.js — dit zijn optimistische regels (`_row:0`) uit
      // deze tik, en `_verwerkLogboek` tilt die op identiteit mee naar een verse lijst.
      optLog.forEach(r=>{ const i=D.logboek.indexOf(r); if(i>-1) D.logboek.splice(i,1); });   // vorm-ok: eigen optimistische regels, zie hierboven
    },
    'Kenmerken opslaan'
  );
}

export { parseKenmerken, vveKenmerken, saveKenmerken };
