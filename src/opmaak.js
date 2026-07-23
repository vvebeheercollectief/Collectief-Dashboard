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

function isVet(el){
  if(TAG_VET.has(el.tagName)) return true;
  const w=String(el.style?.fontWeight||'').toLowerCase();
  return w==='bold'||w==='bolder'||(/^\d+$/.test(w)&&+w>=600);
}
function isSchuin(el){
  if(TAG_SCHUIN.has(el.tagName)) return true;
  return String(el.style?.fontStyle||'').toLowerCase()==='italic';
}

// Zet de markering strak om de tekst en laat spaties er buiten staan: "**vet **"
// zou niet als vet weergegeven worden (inhoud mag niet op een spatie eindigen).
function markeer(s, mark){
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

export { opmaakHtml, zonderOpmaak, htmlNaarMarkers };
