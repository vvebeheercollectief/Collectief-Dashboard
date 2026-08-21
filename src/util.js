// ══════════════════════════════════════
//  UTIL — gedeelde pure helpers (datums, prioriteit, tekst, badges)
// ══════════════════════════════════════
import { EMAIL_NAMES, OFFERTE_FASES, SECS } from './config.js';
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
const NIET_ZOEKBAAR = new Set(['_row','_sec','_offertesManual','_aannemers',
                               'taakId','bundelId','bundelVolg','herhaalId','esc','fase']);
function filt(rows,q){
  if(!q)return rows;
  return rows.filter(r=>Object.entries(r).some(([k,v])=>
    !NIET_ZOEKBAAR.has(k) && !k.startsWith('_') && String(v??'').toLowerCase().includes(q)));
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
const STIL_DREMPEL_DAGEN = 4;

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

function persBadges(v){
  if(!v)return'<span style="color:var(--fnt);font-size:12px">–</span>';
  const colors={'jer':'pers-jer','cihad':'pers-cihad','gabos':'pers-gabos'};
  return splitBehandelaar(v).map(n=>{
    const cls=colors[n.toLowerCase()]||'pers-default';
    return`<span class="pers ${cls}">${esc(n)}</span>`;
  }).join('');
}


function adjOff(id,delta){
  const el=document.getElementById(id);
  if(!el)return;
  el.value=Math.max(0,(parseInt(el.value)||0)+delta);
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
function deriveOffertes(lijst){
  if(!lijst||!lijst.length) return '';
  return `${lijst.filter(a=>a.binnen).length}/${lijst.length}`;
}
// Effectieve "X/N": de handmatige kolom-D-waarde is de ondergrens; de aannemer-vinkjes
// (kolom P) kunnen 'm alleen óphogen. Zo overschrijft een nog-niet-aangevinkte
// aannemerslijst nooit een handmatig ingevuld aantal — de bug "ik gaf 1 ontvangen op
// maar de teller bleef op 0" kan hierdoor niet meer voorkomen. Lege lijst → handmatig blijft.
function reconcileOffertes(manual, lijst){
  if(!lijst||!lijst.length) return manual||'';
  const [mRecv,mReq]=parseOff(manual);
  const recv=Math.max(mRecv, lijst.filter(a=>a.binnen).length);
  const req =Math.max(mReq,  lijst.length);
  return `${recv}/${req}`;
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
const nieuwTaakId = () => 'T' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

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
  // dd-mm-yyyy / dd/mm/yyyy / dd-mm-yy (2-cijferig jaar → 20xx)
  m=s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
  if(m){let y=+m[3];if(y<100)y+=2000;return _valDate(y,+m[2],+m[1]);}
  // "21 mei 2026" / "3 jan. 2025" / "21 mei '26"
  m=s.match(/^(\d{1,2})\s+([a-zA-Z]+)\.?\s+'?(\d{2,4})$/);
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
  return `<span class="code code-klik"${st} data-action="vve-open" data-code="${esc(c)}" title="Open VvE-dossier">${esc(c)}</span>`;
}
function subBadge(v){return v?`<span class="badge" style="background:var(--sur2);color:var(--mut);font-size:10px;margin-left:4px">${esc(v)}</span>`:''}
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
function _zonderSterren(s){
  return s.replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(.+?)\*/g, '$1');
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

export {
  taakTitel, taakVerwijzing, kortDatum,
  displayName, filt, splitBehandelaar, PRIO_REGELS, STIL_DREMPEL_DAGEN, STIL_ESCALATIE_REGELS,
  DEADLINE_VOORSTEL, DEADLINE_HINT, voorgesteldeDeadline, AF_PERIODES, periodeBereik,
  opvolgStatus, volgendeDeadline, HERHAAL_MAANDEN, _vandaagAmsterdam, isoWeek,
  _verschilInKalenderdagen, berekenPrioriteit, prioBadge, persBadges,
  adjOff, offProg, _MAANDEN, _parseAnyDate, parseDt, toISODate, toDutchDate, leegBijErfenis, nieuwTaakId,
  emptyRow, esc, vveCodeSpan, subBadge, taakActieKnoppen, coerceDagenVooraf,
  parseOff, offerteFase,
  parseAannemers, serializeAannemers, deriveOffertes, reconcileOffertes, aannSleutel,
  meldSleutel, _zonderLeidendSymbool, kiesAfgerondRij,
};
