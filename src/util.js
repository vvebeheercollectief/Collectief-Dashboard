// ══════════════════════════════════════
//  UTIL — gedeelde pure helpers (datums, prioriteit, tekst, badges)
// ══════════════════════════════════════
import { EMAIL_NAMES, OFFERTE_FASES, OFFERTE_TERMIJNEN } from './config.js';

function displayName(s){
  if(!s) return '';
  const key = String(s).toLowerCase().trim();
  return EMAIL_NAMES[key] || s;
}

function filt(rows,q){
  if(!q)return rows;
  return rows.filter(r=>Object.values(r).some(v=>String(v??'').toLowerCase().includes(q)));
}

// ══════════════════════════════════════
//  AUTO-PRIORITEIT (zie docs/superpowers/specs/2026-06-02-auto-prioriteit-design.md)
// ══════════════════════════════════════
const PRIO_REGELS = {
  'OPPAKKEN':          { hoog:  7, midden:  14 },
  'VERGADERVERZOEKEN': { hoog: 14, midden:  21 },
  'OFFERTE-TRAJECTEN': { hoog: 21, midden:  42 },
  'LOD':               { hoog: 90, midden: 240 },
};
const STIL_DREMPEL_DAGEN = 4;

// ══════════════════════════════════════
//  FASE 4 — OPVOLGING & HERHALING (zie docs/superpowers/specs/2026-06-11-fase4-opvolging-herhaling-design.md)
// ══════════════════════════════════════
// LET OP — SYNC: gelijk houden aan CD_STIL_ESCALATIE_REGELS in apps-script/Opvolging.gs
const STIL_ESCALATIE_REGELS = {
  'OPPAKKEN':          { trap1:  7, trap2: 14 },
  'VERGADERVERZOEKEN': { trap1: 14, trap2: 21 },
  'OFFERTE-TRAJECTEN': { trap1: 21, trap2: 35 },
  'LOD':               { trap1: 30, trap2: 60 },
};

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

// Aantal werkdagen (ma–vr) ná `van` t/m `tot`. Negatief/gelijk → 0.
function _verschilInWerkdagen(van, tot){
  if (!(van instanceof Date) || !(tot instanceof Date) || isNaN(van) || isNaN(tot)) return null;
  let a = new Date(van.getFullYear(), van.getMonth(), van.getDate());
  const b = new Date(tot.getFullYear(), tot.getMonth(), tot.getDate());
  let n = 0;
  while (a < b){
    a.setDate(a.getDate() + 1);
    const wd = a.getDay();
    if (wd !== 0 && wd !== 6) n++;
  }
  return n;
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
  const ico={Hoog:'↑',Midden:'→',Laag:'↓'}[prioriteit]||'';
  return`<span class="badge ${cls}">${ico} ${esc(prioriteit)}</span>`;
}

function persBadges(v){
  if(!v)return'<span style="color:var(--fnt);font-size:12px">–</span>';
  const colors={'jer':'pers-jer','cihad':'pers-cihad','gabos':'pers-gabos'};
  return v.split(/[,\/]/).map(n=>n.trim()).filter(Boolean).map(n=>{
    const cls=colors[n.toLowerCase()]||'pers-default';
    return`<span class="pers ${cls}">${esc(n)}</span>`;
  }).join('');
}

function ibBadge(v){
  return(v==='TRUE'||v===true)?'<span class="ib-yes">⟳ Loopt</span>':'<span class="ib-no">–</span>';
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

// Laatste "aanraak"-datum van een traject (voor de stil-teller): jongste van
// laatsteActiviteit, opvolgdatum, datumAangevraagd.
function offerteStilBasis(r){
  const kandidaten = [r && r.laatsteActiviteit, r && r.opvolgdatum, r && r.datumAangevraagd];
  let laatst = null;
  kandidaten.forEach(s => {
    const p = _parseAnyDate(s || '');
    if (p){ const d = new Date(p.y, p.m - 1, p.d); if (!laatst || d > laatst) laatst = d; }
  });
  return laatst;
}

// Heeft dit traject vandaag opvolging nodig? + context (bal-bij-wie, dagen, actie).
function offerteNuOpvolgen(r, vandaag, termijnen){
  vandaag  = vandaag   || _vandaagAmsterdam();
  termijnen = termijnen || OFFERTE_TERMIJNEN;
  const fase   = offerteFase(r);
  const balBij = offerteBalBij(r);
  const ov     = opvolgStatus(r, vandaag);
  const basis  = offerteStilBasis(r);
  const dagen     = basis ? _verschilInKalenderdagen(vandaag, basis) : null; // (vandaag, basis): positief = dagen stil
  const werkdagen = basis ? _verschilInWerkdagen(basis, vandaag)     : null;
  const dlp = _parseAnyDate((r && r.deadline) || '');
  const deadlineTeLaat = dlp ? (_verschilInKalenderdagen(new Date(dlp.y, dlp.m - 1, dlp.d), vandaag) < 0) : false;
  const opvolgenVandaag = ov.vandaag && !!_parseAnyDate((r && r.opvolgdatum) || '');
  const actie = balBij === 'ons' ? 'Doorsturen' : balBij ? 'Nabellen' : null;
  if (fase === 'gegund' || ov.weggelegd){ // weggelegd wint bewust óók van deadlineTeLaat (bewust geparkeerd, Fase 4)
    return { nodig:false, fase, balBij, dagen, werkdagen, deadlineTeLaat, actie };
  }
  const termijn = balBij === 'aannemer' ? termijnen.aannemer
                : balBij === 'ons'      ? termijnen.delen
                : balBij === 'vve'      ? termijnen.eigenaren : Infinity;
  const meting = balBij === 'aannemer' ? werkdagen : dagen;
  const nodig = (meting != null && meting >= termijn) || deadlineTeLaat || opvolgenVandaag;
  return { nodig: !!nodig, fase, balBij, dagen, werkdagen, deadlineTeLaat, actie };
}

// Bij wie ligt de bal? 'aannemer' | 'ons' | 'vve' | null (gegund).
function offerteBalBij(r){
  const fase = offerteFase(r);
  if (fase === 'gegund')    return null;
  if (fase === 'bij_vve')   return 'vve';
  if (fase === 'ontvangen') return 'ons';
  return 'aannemer';
}

// Regel-gebaseerde kern voor de briefing: telt en kiest het urgentste traject.
function offerteBriefingFeiten(rijen, vandaag, termijnen){
  vandaag = vandaag || _vandaagAmsterdam();
  rijen = rijen || [];
  const trap1 = STIL_ESCALATIE_REGELS['OFFERTE-TRAJECTEN'].trap1;
  let nuOpvolgen = 0, langStil = 0, balBijOns = 0, klaarTeGunnen = 0;
  let urgentste = null, urgScore = -1;
  rijen.forEach(r => {
    if (offerteFase(r) === 'bij_vve') klaarTeGunnen++;
    const s = offerteNuOpvolgen(r, vandaag, termijnen);
    if (!s.nodig) return;
    nuOpvolgen++;
    if ((s.dagen || 0) >= trap1) langStil++;
    if (s.balBij === 'ons') balBijOns++;
    const sc = offerteSorteerScore(r, vandaag, termijnen);
    if (sc > urgScore){ urgScore = sc; urgentste = { code:(r.code||''), naam:(r.naam||''), dagen:s.dagen, balBij:s.balBij }; }
  });
  return { nuOpvolgen, langStil, balBijOns, klaarTeGunnen, urgentste };
}

// Aantal keren dat een offerte-traject is nagebeld (Contact-logregels met veld 'Telefoon').
function offerteNabelTeller(code, logboek){
  let n = 0;
  (logboek || []).forEach(e => { if (e.sectie === 'OFFERTE-TRAJECTEN' && e.code === code && e.veld === 'Telefoon') n++; });
  return n;
}

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

// Sorteerscore voor "Nu opvolgen": hoger = urgenter (sorteer aflopend).
function offerteSorteerScore(r, vandaag, termijnen){
  const s = offerteNuOpvolgen(r, vandaag, termijnen);
  const prioRank = { hoog:2, midden:1, laag:0 }[(((r&&r.prioriteit)||'')+'').trim().toLowerCase()];
  return (s.deadlineTeLaat ? 1e6 : 0) + ((s.dagen || 0) * 100)
       + (s.balBij === 'ons' ? 10 : 0)            // tiebreak: snel af te ronden (bal bij ons) eerst
       + (prioRank == null ? 1 : prioRank);
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

function _parseAnyDate(s){
  if(!s)return null;
  s=s.trim();
  // yyyy-mm-dd of yyyy-mm-ddT... (ISO, met of zonder tijdgedeelte)
  let m=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(T.*)?$/);
  if(m)return{y:+m[1],m:+m[2],d:+m[3]};
  // dd-mm-yyyy
  m=s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if(m)return{y:+m[3],m:+m[2],d:+m[1]};
  // dd/mm/yyyy
  m=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if(m)return{y:+m[3],m:+m[2],d:+m[1]};
  // "21 mei 2026" / "3 jan. 2025" / "21 mei '26"
  m=s.match(/^(\d{1,2})\s+([a-zA-Z]+)\.?\s+'?(\d{2,4})$/);
  if(m){const mn=_MAANDEN[m[2].toLowerCase()];if(mn){let y=+m[3];if(y<100)y+=2000;return{y,m:mn,d:+m[1]}}}
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

function emptyRow(cols,inline){
  if(inline)return`<div class="empty"><div class="empty-ico">📭</div>Geen resultaten</div>`;
  return`<tr><td colspan="${cols}"><div class="empty"><div class="empty-ico">📭</div>Geen resultaten</div></td></tr>`;
}

function esc(s){return(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
function subBadge(v){return v?`<span class="badge" style="background:var(--sur2);color:var(--mut);font-size:10px;margin-left:4px">${esc(v)}</span>`:''}

export {
  displayName, filt, PRIO_REGELS, STIL_DREMPEL_DAGEN, STIL_ESCALATIE_REGELS,
  opvolgStatus, volgendeDeadline, HERHAAL_MAANDEN, _vandaagAmsterdam,
  _verschilInKalenderdagen, berekenPrioriteit, prioBadge, persBadges, ibBadge,
  adjOff, offProg, _MAANDEN, _parseAnyDate, parseDt, toISODate, toDutchDate,
  emptyRow, esc, subBadge,
  parseOff, offerteFase, offerteBalBij, _verschilInWerkdagen,
  offerteStilBasis, offerteNuOpvolgen, offerteSorteerScore, offerteBriefingFeiten, offerteNabelTeller,
  parseAannemers, serializeAannemers, deriveOffertes,
};
