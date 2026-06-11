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
import { openSnoozeModal, snoozeKies } from './snooze.js';
import { openHerhaalModal, toggleHerhaalStatus, deleteHerhaal } from './render-herhaal.js';
import { openVvePagina, renderVve } from './render-vve.js';

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
  'herhaal-bewerken':      (el) => openHerhaalModal(+el.dataset.hid),
  'herhaal-status':        (el) => toggleHerhaalStatus(+el.dataset.hid),
  'herhaal-verwijderen':   ()   => deleteHerhaal(),
  'vve-open':              (el) => openVvePagina(el.dataset.code),
  'vve-af-alles':          ()   => { state._vveAfAlles=true; renderVve(); },
};

export function initActions() {
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const fn = ACTIONS[el.dataset.action];
    if (fn) fn(el, e);
  });
}
