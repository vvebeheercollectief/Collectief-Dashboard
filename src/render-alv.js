// ══════════════════════════════════════
//  RENDER-ALV — ALV-overzicht + ALV-afgerond + aanvink-schrijfactie ("ALV's overzicht")
//  Verplaatst uit render-lijsten.js (Batch D / punt 11) — zuivere refactor, geen gedragswijziging.
// ══════════════════════════════════════
import { esc, emptyRow, vveCodeSpan } from "./util.js";
import { SID, PG } from "./config.js";
import { state, D, pgs } from "./state.js";
import { getSheetIds } from "./crud.js";
import { assertRowMatch, sheetsFetch, appendRange } from "./api.js";
import { logEvent } from "./render-overig.js";
import { showToast, fireNotifEvent } from "./notifications.js";
import { ensureToken } from "./auth.js";
import { renderPag } from "./render-tabel.js";
import { renderNtdDonut } from "./render-lijsten.js";
import { metWriteMarkering, blokkeerOffline } from "./data.js";
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

  const q=document.getElementById('s-alvo').value.toLowerCase().trim();
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
        <td>${flagPill(idx,'klaargezet',r.klaargezet,r.code)}</td>
        <td>${flagPill(idx,'uitnodiging',r.uitnodiging,r.code)}</td>
        <td>${flagPill(idx,'notulen',r.notulen,r.code)}</td>
        <td>${flagPill(idx,'begroting',r.begroting,r.code)}</td>
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

function flagPill(idx,field,val,code){
  const cls=val?'on':'off';
  const lbl=val?'✓ Ja':'–';
  const aria=val?'true':'false';
  const title=`Klik om ${ALVO_LABELS[field]} ${val?'uit':'aan'} te zetten`;
  // aria-label naast de zichtbare '✓ Ja' / '–': de naam van een knop komt uit zijn inhoud, en die
  // is voor alle vier de kolommen gelijk. Een schermlezer las dus vier keer 'Ja, knop, ingedrukt'
  // zonder te zeggen wáárvan. Het label wint van de inhoud én van title.
  // De VvE-code gaat MEE op de knop, naast de index. Die index wijst in `D.alvo`, en dat is een
  // ANDERE lijst dan een seconde geleden: `parseAlvo` bouwt hem bij elke poll opnieuw op. Komt er
  // in dat venster een VvE bij (of valt er een weg), dan schuiven alle indexen daaronder op en
  // wees `D.alvo[idx]` na de klik een andere vereniging aan. `assertRowMatch` merkt dat niet: die
  // toetst of rij `r._row` nog van `r.code` is, en dat klopt dan gewoon — voor de VERKEERDE rij.
  // Zelfde regel als overal in dit dashboard: identiteit boven positie.
  return`<button type="button" class="flag-toggle ${cls}" data-action="alvo-flag" data-idx="${idx}" data-code="${esc(code||'')}" data-field="${field}" aria-pressed="${aria}" aria-label="${ALVO_LABELS[field]}" title="${title}">${lbl}</button>`;
}

function _recomputeAlvoStatus(r){
  r.status=r.notulen?'Afgerond':r.uitnodiging?'Gepland':r.klaargezet?'Klaargezet':'Open';
}

async function toggleAlvoFlag(idx,field,code){
  // Eerst op INDEX, en die daarna toetsen op de code die op de knop stond. Klopt hij niet meer
  // (de lijst is tussen tekenen en klikken opnieuw opgebouwd), dan alsnog op code zoeken. Levert
  // dat niets op, dan is de VvE echt weg en gebeurt er bewust niets.
  let r=D.alvo[idx];
  const kode=(code||'').trim();
  if(kode && (!r || (r.code||'').trim()!==kode)) r=D.alvo.find(x=>(x.code||'').trim()===kode)||null;
  if(!r){console.warn('toggleAlvoFlag: rij niet gevonden',idx,kode);return}
  if(blokkeerOffline()) return;   // offline: niets wijzigen, ook niet optimistisch
  if(!await ensureToken()){showToast('Niet ingelogd','Kan wijziging niet opslaan','var(--rd)');return}

  // Dubbelklik-rem. De oude rem was een class op de knop, maar renderAlvo() hieronder
  // herschrijft de hele tabel en gooit die knop meteen weg — de rem leefde nul
  // milliseconden. Gevolg: twee tegengestelde schrijfacties naar dezelfde cel en twee
  // logboekregels ('Aangevinkt' én 'Uitgevinkt'). Nu een vlag per vinkje (dus een ánder
  // vinkje blijft gewoon klikbaar), NÁ ensureToken en zonder await ertussen — zelfde
  // idioom als _alvoResetBezig in alv-reset.js en _completeBusy in crud.js.
  const sleutel=`${idx}:${field}`;
  if(!state._alvoFlagBezig) state._alvoFlagBezig=new Set();
  if(state._alvoFlagBezig.has(sleutel)) return;
  state._alvoFlagBezig.add(sleutel);

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
    // Deze schrijfweg loopt buiten de seriële wachtrij van backgroundWrite om. metWriteMarkering
    // doet de schrijfteller (die remt de 8s-poll, zodat die de optimistische stand niet met de
    // nog-oude Sheet-waarde overschrijft), de statusbalk 'Opslaan…' én de sluit-waarschuwing in
    // één keer. Bewust GEEN handmatige pendingWrites++ meer erbij: dat zou dubbel tellen en de
    // balk na afloop op 'Opslaan…' laten hangen.
    // De optimistische render hierboven staat er bewust vóór: daar zit geen await tussen, dus
    // de poll kan er niet tussendoor glippen.
    await metWriteMarkering(async()=>{
      const ids=await getSheetIds();
      const sheetId=ids["ALV's overzicht"]??ids["ALV's Overzicht"]??ids["ALV's overzicht "];
      if(sheetId==null) throw new Error("Sheet 'ALV's overzicht' niet gevonden");
      await assertRowMatch(r._row, r.code, "ALV's overzicht"); // bescherming: rij nog van deze VvE vóór flag-write
      const col=ALVO_COLS[field];
      const resp=await sheetsFetch(`https://sheets.googleapis.com/v4/spreadsheets/${SID}:batchUpdate`,{
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

      // ── De ALV ook in het archief zetten ────────────────────────────────────────────────
      // 'Notulen' aanvinken IS het afronden van een ALV (_recomputeAlvoStatus zet de status dan op
      // 'Afgerond'). In de Sheet doet de Apps Script-trigger `verplaatsALV` dat al: die schrijft
      // [code, naam, vandaag] naar "ALV's afgerond". Maar een onEdit-trigger vuurt NIET op een
      // schrijfactie via de Sheets-API, en het dashboard zet dit vinkje precies zo. Gevolg: sinds
      // het vinkje vanuit het scherm gezet wordt, kwam er niets meer in dat archief — gemeten op
      // productie was de laatste regel van 5 mei 2026, ruim drie maanden oud. Dat archief voedt de
      // pagina "ALV's Afgerond", de regel 'Laatst gehouden ALV' in het VvE-dossier, de
      // dossier-chat en de KPI's op Dashboard en Analytics; die stonden dus allemaal stil.
      //
      // Ontdubbelen, want uit- en weer aanvinken mag geen tweede regel geven en `verplaatsALV` kan
      // dezelfde regel al gezet hebben als iemand het vinkje in de Sheet zette. Waaróp precies
      // staat twaalf regels lager, bij `alBekend` — op code + de exacte dag.
      // In een EIGEN try: mislukt deze append, dan is het vinkje zelf wél geland en zou de catch
      // hieronder het scherm terugdraaien terwijl de Sheet het aan heeft staan.
      if(field==='notulen' && newVal){
        try{
          const nu=new Date();
          // Zonder voorloopnullen: zo staan alle bestaande regels in dit tabblad er ook in
          // ('5-5-2026'), en zo zet `verplaatsALV` in Apps Script zijn datum neer. Eén kolom hoort
          // er niet in twee schrijfwijzen bij te staan.
          const datum=`${nu.getDate()}-${nu.getMonth()+1}-${nu.getFullYear()}`;
          // Ontdubbelen op code + de EXACTE dag van vandaag, niet op het kalenderjaar. De datum in
          // het archief is de dag waarop het vinkje gezet wordt, niet de dag van de vergadering:
          // een ALV van december die pas in januari wordt afgevinkt draagt een januaridatum, en
          // een jaar-vergelijking zou daarmee de échte ALV van dat nieuwe jaar blokkeren. Waar de
          // ontdubbeling voor bedoeld is — uit- en meteen weer aanvinken — valt gewoon op dezelfde
          // dag, en dat dekt deze vergelijking precies.
          const alBekend=(D.alfa||[]).some(a=>String(a.code||'').trim()===String(r.code||'').trim()
                                            && String(a.datum||'').trim()===datum);
          if(!alBekend){
            // Let op de dubbele apostrof: in A1-notatie moet een apostrof ín een tabbladnaam
            // verdubbeld worden, anders wijst het bereik nergens naar. Zelfde regel als _a1Bereik.
            await appendRange("'ALV''s afgerond'!A:C", [r.code, r.naam, datum]);
            // Meteen lokaal bijwerken, zodat de EERSTVOLGENDE hertekening klopt. Bewust géén render
            // hier: dit loopt binnen metWriteMarkering en de resync daarna tekent alles opnieuw.
            (D.alfa=D.alfa||[]).unshift({code:r.code, naam:r.naam, datum});
          }
        }catch(archiefFout){
          console.warn("[alv] archiefregel niet geschreven:", archiefFout);
          showToast('Archiefregel niet gelukt',
            `Het vinkje staat aan, maar ${r.code} is niet in "ALV's afgerond" gezet. Zet hem daar met de hand bij.`,
            'var(--am)','waarschuwing',{geenDedup:true});
        }
      }
      await logEvent(r.code,'ALVS',newVal?'Aangevinkt':'Uitgevinkt',ALVO_LABELS[field],oldVal?'TRUE':'FALSE',newVal?'TRUE':'FALSE');
      // Het TEAM laten weten dat de ALV-status verschoof — jezelf inbegrepen, precies zoals bij een
      // nieuwe taak: `cd_notifyByTag` schrijft één regel voor 'allen'. Je ziet die melding dus naast
      // de lokale bevestiging hieronder; dat is het bestaande gedrag van 'newtask' en niet iets dat
      // hier apart is bedacht. In de Sheet doet
      // `cd_handleAlvoEdit` (Apps Script) dat al, maar dat is een onEdit-trigger en die vuurt NIET
      // bij een wijziging via de Sheets-API — en zo zet dit dashboard het vinkje. Dezelfde
      // constructie als bij het archief hierboven, en dezelfde weg die 'newtask' en 'assigned' al
      // gebruiken: een regel in de Notif-wachtrij, die de backend oppikt. De achterkant lag er al
      // klaar voor (cd_processNotifEvent kent 'alv_update' en CD_QUEUE_ALLOWED laat het door);
      // alleen stuurde niemand het ooit. Alleen bij AANzetten: een vinkje weghalen is een
      // correctie, geen gebeurtenis om iedereen voor te storen.
      // Bewust niet geawait en met een eigen .catch: een mislukte melding mag een geland vinkje
      // niet alsnog laten terugdraaien (zie de catch hieronder).
      if(newVal){
        // `.catch` en géén try/catch: `fireNotifEvent` is async, dus alles wat daarbinnen misgaat
        // wordt een verworpen belofte en gaat een synchrone try/catch straal voorbij.
        fireNotifEvent('alv_update',{code:r.code,naam:r.naam,title:`🏢 ${ALVO_LABELS[field]} — ${r.code}`})
          .catch(meldFout=>console.warn('[alv] melding niet verstuurd:', meldFout));
      }
      // geenDedup: hetzelfde vinkje binnen 15 s uit- en weer aanzetten geeft twee keer dezelfde
      // titel+tekst; zonder deze vlag slikt de ontdubbeling de tweede bevestiging in.
      showToast(`${ALVO_LABELS[field]} ${newVal?'aan':'uit'}`,`${r.code} – ${r.naam}`,newVal?'var(--gn)':'var(--mut)',newVal?'vink':'cirkelOpen',{geenDedup:true,geenSysteemmelding:true});
    });
  }catch(e){
    // Revert
    r[field]=oldVal;
    r.status=oldStatus;
    renderAlvo();
    renderNtdDonut();
    showToast('Opslaan mislukt',e.message||'Onbekende fout','var(--rd)');
    console.error('toggleAlvoFlag fout:',e);
  }finally{
    state._alvoFlagBezig.delete(sleutel);
    const btn2=document.querySelector(`.flag-toggle[data-idx="${idx}"][data-field="${field}"]`);
    if(btn2) btn2.classList.remove('toggling');
  }
}
function statusIco(s){return{Open:ico('zandloper'),Klaargezet:ico('klembord'),Gepland:ico('kalender'),Afgerond:ico('vinkCirkel')}[s]||''}

// ══════════════════════════════════════
//  ALV AFGEROND
// ══════════════════════════════════════
function renderAlfa(){
  const q=document.getElementById('s-alfa').value.toLowerCase().trim();
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
