// ══════════════════════════════════════
//  WEEKKIEZER — het veld 'Periode' bij Vergaderverzoeken
// ══════════════════════════════════════
// 'Periode' was een leeg tekstvak met de hint "bv. Mei, Juni", en dat leverde zes
// schrijfwijzen van hetzelfde op: sept/okt, Sept/okt, sept/oktober, eind juli,
// '21 september …'. Nu kies je een WEEK uit een lijst en typ je niets meer.
//
// DE OPZET, en waarom hij zo is:
//
//   1. `#m-per` blijft bestaan als VERBORGEN invoerveld en draagt de waarde. Alles wat
//      met dit veld werkt leest of schrijft `.value` — `fillModalFields` (setv), de
//      opslag (`gv('m-per')`), de wijzigingsvergelijking (`verschilVelden`) en
//      `clearModal`. Door het veld te laten staan hoefde geen van die vier iets te
//      weten van deze kiezer. De knop en het paneel liggen er alleen bovenop.
//
//   2. De opties zijn GEEN knoppen maar `<div role="option">`. Een knop komt in de
//      tabvolgorde, en dus ook in de focusval van het bewerkscherm (modal-a11y.js):
//      met Tab liep je dan door achtendertig weken heen in plaats van naar het volgende
//      veld. Dit is het gewone combobox-patroon — de focus blijft op de knop en
//      `aria-activedescendant` wijst de actieve optie aan. Zelfde afweging als in
//      vve-zoekveld.js, daar staat hij uitgebreider.
//
//   3. Een OUDE waarde ('sept/okt') blijft gewoon staan en wordt getoond zoals hij is.
//      Er wordt niets herschreven in de Sheet; kiest de gebruiker een week, dan pas
//      verdwijnt de oude tekst. Zolang dat niet gebeurt is de taak ongewijzigd.
import { esc, weekOpties, parseWeekPeriode } from './util.js';

const ID = { veld:'m-per', knop:'m-per-knop', label:'m-per-label', paneel:'m-per-paneel' };
// Twaalf weken terug (een kwartaal, genoeg om een vergadering achteraf vast te leggen)
// en zesentwintig vooruit (een half jaar) — de gebruiker koos die combinatie.
const TERUG = 12, VOORUIT = 26;

let _opties = [];
let _actief = -1;          // aangewezen optie bij toetsenbordbediening (-1 = geen)
let _gestart = false;

const el = id => document.getElementById(id);
const open = () => el(ID.knop)?.getAttribute('aria-expanded') === 'true';

// ── Wat er in de knop staat ──────────────────────────────────────────────────
function tekenLabel(){
  const l = el(ID.label); if(!l) return;
  const waarde = el(ID.veld)?.value || '';
  const w = parseWeekPeriode(waarde);
  if(w){
    l.className = 'wk-huidig';
    l.innerHTML = `<b>Week ${w.nr}</b><span>${esc(w.dagen)} ${w.jaar}</span>`;
  } else if(waarde){
    // Oude, met de hand getypte waarde. Bewust herkenbaar anders: dan zie je meteen
    // dat er nog geen week gekozen is, zonder dat de waarde verdwijnt.
    l.className = 'wk-huidig wk-oud';
    l.innerHTML = `<b>${esc(waarde)}</b><span>nog geen week gekozen</span>`;
  } else {
    l.className = 'wk-huidig wk-leeg';
    l.textContent = 'Kies een week…';
  }
}

// ── Het paneel ───────────────────────────────────────────────────────────────
function paneelHtml(){
  const waarde = el(ID.veld)?.value || '';
  let html = '', vorigeMaand = '';
  _opties.forEach((o,i) => {
    if(o.maandKop !== vorigeMaand){
      html += `<div class="wk-maand">${esc(o.maandKop)}</div>`;
      vorigeMaand = o.maandKop;
    }
    const gekozen = waarde === o.waarde;
    html += `<div role="option" id="wk-opt-${i}" data-i="${i}"`
          + ` class="wk-optie${o.deze ? ' deze' : ''}${o.verleden ? ' terug' : ''}${gekozen ? ' aan' : ''}"`
          + ` aria-selected="${gekozen}">`
          + `<span class="wknr">Week ${o.nr}</span>`
          + `<span class="wkdg">${esc(o.lang)}</span></div>`;
  });
  return html;
}

function wijsAan(i, scroll){
  const p = el(ID.paneel); if(!p) return;
  _actief = Math.max(0, Math.min(_opties.length - 1, i));
  p.querySelectorAll('.wk-optie.hier').forEach(e => e.classList.remove('hier'));
  const doel = p.querySelector(`#wk-opt-${_actief}`);
  if(doel){
    doel.classList.add('hier');
    el(ID.knop)?.setAttribute('aria-activedescendant', doel.id);
    if(scroll !== false) doel.scrollIntoView({ block:'nearest' });
  }
}

function zetOpen(aan){
  const knop = el(ID.knop), paneel = el(ID.paneel);
  if(!knop || !paneel) return;
  knop.setAttribute('aria-expanded', aan ? 'true' : 'false');
  paneel.hidden = !aan;
  if(!aan){ knop.removeAttribute('aria-activedescendant'); _actief = -1; return; }
  // De lijst wordt bij élke opening opnieuw opgebouwd: 'deze week' schuift op zodra de
  // dag wisselt, en het dashboard blijft dagen achtereen openstaan.
  _opties = weekOpties({ terug:TERUG, vooruit:VOORUIT });
  paneel.innerHTML = paneelHtml();
  const gekozenEl = paneel.querySelector('.wk-optie.aan');
  const dezeEl = paneel.querySelector('.wk-optie.deze');
  const start = gekozenEl || dezeEl;
  wijsAan(start ? +start.dataset.i : TERUG, false);
  start?.scrollIntoView({ block:'center' });
}

function kies(i){
  const o = _opties[i]; if(!o) return;
  const veld = el(ID.veld); if(!veld) return;
  veld.value = o.waarde;
  // Handmatig een input-gebeurtenis: al wie op wijzigingen in dit scherm let (de
  // dubbelklik-rem, de 'niet-opgeslagen wijzigingen'-vraag) luistert daarop, en een
  // waarde die vanuit code gezet wordt vuurt die uit zichzelf niet af.
  veld.dispatchEvent(new Event('input', { bubbles:true }));
  tekenLabel();
  zetOpen(false);
  el(ID.knop)?.focus();
}

// ── Aanhaken ─────────────────────────────────────────────────────────────────
function initWeekKiezer(){
  const knop = el(ID.knop), paneel = el(ID.paneel);
  if(!knop || !paneel || _gestart) return;
  _gestart = true;

  knop.addEventListener('click', () => zetOpen(!open()));

  paneel.addEventListener('mousedown', e => e.preventDefault());  // focus blijft op de knop
  paneel.addEventListener('click', e => {
    const o = e.target.closest('.wk-optie');
    if(o) kies(+o.dataset.i);
  });

  knop.addEventListener('keydown', e => {
    const k = e.key;
    if(!open()){
      if(k === 'ArrowDown' || k === 'ArrowUp' || k === 'Enter' || k === ' '){
        e.preventDefault(); zetOpen(true);
      }
      return;
    }
    if(k === 'Escape'){ e.preventDefault(); e.stopPropagation(); zetOpen(false); return; }
    if(k === 'Enter' || k === ' '){ e.preventDefault(); kies(_actief); return; }
    if(k === 'ArrowDown'){ e.preventDefault(); wijsAan(_actief + 1); return; }
    if(k === 'ArrowUp'){ e.preventDefault(); wijsAan(_actief - 1); return; }
    if(k === 'Home'){ e.preventDefault(); wijsAan(0); return; }
    if(k === 'End'){ e.preventDefault(); wijsAan(_opties.length - 1); return; }
    if(k === 'PageDown'){ e.preventDefault(); wijsAan(_actief + 5); return; }
    if(k === 'PageUp'){ e.preventDefault(); wijsAan(_actief - 5); return; }
    if(k === 'Tab'){ zetOpen(false); }    // niet blokkeren: Tab hoort door te lopen
  });

  // Buiten het veld klikken sluit. Op `mousedown` en niet op `click`, want het paneel
  // dooft zijn eigen mousedown en een klik elders zou anders pas ná de muisknop-op
  // aankomen — dan verschuift de pagina eerst nog onder de cursor.
  document.addEventListener('mousedown', e => {
    if(open() && !e.target.closest('.wk-veld')) zetOpen(false);
  });
}

// Aangeroepen door fillModalFields en clearModal, ná het zetten van `#m-per`.
function zetWeekKiezer(){
  zetOpen(false);
  tekenLabel();
}

export { initWeekKiezer, zetWeekKiezer, TERUG, VOORUIT };
