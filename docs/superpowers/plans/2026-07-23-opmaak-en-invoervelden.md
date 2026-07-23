# Opmaak en invoervelden — implementatieplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Inlogregel weghalen, vrije-tekstvelden laten meegroeien, en vet/schuin/opsomming toevoegen aan de logboekvelden en Bron — inclusief het overnemen van opmaak bij plakken.

**Architecture:** Eén nieuwe module `src/opmaak.js` met drie pure functies (`opmaakHtml`, `htmlNaarMarkers`, `zonderOpmaak`) en twee DOM-functies (`initOpmaak` voor document-brede delegatie, `groeiVelden` voor de hoogtepas na elke render). Opmaak wordt als leestekens in de platte tekst opgeslagen (`**vet**`, `_schuin_`, `- punt`), zodat de Google Sheet leesbaar blijft. Weergave escapet altijd eerst en zet daarna pas markeringen om.

**Tech Stack:** Vanilla ES-modules, geen build-stap. Tests draaien in de browser via `?test=1` (zelfgebouwde `eq`/`truthy`-asserts in `src/tests.js`).

**Testen draaien:** `python3 -m http.server 8899` in de repo-root (no-cache variant uit `~/.claude`), dan `http://localhost:8899/?test=1` openen en `window._testResult` lezen. Verwacht: `{ok: <n>, fail: 0}`.

---

### Task 1: Pure weergavefunctie `opmaakHtml`

**Files:**
- Create: `src/opmaak.js`
- Test: `src/tests.js` (nieuw blok onderaan, vóór de eindrapportage)

- [ ] **Step 1: Schrijf de falende tests**

Voeg toe aan `src/tests.js` — importregel bovenaan bij de andere imports:

```js
import { opmaakHtml, htmlNaarMarkers, zonderOpmaak } from "./opmaak.js";
```

En het testblok (plaats vóór de regel die `_testResult` zet):

```js
  // ── opmaak: markeringen → veilige HTML ──
  eq('opmaakHtml vet', opmaakHtml('dit is **dringend** hoor'), 'dit is <strong>dringend</strong> hoor');
  eq('opmaakHtml schuin', opmaakHtml('dit is _volgens bestuur_ hoor'), 'dit is <em>volgens bestuur</em> hoor');
  eq('opmaakHtml vet aan het begin', opmaakHtml('**let op** dit'), '<strong>let op</strong> dit');
  eq('opmaakHtml schuin aan het begin', opmaakHtml('_let op_ dit'), '<em>let op</em> dit');
  eq('opmaakHtml vet én schuin', opmaakHtml('**a** en _b_'), '<strong>a</strong> en <em>b</em>');
  eq('opmaakHtml lijst', opmaakHtml('- een\n- twee'), '<ul class="op-lijst"><li>een</li><li>twee</li></ul>');
  eq('opmaakHtml lijst met bolletje-teken', opmaakHtml('• een\n• twee'), '<ul class="op-lijst"><li>een</li><li>twee</li></ul>');
  eq('opmaakHtml lijst met opmaak erin', opmaakHtml('- **een**'), '<ul class="op-lijst"><li><strong>een</strong></li></ul>');
  eq('opmaakHtml tekst vóór en na een lijst', opmaakHtml('kop\n- een\nslot'), 'kop<ul class="op-lijst"><li>een</li></ul>slot');
  eq('opmaakHtml houdt gewone regelafbreking', opmaakHtml('een\ntwee'), 'een\ntwee');
  eq('opmaakHtml houdt witregel', opmaakHtml('een\n\ntwee'), 'een\n\ntwee');

  // veiligheid: geen enkele invoer mag HTML de pagina in krijgen
  truthy('opmaakHtml escapet HTML', !opmaakHtml('<script>alert(1)</script>').includes('<script'));
  truthy('opmaakHtml escapet HTML binnen vet', !opmaakHtml('**<img src=x onerror=1>**').includes('<img'));
  eq('opmaakHtml escapet ampersand', opmaakHtml('Jan & Piet'), 'Jan &amp; Piet');

  // bestaande notities mogen niet van betekenis veranderen
  eq('opmaakHtml laat los sterretje staan', opmaakHtml('3*4 = 12'), '3*4 = 12');
  eq('opmaakHtml laat snake_case staan', opmaakHtml('bestand_naam_hier'), 'bestand_naam_hier');
  eq('opmaakHtml negeert vet met spatie erin', opmaakHtml('** niet vet **'), '** niet vet **');
  eq('opmaakHtml negeert streepjeslijn', opmaakHtml('-----'), '-----');
  eq('opmaakHtml leeg', opmaakHtml(''), '');
  eq('opmaakHtml null', opmaakHtml(null), '');
```

- [ ] **Step 2: Draai de tests en controleer dat ze falen**

Open `http://localhost:8899/?test=1`. Verwacht: de module laadt niet (`opmaak.js` bestaat nog niet), zichtbaar als een importfout in de console.

- [ ] **Step 3: Schrijf `src/opmaak.js`**

```js
// ══════════════════════════════════════
//  OPMAAK — vet/schuin/opsomming in vrije-tekstvelden
// ══════════════════════════════════════
// Opslag blijft PLATTE TEKST in de Sheet: **vet**, _schuin_, "- punt".
// Zo blijft een Sheet-cel leesbaar voor een mens en komt er nooit HTML in de data.
// Weergave escapet ALTIJD eerst (esc) en zet daarna pas markeringen om — die
// volgorde is de reden dat geplakte of getypte invoer geen HTML kan injecteren.
import { esc } from "./util.js";

// Vet: **…** — inhoud mag niet met witruimte beginnen/eindigen en geen * bevatten.
// Daardoor blijft "3*4" en "** los **" ongemoeid.
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
// white-space:pre-wrap, dus die \n is de regelafbreking. Rond een <ul> hoeft geen
// \n (dat is al een blok-element) — anders krijg je een extra lege regel.
export function opmaakHtml(tekst){
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
export function zonderOpmaak(tekst){
  if(tekst===null||tekst===undefined) return '';
  return String(tekst).replace(RE_VET,'$1').replace(RE_SCHUIN,'$1$2');
}
```

- [ ] **Step 4: Draai de tests en controleer dat ze slagen**

Herlaad `http://localhost:8899/?test=1`. Verwacht: `window._testResult.fail === 0`.

- [ ] **Step 5: Commit**

```bash
git add src/opmaak.js src/tests.js && git commit -m "Opmaak: pure weergavefunctie voor vet, schuin en opsommingen"
```

---

### Task 2: Klembord-HTML omzetten naar markeringen

**Files:**
- Modify: `src/opmaak.js`
- Test: `src/tests.js`

- [ ] **Step 1: Schrijf de falende tests**

Voeg toe aan het opmaak-testblok in `src/tests.js`:

```js
  // ── opmaak: klembord-HTML → markeringen ──
  eq('htmlNaarMarkers vet via <b>', htmlNaarMarkers('<b>dringend</b>'), '**dringend**');
  eq('htmlNaarMarkers vet via <strong>', htmlNaarMarkers('<strong>dringend</strong>'), '**dringend**');
  eq('htmlNaarMarkers schuin via <i>', htmlNaarMarkers('<i>bestuur</i>'), '_bestuur_');
  eq('htmlNaarMarkers schuin via <em>', htmlNaarMarkers('<em>bestuur</em>'), '_bestuur_');
  eq('htmlNaarMarkers vet via style (Google Docs)', htmlNaarMarkers('<span style="font-weight:700">dringend</span>'), '**dringend**');
  eq('htmlNaarMarkers schuin via style', htmlNaarMarkers('<span style="font-style:italic">bestuur</span>'), '_bestuur_');
  eq('htmlNaarMarkers gewone tekst blijft gewoon', htmlNaarMarkers('<p>gewoon</p>'), 'gewoon');
  eq('htmlNaarMarkers zin met vet erin', htmlNaarMarkers('<p>dit is <b>dringend</b> hoor</p>'), 'dit is **dringend** hoor');
  eq('htmlNaarMarkers alinea wordt witregel', htmlNaarMarkers('<p>een</p><p>twee</p>'), 'een\n\ntwee');
  eq('htmlNaarMarkers <br> wordt regelafbreking', htmlNaarMarkers('een<br>twee'), 'een\ntwee');
  eq('htmlNaarMarkers lijst wordt streepjes', htmlNaarMarkers('<ul><li>een</li><li>twee</li></ul>'), '- een\n- twee');
  eq('htmlNaarMarkers spatie blijft buiten de markering', htmlNaarMarkers('<b>vet </b>na'), '**vet** na');
  eq('htmlNaarMarkers negeert lege vetmarkering', htmlNaarMarkers('<b></b>tekst'), 'tekst');
  eq('htmlNaarMarkers geen dubbele markering bij nesting', htmlNaarMarkers('<b><strong>een</strong></b>'), '**een**');
  eq('htmlNaarMarkers slaat script over', htmlNaarMarkers('<script>alert(1)</script>tekst'), 'tekst');
  eq('htmlNaarMarkers leeg', htmlNaarMarkers(''), '');

  // heen-en-terug: geplakte opmaak komt door de weergavefunctie weer als opmaak terug
  eq('htmlNaarMarkers → opmaakHtml rondje', opmaakHtml(htmlNaarMarkers('<p>dit is <b>dringend</b></p>')), 'dit is <strong>dringend</strong>');

  // ── opmaak: markeringen strippen voor de AI ──
  eq('zonderOpmaak haalt vet weg', zonderOpmaak('dit is **dringend**'), 'dit is dringend');
  eq('zonderOpmaak haalt schuin weg', zonderOpmaak('dit is _stil_'), 'dit is stil');
  eq('zonderOpmaak laat streepjes staan', zonderOpmaak('- een\n- twee'), '- een\n- twee');
```

- [ ] **Step 2: Draai de tests en controleer dat ze falen**

Herlaad `?test=1`. Verwacht: importfout op `htmlNaarMarkers` (bestaat nog niet).

- [ ] **Step 3: Voeg `htmlNaarMarkers` toe aan `src/opmaak.js`**

Plak onderaan `src/opmaak.js`:

```js
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

// Zet de markering strak om de tekst en laat spaties er buiten staan:
// "**vet **" zou niet als vet weergegeven worden (inhoud mag niet op een spatie eindigen).
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

export function htmlNaarMarkers(html){
  if(!html) return '';
  const doc=new DOMParser().parseFromString(String(html),'text/html');
  return knoopTekst(doc.body)
    .replace(/[ \t]{2,}/g,' ')
    .replace(/[ \t]+\n/g,'\n')
    .replace(/\n[ \t]+/g,'\n')
    .replace(/\n{3,}/g,'\n\n')
    .trim();
}
```

- [ ] **Step 4: Draai de tests en controleer dat ze slagen**

Herlaad `?test=1`. Verwacht: `window._testResult.fail === 0`.

- [ ] **Step 5: Commit**

```bash
git add src/opmaak.js src/tests.js && git commit -m "Opmaak: geplakte opmaak uit Word en mail omzetten naar markeringen"
```

---

### Task 3: Knoppen, sneltoetsen, plakken en meegroeien

**Files:**
- Modify: `src/opmaak.js`
- Modify: `src/actions.js` (drie acties toevoegen aan `ACTIONS`)
- Modify: `src/main.js` (`initOpmaak()` aanroepen; `groeiVelden()` in `renderAll`)
- Test: `src/tests.js`

- [ ] **Step 1: Schrijf de falende tests**

Voeg toe aan het opmaak-testblok in `src/tests.js`:

```js
  // ── opmaak: knoppen zetten markeringen om de selectie ──
  eq('pasToe vet om selectie', pasToe('een dringend geval', 4, 12, 'vet'),
     {tekst:'een **dringend** geval', start:6, eind:14});
  eq('pasToe schuin om selectie', pasToe('een stil geval', 4, 8, 'schuin'),
     {tekst:'een _stil_ geval', start:5, eind:9});
  eq('pasToe vet zonder selectie zet cursor ertussen', pasToe('', 0, 0, 'vet'),
     {tekst:'****', start:2, eind:2});
  eq('pasToe haalt vet weer weg', pasToe('een **dringend** geval', 6, 14, 'vet'),
     {tekst:'een dringend geval', start:4, eind:12});
  eq('pasToe lijst zet streepjes voor elke regel', pasToe('een\ntwee', 0, 8, 'lijst').tekst, '- een\n- twee');
  eq('pasToe lijst haalt streepjes weer weg', pasToe('- een\n- twee', 0, 12, 'lijst').tekst, 'een\ntwee');
  eq('pasToe lijst op één regel zonder selectie', pasToe('een', 1, 1, 'lijst').tekst, '- een');

  truthy('actie opmaak-vet bestaat', typeof ACTIONS['opmaak-vet']==='function');
  truthy('actie opmaak-schuin bestaat', typeof ACTIONS['opmaak-schuin']==='function');
  truthy('actie opmaak-lijst bestaat', typeof ACTIONS['opmaak-lijst']==='function');
```

Breid de importregel uit Task 1 uit:

```js
import { opmaakHtml, htmlNaarMarkers, zonderOpmaak, pasToe, opmaakBalk } from "./opmaak.js";
```

- [ ] **Step 2: Draai de tests en controleer dat ze falen**

Herlaad `?test=1`. Verwacht: importfout op `pasToe`.

- [ ] **Step 3: Voeg de invoerkant toe aan `src/opmaak.js`**

Plak onderaan `src/opmaak.js`:

```js
// ── Invoerkant: knoppen, sneltoetsen, plakken, meegroeien ───
const MARK={vet:'**', schuin:'_'};

// Puur (testbaar zonder DOM): pas een opmaakknop toe op een selectie.
// Geeft de nieuwe tekst plus waar de selectie daarna moet staan.
export function pasToe(tekst, start, eind, soort){
  const t=String(tekst==null?'':tekst);
  if(soort==='lijst'){
    // Werk op hele regels: van het begin van de eerste tot het eind van de laatste.
    const a=t.lastIndexOf('\n',Math.max(0,start-1))+1;
    const nb=t.indexOf('\n',eind);
    const b=nb===-1?t.length:nb;
    const regels=t.slice(a,b).split('\n');
    const alAan=regels.every(r=>RE_PUNT.test(r)||!r.trim());
    const nieuw=regels.map(r=>{
      if(!r.trim()) return r;
      const m=RE_PUNT.exec(r);
      return alAan ? (m?m[1]:r) : '- '+r;
    }).join('\n');
    const uit=t.slice(0,a)+nieuw+t.slice(b);
    return {tekst:uit, start:a, eind:a+nieuw.length};
  }
  const mk=MARK[soort]; if(!mk) return {tekst:t, start, eind};
  const n=mk.length;
  // Staat de markering er al omheen? Dan weghalen (knop is een schakelaar).
  if(t.slice(start-n,start)===mk && t.slice(eind,eind+n)===mk){
    const uit=t.slice(0,start-n)+t.slice(start,eind)+t.slice(eind+n);
    return {tekst:uit, start:start-n, eind:eind-n};
  }
  const sel=t.slice(start,eind);
  const uit=t.slice(0,start)+mk+sel+mk+t.slice(eind);
  return {tekst:uit, start:start+n, eind:start+n+sel.length};
}

// HTML voor het knoppenbalkje onder een veld.
export function opmaakBalk(){
  return `<div class="opmaak-balk">
    <button type="button" class="opmaak-knop" data-action="opmaak-vet" title="Vet (Ctrl+B)" aria-label="Vet"><b>B</b></button>
    <button type="button" class="opmaak-knop" data-action="opmaak-schuin" title="Schuin (Ctrl+I)" aria-label="Schuin"><i>I</i></button>
    <button type="button" class="opmaak-knop" data-action="opmaak-lijst" title="Opsomming" aria-label="Opsomming">${LIJST_ICO}</button>
  </div>`;
}
const LIJST_ICO='<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="4.5" cy="6.5" r="1.4" fill="currentColor" stroke="none"/><circle cx="4.5" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="4.5" cy="17.5" r="1.4" fill="currentColor" stroke="none"/><path d="M9 6.5h11M9 12h11M9 17.5h11"/></svg>';

// Hoogte laten meegroeien met de inhoud (max via CSS max-height).
export function groei(el){
  if(!el) return;
  el.style.height='auto';
  el.style.height=el.scrollHeight+'px';
}

// Alle opmaakvelden in beeld opnieuw op maat brengen. Wordt na elke render
// aangeroepen: de 8s-poll tekent het dossier opnieuw en dan is de hoogte weg.
export function groeiVelden(root){
  (root||document).querySelectorAll('.opmaak-veld textarea').forEach(groei);
}

// Zoek de textarea die bij een knop hoort (werkt ook als er twee velden in beeld zijn).
function veldVan(el){
  return el?.closest('.opmaak-veld')?.querySelector('textarea')||null;
}

// Knopactie uitvoeren op een veld en de selectie netjes terugzetten.
export function doeOpmaak(el, soort){
  const t=veldVan(el); if(!t) return;
  const r=pasToe(t.value, t.selectionStart, t.selectionEnd, soort);
  t.value=r.tekst;
  t.focus();
  t.setSelectionRange(r.start, r.eind);
  groei(t);
  t.dispatchEvent(new Event('input',{bubbles:true}));
}

// Eenmalige document-brede koppeling. Delegatie, want de velden worden bij elke
// render opnieuw aangemaakt — losse listeners zouden verdwijnen of verdubbelen.
export function initOpmaak(){
  // Meegroeien tijdens typen
  document.addEventListener('input', e=>{
    if(e.target?.tagName==='TEXTAREA' && e.target.closest('.opmaak-veld')) groei(e.target);
  });
  // Sneltoetsen
  document.addEventListener('keydown', e=>{
    if(!(e.ctrlKey||e.metaKey) || e.altKey) return;
    const t=e.target;
    if(t?.tagName!=='TEXTAREA' || !t.closest('.opmaak-veld')) return;
    const k=e.key.toLowerCase();
    if(k!=='b'&&k!=='i') return;
    e.preventDefault();
    doeOpmaak(t, k==='b'?'vet':'schuin');
  });
  // Plakken met behoud van vet/schuin/opsomming
  document.addEventListener('paste', e=>{
    const t=e.target;
    if(t?.tagName!=='TEXTAREA' || !t.closest('.opmaak-veld')) return;
    const html=e.clipboardData?.getData('text/html');
    if(!html) return;                       // geen opmaak op het klembord: laat de browser plakken
    const tekst=htmlNaarMarkers(html);
    if(!tekst) return;
    e.preventDefault();
    // execCommand houdt de ongedaan-maken-geschiedenis van de browser intact.
    if(!document.execCommand||!document.execCommand('insertText',false,tekst)){
      const s=t.selectionStart, eind=t.selectionEnd;
      t.value=t.value.slice(0,s)+tekst+t.value.slice(eind);
      t.setSelectionRange(s+tekst.length, s+tekst.length);
    }
    groei(t);
    t.dispatchEvent(new Event('input',{bubbles:true}));
  });
}
```

- [ ] **Step 4: Registreer de drie acties in `src/actions.js`**

Voeg bij de imports toe:

```js
import { doeOpmaak, initOpmaak } from './opmaak.js';
```

Voeg toe aan `ACTIONS`, direct ná `'log-verwijderen'`:

```js
  'opmaak-vet':            (el) => doeOpmaak(el,'vet'),
  'opmaak-schuin':         (el) => doeOpmaak(el,'schuin'),
  'opmaak-lijst':          (el) => doeOpmaak(el,'lijst'),
```

Voeg als laatste regel binnen `initActions()` toe:

```js
  initOpmaak();
```

- [ ] **Step 5: Roep `groeiVelden` aan na elke render in `src/main.js`**

Voeg bij de imports toe:

```js
import { groeiVelden } from './opmaak.js';
```

Voeg als laatste regel binnen `renderAll()` toe (na `renderVandaag();`):

```js
  groeiVelden();
```

- [ ] **Step 6: Draai de tests en controleer dat ze slagen**

Herlaad `?test=1`. Verwacht: `window._testResult.fail === 0`.

- [ ] **Step 7: Commit**

```bash
git add src/opmaak.js src/actions.js src/main.js src/tests.js && git commit -m "Opmaak: knoppen, sneltoetsen, plakken en meegroeiende velden"
```

---

### Task 4: De vier velden aansluiten

**Files:**
- Modify: `src/render-vve.js:121` (Bron) en `:175` (composer), `:131` (Bron-weergave)
- Modify: `src/render-overig.js:309` (`.log-note`), `:373` (bewerkformulier), `:580` (taakhistorie)
- Modify: `index.html` (`#hist-note` in een `.opmaak-veld`-omhulsel)
- Test: `src/tests.js`

- [ ] **Step 1: Schrijf de falende tests**

Voeg toe aan het opmaak-testblok in `src/tests.js`:

```js
  // ── opmaak: aangesloten op de echte velden ──
  truthy('logItemHtml toont een notitie met vet',
    logItemHtml({_row:5,actie:'Contact',veld:'Telefoon',oudeWaarde:'Bestuur',
                 nieuweWaarde:'dit is **dringend**',code:'TEST01',timestamp:'2026-07-23T10:00:00.000Z',
                 gebruiker:'info@vvebeheercollectief.nl'},false,false,{}).includes('<strong>dringend</strong>'));
  truthy('logEditForm zit in een opmaak-veld',
    logEditForm({_row:5,actie:'Contact',veld:'Telefoon',oudeWaarde:'Bestuur',nieuweWaarde:'x',
                 timestamp:'2026-07-23T10:00:00.000Z'}).includes('opmaak-veld'));
  truthy('logEditForm heeft een opmaakbalk',
    logEditForm({_row:5,actie:'Contact',veld:'Telefoon',oudeWaarde:'Bestuur',nieuweWaarde:'x',
                 timestamp:'2026-07-23T10:00:00.000Z'}).includes('data-action="opmaak-vet"'));
```

- [ ] **Step 2: Draai de tests en controleer dat ze falen**

Herlaad `?test=1`. Verwacht: drie FAIL-regels in de console.

- [ ] **Step 3: Sluit de composer en Bron aan (`src/render-vve.js`)**

Voeg bij de imports toe:

```js
import { opmaakHtml, opmaakBalk } from "./opmaak.js";
```

Vervang in `kenmerkenKaart` de Bron-invoer (regel ~121):

```js
      <div class="opmaak-veld">
        <textarea id="kmk-bron" rows="2" placeholder="bv. splitsingsakte art. 17, mail gemeente 03-2024">${esc(k.bron)}</textarea>
        ${opmaakBalk()}
      </div>
```

Vervang in `kenmerkenKaart` de Bron-weergave (regel ~131):

```js
    <div class="kmk-bron">${k.bron?opmaakHtml(k.bron):'<span style="color:var(--mut)">Nog geen bron vastgelegd</span>'}</div>${wijz}`;
```

Vervang in `composerHtml` de textarea (regel ~175):

```js
    <div class="opmaak-veld">
      <textarea id="dos-tekst" data-code="${esc(code)}" rows="2" placeholder="Leg vast wat er gebeurd is — bv. zojuist gebeld met een eigenaar… (Ctrl+Enter = vastleggen)"></textarea>
      ${opmaakBalk()}
    </div>
```

- [ ] **Step 4: Sluit het logboek aan (`src/render-overig.js`)**

Voeg bij de imports toe:

```js
import { opmaakHtml, opmaakBalk } from "./opmaak.js";
```

Vervang in `logItemHtml` de notitieregel (regel ~309):

```js
    extra=`<div class="log-note">${opmaakHtml(r.nieuweWaarde)}</div>`;
```

Vervang in `logEditForm` de textarea (regel ~373):

```js
    <div class="opmaak-veld">
      <textarea class="log-edit-tekst" rows="2">${esc(r.nieuweWaarde||'')}</textarea>
      ${opmaakBalk()}
    </div>
```

Vervang in `renderTaskHistory` de notitieregel (regel ~580):

```js
        ${r.actie==='Opmerking'&&r.nieuweWaarde?`<div class="log-note">${opmaakHtml(r.nieuweWaarde)}</div>`:''}
```

- [ ] **Step 5: Sluit het opmerkingenveld in de taak-popup aan (`index.html`)**

Zoek `<textarea id="hist-note"` en zet het in een omhulsel:

```html
<div class="opmaak-veld">
  <textarea id="hist-note" ...bestaande attributen ongewijzigd...></textarea>
</div>
```

Het knoppenbalkje wordt hier via JS niet toegevoegd (statische HTML); plak in
plaats daarvan direct ná de textarea, binnen het omhulsel:

```html
  <div class="opmaak-balk">
    <button type="button" class="opmaak-knop" data-action="opmaak-vet" title="Vet (Ctrl+B)" aria-label="Vet"><b>B</b></button>
    <button type="button" class="opmaak-knop" data-action="opmaak-schuin" title="Schuin (Ctrl+I)" aria-label="Schuin"><i>I</i></button>
    <button type="button" class="opmaak-knop" data-action="opmaak-lijst" title="Opsomming" aria-label="Opsomming"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="4.5" cy="6.5" r="1.4" fill="currentColor" stroke="none"/><circle cx="4.5" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="4.5" cy="17.5" r="1.4" fill="currentColor" stroke="none"/><path d="M9 6.5h11M9 12h11M9 17.5h11"/></svg></button>
  </div>
```

- [ ] **Step 6: Draai de tests en controleer dat ze slagen**

Herlaad `?test=1`. Verwacht: `window._testResult.fail === 0`.

- [ ] **Step 7: Commit**

```bash
git add src/render-vve.js src/render-overig.js index.html src/tests.js && git commit -m "Opmaak: aangesloten op logboekveld, bewerkformulier, Bron en taaknotitie"
```

---

### Task 5: AI-context, inlogregel en opmaak (CSS)

**Files:**
- Modify: `src/ai.js:47`, `src/dossier-chat.js:45-46`
- Modify: `index.html:894` (inlogregel weg)
- Modify: `styles.css` (opmaakbalk, meegroeien, `<ul>` in notities)
- Test: `src/tests.js`

- [ ] **Step 1: Schrijf de falende test**

Voeg toe aan het opmaak-testblok in `src/tests.js`:

Plaats deze test direct ná de bestaande `_ctxInj`-test (rond regel 792), zodat hij
de daar al aanwezige fixtures kan hergebruiken:

```js
  // Opmaakmarkeringen horen niet in de AI-context: het model zou ze anders voorlezen.
  const _Dopm = { ntd:{OPPAKKEN:[],VERGADERVERZOEKEN:[],'OFFERTE-TRAJECTEN':[],LOD:[]},
    af:{OPPAKKEN:[],VERGADERVERZOEKEN:[],'OFFERTE-TRAJECTEN':[],LOD:[]},
    alvo:[{code:'OPM',naam:'VvE Opmaak',status:'Gepland',uitnodiging:false,notulen:false,begroting:false}], alfa:[],
    logboek:[{code:'OPM',timestamp:'2026-05-30T10:00:00.000Z',actie:'Contact',veld:'Telefoon',
      oudeWaarde:'Bestuur',nieuweWaarde:'dit is **dringend** en _stil_',gebruiker:'info@vvebeheercollectief.nl'}] };
  const _ctxOpm = dossierContextTekst('OPM', _Dopm, _Tchat);
  truthy('chat: context bevat geen opmaakmarkeringen', !_ctxOpm.includes('**') && !_ctxOpm.includes('_stil_'));
  truthy('chat: context houdt de tekst zelf wél', _ctxOpm.includes('dit is dringend en stil'));
```

- [ ] **Step 2: Draai de test en controleer dat hij faalt**

Herlaad `?test=1`. Verwacht: één FAIL-regel.

- [ ] **Step 3: Strip de markeringen in de AI-context**

In `src/dossier-chat.js`, voeg bij de imports toe:

```js
import { zonderOpmaak } from './opmaak.js';
```

Vervang regel 45-46 zo dat `r.nieuweWaarde` door `zonderOpmaak(...)` gaat:

```js
        ? `${r.veld || 'Contact'} met ${r.oudeWaarde || '?'}: ${zonderOpmaak(r.nieuweWaarde) || ''}`
        : `${r.actie}${r.nieuweWaarde ? ': ' + zonderOpmaak(r.nieuweWaarde) : ''}`;
```

In `src/ai.js`, voeg bij de imports toe:

```js
import { zonderOpmaak } from './opmaak.js';
```

En pas regel 47 aan:

```js
    .map(r=>`${fmtLogTs(r.timestamp)} — ${displayName(r.gebruiker)}: ${r.actie}${r.nieuweWaarde?' ('+zonderOpmaak(r.nieuweWaarde)+')':''}`);
```

- [ ] **Step 4: Haal de inlogregel weg in `index.html`**

Verwijder deze regel volledig:

```html
    <p style="font-size:13px;color:var(--mut);margin:0 0 24px">Log in met je VvE Beheer Collectief account</p>
```

En geef het logo eronder de marge die de weggehaalde regel had — vervang de
`<img>`-regel erboven door:

```html
    <img src="logo-login.png" alt="VvE Beheer Collectief" style="width:220px;margin:0 auto 28px;display:block"/>
```

- [ ] **Step 5: Voeg de opmaak toe aan `styles.css`**

Plak bij de andere logboek-stijlen (rond regel 548, na `.log-edit-tekst:focus…`):

```css
    /* Opmaakvelden: textarea + knoppenbalkje, hoogte groeit mee met de inhoud */
    .opmaak-veld{position:relative}
    .opmaak-veld textarea{display:block;min-height:66px;max-height:260px;overflow-y:auto;resize:none}
    .opmaak-balk{display:flex;gap:2px;margin-top:4px}
    .opmaak-knop{display:inline-flex;align-items:center;justify-content:center;width:26px;height:24px;border-radius:5px;background:none;border:1px solid transparent;color:var(--mut);font-size:12px;font-family:inherit;cursor:pointer;transition:background var(--tr),color var(--tr)}
    .opmaak-knop:hover{background:var(--sur2);color:var(--txt)}
    .opmaak-knop:focus-visible{outline:2px solid var(--ac);outline-offset:1px}
    /* Opsommingen binnen een notitie: pre-wrap uitzetten, anders krijg je dubbele witregels */
    .op-lijst{white-space:normal;margin:2px 0 2px 2px;padding-left:16px;list-style:disc}
    .op-lijst li{margin:1px 0}
```

- [ ] **Step 6: Draai de tests en controleer dat ze slagen**

Herlaad `?test=1`. Verwacht: `window._testResult.fail === 0`.

- [ ] **Step 7: Commit**

```bash
git add src/ai.js src/dossier-chat.js index.html styles.css src/tests.js && git commit -m "Opmaak: AI-context ontdaan van markeringen, inlogregel weg, opmaakbalk gestyled"
```

---

### Task 6: Visuele controle en uitrol

**Files:**
- Modify: `src/config.js` (`APP_VERSION` → `'8.4'`)
- Modify: `sw.js` (`CACHE_VERSION` → `'cd-v79'`)

- [ ] **Step 1: Visuele controle met het login-loze recept**

Open `http://localhost:8899/?test=1`, seed via de console een VvE-dossier
(modules dynamisch importeren, `D`/`state` vullen, `#login-gate` verbergen,
`renderVve()`), en controleer met de hand:

- het logboekveld groeit mee tijdens het typen en stopt met groeien rond 12 regels
- B, I en de lijstknop werken op een selectie én als schakelaar
- Ctrl+B en Ctrl+I doen hetzelfde
- een vastgelegde notitie met `**vet**` toont vet in de tijdlijn
- Bron onder de kenmerken toont opgeslagen opmaak
- het inlogscherm toont logo → knop → versie, zonder de weggehaalde regel

- [ ] **Step 2: Plakken testen in een echte browser**

Kopieer uit een e-mail of Word een stukje met vet en een opsomming, plak het in
het logboekveld. Verwacht: sterretjes/streepjes verschijnen in het veld, en na
vastleggen staat het als echte opmaak in de tijdlijn.

- [ ] **Step 3: Versie ophogen**

In `src/config.js`: `export const APP_VERSION = '8.4';`
In `sw.js`: `const CACHE_VERSION = 'cd-v79';`

- [ ] **Step 4: Volledige testsuite draaien**

Herlaad `?test=1`. Verwacht: `window._testResult.fail === 0` en een hoger
totaalaantal dan de 581 van vóór dit werk.

- [ ] **Step 5: Commit en uitrollen**

```bash
git add src/config.js sw.js && git commit -m "Versie 8.4 / cd-v79: opmaak in logboek en Bron, meegroeiende velden, inlogregel weg"
```

```bash
git checkout main && git merge --ff-only feature/opmaak-invoervelden && git push origin main
```

- [ ] **Step 6: Live controleren**

Open `https://vvebeheercollectief.github.io/Collectief-Dashboard/?test=1` (na de
Pages-deploy), controleer dat het versienummer 8.4 toont en dat
`window._testResult.fail === 0` op de live code.
