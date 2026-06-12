// ══════════════════════════════════════
//  PER-VVE-PAGINA — alles van één VvE op één scherm (Fase 5)
// ══════════════════════════════════════
import { esc, displayName, persBadges, berekenPrioriteit, opvolgStatus, parseDt, _vandaagAmsterdam, _verschilInKalenderdagen } from "./util.js";
import { SECS, SKEYS } from "./config.js";
import { state, D } from "./state.js";
import { goTo } from "./ui.js";
import { avatarKleur, logZin, logTijd, fmtLogTs, logItemHtml, logDayLabel } from "./render-overig.js";
import { vveKenmerken, KENMERK_WAARDEN } from "./kenmerken.js";
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
  const alfa=(data.alfa||[]).filter(r=>r.code===code);
  const naam=(open[0]?.naam)||(weggelegd[0]?.naam)||(alvo?.naam)||(afgerond[0]?.naam)||'';
  const behandelaars=[...new Set(open.concat(weggelegd)
    .flatMap(r=>(r.behandelaar||'').split(/[,\/]/).map(s=>s.trim()).filter(Boolean)))];
  return { code, naam, behandelaars, open, weggelegd, afgerond, alvo, alfa, logboek,
           cijfers:{ open:open.length, teLaat, weggelegd:weggelegd.length, laatsteDagen } };
}

// Kenmerken-kaart: weergave- of bewerkmodus (Beheerderskenmerken)
const KMK_PIL={'Ja':'background:var(--gn-l);color:var(--gn)','Nee':'background:var(--rd-l);color:var(--rd)','Deels':'background:var(--am-l);color:var(--am)'};
const kmkPil=v=>{const w=v||'Onbekend';return `<span class="badge" style="${KMK_PIL[w]||'background:var(--sur2);color:var(--mut)'}">${esc(w)}</span>`;};
function kenmerkenKaart(code){
  const k=vveKenmerken(code,D);
  if(state.kenmerkenEdit){
    const sel=(id,val)=>`<select id="${id}">${KENMERK_WAARDEN.map(w=>`<option${(val||'Onbekend')===w?' selected':''}>${w}</option>`).join('')}</select>`;
    return `<div class="kmk-rij"><span>Balkons gemeenschappelijk</span>${sel('kmk-balkons',k.balkons)}</div>
      <div class="kmk-rij"><span>Kozijnen gemeenschappelijk</span>${sel('kmk-kozijnen',k.kozijnen)}</div>
      <div class="kmk-bron-lbl">Bron</div>
      <textarea id="kmk-bron" rows="2" placeholder="bv. splitsingsakte art. 17, mail gemeente 03-2024">${esc(k.bron)}</textarea>
      <div class="kmk-knoppen">
        <button class="btn btn-sec btn-sm" data-action="kenmerken-annuleren">Annuleren</button>
        <button class="btn btn-pri btn-sm" data-action="kenmerken-opslaan">Opslaan</button>
      </div>`;
  }
  const wijz=k.gewijzigdOp?`<div class="kmk-wijz">laatst gewijzigd door ${esc(displayName(k.gewijzigdDoor)||'?')} · ${esc(fmtLogTs(k.gewijzigdOp))}</div>`:'';
  return `<div class="kmk-rij"><span>Balkons gemeenschappelijk</span>${kmkPil(k.balkons)}</div>
    <div class="kmk-rij"><span>Kozijnen gemeenschappelijk</span>${kmkPil(k.kozijnen)}</div>
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
  if(!code){ wrap.innerHTML='<div class="empty"><div class="empty-ico">🏢</div>Zoek een VvE via Ctrl+K of klik op een VvE-code</div>'; return; }
  const o=vveOverzicht(code,D);
  if(document.getElementById('page-vve').classList.contains('active')){
    document.getElementById('page-title').textContent=`${o.code} — ${o.naam||'VvE'}`;
    document.getElementById('page-sub').textContent='VvE-dossier · alles op één scherm';
  }

  const taakRij=(r,weg)=>{
    const rid=state._rowCache.length; state._rowCache.push(r);
    const sec=r._sec, p=berekenPrioriteit(r.deadline,sec);
    const dl=weg
      ? `<span class="pill-snooze" data-action="taak-wegleggen" data-rid="${rid}">terug op ${esc(r.opvolgdatum)}</span>`
      : r.deadline
        ? `${esc(r.deadline)}${p.teLaat?` <span class="pill-telaat">Te laat (${Math.abs(p.dagenTot)}d)</span>`:''}`
        : '<span class="warn-geen-deadline">Geen deadline</span>';
    return `<tr class="${weg?'snooze-row':''}" data-action="taak-bewerken" data-rid="${rid}" style="cursor:pointer">
      <td class="cell-txt">${esc(r.actiepunt||r.periode||r.agendapunten||r.status||'')}</td>
      <td><span class="badge" style="${SECS[sec].css};background:var(--sec-l);color:var(--sec)">${esc(SECS[sec].label)}</span></td>
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
      html+=`<div class="vve-alv-rij"><b>Komende ALV</b><span class="badge status-${o.alvo.status.toLowerCase()}">${esc(o.alvo.status)}</span></div>
        <div class="vve-alv-flags">${['uitnodiging','notulen','begroting'].map(f=>
          `<span class="badge" style="background:${o.alvo[f]?'var(--gn-l)':'var(--sur2)'};color:${o.alvo[f]?'var(--gn)':'var(--mut)'}">${o.alvo[f]?'✓':'–'} ${f.charAt(0).toUpperCase()+f.slice(1)}</span>`).join('')}</div>`;
    }
    if(o.alfa.length){
      const l=o.alfa[o.alfa.length-1];
      html+=`<div class="vve-alv-rij" style="color:var(--mut)">Laatst gehouden: ${esc(l.datum||'')}</div>`;
    }
    return html||'<span style="color:var(--mut);font-size:12.5px">Geen ALV-gegevens</span>';
  };

  const kc=(n,lbl,cls)=>`<div class="kc ${cls}"><b>${n}</b><span>${lbl}</span></div>`;
  wrap.innerHTML=`
    <div class="vve-kop">
      <div class="vve-naam">
        <span class="code" style="--sec:var(--ac);--sec-l:var(--ac-l);font-size:15px;padding:5px 11px">${esc(o.code)}</span>
        <div><h3>${esc(o.naam||'Onbekende VvE')}</h3>
        <div class="sub">${o.behandelaars.length?'behandelaars: '+persBadges(o.behandelaars.join(', ')):'<span style="color:var(--mut)">geen lopende taken</span>'}</div></div>
      </div>
      <div class="kerncijfers">
        ${kc(o.cijfers.open,'open taken','teal')}
        ${kc(o.cijfers.teLaat,'te laat',o.cijfers.teLaat?'rood':'grijs')}
        ${kc(o.cijfers.weggelegd,'weggelegd','grijs')}
        ${kc(o.cijfers.laatsteDagen==null?'—':o.cijfers.laatsteDagen+' d','laatste activiteit','')}
      </div>
    </div>
    <div class="vve-grid">
      <div>
        <div class="vve-sectie">Open taken <span class="n">${o.open.length}</span></div>
        <div class="card"><div class="tbl-wrap"><table>
          <thead><tr><th>Taak</th><th>Categorie</th><th>Wie</th><th>Deadline</th></tr></thead>
          <tbody>${o.open.map(r=>taakRij(r,false)).join('')||'<tr><td colspan="4" style="color:var(--mut);padding:14px">Geen open taken 🎉</td></tr>'}</tbody>
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
          ${state.kenmerkenEdit?'':'<button class="btn btn-sec btn-sm" data-action="kenmerken-bewerken" style="margin-left:auto">✎ Bewerken</button>'}
        </div>
        <div class="vve-kaart">${kenmerkenKaart(code)}</div>
      </div>
    </div>`;
}

export { vveOverzicht, openVvePagina, renderVve };
