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
import { openModal, completeTask, completeCurrentEditTask, deleteCurrentEditTask, zetSubsidieFase, kiesModalFase, zetHoortBij, taakUitCache, renderExtraVves, herzieAlsSubtaak, _bewerkRijVers, offerteAanvraagGewijzigd } from './crud.js';
import { ontkoppelTaak } from './bundel-acties.js';
import { modalAannemerAdd, modalAannemerBinnen, modalAannemerWeg } from './modal-aannemers.js';
import { copyAiPrompt, aiOvernemen, aiActieTaak, aiKopieerConcept, prefillNieuweTaak } from './ai.js';
import { dismissToast, saveNotifPrefs, showToast } from './notifications.js';
import { doLogin } from './auth.js';
import { openSnoozeModal, snoozeKies } from './snooze.js';
import { zetInBehandeling } from './inbehandeling.js';
import { verwijderExtraVve } from './meervve.js';
import { openResetModal, closeResetModal, doeReset } from './alv-reset.js';
import { addAannemer, toggleAannemerBinnen, verwijderAannemer, startHernoem, stopHernoem } from './offerte-aannemers.js';
import { openHerhaalModal, toggleHerhaalStatus, deleteHerhaal } from './render-herhaal.js';
import { openVvePagina, renderVve, addContactLog, terugVanDossier } from './render-vve.js';
import { vraagChat, chatSuggestie } from './dossier-chat.js';
import { saveKenmerken } from './kenmerken.js';
import { palKies, closePalette } from './palette.js';
import { toggleBulkMode, bulkVink, bulkAlles, toggleBulkMenu, bulkDoe } from './bulk.js';
import { doeOpmaak, initOpmaak } from './opmaak.js';

const PAG_RENDER = { ntd:renderNtd, af:renderAf, alvo:renderAlvo, alfa:renderAlfa, ontw:renderOntw, logboek:renderLogboek };

export const ACTIONS = {
  'toggle':                (el) => { el.setAttribute('aria-checked', el.classList.toggle('on')); },
  'notif-toggle':          (el) => { el.setAttribute('aria-checked', el.classList.toggle('on')); saveNotifPrefs(); },
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
  'alvo-flag':             (el) => toggleAlvoFlag(+el.dataset.idx, el.dataset.field, el.dataset.code),
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
  // Chevron op de kop-rij van een bundel, en het bundel-merkje op een lid ervan. Allebei niets meer dan
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
    // mee te vullen en valt er niets toe te voegen. Wél melden, precies zoals `springNaarBundel`
    // op ditzelfde paneel doet: de eerstvolgende render haalt dit paneel weg, maar tot die render
    // staat de knop gewoon in beeld, en een knop die zonder één woord niets doet leest als een
    // kapot dashboard. Twee knoppen op hetzelfde paneel horen zich daarin hetzelfde te gedragen.
    if (!kop){
      showToast('Deze bundel bestaat niet meer',
                'Alles erin is afgerond of weg — er is niets om een subtaak onder te hangen.',
                null, 'label', { geenSysteemmelding:true, geenDedup:true });
      return;
    }
    // De categorie is een KEUZE van de gebruiker; deze knop zet hem alleen voor. Stond hier een
    // lege sectie, dan maakte `prefillNieuweTaak` er OPPAKKEN van (zie de terugval in ai.js) en was
    // juist het hoofdvoorbeeld uit het ontwerp — een offerte-traject onder een vergaderverzoek
    // (§1) — via deze knop niet te maken. Wijzigen kan in het scherm zelf, met de categorie-kiezer
    // die alleen bij toevoegen verschijnt (zetSectieKiezer in crud.js).
    // Beginwaarde is de sectie van de ZICHTBARE KOP. Dat is het tabblad waarin dit paneel getekend
    // staat, dus de knop begint met hetzelfde formulier als '+ Nieuwe taak' op die lijst. Uit
    // `kop.r` en niet uit `state.activeNtd`, omdat dit dezelfde verse index is die ook code en naam
    // levert: is de kop tussen tekenen en klikken doorgeschoven naar een ander tabblad (§3.3), dan
    // hoort het scherm bij díe taak en niet bij het tabblad dat nog op het scherm staat.
    //
    // Eerst het scherm openen, dán onthouden waar de nieuwe taak bij hoort: prefillNieuweTaak gaat
    // via openModal(false) langs clearModal, en die wist deze vlag juist (crud.js). Andersom zou
    // hij meteen weer weg zijn en belandde de subtaak als losse taak in de Sheet — zonder fout,
    // alleen zichtbaar aan een lege kolom R.
    prefillNieuweTaak(kop.r._sec, kop.r.code, kop.r.naam, '');
    state._nieuwBundel = { bundelId: id, volg: volgendeVolg(leden) };
    // …en pas nu het scherm bijstellen. Alles wat ín openModal op deze vlag kijkt, keek er te
    // vroeg naar: het blok 'Ook voor andere VvE's' bleef staan (en maakte er losse taken naast)
    // en de subtaak kreeg alsnog een voorgestelde deadline. Zie herzieAlsSubtaak in crud.js.
    herzieAlsSubtaak(kop.r._sec);
  },
  // Het kruisje achter 'Hoort bij' in het bewerkscherm. Twee standen, en het verschil is
  // wezenlijk: staat er een nog niet opgeslagen KEUZE, dan valt er nog niets te ontkoppelen —
  // dan wordt alleen die keuze losgelaten en toont het veld weer de werkelijke stand. Anders is
  // dit een echte schrijfactie die R en S van deze rij leegmaakt (kolom Q blijft staan).
  'bundel-ontkoppel':      async ()   => {
    // De `_hbDoel`-tak eerst en op het RAUWE object: die raakt de Sheet niet en hoort ook te
    // werken als de rij niet meer terug te vinden is.
    if (state._hbDoel){ zetHoortBij(state.editRowData); return; }
    // Voor de ECHTE schrijfactie de rij vers opzoeken, net als de drie andere knoppen in dit
    // venster (Opslaan, Afronden, Verwijderen). De stille resync remt niet op een open scherm, dus
    // `state.editRowData` kan naar een rij-object wijzen dat een verse parse allang vervangen
    // heeft — en dan zou `ontkoppelTaak` kolom R en S van een verouderd rijnummer leegmaken.
    const r = _bewerkRijVers();
    if (!r) return;   // _bewerkRijVers toont zelf al een melding
    // Het veld NIET vooruit leegmaken. `ontkoppelTaak` heeft vier redenen om niets te doen — de
    // offline-/cache-rem, een mislukte login, een rij zonder rijnummer, een afgeronde taak — en
    // keert dan terug zonder de taak te muteren. Een vooraf leeggemaakt veld zou tegelijk met
    // 'er is niets gewijzigd' beweren dat de taak los is. `zetHoortBij` leidt de stand af uit D
    // en klopt daarom in beide richtingen; hij keert terug zodra de optimistische mutatie staat,
    // dus bij een geslaagde actie is het veld nog steeds meteen leeg.
    //
    // De peiling gebeurt twee keer: zodra de optimistische mutatie staat, en nog eens ná de
    // schrijfactie zelf. Die tweede is nodig omdat een mislukte write de rollback bundelId laat
    // terugzetten en `backgroundWrite` het dashboard opnieuw tekent — maar een openstaand venster
    // valt buiten die render, dus zonder tweede peiling blijft het veld liegen.
    //
    // Beide keren met dezelfde twee remmen, in één helper zodat ze niet uit de pas kunnen lopen.
    // Het venster waarin ze nodig zijn begint al bij de klik, niet pas bij de write: ontkoppelTaak
    // wacht vóór zijn eerste mutatie op `ensureToken`, en die valt bij een verlopen of aflopend
    // token door naar `doOAuth` (auth.js) — een netwerkronde, geen microtask. Wat er in dat venster
    // kan gebeuren:
    //  · een ánder scherm. Ctrl+K werkt over een open modal heen (palette.js opent zonder
    //    modal-guard), dus een treffer 'Open taken' zet hier een andere taak in beeld. Zonder rem
    //    schrijft de peiling de stand van DEZE taak in dát scherm.
    //  · een verse keuze in 'Hoort bij'. Die is jonger dan de peiling en hoort te winnen:
    //    `zetHoortBij` wist als eerste `state._hbDoel` en zet het veld daarna op de werkelijke
    //    stand — de gebruiker ziet zijn zojuist aangewezen taak dus onder zijn vingers uit het
    //    veld verdwijnen, en Opslaan koppelt niets.
    const ververs = () => { if (state.editRowData === r && !state._hbDoel) zetHoortBij(r); };
    await ontkoppelTaak(r);
    ververs();
    await state._writeChain;
    ververs();
  },
  // Dezelfde null-controle als 'taak-afronden' en 'taak-wegleggen' hierboven. De rij-cache wordt
  // bij elke hertekening opnieuw opgebouwd; klik je op een knop uit een net vervangen render (of
  // op een rij die door de poll uit de lijst is gevallen), dan is dit `undefined` en liep openModal
  // stuk op `rowData._sec` — een lege pagina met een console-fout in plaats van een uitleg.
  'taak-bewerken':         (el) => { const r=taakUitCache(el.dataset.rid); if(r) openModal(true, r); },
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
  // Klik op de naam = naam aanpassen. De knop maakt plaats voor een invoerveld; opslaan gebeurt
  // met Enter of door ergens anders te klikken (zie de toetsen- en blur-afhandeling hieronder).
  'offerte-aann-hernoem':  (el) => startHernoem(el.dataset.aann, +el.dataset.idx),
  'offerte-aann-add':      (el) => { const inp=el.closest('.of-aann-add')?.querySelector('.of-aann-input'); if(!inp) return; const v=inp.value; inp.value=''; addAannemer(el.dataset.aann, v); },
  // Zelfde lijst, maar dan in het aanmaak-/bewerkscherm: mutaties op de WERKKOPIE
  // (modal-aannemers.js), er wordt pas bij Opslaan geschreven.
  'maann-binnen':          (el) => modalAannemerBinnen(+el.dataset.idx),
  'maann-weg':             (el) => modalAannemerWeg(+el.dataset.idx),
  'maann-add':             ()   => { const inp=document.getElementById('m-aann-input'); if(!inp) return; const v=inp.value; inp.value=''; modalAannemerAdd(v); },
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
  // Het event gaat mee: `bulkVink` leest er shiftKey uit voor het selecteren van een reeks.
  'bulk-vink':             (el, e) => bulkVink(+el.dataset.rid, e),
  'bulk-alles':            ()   => bulkAlles(),
  'taak-inbehandeling':    (el) => zetInBehandeling(+el.dataset.rid),
  'extra-vve-weg':         (el) => { verwijderExtraVve(el.dataset.code); renderExtraVves(); },
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
  // Het sleep-handvat op een taakrij (STAPEL_GREEP, render-bundel.js). Bewust een LEGE actie en niet
  // gewoon geen data-action: het attribuut is er om de klik-afhandeling van de rij eronder te laten
  // afketsen — die van deze delegatie én die van de takentabel in main.js slaan allebei een element
  // met een eigen data-action over. Zonder dit opent een mislukte greep op de dossierpagina het
  // bewerkscherm. Hier geregistreerd zodat de naam niet als losse eindjes-actie leest.
  'stapel-greep':          ()   => {},
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
    // Aannemer toevoegen in het BEWERKSCHERM: Enter in het modal-invoerveld (werkkopie).
    if (e.target && e.target.id === 'm-aann-input' && e.key === 'Enter') {
      e.preventDefault();
      const v = e.target.value; e.target.value = '';
      modalAannemerAdd(v);
      return;
    }
    // Offerte-aannemer toevoegen: Enter in het inline invoerveld (delegatie: veld leeft kort)
    if (e.target && e.target.classList && e.target.classList.contains('of-aann-input') && e.key === 'Enter') {
      e.preventDefault();
      const sleutel = e.target.dataset.aann, val = e.target.value;
      e.target.value = '';
      addAannemer(sleutel, val);
    }
    // Offerte-aannemer HERNOEMEN: Enter bewaart, Escape laat de oude naam staan. Zelfde delegatie
    // en dezelfde reden: het veld bestaat alleen zolang die ene naam openstaat.
    if (e.target && e.target.classList && e.target.classList.contains('of-aann-naam-inp')) {
      if (e.key === 'Enter')  { e.preventDefault(); stopHernoem(true); }
      if (e.key === 'Escape') { e.preventDefault(); stopHernoem(false); }
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
    // Enter/spatie op een aanklikbaar element dat GEEN knop is. Een <div> of <span> met
    // data-action krijgt van de browser geen toetsenbordbediening; met tabindex="0" komt hij wél
    // in de tabvolgorde en dan hoort hij ook te reageren. Bewust alleen op elementen die zichzelf
    // met tabindex hebben aangemeld — anders zou élke aanklikbare pil een tabstop worden en wordt
    // Tab in een lijst van 25 rijen onbruikbaar. Echte knoppen slaan we over: die doen dit zelf,
    // en meedoen zou de actie twee keer uitvoeren.
    //
    // TOT v12.1 STOND HIER NIETS TEGENOVER: geen enkel element droeg een tabindex, dus dit blok
    // is nooit één keer afgegaan. De VvE-code in de rij en de 'Terug <datum>'-pil hadden wél een
    // wijzende hand — een dossier openen kon zonder muis alleen via Ctrl+K. Die twee melden zich
    // nu aan (util.js vveCodeSpan, en de drie plekken die de snooze-pil tekenen), en een toets in
    // tests.js loopt élke sectie af zodat een nieuwe klikbare span meteen opvalt.
    if ((e.key === 'Enter' || e.key === ' ') && e.target instanceof Element) {
      const kb = e.target.closest('[data-action][tabindex]');
      if (kb && kb === e.target && !kb.closest('button') && kb.tagName !== 'BUTTON' && kb.tagName !== 'A') {
        const fn = ACTIONS[kb.dataset.action];
        if (fn) { e.preventDefault(); fn(kb, e); }
      }
    }
  });

  // Wat er in het naam-veld staat, bijhouden op `state`. Zonder dit was de ingetypte tekst weg
  // zodra de poll de tabel opnieuw tekende — het veld wordt dan als NIEUW element opgebouwd en
  // leest zijn waarde uit `state`, niet uit het weggegooide element.
  document.addEventListener('input', (e) => {
    if (e.target && e.target.classList && e.target.classList.contains('of-aann-naam-inp')) {
      state.offerteAannEditVal = e.target.value;
    }
    // 'Datum aangevraagd' in het offerte-scherm: label en opvolgdatum-voorstel meteen laten
    // meebewegen terwijl de gebruiker typt of kiest (zie offerteAanvraagGewijzigd in crud.js).
    if (e.target && e.target.id === 'm-daang') offerteAanvraagGewijzigd();
  });

  // Ergens anders klikken bewaart de naam. Twee dingen maken dit lastiger dan het lijkt, en beide
  // worden hier afgevangen:
  //   1. Een hertekening (de poll, of een eigen schrijfactie) haalt het veld weg en dat geeft óók
  //      een blur. Zou die als 'weggeklikt' tellen, dan werd de naam halverwege het typen
  //      opgeslagen. renderNtd zet de focus meteen terug in het nieuwe veld; de vergelijking na de
  //      setTimeout ziet dat en doet niets.
  //   2. Direct doorklikken naar een ándere naam. Dan staat er ná de klik een ander veld open;
  //      `startHernoem` heeft de eerste dan al afgemaakt, dus ook hier is er niets meer te doen.
  // De setTimeout is nodig omdat `document.activeElement` tijdens focusout nog `body` is.
  document.addEventListener('focusout', (e) => {
    if (!(e.target && e.target.classList && e.target.classList.contains('of-aann-naam-inp'))) return;
    setTimeout(() => {
      const k = state.offerteAannEdit;
      if (!k) return;                                   // al afgerond via Enter/Escape/andere naam
      const a = document.activeElement;
      if (a && a.classList && a.classList.contains('of-aann-naam-inp')
          && a.dataset.aann === k.sleutel && +a.dataset.idx === k.idx) return;   // hertekening
      stopHernoem(true);
    }, 0);
  });

  initOpmaak();
}
