// ══════════════════════════════════════
//  OPMAAK — vet/schuin/opsomming in vrije-tekstvelden
// ══════════════════════════════════════
// Opslag blijft PLATTE TEKST in de Sheet: **vet**, _schuin_, "- punt".
// Zo blijft een Sheet-cel leesbaar voor een mens en komt er nooit HTML in de data.
// Weergave escapet ALTIJD eerst (esc) en zet daarna pas markeringen om — die
// volgorde is de reden dat geplakte of getypte invoer geen HTML kan injecteren.
import { esc } from "./util.js";

// Vet: **…** — inhoud mag niet met witruimte beginnen/eindigen en geen * bevatten.
// Daardoor blijven "3*4" en "** los **" ongemoeid.
const RE_VET    = /\*\*([^*\s](?:[^*]*[^*\s])?)\*\*/g;
// Schuin: _…_ — met woordgrenzen eromheen, zodat bestand_naam_hier niets wordt.
const RE_SCHUIN = /(^|[^\w])_([^_\s](?:[^_]*[^_\s])?)_(?![\w])/g;
// Opsomming: regel begint met "- " of "• " (Word plakt vaak echte bolletjes).
const RE_PUNT   = /^[ \t]*[-•][ \t]+(.*)$/;

// Markeringen binnen één regel → HTML. Escapet eerst; werkt dus op veilige tekst.
function inlineHtml(regel){
  return esc(regel)
    .replace(RE_VET, '<strong>$1</strong>')
    .replace(RE_SCHUIN, '$1<em>$2</em>');
}

// Opgeslagen tekst → veilige HTML. Opeenvolgende opsommingsregels worden één <ul>.
// Losse regels worden met \n aan elkaar geplakt: de weergave-elementen staan op
// white-space:pre-wrap, dus die \n ís de regelafbreking. Rond een <ul> hoeft geen
// \n (dat is al een blok-element) — anders krijg je een extra lege regel.
function opmaakHtml(tekst){
  if(tekst===null||tekst===undefined) return '';
  const blokken=[];
  String(tekst).split('\n').forEach(regel=>{
    const m=RE_PUNT.exec(regel);
    const vorige=blokken[blokken.length-1];
    if(m){
      if(vorige&&vorige.lijst) vorige.regels.push(m[1]);
      else blokken.push({lijst:true, regels:[m[1]]});
    } else {
      if(vorige&&!vorige.lijst) vorige.regels.push(regel);
      else blokken.push({lijst:false, regels:[regel]});
    }
  });
  return blokken.map(b=> b.lijst
    ? `<ul class="op-lijst">${b.regels.map(r=>`<li>${inlineHtml(r)}</li>`).join('')}</ul>`
    : b.regels.map(inlineHtml).join('\n')
  ).join('');
}

// Markeringen eruit — voor plekken die platte tekst willen (AI-context).
// Opsommingsstreepjes blijven staan: die lezen ook plat prima.
function zonderOpmaak(tekst){
  if(tekst===null||tekst===undefined) return '';
  return String(tekst).replace(RE_VET,'$1').replace(RE_SCHUIN,'$1$2');
}

// ── Klembord-HTML → markeringen ─────────────────────────────
// Word, Outlook en Google Docs zetten naast platte tekst óók text/html op het
// klembord. Daaruit halen we vet, schuin en opsommingen; al het andere (kleur,
// lettertype, tabellen) valt weg — dat is in een Sheet-cel toch niet houdbaar.
const TAG_VET    = new Set(['B','STRONG','H1','H2','H3','H4','H5','H6','TH']);
const TAG_SCHUIN = new Set(['I','EM']);
const TAG_BLOK   = new Set(['P','DIV','UL','OL','TABLE','TR','BLOCKQUOTE','PRE',
                            'SECTION','ARTICLE','H1','H2','H3','H4','H5','H6']);
const TAG_WEG    = new Set(['SCRIPT','STYLE','HEAD','NOSCRIPT','TEMPLATE']);

// De eigen stijl gaat vóór de tagnaam, en niet andersom. Google Docs wikkelt een kopie ALTIJD in
// één <b style="font-weight:normal" id="docs-internal-guid-…"> om de hele selectie heen. Op tagnaam
// alleen werd een geplakte mail daardoor in z'n geheel vet, met de echte accenten als verdwaalde
// sterretjes ertussen: `**Beste bestuur. **Let op de garantie.****`.
// Alleen een EXPLICIET gewicht telt als tegenbewijs; bij 'inherit' of iets onbekends valt hij terug
// op de tagnaam, want dan zegt de stijl niets.
function isVet(el){
  const w=String(el.style?.fontWeight||'').toLowerCase();
  if(w==='bold'||w==='bolder'||(/^\d+$/.test(w)&&+w>=600)) return true;
  if(w==='normal'||w==='lighter'||(/^\d+$/.test(w)&&+w<600)) return false;
  return TAG_VET.has(el.tagName);
}
function isSchuin(el){
  const s=String(el.style?.fontStyle||'').toLowerCase();
  if(s==='italic'||s==='oblique') return true;
  if(s==='normal') return false;   // zelfde regel als hierboven: <i style="font-style:normal"> is niet schuin
  return TAG_SCHUIN.has(el.tagName);
}

// Zet de markering strak om de tekst en laat spaties er buiten staan: "**vet **"
// zou niet als vet weergegeven worden (inhoud mag niet op een spatie eindigen).
//
// PER REGEL, en dat is geen detail. De opslagvorm is regel-lokaal: `opmaakHtml` splitst bij het
// teruglezen op '\n' en past de vet-/schuin-regex per regel toe. Zette je de markering om een
// blok van twee regels heen ('**Regel1\nRegel2**'), dan stond de openings-** op regel 1 en de
// sluitings-** op regel 2 en kon geen van beide ooit nog herkend worden — de gebruiker zag
// letterlijk '**Regel1' en 'Regel2**' staan, mét sterretjes en zónder vet. Dat gebeurde bij elk
// meerregelig vet blok uit Word of Outlook (<b>Regel1<br>Regel2</b>), en dat is de normale vorm
// van een geplakt adres of een 'LET OP'-mededeling.
function markeer(s, mark){
  const str=String(s==null?'':s);
  if(str.indexOf('\n')===-1) return _markeerRegel(str, mark);
  return str.split('\n').map(r=>_markeerRegel(r, mark)).join('\n');
}
function _markeerRegel(s, mark){
  const m=/^(\s*)([\s\S]*?)(\s*)$/.exec(s);
  if(!m||!m[2]) return s;
  if(m[2].startsWith(mark)&&m[2].endsWith(mark)) return s;   // al gemarkeerd (nesting)
  return m[1]+mark+m[2]+mark+m[3];
}

function knoopTekst(n){
  if(n.nodeType===3) return String(n.nodeValue||'').replace(/\s+/g,' ');
  if(n.nodeType!==1) return '';
  const tag=n.tagName;
  if(TAG_WEG.has(tag)) return '';
  if(tag==='BR') return '\n';
  let binnen=Array.from(n.childNodes).map(knoopTekst).join('');
  if(tag==='LI') return '\n- '+binnen.trim();
  if(binnen.trim()){
    if(isVet(n))    binnen=markeer(binnen,'**');
    if(isSchuin(n)) binnen=markeer(binnen,'_');
  }
  return TAG_BLOK.has(tag) ? '\n'+binnen+'\n' : binnen;
}

function htmlNaarMarkers(html){
  if(!html) return '';
  const doc=new DOMParser().parseFromString(String(html),'text/html');
  return knoopTekst(doc.body)
    .replace(/[ \t]{2,}/g,' ')
    .replace(/[ \t]+\n/g,'\n')
    .replace(/\n[ \t]+/g,'\n')
    .replace(/\n{3,}/g,'\n\n')
    .trim();
}

// ── Invoerkant: knoppen, sneltoetsen, plakken, meegroeien ───
const MARK={vet:'**', schuin:'_'};

// Puur (testbaar zonder DOM): pas een opmaakknop toe op een selectie.
// Geeft de nieuwe tekst plus waar de selectie daarna moet staan.
function pasToe(tekst, start, eind, soort){
  const t=String(tekst==null?'':tekst);
  if(soort==='lijst'){
    // Werk op hele regels: van het begin van de eerste tot het eind van de laatste.
    const a=t.lastIndexOf('\n',Math.max(0,start-1))+1;
    const nb=t.indexOf('\n',eind);
    const b=nb===-1?t.length:nb;
    const regels=t.slice(a,b).split('\n');
    // Staan ze er al allemaal? Dan is de knop een schakelaar en halen we ze weg.
    // `heeftInhoud` erbij: zonder die eis telde een selectie van alleen LEGE regels als 'staat er
    // al' (elke lege regel voldoet aan `!r.trim()`), waarna de map-lus diezelfde lege regels ook
    // nog eens ongemoeid liet. De knop deed dan zichtbaar niets — precies in het meest gewone
    // geval: een leeg notitieveld waarin je een lijstje wilt beginnen.
    const heeftInhoud=regels.some(r=>r.trim());
    const alAan=heeftInhoud && regels.every(r=>RE_PUNT.test(r)||!r.trim());
    const nieuw=regels.map(r=>{
      // Bij AANzetten krijgt ook een lege regel zijn streepje: dat is de regel waar de cursor
      // staat als je met een leeg veld begint. Bij UITzetten blijven lege regels leeg.
      if(!r.trim()) return alAan ? r : (heeftInhoud ? r : '- ');
      const m=RE_PUNT.exec(r);
      return alAan ? (m?m[1]:r) : '- '+r;
    }).join('\n');
    // Bij AANzetten op een blok ZONDER inhoud (het gewone geval: een leeg notitieveld) staat de
    // cursor samengevouwen áchter het streepje in plaats van de '- ' te selecteren. Anders wist de
    // eerste letter die de gebruiker typt het streepje meteen weer — en dan lijkt de knop opnieuw
    // niets te doen, precies het geval dat deze reparatie moest oplossen.
    if(!alAan && !heeftInhoud){
      const eind=a+nieuw.length;
      return {tekst:t.slice(0,a)+nieuw+t.slice(b), start:eind, eind};
    }
    return {tekst:t.slice(0,a)+nieuw+t.slice(b), start:a, eind:a+nieuw.length};
  }
  const mk=MARK[soort]; if(!mk) return {tekst:t, start, eind};
  const n=mk.length;
  // Schakelaar 1: de markering staat al net buiten de selectie.
  if(t.slice(start-n,start)===mk && t.slice(eind,eind+n)===mk){
    return {tekst:t.slice(0,start-n)+t.slice(start,eind)+t.slice(eind+n), start:start-n, eind:eind-n};
  }
  const sel=t.slice(start,eind);
  // Schakelaar 2: de selectie bevat de markering zélf (je sleepte er overheen).
  if(sel.length>2*n && sel.startsWith(mk) && sel.endsWith(mk)){
    const kern=sel.slice(n,-n);
    return {tekst:t.slice(0,start)+kern+t.slice(eind), start, eind:start+kern.length};
  }
  // Spaties horen BUITEN de markering: "**vet **" wordt niet als vet weergegeven, en
  // dubbelklikken op een woord neemt in veel browsers de spatie erachter mee.
  const m=/^(\s*)([\s\S]*?)(\s*)$/.exec(sel);
  const voor=m[1], kern=m[2], na=m[3];
  // Niets (of alleen witruimte) geselecteerd: leeg paar neerzetten, cursor ertussen.
  if(!kern) return {tekst:t.slice(0,start)+mk+mk+t.slice(eind), start:start+n, eind:start+n};
  const a=start+voor.length;
  return {tekst:t.slice(0,a)+mk+kern+mk+na+t.slice(eind), start:a+n, eind:a+n+kern.length};
}

const LIJST_ICO='<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="4.5" cy="6.5" r="1.4" fill="currentColor" stroke="none"/><circle cx="4.5" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="4.5" cy="17.5" r="1.4" fill="currentColor" stroke="none"/><path d="M9 6.5h11M9 12h11M9 17.5h11"/></svg>';

// HTML voor het knoppenbalkje onder een veld. Staat óók letterlijk in index.html
// voor #hist-note (statische markup); houd die twee gelijk.
function opmaakBalk(){
  return `<div class="opmaak-balk">
    <button type="button" class="opmaak-knop" data-action="opmaak-vet" title="Vet (Ctrl+B)" aria-label="Vet"><b>B</b></button>
    <button type="button" class="opmaak-knop" data-action="opmaak-schuin" title="Schuin (Ctrl+I)" aria-label="Schuin"><i>I</i></button>
    <button type="button" class="opmaak-knop" data-action="opmaak-lijst" title="Opsomming" aria-label="Opsomming">${LIJST_ICO}</button>
  </div>`;
}

// Hoogte laten meegroeien met de inhoud (maximum staat als max-height in de CSS).
function groei(el){
  if(!el) return;
  el.style.height='auto';
  el.style.height=el.scrollHeight+'px';
}

// Alle opmaakvelden in beeld opnieuw op maat brengen. Wordt na elke render
// aangeroepen: de 8s-poll tekent het dossier opnieuw en dan is de hoogte weg.
function groeiVelden(root){
  (root||document).querySelectorAll('.opmaak-veld textarea').forEach(groei);
}

// Zoek de textarea die bij een knop hoort. Via closest(), want hetzelfde
// bewerkformulier staat tegelijk op de Logboek-pagina én in het dossier.
function veldVan(el){
  return el?.closest('.opmaak-veld')?.querySelector('textarea')||null;
}

// Knopactie uitvoeren op een veld en de selectie netjes terugzetten.
function doeOpmaak(el, soort){
  const t=veldVan(el); if(!t) return;
  const r=pasToe(t.value, t.selectionStart, t.selectionEnd, soort);
  t.value=r.tekst;
  t.focus();
  t.setSelectionRange(r.start, r.eind);
  groei(t);
}

const isOpmaakVeld=el=>el?.tagName==='TEXTAREA'&&!!el.closest('.opmaak-veld');

// Eenmalige document-brede koppeling. Delegatie, want de velden worden bij elke
// render opnieuw aangemaakt — losse listeners zouden verdwijnen of verdubbelen.
function initOpmaak(){
  // Meegroeien tijdens typen
  document.addEventListener('input', e=>{ if(isOpmaakVeld(e.target)) groei(e.target); });
  // Sneltoetsen Ctrl/Cmd+B en Ctrl/Cmd+I
  document.addEventListener('keydown', e=>{
    if(!(e.ctrlKey||e.metaKey) || e.altKey || !isOpmaakVeld(e.target)) return;
    const k=(e.key||'').toLowerCase();
    if(k!=='b'&&k!=='i') return;
    e.preventDefault();
    doeOpmaak(e.target, k==='b'?'vet':'schuin');
  });
  // Plakken met behoud van vet/schuin/opsomming
  document.addEventListener('paste', e=>{
    const t=e.target;
    if(!isOpmaakVeld(t)) return;
    const html=e.clipboardData?.getData('text/html');
    if(!html) return;                       // geen opmaak op het klembord: laat de browser plakken
    const tekst=htmlNaarMarkers(html);
    if(!tekst) return;
    e.preventDefault();
    // execCommand houdt de ongedaan-maken-geschiedenis van de browser intact;
    // valt terug op directe invoeging als de browser 'm niet (meer) ondersteunt.
    let gelukt=false;
    try{ gelukt=!!document.execCommand&&document.execCommand('insertText',false,tekst); }catch(err){ gelukt=false; }
    if(!gelukt){
      const s=t.selectionStart, eind=t.selectionEnd;
      t.value=t.value.slice(0,s)+tekst+t.value.slice(eind);
      t.setSelectionRange(s+tekst.length, s+tekst.length);
    }
    groei(t);
  });
}

export { opmaakHtml, zonderOpmaak, htmlNaarMarkers, pasToe, opmaakBalk, groei, groeiVelden, doeOpmaak, initOpmaak };
