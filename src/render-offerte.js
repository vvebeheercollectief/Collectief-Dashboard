// ══════════════════════════════════════
//  RENDER-OFFERTE — offerte-motor (Vandaag-paneel, hero, aannemers, fase, groepen)
//  Verplaatst uit render-lijsten.js (Batch D / punt 11) — zuivere refactor, geen gedragswijziging.
// ══════════════════════════════════════
import { esc, parseOff, parseAannemers, reconcileOffertes, offerteNuOpvolgen, offerteSorteerScore, offerteBriefingFeiten, offerteNabelTeller, _vandaagAmsterdam } from "./util.js";
import { state, D } from "./state.js";

// ══════════════════════════════════════
//  OFFERTE-BRIEFING (Fase 4) — dagelijkse samenvatting bovenaan de offerte-tab
// ══════════════════════════════════════
// Offerte-briefing: balBij → natuurlijke NL-tekst.
function offerteBalBijTekst(balBij){
  return {aannemer:'bal bij de aannemer', ons:'bal bij ons', vve:'bal bij de eigenaren'}[balBij] || '';
}
// Vult de briefing-slot met de C2-kop (altijd zichtbaar op de offerte-tab); leeg op andere tabs.
// Het "Vandaag"-focuspaneel: cijfer-strip + Doorsturen/Nabellen-blokken + inklap-voet.
// 'Nu dit'-kaart: de urgentste taak van dit moment, met reden en directe actieknop.
function offerteHeroKaart(r, daarna, nuLen){
  const rid=state._rowCache.length; state._rowCache.push(r);
  const st=r._offStatus||{};
  const dagen=st.dagen;
  const omschr=esc(((r.opmerkingen||'').split('\n')[0]||'').slice(0,70));
  const isSend=st.actie==='Doorsturen';
  const reden=st.deadlineTeLaat
    ? `<span class="of-hero-reden laat">Deadline verlopen</span>`
    : (dagen!=null?`<span class="of-hero-reden">${dagen} dagen stil</span>`:`<span class="of-hero-reden">opvolgen</span>`);
  const ctx=[dagen!=null?`${dagen} dagen geen reactie`:'opvolgen', offerteBalBijTekst(st.balBij), omschr].filter(Boolean).join(' · ');
  const knop=isSend
    ? `<button class="of-btn-send" data-action="offerte-doorsturen" data-rid="${rid}">Doorsturen</button>`
    : `<button class="of-btn-call" data-action="offerte-nabellen" data-rid="${rid}">Nabellen</button>`;
  const voet=`<div class="of-hero-voet"><span>${daarna?`Daarna: <b>${esc(daarna.naam||'')}</b>`:''}</span><span>${nuLen} te doen vandaag</span></div>`;
  return `<div class="of-hero">
    <div class="of-hero-kick">Begin hier</div>
    <div class="of-hero-body">
      <div class="of-hero-mid">
        <div class="of-hero-line">${reden}<span class="of-hero-code">${esc(r.code)}</span></div>
        <div class="of-hero-naam">${esc(r.naam||'')}</div>
        <div class="of-hero-ctx">${ctx}</div>
      </div>
      <div class="of-hero-act">${knop}</div>
    </div>
    ${voet}
  </div>`;
}
function renderOfferteBriefing(zoekActief){
  const slot=document.getElementById('off-briefing-slot');
  if(!slot) return;
  // Niet op de offerte-tab, óf de gebruiker zoekt/filtert: geen Vandaag-blok tonen
  // (tijdens zoeken laat renderNtd de gefilterde tabel zien).
  if(state.activeNtd!=='OFFERTE-TRAJECTEN' || zoekActief){ slot.innerHTML=''; return; }
  const rijen=D.ntd['OFFERTE-TRAJECTEN']||[];
  const actMap=_offerteActiviteitMap(D.logboek);
  rijen.forEach(r=>_verrijkOfferteRij(r,actMap));
  const vandaag=_vandaagAmsterdam();
  const nu=[];
  rijen.forEach(r=>{ const st=offerteNuOpvolgen(r,vandaag); r._offStatus=st; r._offNu=st.nodig; if(st.nodig) nu.push(r); });
  nu.sort((a,b)=>offerteSorteerScore(b,vandaag)-offerteSorteerScore(a,vandaag));
  // Een rij met open aannemer-paneel — of die je deze sessie bewerkt hebt — blijft op z'n plek
  // en zichtbaar (cap-exempt) en wordt niet naar de 'Nu dit'-kaart getrokken. We bevriezen de
  // sectie bij openen; voor een bewerkte rij blijft die bevriezing staan tot de pagina ververst,
  // zodat de teller-herberekening (aannemer toevoegen → andere fase) de rij niet onder je
  // vandaan naar een andere groep schuift of onder de "Toon meer"-vouw laat vallen (bug #1).
  const open=r=>state.offerteAannOpen.has(r.code);
  const pinned=r=>open(r)||state.offerteAannMut.has(r.code);
  nu.forEach(r=>{ if(open(r) && !state.offerteAannSnap[r.code]) state.offerteAannSnap[r.code]=r._offStatus.actie; });
  const sectie=r=> (pinned(r) && state.offerteAannSnap[r.code]) ? state.offerteAannSnap[r.code] : r._offStatus.actie;
  // 'Nu dit'-kaart = urgentste taak die niet open/bewerkt is (zo'n rij wordt nooit naar de kaart getrokken).
  const hero=nu.find(r=>!pinned(r))||null;
  const rest=nu.filter(r=>r!==hero);
  const doorsturenAll=nu.filter(r=>r._offStatus.actie==='Doorsturen');
  const nabellenAll=nu.filter(r=>r._offStatus.actie!=='Doorsturen');
  const doorsturen=rest.filter(r=>sectie(r)==='Doorsturen');
  const nabellen=rest.filter(r=>sectie(r)!=='Doorsturen');
  const vastgelopen=nabellenAll.filter(r=>offerteNabelTeller(r.code,D.logboek)>=3).length;
  const f=offerteBriefingFeiten(rijen);
  const datumLabel=new Date().toLocaleDateString('nl-NL',{weekday:'long',day:'numeric',month:'long'});
  const DCAP=3, NCAP=5;
  // Cap, maar een open/bewerkte rij blijft altijd zichtbaar (verdwijnt niet onder de vouw).
  const dShow=state.offerteDoorsturenOpen?doorsturen:doorsturen.filter((r,i)=>i<DCAP||pinned(r));
  const nShow=state.offerteNabellenOpen?nabellen:nabellen.filter((r,i)=>i<NCAP||pinned(r));
  // 'Daarna'-vooruitblik = de urgentste niet-open/bewerkte taak in de secties.
  const daarna=[...doorsturen,...nabellen].sort((a,b)=>offerteSorteerScore(b,vandaag)-offerteSorteerScore(a,vandaag)).find(r=>!pinned(r))||null;
  const stat=(val,cls,cap)=>`<div class="of-stat"><span class="of-num ${cls}">${val}</span><span class="of-cap">${cap}</span></div>`;
  const blok=(titel,cnt,sub,rows,soort,meer,actie)=>
    `<div class="of-sec-h ${soort==='doorsturen'?'send':'call'}"><span>${titel}</span><span class="of-cnt">· ${cnt}</span><span class="of-sub">— ${sub}</span></div>`
    +(rows.length?rows.map(r=>offerteFocusRij(r,soort)).join('')
      :`<div class="of-leeg">Niets ${soort==='doorsturen'?'klaar om te versturen':'om na te bellen'}</div>`)
    +(meer>0?`<button class="of-meer" data-action="${actie}">Toon ${meer} meer ▾</button>`:'');
  const heroHtml = hero ? offerteHeroKaart(hero, daarna, nu.length)
                 : (nu.length ? '' : `<div class="of-hero leeg">Niets dringends vandaag — mooi bezig.</div>`);
  slot.innerHTML=`<div class="of-pan">
    <div class="of-top"><span class="of-kick">Vandaag</span><span class="of-date">${esc(datumLabel)}</span></div>
    ${heroHtml}
    <div class="of-strip">
      ${stat(nu.length,'','Te doen')}
      ${stat(vastgelopen,vastgelopen?'red':'muted','Vastgelopen')}
      ${stat(doorsturenAll.length,'','Klaar te versturen')}
      ${stat(f.klaarTeGunnen,f.klaarTeGunnen?'':'muted','Bij de VvE')}
    </div>
    ${blok('Doorsturen',doorsturen.length,'offerte binnen, klaar voor de eigenaren · kun je nu afmaken',dShow,'doorsturen',state.offerteDoorsturenOpen?0:doorsturen.length-dShow.length,'offerte-meer-d')}
    ${blok('Nabellen',nabellen.length,'langst stil eerst, bal bij de aannemer',nShow,'nabellen',state.offerteNabellenOpen?0:nabellen.length-nShow.length,'offerte-meer-n')}
    <div class="of-voet"><span class="of-voet-lbl">Hele lijst · ${rijen.length} trajecten</span>
      <button class="of-voet-tog" data-action="offerte-tabel-toggle">${state.offerteTabelOpen?'Tabel verbergen ▴':'Volledige tabel tonen ▾'}</button></div>
  </div>`;
}

// Klikbare samenvatting boven het aannemers-paneel (gedeeld: Vandaag + tabel).
function offerteAannSamenvatting(r){
  const lijst=r._aannemers||[];
  const open=state.offerteAannOpen.has(r.code);
  const lbl=lijst.length
    ? `Aannemers · ${lijst.filter(a=>a.binnen).length} van ${lijst.length} binnen`
    : 'Aannemers toevoegen';
  return `<span class="of-aann-tog" data-action="offerte-aann-open" data-code="${esc(r.code)}">${open?'▾':'▸'} ${lbl}</span>`;
}
// Uitklapbaar aannemers-lijstje voor één traject (gedeeld: Vandaag-focusrij + tabelrij).
function offerteAannemerPaneel(r){
  const code=esc(r.code);
  const rijen=(r._aannemers||[]).map((a,i)=>`<div class="of-aann-rij">
      <span class="of-aann-naam">${esc(a.naam)}</span>
      <button class="of-aann-st ${a.binnen?'in':''}" data-action="offerte-aann-binnen" data-code="${code}" data-idx="${i}">${a.binnen?'✓ binnen':'nog niet'}</button>
      <button class="of-aann-x" data-action="offerte-aann-verwijder" data-code="${code}" data-idx="${i}" title="Verwijderen" aria-label="Verwijderen">×</button>
    </div>`).join('');
  return `<div class="of-aann-paneel">${rijen}
    <div class="of-aann-add">
      <input class="of-aann-input" data-code="${code}" placeholder="Aannemer toevoegen…" autocomplete="off" aria-label="Aannemer toevoegen">
      <button class="of-aann-toevoeg" data-action="offerte-aann-add" data-code="${code}">+ Toevoegen</button>
    </div>
  </div>`;
}

// Eén mini-rij in het Vandaag-paneel (krijgt een eigen rid in _rowCache voor de knoppen).
function offerteFocusRij(r, soort){
  const rid=state._rowCache.length; state._rowCache.push(r);
  const omschr=esc(((r.opmerkingen||'').split('\n')[0]||'').slice(0,60));
  let ctx, knop;
  if(soort==='doorsturen'){
    const [recv,req]=parseOff(r.offertes||'');
    ctx=`<span class="of-recv">${recv}/${req} binnen</span>${omschr?` · ${omschr}`:''}`;
    knop=`<button class="of-btn-send" data-action="offerte-doorsturen" data-rid="${rid}">Doorsturen</button>`;
  } else {
    const dagen=r._offStatus&&r._offStatus.dagen;
    const t=offerteNabelTeller(r.code,D.logboek);
    const vast=t>=3?` · <span class="of-vast">${t}× nagebeld</span>`:'';
    ctx=`<span class="of-stil">${dagen!=null?dagen+' dagen stil':'opvolgen'}</span>${vast}${omschr?` · ${omschr}`:''}`;
    knop=`<button class="of-btn-call" data-action="offerte-nabellen" data-rid="${rid}">Nabellen</button>`;
  }
  const open=state.offerteAannOpen.has(r.code);
  return `<div class="of-rij-wrap${open?' open':''}">
    <div class="of-r"><span class="of-code" style="color:var(--sec)">${esc(r.code)}</span>
      <div class="of-mid"><div class="of-naam">${esc(r.naam||'')}</div><div class="of-ctx">${ctx}</div>${offerteAannSamenvatting(r)}</div>
      <div class="of-act"><button class="of-edit" data-action="taak-bewerken" data-rid="${rid}" title="Bewerken" aria-label="Bewerken"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>${soort==='nabellen'?`<span class="of-later" data-action="offerte-ontvangen" data-rid="${rid}" title="Offerte ontvangen van aannemer">ontvangen</span>`:''}<span class="of-later" data-action="offerte-gegund" data-rid="${rid}" title="Markeer als gegund (uit opvolging)">gegund</span><span class="of-later" data-action="offerte-later" data-rid="${rid}" title="Tot morgen wegleggen">later</span>${knop}</div></div>
    ${open?offerteAannemerPaneel(r):''}
  </div>`;
}
// Offerte-motor: jongste logboek-activiteit per VvE-code (één pass over het logboek).
function _offerteActiviteitMap(logboek){
  const map=new Map();
  (logboek||[]).forEach(e=>{
    if(e.sectie!=='OFFERTE-TRAJECTEN'||!e.code||!e.timestamp) return;
    const t=new Date(e.timestamp); if(isNaN(t)) return;
    const cur=map.get(e.code); if(!cur||t>cur) map.set(e.code,t);
  });
  return map;
}
// Offerte-motor: zet de jongste activiteit op de rij als LOKALE datum (voedt offerteStilBasis).
function _verrijkOfferteRij(r, actMap){
  const t=actMap.get(r.code)||null;
  r.laatsteActiviteit=t?`${t.getFullYear()}-${t.getMonth()+1}-${t.getDate()}`:'';
  // Aannemerslijst (kolom P) stuurt de X/N-teller: leg de echte D-waarde éénmalig vast,
  // override alleen in het geheugen wanneer er aannemers zijn. Kolom D blijft ongewijzigd.
  if(r._offertesManual===undefined) r._offertesManual=r.offertes;
  r._aannemers=parseAannemers(r.aannemers);
  // Handmatige D-waarde = ondergrens, aannemer-vinkjes kunnen 'm alleen ophogen (reconcileOffertes).
  // Voorheen overschreef de aannemerslijst de D-waarde blind → een handmatig "1/3" werd "0/3".
  r.offertes=reconcileOffertes(r._offertesManual, r._aannemers);
  return r;
}

// Offerte-motor: splits rijen in {nu, lopend}; 'nu' aflopend op urgentie gesorteerd.
// Zet r._offNu als die nog niet bepaald is (zodat directe aanroepen uit tests ook werken).
function offerteGroepen(rijen, vandaag){
  const nodig=r=>{ if(r._offNu===undefined){ const st=offerteNuOpvolgen(r,vandaag); r._offStatus=st; r._offNu=st.nodig; } return r._offNu; };
  const nu=rijen.filter(nodig)
                .sort((a,b)=>offerteSorteerScore(b,vandaag)-offerteSorteerScore(a,vandaag));
  const lopend=rijen.filter(r=>!nodig(r));
  return {nu, lopend};
}

export { offerteBalBijTekst, offerteHeroKaart, renderOfferteBriefing, offerteAannSamenvatting, offerteAannemerPaneel, offerteFocusRij, _offerteActiviteitMap, _verrijkOfferteRij, offerteGroepen };
