// ══════════════════════════════════════
//  ACTIONS — centraal klik-systeem (Fase 2B)
//  Eén delegatie-listener; elementen dragen data-action="…" + data-attributen.
// ══════════════════════════════════════
import { pgs, state } from './state.js';
import {
  setNtd, renderNtd, setAf, renderAf, renderAlvo, toggleAlvoFlag, renderAlfa,
} from './render-lijsten.js';
import {
  setOntw, renderOntw, editOntwItem, addTaskNote, renderLogboek,
} from './render-overig.js';
import { openModal, completeTask, deleteCurrentEditTask } from './crud.js';
import { adjOff } from './util.js';
import { copyAiPrompt, aiOvernemen, aiActieTaak, aiKopieerConcept } from './ai.js';
import { dismissToast, saveNotifPrefs } from './notifications.js';
import { doLogin } from './auth.js';
import { openSnoozeModal, snoozeKies, snoozeMorgen } from './snooze.js';
import { openOfferteActieModal, offerteActieVastleggen } from './offerte-acties.js';
import { addAannemer, toggleAannemerBinnen, verwijderAannemer } from './offerte-aannemers.js';
import { openHerhaalModal, toggleHerhaalStatus, deleteHerhaal } from './render-herhaal.js';
import { openVvePagina, renderVve, addContactLog } from './render-vve.js';
import { saveKenmerken } from './kenmerken.js';
import { palKies } from './palette.js';
import { toggleBulkMode, bulkVink, toggleBulkMenu, bulkDoe } from './bulk.js';

const PAG_RENDER = { ntd:renderNtd, af:renderAf, alvo:renderAlvo, alfa:renderAlfa, ontw:renderOntw, logboek:renderLogboek };

export const ACTIONS = {
  'toggle':                (el) => el.classList.toggle('on'),
  'notif-toggle':          (el) => { el.classList.toggle('on'); saveNotifPrefs(); },
  'off':                   (el) => adjOff(el.dataset.off, +el.dataset.delta),
  'notitie-toevoegen':     ()   => addTaskNote(),
  'taak-verwijder-modal':  ()   => deleteCurrentEditTask(),
  'ai-kopieer':            (el) => copyAiPrompt(el.dataset.waar),
  'login':                 ()   => doLogin(),
  'ntd-sectie':            (el) => setNtd(el.dataset.sec),
  'af-sectie':             (el) => setAf(el.dataset.sec),
  'alvo-flag':             (el) => toggleAlvoFlag(+el.dataset.idx, el.dataset.field),
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
  'offerte-nabellen':       (el) => openOfferteActieModal(+el.dataset.rid,'nabellen'),
  'offerte-doorsturen':     (el) => openOfferteActieModal(+el.dataset.rid,'doorsturen'),
  'offerte-actie-vastleggen': ()  => offerteActieVastleggen(),
  'offerte-later':         (el) => snoozeMorgen(+el.dataset.rid),
  'offerte-meer-d':        ()   => { state.offerteDoorsturenOpen=true; renderNtd(); },
  'offerte-meer-n':        ()   => { state.offerteNabellenOpen=true;   renderNtd(); },
  'offerte-tabel-toggle':  ()   => { state.offerteTabelOpen=!state.offerteTabelOpen; renderNtd(); },
  'offerte-aann-open':     (el) => { const c=el.dataset.code; if(state.offerteAannOpen.has(c)){ state.offerteAannOpen.delete(c); if(!state.offerteAannMut.has(c)) delete state.offerteAannSnap[c]; } else state.offerteAannOpen.add(c); renderNtd(); },
  'offerte-aann-binnen':   (el) => toggleAannemerBinnen(el.dataset.code, +el.dataset.idx),
  'offerte-aann-verwijder':(el) => verwijderAannemer(el.dataset.code, +el.dataset.idx),
  'offerte-aann-add':      (el) => { const inp=el.closest('.of-aann-add')?.querySelector('.of-aann-input'); if(!inp) return; const v=inp.value; inp.value=''; addAannemer(el.dataset.code, v); },
  'herhaal-bewerken':      (el) => openHerhaalModal(+el.dataset.hid),
  'herhaal-status':        (el) => toggleHerhaalStatus(+el.dataset.hid),
  'herhaal-verwijderen':   ()   => deleteHerhaal(),
  'vve-open':              (el) => openVvePagina(el.dataset.code),
  'vve-af-alles':          ()   => { state._vveAfAlles=true; renderVve(); },
  'pal-kies':              (el) => palKies(+el.dataset.idx),
  'bulk-toggle':           ()   => toggleBulkMode(),
  'bulk-vink':             (el) => bulkVink(+el.dataset.rid),
  'bulk-menu':             (el) => toggleBulkMenu(el.dataset.menu),
  'bulk-doe':              (el) => bulkDoe(el),
  'kenmerken-bewerken':    ()   => { state.kenmerkenEdit=true; renderVve(); },
  'kenmerken-opslaan':     ()   => saveKenmerken(),
  'kenmerken-annuleren':   ()   => { state.kenmerkenEdit=false; renderVve(); },
  'contact-soort':         (el) => { state._contactSoort=el.dataset.soort;
    document.querySelectorAll('.soort-chip').forEach(c=>c.classList.toggle('aan',c.dataset.soort===el.dataset.soort)); },
  'contact-vastleggen':    ()   => addContactLog(),
  'vve-log-filter':        (el) => { state.vveLogFilter=el.dataset.modus; state._vveLogAlles=false; renderVve(); },
  'vve-log-alles':         ()   => { state._vveLogAlles=true; renderVve(); },
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
      const code = e.target.dataset.code, val = e.target.value;
      e.target.value = '';
      addAannemer(code, val);
    }
  });
}
