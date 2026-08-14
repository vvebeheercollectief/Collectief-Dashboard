// ══════════════════════════════════════
//  ACTIONS — centraal klik-systeem (Fase 2B)
//  Eén delegatie-listener; elementen dragen data-action="…" + data-attributen.
// ══════════════════════════════════════
import { pgs, state, D } from './state.js';
import { bouwBundelIndex, zichtbareKop, volgendeVolg, bundelSleutel } from './bundel.js';
import {
  setNtd, renderNtd, renderNtdStats, setAf, renderAf, renderAlvo, toggleAlvoFlag, renderAlfa,
  kopOpen, zetKopOpen, toggleBundel, springNaarBundel,
} from './render-lijsten.js';
import {
  setOntw, renderOntw, editOntwItem, addTaskNote, renderLogboek,
  editLogboek, saveLogboek, cancelLogboek, setLogSoort, deleteLogboek,
} from './render-overig.js';
import { openModal, completeTask, completeCurrentEditTask, deleteCurrentEditTask, zetSubsidieFase, kiesModalFase } from './crud.js';
import { adjOff } from './util.js';
import { copyAiPrompt, aiOvernemen, aiActieTaak, aiKopieerConcept, prefillNieuweTaak } from './ai.js';
import { dismissToast, saveNotifPrefs } from './notifications.js';
import { doLogin } from './auth.js';
import { openSnoozeModal, snoozeKies } from './snooze.js';
import { openResetModal, closeResetModal, doeReset } from './alv-reset.js';
import { addAannemer, toggleAannemerBinnen, verwijderAannemer } from './offerte-aannemers.js';
import { openHerhaalModal, toggleHerhaalStatus, deleteHerhaal } from './render-herhaal.js';
import { openVvePagina, renderVve, addContactLog, terugVanDossier } from './render-vve.js';
import { vraagChat, chatSuggestie } from './dossier-chat.js';
import { saveKenmerken } from './kenmerken.js';
import { palKies, closePalette } from './palette.js';
import { toggleBulkMode, bulkVink, toggleBulkMenu, bulkDoe } from './bulk.js';
import { doeOpmaak, initOpmaak } from './opmaak.js';

const PAG_RENDER = { ntd:renderNtd, af:renderAf, alvo:renderAlvo, alfa:renderAlfa, ontw:renderOntw, logboek:renderLogboek };

export const ACTIONS = {
  'toggle':                (el) => { el.setAttribute('aria-checked', el.classList.toggle('on')); },
  'notif-toggle':          (el) => { el.setAttribute('aria-checked', el.classList.toggle('on')); saveNotifPrefs(); },
  'off':                   (el) => adjOff(el.dataset.off, +el.dataset.delta),
  // Fase-bolletje in een tabelrij: schrijft meteen weg naar kolom D.
  'subsidie-fase':         (el) => zetSubsidieFase(+el.dataset.rid, +el.dataset.fase),
  // Hetzelfde bolletje in het bewerkscherm: zet alleen de lokale stand; pas bij
  // Opslaan gaat het naar de Sheet.
  'subsidie-fase-modal':   (el) => kiesModalFase(+el.dataset.fase),
  'notitie-toevoegen':     ()   => addTaskNote(),
  'taak-verwijder-modal':  ()   => deleteCurrentEditTask(),
  'taak-afronden-modal':   ()   => completeCurrentEditTask(),
  'ai-kopieer':            (el) => copyAiPrompt(el.dataset.waar),
  'login':                 ()   => doLogin(),
  'ntd-sectie':            (el) => setNtd(el.dataset.sec),
  'ntd-sorteer':           (el) => { const k=el.dataset.key, s=state.ntdSort;
                                     state.ntdSort = s.key!==k ? {key:k,asc:true} : s.asc ? {key:k,asc:false} : {key:null,asc:true};
                                     pgs.ntd=1; renderNtd(); },
  'af-sectie':             (el) => setAf(el.dataset.sec),
  'alvo-flag':             (el) => toggleAlvoFlag(+el.dataset.idx, el.dataset.field),
  'alvo-reset-open':       ()   => openResetModal(),
  'alvo-reset-annuleer':   ()   => closeResetModal(),
  'alvo-reset-doe':        ()   => doeReset(),
  'alvo-stat':             (el) => { const f=document.getElementById('f-status-alvo');
                                     f.value = f.value===el.dataset.status ? '' : el.dataset.status;
                                     pgs.alvo=1; renderAlvo(); },
  'ntd-stat':              (el) => { const s=el.dataset.status;
                                     state.ntdStatus = state.ntdStatus===s ? '' : s;
                                     pgs.ntd=1; renderNtd(); renderNtdStats(); },
  'ntd-kop-toggle':        ()   => zetKopOpen(!kopOpen()),
  // Chevron op de kop-rij van een bundel, en het ⛓-merkje op een lid ervan. Allebei niets meer dan
  // de sleutel doorgeven: het normaliseren én het omschakelen gebeuren in render-lijsten.js, zodat
  // lezen en schrijven van `state.bundelOpen` gegarandeerd dezelfde sleutel gebruiken.
  'bundel-toggle':         (el) => toggleBundel(el.dataset.bundel),
  'bundel-spring':         (el) => springNaarBundel(el.dataset.bundel),
  // '+ Voeg een subtaak toe' onderaan het bundelpaneel: het gewone toevoegscherm, met de VvE van
  // de kop al ingevuld (§6.1). De index vers uit D en niet uit de laatste render: die momentopname
  // kan van vóór de laatste poll zijn (zelfde afweging als springNaarBundel).
  // Bewust `.get()` en niet `bundelMetId`: die eist twee leden, en een bundel die tot één lid
  // gekrompen is mag hier júist nog een subtaak krijgen — dan is het weer een bundel.
  'bundel-nieuw':          (el) => {
    const id = bundelSleutel(el.dataset.bundel);
    const leden = id ? bouwBundelIndex(D.ntd, D.af).get(id) : null;
    const kop = leden && zichtbareKop(leden);
    // Geen open lid meer (alles afgerond, of de bundel is weg): dan is er geen VvE om het scherm
    // mee te vullen en valt er niets toe te voegen. De eerstvolgende render haalt dit paneel toch
    // weg — de knop kan alleen in een verouderd scherm nog aangeklikt worden.
    if (!kop) return;
    // Eerst het scherm openen, dán onthouden waar de nieuwe taak bij hoort: prefillNieuweTaak gaat
    // via openModal(false) langs clearModal, en die wist deze vlag juist (crud.js). Andersom zou
    // hij meteen weer weg zijn en belandde de subtaak als losse taak in de Sheet — zonder fout,
    // alleen zichtbaar aan een lege kolom R.
    prefillNieuweTaak('', kop.r.code, kop.r.naam, '');
    state._nieuwBundel = { bundelId: id, volg: volgendeVolg(leden) };
  },
  'taak-bewerken':         (el) => openModal(true, state._rowCache[+el.dataset.rid]),
  'taak-afronden':         (el) => completeTask(+el.dataset.rid),
  'pagineer':              (el) => { const d=el.dataset.doel; pgs[d]=+el.dataset.pg; PAG_RENDER[d](); },
  'ai-overnemen':          (el) => aiOvernemen(el.dataset.sec),
  'ai-actie-taak':         (el) => aiActieTaak(el),
  'ai-kopieer-concept':    (el) => aiKopieerConcept(el),
  'ontw-cat':              (el) => setOntw(el.dataset.cat),
  'ontw-bewerken':         (el) => editOntwItem(+el.dataset.rid),
  'toast-sluiten':         (el) => dismissToast(el.closest('.toast')),
  'taak-wegleggen':        (el) => openSnoozeModal(+el.dataset.rid),
  'snooze-kies':           (el) => snoozeKies(+el.dataset.dagen),
  // data-aann = de traject-sleutel (vast taaknummer), niet de VvE-code: twee offerte-trajecten
  // van dezelfde VvE moeten los van elkaar open/dicht kunnen en los beschreven worden.
  'offerte-aann-open':     (el) => { const s=el.dataset.aann; if(state.offerteAannOpen.has(s)) state.offerteAannOpen.delete(s); else state.offerteAannOpen.add(s); renderNtd(); },
  'offerte-aann-binnen':   (el) => toggleAannemerBinnen(el.dataset.aann, +el.dataset.idx),
  'offerte-aann-verwijder':(el) => verwijderAannemer(el.dataset.aann, +el.dataset.idx),
  'offerte-aann-add':      (el) => { const inp=el.closest('.of-aann-add')?.querySelector('.of-aann-input'); if(!inp) return; const v=inp.value; inp.value=''; addAannemer(el.dataset.aann, v); },
  'herhaal-bewerken':      (el) => openHerhaalModal(+el.dataset.hid),
  'herhaal-status':        (el) => toggleHerhaalStatus(+el.dataset.hid),
  'herhaal-verwijderen':   ()   => deleteHerhaal(),
  // closePalette eerst: klik je in Ctrl+K op een VvE-code (bv. in een logboekresultaat), dan
  // bleef het zoekvenster anders over het geopende dossier heen staan. No-op als het dicht is.
  'vve-open':              (el) => { closePalette(); openVvePagina(el.dataset.code); },
  'vve-terug':             ()   => terugVanDossier(),
  'vve-taak-nieuw':        (el) => openModal(false, null, {sec:'OPPAKKEN', code:el.dataset.code, naam:el.dataset.naam||''}),
  'vve-af-alles':          ()   => { state._vveAfAlles=true; renderVve(); },
  'pal-kies':              (el) => palKies(+el.dataset.idx),
  'bulk-toggle':           ()   => toggleBulkMode(),
  'bulk-vink':             (el) => bulkVink(+el.dataset.rid),
  'bulk-menu':             (el) => toggleBulkMenu(el.dataset.menu),
  'bulk-doe':              (el) => bulkDoe(el),
  'composer-openen':       ()   => { state.dosComposerOpen=true; renderVve();
    setTimeout(()=>document.getElementById('dos-tekst')?.focus(),0); },
  'kenmerken-bewerken':    ()   => { state.kenmerkenEdit=true; renderVve(); },
  'kenmerken-opslaan':     ()   => saveKenmerken(),
  'kenmerken-annuleren':   ()   => { state.kenmerkenEdit=false; renderVve(); },
  'contact-soort':         (el) => { state._contactSoort=el.dataset.soort;
    // Alleen de chips van de composer zelf: een open logregel-bewerkformulier heeft
    // eigen soort-chips (log-soort) die hier niet mogen meekleuren.
    el.closest('.dos-composer')?.querySelectorAll('.soort-chip')
      .forEach(c=>c.classList.toggle('aan',c.dataset.soort===el.dataset.soort)); },
  'contact-vastleggen':    ()   => addContactLog(),
  'vve-log-filter':        (el) => { state.vveLogFilter=el.dataset.modus; state._vveLogAlles=false; renderVve(); },
  'vve-log-alles':         ()   => { state._vveLogAlles=true; renderVve(); },
  'chat-send':             ()   => vraagChat(),
  'chat-suggest':          (el) => chatSuggestie(el.dataset.q),
  'log-bewerken':          (el) => editLogboek(+el.dataset.row),
  'log-opslaan':           (el) => saveLogboek(+el.dataset.row, el.closest('.log-edit')),
  'log-annuleren':         ()   => cancelLogboek(),
  'log-soort':             (el) => setLogSoort(el.dataset.soort),
  'log-verwijderen':       (el) => deleteLogboek(+el.dataset.row),
  'opmaak-vet':            (el) => doeOpmaak(el,'vet'),
  'opmaak-schuin':         (el) => doeOpmaak(el,'schuin'),
  'opmaak-lijst':          (el) => doeOpmaak(el,'lijst'),
};

export function initActions() {
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const fn = ACTIONS[el.dataset.action];
    if (fn) fn(el, e);
  });
  // Ctrl/Cmd+Enter in de dossier-composer = contactmoment vastleggen
  // (delegatie op document-niveau: het element wordt bij elke render opnieuw aangemaakt)
  document.addEventListener('keydown', (e) => {
    if (e.target && e.target.id === 'dos-tekst' && (e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault(); addContactLog();
    }
    // Offerte-aannemer toevoegen: Enter in het inline invoerveld (delegatie: veld leeft kort)
    if (e.target && e.target.classList && e.target.classList.contains('of-aann-input') && e.key === 'Enter') {
      e.preventDefault();
      const sleutel = e.target.dataset.aann, val = e.target.value;
      e.target.value = '';
      addAannemer(sleutel, val);
    }
    // Chat-agent: Enter in het vraagveld = versturen
    if (e.target && e.target.id === 'chat-input' && e.key === 'Enter') {
      e.preventDefault();
      vraagChat();
    }
    // Logboek bewerken: Ctrl/Cmd+Enter in de edit-textarea = opslaan
    // (class-check: het veld heeft bewust geen id meer — het rendert op twee pagina's)
    if (e.target && e.target.classList && e.target.classList.contains('log-edit-tekst') && (e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      const box = e.target.closest('.log-edit');
      if (box) saveLogboek(+box.dataset.row, box);
    }
  });
  initOpmaak();
}
