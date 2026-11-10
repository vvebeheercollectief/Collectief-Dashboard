// ══════════════════════════════════════
//  UTIL — kleine pure hulpjes (tekst, datums, nummers)
// ══════════════════════════════════════

export function esc(s){
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// Selectievakje-erfenis: rijen in 'Nog Te Doen' erven de TRUE/FALSE-validatie van de kolommen
// rechts van H. Zo'n geërfde waarde is géén inhoud en telt als leeg.
export const leegBijErfenis = v => {
  const s = ((v ?? '') + '').trim();
  const u = s.toUpperCase();
  return (u === 'TRUE' || u === 'FALSE') ? '' : s;
};

// Vast taaknummer (kolom Q). Woordelijk gelijk aan cd_nieuwTaakId in apps-script/Notifications.gs.
export const nieuwTaakId = () => 'T' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
// Nummer voor een regel in 'Mijn taken' (kolom A).
export const nieuwTaakRegelId = () => 'M' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

// ── Datums ──────────────────────────────────────────────────────────────
// De Sheet levert datums in allerlei vormen terug ('2026-11-14', '14-11-2026', '14 november 2026',
// '14 nov. 26'), afhankelijk van hoe de cel opgemaakt is. Alles gaat hierdoor.
export const MAANDEN = {jan:1,januari:1,feb:2,februari:2,mrt:3,maart:3,mar:3,apr:4,april:4,mei:5,
  jun:6,juni:6,jul:7,juli:7,aug:8,augustus:8,sep:9,sept:9,september:9,okt:10,oktober:10,oct:10,
  nov:11,november:11,dec:12,december:12};
const MND_KORT = ['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec'];
const DAG_KORT = ['zo','ma','di','wo','do','vr','za'];

function _valDate(y,m,d){
  const dt=new Date(y,m-1,d);
  return (dt.getFullYear()===y && dt.getMonth()===m-1 && dt.getDate()===d) ? {y,m,d} : null;
}
export function parseDatum(s){
  if(!s) return null;
  s=String(s).trim();
  let m=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(T.*)?$/);
  if(m) return _valDate(+m[1],+m[2],+m[3]);
  m=s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2}|[1-9]\d{3})$/);
  if(m){ let y=+m[3]; if(y<100) y+=2000; return _valDate(y,+m[2],+m[1]); }
  m=s.match(/^(\d{1,2})\s+([a-zA-Z]+)\.?\s+'?(\d{2}|[1-9]\d{3})$/);
  if(m){ const mn=MAANDEN[m[2].toLowerCase()]; if(mn){ let y=+m[3]; if(y<100) y+=2000; return _valDate(y,mn,+m[1]); } }
  return null;
}
const twee = n => String(n).padStart(2,'0');
// Voor een <input type=date>.
export const naarISO = s => { const d=parseDatum(s); return d ? `${d.y}-${twee(d.m)}-${twee(d.d)}` : ''; };
// Zo schrijven we een datum naar de Sheet (zelfde vorm als de vorige versies: dd-mm-jjjj).
export const naarSheetDatum = s => { const d=parseDatum(s); return d ? `${twee(d.d)}-${twee(d.m)}-${d.y}` : ''; };
export const vandaagSheet = (nu=new Date()) => `${twee(nu.getDate())}-${twee(nu.getMonth()+1)}-${nu.getFullYear()}`;
export const nuSheet = (nu=new Date()) => `${vandaagSheet(nu)} ${twee(nu.getHours())}:${twee(nu.getMinutes())}`;

// Dagen tot een datum (negatief = voorbij), of null als er geen geldige datum is.
export function dagenTot(s, nu=new Date()){
  const d=parseDatum(s); if(!d) return null;
  const a=new Date(d.y,d.m-1,d.d), b=new Date(nu.getFullYear(),nu.getMonth(),nu.getDate());
  return Math.round((a-b)/864e5);
}
// 'Vandaag', 'Morgen', '3 dagen te laat' of 'za 14 nov'. Leeg als er geen datum is.
export function wanneer(s, nu=new Date()){
  const n=dagenTot(s, nu);
  if(n===null) return (s||'').trim();
  if(n<-1) return `${-n} dagen te laat`;
  if(n===-1) return '1 dag te laat';
  if(n===0) return 'Vandaag';
  if(n===1) return 'Morgen';
  const d=parseDatum(s), dt=new Date(d.y,d.m-1,d.d);
  const jaar = dt.getFullYear()!==nu.getFullYear() ? ' '+dt.getFullYear() : '';
  return `${DAG_KORT[dt.getDay()]} ${d.d} ${MND_KORT[d.m-1]}${jaar}`;
}
// '22 okt 2026' — voor het ALV-archief.
export function kortDatum(s){
  const d=parseDatum(s); if(!d) return (s||'').trim();
  return `${d.d} ${MND_KORT[d.m-1]} ${d.y}`;
}
// Sorteersleutel; zonder datum achteraan.
export const datumSleutel = s => { const d=parseDatum(s); return d ? d.y*10000+d.m*100+d.d : 99999999; };

// Zoekt q (kleine letters) in de opgegeven velden.
export const bevat = (q, ...velden) => !q || velden.join(' ').toLowerCase().includes(q);

// Een foutmelding die een mens kan lezen.
export function leesbareFout(e){
  if(!e) return 'Onbekende fout.';
  if(e.melding) return e.melding;
  if(e.status===403) return 'Geen toegang tot de Sheet met dit account.';
  if(e.status===429) return 'Google is even te druk. Probeer het over een minuut opnieuw.';
  return e.message || String(e);
}
