// ══════════════════════════════════════
//  OFFERTE-STAPPEN — automatische subtaak 'Offertes voorleggen aan eigenaren' (v12.5)
//  Elk nieuw offerte-traject wordt bundelkop (R=eigen taaknummer, S='0') en krijgt in
//  OPPAKKEN een gebundelde subtaak. Zie docs/superpowers/specs/2026-09-01-offerte-stappen-design.md.
//  Import-cyclus met crud.js is bewust en onschadelijk: alle over-en-weer-gebruik zit in
//  functie-lichamen, niet op moduleniveau (zelfde situatie als crud ↔ main).
//
//  FAALPADEN, EERLIJK. (1) Mislukt de subtaken-write maar slaagt de trajecten-write, dan blijft
//  een gewoon traject over: één lid met een bundelnummer is géén bundel (isBundel eist ≥2) en
//  rendert als normale rij — onschadelijk. (2) Andersom — subtaken-write slaagt, trajecten-write
//  faalt — blijft er een ÉCHTE voorleg-rij in Oppakken achter met een bundelId dat nergens meer
//  naar wijst: die rendert als gewone rij en telt gewoon mee, terwijl de toast 'Toevoegen
//  mislukt — wijziging teruggezet' zegt. Die rij wordt bewust NIET automatisch opgeruimd: dat
//  zou een extra delete-write zijn met eigen faalkansen (bij een netwerkstoring faalt juist die
//  óók), terwijl de achtergebleven rij zichtbaar is en met de hand te verwijderen.
// ══════════════════════════════════════
import { D } from "./state.js";
import { nieuwTaakId } from "./util.js";
import { rijIndex } from "./rij.js";
import { _shiftNtdRows } from "./api.js";
import { backgroundWrite } from "./data.js";
import { getInsertRow, insertAndWriteRows, toevoegWaarden } from "./crud.js";
import { logEvents } from "./render-overig.js";
import { renderNtd } from "./render-lijsten.js";
import { showToast } from "./notifications.js";

export const VOORLEG_ACTIE = 'Offertes voorleggen aan eigenaren';

// Kolomwaarden A..K van de subtaak, in het OPPAKKEN-stramien (code, naam, actiepunt, deadline,
// wie, prioriteit, opmerkingen, in behandeling, I, J, subcategorie). Geen deadline: een subtaak
// erft er bewust geen (zelfde regel als herzieAlsSubtaak). Puur, dus los toetsbaar.
export function voorlegValues(code, naam, behandelaar){
  return [code||'', naam||'', VOORLEG_ACTIE, '', behandelaar||'', '', '', 'FALSE', '', '', ''];
}

// Maak voor elk gegeven offerte-traject (al ín D.ntd, mét taakId en bundelId) de subtaak aan in
// OPPAKKEN — optimistisch + één insertAndWriteRows in de seriële wachtrij.
//
// AANROEPVOLGORDE (dwingend): deze functie hoort VÓÓR de insert-write van de trajecten zelf in
// de wachtrij. OPPAKKEN ligt bóven het offerteblok; deze write schuift dat blok in de Sheet
// omlaag, en de trajecten-write erna leest zijn anker vers uit rij-objecten die die verschuiving
// (via _shiftNtdRows hieronder) al dragen. Andersom wees dat anker n rijen te hoog en landde een
// traject pal onder een sectiekop — waar parseSections hem altijd weggooit.
//
// Mislukt deze write, dan blijft er een gewoon traject over: één lid met een bundelnummer is
// géén bundel (isBundel eist ≥2) en rendert als normale rij — onschadelijk.
// `gebruikt` = de taaknummers die deze opslag-actie al heeft uitgedeeld (uniekTaakId-idioom).
export function maakVoorlegSubtaken(trajecten, gebruikt){
  const lijst=(trajecten||[]).filter(t=>t && t.taakId && t.bundelId);
  if(!lijst.length) return;
  const uniek=()=>{ let id=nieuwTaakId(); while(gebruikt.has(id)) id=nieuwTaakId(); gebruikt.add(id); return id; };
  // Het anker mag de TRAJECT-opslag nooit meetrekken: deze aanroep staat bínnen submitTask's try,
  // en getInsertRow gooit bewust hard als het OPPAKKEN-blok ontbreekt. Zonder deze vangrail
  // verviel dan de hele traject-write terwijl het traject al optimistisch op het scherm staat en
  // de modal dicht is — 'taak weg, opslaan leek te lukken'. Lukt het anker niet: GEEN subtaak en
  // gewoon door (faalpad 1 hierboven); wél melden, anders zoekt niemand hem ooit.
  //
  // Dit anker passeert bewust geen bevestigInvoegPlek (die guard draait in submitTask alleen op
  // het anker van de traject-sectie zelf): elke verschuiving die dít anker raakt ligt bóven het
  // offerteblok en breekt dus óók die offerte-guard. De dekking is indirect, maar echt — en de
  // volgorde-vangrail hieronder vangt de rest.
  let afterRow;
  try{ afterRow=getInsertRow('OPPAKKEN'); }
  catch(e){
    console.warn('[voorleg] OPPAKKEN-anker niet te bepalen, subtaak overgeslagen:', e && e.message);
    showToast('Subtaak niet aangemaakt', 'Het offerte-traject zelf is wél opgeslagen. Maak "'+VOORLEG_ACTIE+'" zo nodig met de hand aan in Oppakken.', 'var(--rd)');
    return;
  }
  // Vangrail op de blokVOLGORDE: de dwingende wachtrij-volgorde hieronder leunt erop dat het
  // OPPAKKEN-blok bóven het offerteblok ligt. Ligt het anker NIET boven het verse traject-anker,
  // dan klopt die aanname niet meer — en dan liever géén subtaak dan eentje n rijen te laag
  // (parseSections gooit een rij pal onder een sectiekop stil weg).
  if(afterRow >= Math.min(...lijst.map(t=>t._row))){
    console.warn('[voorleg] OPPAKKEN-anker ('+afterRow+') ligt niet boven het offerteblok, subtaak overgeslagen');
    return;
  }
  const subs=[], blok=[];
  lijst.forEach((t,i)=>{
    const vals=voorlegValues(t.code, t.naam, t.behandelaar);
    const sub={_sec:'OPPAKKEN', _row:afterRow+1+i, taakId:uniek(), bundelId:t.bundelId, bundelVolg:'10'};
    ['code','naam','actiepunt','deadline','behandelaar','prioriteit','opmerkingen','inBehandeling']
      .forEach((k,j)=>{ sub[k]=vals[j]; });
    sub.subcategorie='';
    subs.push(sub); blok.push(toevoegWaarden(vals, sub));
  });
  _shiftNtdRows(afterRow, +subs.length);
  subs.forEach(s=>{ (D.ntd.OPPAKKEN=D.ntd.OPPAKKEN||[]).push(s); });
  renderNtd();
  // Anker VERS in de writeFn (zelfde vorm en reden als versAnker in submitTask): een rollback
  // eerder in de wachtrij kan alle rijnummers verschoven hebben.
  const versAnker=()=>{
    const a=D.ntd.OPPAKKEN||[];
    const levend=subs.map(s=>{ const i=rijIndex(a,s); return i>-1?a[i]:null; }).filter(Boolean);
    return levend.length ? Math.min(...levend.map(s=>s._row))-1 : afterRow;
  };
  let ingevoegd=false;
  backgroundWrite(
    async()=>{ if(!ingevoegd){ await insertAndWriteRows('Nog Te Doen', versAnker(), blok); ingevoegd=true; }
      await logEvents(subs.map(s=>({code:s.code, sec:'OPPAKKEN', actie:'Aangemaakt', veld:'',
                                    oudeWaarde:'', nieuweWaarde:s.behandelaar||''}))); },
    ()=>{ const a=D.ntd.OPPAKKEN||[]; let weg=0; const anker=versAnker();
          subs.forEach(s=>{ const p=rijIndex(a,s); if(p>-1){ a.splice(p,1); weg++; } });
          if(weg) _shiftNtdRows(anker,-weg); },
    'Subtaak aanmaken mislukt'
  );
}
