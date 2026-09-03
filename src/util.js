// ══════════════════════════════════════
//  UTIL — gedeelde pure helpers (datums, prioriteit, tekst, badges)
// ══════════════════════════════════════
import { EMAIL_NAMES, OFFERTE_FASES, SECS, KORTE_NAMEN } from './config.js';
import { ICONS } from './icons.js';

function displayName(s){
  if(!s) return '';
  const key = String(s).toLowerCase().trim();
  return EMAIL_NAMES[key] || s;
}

// Velden die de gebruiker NIET ziet en dus ook niet hoort te doorzoeken. Zonder deze lijst gaf
// `Object.values` valse treffers op boekhouding: zoeken op '12' vond elke rij met rijnummer 12,
// 'oppakken' vond álles (elke rij draagt zijn sectie mee), en 't7' of 'hr-9' vonden een taak
// waarin die tekst nergens te zien is. Precies het soort zoekopdracht dat op de Afgerond-pagina
// voor de hand ligt — een VvE-code is óók een getal.
// De aannemerslijst staat er bewust NIET bij: 'Jansen' is een naam die je wilt kunnen zoeken.
// `inBehandeling` en `prioriteit` staan er sinds v11.0 bij, en dat waren de twee vervelendste:
// kolom H bevat de LETTERLIJKE tekst 'TRUE' of 'FALSE' (een selectievakje-kolom), dus elke
// zoekterm die in 'true' of 'false' zit gaf de hele lijst terug. Twee aanslagen van
// 'Algemene ledenvergadering' is 'al' en van 'Servicekosten' is 'se' — allebei een deelstring
// van 'false'. Prioriteit staat sinds v8.9 niet meer in beeld; op 'hoog' zoeken vond dan taken
// waar dat woord nergens te lezen is.
// duurMin hoort hier ook: die staat nergens op het scherm, maar is wél een GETAL, en dat maakt
// hem gevaarlijker dan de rest van deze lijst. Zoeken op huisnummer '30' gaf anders elke taak
// terug die toevallig een half uur duurde, en '2u+' (120 minuten) matchte op '0', '12', '20' én
// '120' tegelijk.
const NIET_ZOEKBAAR = new Set(['_row','_sec','_offertesManual','_aannemers',
                               'taakId','bundelId','bundelVolg','herhaalId','esc','fase',
                               'inBehandeling','prioriteit','duurMin']);
// Zoeken op de Afgerond-pagina dekt precies wat `rowAf` (render-tabel.js) TOONT: code, naam, de
// taakomschrijving zoals hij op het scherm staat (taakTitel, inclusief zijn terugvalketen),
// subcategorie, behandelaar, afronddatum en toelichting — plus de aannemersnamen (util.js-regel
// hierboven: die horen doorzoekbaar te zijn). Een WITTE lijst en geen zwarte: de zwarte lijst
// moest bij elk nieuw veld op het rij-object worden bijgehouden (duurMin was de laatste), en wat
// vergeten werd lekte stil de zoek in — een treffer op een onzichtbare oude deadline is voor de
// gebruiker niet uit te leggen (naloop 2026-08-28). NIET_ZOEKBAAR blijft bestaan voor filterNtd.
export const _afZoekvelden = r => [r.code, r.naam, taakTitel(r, r._sec), r.subcategorie, r.behandelaar,
                            // `opmerking` en NIET `toelichting`: parseSections (data.js) schrijft kolom J van
                            // 'Afgerond' als `entry.opmerking`. Met de oude naam zocht deze balk in een veld dat
                            // niet bestaat — onopvallend zolang kolom J bijna altijd leeg was, maar sinds de
                            // opmerking bij afronden verplicht is, is dit hét veld dat je wilt terugvinden.
                            r.datum, r.opmerking, ...parseAannemers(r.aannemers).map(a=>a.naam)];
function filt(rows,q){
  if(!q)return rows;
  return rows.filter(r=>_afZoekvelden(r).some(v=>String(v??'').toLowerCase().includes(q)));
}

// Sleutel voor het ontdubbelen van toasts, ongevoelig voor een leidend symbool.
// Dezelfde gebeurtenis komt langs twee wegen binnen met een ANDERE titel: de frontend toont
// 'Nieuwe taak — oppakken' (notifications.js) en Apps Script schrijft '📋 Nieuwe taak — oppakken'
// naar het tabblad Meldingen (Notifications.gs). Op de ruwe tekst botsten die nooit, waardoor de
// kruispad-ontdubbeling die notifications.js belooft in de praktijk nóóit werkte: wie een taak
// aanmaakte, zag hem twee keer. Alleen het begin wordt geschoond — een emoji middenin de tekst
// blijft betekenisvol en mag het onderscheid tussen twee meldingen niet wegpoetsen.
const _zonderLeidendSymbool=(s)=>(s||'').toString().replace(/^[^\p{L}\p{N}]+/u,'').trim();
const meldSleutel=(titel,msg)=>_zonderLeidendSymbool(titel)+'|'+_zonderLeidendSymbool(msg);

// Welke rij in 'Afgerond' hoort bij DEZE zojuist afgeronde taak? Puur, en bewust één bron voor de
// twee undo-wegen (undoComplete in notifications.js en _bulkUndoAfDoelRijen in bulk.js): allebei
// wissen ze een archiefrij, en een verkeerde keuze is daar onherstelbaar.
//
// Eerst op het vaste TAAKNUMMER. Dat staat sinds de Takenbundel óók in kolom Q van 'Afgerond'
// (`afrondWaarden`, crud.js) en is de enige echte identiteit die een archiefrij heeft.
// Zoeken op VvE-code leunt erop dat de lijst nieuwste-eerst gesorteerd is, en die sortering kan de
// vraag niet beantwoorden zodra er twee afrondingen van dezelfde VvE op dezelfde dag in dezelfde
// sectie staan: `parseDt(b.datum)-parseDt(a.datum)` geeft dan 0, `Array.sort` is stabiel, en dus
// beslist de FYSIEKE bladvolgorde wie 'de nieuwste' heet. Die volgorde is niet aan de datum
// gekoppeld — `getAfInsertRow` (crud.js) plakt een nieuwe rij achter het laatste lid van een op
// datum gesorteerde lijst, dus achter het OUDST gedateerde. Het gevolg is dan dubbel raak: een
// oudere afronding verdwijnt én de zojuist afgeronde taak blijft in 'Afgerond' staan terwijl hij
// ook terugkomt in Nog Te Doen. De rij-guard eronder vangt dat niet: die bevestigt alleen dat de
// GEKOZEN rij nog op zijn plek staat, niet dat de keuze klopt.
//
// De code blijft de terugval, en dat is geen luxe: rijen van vóór deze functie hebben geen kolom Q,
// en de legacy onEdit-trigger schrijft er zijn eigen archiefrijen bij.
// `bezet` (optioneel) is een Set met al geclaimde rijen, zodat twee items met dezelfde code in één
// bulk-undo niet dezelfde rij pakken.
function kiesAfgerondRij(rijen, taakId, code, bezet){
  const lijst = rijen || [];
  const vrij = r => !bezet || !bezet.has(r);
  const nr = ((taakId ?? '') + '').trim();
  if (nr){
    const opNummer = lijst.find(r => r && (((r.taakId ?? '') + '').trim() === nr) && vrij(r));
    if (opNummer) return opNummer;
  }
  return lijst.find(r => r && r.code === code && vrij(r)) || null;
}

// ══════════════════════════════════════
//  AUTO-PRIORITEIT (zie docs/superpowers/specs/2026-06-02-auto-prioriteit-design.md)
// ══════════════════════════════════════
const PRIO_REGELS = {
  'OPPAKKEN':          { hoog:  7, midden:  14 },
  'VERGADERVERZOEKEN': { hoog: 14, midden:  21 },
  'OFFERTE-TRAJECTEN': { hoog: 21, midden:  42 },
  'LOD':               { hoog: 90, midden: 240 },
  // Subsidietrajecten lopen lang (aanvraag → gemeente → verlening → vaststelling).
  // Met de Oppakken-drempels zou vrijwel elke rij Hoog worden en verliest de kleur
  // z'n betekenis.
  'SUBSIDIE-TRAJECTEN': { hoog: 14, midden: 45 },
};

// ══════════════════════════════════════
//  VOORGESTELDE DEADLINE BIJ EEN NIEUWE TAAK
// ══════════════════════════════════════
// LET OP — BRON: beheer-playbook.md, §3 'Deadline bepalen'. Die getallen staan daar en niet hier;
// dit is de vertaling ervan naar code. Wie ze wil wijzigen, wijzigt eerst het playbook.
//
// WAAROM DIT ER IS. Een taak zonder deadline is voor het hele dashboard onzichtbaar werk: hij
// krijgt geen prioriteit (berekenPrioriteit geeft '' terug bij een lege deadline), hij wordt nooit
// 'Te laat', en de deadline-melding uit Apps Script gaat er nooit voor af. Hij zakt stil naar de
// bodem van de lijst. Een VOORSTEL — niet een verplichting — haalt die stilte weg zonder iemand
// een datum op te dringen: het veld is gewoon te wissen of te overschrijven.
//
// TWEE SECTIES KRIJGEN BEWUST GEEN VOORSTEL:
//   LOD — daar geldt de hersteltermijn uit de brief van de gemeente. Het playbook is er
//         uitgesproken over: "niet gokken bij officiële termijnen". Een verzonnen datum zou hier
//         erger zijn dan geen datum, want hij ziet er even betrouwbaar uit als een echte.
//   SUBSIDIE-TRAJECTEN — het playbook noemt er geen termijn voor, en de looptijd hangt aan de
//         regeling, niet aan ons. Liever geen getal dan een getal zonder bron.
// Ze krijgen wél een zinnetje in beeld dat uitlegt wat er dan wél verwacht wordt; zie
// DEADLINE_HINT. Zwijgen zou als een vergeten veld lezen.
const DEADLINE_VOORSTEL = {
  'OPPAKKEN':           7,
  'VERGADERVERZOEKEN': 14,
  'OFFERTE-TRAJECTEN': 14,
  'LOD':               null,
  'SUBSIDIE-TRAJECTEN':null,
};
const DEADLINE_HINT = {
  'OPPAKKEN':           'Voorstel: over 7 dagen. Aanpassen of leegmaken mag.',
  'VERGADERVERZOEKEN':  'Voorstel: over 14 dagen. Aanpassen of leegmaken mag.',
  'OFFERTE-TRAJECTEN':  'Voorstel: over 14 dagen. Aanpassen of leegmaken mag.',
  'LOD':                'Neem de hersteltermijn uit de brief over — die vullen we niet zelf in.',
  'SUBSIDIE-TRAJECTEN': 'Geen vaste termijn; vul in wat de regeling voorschrijft.',
};

// De voorgestelde deadline als ISO-datum (yyyy-mm-dd, de vorm die een <input type="date"> wil),
// of '' als deze sectie geen voorstel kent. `vandaag` is injecteerbaar zodat dit los te toetsen is
// zonder van de kalender af te hangen.
function voorgesteldeDeadline(sec, vandaag){
  const dagen = DEADLINE_VOORSTEL[sec];
  if(!Number.isFinite(dagen)) return '';
  const basis = vandaag || _vandaagAmsterdam();
  const d = new Date(basis.getFullYear(), basis.getMonth(), basis.getDate() + dagen);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// ══════════════════════════════════════
//  FASE 4 — OPVOLGING & HERHALING (zie docs/superpowers/specs/2026-06-11-fase4-opvolging-herhaling-design.md)
// ══════════════════════════════════════
// LET OP — SYNC: gelijk houden aan CD_STIL_ESCALATIE_REGELS in apps-script/Opvolging.gs
const STIL_ESCALATIE_REGELS = {
  'OPPAKKEN':          { trap1:  7, trap2: 14 },
  'VERGADERVERZOEKEN': { trap1: 14, trap2: 21 },
  'OFFERTE-TRAJECTEN': { trap1: 21, trap2: 35 },
  'LOD':               { trap1: 30, trap2: 60 },
  'SUBSIDIE-TRAJECTEN': { trap1: 21, trap2: 42 },
};

// Vanaf hoeveel stille KALENDERDAGEN het signaal aangaat, per sectie. Bewust dezelfde getallen als
// trap 1 van STIL_ESCALATIE_REGELS hierboven: de gebruiker krijgt op dag N een herinneringsmail,
// dus het scherm hoort niet op dag 4 al iets anders te roepen. Een vast getal (4) was op LOD vals
// alarm: daar geeft de gemeente 90 dagen en komt de mail pas op dag 30.
//
// En het scherm was hierin aantoonbaar de vreemde eend: de dagbriefing telde een taak al als stil
// bij `dagen >= regels.trap1` (apps-script/Notifications.gs:303). De briefing zei dus "2 stille
// taken" waar het scherm negen klokjes toonde. Scherm, mail en briefing lopen nu alle drie gelijk.
//
// De DREMPEL is één ding; waar 'laatste activiteit' vandaan komt is een tweede, en dat liep tot
// v11.0 apart uiteen: het scherm telde 'systeem'-regels mee en de motor niet, en een logregel
// zónder sectie (het contactmoment uit het VvE-dossier) telde alleen op het scherm. Die twee zijn
// nu ook gelijkgetrokken — zie `bouwStilIndex` (render-tabel.js) en `cd_laatsteActiviteitMap`
// (apps-script/Opvolging.gs), die allebei een LET OP — SYNC dragen.
//
// LET OP bij lezen: voor OFFERTE-TRAJECTEN en SUBSIDIE-TRAJECTEN geeft deze functie wel een getal
// (21), maar in de tabel doet dat niets — GEEN_STIL_PILL (render-tabel.js) onderdrukt het signaal
// daar hoe dan ook. Levend zijn alleen Oppakken (7), Vergaderverzoeken (14) en LOD (30).
function stilDrempel(sec){
  const reg = STIL_ESCALATIE_REGELS[sec];
  return (reg && Number.isFinite(reg.trap1)) ? reg.trap1 : 7;
}

// ══════════════════════════════════════
//  PERIODEFILTER (Afgerond-pagina)
// ══════════════════════════════════════
// Voor het maandagoverleg is de vraag steevast dezelfde: wat is er vórige week afgerond? Dat was
// alleen te beantwoorden door vijf tabbladen door te scrollen en datums met het oog af te lezen.
//
// Weken lopen MAANDAG t/m ZONDAG, gelijk aan `isoWeek` hierboven en aan de weekregel op de
// Nog-Te-Doen-pagina. Twee verschillende weekbegrippen in één dashboard is een bron van
// verwarring die je pas ontdekt als de cijfers niet kloppen.
const AF_PERIODES = [
  ['',          'Alle periodes'],
  ['dezeweek',  'Deze week'],
  ['vorigeweek','Vorige week'],
  ['dezemaand', 'Deze maand'],
  ['vorigemaand','Vorige maand'],
  ['eigen',     'Eigen bereik…'],
];

// {van, tot} als jjjj-mm-dd, BEIDE grenzen meegerekend — of null als er niet op periode gefilterd
// wordt ('' en 'eigen' regelt de aanroeper zelf). `vandaag` is injecteerbaar, dezelfde afspraak als
// bij berekenPrioriteit en opvolgStatus: anders hangen de toetsen aan de klok van de machine.
function periodeBereik(sleutel, vandaag){
  const nu = vandaag || _vandaagAmsterdam();
  const iso = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const dag = (d,n) => new Date(d.getFullYear(), d.getMonth(), d.getDate()+n);
  // getDay(): 0=zondag. Maandag als eerste dag, dus zondag telt als dag 7 van de vórige week.
  const naarMaandag = d => dag(d, -((d.getDay()+6)%7));
  switch(sleutel){
    case 'dezeweek':   { const ma=naarMaandag(nu);            return { van:iso(ma), tot:iso(dag(ma,6)) }; }
    case 'vorigeweek': { const ma=dag(naarMaandag(nu),-7);    return { van:iso(ma), tot:iso(dag(ma,6)) }; }
    case 'dezemaand':  { const a=new Date(nu.getFullYear(),nu.getMonth(),1);
                         return { van:iso(a), tot:iso(new Date(nu.getFullYear(),nu.getMonth()+1,0)) }; }
    case 'vorigemaand':{ const a=new Date(nu.getFullYear(),nu.getMonth()-1,1);
                         return { van:iso(a), tot:iso(new Date(nu.getFullYear(),nu.getMonth(),0)) }; }
    default: return null;
  }
}

// Status van de opvolgdatum: weggelegd (toekomst) of opvolgen-vandaag (vandaag/verleden).
function opvolgStatus(r, vandaag){
  vandaag = vandaag || _vandaagAmsterdam();
  const p = _parseAnyDate((r && r.opvolgdatum) || '');
  if (!p) return { weggelegd:false, vandaag:false };
  const d = new Date(p.y, p.m - 1, p.d);
  const diff = _verschilInKalenderdagen(d, vandaag);
  return { weggelegd: diff > 0, vandaag: diff <= 0 };
}

// Is dit offerte-traject al aangevraagd? Bepaald door 'Datum aangevraagd' (kolom C): gevuld en
// als datum leesbaar. Vanaf dat moment is kolom F geen aanvraag-deadline meer maar een
// OPVOLGDATUM (zie deadlineCel in render-tabel.js) en telt de rij niet meer als 'te laat'.
// LET OP: er bestaan twee LOSSE dingen die allebei 'opvolgen' heten — kolom L (wegleggen,
// `opvolgStatus` hierboven) en kolom F-als-opvolgdatum (dit). Niet samenvoegen.
function offerteAangevraagd(r){
  return !!_parseAnyDate((((r && r.datumAangevraagd) || '') + ''));
}
// 'Te laat' zoals de TELLING en de rode markering hem hanteren: een aangevraagd
// offerte-traject is nooit 'te laat' — zijn verstreken datum betekent 'opvolgen' en dat
// signaal draagt de deadline-cel zelf (amber). Eén helper, zodat de kop-pil, het
// statusfilter, de rij-klasse, het dossier en Ctrl+K dezelfde uitzondering hanteren.
// De SORTERING blijft bewust op de rauwe teLaat: een traject dat op opvolgen wacht hoort
// net zo goed bovenaan.
function teLaatVoorTelling(r, sec, vandaag){
  if (sec === 'OFFERTE-TRAJECTEN' && offerteAangevraagd(r)) return false;
  return berekenPrioriteit(r.deadline, sec, vandaag).teLaat;
}

// Volgende deadline voor een herhaalregel. Types: week|maand|kwartaal|halfjaar|jaar|na-afronden.
// LET OP — SYNC: zelfde logica als cd_volgendeDeadlineStr in apps-script/Opvolging.gs
const HERHAAL_MAANDEN = { maand:1, kwartaal:3, halfjaar:6, jaar:12 };
function volgendeDeadline(huidigStr, type, intervalMaanden){
  const p = _parseAnyDate(huidigStr || '');
  if (!p) return '';
  const d = new Date(p.y, p.m - 1, p.d);
  if (type === 'week'){ d.setDate(d.getDate() + 7); }
  else {
    const mnd = type === 'na-afronden' ? (parseInt(intervalMaanden) || 0) : HERHAAL_MAANDEN[type];
    if (!mnd) return '';
    const dag = d.getDate();
    d.setMonth(d.getMonth() + mnd);
    if (d.getDate() !== dag) d.setDate(0); // maandgrens: 31 jan +1m → 28/29 feb
  }
  return `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}`;
}

function _vandaagAmsterdam(){
  // Lokale datum (Europe/Amsterdam = browser-locale van de gebruiker), tijd op 00:00
  const d = new Date();
  d.setHours(0,0,0,0);
  return d;
}

// ISO-8601 weeknummer (Nederlandse weektelling: ma-start, week 1 = de week met
// de eerste donderdag van het jaar). Geeft een geheel getal 1–53 terug.
function isoWeek(datum){
  const d = datum || _vandaagAmsterdam();
  // Donderdag van déze week bepaalt in welk ISO-jaar/week we vallen.
  const don = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dag = (don.getDay() + 6) % 7;          // ma=0 … zo=6
  don.setDate(don.getDate() - dag + 3);        // → donderdag van deze week
  // Donderdag van week 1 = de donderdag in de week van 4 januari.
  const week1Don = new Date(don.getFullYear(), 0, 4);
  week1Don.setDate(week1Don.getDate() - ((week1Don.getDay() + 6) % 7) + 3);
  return 1 + Math.round((don - week1Don) / (7 * 864e5));
}

// ══════════════════════════════════════════════════════════════════════════════
//  WEEKKEUZE voor 'Periode' (Vergaderverzoeken) — v11.9
// ══════════════════════════════════════════════════════════════════════════════
// De periodekolom was een vrij tekstveld en dat leverde zes schrijfwijzen van
// hetzelfde op: 'sept/okt', 'Sept/okt', 'sept/oktober', 'eind juli', '21 september …'.
// Nu kies je een WEEK. Wat er in kolom C van de Sheet komt te staan is één regel:
//
//     Week 38 · 14–18 sep 2026
//
// Bewust leesbaar én terug te lezen: `parseWeekPeriode` haalt het weeknummer, de
// dagen en het jaar er weer uit voor de tweeregelige cel in de tabel. Lukt dat niet,
// dan is het een oude, met de hand getypte waarde — die blijft gewoon staan zoals hij
// is. Er wordt NIETS in de Sheet herschreven.
//
// Het scheidingsteken is een MIDDENPUNT met spaties (' · ') en het datumstreepje een
// half kastlijntje ('–'). Allebei vast: `parseWeekPeriode` en de toetsen hangen eraan,
// en niemand typt dit veld meer met de hand, dus ze kunnen niet uiteenlopen.
const MND_KORT = ['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec'];
const MND_LANG = ['januari','februari','maart','april','mei','juni','juli','augustus',
                  'september','oktober','november','december'];

// Maandag van de week waar `d` in valt (ma=start, zoals de Nederlandse weektelling).
function maandagVan(d){
  const m = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
  return m;
}

// Het ISO-JAAR dat bij deze week hoort. Niet het jaar van de maandag: de week van
// 29 december 2025 loopt door tot 2 januari 2026 en heet toch week 1 van 2026.
// De donderdag beslist — precies zoals in `isoWeek` hierboven.
function isoWeekJaar(d){
  const don = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  don.setDate(don.getDate() - ((don.getDay() + 6) % 7) + 3);
  return don.getFullYear();
}

// De werkdagen van een week als tekst.
//
//   kort (tabel + Sheet, zonder slotjaar — dat plakt `weekPeriodeLabel` eraan):
//     zelfde maand   → '14–18 sep'
//     andere maand   → '31 aug – 4 sep'          ('31–4 sep' zou onzin zijn
//     ander JAAR     → '28 dec 2026 – 1 jan'      → slotjaar maakt er '… 1 jan 2027' van
//   lang (keuzelijst, compleet):
//     zelfde maand   → 'ma 14 – vr 18 september'
//     andere maand   → 'ma 31 augustus – vr 4 september'
//     ander jaar     → 'ma 28 december 2026 – vr 1 januari 2027'
//
// Dat jaar bij de MAANDAG is niet cosmetisch. Week 53 van 2026 loopt van maandag 28 december
// 2026 tot vrijdag 1 januari 2027, en 'Week 53 · 28 dec – 1 jan 2026' leest dan alsof allebei
// de dagen in 2026 vallen — de vrijdag valt in 2027. Eén week per jaar, maar precies de week
// waarin de eerste vergaderronde gepland wordt.
function weekDagen(ma, lang){
  const vr = new Date(ma.getFullYear(), ma.getMonth(), ma.getDate() + 4);
  const zelfdeMaand = ma.getMonth() === vr.getMonth();
  const zelfdeJaar  = ma.getFullYear() === vr.getFullYear();
  const nm = i => lang ? MND_LANG[i] : MND_KORT[i];
  const jrMa = zelfdeJaar ? '' : ` ${ma.getFullYear()}`;
  const jrVr = (zelfdeJaar || !lang) ? '' : ` ${vr.getFullYear()}`;  // kort: slotjaar komt van het label
  if (lang) {
    return zelfdeMaand
      ? `ma ${ma.getDate()} – vr ${vr.getDate()} ${nm(vr.getMonth())}${jrVr}`
      : `ma ${ma.getDate()} ${nm(ma.getMonth())}${jrMa} – vr ${vr.getDate()} ${nm(vr.getMonth())}${jrVr}`;
  }
  return zelfdeMaand
    ? `${ma.getDate()}–${vr.getDate()} ${nm(vr.getMonth())}`
    : `${ma.getDate()} ${nm(ma.getMonth())}${jrMa} – ${vr.getDate()} ${nm(vr.getMonth())}`;
}

// De dagen-tekst uit een opgeslagen periode omzetten naar de vorm mét dagnamen, voor in de tabel:
//   '14–18 sep'          -> 'ma 14 – vr 18 sep'
//   '31 aug – 4 sep'     -> 'ma 31 aug – vr 4 sep'
//   '28 dec 2026 – 1 jan'-> 'ma 28 dec 2026 – vr 1 jan'
// Bewust op de tekst en niet op de datum: `parseWeekPeriode` geeft de dagen al goed terug, en de
// maandag terugrekenen uit alleen een weeknummer + jaar is rond de jaarwisseling dubbelzinnig
// (week 53 van 2026 begint in december 2026 maar eindigt in 2027).
function metDagnamen(dagen){
  const s = String(dagen || '').trim();
  if (!s) return '';
  const i = s.indexOf('–');
  if (i < 0) return `ma ${s}`;
  return `ma ${s.slice(0, i).trim()} – vr ${s.slice(i + 1).trim()}`;
}

// De regel die in de Sheet belandt. Het slotjaar is dat van de VRIJDAG — het eind van de
// werkweek, en daarmee altijd het jaar van de laatste datum die in de regel staat. Bewust
// niet het ISO-jaar: week 53 van 2026 eindigt op 1 januari 2027, en dan zou er '2026'
// achter een datum uit 2027 komen te staan.
function weekPeriodeLabel(ma){
  const vr = new Date(ma.getFullYear(), ma.getMonth(), ma.getDate() + 4);
  return `Week ${isoWeek(ma)} · ${weekDagen(ma, false)} ${vr.getFullYear()}`;
}

// Terug uit die regel. `null` = geen weekwaarde (oude, met de hand getypte tekst).
// Bewust streng op de vorm: half herkennen is erger dan niet herkennen, want dan zou
// een oude waarde als een kapotte week getekend worden.
function parseWeekPeriode(tekst){
  const s = String(tekst || '').trim();
  const m = s.match(/^Week\s+(\d{1,2})\s*·\s*(.+?)\s*$/);
  if (!m) return null;
  const nr = +m[1];
  if (nr < 1 || nr > 53) return null;
  const rest = m[2];
  const jm = rest.match(/^(.*?)\s+(\d{4})$/);
  if (!jm) return null;
  return { nr, dagen: jm[1].trim(), jaar: +jm[2] };
}

// De keuzelijst: `terug` weken vóór deze week en `vooruit` weken erna, deze week erbij.
// Elke ingang draagt alles wat de kiezer nodig heeft, zodat de kiezer zelf geen datums
// meer hoeft uit te rekenen — één producent, en los te toetsen.
// Hoeveel weken ligt `waarde` van deze week af? `null` als het geen weekwaarde is of als hij
// verder dan vijf jaar weg ligt. Bewust zoekend en niet rekenend: het weeknummer alléén is rond
// de jaarwisseling dubbelzinnig (week 53 van 2026 begint in december 2026 en eindigt in 2027),
// en het label is de enige plek waar beide kanten samenkomen. 520 goedkope vergelijkingen, en
// alleen als de waarde niet gewoon in de lijst staat.
function weekAfstand(waarde, vandaag){
  if(!parseWeekPeriode(waarde)) return null;
  const start = maandagVan(vandaag || _vandaagAmsterdam());
  for(let i = 0; i <= 260; i++){
    for(const n of (i === 0 ? [0] : [i, -i])){
      const ma = new Date(start.getFullYear(), start.getMonth(), start.getDate() + n * 7);
      if(weekPeriodeLabel(ma) === waarde) return n;
    }
  }
  return null;
}

// `bevat`: een opgeslagen weekwaarde die HOE DAN OOK in de lijst moet staan. Zelfde regel als bij
// `setv` in crud.js — een waarde die er al is mag nooit verdampen omdat een lijstje hem niet kent.
// Een vergaderverzoek van vier maanden geleden viel anders buiten de twaalf weken terug: de knop
// toonde de week wél, de lijst niet, en één klik verving hem ongemerkt door iets anders.
function weekOpties({ terug = 12, vooruit = 26, vandaag, bevat } = {}){
  if(bevat){
    const n = weekAfstand(bevat, vandaag);
    if(n !== null){
      if(n < 0) terug = Math.max(terug, -n);
      if(n > 0) vooruit = Math.max(vooruit, n);
    }
  }
  const start = maandagVan(vandaag || _vandaagAmsterdam());
  const dezeMa = start.getTime();
  const uit = [];
  for (let i = -terug; i <= vooruit; i++) {
    const ma = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i * 7);
    uit.push({
      ma: new Date(ma),
      waarde: weekPeriodeLabel(ma),
      nr: isoWeek(ma),
      jaar: isoWeekJaar(ma),
      kort: weekDagen(ma, false),
      lang: weekDagen(ma, true),
      maandKop: `${MND_LANG[ma.getMonth()]} ${ma.getFullYear()}`,
      deze: ma.getTime() === dezeMa,
      verleden: ma.getTime() < dezeMa,
    });
  }
  return uit;
}

function _verschilInKalenderdagen(deadline, vandaag){
  if (!(deadline instanceof Date) || isNaN(deadline)) return null;
  const d = new Date(deadline.getFullYear(), deadline.getMonth(), deadline.getDate());
  const v = new Date(vandaag.getFullYear(), vandaag.getMonth(), vandaag.getDate());
  return Math.round((d - v) / 86400000);
}

function berekenPrioriteit(deadlineStr, categorie, vandaag){
  vandaag = vandaag || _vandaagAmsterdam();
  if (!deadlineStr) return { prioriteit: '', dagenTot: null, teLaat: false };
  const parsed = _parseAnyDate(deadlineStr);
  if (!parsed) return { prioriteit: '', dagenTot: null, teLaat: false };
  const deadline = new Date(parsed.y, parsed.m - 1, parsed.d);
  const dagenTot = _verschilInKalenderdagen(deadline, vandaag);
  const teLaat = dagenTot < 0;
  const regels = PRIO_REGELS[categorie];
  if (!regels) return { prioriteit: '', dagenTot, teLaat };
  let prioriteit;
  if (dagenTot <= regels.hoog) prioriteit = 'Hoog';
  else if (dagenTot <= regels.midden) prioriteit = 'Midden';
  else prioriteit = 'Laag';
  return { prioriteit, dagenTot, teLaat };
}

// NIET IN GEBRUIK door de app. De Prioriteit-kolom is er sinds v8.9 uit; alleen de zelftest
// roept deze functie nog aan. Blijft staan omdat de berekening zelf (berekenPrioriteit) wél
// levend is en dit de enige plek is waar de bijbehorende opmaak beschreven staat — maar bouw er
// niets nieuws op zonder eerst te controleren of de kolom terugkomt.
function prioBadge(r, sec){
  const { prioriteit } = berekenPrioriteit(r.deadline, sec);
  if(!prioriteit)return'';
  const cls={Hoog:'prio-hoog',Midden:'prio-mid',Laag:'prio-laag'}[prioriteit]||'prio-mid';
  return`<span class="badge ${cls}">${esc(prioriteit)}</span>`;
}

// Het veld Behandelaar kan meer dan één persoon bevatten ('Jer, Cihad'). Deze regel stond op zes
// plekken los uitgeschreven en op één daarvan (het leaderboard) net anders: die splitste óók op een
// puntkomma. 'Jer; Cihad' was daardoor twee personen in de statistiek en één rare naam in de rest
// van het dashboard — een naam waar het filter niets mee kon. Eén bron, en de ruimste variant wint:
// een puntkomma als scheiding is nooit een naam.
function splitBehandelaar(v){
  return String(v||'').split(/[,;/]/).map(n=>n.trim()).filter(Boolean);
}

// De korte code van een behandelaar voor de takentabel. Eerst de vaste lijst uit config.js; staat
// de naam daar niet in (een stagiair, een oud-collega die nog in de data zit), dan de beginletter,
// maar ALLEEN als geen enkele bestaande code die letter al bezet. Anders de volle naam: twee
// mensen onder hetzelfde teken is erger dan een brede chip. Let op: die bewaking kijkt naar de
// VASTE LIJST, niet naar de data — twee onbekende namen met dezelfde beginletter ('Stagiair' en
// 'Sanne') worden allebei 'S'. Wie vast in beeld komt, hoort in KORTE_NAMEN te staan.
function korteNaam(naam){
  const n = String(naam || '').trim();
  if(!n) return '';
  const vast = KORTE_NAMEN[n.toLowerCase()];
  if(vast) return vast;
  const bezet = new Set(Object.values(KORTE_NAMEN).map(c => c.toLowerCase()));
  const letter = n.slice(0, 1);
  return bezet.has(letter.toLowerCase()) ? n : letter;
}

// `kort` alleen aanzetten waar breedte echt knelt: Oppakken, Vergaderverzoeken en LOD. (Dat waren
// tot v12.0 'de drie tabbladen met een Signaal-kolom'; die kolom bestaat niet meer, de drie
// tabbladen wel.) Alle andere plekken houden de volle naam — dus óók
// Offerte-trajecten en Subsidie-trajecten, die in dezelfde takentabel staan maar buiten dit
// ontwerp vielen, plus het VvE-dossier, de Afgerond-lijst, Analytics en de Ontwikkeling-pagina — daar is ruimte
// genoeg en leest een code alleen maar als een raadsel. De volle naam blijft in de title staan,
// zodat hij overal met de muis terug te vinden is.
function persBadges(v, kort){
  if(!v)return'<span style="color:var(--fnt);font-size:12px">–</span>';
  // Er stond hier een kaart naam→klasse ({jer, cihad, gabos}), maar die vier klassen hebben in
  // styles.css exact dezelfde waarden als de basisklasse `.pers` — licht én donker. De kaart had
  // dus geen enkel zichtbaar effect en liep bovendien achter op TEAM (Cihan ontbrak). Weg ermee;
  // de klassen zelf blijven in de CSS staan, zodat een oude opgeslagen HTML-snipper niet opeens
  // anders oogt. Wil je hier ooit écht kleur per persoon, leid hem dan af uit TEAM (config.js) en
  // geef de CSS-klassen ook echt verschillende waarden.
  return splitBehandelaar(v).map(n=>{
    const cls='pers-default';
    const tekst = kort ? korteNaam(n) : n;
    const rond = kort && tekst.length <= 2 ? ' pers-rond' : '';
    const titel = kort && tekst !== n ? ` title="${esc(n)}"` : '';
    return`<span class="pers ${cls}${rond}"${titel}>${esc(tekst)}</span>`;
  }).join('');
}


// "X/N" → [ontvangen, aangevraagd]
function parseOff(v){
  const [recv, req] = ((v||'')+'').split('/').map(s => parseInt(s)||0);
  return [recv||0, req||0];
}

// Fase van een offerte-traject. Expliciet `fase`-veld wint; anders afgeleid uit X/N.
function offerteFase(r){
  const f = (((r&&r.fase)||'')+'').trim().toLowerCase().replace(/\s+/g,'_');
  if (OFFERTE_FASES.includes(f)) return f;
  const [recv] = parseOff(r && r.offertes);
  return recv > 0 ? 'ontvangen' : 'aangevraagd';
}

// Identiteit van één offerte-traject, voor het aannemers-paneel. Bewust NIET de VvE-code:
// een VvE kan meerdere offerte-trajecten tegelijk hebben (dak én schilderwerk), en op de
// code sturen liet elke toevoeging/verwijdering op het EERSTE traject landen — het kruisje
// wiste dan een aannemer bij een traject dat de gebruiker niet had aangewezen. Op productie
// stonden vijf van zulke dubbele codes (201009, 201104, 381179, 311011 en 121034-G drie keer),
// dus dit was geen theoretisch geval.
// Het vaste taaknummer (kolom Q) is de identiteit; ontbreekt dat — legitiem, bij een rij die
// door een client met oude code is aangemaakt — dan valt de sleutel terug op de code en is het
// gedrag exact als voorheen. De prefix houdt de twee soorten uit elkaar, zodat een taaknummer
// nooit per ongeluk tegen een VvE-code kan matchen.
const aannSleutel = r => (r && r.taakId) ? 'nr:' + r.taakId : 'code:' + (((r && r.code) || '') + '').trim();

// ── Aannemers per offerte-traject (kolom P 'Nog Te Doen') ──────────────────
// Eén aannemer per regel; naam en 'binnen'-vlag gescheiden door '|':  "Naam|1".
// '|1' = offerte binnen, anders nog niet. Lege/whitespace-regels worden genegeerd.
function parseAannemers(cel){
  return ((cel||'')+'').split('\n').map(l=>l.trim()).filter(Boolean).map(l=>{
    const i=l.lastIndexOf('|');
    if(i<0) return {naam:l, binnen:false};
    return {naam:l.slice(0,i).trim(), binnen:l.slice(i+1).trim()==='1'};
  }).filter(a=>a.naam);
}
function serializeAannemers(lijst){
  return (lijst||[]).map(a=>`${(a.naam||'').replace(/[|\n]/g,' ').trim()}|${a.binnen?1:0}`).join('\n');
}
// Afgeleide "X/N binnen": N = aantal aannemers, X = aantal met offerte binnen. Leeg → ''.
// NIET IN GEBRUIK door de app: `reconcileOffertes` hieronder heeft hem vervangen, want die kent
// ook het geval ZONDER lijst (dan blijft kolom D staan). Alleen de zelftest roept hem nog aan.
function deriveOffertes(lijst){
  if(!lijst||!lijst.length) return '';
  return `${lijst.filter(a=>a.binnen).length}/${lijst.length}`;
}
// Effectieve "X/N": staat er een aannemerslijst (kolom P), dan telt alléén de lijst —
// X = aantal binnen, N = lijstlengte. Zonder lijst blijft de handmatige kolom-D-waarde staan
// (rijen van vóór de aannemerslijst). Tot v12.5 was D een ONDERGRENS (Math.max per kant);
// sinds de lijst in het bewerkscherm staat is die dubbele boekhouding weg — een vinkje
// weghalen moet de teller ook weer omlaag brengen.
function reconcileOffertes(manual, lijst){
  if(!lijst||!lijst.length) return manual||'';
  return `${lijst.filter(a=>a.binnen).length}/${lijst.length}`;
}

function offProg(v){
  if(!v)return'';
  const [recv,req]=parseOff(v);
  const pct=req>0?Math.min(100,Math.round(recv/req*100)):0;
  return`<div class="prog-wrap"><span style="font-size:12px;font-weight:700;color:var(--pu)">${esc(v)}</span>
    <div class="prog-bar"><div class="prog-fill" style="width:${pct}%;background:var(--pu)"></div></div></div>`;
}

const _MAANDEN={jan:1,feb:2,mrt:3,maa:3,apr:4,mei:5,jun:6,jul:7,aug:8,sep:9,sept:9,okt:10,nov:11,dec:12,
  januari:1,februari:2,maart:3,april:4,juni:6,juli:7,augustus:8,september:9,oktober:10,november:11,december:12};

// Vast taaknummer voor een NIEUWE taak (kolom Q in 'Nog Te Doen').
// Bewust GEEN oplopende teller: die zou óf een zichtbare regel in een bestaand tabblad kosten,
// óf twee mensen die binnen dezelfde poll een taak aanmaken hetzelfde nummer geven — er is geen
// plek waar clients een teller kunnen reserveren. Tijdstempel (base36, dus kort en oplopend in
// de tijd) plus drie toevalstekens botst in de praktijk niet. Het nummer is nooit zichtbaar
// voor de gebruiker; leesbaarheid weegt hier niet op tegen botsingsvrijheid.
// Taaknummer voor kolom Q. Dit is de IDENTITEIT van een taak: de schrijf-guard vergelijkt hem,
// bundels verwijzen ermee naar hun kop, en 'kiesAfgerondRij' zoekt er de juiste afgeronde rij mee.
// Twee taken met hetzelfde nummer is dus geen schoonheidsfoutje.
//
// Het tijdsdeel is per milliseconde gelijk, dus alle bescherming zit in het toevalsdeel. Dat was
// DRIE tekens = 46.656 waarden, en dat is minder dan het lijkt: gemeten over 2.000 rondes van
// twaalf nummers ineens (de knop 'ook voor andere VvE's') botste 0,2% van de rondes. Zes tekens
// maakt er 2,2 miljard van; diezelfde meting gaf 0 botsingen op 2.000 rondes.
// `slice(2, 8)` levert altijd precies zes tekens: over 200.000 trekkingen was de kortste uitkomst
// van Math.random().toString(36) tien tekens lang.
// LET OP — SYNC: cd_nieuwTaakId in apps-script/Notifications.gs maakt nummers voor dezelfde
// kolom en is woordelijk gelijk gehouden.
const nieuwTaakId = () => 'T' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

// Selectievakje-erfenis: rijen in 'Nog Te Doen' erven de TRUE/FALSE-validatie van de kolommen
// rechts van H. Zo'n geërfde waarde is géén inhoud en telt als leeg. Stond eerder als lokale
// const `_f4v` binnen parseSections; hierheen gehaald zodat de parse én de schrijf-guard
// gegarandeerd dezelfde regel hanteren — lopen die twee uiteen, dan slaat de guard vals alarm.
// Bewust NIET op kolom H toepassen: dáár is 'TRUE' de betekenisvolle waarde 'in behandeling'.
const leegBijErfenis = v => {
  const s = ((v ?? '') + '').trim();
  const u = s.toUpperCase();
  return (u === 'TRUE' || u === 'FALSE') ? '' : s;
};

// Round-trip-check: een onmogelijke datum (32-13, 31 feb) rolt in JS stil door naar een
// verkeerde dag. Door terug te vergelijken met new Date() vangen we die en geven we null.
function _valDate(y,mn,d){
  const dt=new Date(y,mn-1,d);
  return (dt.getFullYear()===y && dt.getMonth()===mn-1 && dt.getDate()===d) ? {y,m:mn,d} : null;
}
function _parseAnyDate(s){
  if(!s)return null;
  s=s.trim();
  // yyyy-mm-dd of yyyy-mm-ddT... (ISO, met of zonder tijdgedeelte)
  let m=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(T.*)?$/);
  if(m)return _valDate(+m[1],+m[2],+m[3]);
  // dd-mm-yyyy / dd/mm/yyyy / dd-mm-yy (2-cijferig jaar → 20xx). Precies twee óf vier cijfers:
  // \d{2,4} liet '15-09-202' door als het letterlijke jaar 202, en dat werd dan '666185d te
  // laat', prioriteit Hoog en de uiterste plek bij het sorteren. Een tikfout hoort — net als elke
  // andere onleesbare datum — gewoon als tekst te blijven staan. Apps Script (cd_parseDate) eiste
  // al \d{4}; nu zeggen beide kanten hetzelfde (naloop 2026-08-28).
  m=s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2}|[1-9]\d{3})$/);
  if(m){let y=+m[3];if(y<100)y+=2000;return _valDate(y,+m[2],+m[1]);}
  // "21 mei 2026" / "3 jan. 2025" / "21 mei '26" — zelfde jaarregel als hierboven
  m=s.match(/^(\d{1,2})\s+([a-zA-Z]+)\.?\s+'?(\d{2}|[1-9]\d{3})$/);
  if(m){const mn=_MAANDEN[m[2].toLowerCase()];if(mn){let y=+m[3];if(y<100)y+=2000;return _valDate(y,mn,+m[1]);}}
  return null;
}

function parseDt(s){
  const d=_parseAnyDate(s);
  return d?new Date(d.y,d.m-1,d.d).getTime():0;
}
function toISODate(s){
  const d=_parseAnyDate(s);
  return d?`${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`:'';
}
function toDutchDate(s){
  const d=_parseAnyDate(s);
  return d?`${String(d.d).padStart(2,'0')}-${String(d.m).padStart(2,'0')}-${d.y}`:'';
}

function emptyRow(cols,inline,filtered){
  const leegIco=filtered?ICONS.zoek:ICONS.postvakLeeg;
  const txt=filtered?'Niets gevonden — pas je filter of zoekopdracht aan':'Geen resultaten';
  if(inline)return`<div class="empty"><div class="empty-ico">${leegIco}</div>${txt}</div>`;
  return`<tr><td colspan="${cols}"><div class="empty"><div class="empty-ico">${leegIco}</div>${txt}</div></td></tr>`;
}

// String(s??'') i.p.v. (s||''): `??` vangt alleen null/undefined, zodat 0/false correct
// als "0"/"false" worden geëscaped i.p.v. stil te verdwijnen, en een niet-string (number/Date)
// veilig wordt gecoerced i.p.v. een TypeError op .replace te gooien.
function esc(s){return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')}
// Gedeelde VvE-code die naar het dossier navigeert. Eén bron voor álle lijsten,
// zodat elke code overal identiek klikbaar is (centrale 'vve-open'-delegatie in actions.js).
// Lege/placeholder-codes ('—') blijven bewust niet-klikbaar.
function vveCodeSpan(code, style){
  const c=((code==null?'':code)+'').trim();
  const st=style?` style="${style}"`:'';
  if(!c||c==='—') return `<span class="code"${st}>${esc(code||'—')}</span>`;
  // `role=button` + `tabindex` en niet zomaar een <span>: dit ding heeft een wijzende hand en
  // opent een dossier, maar was zonder muis niet te bereiken — het dossier kon alleen nog via
  // Ctrl+K. De centrale delegatie in actions.js maakt Enter en spatie hierop werkend.
  return `<span class="code code-klik"${st} role="button" tabindex="0" data-action="vve-open" data-code="${esc(c)}" title="Open VvE-dossier">${esc(c)}</span>`;
}
// De subcategorie achter de VvE-naam. Is die gelijk aan het tabblad waar je al staat ("Oppakken"
// in de Oppakken-tab), dan zegt hij niets nieuws en gaat hij weg — dat is precies de ruis waar
// deze rij te veel van had. Genormaliseerd vergelijken (trim + kleine letters), net als
// renderNtdCrossList (render-lijsten.js:354, 363), anders laat één hoofdletter hem terugkomen.
// `sec` is optioneel: zonder sectie gedraagt hij zich als vanouds.
function subBadge(v, sec){
  const t = String(v == null ? '' : v).trim();
  if(!t) return '';
  const eigen = (sec && SECS[sec] && SECS[sec].label) ? String(SECS[sec].label).trim().toLowerCase() : '';
  if(eigen && t.toLowerCase() === eigen) return '';
  return `<span class="badge" style="background:var(--sur2);color:var(--mut);font-size:10px;margin-left:4px">${esc(t)}</span>`;
}
// De drie rij-acties (bewerken / wegleggen / afronden) als knoppentrio, op `rid` uit state._rowCache.
// Eén definitie, want ze staan op twee plekken die op hetzelfde scherm pal onder elkaar komen: de
// tabelrij (rowNtd) en de subtaakregel in een bundelpaneel (subRegel). Twee kopieën betekent dat
// dezelfde drie acties er verschillend uit gaan zien zodra er één wordt bijgeschaafd.
// De SVG's staan hier inline en gaan bewust niet via ico(): dit is de vorm die de takenlijst
// vandaag toont (dunne lijn), terwijl de duotone-set voor 'wegleggen' een wekker heeft en voor
// 'bewerken' een gevuld potlood. De maten komen uit .act-bw svg / .act-af svg in styles.css.
// De aanroeper zet er zelf de wikkel omheen (.acts in de tabel, .bdl-acts in het paneel).
// `ib` is de huidige waarde van 'In behandeling' ('TRUE' / 'FALSE' / '') als deze plek die knop
// hoort te tonen, en null/undefined als niet. Standaard NIET: het bundelpaneel heeft er bewust
// geen ruimte voor (zie de toelichting bij `ibPil` in render-bundel.js) en offerte-trajecten
// kennen het veld niet eens.
//
// De knop komt TUSSEN wegleggen en afronden en niet erachter. Het ✓ staat al maanden pal tegen
// de rechterrand van de rij; dat is de meest gebruikte knop van de drie en zit in de vingers.
// Een vierde knop erachter zou hem elke keer een plek opschuiven.
function taakActieKnoppen(rid, ib){
  const ibAan = ib === 'TRUE';
  // Een driehoekje 'afspelen' voor aan en twee streepjes 'pauze' voor uit: het gaat om 'ben ik
  // hier mee bezig'. Twee verschillende pictogrammen en niet alleen een kleurverschil — kleur
  // alleen is geen betekenisdrager voor wie hem niet ziet.
  const ibIcoon = ibAan
    ? `<svg viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true"><rect x="6.5" y="4.5" width="4" height="15" rx="1.2"/><rect x="13.5" y="4.5" width="4" height="15" rx="1.2"/></svg>`
    : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" aria-hidden="true"><path d="M8 5.4v13.2a.8.8 0 0 0 1.2.7l10-6.6a.8.8 0 0 0 0-1.4l-10-6.6a.8.8 0 0 0-1.2.7z"/></svg>`;
  const ibKnop = (ib === null || ib === undefined) ? ''
    : `<button class="act-ib act-ico${ibAan?' aan':''}" data-action="taak-inbehandeling" data-rid="${rid}" `
      + `aria-pressed="${ibAan}" title="${ibAan?'Niet meer in behandeling':'In behandeling nemen'}" `
      + `aria-label="${ibAan?'Niet meer in behandeling':'In behandeling nemen'}">${ibIcoon}</button>`;
  return `<button class="act-bw act-ico" data-action="taak-bewerken" data-rid="${rid}" title="Bewerken" aria-label="Bewerken"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>`
       + `<button class="act-bw act-ico" data-action="taak-wegleggen" data-rid="${rid}" title="Wegleggen / opvolgdatum" aria-label="Wegleggen of opvolgdatum"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 13.5"/></svg></button>`
       + ibKnop
       + `<button class="act-af act-ico" data-action="taak-afronden" data-rid="${rid}" title="Afronden" aria-label="Afronden"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><path d="m5 12 4 4 10-10"/></svg></button>`;
}
// 'Dagen vooraf zichtbaar' (herhaalregels): bewust 0 toestaan (taak pas op de deadline-dag
// zichtbaar). Alleen terugvallen op `def` bij een echt lege/ongeldige waarde, niet bij 0 —
// anders wordt een bewuste 0 stil overschreven. Op alle drie de lagen gebruikt (invoer/parse/zichtbaar).
function coerceDagenVooraf(v, def=14){
  const n=parseInt(v,10);
  return Number.isFinite(n)&&n>=0 ? n : def;
}

// Korte datum voor krappe plekken (de pillen in de takentabel): "28 jul", met
// jaartal alleen als het níét het lopende jaar is. Onparsebare tekst blijft staan.
const _MND_KORT = ['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec'];
function kortDatum(s, vandaag){
  const d = _parseAnyDate(s);
  if(!d) return String(s == null ? '' : s);
  const jaarNu = (vandaag || _vandaagAmsterdam()).getFullYear();
  const mnd = _MND_KORT[d.m - 1] || '';
  return d.y === jaarNu ? `${d.d} ${mnd}` : `${d.d} ${mnd} '${String(d.y).slice(2)}`;
}

// ══════════════════════════════════════
//  TAAKTITEL — één leesbare regel per taak, ongeacht sectie
// ══════════════════════════════════════
// Offerte-trajecten hebben géén 'actiepunt'-veld (zie SECS in config.js): hun
// onderwerp staat in de opmerkingen (kolom G) en de voortgang in de X/N-teller
// (kolom D). Zonder deze helper vielen offerte-rijen in het VvE-dossier léég —
// en op andere plekken terug op het nietszeggende woord "Offerte-traject".
// De opmerkingen zijn vaak meerregelig met een opsomming van aannemers eronder;
// alleen de eerste gevulde regel is de titel.
const TAAKTITEL_MAX = 90;
function _eersteRegel(s){
  return String(s == null ? '' : s).split('\n').map(x => x.trim()).find(Boolean) || '';
}
// Opslagvorm van opgemaakte velden is platte tekst met **vet**/*schuin* (zie opmaak.js);
// in een titel horen die sterretjes niet thuis.
// Markeringen uit een titel halen. LET OP — SYNC met RE_VET/RE_SCHUIN in opmaak.js: dat is de
// opslagvorm, en die is '**vet**' en '_schuin_'. Hier stond eerder een tweede paar sterretjes
// voor schuin ('*x*'), een vorm die de app nergens schrijft — het resultaat was dat een schuin
// woord met underscores en al in de titel bleef staan, terwijl een enkel sterretje midden in
// gewone tekst juist stil werd weggeknipt. Bewust een eigen kopie en geen import van
// `zonderOpmaak`: opmaak.js importeert `esc` uit dit bestand, en een kring erbij zou de
// laadvolgorde van de modulegraaf laten afhangen van wie er toevallig eerst binnenkomt.
const _RE_VET_TITEL    = /\*\*([^*\s](?:[^*]*[^*\s])?)\*\*/g;
const _RE_SCHUIN_TITEL = /(^|[^\w])_([^_\s](?:[^_]*[^_\s])?)_(?![\w])/g;
function _zonderSterren(s){
  return String(s==null?'':s).replace(_RE_VET_TITEL, '$1').replace(_RE_SCHUIN_TITEL, '$1$2');
}
function _kort(s){
  return s.length > TAAKTITEL_MAX ? s.slice(0, TAAKTITEL_MAX - 1).trimEnd() + '…' : s;
}
function taakTitel(r, sec){
  if(!r) return '';
  sec = sec || r._sec || '';
  const schoon = v => _zonderSterren(_eersteRegel(v));
  if(sec === 'OFFERTE-TRAJECTEN'){
    const onderwerp = schoon(r.opmerkingen) || 'Offerte-traject';
    const [recv, req] = parseOff(r.offertes);
    // Alleen een teller tonen als er echt iets aangevraagd is; "0 van 0" zegt niets.
    const teller = req > 0 ? `${recv} van ${req} binnen` : '';
    return teller ? `${_kort(onderwerp)} — ${teller}` : _kort(onderwerp);
  }
  // r.subsidie hoort erbij: een subsidietraject heeft geen actiepunt/periode/status,
  // dus zonder deze terugval toont het dossier letterlijk "Subsidie-trajecten —
  // geen omschrijving" (zie afOmschrijving in render-vve.js).
  const eigen = schoon(r.actiepunt) || schoon(r.agendapunten) || schoon(r.periode) || schoon(r.status) || schoon(r.subsidie);
  return _kort(eigen || (SECS[sec] && SECS[sec].label) || '');
}

// De soort taak in ENKELVOUD. `SECS[...].label` is meervoud omdat het tabbladen benoemt, en
// "Vergaderverzoeken · 381005" leest fout zodra het over één taak gaat. 'Oppakken' is bovendien
// geen zelfstandig naamwoord — een rij uit dat tabblad is gewoon een taak.
// Terugval op het meervoud, zodat een sectie die hier ooit vergeten wordt een leesbare soort
// houdt in plaats van een regel die met ' · ' begint.
const SOORT_ENKELVOUD = {
  OPPAKKEN:'Taak', VERGADERVERZOEKEN:'Vergaderverzoek', 'OFFERTE-TRAJECTEN':'Offerte-traject',
  LOD:'LOD', 'SUBSIDIE-TRAJECTEN':'Subsidie-traject',
};

// De volledige verwijzing naar ÉÉN taak: soort · VvE — omschrijving.
//
// Bestaat naast `taakTitel` en niet in plaats daarvan. `taakTitel` beantwoordt "hoe heet deze
// taak" en wordt gebruikt op plekken waar de soort en de VvE al in beeld staan (de tabelrij, het
// bundelpaneel, de dossierrij). Deze functie beantwoordt "welke taak is dit, voor iemand die er
// niet naar kijkt" — en dat is precies de vraag zodra er naar een ándere taak verwezen wordt.
//
// Waarom de VvE erbij hoort: `magKoppelen` staat koppelen OVER VvE'S HEEN toe. De hoofdtaak van
// een bundel kan dus een heel andere VvE betreffen dan de rij waar je naar kijkt, en dan is de
// code het enige wat dat verraadt.
function taakVerwijzing(r, sec){
  if(!r) return '';
  sec = sec || r._sec || '';
  const soort = SOORT_ENKELVOUD[sec] || (SECS[sec] && SECS[sec].label) || '';
  const vve = [String(r.code ?? '').trim(), String(r.naam ?? '').trim()].filter(Boolean).join(' ');
  // `taakTitel` valt bij een taak zónder eigen omschrijving terug op een SOORTNAAM: het
  // sectielabel in het meervoud ('Vergaderverzoeken'), en bij een offerte-traject letterlijk
  // 'Offerte-traject' — daar eventueel nog met de X/N-teller erachter. Allebei zetten ze de
  // soort een tweede keer neer, het meervoud ook nog fout vervoegd. Alleen die kop hoort er
  // dus af; wat erachter staat is wél informatie.
  const label = (SECS[sec] || {}).label || '';
  const delen = taakTitel(r, sec).split(' — ');
  if (delen[0] === label || delen[0] === soort) delen.shift();
  const echteOms = delen.join(' — ');
  // filter(Boolean) op beide niveaus: nooit een losse ' · ' en nooit een losse ' — '.
  return [[soort, vve].filter(Boolean).join(' · '), echteOms].filter(Boolean).join(' — ');
}

// ── Duur van een afgeronde taak (kolom M van 'Afgerond') ─────────────────────────────────────
// Leeg en 0 zijn hier NIET hetzelfde, en dat is de hele reden dat dit een functie is en geen
// `Number(x)||0` op de plek van gebruik. Leeg betekent 'niemand heeft het ingevuld' en moet
// overal buiten de telling vallen; 0 zou als échte meting meedoen en elk gemiddelde omlaag
// trekken met taken die alleen maar zijn overgeslagen. Alles wat geen positief getal is —
// lege cel, tekst, 0, negatief — wordt daarom null.
// De Sheet kan een Nederlands decimaalteken teruggeven, vandaar de komma-vervanging.
function duurUitCel(v){
  const n = Math.round(Number(String(v ?? '').trim().replace(',', '.')));
  return Number.isFinite(n) && n > 0 ? n : null;
}

// Dezelfde regel, de andere kant op: wat er in de cel terechtkomt. Bewust via `duurUitCel`,
// zodat lezen en schrijven niet uit elkaar kunnen lopen.
function duurNaarCel(v){
  const n = duurUitCel(v);
  return n === null ? '' : String(n);
}

export {
  maandagVan, isoWeekJaar, weekDagen, weekPeriodeLabel, parseWeekPeriode, weekOpties, weekAfstand, metDagnamen, MND_KORT, MND_LANG,
  taakTitel, taakVerwijzing, kortDatum, NIET_ZOEKBAAR,
  displayName, filt, splitBehandelaar, korteNaam, PRIO_REGELS, stilDrempel, STIL_ESCALATIE_REGELS,
  DEADLINE_VOORSTEL, DEADLINE_HINT, voorgesteldeDeadline, AF_PERIODES, periodeBereik,
  opvolgStatus, volgendeDeadline, HERHAAL_MAANDEN, _vandaagAmsterdam, isoWeek,
  offerteAangevraagd, teLaatVoorTelling,
  _verschilInKalenderdagen, berekenPrioriteit, prioBadge, persBadges,
  offProg, _MAANDEN, _parseAnyDate, parseDt, toISODate, toDutchDate, leegBijErfenis, nieuwTaakId,
  emptyRow, esc, vveCodeSpan, subBadge, taakActieKnoppen, coerceDagenVooraf,
  parseOff, offerteFase,
  parseAannemers, serializeAannemers, deriveOffertes, reconcileOffertes, aannSleutel,
  meldSleutel, _zonderLeidendSymbool, kiesAfgerondRij,
  duurUitCel, duurNaarCel,
};
