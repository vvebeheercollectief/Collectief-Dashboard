// ══════════════════════════════════════
//  RENDER-ALV — ALV-overzicht + ALV-afgerond + aanvink-schrijfactie ("ALV's overzicht")
//  Verplaatst uit render-lijsten.js (Batch D / punt 11) — zuivere refactor, geen gedragswijziging.
// ══════════════════════════════════════
import { esc, emptyRow, vveCodeSpan } from "./util.js";
import { SID, PG } from "./config.js";
import { state, D, pgs } from "./state.js";
import { getSheetIds } from "./crud.js";
import { assertRowMatch } from "./api.js";
import { logEvent } from "./render-overig.js";
import { showToast } from "./notifications.js";
import { ensureToken } from "./auth.js";
import { renderPag } from "./render-tabel.js";
import { renderNtdDonut } from "./render-lijsten.js";
import { ico } from "./icons.js";

// ══════════════════════════════════════
//  ALV OVERZICHT
// ══════════════════════════════════════
// Duotone-stijl inline SVG-iconen voor de stat-tegels (zelfde stijl als DASH_ICONS,
// kleur volgt --sec via currentColor). Inline i.p.v. Phosphor-font voor betrouwbare weergave.
const ALVO_ICONS={
  totaal:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="8" width="8" height="13" rx="1" fill="currentColor" fill-opacity="0.18"/><rect x="11" y="4" width="10" height="17" rx="1" fill="currentColor" fill-opacity="0.18"/><path d="M2 21h20M6 12h2M6 15.5h2M15 8h2M15 11.5h2M15 15h2"/></svg>`,
  afgerond:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="currentColor" fill-opacity="0.18"/><path d="M8 12.5l2.7 2.7L16 9.8"/></svg>`,
  gepland:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="5" width="17" height="16" rx="2" fill="currentColor" fill-opacity="0.18"/><path d="M3.5 9.5h17M8 3v4M16 3v4M7.5 14h2M11 14h2M14.5 14h2"/></svg>`,
  open:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 3c0 5 5 6 5 9s-5 4-5 9M17 3c0 5-5 6-5 9s5 4 5 9" fill="currentColor" fill-opacity="0.18"/><path d="M6 3h12M6 21h12"/></svg>`
};
function renderAlvo(){
  // Stats
  const tot=D.alvo.length;
  const afd=D.alvo.filter(r=>r.status==='Afgerond').length;
  const gep=D.alvo.filter(r=>r.status==='Gepland').length;
  const kla=D.alvo.filter(r=>r.status==='Klaargezet').length;
  const opn=D.alvo.filter(r=>r.status==='Open').length;
  // De tegels zijn de afstreeplijst: klikken zet het statusfilter (actie 'alvo-stat').
  const huidig=document.getElementById('f-status-alvo').value;
  const aItem=(val,cls,cap)=>`<div class="stat-item"><span class="stat-val ${cls}">${val}</span><div class="stat-meta"><span class="stat-cap">${cap}</span></div></div>`;
  const aKnop=(val,cls,cap,status)=>`<button type="button" class="stat-item stat-klik${huidig===status?' aan':''}" data-action="alvo-stat" data-status="${status}" aria-pressed="${huidig===status}" title="Toon alleen ${cap}"><span class="stat-val ${cls}">${val}</span><div class="stat-meta"><span class="stat-cap">${cap}</span></div></button>`;
  document.getElementById('alvo-stats').innerHTML=
    aItem(tot,'',"Totaal VvE's")+
    aKnop(afd,'green','Afgerond','Afgerond')+
    aKnop(gep,'amber','Gepland','Gepland')+
    aKnop(kla,'teal','Klaargezet','Klaargezet')+
    aKnop(opn,opn?'red':'muted','Open','Open');

  const q=document.getElementById('s-alvo').value.toLowerCase();
  const fs=document.getElementById('f-status-alvo').value;
  const onlyBudget=document.getElementById('f-budget-alvo')?.checked;
  const rows=D.alvo.filter(r=>{
    if(q&&!`${r.code} ${r.naam}`.toLowerCase().includes(q)) return false;
    if(fs&&r.status!==fs) return false;
    if(onlyBudget&&!r.budget) return false;
    return true;
  });
  pgs.alvo=Math.min(Math.max(1,pgs.alvo),Math.max(1,Math.ceil(rows.length/PG))); // clamp: geen lege pagina
  const sl=rows.slice((pgs.alvo-1)*PG,pgs.alvo*PG);
  document.getElementById('alvo-tbody').innerHTML=sl.length
    ?sl.map(r=>{
      const idx=D.alvo.indexOf(r);
      return`<tr>
        <td>${vveCodeSpan(r.code, '--sec:var(--ac);--sec-l:var(--ac-l)')}</td>
        <td class="cell-name">${esc(r.naam)}${r.budget?' <span class="badge budget-tag" title="Budgetpakket — vergadert zelf">Budget</span>':''}</td>
        <td>${flagPill(idx,'klaargezet',r.klaargezet)}</td>
        <td>${flagPill(idx,'uitnodiging',r.uitnodiging)}</td>
        <td>${flagPill(idx,'notulen',r.notulen)}</td>
        <td>${flagPill(idx,'begroting',r.begroting)}</td>
        <td><span class="badge status-${esc((r.status||'').toLowerCase().replace(/[^a-z0-9]+/g,'-'))}">${statusIco(r.status)} ${esc(r.status)}</span></td>
      </tr>`;
    }).join('')
    :emptyRow(7);
  renderPag('alvo-pag',rows.length,pgs.alvo,'alvo');
}

// 0-gebaseerde kolomindexen. Klaargezet staat op G (=6) en niet tussen B en C, omdat
// kolom 3/4/5 hard gecodeerd zitten in cd_handleAlvoEdit en verplaatsALV (Apps Script).
const ALVO_COLS={uitnodiging:2,notulen:3,begroting:4,klaargezet:6};
const ALVO_LABELS={uitnodiging:'Uitnodiging',notulen:'Notulen',begroting:'Begroting',klaargezet:'Klaargezet'};

function flagPill(idx,field,val){
  const cls=val?'on':'off';
  const lbl=val?'✓ Ja':'–';
  const aria=val?'true':'false';
  const title=`Klik om ${ALVO_LABELS[field]} ${val?'uit':'aan'} te zetten`;
  return`<button type="button" class="flag-toggle ${cls}" data-action="alvo-flag" data-idx="${idx}" data-field="${field}" aria-pressed="${aria}" title="${title}">${lbl}</button>`;
}

function _recomputeAlvoStatus(r){
  r.status=r.notulen?'Afgerond':r.uitnodiging?'Gepland':r.klaargezet?'Klaargezet':'Open';
}

async function toggleAlvoFlag(idx,field){
  const r=D.alvo[idx];
  if(!r){console.warn('toggleAlvoFlag: rij niet gevonden',idx);return}
  if(!await ensureToken()){showToast('Niet ingelogd','Kan wijziging niet opslaan','var(--rd)');return}

  // Lock UI op de specifieke pill
  const btn=document.querySelector(`.flag-toggle[data-idx="${idx}"][data-field="${field}"]`);
  if(btn) btn.classList.add('toggling');

  const oldVal=!!r[field];
  const newVal=!oldVal;
  const oldStatus=r.status;

  // Optimistische update
  r[field]=newVal;
  _recomputeAlvoStatus(r);
  renderAlvo();
  renderNtdDonut(); // voortgangsbalk meteen mee laten lopen

  try{
    const ids=await getSheetIds();
    const sheetId=ids["ALV's overzicht"]??ids["ALV's Overzicht"]??ids["ALV's overzicht "];
    if(sheetId==null) throw new Error("Sheet 'ALV's overzicht' niet gevonden");
    await assertRowMatch(r._row, r.code, "ALV's overzicht"); // bescherming: rij nog van deze VvE vóór flag-write
    const col=ALVO_COLS[field];
    const resp=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SID}:batchUpdate`,{
      method:'POST',
      headers:{Authorization:`Bearer ${state.oauthToken}`,'Content-Type':'application/json'},
      body:JSON.stringify({requests:[{
        updateCells:{
          range:{sheetId,startRowIndex:r._row-1,endRowIndex:r._row,startColumnIndex:col,endColumnIndex:col+1},
          rows:[{values:[{userEnteredValue:{boolValue:newVal}}]}],
          fields:'userEnteredValue'
        }
      }]})
    });
    if(!resp.ok){const t=await resp.text();throw new Error(`HTTP ${resp.status}: ${t.slice(0,120)}`)}

    logEvent(r.code,'ALVS',newVal?'Aangevinkt':'Uitgevinkt',ALVO_LABELS[field],oldVal?'TRUE':'FALSE',newVal?'TRUE':'FALSE');
    showToast(`${ALVO_LABELS[field]} ${newVal?'aan':'uit'}`,`${r.code} – ${r.naam}`,newVal?'var(--gn)':'var(--mut)',newVal?'vink':'cirkelOpen');
  }catch(e){
    // Revert
    r[field]=oldVal;
    r.status=oldStatus;
    renderAlvo();
    renderNtdDonut();
    showToast('Opslaan mislukt',e.message||'Onbekende fout','var(--rd)');
    console.error('toggleAlvoFlag fout:',e);
  }finally{
    const btn2=document.querySelector(`.flag-toggle[data-idx="${idx}"][data-field="${field}"]`);
    if(btn2) btn2.classList.remove('toggling');
  }
}
function statusIco(s){return{Open:ico('zandloper'),Klaargezet:ico('klembord'),Gepland:ico('kalender'),Afgerond:ico('vinkCirkel')}[s]||''}

// ══════════════════════════════════════
//  ALV AFGEROND
// ══════════════════════════════════════
function renderAlfa(){
  const q=document.getElementById('s-alfa').value.toLowerCase();
  const rows=D.alfa.filter(r=>`${r.code} ${r.naam} ${r.datum}`.toLowerCase().includes(q));
  pgs.alfa=Math.min(Math.max(1,pgs.alfa),Math.max(1,Math.ceil(rows.length/PG))); // clamp: geen lege pagina
  const sl=rows.slice((pgs.alfa-1)*PG,pgs.alfa*PG);
  document.getElementById('alfa-tbody').innerHTML=sl.length
    ?sl.map(r=>`<tr>
        <td>${vveCodeSpan(r.code, '--sec:var(--gn);--sec-l:var(--gn-l)')}</td>
        <td class="cell-name">${esc(r.naam)}</td>
        <td class="cell-sm">${esc(r.datum)}</td>
      </tr>`).join('')
    :emptyRow(3);
  renderPag('alfa-pag',rows.length,pgs.alfa,'alfa');
}

export { ALVO_ICONS, renderAlvo, ALVO_COLS, ALVO_LABELS, flagPill, _recomputeAlvoStatus, toggleAlvoFlag, statusIco, renderAlfa };
