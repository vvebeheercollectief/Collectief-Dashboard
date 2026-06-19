// ══════════════════════════════════════
//  KENMERKEN — beheerderskenmerken per VvE (tab 'Kenmerken', kolommen A:F)
//  A=code  B=balkons  C=kozijnen  D=bron  E=gewijzigdDoor  F=gewijzigdOp
// ══════════════════════════════════════
import { state, D } from "./state.js";
import { writeRange, appendRange, assertRowMatch } from "./api.js";
import { ensureToken } from "./auth.js";
import { backgroundWrite } from "./data.js";
import { logEvent } from "./render-overig.js";
import { getCurrentWho } from "./notifications.js";
import { renderVve } from "./render-vve.js";
// (kringverwijzing kenmerken ⇄ render-vve/data: zelfde live-bindings-patroon als crud ⇄ main)

export const KENMERK_WAARDEN = ['Onbekend','Ja','Nee','Deels'];

// Pure parser: laatste rij per code wint (vangnet tegen dubbele appends)
function parseKenmerken(rows){
  if(!rows||rows.length<2) return [];
  const per={};
  rows.slice(1).forEach((r,i)=>{
    const code=((r&&r[0])||'').trim();
    if(!code) return;
    per[code]={_row:i+2,code,balkons:(r[1]||'').trim(),kozijnen:(r[2]||'').trim(),
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
  const oud=vveKenmerken(code,D);
  const gewijzigd=[['Balkons','balkons'],['Kozijnen','kozijnen'],['Bron','bron']]
    .filter(([,k])=>nieuw[k]!==(oud[k]||''));
  state.kenmerkenEdit=false;
  if(!gewijzigd.length){ renderVve(); return; }
  if(!await ensureToken()){ renderVve(); alert('Inloggen mislukt.'); return; }
  const who=getCurrentWho()||'?', ts=new Date().toISOString();
  const sn={...oud};                       // snapshot voor rollback
  let rec=(D.kenmerken||[]).find(k=>k.code===code);
  if(!rec){ rec={...oud}; D.kenmerken.push(rec); }
  Object.assign(rec,nieuw,{gewijzigdDoor:who,gewijzigdOp:ts});
  gewijzigd.forEach(([lbl,k])=>{
    logEvent(code,'','Kenmerk',lbl,oud[k]||'',nieuw[k]||'');
    D.logboek.unshift({_row:0,timestamp:ts,code,sectie:'',actie:'Kenmerk',veld:lbl,
      oudeWaarde:oud[k]||'',nieuweWaarde:nieuw[k]||'',gebruiker:who});
  });
  renderVve();
  const waarden=[code,rec.balkons,rec.kozijnen,rec.bron,who,ts];
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
    },
    ()=>{ Object.assign(rec,sn); },
    'Kenmerken opslaan'
  );
}

export { parseKenmerken, vveKenmerken, saveKenmerken };
