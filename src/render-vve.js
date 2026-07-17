// ══════════════════════════════════════
//  PER-VVE-PAGINA — alles van één VvE op één scherm (Fase 5)
// ══════════════════════════════════════
import { esc, displayName, persBadges, berekenPrioriteit, opvolgStatus, parseDt, _vandaagAmsterdam, _verschilInKalenderdagen } from "./util.js";
import { ico } from "./icons.js";
import { SECS, SKEYS } from "./config.js";
import { state, D } from "./state.js";
import { goTo } from "./ui.js";
import { fmtLogTs, logItemHtml, logDayLabel, logPaginaSoort } from "./render-overig.js";
import { vveKenmerken, KENMERK_WAARDEN } from "./kenmerken.js";
import { backgroundWrite } from "./data.js";
import { appendRange } from "./api.js";
import { ensureToken } from "./auth.js";
import { getCurrentWho } from "./notifications.js";
// (kringverwijzing render-vve ⇄ ui/kenmerken is hetzelfde patroon als crud ⇄ main:
//  live bindings, de aanroep gebeurt pas op runtime)

// Pure helper (testbaar zonder DOM): verzamelt alles van één VvE uit de D-data.
// Let op: _verschilInKalenderdagen(a,b) rekent a−b in dagen; (vandaag, t) geeft
// dus "dagen geleden" als positief getal.
function vveOverzicht(code, data, vandaag){
  vandaag = vandaag || _vandaagAmsterdam();
  const open=[], weggelegd=[];
  SKEYS.forEach(s=>(data.ntd[s]||[]).forEach(r=>{
    if(r.code!==code) return;
    if(opvolgStatus(r, vandaag).weggelegd) weggelegd.push(r); else open.push(r);
  }));
  // open: te laat eerst, dan vroegste deadline
  open.sort((a,b)=>{
    const pa=berekenPrioriteit(a.deadline,a._sec,vandaag), pb=berekenPrioriteit(b.deadline,b._sec,vandaag);
    if(pa.teLaat!==pb.teLaat) return pa.teLaat?-1:1;
    return (parseDt(a.deadline)||Infinity)-(parseDt(b.deadline)||Infinity);
  });
  weggelegd.sort((a,b)=>parseDt(a.opvolgdatum)-parseDt(b.opvolgdatum));
  const afgerond=[];
  SKEYS.forEach(s=>(data.af[s]||[]).forEach(r=>{ if(r.code===code) afgerond.push(r); }));
  afgerond.sort((a,b)=>parseDt(b.datum)-parseDt(a.datum));
  const teLaat=open.filter(r=>berekenPrioriteit(r.deadline,r._sec,vandaag).teLaat).length;
  const logboek=(data.logboek||[]).filter(e=>e.code===code)
    .slice().sort((a,b)=>new Date(b.timestamp)-new Date(a.timestamp));
  let laatsteDagen=null;
  if(logboek.length){
    const t=new Date(logboek[0].timestamp);
    if(!isNaN(t)) laatsteDagen=_verschilInKalenderdagen(vandaag,t);
  }
  const alvo=(data.alvo||[]).find(r=>r.code===code)||null;
  const alfa=(data.alfa||[]).filter(r=>r.code===code)
    .sort((a,b)=>parseDt(b.datum)-parseDt(a.datum)); // nieuwste eerst → alfa[0] = laatst gehouden
  const naam=(open[0]?.naam)||(weggelegd[0]?.naam)||(alvo?.naam)||(afgerond[0]?.naam)||'';
  const behandelaars=[...new Set(open.concat(weggelegd)
    .flatMap(r=>(r.behandelaar||'').split(/[,\/]/).map(s=>s.trim()).filter(Boolean)))];
  return { code, naam, behandelaars, open, weggelegd, afgerond, alvo, alfa, logboek,
           budget: !!(alvo&&alvo.budget), // Budgetpakket-markering uit het ALV-overzicht (kolom F)
           cijfers:{ open:open.length, teLaat, weggelegd:weggelegd.length, laatsteDagen } };
}

// Pure helper (testbaar): omschrijving van een afgeronde regel.
// Een rij zonder tekst mag niet als kale datum in beeld komen (leest als een fout).
// We verzinnen niets: we vallen terug op het sectielabel dat wél in de data zit.
function afOmschrijving(r){
  const tekst=(r.actiepunt||r.periode||r.agendapunten||'').trim();
  if(tekst) return { tekst, leeg:false };
  const label=(SECS[r._sec]||{}).label||'Onbekende sectie';
  return { tekst:`${label} — geen omschrijving`, leeg:true };
}

// Dossier-logboek: contactsoorten, filter en feed-opbouw
const CONTACT_SOORTEN=[['Telefoon',ico('telefoon')],['E-mail',ico('envelop')],['Gesprek',ico('gesprek')],['Notitie',ico('potlood')]];

// Pure helper (testbaar): 'contact' = alleen handmatige contactmomenten
function filterDossierLog(entries, modus){
  return modus==='contact' ? entries.filter(e=>e.actie==='Contact') : entries;
}

function dossierFeed(entries){
  if(!entries.length) return '<div class="log-empty">Nog geen gebeurtenissen in dit dossier.</div>';
  let html='',lastDay='';
  entries.forEach(r=>{
    const dag=logDayLabel(r.timestamp);
    if(dag!==lastDay){ html+=`<div class="log-day">${dag}</div>`; lastDay=dag; }
    // Alleen onze eigen notities/contactmomenten mogen bewerkt/verwijderd worden.
    // Automatische regels (afgerond, aangemaakt, kenmerk…) hebben geen eigen tekst.
    html+=logItemHtml(r, false, logPaginaSoort(r.actie)==='normaal');
  });
  return html;
}

// Handmatig contactmoment vastleggen (composer op de VvE-pagina)
async function addContactLog(){
  const tekst=(document.getElementById('dos-tekst')?.value||'').trim();
  if(!tekst){ alert('Typ eerst wat er gebeurd is.'); return; }
  const code=state.vveCode;
  if(!code) return;
  if(!await ensureToken()){ alert('Inloggen mislukt.'); return; }
  const soort=state._contactSoort||'Telefoon';
  const wie=document.getElementById('dos-wie')?.value||'Overig';
  const who=getCurrentWho()||'?', ts=new Date().toISOString();
  const entry={_row:0,timestamp:ts,code,sectie:'',actie:'Contact',veld:soort,oudeWaarde:wie,nieuweWaarde:tekst,gebruiker:who};
  D.logboek.unshift(entry);
  const t=document.getElementById('dos-tekst'); if(t) t.value='';
  renderVve();
  backgroundWrite(
    ()=>appendRange("'Logboek'!A:H",[ts,code,'','Contact',soort,wie,tekst,who]),
    ()=>{ const i=D.logboek.indexOf(entry); if(i>-1) D.logboek.splice(i,1); },
    'Contactmoment vastleggen'
  );
}

// Kenmerken-kaart: weergave- of bewerkmodus (Beheerderskenmerken)
const KMK_PIL={'Gemeenschappelijk':'background:var(--gn-l);color:var(--gn)','Individueel':'background:var(--ac-l);color:var(--ac)'};
const kmkPil=v=>{const w=v||'Onbekend';return `<span class="badge" style="${KMK_PIL[w]||'background:var(--sur2);color:var(--mut)'}">${esc(w)}</span>`;};
function kenmerkenKaart(code){
  const k=vveKenmerken(code,D);
  if(state.kenmerkenEdit){
    const sel=(id,val)=>`<select id="${id}">${KENMERK_WAARDEN.map(w=>`<option${(val||'Onbekend')===w?' selected':''}>${w}</option>`).join('')}</select>`;
    return `<div class="kmk-rij"><span>Balkons</span>${sel('kmk-balkons',k.balkons)}</div>
      <div class="kmk-rij"><span>Kozijnen</span>${sel('kmk-kozijnen',k.kozijnen)}</div>
      <div class="kmk-bron-lbl">Bron</div>
      <textarea id="kmk-bron" rows="2" placeholder="bv. splitsingsakte art. 17, mail gemeente 03-2024">${esc(k.bron)}</textarea>
      <div class="kmk-knoppen">
        <button class="btn btn-sec btn-sm" data-action="kenmerken-annuleren">Annuleren</button>
        <button class="btn btn-pri btn-sm" data-action="kenmerken-opslaan">Opslaan</button>
      </div>`;
  }
  const wijz=k.gewijzigdOp?`<div class="kmk-wijz">laatst gewijzigd door ${esc(displayName(k.gewijzigdDoor)||'?')} · ${esc(fmtLogTs(k.gewijzigdOp))}</div>`:'';
  return `<div class="kmk-rij"><span>Balkons</span>${kmkPil(k.balkons)}</div>
    <div class="kmk-rij"><span>Kozijnen</span>${kmkPil(k.kozijnen)}</div>
    <div class="kmk-bron-lbl">Bron</div>
    <div class="kmk-bron">${k.bron?esc(k.bron):'<span style="color:var(--mut)">Nog geen bron vastgelegd</span>'}</div>${wijz}`;
}

// Navigeer naar het dossier van een VvE (en onthoud 'm voor het commandocentrum)
function openVvePagina(code){
  state.vveCode=code;
  state._vveAfAlles=false;
  state.kenmerkenEdit=false;
  state.vveLogFilter='alles';
  state._vveLogAlles=false;
  try{
    const lijst=JSON.parse(localStorage.getItem('recentVves')||'[]').filter(c=>c!==code);
    lijst.unshift(code);
    localStorage.setItem('recentVves',JSON.stringify(lijst.slice(0,3)));
  }catch(e){}
  goTo('vve');
}

function renderVve(){
  const wrap=document.getElementById('vve-inhoud');
  if(!wrap) return;
  const code=state.vveCode;
  if(!code){ wrap.innerHTML=`<div class="empty"><div class="empty-ico">${ico('gebouw')}</div>Zoek een VvE via Ctrl+K of klik op een VvE-code</div>`; return; }
  const o=vveOverzicht(code,D);
  // Composer-behoud: de 8s-poll re-rendert deze pagina; half getypte tekst mag
  // niet verdwijnen — alleen bewaren als het om dezelfde VvE gaat.
  const _oudT=document.getElementById('dos-tekst');
  const _bewaar=(_oudT&&_oudT.dataset.code===code)?{tekst:_oudT.value,wie:document.getElementById('dos-wie')?.value}:null;
  // De topbar houdt de vaste paginatitel uit PAGE_META ("VvE-dossier");
  // code + naam staan al groot in de kop hieronder — niet dubbel tonen.

  const taakRij=(r,weg)=>{
    const rid=state._rowCache.length; state._rowCache.push(r);
    const sec=r._sec, p=berekenPrioriteit(r.deadline,sec);
    const meta=SECS[sec]||{css:'',label:(sec||'?')}; // vangnet: één rij zonder geldige sectie mag niet de hele dossierpagina blanco maken
    const dl=weg
      ? `<span class="pill-snooze" data-action="taak-wegleggen" data-rid="${rid}">terug op ${esc(r.opvolgdatum)}</span>`
      : r.deadline
        ? `${esc(r.deadline)}${p.teLaat?` <span class="pill-telaat">Te laat (${Math.abs(p.dagenTot)}d)</span>`:''}`
        : '<span class="warn-geen-deadline">Geen deadline</span>';
    return `<tr class="${weg?'snooze-row':''}" data-action="taak-bewerken" data-rid="${rid}" style="cursor:pointer">
      <td class="cell-txt">${esc(r.actiepunt||r.periode||r.agendapunten||r.status||'')}</td>
      <td><span class="badge" style="${meta.css};background:var(--sec-l);color:var(--sec)">${esc(meta.label)}</span></td>
      <td>${persBadges(r.behandelaar)}</td>
      <td class="cell-sm">${dl}</td></tr>`;
  };
  const afLimiet=state._vveAfAlles?o.afgerond.length:5;
  const afRij=r=>`<tr><td class="cell-txt">${esc(r.actiepunt||r.periode||r.agendapunten||'')}</td>
    <td><span class="badge" style="background:var(--gn-l);color:var(--gn)">✓ ${esc(r.datum||'')}</span></td>
    <td class="cell-sm">${esc(r.opmerking||'')}</td></tr>`;
  const meerKnop=(!state._vveAfAlles&&o.afgerond.length>5)
    ?`<tr><td colspan="3"><button class="btn btn-sec btn-sm" data-action="vve-af-alles">Alle ${o.afgerond.length} tonen</button></td></tr>`:'';

  const alvKaart=()=>{
    let html='';
    if(o.alvo){
      html+=`<div class="vve-alv-rij"><b>Komende ALV</b><span class="badge status-${esc((o.alvo.status||'').toLowerCase().replace(/[^a-z0-9]+/g,'-'))}">${esc(o.alvo.status)}</span></div>
        <div class="vve-alv-flags">${['uitnodiging','notulen','begroting'].map(f=>
          `<span class="badge" style="background:${o.alvo[f]?'var(--gn-l)':'var(--sur2)'};color:${o.alvo[f]?'var(--gn)':'var(--mut)'}">${o.alvo[f]?'✓':'–'} ${f.charAt(0).toUpperCase()+f.slice(1)}</span>`).join('')}</div>`;
    }
    if(o.alfa.length){
      const l=o.alfa[0]; // nieuwste eerst (gesorteerd in vveOverzicht)
      html+=`<div class="vve-alv-rij" style="color:var(--mut)">Laatst gehouden: ${esc(l.datum||'')}</div>`;
    }
    return html||'<span style="color:var(--mut);font-size:12.5px">Geen ALV-gegevens</span>';
  };

  const dosEntries=filterDossierLog(o.logboek,state.vveLogFilter);
  const dosLimiet=state._vveLogAlles?dosEntries.length:30;
  const dosMeer=(!state._vveLogAlles&&dosEntries.length>30)
    ?`<button class="btn btn-sec btn-sm" data-action="vve-log-alles" style="margin:10px auto 2px;display:block">Alle ${dosEntries.length} tonen</button>`:'';

  const kc=(n,lbl,cls)=>`<div class="kc ${cls}"><b>${n}</b><span>${lbl}</span></div>`;
  wrap.innerHTML=`
    <div class="vve-kop">
      <div class="vve-naam">
        <span class="code" style="--sec:var(--ac);--sec-l:var(--ac-l);font-size:15px;padding:5px 11px">${esc(o.code)}</span>
        <div><h3>${esc(o.naam||'Onbekende VvE')}${o.budget?' <span class="badge budget-tag" title="Budgetpakket — vergadert zelf">Budget</span>':''}</h3>
        <div class="sub">${o.behandelaars.length?'behandelaars: '+persBadges(o.behandelaars.join(', ')):'<span style="color:var(--mut)">geen lopende taken</span>'}</div></div>
      </div>
      <div class="kerncijfers">
        ${kc(o.cijfers.open,o.cijfers.open===1?'open taak':'open taken','teal')}
        ${kc(o.cijfers.laatsteDagen==null?'—':o.cijfers.laatsteDagen+' d','laatste activiteit','grijs')}
        <button class="kc-plus" data-action="vve-taak-nieuw" data-code="${esc(o.code)}" data-naam="${esc(o.naam||'')}" title="Nieuwe taak voor deze VvE" aria-label="Nieuwe taak voor deze VvE"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></button>
      </div>
    </div>
    <div class="vve-grid">
      <div>
        <div class="vve-sectie">Open taken <span class="n">${o.open.length}</span></div>
        <div class="card"><div class="tbl-wrap"><table>
          <thead><tr><th>Taak</th><th>Categorie</th><th>Wie</th><th>Deadline</th></tr></thead>
          <tbody>${o.open.map(r=>taakRij(r,false)).join('')||`<tr><td colspan="4" style="color:var(--mut);padding:14px">Geen open taken ${ico('feest',14).replace('<svg ','<svg style="vertical-align:-2.5px" ')}</td></tr>`}</tbody>
        </table></div></div>
        ${o.weggelegd.length?`<div class="vve-sectie">Weggelegd <span class="n">${o.weggelegd.length}</span></div>
        <div class="card"><div class="tbl-wrap"><table><tbody>${o.weggelegd.map(r=>taakRij(r,true)).join('')}</tbody></table></div></div>`:''}
        <div class="vve-sectie">Laatst afgerond <span class="n">${o.afgerond.length}</span></div>
        <div class="card"><div class="tbl-wrap"><table>
          <tbody>${o.afgerond.slice(0,afLimiet).map(afRij).join('')||'<tr><td style="color:var(--mut);padding:14px">Nog niets afgerond</td></tr>'}${meerKnop}</tbody>
        </table></div></div>
      </div>
      <div>
        <div class="vve-sectie">ALV's</div>
        <div class="vve-kaart">${alvKaart()}</div>
        <div class="vve-sectie" style="margin-top:18px">Beheerderskenmerken
          ${state.kenmerkenEdit?'':`<button class="btn btn-sec btn-sm" data-action="kenmerken-bewerken" style="margin-left:auto">${ico('potlood',12)} Bewerken</button>`}
        </div>
        <div class="vve-kaart">${kenmerkenKaart(code)}</div>
      </div>
    </div>
    <div class="vve-sectie" style="margin-top:22px">Dossier-logboek <span class="n">${o.logboek.length}</span>
      <span class="dos-filters">
        <button class="dos-filter${state.vveLogFilter!=='contact'?' aan':''}" data-action="vve-log-filter" data-modus="alles">Alles</button>
        <button class="dos-filter${state.vveLogFilter==='contact'?' aan':''}" data-action="vve-log-filter" data-modus="contact">Alleen contactmomenten</button>
      </span>
    </div>
    <div class="card dossier-card">
      <div class="dos-composer">
        <textarea id="dos-tekst" data-code="${esc(o.code)}" rows="2" placeholder="Leg vast wat er gebeurd is — bv. zojuist gebeld met een eigenaar… (Ctrl+Enter = vastleggen)"></textarea>
        <div class="dos-rij">
          <div class="dos-chips">${CONTACT_SOORTEN.map(([s,sIco])=>
            `<button class="soort-chip${(state._contactSoort||'Telefoon')===s?' aan':''}" data-action="contact-soort" data-soort="${s}">${sIco} ${s}</button>`).join('')}</div>
          <select id="dos-wie" title="Met wie was het contact?">
            <option>Bewoner/eigenaar</option><option>Bestuur</option><option>Leverancier</option><option>Overig</option>
          </select>
          <button class="btn btn-pri btn-sm" data-action="contact-vastleggen">Vastleggen</button>
        </div>
      </div>
      <div class="dos-feed">${dossierFeed(dosEntries.slice(0,dosLimiet))}${dosMeer}</div>
    </div>`;
  if(_bewaar){
    const t=document.getElementById('dos-tekst'); if(t) t.value=_bewaar.tekst;
    const w=document.getElementById('dos-wie'); if(w&&_bewaar.wie) w.value=_bewaar.wie;
  }
}

export { vveOverzicht, openVvePagina, renderVve, filterDossierLog, dossierFeed, addContactLog, afOmschrijving };
