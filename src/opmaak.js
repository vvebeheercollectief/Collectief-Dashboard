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

export { opmaakHtml, zonderOpmaak };
