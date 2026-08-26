// ══════════════════════════════════════
//  BULK-ACTIES — selecteren + groepsacties op de NTD-lijst (Fase 5)
// ══════════════════════════════════════
import { state, D } from "./state.js";
import { renderNtd } from "./render-lijsten.js";
import { toDutchDate, taakTitel, berekenPrioriteit, _parseAnyDate, _vandaagAmsterdam, _verschilInKalenderdagen, parseDt, kiesAfgerondRij } from "./util.js";
import { SID } from "./config.js";
import { ensureToken } from "./auth.js";
import { _shiftNtdRows, _shiftAfRows, _herstelShift, assertRowsMatch, _veiligeRij, sheetsFetch } from "./api.js";
import { getSheetIds, getAfInsertRow, getInsertRow, insertAndWriteRow, serializeNtdUndo, afrondWaarden, bevestigInvoegPlek } from "./crud.js";
import { backgroundWrite, loadAll, metWriteMarkering, blokkeerOffline, syncSelecteerStand } from "./data.js";
import { showToast, showUndoToast, fireNotifEvent } from "./notifications.js";
import { vraagBevestiging } from "./bevestig.js";
import { bouwBundelIndex, openSubtaken } from "./bundel.js";
import { logEvents } from "./render-overig.js";
import { renderAll } from "./main.js";

const _sel = new Set();   // geselecteerde taak-objecten (rij-referenties in D)

// Pure helper (testbaar): verwerk-volgorde hoog→laag _row, zodat
// rij-verwijderingen in de Sheet elkaars indexen niet verschuiven.
function _bulkVolgorde(rows){ return [...rows].sort((a,b)=>b._row-a._row); }

function bulkGeselecteerd(r){ return _sel.has(r); }
function bulkSelectie(){ return _bulkVolgorde(_sel); }

function toggleBulkMode(){
  state.bulkMode=!state.bulkMode;
  // `bulkWis()` en niet alleen `_sel.clear()`: het shift-klik-ANKER is een rij-object dat gewoon in
  // D.ntd blijft staan. Bleef het hangen, dan pakte de eerste shift-klik ná het opnieuw aanzetten
  // van 'Selecteren' een heel blok vanaf een rij die de gebruiker in die stand nooit had
  // aangeklikt — een selectie die hij niet zelf gemaakt heeft, met knoppen die taken afronden.
  bulkWis();
  document.getElementById('bulk-btn').classList.toggle('on',state.bulkMode);
  renderNtd();
  renderBulkUi();
}
// Het laatst aangeklikte vinkje: het ANKER voor shift-klik. Bewust een rij-object en geen `rid`:
// elke render bouwt `state._rowCache` opnieuw op, dus een bewaard nummer wijst na de eerstvolgende
// render naar een wíllekeurige andere taak — en dan selecteert shift-klik stilletjes het verkeerde
// blok. Het object overleeft een render wél (het komt uit D en wordt niet vervangen), en een
// object dat door een poll tóch vervangen wordt, vinden we hieronder simpelweg niet meer terug:
// dan valt shift-klik terug op een gewone klik in plaats van iets verkeerds te doen.
let _anker=null;

// De vinkjes van de rijen die NU in de tabel staan, in de volgorde waarin ze getekend zijn.
// Uit de DOM en niet uit `state._rowCache`: die cache bevat na de tabel óók de 'Ook hier'-rijen
// (renderNtdCrossList) en op andere pagina's nog meer, en die hebben geen vinkje. Een reeks over
// rid-nummers zou daar dwars doorheen lopen.
function _vinkjesInTabel(){
  return [...document.querySelectorAll('#ntd-tbody [data-action="bulk-vink"]')]
    .map(el=>state._rowCache[+el.dataset.rid])
    .filter(Boolean);
}

// Shift-klik: alles tussen het vorige vinkje en dit vinkje erbij. Bewust altijd TOEVOEGEN en nooit
// weghalen — een reeks die half aan- en half uitzet is niet te voorspellen, en de gebruiker die
// zich vergist heeft, heeft 'Selecteren' uit-en-aan als vangnet.
// Werkt binnen de getoonde pagina; rijen op een andere pagina staan niet in de DOM. Voor "alles"
// over de paginagrens heen is er het kopvinkje.
function _selecteerReeks(r){
  const rijen=_vinkjesInTabel();
  const a=rijen.indexOf(_anker), b=rijen.indexOf(r);
  if(a<0||b<0) return false;                      // anker staat niet meer in beeld → gewone klik
  const van=Math.min(a,b), tot=Math.max(a,b);
  for(let i=van;i<=tot;i++) _sel.add(rijen[i]);
  return true;
}

function bulkVink(rid, e){
  const r=state._rowCache[rid]; if(!r) return;
  // `e` is het klik-event uit de delegatie in actions.js (die roept `fn(el, e)` aan). Toetsenbord-
  // bediening levert hetzelfde event met shiftKey=false, dus die blijft een gewone klik.
  if(e&&e.shiftKey&&_anker&&_anker!==r&&_selecteerReeks(r)){
    // Anker NIET verzetten: zo kun je met een tweede shift-klik de reeks vanaf hetzelfde punt
    // groter maken, precies zoals in een bestandsvenster.
  }else{
    _sel.has(r)?_sel.delete(r):_sel.add(r);
    _anker=r;
  }
  renderNtd();
  renderBulkUi();
}

// Alles in de HELE gefilterde lijst aan- of uitzetten — dus ook wat op pagina 2 en verder staat.
// Staat alles al aan, dan zet deze knop alles uit; anders vult hij aan tot alles.
function bulkAlles(){
  const rijen=state._ntdZichtbaar||[];
  if(!rijen.length) return;
  // Staat alles aan, dan LEEGT deze knop de hele selectie — ook taken die door een filterwissel
  // buiten beeld zijn geraakt. Dat is wat het label ('Selectie leegmaken') belooft, en het is de
  // enige lezing waarbij de balk daarna niet blijft staan met een aantal dat nergens te zien is.
  // (De selectie overleeft een filterwissel bewust; zie wisNtdFilters.)
  if(rijen.every(r=>_sel.has(r))) bulkWis();
  else rijen.forEach(r=>_sel.add(r));
  _anker=null;                      // de reeks-anker slaat nergens meer op na een blok-actie
  renderNtd();
  renderBulkUi();
}

// Drie standen, en die moeten alle drie te ZIEN zijn: niets, een deel, alles. Zonder de
// tussenstand ('deels') lijkt een half gevulde selectie op een lege, en dan klikt de gebruiker
// het kopvinkje aan in de veronderstelling dat hij begint — terwijl hij zijn selectie juist
// aanvult. `aria-checked="mixed"` is de standaardnaam voor die tussenstand.
function allesVinkjeStand(rijen, gekozen){
  const n=(rijen||[]).length;
  if(!n) return 'leeg';
  const aan=(rijen||[]).filter(r=>(gekozen||new Set()).has(r)).length;
  return aan===0?'leeg':(aan===n?'alles':'deels');
}

function allesVinkjeHtml(rijen){
  const stand=allesVinkjeStand(rijen,_sel);
  const klasse=stand==='alles'?' aan':(stand==='deels'?' deels':'');
  // In de stand 'alles' leegt de knop de HELE selectie, dus ook taken die door een filterwissel
  // buiten beeld staan. Dat hoort de tooltip te zeggen — anders belooft hij minder dan hij doet.
  const uitleg=stand==='alles'
    ? `Selectie leegmaken (${_sel.size} ${_sel.size===1?'taak':'taken'}${_sel.size>(rijen||[]).length?', ook wat nu weggefilterd is':''})`
    : `Alles selecteren (${(rijen||[]).length} ${((rijen||[]).length===1)?'taak':'taken'}, ook op de volgende pagina's)`;
  return `<button type="button" class="cb${klasse}" data-action="bulk-alles" role="checkbox" `+
         `aria-checked="${stand==='alles'?'true':(stand==='deels'?'mixed':'false')}" `+
         `title="${uitleg}" aria-label="${uitleg}"></button>`;
}

function bulkWis(){ _sel.clear(); _anker=null; }

// SPOOKSELECTIE OPRUIMEN. `_sel` bewaart rij-OBJECTEN, en een verversing (de Herladen-knop, of de
// stille resync na een schrijfactie) vervangt élk object in D door een vers exemplaar. De selectie
// wees daarna naar objecten die nergens meer in staan: de vinkjes tekenden leeg, maar de balk bleef
// '30 geselecteerd' zeggen — en die balk verwijderde die 30 ook echt, met rijnummers van vóór de
// verversing. Met de hand aanvinken maakte daar een spook van drie taken van; sinds het kopvinkje
// van veertig.
//
// Dit is nadrukkelijk iets ANDERS dan de selectie snoeien op een filterwijziging. Dat laatste is
// bewust niet gedaan (zie `wisNtdFilters` in render-lijsten.js): een weggefilterde taak bestáát nog
// en mag in je selectie blijven, zodat je met twee zoektermen achter elkaar een selectie kunt
// opbouwen. Hier gaat het om objecten die helemaal niet meer bestaan.
// Geeft terug HOEVEEL er weggevallen is, zodat de aanroeper weet of de balk hertekend moet worden.
function bulkHerstel(ntd){
  if(!_sel.size) return 0;
  const bestaat = new Set();
  Object.keys(ntd || {}).forEach(sec => (ntd[sec] || []).forEach(r => bestaat.add(r)));
  let weg = 0;
  [..._sel].forEach(r => { if(!bestaat.has(r)){ _sel.delete(r); weg++; } });
  if(_anker && !bestaat.has(_anker)) _anker = null;
  return weg;
}
function renderBulkUi(){
  const teller=document.getElementById('bulk-teller');
  const balk=document.getElementById('bulk-balk');
  teller.style.display=state.bulkMode?'':'none';
  // De teller telt wat er ECHT geselecteerd is. Sinds `bulkHerstel` kunnen er geen verdwenen
  // objecten meer in staan, maar de teller hoort ook zonder die aanname te kloppen: hij is het
  // enige dat de gebruiker vertelt hoeveel taken de knoppen ernaast gaan raken.
  const n=_sel.size;
  teller.textContent=`${n} geselecteerd`;
  balk.style.display=(state.bulkMode&&n>0)?'flex':'none';
  document.body.classList.toggle('bulk', state.bulkMode); // zwevende chat-knop wijkt voor de bulk-balk
  // Eerlijk zijn over de statusbalk: zolang deze stand aanstaat ligt het verversen stil.
  syncSelecteerStand();
  if(!state.bulkMode) _sluitMenus();
}
function toggleBulkMenu(menu){
  const el=document.getElementById('bb-menu-'+menu);
  const open=el.classList.contains('open');
  _sluitMenus();
  if(!open) el.classList.add('open');
}
function _sluitMenus(){ document.querySelectorAll('.bb-menu').forEach(m=>m.classList.remove('open')); }

// ── Bulk-acties ─────────────────────────────────────────────────────────
// Kolomletters in 'Nog Te Doen': behandelaar is overal E (keys-index 4);
// deadline is D bij OPPAKKEN (index 3) en F bij de andere vier (index 5).
const BULK_BEH_KOLOM='E';
const BULK_DEADLINE_KOLOM={OPPAKKEN:'D',VERGADERVERZOEKEN:'F','OFFERTE-TRAJECTEN':'F',LOD:'F','SUBSIDIE-TRAJECTEN':'F'};
const OPVOLG_KOLOM='L';

// Serialiseer een taakrij naar de NTD-kolomwaarden — gedeelde bron in crud.js
// (serializeNtdUndo: kolommen A..P incl. offerte-fase O + aannemers P).
const _ntdValues=serializeNtdUndo;

function _eindBulk(){
  state.bulkMode=false; bulkWis();
  document.getElementById('bulk-btn').classList.remove('on');
  renderAll(); renderBulkUi();
}

async function bulkDoe(el){
  const wat=el.dataset.wat;
  const rows=bulkSelectie();             // hoog→laag _row
  if(!rows.length) return;
  if(blokkeerOffline()) return;   // offline: niets wijzigen, ook niet optimistisch
  if(!await ensureToken()){ alert('Inloggen mislukt. Probeer het opnieuw.'); return; }
  // DUBBELKLIK-REM, ná ensureToken — zelfde idioom en dezelfde reden als `_submitBezig` in
  // crud.js. Sinds `bulkAfronden` een echte lezing tussen de klik en de mutatie doet
  // (`bevestigInvoegPlek`), is het gat honderden milliseconden breed; de knoppen in de bulk-balk
  // blijven al die tijd gewoon klikbaar en `bulkSelectie()` levert bij klik 2 nog exact dezelfde
  // rijen, want de selectie wordt pas ná dat gat gewist. Twee rondes archiveren dezelfde taken dan
  // dubbel en verwijderen de rij eronder. Bewust NIET vóór ensureToken: een geblokkeerde
  // inlogpopup zou de vlag dan eeuwig op true laten staan.
  if(state._bulkBezig) return;
  state._bulkBezig=true;
  try{ await _bulkDoeKern(el, wat, rows); }
  finally{ state._bulkBezig=false; }
}

async function _bulkDoeKern(el, wat, rows){
  _sluitMenus();
  // AWAIT: `bulkAfronden` stelt sinds v10.31 eerst een vraag. Zonder await liep de optimistische
  // verwijdering door terwijl het venster nog openstond — precies de val die bij `verwijderen`
  // hieronder al met zoveel woorden staat beschreven.
  if(wat==='afronden')    await bulkAfronden(rows);
  else if(wat==='geven')  bulkVeld(rows,'geven',el.dataset.naam);
  else if(wat==='wegleggen'){
    let iso=document.getElementById('bb-datum-weg').value;
    if(el.dataset.dagen){ const d=new Date(); d.setDate(d.getDate()+ +el.dataset.dagen);
      iso=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
    if(!iso){ alert('Kies een datum.'); return; }
    // Zelfde guards als de losse snooze: geen verleden-datum, en waarschuw bij ná-deadline.
    const nieuw=toDutchDate(iso);
    const p=_parseAnyDate(nieuw); const dWeg=p?new Date(p.y,p.m-1,p.d):null;
    if(!dWeg||_verschilInKalenderdagen(dWeg,_vandaagAmsterdam())<=0){ alert('Kies een datum in de toekomst.'); return; }
    const naDeadline=rows.filter(r=>{ const dl=parseDt(r.deadline); return dl && dWeg.getTime()>dl; });
    // De staart van de vraag ('Toch wegleggen?') zit in het knoplabel en niet in de tekst: het
    // venster stelt zijn vraag mét knoppen, en dan zou hij er twee keer staan. Waar `confirm()` de
    // twee zinnen met een `\n` scheidde, doet het venster dat met titel/tekst — dit venster zet zijn
    // tekst via `textContent`, dus een `\n` zou daar geen regelovergang meer geven.
    // Niet 'gevaarlijk' (de rode knop): wegleggen verplaatst een datum en is met dezelfde knop terug
    // te draaien. Het rood hangt in deze app aan de drie verwijder-vragen en aan niets anders —
    // zelfs afronden vraagt met de gewone knop (crud.js), want dat opent alleen het afrond-scherm.
    // De vraag blijft staan wáár `confirm()` stond: ná `blokkeerOffline`/`ensureToken` bovenaan
    // `bulkDoe`. Dat is de omgekeerde volgorde van de losse snooze (die vraagt eerst), maar
    // veranderen zou hier meer omgooien dan dit traject beoogt — beide poorten gelden voor álle
    // bulk-acties samen en staan daarom vóór de vertakking.
    if(naDeadline.length && !await vraagBevestiging({
        titel:'Wegleggen ná de deadline?',
        tekst:`Voor ${naDeadline.length} van de ${rows.length} ${rows.length===1?'taak':'taken'} ligt deze opvolgdatum ná de deadline. `+
              `${naDeadline.length===1?'Die taak wordt':'Die taken worden'} op de deadline gewoon "Te laat".`,
        bevestigTekst:'Toch wegleggen' })) return;
    bulkVeld(rows,'wegleggen',nieuw);
  }
  else if(wat==='deadline'){
    const iso=document.getElementById('bb-datum-dl').value;
    if(!iso){ alert('Kies een datum.'); return; }
    bulkVeld(rows,'deadline',toDutchDate(iso));
  }
  // Als enige tak geAWAIT: `bulkVerwijderen` is sinds de eigen bevestigingsvraag async, en de
  // andere takken zijn dat niet. Zonder `await` zou `bulkDoe` al klaar zijn terwijl de vraag nog in
  // beeld staat. Voor de app maakt dat vandaag niets uit — de klik-delegatie in actions.js doet
  // `if (fn) fn(el, e);` en kijkt niet naar wat er terugkomt — maar het houdt het contract van
  // `bulkDoe` heel: hij is pas klaar als de handeling klaar is. Dat contract staat of valt met één
  // assert in de zelftest ('bulkDoe blijft lopen zolang de vraag onbeantwoord is'), die `bulkDoe`
  // ECHT await en meet dat hij nog loopt terwijl het venster openstaat. Zonder die ene assert zou
  // het weghalen van deze `await` de hele suite groen laten: de testhelper `vraag()` wacht op het
  // ÓPENEN van het venster, en dat gebeurt al synchroon binnen `bulkVerwijderen`.
  else if(wat==='verwijderen') await bulkVerwijderen(rows);
}

// ── Afronden (verplaats naar 'Afgerond') ────────────────────────────────
// Drempel voor de bevestigingsvraag bij bulk-afronden. Onder deze grens geen vraag: de dagelijkse
// kleine bulk (twee of drie taken die je net zelf hebt aangevinkt) mag niet zwaarder worden — een
// vraag die je twintig keer per dag wegklikt, lees je op de eenentwintigste keer ook niet.
const BULK_AFROND_VRAAG_VANAF = 3;

async function bulkAfronden(rows){
  // Afronden was de ENIGE bulk-weg zonder poort. Verwijderen vraagt het al (met de subtaak-zin) en
  // één taak afronden waarschuwt via `bundelWaarschuwing` (crud.js). Sinds het kopvinkje de HELE
  // gefilterde lijst pakt — ook de taken op pagina 2 en 3 die je nooit in beeld hebt gehad — ligt
  // de groene knop pal naast een selectie van veertig taken, en de terugweg is er maar 8 seconden.
  // De bundeltelling staat BUITEN de drempel: blijft er een subtaak achter, dan is dat ook bij
  // twee taken het vermelden waard — en dan wordt er dus gevraagd, ook onder de drempel.
  const ixAf = bouwBundelIndex(D.ntd, D.af);
  const gekozenAf = new Set(rows);
  const metSubAf = rows.reduce((n,r)=> n + (openSubtaken(ixAf, r, gekozenAf) > 0 ? 1 : 0), 0);
  if(rows.length >= BULK_AFROND_VRAAG_VANAF || metSubAf > 0){
    const subTotaalAf = rows.reduce((n,r)=> n + openSubtaken(ixAf, r, gekozenAf), 0);
    const subZin = metSubAf
      ? ` Let op: bij ${metSubAf===1?(rows.length===1?'deze taak':'één van deze taken'):`${metSubAf} van deze taken`} `+
        `${subTotaalAf===1?'hangt nog een subtaak die':`hangen nog ${subTotaalAf} subtaken die`} niet in deze selectie ${subTotaalAf===1?'zit':'zitten'}. `+
        `${subTotaalAf===1?'Die blijft':'Die blijven'} staan.`
      : '';
    // Enkelvoud in titel én tekst: onder de drempel wordt er alleen gevraagd als er een subtaak
    // achterblijft, en dan kan het om één taak gaan. Zelfde vorm als bij bulk-verwijderen.
    // Niet 'gevaarlijk' (de rode knop): rood hangt in deze app aan de drie verwijdervragen, en
    // afronden is geen verwijderen. Wel dezelfde plek in de volgorde als daar: ná ensureToken en
    // blokkeerOffline, waar `confirm()` vroeger ook stond.
    if(!await vraagBevestiging({
        titel:`${rows.length} ${rows.length===1?'taak':'taken'} afronden?`,
        tekst:`${rows.length===1?'Deze taak verhuist':'Deze taken verhuizen'} naar 'Afgerond'. `+
              `Meteen daarna kun je dit nog ongedaan maken met de knop in de melding.`+subZin,
        bevestigTekst:'Afronden' })) return;
  }
  const d=new Date();
  const vandaag=`${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}`;
  const items=rows.map(r=>{
    // Zelfde bron als de losse afrond-modal (crud.js), zodat bulk en modal niet uiteen kunnen
    // lopen — vroeger stond dezelfde kolomvolgorde hier een tweede keer uitgeschreven. Bulk
    // kent geen toelichtingveld, vandaar de lege J. De oude `default`-tak was letterlijk de
    // LOD-opbouw; die staat nu als eigen case in afrondWaarden.
    const values=afrondWaarden(r, r._sec, vandaag, '');
    return { r, sec:r._sec, origRow:r._row, afValues:values, ntdValues:_ntdValues(r), code:r.code };
  });
  // Archiefplek vers narekenen — dezelfde controle die `submitTask` op 'Nog Te Doen' doet en die
  // `doCompleteTask` sinds deze ronde op 'Afgerond' doet. Alle items van een bulk zitten in ÉÉN
  // sectie (de selectie wordt bij een tabbladwissel gewist), dus één anker volstaat.
  // BEWUST vóór backgroundWrite: daarbinnen staat pendingWrites al op >0 en bewaakt de guard niets.
  // De één-sectie-aanname hard maken in plaats van erop vertrouwen. Eén anker, één pre-flight en
  // één `_shiftAfRows` gelden alleen als álle items in hetzelfde blok van 'Afgerond' landen. Dat
  // klopt vandaag omdat `setNtd` de selectie bij een tabbladwissel wist, maar dat is een gedrag
  // elders — verdwijnt het ooit, dan zou dit stil naar het verkeerde blok schrijven.
  if(new Set(items.map(i=>i.sec)).size!==1){
    alert('Afronden kan alleen binnen één categorie tegelijk. Maak de selectie leeg en probeer opnieuw.');
    return;
  }
  const standAf={gelukt:false};
  // `getAfInsertRow` GOOIT als het sectieblok niet in 'Afgerond' staat. Deze functie wordt door de
  // klik-delegatie niet gecatcht, dus zonder deze try zou de knop zichtbaar niets doen.
  let afAnker;
  try{ afAnker=getAfInsertRow(items[0].sec); }
  catch(e){ alert(e.message || String(e)); return; }
  try{ await bevestigInvoegPlek(items[0].sec, afAnker, 'Afgerond'); }
  catch(e){ alert(e.melding || e.message); loadAll(); return; }
  // optimistisch: hoog→laag lokaal verwijderen + indexen meeschuiven
  items.forEach(it=>{
    const arr=D.ntd[it.sec]||[]; const pos=arr.indexOf(it.r);
    if(pos>-1) arr.splice(pos,1);
    _shiftNtdRows(it.origRow,-1);
    it.pos=pos;
  });
  // …en de rijnummers van 'Afgerond' meeschuiven met de N invoegingen die zo meteen gebeuren,
  // zodat een losse afronding binnen hetzelfde schrijfvenster niet op een verouderd anker rekent.
  _eindBulk();
  showUndoToast(`${items.length} taken afgerond`,items.map(i=>i.code).join(', '),()=>bulkUndoAfronden(items,standAf),'vinkCirkel',
                {sleutel:`bulkafrond|${items.map(i=>i.r.taakId||i.origRow).join('_')}`});
  backgroundWrite(async()=>{
    const ids=await getSheetIds();
    const afSheetId=ids['Afgerond'], ntdSheetId=ids['Nog Te Doen'];
    if(afSheetId==null||ntdSheetId==null) throw new Error('Sheet niet gevonden');
    await assertRowsMatch(items.map(it=>({row:it.origRow, r:it.r}))); // bescherming: alle rijen nog dezelfde TAAK vóór bulk-afronden
    // Atomair: ALLE items in één batchUpdate (Sheets past die alles-of-niets toe). Voorheen
    // liep dit per item in aparte fetches; faalde item 3, dan stonden 1 en 2 al server-side
    // afgerond terwijl de lokale rollback ze terugzette → spook-dubbels na de resync.
    // Verwerkvolgorde hoog→laag _row (deletes verschuiven elkaar niet); Afgerond-inserts op
    // dezelfde index stapelen correct binnen één batch.
    // De archiefplek NU pas berekenen, niet bij de klik: `backgroundWrite` voert de wachtrij
    // serieel uit, dus op dit moment zijn alle eerdere schrijfacties en hun eventuele rollbacks
    // geweest. Een vooraf bevroren rijnummer kan een rollback van een andere schrijfactie niet
    // meer volgen en landt dan te laag — mogelijk op de kolomkoprij van het volgende blok.
    const requests=[];
    let afAfterRow=null;
    for(const it of items){
      afAfterRow=getAfInsertRow(it.sec);
      requests.push(
        {insertDimension:{range:{sheetId:afSheetId,dimension:'ROWS',startIndex:afAfterRow,endIndex:afAfterRow+1},inheritFromBefore:true}},
        {updateCells:{range:{sheetId:afSheetId,startRowIndex:afAfterRow,endRowIndex:afAfterRow+1,startColumnIndex:0,endColumnIndex:it.afValues.length},
          rows:[{values:it.afValues.map(v=>({userEnteredValue:{stringValue:String(v)}}))}],fields:'userEnteredValue'}},
        {deleteDimension:{range:{sheetId:ntdSheetId,dimension:'ROWS',startIndex:it.origRow-1,endIndex:it.origRow}}}
      );
    }
    const resp=await sheetsFetch(`https://sheets.googleapis.com/v4/spreadsheets/${SID}:batchUpdate`,{
      method:'POST',headers:{Authorization:`Bearer ${state.oauthToken}`,'Content-Type':'application/json'},
      body:JSON.stringify({requests})});
    if(!resp.ok){const e=await resp.json().catch(()=>({}));if(resp.status===401){state.oauthToken=null;state.oauthExpiry=0}const err=new Error(e.error?.message||'Bulk-afronden fout');err.status=resp.status;throw err}
    standAf.gelukt=true;   // pas nu mag de undo-knop iets terugzetten
    // Alle items van een bulk zitten in ÉÉN sectie (de selectie wordt bij een tabbladwissel
    // gewist), dus één anker en N invoegingen. Pas ná een geslaagde batch meeschuiven.
    if(afAfterRow!=null) _shiftAfRows(afAfterRow,+items.length);
    // for…of i.p.v. forEach: in een forEach-callback kun je niet awaiten, en zonder await valt
    // de schrijfteller naar 0 terwijl de logboek-appends nog lopen (resync te vroeg, regel weg).
    // Eén append voor de hele bulk i.p.v. één per taak: 20 taken kostten zo 20 schrijfverzoeken.
    await logEvents(items.map(it=>({code:it.code,sec:it.sec,actie:'Afgerond',veld:'status',oudeWaarde:'Nog Te Doen',nieuweWaarde:'Afgerond op '+vandaag+' (bulk)'})));
  },()=>{ // rollback: laag→hoog terugzetten
    [...items].reverse().forEach(it=>{
      const a=(D.ntd[it.sec]=D.ntd[it.sec]||[]);
      if(a.indexOf(it.r)===-1){ _herstelShift(_shiftNtdRows,it.origRow); a.splice(Math.min(it.pos<0?a.length:it.pos,a.length),0,it.r); }
    });
  },'Bulk-afronden mislukt');
}
// Pure helper (testbaar): kies per item de ZOJUIST afgeronde Afgerond-rij. De keuze zelf staat in
// `kiesAfgerondRij` (util.js) en is gedeeld met de losse undo in notifications.js: eerst op het
// vaste taaknummer uit `ntdValues[16]`, en pas als dat er niet is op de VvE-code binnen de
// nieuwste-eerst gesorteerde lijst. Op code alleen is dat een gok zodra twee afrondingen van
// dezelfde VvE op dezelfde dag in dezelfde sectie staan — zie de toelichting bij die functie.
// Claim per rij zodat twee items met dezelfde code verschillende rijen pakken.
// Resultaat hoog→laag _row, zodat verwijderen de indexen niet door elkaar schuift.
function _bulkUndoAfDoelRijen(items, afPerSec){
  const claimed=new Set(), doel=[];
  for(const it of items){
    const r=kiesAfgerondRij(afPerSec[it.sec]||[], (it.ntdValues||[])[16], it.code, claimed);
    if(r){ claimed.add(r); doel.push(r); }
  }
  return doel.sort((a,b)=>b._row-a._row);
}

async function bulkUndoAfronden(items, stand){
  if(blokkeerOffline()) return;   // offline: niets wijzigen, ook niet optimistisch
  if(!await ensureToken()){ alert('Inloggen mislukt.'); return; }
  state._undoInFlight=true; // pauzeer de 8s-poll; deze undo doet z'n eigen loadAll
  try{
    await state._writeChain;
    if(stand && !stand.gelukt){
      showToast('Niet ongedaan gemaakt','We konden niet bevestigen dát de taken zijn afgerond, dus er is niets teruggezet. De lijst wordt opnieuw geladen.','var(--am)','label',{geenDedup:true,geenSysteemmelding:true});
      await loadAll();
      return;
    }
    await loadAll(true);                       // verse D.af zodat we de zojuist afgeronde rijen vinden
    // Pas hierná de teller ophogen: bínnen metWriteMarkering zou loadAll zijn verse data
    // weggooien (pendingWrites>0) en werkten we op een stale D.af.
    await metWriteMarkering(async()=>{
      const ids=await getSheetIds();
      // 1) Bepaal welke Afgerond-rijen weg moeten (nieuwste per code), hoog→laag _row.
      const teVerwijderen=_bulkUndoAfDoelRijen(items, D.af);
      // 2) EERST terugzetten in Nog Te Doen (per-sectie offset, getInsertRow verandert niet
      //    tussendoor), DAN pas weghalen uit Afgerond. Breekt de verbinding ertussen, dan staat
      //    de taak dubbel (zichtbaar, herstelbaar) in plaats van nergens (onzichtbaar, verloren).
      const offset={};
      for(const it of items){
        await insertAndWriteRow('Nog Te Doen',getInsertRow(it.sec)+(offset[it.sec]||0),it.ntdValues);
        offset[it.sec]=(offset[it.sec]||0)+1;
      }
      // Pas ná de lus loggen, in één append: de logregels zijn een journaal van deze ene
      // handeling en hoeven niet tussen de inserts door. Scheelt bij 20 taken 19 verzoeken.
      await logEvents(items.map(it=>({code:it.code,sec:it.sec,actie:'Teruggezet',veld:'status',oudeWaarde:'Afgerond',nieuweWaarde:'Nog Te Doen (bulk-undo)'})));
      // 3) Verwijder de Afgerond-rijen in één batch in aflopende _row-volgorde, zodat de
      //    delete-indexen elkaar niet verschuiven (i.t.t. de oude code die de oudste rij koos).
      //    De inserts hierboven raakten een ánder tabblad, dus deze _row-nummers kloppen nog.
      if(teVerwijderen.length){
        // 'Afgerond' had als énige tabblad een positionele deleteDimension zónder guard, en juist
        // op de undo-weg: de rij wordt weggegooid op grond van een onthouden rijnummer. Klopte dat
        // nummer niet meer, dan verdween er stil een ándere afronding. Nu eerst controleren.
        await assertRowsMatch(teVerwijderen.map(af=>({row:af._row, r:af})), 'Afgerond');
        const resp=await sheetsFetch(`https://sheets.googleapis.com/v4/spreadsheets/${SID}:batchUpdate`,{
          method:'POST',headers:{Authorization:`Bearer ${state.oauthToken}`,'Content-Type':'application/json'},
          body:JSON.stringify({requests:teVerwijderen.map(af=>({deleteDimension:{range:{sheetId:ids['Afgerond'],dimension:'ROWS',startIndex:af._row-1,endIndex:af._row}}}))})});
        if(!resp.ok){const e=await resp.json().catch(()=>({}));if(resp.status===401){state.oauthToken=null;state.oauthExpiry=0}const err=new Error(e.error?.message||'Bulk-undo verwijderfout');err.status=resp.status;throw err}
      }
    });
    showToast('Ongedaan gemaakt',`${items.length} taken terug in Nog Te Doen`,'var(--am)','ongedaan');
    await loadAll();
  }catch(e){ alert('Undo fout: '+e.message); }
  finally{ state._undoInFlight=false; }
}

// ── Verwijderen ─────────────────────────────────────────────────────────
// Async sinds de eigen bevestigingsvraag; zie de `await` bij de aanroep in `bulkDoe`.
async function bulkVerwijderen(rows){
  // Het aantal staat in de TITEL en niet op de knop: dat getal is waar de gebruiker zijn besluit op
  // neemt, en boven het venster is het niet te missen. De knop houdt het bij de handeling zelf.
  // `gevaarlijk` (de rode knop) omdat dit rijen uit de Sheet haalt — dezelfde keuze als bij het
  // losse verwijderen in crud.js. Er is een undo-toast, maar die is een vangnet en geen vrijbrief.
  // Bewust géén opsomming van de codes in de tekst: bij twintig taken wordt dat een muur waar de
  // vraag zelf in verdwijnt. Ze staan wél in de undo-toast hieronder.
  // 'Meteen daarna' is geen stijlkeuze maar een grens: die knop zit in de undo-toast, en die ruimt
  // zichzelf op na UNDO_DURATION — 8 seconden (notifications.js). Een kale belofte dat het 'nog
  // ongedaan te maken is' leest als onbeperkt, en dat is op een verwijdervraag precies de zin
  // waarop iemand te makkelijk doorklikt. De tijd zelf staat er niet in: de toast kan ook eerder
  // weg zijn, en een getal in deze tekst zou stil verouderen zodra die constante wijzigt.
  // Hangen er subtaken onder een van de geselecteerde taken? De losse verwijderweg (deleteTaskRow
  // in crud.js) vraagt dat al met zoveel woorden; deze weg deed dat niet, en dat viel niet op
  // zolang je elk vinkje met de hand zette. Sinds er een kopvinkje is dat de hele lijst in één
  // klik selecteert — bundelkoppen en subtaken door elkaar, want bulk zet de lijst plat — is die
  // belofte van de één-taak-weg te makkelijk te omzeilen. Eén extra zin, geen extra vraag.
  const ix = bouwBundelIndex(D.ntd, D.af);
  // Subtaken die in DEZELFDE bulk zitten blijven niet achter; die horen dus niet in de telling.
  const gekozen = new Set(rows);
  const metSub = rows.reduce((n,r)=> n + (openSubtaken(ix, r, gekozen) > 0 ? 1 : 0), 0);
  // Enkelvoud/meervoud op het AANTAL SUBTAKEN, niet op het aantal taken dat er een heeft. Eén taak
  // kan er meerdere hebben, en dan zou 'hangt nog een subtaak' aantoonbaar onwaar zijn.
  const subTotaal = rows.reduce((n,r)=> n + openSubtaken(ix, r, gekozen), 0);
  const subZin = metSub
    ? ` Let op: bij ${metSub===1?(rows.length===1?'deze taak':'één van deze taken'):`${metSub} van deze taken`} `+
      `${subTotaal===1?'hangt':'hangen'} nog ${subTotaal===1?'een subtaak':`${subTotaal} subtaken`}. `+
      `${subTotaal===1?'Die wordt':'Die worden'} niet mee verwijderd.`
    : '';
  if(!await vraagBevestiging({
      titel:`${rows.length} ${rows.length===1?'taak':'taken'} verwijderen?`,
      tekst:`${rows.length===1?'Deze taak wordt':'Deze taken worden'} uit 'Nog Te Doen' gehaald. `+
            `Meteen daarna kun je dit nog ongedaan maken met de knop in de melding.`+subZin,
      bevestigTekst:'Verwijderen', gevaarlijk:true })) return;
  const items=rows.map(r=>({r,sec:r._sec,origRow:r._row,ntdValues:_ntdValues(r),code:r.code}));
  // Eén vlag voor de hele bulk: de batchUpdate is alles-of-niets, dus 'geland' geldt voor alle
  // items tegelijk. Zonder deze haak voegde de undo-knop na een MISLUKTE bulk alles opnieuw in —
  // met dezelfde vaste taaknummers erbij. Zie de gelijknamige vlag in crud.js.
  const stand={gelukt:false};
  items.forEach(it=>{
    const arr=D.ntd[it.sec]||[]; const pos=arr.indexOf(it.r);
    if(pos>-1) arr.splice(pos,1);
    _shiftNtdRows(it.origRow,-1);
    it.pos=pos;
  });
  _eindBulk();
  showUndoToast(`${items.length} taken verwijderd`,items.map(i=>i.code).join(', '),()=>bulkUndoVerwijderen(items,stand),'prullenbak',
                {sleutel:`bulkverwijder|${items.map(i=>i.r.taakId||i.origRow).join('_')}`});
  backgroundWrite(async()=>{
    const ids=await getSheetIds();
    const sheetId=ids['Nog Te Doen'];
    if(sheetId==null) throw new Error('Sheet "Nog Te Doen" niet gevonden');
    await assertRowsMatch(items.map(it=>({row:it.origRow, r:it.r}))); // bescherming: alle rijen nog dezelfde TAAK vóór bulk-verwijderen
    const resp=await sheetsFetch(`https://sheets.googleapis.com/v4/spreadsheets/${SID}:batchUpdate`,{
      method:'POST',headers:{Authorization:`Bearer ${state.oauthToken}`,'Content-Type':'application/json'},
      body:JSON.stringify({requests:items.map(it=>({deleteDimension:{range:{sheetId,dimension:'ROWS',startIndex:it.origRow-1,endIndex:it.origRow}}}))})});
    if(!resp.ok){const e=await resp.json().catch(()=>({}));if(resp.status===401){state.oauthToken=null;state.oauthExpiry=0}const err=new Error(e.error?.message||'Bulk-verwijderfout');err.status=resp.status;throw err}
    stand.gelukt=true;   // pas nu mag de undo-knop iets terugzetten
    // `taakTitel` en niet de vaste index 2 (kolom C): waar de omschrijving staat verschilt per
    // categorie. Bij Vergaderverzoeken is kolom C de PERIODE en bij Offerte-trajecten de datum van
    // aanvraag, dus het logboek noteerde daar iets anders dan de taak.
    await logEvents(items.map(it=>({code:it.code,sec:it.sec,actie:'Verwijderd',veld:'',oudeWaarde:taakTitel(it.r,it.sec)||'',nieuweWaarde:'(bulk)'})));
  },()=>{
    [...items].reverse().forEach(it=>{
      const a=(D.ntd[it.sec]=D.ntd[it.sec]||[]);
      if(a.indexOf(it.r)===-1){ _herstelShift(_shiftNtdRows,it.origRow); a.splice(Math.min(it.pos<0?a.length:it.pos,a.length),0,it.r); }
    });
  },'Bulk-verwijderen mislukt');
}
async function bulkUndoVerwijderen(items, stand){
  if(blokkeerOffline()) return;   // offline: niets wijzigen, ook niet optimistisch
  if(!await ensureToken()){ alert('Inloggen mislukt.'); return; }
  state._undoInFlight=true; // pauzeer de 8s-poll; deze undo doet z'n eigen loadAll
  try{
    await state._writeChain;
    if(stand && !stand.gelukt){
      showToast('Niet ongedaan gemaakt','We konden niet bevestigen dát de taken zijn verwijderd, dus er is niets teruggezet. De lijst wordt opnieuw geladen.','var(--am)','label',{geenDedup:true,geenSysteemmelding:true});
      await loadAll();
      return;
    }
    await metWriteMarkering(async()=>{
      // Offset per sectie: getInsertRow leest D.ntd (verandert niet tussen inserts), dus zonder
      // offset belanden alle rijen op dezelfde positie en stapelen ze in omgekeerde volgorde.
      const offset={};
      for(const it of items){
        await insertAndWriteRow('Nog Te Doen',getInsertRow(it.sec)+(offset[it.sec]||0),it.ntdValues);
        offset[it.sec]=(offset[it.sec]||0)+1;
      }
      await logEvents(items.map(it=>({code:it.code,sec:it.sec,actie:'Teruggezet',veld:'status',oudeWaarde:'Verwijderd',nieuweWaarde:'Nog Te Doen (bulk-undo)'})));
    });
    showToast('Ongedaan gemaakt',`${items.length} taken terug in Nog Te Doen`,'var(--am)','ongedaan');
    await loadAll();
  }catch(e){ alert('Undo fout: '+e.message); }
  finally{ state._undoInFlight=false; }
}

// ── Veld-acties: geven / wegleggen / deadline (cel-schrijfacties) ───────
function bulkVeld(rows,soort,waarde){
  // Enkelvoud/meervoud, net als de bevestigingsvensters van afronden en verwijderen. De bulk-balk
  // verschijnt al vanaf één geselecteerde taak, dus '1 taken aan Jer gegeven' was gewoon te lezen.
  const _n=rows.length, _tk=_n===1?'taak':'taken', _dl=_n===1?'deadline':'deadlines';
  const conf={
    geven:    { veld:'behandelaar', kolom:()=> BULK_BEH_KOLOM,             titel:`${_n} ${_tk} aan ${waarde} gegeven`,   icoon:'persoon',  log:'Behandelaar gewijzigd' },
    wegleggen:{ veld:'opvolgdatum', kolom:()=> OPVOLG_KOLOM,               titel:`${_n} ${_tk} weggelegd tot ${waarde}`, icoon:'belUit',   log:'Weggelegd' },
    deadline: { veld:'deadline',    kolom:(r)=>BULK_DEADLINE_KOLOM[r._sec],titel:`${_n} ${_dl} → ${waarde}`,             icoon:'kalender', log:'Deadline gewijzigd' },
  }[soort];
  // OPPAKKEN: een nieuwe deadline herberekent de opgeslagen prioriteit-kolom F mee
  // (zoals de losse bewerk-flow). Anders blijft F stale voor externe lezers.
  const oppDl = soort==='deadline';
  const items=rows.map(r=>({r,sec:r._sec,code:r.code,taakId:r.taakId||'',oud:r[conf.veld]||'',oudPrio:r.prioriteit||''}));
  items.forEach(it=>{
    it.r[conf.veld]=waarde;
    if(oppDl && it.sec==='OPPAKKEN') it.r.prioriteit=berekenPrioriteit(waarde,'OPPAKKEN').prioriteit;
  });
  _eindBulk();
  // Atomair: ALLE cel-writes in één Sheets-batchUpdate (alles-of-niets), net als bulkAfronden.
  // Voorheen liep dit per item in losse writeRange-calls; faalde item k halverwege na een
  // niet-transient fout, dan stonden 0..k-1 al server-side terwijl de lokale rollback ze terugzette
  // → de Sheet liep vóór op het scherm tot de resync (en bij OPPAKKEN kon F/prio uit de pas lopen).
  // De `gelogd`-vlag (één voor de hele batch) overleeft _withRetry-herkansingen en houdt logEvent
  // (een append) idempotent: de updateCells zelf zijn idempotent (vaste waarde overschrijven).
  const schrijf=(welkeWaarde)=>{
    let gelogd=false, gemeld=false;
    return async()=>{
      // Bescherming: alle rijen nog dezelfde TAAK vóór bulk-celschrijf.
      // Let op de richting. Deze closure schrijft zowel de nieuwe waarde als (bij undo) de oude
      // terug, en het rij-object is op dát moment al bijgewerkt. De guard moet vergelijken met
      // wat er NU in de Sheet hoort te staan, en dat is juist de waarde die we NIET schrijven:
      // bij 'nieuw' staat de oude waarde er nog, bij 'oud' (undo) de zojuist geschreven nieuwe.
      // Zonder deze omkering zou elke bulk-deadline en elke bulk-undo gegarandeerd vals afgaan,
      // want de deadline zit in de vingerafdruk.
      await assertRowsMatch(items.map(it=>({
        row: it.r._row,
        r: { ...it.r, [conf.veld]: (welkeWaarde==='oud' ? waarde : it.oud) },
      })));
      // values:batchUpdate met USER_ENTERED — één atomaire POST (alles-of-niets) én zelfde
      // invoer-parsing als de modal-flow (writeRange): een datum-string wordt zo óók via bulk
      // een echte datum-waarde, niet platte tekst. (updateCells/stringValue zou RAW opslaan.)
      // Formule-rem: veiligeCel zit alleen in writeRange/appendRange, en deze route gebruikt
      // óók USER_ENTERED maar liep erlangs. Zonder _veiligeRij zou een behandelaarsnaam of
      // opvolgnotitie die met =,+,-,@ begint hier alsnog als formule in de Sheet landen.
      const data=[];
      for(const it of items){
        const kol=conf.kolom(it.r);
        const val=welkeWaarde==='oud'?it.oud:waarde;
        data.push({range:`'Nog Te Doen'!${kol}${it.r._row}`, values:[_veiligeRij([val])]});
        if(oppDl && it.sec==='OPPAKKEN'){
          const prio=welkeWaarde==='oud'?it.oudPrio:berekenPrioriteit(waarde,'OPPAKKEN').prioriteit;
          data.push({range:`'Nog Te Doen'!F${it.r._row}`, values:[_veiligeRij([prio])]}); // F=prioriteit, herberekend bij nieuwe deadline
        }
      }
      const resp=await sheetsFetch(`https://sheets.googleapis.com/v4/spreadsheets/${SID}/values:batchUpdate`,{
        method:'POST',headers:{Authorization:`Bearer ${state.oauthToken}`,'Content-Type':'application/json'},
        body:JSON.stringify({valueInputOption:'USER_ENTERED', data})});
      if(!resp.ok){const e=await resp.json().catch(()=>({}));if(resp.status===401){state.oauthToken=null;state.oauthExpiry=0}const err=new Error(e.error?.message||'Bulk-actie fout');err.status=resp.status;throw err}
      if(!gelogd){ await logEvents(items.map(it=>({code:it.code,sec:it.sec,actie:conf.log,veld:conf.veld,oudeWaarde:welkeWaarde==='oud'?waarde:it.oud,nieuweWaarde:welkeWaarde==='oud'?it.oud:waarde}))); gelogd=true; }
      // Melding aan de nieuwe behandelaar. Eén taak toewijzen deed dit al (crud.js, submitTask);
      // bulk deed het helemaal niet, dus wie acht taken in één keer kreeg hoorde er niets van.
      // Bewust ÉÉN melding en niet acht: acht pushes voor één handeling leest als een storing.
      // De tekst noemt het aantal en de eerste codes, zodat de ontvanger weet waar hij moet kijken.
      // Alleen bij 'nieuw' — een ongedaan-making hoort niet als een nieuwe toewijzing te klinken.
      // Wie aan zichzelf toewijst krijgt niets: de ontvanger-is-de-actor-regel zit in
      // fireNotifEvent en in Apps Script (name !== actor).
      if(soort==='geven' && waarde && welkeWaarde==='nieuw' && !gemeld){
        const codes=[...new Set(items.map(it=>it.code).filter(Boolean))];
        const kop  = items.length===1 ? (codes[0]||'') : `${items.length} taken`;
        const rest = items.length===1 ? (items[0].r.naam||'')
                   : codes.slice(0,3).join(', ') + (codes.length>3 ? ` en ${codes.length-3} andere` : '');
        fireNotifEvent('assigned',{sec:items[0].sec, code:kop, naam:rest, behandelaar:waarde});
        gemeld=true;
      }
    };
  };
  // Eigen ontdubbelsleutel op de TAAKNUMMERS, net als bij afronden en verwijderen. Zonder sleutel
  // valt showUndoToast terug op titel+tekst, en die zijn hier louter 'aantal + waarde' en een rij
  // VvE-codes: twee keer dezelfde deadline zetten op dezelfde selectie gaf dus een identieke
  // sleutel, en dan slikte de ontdubbeling de tweede toast in — inclusief de enige weg terug voor
  // een handeling die geen bevestigingsvraag heeft.
  const _undoSleutel=`bulkveld|${soort}|${items.map(i=>i.r.taakId||i.r._row).join('_')}`;
  showUndoToast(conf.titel,items.map(i=>i.code).join(', '),async()=>{
    await state._writeChain;
    if(blokkeerOffline()) return;   // vóór het terugzetten: anders staat het scherm op 'oud' terwijl de Sheet 'nieuw' houdt
    // Her-ankeren vóór het terugzetten. `backgroundWrite` doet in zijn finally een `loadAll(true)`,
    // en die vervangt élk rij-object in D door een vers exemplaar — ruim binnen de acht seconden
    // dat deze knop op het scherm staat. `it.r` wees daarna nergens meer naar: de undo schreef de
    // oude waarde netjes naar de Sheet, maar het SCHERM bleef de nieuwe waarde tonen tot de
    // volgende ronde. Zoeken op het vaste taaknummer, met het rij-object als terugval voor rijen
    // die er (nog) geen hebben.
    items.forEach(it=>{
      const lijst=D.ntd[it.sec]||[];
      if(lijst.indexOf(it.r)<0){
        const vers=it.taakId ? lijst.find(x=>(x.taakId||'')===it.taakId) : null;
        if(vers) it.r=vers;
      }
      it.r[conf.veld]=it.oud;
      if(oppDl && it.sec==='OPPAKKEN') it.r.prioriteit=it.oudPrio;
    });
    renderAll();
    // De rollback stond hier op een lege functie. Mislukte het ongedaan maken, dan meldde
    // backgroundWrite 'wijziging teruggezet' terwijl er niets werd teruggezet: het scherm bleef op
    // de oude waarde staan en de Sheet hield de nieuwe. Precies andersom als wat de melding zei,
    // en niet te zien tot de volgende verversing. Nu zet hij de nieuwe waarde terug — dat is
    // immers wat er dan nog steeds in de Sheet staat.
    backgroundWrite(schrijf('oud'),
      ()=>{ items.forEach(it=>{ it.r[conf.veld]=waarde;
              if(oppDl && it.sec==='OPPAKKEN') it.r.prioriteit=berekenPrioriteit(waarde,'OPPAKKEN').prioriteit; }); },
      'Ongedaan maken mislukt');
  },conf.icoon,{sleutel:_undoSleutel});
  backgroundWrite(schrijf('nieuw'),
    ()=>{ items.forEach(it=>{ it.r[conf.veld]=it.oud; if(oppDl && it.sec==='OPPAKKEN') it.r.prioriteit=it.oudPrio; }); },
    'Bulk-actie mislukt');
}

export { _bulkVolgorde, bulkGeselecteerd, bulkSelectie, toggleBulkMode, bulkVink, bulkWis,
         bulkAlles, allesVinkjeHtml, allesVinkjeStand, bulkHerstel,
         renderBulkUi, toggleBulkMenu, _sluitMenus, bulkDoe, bulkVeld, BULK_DEADLINE_KOLOM, _bulkUndoAfDoelRijen };
