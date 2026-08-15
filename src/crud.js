// ══════════════════════════════════════
//  CRUD — taak-modals, sheet-helpers, toevoegen/afronden/verwijderen
// ══════════════════════════════════════
import { esc, berekenPrioriteit, toISODate, toDutchDate, nieuwTaakId, taakTitel } from "./util.js";
import { state, D } from "./state.js";
import { SECS, SKEYS, SID } from "./config.js";
import { writeRange, _shiftNtdRows, _herstelShift, assertRowMatch } from "./api.js";
import { ensureToken } from "./auth.js";
import { showToast, showUndoToast, fireNotifEvent, undoComplete, undoDelete } from "./notifications.js";
import { animateRowOut, flashRow } from "./anim.js";
import { logEvent, renderTaskHistory } from "./render-overig.js";
import { backgroundWrite, loadAll, blokkeerOffline } from "./data.js";
import { faseIndex, faseWoord, faseRijHtml, faseWijziging } from "./subsidie-fase.js";
import { bouwBundelIndex, bundelVan, zichtbareKop, zelfdeTaak } from "./bundel.js";
import { koppelTaak } from "./bundel-acties.js";

// Welke formuliergroep hoort bij welke sectie. Eén bron: openModal verbergt ze
// allemaal via deze map en toont er precies één, dus een zesde sectie raakt
// straks maar één plek in plaats van vijf losse regels.
const FG_PER_SECTIE = {
  OPPAKKEN:'fg-opp', VERGADERVERZOEKEN:'fg-verg', 'OFFERTE-TRAJECTEN':'fg-off',
  LOD:'fg-lod', 'SUBSIDIE-TRAJECTEN':'fg-sub',
};
import { renderAll } from "./main.js";

//  MODAL — Open / Close
// ══════════════════════════════════════
// Alles wat aan de gekozen categorie hangt: de stand in `state.editSec` (waar submitTask op
// afgaat), de titel, het kleuraccent en het zichtbare veldblok. Eén functie, want de
// categorie-kiezer hieronder moet exact dezelfde vier dingen omzetten als openModal — een tweede
// kopie zou bij de eerstvolgende wijziging stil uit de pas lopen (zelfde afweging als
// FG_PER_SECTIE zelf).
function toonSectie(sec,isEdit){
  state.editSec=sec;
  document.getElementById('m-title').textContent=(isEdit?'Taak bewerken — ':'Taak toevoegen — ')+SECS[sec].label;
  // Section colour for focus rings
  document.documentElement.style.setProperty('--modal-sec',SECS[sec].color);
  // Show correct field group
  Object.values(FG_PER_SECTIE).forEach(id=>{const el=document.getElementById(id);if(el)el.style.display='none';});
  const fg=FG_PER_SECTIE[sec];
  if(fg) document.getElementById(fg).style.display='';
}

// De categorie-kiezer. Alleen zichtbaar bij TOEVOEGEN: een bestaande taak van categorie wisselen
// betekent hem naar een ander blok van het tabblad verplaatsen, met een andere kolomindeling en
// een andere rij — dat bestaat niet als functie, en een kiezer die het aanbiedt belooft iets wat
// submitTask niet doet.
// De opties komen uit SECS en niet uit vaste HTML, zodat een zesde sectie hier vanzelf meekomt —
// net als bij FG_PER_SECTIE. Eén keer vullen is genoeg; daarna alleen de stand zetten.
function zetSectieKiezer(sec,isEdit){
  const vak=document.getElementById('fld-sectie'), kies=document.getElementById('m-sec');
  if(!vak||!kies) return;
  vak.style.display=isEdit?'none':'';
  if(!kies.options.length)
    kies.innerHTML=SKEYS.map(s=>`<option value="${esc(s)}">${esc(SECS[s].label)}</option>`).join('');
  kies.value=sec;
}

// Een andere categorie kiezen in het toevoegscherm. Zet alleen de LOKALE stand; er gaat pas iets
// naar de Sheet bij Toevoegen (zelfde afweging als de fase-bolletjes in de modal).
// De ingevulde velden van de vorige categorie blijven staan maar zijn verborgen: submitTask leest
// uitsluitend de velden van `state.editSec`, dus ze kunnen niet meeliften.
function kiesSectie(sec){
  if(!SECS[sec]||state.editMode) return;
  toonSectie(sec,false);
}

function openModal(isEdit,rowData,opts){
  state.editMode=!!isEdit;
  const sec=isEdit?rowData._sec:((opts&&opts.sec)||state.activeNtd);
  state.editRowData=rowData||null;
  toonSectie(sec,isEdit);

  document.getElementById('m-submit-lbl').textContent=isEdit?'Opslaan':'Toevoegen';
  document.getElementById('m-del').style.display=isEdit?'inline-flex':'none';
  document.getElementById('m-af').style.display=isEdit?'inline-flex':'none';

  if(isEdit&&state.editRowData){
    document.getElementById('m-code').value=state.editRowData.code||'';
    document.getElementById('m-naam').value=state.editRowData.naam||'';
    fillModalFields(sec,state.editRowData);
    renderTaskHistory(state.editRowData.code,sec);
    zetHoortBij(state.editRowData);
  } else {
    clearModal();
    zetHoortBij(null);
    document.getElementById('fg-history').style.display='none';
    // Vooraf ingevulde VvE (bv. +-knop op de dossierpagina): code + naam zetten,
    // net alsof de gebruiker 'm via het zoekveld had gekozen.
    if(opts&&opts.code){
      document.getElementById('m-code').value=opts.code;
      document.getElementById('m-naam').value=opts.naam||'';
    }
  }

  // Ná de tak hierboven: `clearModal` zet élk veld in de modal-body op '' en dat geldt ook voor
  // een <select>, die daarmee op 'geen selectie' zou blijven staan.
  zetSectieKiezer(sec,isEdit);

  document.getElementById('modal-bg').classList.add('open');
}

function editRow(r){ openModal(true,r); }

function closeModal(){
  document.getElementById('modal-bg').classList.remove('open');
  // Élke sluitweg van dit venster loopt hierlangs — kruisje, Annuleren, klik naast het venster en
  // Escape zijn in main.js alle vier aan closeModal geknoopt. Dit is dus de plek waar een
  // niet-verstuurde subtaak zijn bundel weer loslaat.
  state._nieuwBundel=null;
  // Om dezelfde reden ook de in 'Hoort bij' aangewezen doeltaak. Een volgend `openModal` ruimt hem
  // via zetHoortBij/clearModal toch al op, dus dit is vandaag geen zichtbaar verschil — maar dan
  // hangt de belofte 'een keuze hoort bij het scherm waarin hij is gemaakt' aan de aanname dat
  // submitTask nooit buiten een geopend venster om draait. Die aanname is hier niet nodig.
  state._hbDoel=null;
  // En het NTD-tabblad terug naar waar de gebruiker vandaan kwam. `prefillNieuweTaak` (ai.js)
  // verzet `state.activeNtd` al bij het openen — vóór enige bevestiging — en dit venster kan op
  // vier manieren weg zonder dat er iets is aangemaakt. `submitTask` wist de vlag zodra de taak
  // wél bestaat, dus daar blijft het nieuwe tabblad staan.
  if(state._ntdVoorModal){ state.activeNtd=state._ntdVoorModal; state._ntdVoorModal=null; }
}

// ── 'Hoort bij' (Takenbundel) ──
// Vult het veld met de zichtbare kop van de bundel waar deze taak in zit, of verbergt het hele
// veld (r=null: een nieuwe taak heeft nog geen rij om een koppeling naar weg te schrijven).
// Geëxporteerd omdat het kruisje er ook op terugvalt als de gebruiker zijn keuze weer weggooit.
const HB_PLACEHOLDER='Zoek een taak om onder te hangen…';
export function zetHoortBij(r){
  const veld=document.getElementById('m-hoortbij');
  const wis=document.getElementById('m-hoortbij-x');
  const vak=document.getElementById('fld-hoortbij');
  state._hbDoel=null;                 // aangewezen doeltaak; wordt gezet door de kiezer (main.js)
  if(!veld||!vak) return;
  vak.style.display=r?'':'none';
  if(wis) wis.style.display='none';
  // Het slot en de bijbehorende uitleg horen bij één bepaalde taak, dus ze gaan hier open vóórdat
  // de terugkeer hieronder ze zou overslaan. Bewerk je eerst een hoofdtaak (die zet disabled) en
  // open je daarna het toevoegscherm, dan bleef het veld anders op slot staan — vandaag onzichtbaar
  // omdat het vak bij een nieuwe taak verborgen is, maar het is een val zodra dat verandert.
  veld.disabled=false;
  veld.placeholder=HB_PLACEHOLDER;
  if(!r){ veld.value=''; return; }
  const leden=bundelVan(bouwBundelIndex(D.ntd,D.af), r);
  const kop=leden&&zichtbareKop(leden);
  // 'Ben ik zelf de kop?' via zelfdeTaak en niet op objectidentiteit. De index wordt hier vers uit
  // D gebouwd, maar `r` komt uit state._rowCache van de laatste render; zijn dat ooit twee
  // objecten met hetzelfde taaknummer, dan zou een identiteitsvergelijking de kop niet herkennen
  // en het veld de hoofdtaak uitnodigen om onder zichzelf te gaan hangen (zie de toelichting bij
  // zelfdeTaak in bundel.js).
  const isKop=!!(kop&&zelfdeTaak(kop.r,r));
  veld.value=(kop&&!isKop)?taakTitel(kop.r):'';
  // Een taak met subtaken kan nergens onder — dat weigert `magKoppelen` toch al. Het veld op slot
  // zetten voorkomt dat de gebruiker eerst een doel uitzoekt en pas bij het opslaan hoort dat het
  // niet mag.
  veld.disabled=isKop;
  veld.placeholder=isKop?'Deze taak is de hoofdtaak van een bundel':HB_PLACEHOLDER;
  if(wis&&kop&&!isKop) wis.style.display='';
}

function fillModalFields(sec,r){
  const tog=(id,on)=>{const e=document.getElementById(id);if(e){e.classList.toggle('on',!!on);e.setAttribute('aria-checked',!!on);}};
  switch(sec){
    case'OPPAKKEN':
      setv('m-actie',r.actiepunt);setv('m-dl',toISODate(r.deadline));setv('m-beh',r.behandelaar);
      setv('m-opm',r.opmerkingen);setv('m-sub-opp',r.subcategorie);
      tog('tog-ib',r.inBehandeling==='TRUE');break;
    case'VERGADERVERZOEKEN':
      setv('m-per',r.periode);setv('m-beh-v',r.behandelaar);setv('m-agenda',r.agendapunten||r.actiepunt);
      setv('m-dl-v',toISODate(r.deadline));setv('m-opm-v',r.opmerkingen);setv('m-sub-verg',r.subcategorie);
      tog('tog-ib-v',r.inBehandeling==='TRUE');break;
    case'OFFERTE-TRAJECTEN':
      setv('m-daang',toISODate(r.datumAangevraagd));setv('m-beh-o',r.behandelaar);
      {const[ontv,totaal]=(r.offertes||'').split('/').map(s=>parseInt(s)||0);
      setv('m-off-recv',ontv||0);setv('m-off-total',totaal||0);}
      setv('m-dl-o',toISODate(r.deadline));setv('m-opm-o',r.opmerkingen);setv('m-sub-off',r.subcategorie);break;
    case'LOD':
      setv('m-actie-l',r.actiepunt);setv('m-stat-l',r.status);setv('m-beh-l',r.behandelaar);
      setv('m-dl-l',toISODate(r.deadline));setv('m-opm-l',r.opmerkingen);setv('m-sub-lod',r.subcategorie);
      tog('tog-ib-l',r.inBehandeling==='TRUE');break;
    case'SUBSIDIE-TRAJECTEN':
      setv('m-subsidie',r.subsidie);setv('m-beh-s',r.behandelaar);
      setv('m-dl-s',toISODate(r.deadline));setv('m-opm-s',r.opmerkingen);setv('m-sub-sub',r.subcategorie);
      tog('tog-ib-s',r.inBehandeling==='TRUE');
      zetModalFase(r.subsidieFase);break;
  }
}
function setv(id,v){const el=document.getElementById(id);if(el)el.value=(v===undefined||v===null)?'':v} // 0 blijft '0' (geen falsy-coercie)

function clearModal(){
  document.querySelectorAll('.modal-body input,.modal-body select,.modal-body textarea').forEach(el=>{if(!el.readOnly)el.value=''});
  ['m-off-recv','m-off-total'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='0'});
  ['tog-ib','tog-ib-v','tog-ib-l','tog-ib-s'].forEach(id=>{const el=document.getElementById(id);if(el)el.classList.remove('on')});
  zetModalFase('');   // terug naar Voorbereiden, anders erft een nieuwe taak de vorige fase
  // Hetzelfde voor de bundel: een leeg formulier hoort bij géén bundel. openModal roept clearModal
  // aan vóór het tonen van een NIEUWE taak, dus dit is de garantie dat een gewoon toevoegscherm
  // schoon begint. Die volgorde is dwingend voor de actie 'bundel-nieuw' (actions.js): die zet zijn
  // vlag daarom pas ná het openen van het scherm.
  state._nieuwBundel=null;
  // En de andere kant van dezelfde belofte: een in 'Hoort bij' aangewezen doeltaak hoort bij het
  // scherm waarin hij is aangewezen. submitTask leest hem daarom vóór het sluiten uit (zie daar).
  state._hbDoel=null;
}

// ── Fase-kiezer in het bewerkscherm ──
// De stand staat in een module-variabele en niet in de DOM: submitTask heeft het
// wóórd nodig, niet de knoppen, en zo blijft de kiezer werken als de modal
// tussendoor opnieuw wordt getekend.
let _modalFase = 1;
function zetModalFase(woord){
  _modalFase = faseIndex(woord);
  const host = document.getElementById('m-fase');
  if(!host) return;
  host.innerHTML = faseRijHtml(faseWoord(_modalFase), -1, 'fase-rij-modal');
  // In de modal mag een klik niet meteen naar de Sheet schrijven — pas bij Opslaan.
  host.querySelectorAll('.fase-bol').forEach(b=>{ b.dataset.action='subsidie-fase-modal'; });
}
function kiesModalFase(n){ zetModalFase(faseWoord(n)); }
function _modalFaseWoord(){ return faseWoord(_modalFase); }

// ══════════════════════════════════════
//  SHEET HELPERS (insert / delete rows)
// ══════════════════════════════════════
// De breedte van elk tabblad zit al in het antwoord van spreadsheets.get, naast de sheetId.
// Apart en puur, zodat de vorm van dat antwoord te testen is zonder netwerk — en zodat een blad
// zónder gridProperties niet als breedte `undefined` de structuurcheck in glipt: die zou dan
// melden dat het blad te smal is terwijl er niets gemeten is.
function _sheetBreedtes(d){
  const uit={};
  ((d&&d.sheets)||[]).forEach(s=>{
    const n=s?.properties?.gridProperties?.columnCount;
    if(typeof n==='number') uit[s.properties.title]=n;
  });
  return uit;
}

async function getSheetIds(){
  if(state._sheetIds) return state._sheetIds;
  const r=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SID}`,{headers:{Authorization:`Bearer ${state.oauthToken}`}});
  if(!r.ok){ if(r.status===401){state.oauthToken=null;state.oauthExpiry=0} throw new Error('getSheetIds '+r.status); }
  const d=await r.json();
  state._sheetIds={};
  (d.sheets||[]).forEach(s=>{state._sheetIds[s.properties.title]=s.properties.sheetId});
  // Meeliften op deze ene lezing: de structuurcheck heeft de rasterbreedte nodig en de langste
  // rij uit fetchSheets is daar géén maat voor (lege staartcellen komen niet mee). Een eigen
  // verzoek zou de leeslast weer opdrijven die net met 64% is teruggebracht.
  state._sheetKolommen=_sheetBreedtes(d);
  return state._sheetIds;
}

// Bestaat het blok van deze sectie fysiek in 'Nog Te Doen'? Een sectie die wel in
// SECS staat maar (nog) geen kop + kolomkoprij in de Sheet heeft, levert géén
// colHeaderRow op. Zonder deze controle valt getInsertRow terug op rij 2 en landt
// een nieuwe taak middenin OPPAKKEN — precies het gat tussen "nieuwe code live" en
// "blok toegevoegd aan de Sheet" bij het uitrollen van een nieuwe sectie.
function sectieBestaatInSheet(sec){
  if((D.ntd[sec]||[]).length>0) return true;          // er staan al rijen, dus het blok bestaat
  return !!(D.ntdSecInfo && D.ntdSecInfo[sec] && D.ntdSecInfo[sec].colHeaderRow);
}

function getInsertRow(sec){
  const entries=D.ntd[sec]||[];
  if(entries.length>0) return entries[entries.length-1]._row;
  const info=D.ntdSecInfo[sec];
  if(!info?.colHeaderRow){
    // Bewust een harde fout en geen stille terugval: een taak die ongemerkt in een
    // ándere sectie belandt is veel duurder dan een mislukte toevoeging.
    throw new Error(`De sectie ${SECS[sec]?.label||sec} bestaat nog niet in het tabblad 'Nog Te Doen'. Voeg daar eerst het blok toe (een regel met ${sec} in kolom A, met daaronder een kolomkoprij).`);
  }
  return info.colHeaderRow;
}

// Celwaarde voor een veld waar het GETAL 0 een echte waarde is. `x||''` maakt van 0 een lege
// cel, en de hoofdtaak van een verse bundel draagt volgnummer 0. Vandaag levert parseSections
// altijd strings ('0' is truthy), maar het herordenen zet bundelVolg optimistisch op het
// rij-object; zet dat ooit een getal neer, dan zou die taak bij afronden of undo stil zijn
// plek in de bundel verliezen — precies de soort schade die dit traject wil voorkomen.
const nulVeilig = v => (v === 0 || v) ? String(v) : '';

// Gedeelde undo-serialisatie van een NTD-taakrij → kolomwaarden A..S.
// N (placeholder), O (offerte-fase) en P (aannemerslijst) horen erbij: zo verliest een
// undo van een afgerond/verwijderd OFFERTE-traject niet stil de opgebouwde aannemerslijst
// + de expliciete fase. Voor niet-offerte secties zijn r.fase/r.aannemers leeg (harmloos).
// Eén bron voor de drie callsites (deleteTaskRow, doCompleteTask, bulk-afronden/-verwijderen),
// zodat de kolombreedte nooit meer per plek uit elkaar loopt.
export function serializeNtdUndo(r){
  const v=SECS[r._sec].keys.map(k=>r[k]||'');
  while(v.length<8) v.push('');                  // OFFERTE heeft 7 velden → vul tot H
  v.push('', '', r.subcategorie||'', r.opvolgdatum||'', r.herhaalId||'', '', r.fase||'', r.aannemers||''); // I, J, K=sub, L, M, N, O=fase, P=aannemers
  v.push(r.taakId||'');   // Q — het vaste taaknummer moet de undo overleven, anders krijgt de
                          // teruggezette taak een nieuwe identiteit en is de oude een wees.
  v.push(r.bundelId||''); // R — om dezelfde reden: zonder dit valt de taak na een undo uit zijn bundel.
  v.push(nulVeilig(r.bundelVolg)); // S — via nulVeilig, want 0 is een echt volgnummer (zo begint
                                   // een verse bundel), geen lege cel
  return v;
}

// Kolommen L..S achter de sectievelden van een NIEUWE taakrij. `values` loopt tot en met K, L t/m P
// blijven leeg, en Q/R/S krijgen taaknummer, bundelnummer en volgnummer — dezelfde vaste posities
// als serializeNtdUndo en afrondWaarden hierboven.
// Apart en puur om dezelfde reden als die twee: zo is te toetsen dat de bundel op R en S landt
// zonder in te loggen. Eén lege string te weinig schuift het bundelnummer een kolom op en de rij
// wordt gewoon geschreven — geen fout, alleen een taak die stil uit zijn bundel valt.
// Het rij-object en niet drie losse strings, want `bundelId` en `bundelVolg` zijn allebei korte
// tekst: verwisseld zou geen enkele toets erop aanslaan.
export function toevoegWaarden(values, r){
  return values.concat([
    '', '', '', '', '',                                      // L..P
    r.taakId||'', r.bundelId||'', nulVeilig(r.bundelVolg),   // Q, R, S
  ]);
}

async function insertAndWriteRow(sheetName,afterRow,values){
  if(!state.oauthToken) throw new Error('Niet ingelogd');
  const ids=await getSheetIds();
  const sheetId=ids[sheetName];
  if(sheetId==null) throw new Error('Sheet niet gevonden: '+sheetName);
  const insResp=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SID}:batchUpdate`,{
    method:'POST',
    headers:{Authorization:`Bearer ${state.oauthToken}`,'Content-Type':'application/json'},
    body:JSON.stringify({requests:[{insertDimension:{range:{sheetId,dimension:'ROWS',startIndex:afterRow,endIndex:afterRow+1},inheritFromBefore:true}}]})
  });
  if(!insResp.ok){const e=await insResp.json();if(insResp.status===401){state.oauthToken=null;state.oauthExpiry=0}const err=new Error(e.error?.message||'Invoegfout');err.status=insResp.status;throw err}
  const endCol=String.fromCharCode(64+Math.max(values.length,9));
  try{
    await writeRange(`'${sheetName}'!A${afterRow+1}:${endCol}${afterRow+1}`,values);
  }catch(e){
    // De rij is wél ingevoegd maar niet gevuld → ruim de lege rij weer op zodat de Sheet niet
    // vervuilt met een ghost-rij. Schrijfacties zijn geserialiseerd, dus deze delete is veilig.
    try{
      await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SID}:batchUpdate`,{
        method:'POST',
        headers:{Authorization:`Bearer ${state.oauthToken}`,'Content-Type':'application/json'},
        body:JSON.stringify({requests:[{deleteDimension:{range:{sheetId,dimension:'ROWS',startIndex:afterRow,endIndex:afterRow+1}}}]})
      });
    }catch(_){ /* opruimen mislukte; de stille resync (loadAll) negeert de lege rij toch */ }
    throw e;
  }
}

async function deleteTask(idx){
  const r=state._rowCache[idx];
  if(!r) return;
  await deleteTaskRow(r);
}

async function deleteCurrentEditTask(){
  if(!state.editRowData) return;
  const r=state.editRowData;
  closeModal();
  await deleteTaskRow(r);
}

async function deleteTaskRow(r){
  const omschrijving=r.actiepunt||r.periode||r.subsidie||r.code||'deze taak';
  if(blokkeerOffline()) return;   // offline: niets wijzigen, ook niet optimistisch
  if(!await ensureToken()){alert('Inloggen mislukt. Probeer het opnieuw.');return}
  const sec=r._sec;
  // undo-data vastleggen vóór de mutatie (zelfde serialisatie als afronden)
  const ntdValues=serializeNtdUndo(r);
  const undoData={sec,code:r.code,ntdValues};
  const oudeRow=r._row;
  const tr=document.querySelector(`#ntd-tbody tr[data-row="${oudeRow}"]`);
  // optimistisch: meteen lokaal weg + indexen meeschuiven
  const arr=D.ntd[sec]||[];
  const pos=arr.indexOf(r);
  if(pos>-1) arr.splice(pos,1);
  _shiftNtdRows(oudeRow,-1);
  showUndoToast('Taak verwijderd',`${r.code} — ${omschrijving}`,()=>undoDelete(undoData),'prullenbak');
  // Idempotentie-vlag: een deleteDimension is positie-gebaseerd en NIET idempotent. Zonder
  // deze vlag zou een _withRetry-herkansing (na een transient 429/5xx) de rij eronder — die
  // door de eerste delete naar boven schoof — kunnen verwijderen. (patroon: offerte-aannemers.js)
  let verwijderd=false;
  backgroundWrite(
    async ()=>{
      const ids=await getSheetIds();
      const sheetId=ids['Nog Te Doen'];
      if(sheetId==null) throw new Error('Sheet "Nog Te Doen" niet gevonden');
      if(!verwijderd){
        await assertRowMatch(oudeRow, r); // bescherming: rij nog dezelfde TAAK vóór verwijderen
        const resp=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SID}:batchUpdate`,{
          method:'POST',
          headers:{Authorization:`Bearer ${state.oauthToken}`,'Content-Type':'application/json'},
          body:JSON.stringify({requests:[{deleteDimension:{range:{sheetId,dimension:'ROWS',startIndex:oudeRow-1,endIndex:oudeRow}}}]})
        });
        if(!resp.ok){const e=await resp.json();if(resp.status===401){state.oauthToken=null;state.oauthExpiry=0}const err=new Error(e.error?.message||'Verwijderfout');err.status=resp.status;throw err}
        verwijderd=true;
      }
      await logEvent(r.code, sec, 'Verwijderd', '', r.actiepunt||r.periode||r.subsidie||'', '');
    },
    ()=>{ if(arr.indexOf(r)===-1){ _herstelShift(_shiftNtdRows,oudeRow); arr.splice(Math.min(pos<0?arr.length:pos,arr.length),0,r); } },
    'Verwijderen mislukt'
  );
  // rode puls + fade op de oude rij; daarná pas hertekenen
  animateRowOut(tr,'rij-puls-rood',renderAll);
}

function getAfInsertRow(sec){
  const entries=D.af[sec]||[];
  if(entries.length>0) return entries[entries.length-1]._row;
  const info=D.afSecInfo[sec];
  if(info?.colHeaderRow) return info.colHeaderRow;
  const idx=SKEYS.indexOf(sec);
  for(let i=idx-1;i>=0;i--){
    const prev=D.af[SKEYS[i]]||[];
    if(prev.length>0) return prev[prev.length-1]._row;
    if(D.afSecInfo[SKEYS[i]]?.colHeaderRow) return D.afSecInfo[SKEYS[i]].colHeaderRow;
  }
  return 2;
}

// Afronden vanuit de bewerk-modal: zelfde flow als de ✓-knop op een rij.
// De modal kreeg de rij uit _rowCache, dus indexOf vindt dezelfde taak terug.
async function completeCurrentEditTask(){
  if(!state.editRowData) return;
  const idx=state._rowCache.indexOf(state.editRowData);
  if(idx<0){alert('Taak niet gevonden. Vernieuw de pagina en probeer opnieuw.');return}
  closeModal();
  completeTask(idx);
}

// Pure (testbaar): zoek het bewaarde rij-object vers op in de huidige _rowCache.
// Bewust op identiteit (indexOf), geen veld-vergelijking: na een verse parse zijn het
// nieuwe objecten en is -1 het veilige antwoord — niet gokken welke rij 'dezelfde' is.
function _verseRijIdx(row, cache){ return row ? (cache||[]).indexOf(row) : -1; }

// Pure (testbaar): her-anker een wees-rij op INHOUD nadat een verse parse alle
// D.ntd-objecten verving (stille resync na een andere schrijfactie). Alleen bij exact
// één inhoudelijk identieke rij in dezelfde sectie is her-ankeren veilig; bij nul of
// meerdere kandidaten liever de gebruiker opnieuw laten klikken dan gokken.
function _herankerRij(r, ntd){
  if(!r||!SECS[r._sec]) return null;
  const doel=serializeNtdUndo(r).join('\x1f');
  const kandidaten=((ntd&&ntd[r._sec])||[]).filter(x=>serializeNtdUndo(x).join('\x1f')===doel);
  return kandidaten.length===1?kandidaten[0]:null;
}

async function completeTask(idx){
  const r=state._rowCache[idx];
  if(!r){alert('Taak niet gevonden. Vernieuw de pagina en probeer opnieuw.');return}
  // Rij-OBJECT bewaren, geen index: terwijl de modal open staat kan een vertraagde
  // renderAll (animateRowOut, ~1,2s) of de stille resync _rowCache herbouwen — een
  // bewaarde index wijst dan naar een ándere taak. Zelfde patroon als completeCurrentEditTask.
  // Het geklikte rid gaat apart mee, alléén voor de groene puls op de juiste DOM-rij.
  state._completeRow=r;
  state._completeRid=idx;
  const d=new Date();
  document.getElementById('complete-date').value=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  document.getElementById('complete-comment').value='';
  document.getElementById('complete-title').textContent=`Taak afhandelen — ${r.actiepunt||r.periode||r.subsidie||r.code||''}`;
  document.getElementById('complete-bg').classList.add('open');
}

// Rijwaarden voor een afgeronde taak. Puur, dus los testbaar — en één bron voor zowel de
// modal-flow (doCompleteTask) als bulk-afronden, zodat die twee niet uiteen kunnen lopen.
// Vaste kolomposities: A..H sectievelden, I afronddatum, J toelichting, K subcategorie,
// L herhaalId (Opvolging.gs:119 leest afData[i][11] — NIET verplaatsen), M..P leeg,
// Q taakId, R bundelId, S bundelVolg. Q/R/S liggen op dezelfde index als in 'Nog Te Doen',
// omdat parseSections beide tabbladen met dezelfde vaste posities leest.
//
// A..H komt uit SECS.keys en niet uit een eigen lijstje per sectie: die kolomvolgorde is NIET
// de volgorde waarin de velden in het rij-object staan ('actiepunt' is kolom C, niet index 1),
// en parseSections leest hem met precies dezelfde bron terug. Een handgeschreven kopie zou
// stilletjes uiteen kunnen lopen — dezelfde afweging als in serializeNtdUndo en _rijNaarCellen.
export function afrondWaarden(r, sec, datum, toelichting){
  // Harde fout i.p.v. terugvallen op een 'default'-sectie: een taak die in het verkeerde
  // kolomstramien in 'Afgerond' belandt is duurder dan een mislukte afronding.
  if(!SECS[sec]) throw new Error('Onbekende sectie: '+sec);
  const v=SECS[sec].keys.map(k=>r[k]||'');
  while(v.length<8) v.push('');               // OFFERTE heeft 7 velden → vul tot H
  return v.concat([
    datum, toelichting, r.subcategorie||'',   // I, J, K
    r.herhaalId||'',                          // L
    '', '', '', '',                           // M, N, O, P
    r.taakId||'', r.bundelId||'', nulVeilig(r.bundelVolg),  // Q, R, S
  ]);
}

async function doCompleteTask(){
  let r=state._completeRow;
  if(r && _verseRijIdx(r, state._rowCache)<0){
    // De cache is herbouwd met verse parse-objecten (stille resync) terwijl de modal
    // open stond. Her-anker op inhoud: staat de taak er ongewijzigd in, dan mag de
    // afronding gewoon doorgaan en is de getypte toelichting niet voor niets geweest.
    r=_herankerRij(r, D.ntd);
    if(r) state._completeRow=r;
  }
  if(!r){alert('Taak niet gevonden. De lijst is intussen ververst — probeer opnieuw.');closeCompleteModal();return}
  const dateVal=document.getElementById('complete-date').value;
  const comment=document.getElementById('complete-comment').value.trim();
  if(!dateVal){alert('Datum is verplicht.');return}
  const dp=dateVal.split('-');
  const today=`${dp[2]}-${dp[1]}-${dp[0]}`;
  if(blokkeerOffline()) return;   // offline: niets wijzigen, ook niet optimistisch
  if(!await ensureToken()){alert('Inloggen mislukt. Probeer het opnieuw.');return}
  // Dubbelklik-rem NÁ ensureToken: het gevaarlijke gat is tussen de token en de
  // batch-write (getSheetIds is nog een await), waar een tweede klik de taak dubbel
  // zou afronden. Bewust niet vóór ensureToken: een hangende/geblokkeerde OAuth-popup
  // zou de vlag dan eeuwig op true laten staan; een tweede klik is daar juist een
  // legitieme herkansing.
  if(state._completeBusy) return;
  state._completeBusy=true;
  try{
    const sec=r._sec;
    const values = afrondWaarden(r, sec, today, comment);
    const ids=await getSheetIds();
    const afSheetId=ids['Afgerond'];
    const ntdSheetId=ids['Nog Te Doen'];
    if(afSheetId==null) throw new Error('Sheet "Afgerond" niet gevonden');
    if(ntdSheetId==null) throw new Error('Sheet "Nog Te Doen" niet gevonden');
    const afAfterRow=getAfInsertRow(sec);
    const batchBody={requests:[
      {insertDimension:{range:{sheetId:afSheetId,dimension:'ROWS',startIndex:afAfterRow,endIndex:afAfterRow+1},inheritFromBefore:true}},
      {updateCells:{range:{sheetId:afSheetId,startRowIndex:afAfterRow,endRowIndex:afAfterRow+1,startColumnIndex:0,endColumnIndex:values.length},
        rows:[{values:values.map(v=>({userEnteredValue:{stringValue:String(v)}}))}],fields:'userEnteredValue'}},
      {deleteDimension:{range:{sheetId:ntdSheetId,dimension:'ROWS',startIndex:r._row-1,endIndex:r._row}}}
    ]};
    // undo-data vastleggen vóór de mutatie
    const ntdValues=serializeNtdUndo(r);
    const undoData={sec,code:r.code,ntdValues,ntdRow:r._row};
    // 1) optimistisch: meteen uit de lokale lijst + indexen meeschuiven;
    //    de oude DOM-rij pulst groen en pas daarná hertekenen we (anim.js)
    // Rij voor de groene puls: NTD-tabel, of anders de GEKLIKTE taakrij (bewaard rid)
    // op de zichtbare pagina — niet een indexOf-treffer die op een verborgen kopie
    // (dossier-DOM van een eerder bezocht dossier) kan landen.
    // Beide clauses op de zichtbare pagina: bij afronden vanuit het dossier zou de
    // eerste clause anders de verbórgen NTD-tabelrij matchen en de puls onzichtbaar spelen.
    const tr=document.querySelector(`.page.active #ntd-tbody tr[data-row="${r._row}"]`)||document.querySelector(`.page.active .tk[data-rid="${state._completeRid}"]`);
    const arr=D.ntd[sec]||[];
    const pos=arr.indexOf(r);
    if(pos>-1) arr.splice(pos,1);
    _shiftNtdRows(r._row,-1);
    closeCompleteModal();
    showUndoToast('Taak afgerond',`${r.code} — ${r.actiepunt||r.subsidie||r.naam||''}`,()=>undoComplete(undoData),'vinkCirkel');
    // 2) op de achtergrond wegschrijven; bij fout de taak terugzetten
    // Idempotentie-vlag: de batch (insert+update+delete) is positie-gebaseerd en NIET
    // idempotent — een retry na een transient fout zou dubbel kunnen afronden / de verkeerde
    // rij verwijderen. De vlag zorgt dat de batch maar één keer echt uitgevoerd wordt.
    let afgerond=false;
    backgroundWrite(
      async ()=>{
        if(!afgerond){
          await assertRowMatch(r._row, r); // bescherming: rij nog dezelfde TAAK vóór afronden
          const resp=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SID}:batchUpdate`,{
            method:'POST',headers:{Authorization:`Bearer ${state.oauthToken}`,'Content-Type':'application/json'},
            body:JSON.stringify(batchBody)});
          if(!resp.ok){const e=await resp.json();if(resp.status===401){state.oauthToken=null;state.oauthExpiry=0}const err=new Error(e.error?.message||'Fout bij afhandelen taak');err.status=resp.status;throw err}
          afgerond=true;
        }
        await logEvent(r.code, sec, 'Afgerond', 'status', 'Nog Te Doen', 'Afgerond op ' + today + (comment ? ' — ' + comment : ''));
      },
      ()=>{ const a=(D.ntd[sec]=D.ntd[sec]||[]); if(a.indexOf(r)===-1){ _herstelShift(_shiftNtdRows,r._row); a.splice(Math.min(pos<0?a.length:pos,a.length),0,r); } },
      'Afronden mislukt'
    );
    // 3) groene puls + fade op de oude rij; daarná pas hertekenen
    animateRowOut(tr,'rij-puls-groen',renderAll);
  }catch(e){alert('Fout bij afhandelen: '+e.message)}
  finally{ state._completeBusy=false; }
}

function closeCompleteModal(){document.getElementById('complete-bg').classList.remove('open');state._completeRow=null;state._completeRid=null}

// ══════════════════════════════════════
//  SUBMIT TASK (Add + Edit)
// ══════════════════════════════════════
async function submitTask(){
  if(blokkeerOffline()) return;   // offline: niets wijzigen, ook niet optimistisch
  if(!await ensureToken()){alert('Inloggen mislukt. Probeer het opnieuw.');return}
  const code=document.getElementById('m-code').value.trim();
  const naam=document.getElementById('m-naam').value.trim();
  if(!code){alert('VvE Code is verplicht.');return}

  const sec=state.editSec||state.activeNtd;
  let values;

  try{
    const subId={OPPAKKEN:'m-sub-opp',VERGADERVERZOEKEN:'m-sub-verg','OFFERTE-TRAJECTEN':'m-sub-off',LOD:'m-sub-lod','SUBSIDIE-TRAJECTEN':'m-sub-sub'}[sec];
    const sub=gv(subId);
    // Kolomvolgorde 'Nog Te Doen': … H=InBeh, I=Afgerond, J=(leeg), K=Subcategorie, L=Opvolg, …
    // De subcategorie moet dus op kolom K (index 10) staan — gelijk aan parseSections en de
    // Apps Script-backend. Daarom twee lege kolommen (I + J) vóór `sub`.
    switch(sec){
      case'OPPAKKEN':{
        const _berekend = berekenPrioriteit(toDutchDate(gv('m-dl')), 'OPPAKKEN').prioriteit;
        values=[code,naam,gv('m-actie'),toDutchDate(gv('m-dl')),gv('m-beh'),_berekend,gv('m-opm'),
          document.getElementById('tog-ib').classList.contains('on'),'','',sub];break;}
      case'VERGADERVERZOEKEN':
        values=[code,naam,gv('m-per'),gv('m-agenda'),gv('m-beh-v'),toDutchDate(gv('m-dl-v')),gv('m-opm-v'),
          document.getElementById('tog-ib-v').classList.contains('on'),'','',sub];break;
      case'OFFERTE-TRAJECTEN':{
        const recv=parseInt(gv('m-off-recv'))||0;
        const total=parseInt(gv('m-off-total'))||0;
        const offStr=total>0?`${recv}/${total}`:'';
        values=[code,naam,toDutchDate(gv('m-daang')),offStr,gv('m-beh-o'),toDutchDate(gv('m-dl-o')),gv('m-opm-o'),'','','',sub];break;}
      case'LOD':
        values=[code,naam,gv('m-actie-l'),gv('m-stat-l'),gv('m-beh-l'),toDutchDate(gv('m-dl-l')),gv('m-opm-l'),
          document.getElementById('tog-ib-l').classList.contains('on'),'','',sub];break;
      case'SUBSIDIE-TRAJECTEN':
        values=[code,naam,gv('m-subsidie'),faseWoord(_modalFase),gv('m-beh-s'),toDutchDate(gv('m-dl-s')),gv('m-opm-s'),
          document.getElementById('tog-ib-s').classList.contains('on'),'','',sub];break;
    }

    const endCol=String.fromCharCode(64+Math.max(values.length,9));
    const keys=SECS[sec].keys;
    const norm=v=>v===true?'TRUE':v===false?'FALSE':v; // boolean → Sheets-stringvorm
    const newBeh=(sec==='OPPAKKEN'?gv('m-beh'):sec==='VERGADERVERZOEKEN'?gv('m-beh-v'):sec==='OFFERTE-TRAJECTEN'?gv('m-beh-o'):sec==='SUBSIDIE-TRAJECTEN'?gv('m-beh-s'):gv('m-beh-l'));
    if(state.editMode&&state.editRowData?._row){
      // ── Bewerken: lokale rij meteen bijwerken, dan op de achtergrond opslaan ──
      const doelRow=state.editRowData, oudeWaarden={...state.editRowData};
      // De in 'Hoort bij' aangewezen doeltaak NU vastpakken: het closeModal/clearModal hieronder
      // wist die keuze (een leeg formulier hoort bij geen bundel), en dan is hij weg.
      const hbDoel=state._hbDoel;
      keys.forEach((k,i)=>{ doelRow[k]=norm(values[i]); });
      doelRow.subcategorie=values[values.length-1];
      // Offerte: gooi de gecachete handmatige X/N weg zodat de net-bewerkte kolom-D-waarde
      // meteen wordt herkend (anders pas zichtbaar ná de stille resync). Harmloos elders.
      delete doelRow._offertesManual;
      renderAll();
      flashRow('ntd-tbody', doelRow._row);
      closeModal();clearModal();
      backgroundWrite(
        async ()=>{
          await assertRowMatch(doelRow._row, oudeWaarden); // bescherming: rij nog dezelfde TAAK vóór overschrijven
          // oudeWaarden is de snapshot VÓÓR de optimistische mutatie van doelRow — precies wat
          // er op dit moment nog in de Sheet hoort te staan.
          await writeRange(`'Nog Te Doen'!A${doelRow._row}:${endCol}${doelRow._row}`,values);
          if(newBeh && newBeh!==(oudeWaarden.behandelaar||'')){
            fireNotifEvent('assigned',{sec,code,naam,behandelaar:newBeh});
            await logEvent(code,sec,'Behandelaar gewijzigd','behandelaar',oudeWaarden.behandelaar,newBeh);
          }
          // Fase-wijziging vanuit het bewerkscherm ook vastleggen. Klikken op een
          // bolletje in de tabelrij logt al via zetSubsidieFase; zonder dit blok bleef
          // dezelfde wijziging via Opslaan onzichtbaar in het logboek, en juist het
          // verloop van een subsidietraject wil je later kunnen terugzien.
          if(sec==='SUBSIDIE-TRAJECTEN'){
            const w=faseWijziging(oudeWaarden.subsidieFase, doelRow.subsidieFase);
            if(w) await logEvent(code,sec,'Fase gewijzigd','fase',w.van,w.naar);
          }
          // Bevestiging pas hier: vóór de write was 'Opgeslagen' een belofte, geen feit.
          // Helemaal onderaan de writeFn, zodat een _withRetry-herkansing er geen tweede
          // kan opleveren. geenDedup: twee keer dezelfde taak opslaan binnen 15 s moet
          // twee bevestigingen geven, anders leest de tweede als 'mislukt'.
          showToast('Opgeslagen',`${code} — ${naam||''}`,null,'opslaan',{geenDedup:true,geenSysteemmelding:true});
        },
        ()=>{ keys.forEach(k=>{ doelRow[k]=oudeWaarden[k]; }); doelRow.subcategorie=oudeWaarden.subcategorie; delete doelRow._offertesManual; },
        'Opslaan mislukt'
      );
      // De bundelkoppeling is een APARTE schrijfweg (kolom Q, R en S) en loopt bewust niet mee in
      // de write hierboven: die schrijft A..K en raakt de bundelkolommen dus sowieso niet — maar
      // belangrijker is dat de twee los van elkaar mogen mislukken zonder elkaar mee te trekken.
      // Beide gaan door dezelfde seriële wachtrij (state._writeChain), en de koppeling komt daarin
      // als tweede: backgroundWrite verlengt die wachtrij nog synchroon op de aanroepregel
      // hierboven, terwijl koppelTaak zijn eigen backgroundWrite pas ná `await ensureToken()`
      // bereikt. Die volgorde is nodig — koppelTaak doet zijn eigen rij-controle en die moet de
      // zojuist opgeslagen tekst teruglezen, niet de tekst van ervóór. Verplaats deze regel dus
      // niet naar vóór de backgroundWrite hierboven: het gaat daar vandaag ook goed, maar dan
      // hangt de volgorde aan die ene await in koppelTaak in plaats van aan de plek in de wachtrij.
      if(hbDoel) koppelTaak(doelRow, hbDoel);
    } else {
      // ── Toevoegen: rij meteen lokaal tonen, dan op de achtergrond opslaan ──
      const afterRow=getInsertRow(sec);
      const nieuw={_sec:sec,_row:afterRow+1};
      keys.forEach((k,i)=>{ nieuw[k]=norm(values[i]); });
      nieuw.subcategorie=values[values.length-1];
      // Vast taaknummer (kolom Q) meteen bij het aanmaken, en meteen ook de bundelkolommen R en S,
      // zodat insertAndWriteRow A..S in één keer schrijft. Bewust NIET in de bewerk-tak hierboven:
      // die schrijft A..K en zou L..S leegvegen.
      nieuw.taakId=nieuwTaakId();
      // Komt de taak uit een bundel ('+ Voeg een subtaak toe'), dan draagt hij het bundelnummer al
      // bij het aanmaken. Zo is er geen tweede schrijfactie nodig en kan er geen half-gekoppelde
      // taak ontstaan als die tweede zou mislukken.
      const bdl=state._nieuwBundel;
      nieuw.bundelId  = bdl ? bdl.bundelId : '';
      nieuw.bundelVolg= bdl ? bdl.volg     : '';
      // De vlag wordt hier bewust NIET gewist. Het `closeModal` een paar regels verderop doet dat
      // al — net als élke andere sluitweg — en tussen dit punt en dat closeModal staat `renderAll()`.
      // Gooit die, dan blijft dit venster open via de catch onderaan submitTask, en met een al
      // gewiste vlag zou een tweede klik op Opslaan stil een LOSSE taak opleveren: precies de
      // dataschade die deze vlag moet voorkomen. Wissen mag dus pas als de taak er echt is, en dat
      // is precies wat closeModal doet.
      const addValues=toevoegWaarden(values,nieuw);
      _shiftNtdRows(afterRow,+1); // bestaande rijen eronder schuiven mee
      (D.ntd[sec]=D.ntd[sec]||[]).push(nieuw);
      // Vanaf hier bestaat de taak lokaal, dus het tabblad van DEZE sectie moet blijven staan —
      // ook als het scherm via prefillNieuweTaak op een ander tabblad begon of de gebruiker in de
      // categorie-kiezer iets anders koos. Zonder deze twee regels tekent de renderAll hieronder
      // een lijst waarin de zojuist gemaakte taak niet voorkomt, en dat leest als 'er is niets
      // gebeurd'.
      state._ntdVoorModal=null;
      state.activeNtd=sec;
      renderAll();
      flashRow('ntd-tbody', nieuw._row, 'rij-flits-groen');
      closeModal();clearModal();
      backgroundWrite(
        async ()=>{
          await insertAndWriteRow('Nog Te Doen',afterRow,addValues);
          fireNotifEvent('newtask',{sec,code,naam,behandelaar:newBeh});
          await logEvent(code,sec,'Aangemaakt','','',newBeh||'');
          showToast('Taak toegevoegd',`${code} — ${naam||''}`,null,'plus',{geenDedup:true,geenSysteemmelding:true});
        },
        ()=>{ const a=D.ntd[sec]||[]; const p=a.indexOf(nieuw); if(p>-1){ a.splice(p,1); _shiftNtdRows(afterRow,-1); } },
        'Toevoegen mislukt'
      );
    }
  }catch(e){
    const msg=(e.message||'').toLowerCase();
    if(msg.includes('invalid authentication')||msg.includes('unauthenticated')||msg.includes('unauthorized')){
      state.oauthToken=null;state.oauthExpiry=0;
      alert('Je sessie is verlopen. Klik nogmaals op Opslaan om opnieuw in te loggen.');
    }else{alert('Fout: '+e.message)}
  }
}
function gv(id){const el=document.getElementById(id);return el?el.value.trim():''}

// ══════════════════════════════════════

// Fase wegschrijven naar kolom D vanaf een bolletje in de tabelrij.
// Zelfde vorm als _bewaar in offerte-aannemers.js: eerst lokaal muteren zodat het
// scherm meteen klopt, dan pas de Sheet — met assertRowMatch ertussen, zodat we
// nooit een ándere taak overschrijven als er intussen rijen zijn verschoven.
async function zetSubsidieFase(rid, stap){
  const r = state._rowCache[rid];
  if(!r || r._sec !== 'SUBSIDIE-TRAJECTEN') return;
  const nieuw = faseWoord(stap), oud = r.subsidieFase || '';
  if(nieuw === oud) return;
  if(blokkeerOffline()) return;   // offline: niets wijzigen, ook niet optimistisch
  if(!await ensureToken()){alert('Inloggen mislukt. Probeer het opnieuw.');return}
  r.subsidieFase = nieuw;
  renderAll();
  backgroundWrite(
    async ()=>{
      // De snapshot moet de stand VÓÓR de optimistische mutatie zijn — dat is wat
      // er op dit moment nog in de Sheet hoort te staan.
      await assertRowMatch(r._row, {...r, subsidieFase: oud});
      await writeRange(`'Nog Te Doen'!D${r._row}`, [nieuw]);
      const w=faseWijziging(oud, nieuw);
      if(w) await logEvent(r.code, 'SUBSIDIE-TRAJECTEN', 'Fase gewijzigd', 'fase', w.van, w.naar);
      showToast('Fase bijgewerkt', `${r.code} — ${nieuw}`, null, 'opslaan', {geenSysteemmelding:true});
    },
    ()=>{ r.subsidieFase = oud; },
    'Fase opslaan mislukt'
  );
}

export {
  openModal, editRow, closeModal, fillModalFields, setv, clearModal, kiesSectie, zetSectieKiezer,
  getSheetIds, _sheetBreedtes, getInsertRow, insertAndWriteRow, deleteTask, deleteCurrentEditTask, deleteTaskRow,
  getAfInsertRow, completeTask, completeCurrentEditTask, doCompleteTask, closeCompleteModal, submitTask, gv,
  _verseRijIdx, _herankerRij, zetSubsidieFase, kiesModalFase, _modalFaseWoord,
};
