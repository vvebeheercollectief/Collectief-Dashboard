// ══════════════════════════════════════
//  VERPLAATSEN — een taak naar een andere categorie, mét zijn geschiedenis
// ══════════════════════════════════════
//
// WAAROM DIT BESTAAT. Staat een gemeentebrief onder Oppakken in plaats van LOD, dan was de enige
// weg: weggooien en opnieuw intypen. Daarmee verdween het taaknummer (kolom Q), de koppeling met
// subtaken (R en S) en het hele spoor in het logboek — dat hangt allemaal aan de identiteit van de
// rij. In de praktijk liet je hem dus staan waar hij niet hoorde, en dan klopt de categorie-indeling
// van het hele dashboard niet meer.
//
// HOE HET VEILIG BLIJFT. De verplaatsing is ÉÉN batchUpdate met drie stappen die Google in volgorde
// uitvoert: rij invoegen in de doelsectie, hem vullen, en de oude rij verwijderen. Alles-of-niets;
// er bestaat geen moment waarop de taak twee keer of nul keer in het blad staat. Precies hetzelfde
// stramien als afronden (doCompleteTask in crud.js), dat al jaren zo werkt.
//
// WAT ER NIET MEEGAAT, GAAT NIET STIL. Elke categorie heeft eigen velden. Een LOD-taak heeft een
// 'Status' die Oppakken niet kent; een offerte-traject heeft een tellerstand die nergens anders
// bestaat. Die velden kunnen niet mee. In plaats van ze stilletjes te laten vallen, zet
// `verlorenVelden` ze op een rij en toont de vraag ze met naam en waarde — en het logboek legt ze
// vast, zodat ze ook achteraf nog terug te lezen zijn.
import { state, D } from "./state.js";
import { verseRij, rijIndex } from "./rij.js";
import { SECS, SID, OMSCHRIJVING_SLEUTEL, VELD_LABELS } from "./config.js";
import { berekenPrioriteit, taakTitel } from "./util.js";
import { assertRowsMatch, _shiftNtdRows, _herstelShift, sheetsFetch } from "./api.js";
import { ensureToken } from "./auth.js";
import { backgroundWrite, blokkeerOffline, loadAll } from "./data.js";
import { renderAll } from "./main.js";
import { showToast } from "./notifications.js";
import { getSheetIds, getInsertRow, bevestigInvoegPlek, toevoegWaarden } from "./crud.js";
import { logEvent } from "./render-overig.js";
import { vraagBevestiging } from "./bevestig.js";

// Velden die geen inhoud van de gebruiker zijn maar boekhouding van de app. Ze verhuizen altijd
// mee (of worden opnieuw berekend) en horen dus nooit in de 'dit gaat verloren'-lijst.
const BOEKHOUD_SLEUTELS = new Set(['code','naam','behandelaar','deadline','opmerkingen',
                                   'inBehandeling','prioriteit']);

// Welke ingevulde velden van de BRON kent de doelcategorie niet? Puur, zodat de vraag en het
// logboek allebei uit dezelfde bron putten. Alleen velden met écht iets erin: een lege 'Status'
// verliezen is geen verlies en zou de vraag alleen maar langer maken.
function verlorenVelden(r, bronSec, doelSec){
  const doelKeys = new Set(SECS[doelSec] ? SECS[doelSec].keys : []);
  const bronOmschrijving = OMSCHRIJVING_SLEUTEL[bronSec];
  return (SECS[bronSec] ? SECS[bronSec].keys : [])
    .filter(k => !doelKeys.has(k))
    .filter(k => k !== bronOmschrijving)      // de omschrijving verhuist altijd mee, zie hieronder
    .filter(k => !BOEKHOUD_SLEUTELS.has(k))
    .map(k => ({ sleutel:k, label:_veldLabel(bronSec, k), waarde:String(r[k] == null ? '' : r[k]).trim() }))
    .filter(v => v.waarde !== '');
}

// De kolomkop zoals de gebruiker hem in de tabel ziet, zodat de vraag niet met interne veldnamen
// spreekt. Uit VELD_LABELS (config.js) en nadrukkelijk NIET uit `cols` op index: die twee lopen
// niet gelijk op, en zodra er een kop bij komt die bij geen veld hoort al helemaal niet (de
// Signaal-kolom was daar tot v12.0 het voorbeeld van).
// Kent VELD_LABELS het veld niet, dan valt hij terug op de sleutel zelf.
function _veldLabel(sec, sleutel){
  const kaart = VELD_LABELS[sec];
  return (kaart && kaart[sleutel]) ? kaart[sleutel] : sleutel;
}

// De celwaarden (A..S) voor de rij zoals hij in de DOELcategorie komt te staan. Puur.
//
// Veld voor veld op NAAM overnemen en niet op positie: dezelfde naam betekent in elke categorie
// hetzelfde veld, maar hij staat lang niet altijd in dezelfde kolom (de deadline is bij Oppakken
// kolom D en overal elders F). Op positie kopiëren zou een deadline in het statusveld zetten.
function verplaatsWaarden(r, bronSec, doelSec, nieuwRow){
  const doelSpec = SECS[doelSec];
  const doel = { ...r, _sec:doelSec, _row:nieuwRow };
  doelSpec.keys.forEach(k => { if(doel[k] === undefined) doel[k] = ''; });
  // Velden die de doelcategorie niet kent, mogen niet als losse eigenschap blijven hangen: ze
  // zouden bij een volgende serialisatie alsnog ergens kunnen opduiken.
  Object.keys(r).forEach(k => {
    if(k.startsWith('_')) return;
    if(!doelSpec.keys.includes(k) && !['subcategorie','opvolgdatum','herhaalId','fase','aannemers',
                                       'taakId','bundelId','bundelVolg'].includes(k)) delete doel[k];
  });
  // De omschrijving heet in elke categorie anders, en dát is de enige tekst die per se mee MOET:
  // `verlorenVelden` sluit hem uit van de 'dit vervalt'-lijst met de belofte dat hij altijd
  // meeverhuist. Die belofte werd op twee manieren gebroken:
  //
  //  1. WEG. Stond het doelveld al vol, dan bleef de brontekst achter — en als de doelcategorie
  //     het bronveld niet kent, gooit de delete-lus hierboven dat veld weg. Naar Offerte-trajecten
  //     gebeurde dat altijd: de omschrijving heet daar 'opmerkingen', en Opmerkingen is bij
  //     Oppakken, LOD, Vergaderverzoeken én Subsidie een gewone, meestal gevulde kolom. Het
  //     Actiepunt verdween dan spoorloos: niet in de Sheet, niet in de vraag, niet in het logboek.
  //  2. DUBBEL. Andersom (Offerte → Oppakken) kwam dezelfde tekst in Actiepunt én in Opmerkingen
  //     te staan, want 'opmerkingen' bestaat in de doelcategorie ook gewoon.
  //
  // Nu: dragen bron en doel dezelfde veldnaam, dan valt er niets te doen. Verschillen ze, dan
  // verhuist de tekst écht — vóór een eventuele bestaande doeltekst, met een witregel ertussen —
  // en wordt het bronveld leeggemaakt als de doelcategorie het óók kent.
  const bronSleutel = OMSCHRIJVING_SLEUTEL[bronSec];
  const doelSleutel = OMSCHRIJVING_SLEUTEL[doelSec];
  const bronTekst = String(r[bronSleutel] || '').trim();
  if(bronTekst && bronSleutel !== doelSleutel){
    const bestaand = String(doel[doelSleutel] || '').trim();
    // Was het doelveld al gevuld, dan komen er twee teksten in één cel te staan. Zet er dan een
    // kopje boven de OUDE tekst, zodat je later nog kunt zien welk stuk waar vandaan komt: zonder
    // dat merkje is een verhuizing heen én terug niet meer te ontwarren (de tweede reis zou het
    // hele blok als 'de omschrijving' meenemen).
    doel[doelSleutel] = bestaand
      ? `${bronTekst}\n\n— ${_veldLabel(bronSec, doelSleutel)}: ${bestaand}`
      : bronTekst;
    if(doelSpec.keys.includes(bronSleutel)) doel[bronSleutel] = '';
  }
  // De prioriteit is een BEREKEND veld (alleen Oppakken heeft hem als kolom) en de drempels
  // verschillen per categorie. Overnemen zou een verouderde waarde meeslepen.
  if(doelSpec.keys.includes('prioriteit'))
    doel.prioriteit = berekenPrioriteit(doel.deadline, doelSec).prioriteit;
  const values = doelSpec.keys.map(k => {
    const v = doel[k];
    return v === true ? 'TRUE' : v === false ? 'FALSE' : (v == null ? '' : v);
  });
  // Kolom K (subcategorie) staat op vaste positie 10, ná de sectievelden. Zelfde stramien als
  // submitTask: aanvullen tot 11 waarden en dan de subcategorie erachter.
  while(values.length < 10) values.push('');
  values[10] = doel.subcategorie || '';
  // En L..S via dezelfde helper als een nieuwe taak, zodat taaknummer (Q) en bundel (R/S) op
  // precies dezelfde plek belanden. Dát is de kern van dit hele bestand: de identiteit verhuist mee.
  const rij = toevoegWaarden(values.slice(0, 11), doel);
  // L = opvolgdatum, M = herhaal-id. `toevoegWaarden` laat L..P leeg (dat klopt voor een NIEUWE
  // taak), maar een verhuizende taak neemt zijn opvolgdatum en herhaalregel gewoon mee.
  rij[11] = doel.opvolgdatum || '';
  rij[12] = doel.herhaalId || '';
  rij[14] = doel.fase || '';
  rij[15] = doel.aannemers || '';
  return { rij, doelRij: doel };
}

// De tekst van de vraag. Los, zodat hij te toetsen is zonder venster.
function verplaatsVraagTekst(r, bronSec, doelSec, nietOpgeslagen){
  const verloren = verlorenVelden(r, bronSec, doelSec);
  // WAT DE VRAAG BELOOFT MOET WAAR ZIJN. Eerder stond hier 'de geschiedenis gaat mee', en dat was
  // te veel gezegd: het Logboek kent geen taaknummer (kolommen: tijd, VvE-code, sectie, actie, …),
  // dus het geschiedenisblok in dit scherm filtert op VvE-code ÉN categorie (renderTaskHistory in
  // render-overig.js). Regels van vóór de verhuizing blijven daardoor bij de oude categorie staan.
  // De verhuizing zelf wordt wél onder de nieuwe categorie vastgelegd, dus het spoor loopt door —
  // maar de oude notities verhuizen niet mee, en dat hoort de gebruiker te weten vóór hij klikt.
  const bronSleutel = OMSCHRIJVING_SLEUTEL[bronSec];
  const doelSleutel = OMSCHRIJVING_SLEUTEL[doelSec];
  // Heet de omschrijving in de doelcategorie anders, zeg dan wáár hij terechtkomt. Anders lijkt
  // het alsof de tekst verdwijnt: hij staat straks onder een andere kolomkop.
  const _bronTekst = String(r[bronSleutel]||'').trim();
  const _doelGevuld = String(r[doelSleutel]||'').trim();
  const tekstZin = (bronSleutel !== doelSleutel && _bronTekst)
    ? `\nDe tekst uit '${_veldLabel(bronSec, bronSleutel)}' komt in '${_veldLabel(doelSec, doelSleutel)}' te staan`
      + (_doelGevuld ? `, boven de tekst die daar nu staat.` : '.')
    : '';
  const kop = `"${taakTitel(r, bronSec)}" gaat van ${SECS[bronSec].label} naar ${SECS[doelSec].label}.`
            + tekstZin
            + `\nHet taaknummer en de subtaken gaan mee.`
            + `\nHet logboek houdt de regels van vóór deze verhuizing bij ${SECS[bronSec].label}; `
            + `de verhuizing zelf komt bij ${SECS[doelSec].label} te staan.`;
  // Staat er nog niet-opgeslagen typwerk in het scherm? Dan gaat dat NIET mee: de verhuizing bouwt
  // de nieuwe rij uit de opgeslagen taak. Vroeger verdween die tekst zonder één woord.
  const onopgeslagen = (nietOpgeslagen && nietOpgeslagen.length)
    ? `\n\nLET OP: je hebt ${nietOpgeslagen.length===1?'een wijziging':'wijzigingen'} in `
      + `${nietOpgeslagen.map(v=>`'${v}'`).join(', ')} die nog niet ${nietOpgeslagen.length===1?'is':'zijn'} opgeslagen. `
      + `${nietOpgeslagen.length===1?'Die gaat':'Die gaan'} NIET mee. Annuleer en klik eerst op Opslaan als je ${nietOpgeslagen.length===1?'hem':'ze'} wilt bewaren.`
    : '';
  if(!verloren.length) return kop + onopgeslagen;
  return kop + `\n\nDeze velden kent ${SECS[doelSec].label} niet en vervallen:\n`
             + verloren.map(v => `• ${v.label}: ${v.waarde}`).join('\n')
             + onopgeslagen;
}

async function verplaatsTaak(r, doelSec, nietOpgeslagen){
  if(!r || !SECS[doelSec] || r._sec === doelSec) return false;
  const bronSec = r._sec;
  if(!await vraagBevestiging({
      titel:`Verplaatsen naar ${SECS[doelSec].label}?`,
      tekst:verplaatsVraagTekst(r, bronSec, doelSec, nietOpgeslagen),
      bevestigTekst:'Verplaatsen' })) return false;
  if(blokkeerOffline()) return false;
  if(!await ensureToken()){ alert('Inloggen mislukt. Probeer het opnieuw.'); return false; }

  const verloren = verlorenVelden(r, bronSec, doelSec);
  // Zelfde reden als de try rond `getInsertRow` hieronder: deze functie wordt door de
  // categoriekiezer (main.js) wel geawait maar niet gecatcht, dus een fout hier komt NERGENS aan.
  // `getSheetIds` gooit bij elk niet-ok antwoord én bij een netwerkfout, en juist bij de EERSTE
  // schrijfactie van een sessie is de lijst nog niet gevuld en gaat hij echt het net op. Zonder
  // deze try bleef het venster staan met de nieuwe categorie in de kiezer terwijl er niets was
  // gebeurd — een stille mislukking die pas dagen later opvalt.
  let ids;
  try { ids = await getSheetIds(); }
  catch(e){ alert('Verplaatsen mislukt: ' + (e && e.message ? e.message : e)); return false; }
  const sheetId = ids['Nog Te Doen'];
  if(sheetId == null){ alert('Sheet "Nog Te Doen" niet gevonden'); return false; }

  // `getInsertRow` GOOIT als het sectieblok niet in het tabblad staat — bewust, want een taak die
  // ongemerkt in een andere sectie belandt is duurder dan een mislukte handeling. Hier opvangen:
  // zonder deze try komt die fout nergens aan (deze functie wordt niet geawait door de aanroeper)
  // en gebeurt er zichtbaar niets.
  let doelAfterRow;
  try { doelAfterRow = getInsertRow(doelSec); }   // 1-gebaseerd: invoegen ná deze rij
  catch(e){ alert(e.message); return false; }
  // En klopt die plek nog? Ook deze weg loopt met een OPEN venster, dus met een stilstaande
  // verversing: het rijnummer hierboven komt uit het geheugen van vóór de vraag die de gebruiker
  // net beantwoordde. Zie `bevestigInvoegPlek` in crud.js.
  try { await bevestigInvoegPlek(doelSec, doelAfterRow); }
  catch(e){ alert(e.melding || e.message); loadAll(); return false; }
  const { doelRij } = verplaatsWaarden(r, bronSec, doelSec, doelAfterRow + 1);

  // Optimistisch: uit de oude sectie, in de nieuwe, en de rijnummers meeschuiven. Eerst de oude
  // rij eruit en terugschuiven, dán invoegen — in de Sheet gebeurt het andersom, maar in het
  // geheugen telt alleen dat de eindstand klopt en dit is de volgorde die niet over zichzelf
  // heen struikelt.
  const bronArr = D.ntd[bronSec] || [];
  const pos = rijIndex(bronArr, r);   // identiteit, niet object — zie src/rij.js
  if(pos > -1) bronArr.splice(pos, 1);
  _shiftNtdRows(r._row, -1);
  const naAfterRow = getInsertRow(doelSec);
  doelRij._row = naAfterRow + 1;
  _shiftNtdRows(naAfterRow, +1);
  (D.ntd[doelSec] = D.ntd[doelSec] || []).push(doelRij);
  renderAll();

  // Idempotent, om dezelfde reden als bij afronden: deze batch is POSITIE-gebaseerd. Een
  // herkansing na een tijdelijke fout zou een tweede rij invoegen en een onschuldige buurrij
  // verwijderen.
  let verplaatst = false, gelogd = false;
  backgroundWrite(
    async ()=>{
      if(!verplaatst){
        // De rij-controle doet hier twee dingen tegelijk. Ze bewaakt dat we nog naar dezelfde TAAK
        // kijken (anders breekt ze af), én ze geeft de teruggelezen cellen terug — en dáár halen
        // we kolom L t/m S uit in plaats van uit het geheugen.
        //
        // Dat is geen overdaad. Het rij-object kan minuten oud zijn: de achtergrondverversing slaat
        // een ronde over zolang er een venster openstaat. Heeft een collega intussen de volgorde
        // van een bundel gewijzigd (kolom R/S), dan zou de verhuizende taak met een verouderd
        // bundelnummer worden weggeschreven en stil uit zijn bundel vallen — precies dezelfde
        // landmijn die `koppelTaak` al ontmanteld heeft.
        const vers = await assertRowsMatch([{ row:r._row, r }]);
        const cellen = vers.get(r._row) || [];
        // L..S: opvolgdatum, herhaal-ID, escalatiestempel, offerte-fase, aannemers, taaknummer,
        // bundelnummer, volgnummer. Wat er niet teruggelezen wordt, valt terug op het geheugen —
        // values.get kapt lege staartkolommen af, dus een korte rij is normaal en geen fout.
        const uitBlad = (i, terugval) => (cellen[i] != null && cellen[i] !== '') ? cellen[i] : (terugval || '');
        const rij = verplaatsWaarden(r, bronSec, doelSec, doelAfterRow + 1).rij;
        rij[11] = uitBlad(11, doelRij.opvolgdatum);
        rij[12] = uitBlad(12, doelRij.herhaalId);
        // Kolom N (het escalatiestempel) gaat NIET mee. De drempels verschillen sterk per
        // categorie — Oppakken 7/14 dagen, LOD 30/60 — dus een LOD-taak met een 'trap 1'-stempel
        // zou in Oppakken trap 1 overslaan en bij veertien dagen meteen de TEAMBREDE melding
        // afvuren. De klok hoort in de nieuwe categorie opnieuw te beginnen.
        rij[13] = '';
        rij[14] = uitBlad(14, doelRij.fase);
        rij[15] = uitBlad(15, doelRij.aannemers);
        rij[16] = uitBlad(16, doelRij.taakId);
        rij[17] = uitBlad(17, doelRij.bundelId);
        rij[18] = uitBlad(18, doelRij.bundelVolg);
        // BEWUST `stringValue` en dus tekst, ondanks dat elke andere schrijfweg naar dit tabblad
        // USER_ENTERED gebruikt. De reden is de atomiciteit: insert + schrijven + delete zitten
        // hier in ÉÉN batchUpdate, en die past Sheets alles-of-niets toe. De values-API met
        // USER_ENTERED kan dat niet in dezelfde opdracht, dus splitsen zou een half verplaatste
        // taak mogelijk maken — veel duurder dan het gevolg hiervan. Dat gevolg is cosmetisch: de
        // datumcellen van deze ene rij staan als tekst in de Sheet ('01-09-2026' i.p.v. een echte
        // datumwaarde). Zowel `_parseAnyDate` (frontend) als `cd_parseDate` (Apps Script) lezen
        // die vorm gewoon; alleen de uitlijning in de Sheet verschilt.
        // DE INVOEGPLEK VERS AFLEIDEN, niet het getal van het klikmoment gebruiken. `doelAfterRow`
        // is een los getal en schuift nergens in mee; `doelRij` staat in D.ntd en wordt door élke
        // `_shiftNtdRows` gecorrigeerd — óók door de ROLLBACK van een schrijfactie die vóór deze in
        // de wachtrij stond. `backgroundWrite` voert die wachtrij serieel uit, dus daar zit echt
        // tijd tussen. De rij-guard hierboven dekt dit niet: die bewaakt alleen de rij die
        // VERWIJDERD wordt, niet de plek waar ingevoegd wordt. Landde de invoeging één rij te laag,
        // dan kwam de taak pal onder een sectiekop en gooit `parseSections` hem weg als kolomkoprij
        // — verdwenen uit 'Nog Te Doen' én niet in 'Afgerond', inclusief taaknummer en bundel.
        //
        // `doelRij._row` staat in de nummering ná het verwijderen van de bronrij; de batch begint
        // met de INVOEGING en telt dus nog in de nummering van vóór dat verwijderen. Stond de
        // bronrij bóven de invoegplek, dan telt hij daar nog mee — vandaar de +1. Dat is precies de
        // rekensom die `naAfterRow` hierboven omgekeerd maakte.
        const naNu   = doelRij._row - 1;
        const insIdx = naNu + (r._row <= naNu + 1 ? 1 : 0);
        // De verwijderindex ná de invoeging. Google voert de verzoeken op volgorde uit, dus de oude
        // rij is één plek opgeschoven zodra hij ONDER de invoegplek stond. Zonder deze correctie
        // verdwijnt de buurrij in plaats van de verhuisde taak — de duurste denkfout in dit bestand.
        const oudIndex = (r._row > insIdx) ? r._row : r._row - 1;
        const batchBody = { requests:[
          { insertDimension:{ range:{ sheetId, dimension:'ROWS', startIndex:insIdx, endIndex:insIdx+1 }, inheritFromBefore:true } },
          { updateCells:{ range:{ sheetId, startRowIndex:insIdx, endRowIndex:insIdx+1, startColumnIndex:0, endColumnIndex:rij.length },
            rows:[{ values: rij.map(v => ({ userEnteredValue:{ stringValue:String(v) } })) }], fields:'userEnteredValue' } },
          { deleteDimension:{ range:{ sheetId, dimension:'ROWS', startIndex:oudIndex, endIndex:oudIndex+1 } } },
        ]};
        const resp = await sheetsFetch(`https://sheets.googleapis.com/v4/spreadsheets/${SID}:batchUpdate`,{
          method:'POST', headers:{ Authorization:`Bearer ${state.oauthToken}`, 'Content-Type':'application/json' },
          body:JSON.stringify(batchBody) });
        if(!resp.ok){ const e=await resp.json().catch(()=>({}));
          if(resp.status===401){ state.oauthToken=null; state.oauthExpiry=0; }
          const err=new Error(e.error?.message||'Verplaatsen mislukt'); err.status=resp.status; throw err; }
        verplaatst = true;
      }
      // DE LOGREGEL GAAT ONDER DE NIEUWE CATEGORIE, en dat is geen boekhoudkundige haarkloverij.
      // Twee dingen sleutelen op code + SECTIE:
      //   - het geschiedenisblok in het bewerkscherm (renderTaskHistory in render-overig.js), dus
      //     onder de oude sectie loggen laat de verhuisde taak 'Nog geen notities' tonen terwijl de
      //     vraag woordelijk belooft dat de geschiedenis meegaat;
      //   - de escalatiemotor in Apps Script (Opvolging.gs bouwt een kaart `code|SECTIE` en slaat
      //     een taak zonder activiteit in díe sectie over). Onder de oude sectie loggen laat de
      //     taak dus stil uit de bewaking vallen — of, als die VvE daar toevallig oudere activiteit
      //     heeft, laat hem morgen teambreed escaleren zonder aanleiding.
      // De oude categorie staat als 'oude waarde' in dezelfde regel, dus het spoor blijft leesbaar.
      // Idempotent: `_withRetry` draait deze functie tot drie keer bij een tijdelijke fout, en een
      // append is niet idempotent — zonder vlag komt er dan een tweede 'Verplaatst' in het Logboek,
      // die ook nog eens de stil-teller opnieuw op nul zet.
      if(!gelogd){
        await logEvent(r.code, doelSec, 'Verplaatst', 'categorie', SECS[bronSec].label, SECS[doelSec].label);
        // De vervallen velden apart vastleggen. Dit is de enige plek waar ze nog terug te lezen zijn
        // nadat de kolom is verdwenen — en juist daarom hoort het in het journaal en niet alleen in
        // een venster dat de gebruiker wegklikt.
        for(const v of verloren)
          await logEvent(r.code, doelSec, 'Vervallen bij verplaatsen', v.label, v.waarde, '');
        gelogd = true;
      }
      showToast('Taak verplaatst', `${r.code} — nu bij ${SECS[doelSec].label}`, null, 'label',
                { geenDedup:true, geenSysteemmelding:true });
    },
    ()=>{ // Exact het spiegelbeeld van de optimistische mutatie hierboven, in omgekeerde volgorde.
          // De vorige versie zette de taak ACHTERAAN zijn oude categorie en schoof daarbij alles
          // eronder op terwijl er in de Sheet niets was ingevoegd: elke buurrij tussen de oude plek
          // en het einde van het blok stond daarna één rijnummer te hoog. Normaal binnen een
          // seconde rechtgetrokken door de stille resync, maar juist de tak die deze rollback het
          // vaakst afvuurt is 'offline' — en dan komt die resync per definitie niet.
          const dArr = D.ntd[doelSec] || []; const dp = rijIndex(dArr, doelRij);
          const versDoel = dp > -1 ? dArr[dp] : null;
          // Het anker VÓÓR het verwijderen aflezen, en uit het levende rij-object: `naAfterRow` is
          // het bevroren getal van het klikmoment en kan door de rollback van een eerdere
          // schrijfactie achterhaald zijn — zelfde reden als bij de invoegplek in de writeFn.
          // Uit het VERSE object, niet uit `doelRij`: `rijIndex` vindt de rij ook op taaknummer
          // terug, en dan is het aangeklikte object nog steeds het bevroren exemplaar.
          const naNu2 = (versDoel ? versDoel._row : naAfterRow + 1) - 1;
          if(dp > -1) dArr.splice(dp, 1);
          _shiftNtdRows(naNu2, -1);      // de invoeging terugdraaien
          _herstelShift(_shiftNtdRows, r._row);   // en de verwijdering — via het huisidioom, want de
                                            // rij die dóór de delete op r._row kwam te staan moet
                                            // óók terugschuiven (de shift-conditie is '>')
          // Terug op de OUDE plek in de lijst, niet achteraan: `getInsertRow` leest het rijnummer van
          // het laatste element, en een teruggezette rij met een laag _row achteraan zou het anker
          // midden in het blok laten wijzen. Zelfde idioom als de rollbacks in bulk.js.
          const _bArr=(D.ntd[bronSec] = D.ntd[bronSec] || []);
          _bArr.splice(Math.min(pos<0?_bArr.length:pos, _bArr.length), 0, r); },
    'Verplaatsen mislukt'
  );
  return true;
}

export { verplaatsTaak, verplaatsWaarden, verlorenVelden, verplaatsVraagTekst, _veldLabel };
