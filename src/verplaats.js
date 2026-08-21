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
import { SECS, SID, OMSCHRIJVING_SLEUTEL } from "./config.js";
import { berekenPrioriteit, taakTitel } from "./util.js";
import { assertRowsMatch, _shiftNtdRows } from "./api.js";
import { ensureToken } from "./auth.js";
import { backgroundWrite, blokkeerOffline } from "./data.js";
import { renderAll } from "./main.js";
import { showToast } from "./notifications.js";
import { getSheetIds, getInsertRow, toevoegWaarden, taakUitCache } from "./crud.js";
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
// spreekt. `cols` en `keys` lopen in SECS gelijk op vanaf de eerste kolom; is er geen kop (het veld
// staat wel in keys maar niet in de tabel), dan valt hij terug op de sleutel zelf.
function _veldLabel(sec, sleutel){
  const spec = SECS[sec];
  if(!spec) return sleutel;
  const i = spec.keys.indexOf(sleutel);
  return (i > -1 && spec.cols && spec.cols[i]) ? spec.cols[i] : sleutel;
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
  // De omschrijving heet in elke categorie anders. Staat het doelveld leeg, dan gaat de tekst van
  // de bron erin; is het doelveld al gevuld (bron en doel delen dat veld, zoals Oppakken → LOD),
  // dan blijft die staan. Zo kan de tekst nooit verdwijnen en ook nooit dubbel komen te staan.
  const bronTekst = String(r[OMSCHRIJVING_SLEUTEL[bronSec]] || '').trim();
  const doelSleutel = OMSCHRIJVING_SLEUTEL[doelSec];
  if(bronTekst && !String(doel[doelSleutel] || '').trim()) doel[doelSleutel] = bronTekst;
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
function verplaatsVraagTekst(r, bronSec, doelSec){
  const verloren = verlorenVelden(r, bronSec, doelSec);
  const kop = `"${taakTitel(r, bronSec)}" gaat van ${SECS[bronSec].label} naar ${SECS[doelSec].label}.`
            + `\nHet taaknummer, de subtaken en de geschiedenis gaan mee.`;
  if(!verloren.length) return kop;
  return kop + `\n\nDeze velden kent ${SECS[doelSec].label} niet en vervallen:\n`
             + verloren.map(v => `• ${v.label}: ${v.waarde}`).join('\n');
}

async function verplaatsTaak(r, doelSec){
  if(!r || !SECS[doelSec] || r._sec === doelSec) return false;
  const bronSec = r._sec;
  if(!await vraagBevestiging({
      titel:`Verplaatsen naar ${SECS[doelSec].label}?`,
      tekst:verplaatsVraagTekst(r, bronSec, doelSec),
      bevestigTekst:'Verplaatsen' })) return false;
  if(blokkeerOffline()) return false;
  if(!await ensureToken()){ alert('Inloggen mislukt. Probeer het opnieuw.'); return false; }

  const verloren = verlorenVelden(r, bronSec, doelSec);
  const ids = await getSheetIds();
  const sheetId = ids['Nog Te Doen'];
  if(sheetId == null){ alert('Sheet "Nog Te Doen" niet gevonden'); return false; }

  // `getInsertRow` GOOIT als het sectieblok niet in het tabblad staat — bewust, want een taak die
  // ongemerkt in een andere sectie belandt is duurder dan een mislukte handeling. Hier opvangen:
  // zonder deze try komt die fout nergens aan (deze functie wordt niet geawait door de aanroeper)
  // en gebeurt er zichtbaar niets.
  let doelAfterRow;
  try { doelAfterRow = getInsertRow(doelSec); }   // 1-gebaseerd: invoegen ná deze rij
  catch(e){ alert(e.message); return false; }
  const { doelRij } = verplaatsWaarden(r, bronSec, doelSec, doelAfterRow + 1);
  // De verwijderindex ná de invoeging. Google voert de verzoeken op volgorde uit, dus de oude rij
  // is één plek opgeschoven zodra hij ONDER de invoegplek stond. Zonder deze correctie verdwijnt
  // de buurrij in plaats van de verhuisde taak — de duurste denkfout in dit hele bestand.
  const oudIndex = (r._row > doelAfterRow) ? r._row : r._row - 1;

  // Optimistisch: uit de oude sectie, in de nieuwe, en de rijnummers meeschuiven. Eerst de oude
  // rij eruit en terugschuiven, dán invoegen — in de Sheet gebeurt het andersom, maar in het
  // geheugen telt alleen dat de eindstand klopt en dit is de volgorde die niet over zichzelf
  // heen struikelt.
  const bronArr = D.ntd[bronSec] || [];
  const pos = bronArr.indexOf(r);
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
        const batchBody = { requests:[
          { insertDimension:{ range:{ sheetId, dimension:'ROWS', startIndex:doelAfterRow, endIndex:doelAfterRow+1 }, inheritFromBefore:true } },
          { updateCells:{ range:{ sheetId, startRowIndex:doelAfterRow, endRowIndex:doelAfterRow+1, startColumnIndex:0, endColumnIndex:rij.length },
            rows:[{ values: rij.map(v => ({ userEnteredValue:{ stringValue:String(v) } })) }], fields:'userEnteredValue' } },
          { deleteDimension:{ range:{ sheetId, dimension:'ROWS', startIndex:oudIndex, endIndex:oudIndex+1 } } },
        ]};
        const resp = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SID}:batchUpdate`,{
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
          const dArr = D.ntd[doelSec] || []; const dp = dArr.indexOf(doelRij);
          if(dp > -1) dArr.splice(dp, 1);
          _shiftNtdRows(naAfterRow, -1);      // de invoeging terugdraaien
          _shiftNtdRows(r._row, +1);          // en de verwijdering
          (D.ntd[bronSec] = D.ntd[bronSec] || []).push(r); },
    'Verplaatsen mislukt'
  );
  return true;
}

// Ingang vanaf een rij-id (de categorie-kiezer in het bewerkscherm werkt met het rij-object zelf).
async function verplaatsTaakVanRid(rid, doelSec){
  const r = taakUitCache(rid);
  if(!r) return false;
  return verplaatsTaak(r, doelSec);
}

export { verplaatsTaak, verplaatsTaakVanRid, verplaatsWaarden, verlorenVelden, verplaatsVraagTekst, _veldLabel };
