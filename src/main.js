// ══════════════════════════════════════
//  MAIN — boot/orchestrator
// ══════════════════════════════════════
import { IS_STAGING, ALLOWED_EMAILS, SKEYS, APP_VERSION, TEAM } from './config.js';
import { D, pgs, state } from './state.js';
import { ensureToken, doOAuth } from './auth.js';
import { startSplash } from './login-splash.js';
import { goTo, syncKop, closeSb, applyTheme, applyDensity, cycleDensity, setupSearch } from './ui.js';
import { renderNtd, renderAf, renderAlvo, renderAlfa, renderNtdStats, zetKopOpen, kopOpen } from './render-lijsten.js';
import {
  renderOntw, renderLogboek, openOntwModal, closeOntwModal,
  submitOntwItem, deleteOntwItem, histNoteKey,
} from './render-overig.js';
import { openAiHelp, closeAiHelp, buildAiPrompt, parseAiAnswer } from './ai.js';
import {
  openNotifModal, closeNotifModal, onWhoChange, saveNotifPrefs,
  subscribeNotifs, unsubscribeNotifs, sendTestNotif, getCurrentWho, initMeldingen,
} from './notifications.js';
import {
  openModal, closeModal, submitTask, doCompleteTask, closeCompleteModal, kiesSectie, renderExtraVves,
} from './crud.js';
import { loadAll, magPollen, schrijfActieLoopt, setSyncOffline, showOfflineBanner, clearOfflineBanner, laadUitCache } from './data.js';
import { initActions } from './actions.js';
import { initVveZoekveld } from './vve-zoekveld.js';
import { voegExtraVveToe } from './meervve.js';
import { verplaatsTaak } from './verplaats.js';
import { renderBulkUi } from './bulk.js';
import { bouwBundelIndex, koppelKandidaten, taakFilter } from './bundel.js';
import { initBundelSlepen, initStapelSlepen } from './bundel-acties.js';
import { esc, taakTitel, taakVerwijzing } from './util.js';
import { isOffline } from './api.js';
import { closeSnoozeModal, snoozeOpslaan, snoozeWis } from './snooze.js';
import { closeResetModal } from './alv-reset.js';
import { renderHerhaal, openHerhaalModal, closeHerhaalModal, syncHerhaalVelden, submitHerhaal } from './render-herhaal.js';
import { renderVve } from './render-vve.js';
import { openChat, closeChat, setChatVve } from './dossier-chat.js';
import { initPalette, palOpen } from './palette.js';
import { initSwUpdate } from './sw-update.js';
import { initModalA11y, bovensteModal } from './modal-a11y.js';
import { beantwoordBevestiging } from './bevestig.js';
import { ico } from './icons.js';
import { groeiVelden } from './opmaak.js';

// Centrale Escape-sluiting: per venster de juiste sluitfunctie (met opruimlogica),
// i.p.v. alleen de .open-class te verwijderen zodat er geen toestand achterblijft.
const MODAL_SLUITERS = {
  'modal-bg': closeModal,
  'complete-bg': closeCompleteModal,
  'ontw-modal-bg': closeOntwModal,
  'hh-bg': closeHerhaalModal,
  'snooze-bg': closeSnoozeModal,
  'alvoreset-bg': closeResetModal,
  'notif-bg': closeNotifModal,
  'ai-bg': closeAiHelp,
  // Escape op de bevestigingsvraag is 'nee'. Alleen de .open-class weghalen zou de wachtende
  // aanroeper eeuwig laten hangen — die staat op een Promise die alleen hierlangs afloopt.
  'bevestig-bg': () => beantwoordBevestiging(false),
};

// ── Clickjacking-bescherming (frame-buster) ────────────────────────────
// De echte productie draait op GitHub Pages; daar kunnen geen X-Frame-Options/
// frame-ancestors-headers gezet worden. Daarom hier in JS: als het dashboard in
// een iframe geladen wordt (bv. een phishing-overlay), breken we eruit.
if (window.top !== window.self) {
  try { window.top.location = window.self.location; }
  catch (_) { document.documentElement.style.display = 'none'; }
}

// ══════════════════════════════════════
//  BOOT
// ══════════════════════════════════════
document.addEventListener('DOMContentLoaded',()=>{
  // Centraal klik-systeem: één delegatie-listener voor alle data-action-elementen
  initActions();
  initPalette();
  initModalA11y();

  // Behandelaar-kiezers uit TEAM (config.js) i.p.v. handgeschreven <option>-lijstjes. Die lijstjes
  // liepen achter: Cihan stond er niet in — wél in het bulk-menu — en van de duo's stond alleen
  // 'Cihad, Jer' erin en niet 'Jer, Cihad'. Een taak met zo'n waarde toonde een LEEG veld, en
  // opslaan schreef die leegte terug naar de Sheet. `setv` (crud.js) vangt dat nu op als vangnet;
  // dit zorgt dat de waarde überhaupt te KIEZEN is. Eén bron, dus een nieuwe collega in
  // EMAIL_NAMES verschijnt vanzelf overal.
  // Het filter krijgt alleen losse namen: filterNtd vergelijkt met `includes`, dus 'Jer' vindt
  // ook 'Jer, Gabos'. De bewerkschermen krijgen de duo's er wél bij.
  {
    const duos = TEAM.flatMap((a,i)=>TEAM.slice(i+1).map(b=>`${a}, ${b}`));
    const vul = (id, waarden) => {
      const el = document.getElementById(id);
      if(!el) return;
      const eerste = el.options[0];                    // 'Selecteer…' / 'Alle behandelaars' blijft
      const gekozen = el.value;
      el.innerHTML = '';
      if(eerste) el.appendChild(eerste);
      waarden.forEach(w=>{ const o=document.createElement('option'); o.value=w; o.textContent=w; el.appendChild(o); });
      if(gekozen) el.value = gekozen;                  // een al ingevulde keuze niet omgooien
    };
    vul('f-beh-ntd', TEAM);
    // Hetzelfde filter op de Afgerond-pagina, uit dezelfde ene bron: een nieuwe collega staat er
    // dan meteen in, op beide pagina's tegelijk.
    vul('f-beh-af', TEAM);
    ['m-beh','m-beh-v','m-beh-o','m-beh-l','m-beh-s'].forEach(id=>vul(id, TEAM.concat(duos)));
  }

  // Zichtbaar versienummer overal gelijk zetten (één bron: APP_VERSION)
  document.querySelectorAll('#app-version, #app-version-login, #app-version-splash').forEach(el => el.textContent = APP_VERSION);

  // Logo-fallback (CSP-veilig; verving de inline onerror= die de strakke CSP blokkeert):
  // toont 'VBC' als het logo-bestand niet laadt.
  const _logo = document.getElementById('logo');
  if (_logo) {
    const _logoFb = () => { _logo.style.display = 'none'; const fb = document.getElementById('logo-fb'); if (fb) fb.style.display = 'flex'; };
    _logo.addEventListener('error', _logoFb);
    if (_logo.complete && _logo.naturalWidth === 0) _logoFb(); // al gefaald vóór de listener (uit cache)
  }

  // Zichtbare waarschuwingsbalk in de testomgeving
  if (IS_STAGING) {
    document.title = '[TEST] ' + document.title;
    document.body.insertAdjacentHTML('afterbegin',
      '<div class="staging-balk">'
      + ico('waarschuwing',14).replace('<svg ','<svg style="vertical-align:-2.5px;margin-right:4px" ')
      + 'TESTOMGEVING — dit is niet het echte dashboard</div>'
      + '<div style="height:34px"></div>');
  }

  // Service worker registreren + "nieuwe versie"-balk (PWA-ondersteuning)
  initSwUpdate();

  if(localStorage.getItem('theme')==='dark') applyTheme('dark');
  applyDensity(localStorage.getItem('density')||'standaard');

  document.querySelectorAll('.ni[data-page]').forEach(el=>
    el.addEventListener('click',()=>goTo(el.dataset.page)));

  setupSearch('s-ntd',()=>{pgs.ntd=1;renderNtd()});
  setupSearch('s-af', ()=>{pgs.af=1; renderAf()});
  setupSearch('s-alvo',()=>{pgs.alvo=1;renderAlvo()});
  setupSearch('s-alfa',()=>{pgs.alfa=1;renderAlfa()});
  setupSearch('f-code-ntd',()=>{pgs.ntd=1;renderNtd()});
  document.getElementById('f-beh-ntd').onchange=()=>{pgs.ntd=1;renderNtd()};
  document.getElementById('f-prio-ntd').onchange=()=>{pgs.ntd=1;renderNtd()};
  // De filters op Afgerond. Terug naar pagina 1 bij elke wijziging: blijf je op pagina 3 staan
  // terwijl er nog maar één pagina over is, dan zie je een lege lijst en lijkt het filter kapot.
  ['f-beh-af','f-per-af','f-van-af','f-tot-af'].forEach(id=>{
    const el=document.getElementById(id);
    if(el) el.onchange=()=>{pgs.af=1;renderAf()};
  });
  // Operator: klik op een taakrij klapt de volledige tekst uit/in (negeer knoppen, code-link, checkbox)
  document.getElementById('ntd-tbody').addEventListener('click',e=>{
    if(e.target.closest('button,a,input,select,textarea,[data-action],.code-klik,.of-aann-tbl-tog')) return;
    const tr=e.target.closest('tr[data-row]'); if(!tr) return;
    const id=tr.getAttribute('data-row');
    if(state.expandedRows.has(id)){state.expandedRows.delete(id);tr.classList.remove('expanded');}
    else{state.expandedRows.add(id);tr.classList.add('expanded');}
  });
  // Slepen binnen een bundelpaneel. Op de tbody en niet op het paneel zelf: renderTbody vult de
  // hele tbody bij élke render opnieuw, dus een listener op een paneel zou bij de eerstvolgende
  // render aan een weggegooid element hangen.
  initBundelSlepen(document.getElementById('ntd-tbody'));
  // Rij op rij slepen om te stapelen. Op dezelfde tbody en om dezelfde reden: die overleeft elke
  // hertekening, de rijen erin niet. De vertaling van rij naar taak loopt via `data-rid` — de
  // directe index in state._rowCache waar elke andere rij-actie hier ook op werkt (zie rowNtd in
  // render-tabel.js, dat dit attribuut voor deze sleepactie op de <tr> zet).
  // De sleeptoets leest de weergave die renderNtd voor deze ronde heeft klaargezet, zodat 'mag ik
  // slepen' en 'staat de stapel aan' niet uit elkaar kunnen lopen: bij een zoekterm, filter,
  // kolomsortering of bulk-selectie staat de stapelweergave uit en betekent slepen niets (§4.2).
  initStapelSlepen(document.getElementById('ntd-tbody'), 'tr[data-row]',
    el => state._rowCache[+el.dataset.rid] || null,
    () => !!(state._bundelWeergave && state._bundelWeergave.stapel));
  document.getElementById('f-status-alvo').onchange=()=>{pgs.alvo=1;renderAlvo()};
  document.getElementById('f-budget-alvo').onchange=()=>{pgs.alvo=1;renderAlvo()};
  setupSearch('s-logboek',()=>{pgs.logboek=1;renderLogboek()});
  // aria-pressed schuift mee met de 'on'-klasse. Die klasse was het énige wat de aan/uit-stand van
  // deze filterknopjes doorgaf, en dat is alleen te zíen — een schermlezer las vijf identieke
  // knoppen zonder te melden welke aanstaat.
  const kiesChip=(groepId, b, zet)=>{
    document.querySelectorAll(`#${groepId} .lchip`).forEach(x=>{
      const aan = x===b;
      x.classList.toggle('on', aan);
      x.setAttribute('aria-pressed', aan);
    });
    zet(); pgs.logboek=1; renderLogboek();
  };
  document.getElementById('logboek-who').addEventListener('click',e=>{
    const b=e.target.closest('.lchip'); if(!b)return;
    kiesChip('logboek-who', b, ()=>{ state.logWho=b.dataset.who; });
  });
  document.getElementById('logboek-act').addEventListener('click',e=>{
    const b=e.target.closest('.lchip'); if(!b)return;
    kiesChip('logboek-act', b, ()=>{ state.logAct=b.dataset.act; });
  });

  // Bewust een wikkel: hing loadAll er rechtstreeks aan, dan gaf de DOM het klik-event
  // mee als eerste argument — en dat is de 'stil'-vlag. De knop onderdrukte daardoor
  // zijn eigen 'Laden…'-melding én de foutbanner met 'Opnieuw proberen'.
  document.getElementById('refresh-btn').onclick=()=>loadAll();
  document.getElementById('theme-btn').onclick=()=>applyTheme(document.documentElement.dataset.theme==='dark'?'light':'dark');
  document.getElementById('density-btn').onclick=cycleDensity;
  document.getElementById('ai-btn').onclick=openAiHelp;
  document.getElementById('ai-close').onclick=closeAiHelp;
  let _aiMouseDown=null;
  document.getElementById('ai-bg').addEventListener('mousedown',e=>{_aiMouseDown=e.target});
  document.getElementById('ai-bg').addEventListener('click',e=>{if(e.target.id==='ai-bg'&&_aiMouseDown?.id==='ai-bg')closeAiHelp()});
  document.getElementById('chat-btn').onclick=openChat;
  document.getElementById('chat-close').onclick=closeChat;
  initVveZoekveld({ input: document.getElementById('chat-vve-zoek'), lijstEl: document.getElementById('chat-vve-sug'),
    minTekens: 0, onSelect: ({code}) => setChatVve(code) });
  document.getElementById('ai-chips').addEventListener('click',e=>{const b=e.target.closest('.ai-chip');if(!b)return;
    b.setAttribute('aria-pressed', b.classList.toggle('on'));   // stand ook hoorbaar, niet alleen zichtbaar
    buildAiPrompt();parseAiAnswer();});
  document.getElementById('ai-mail').addEventListener('input',buildAiPrompt);
  const aiVveInput=document.getElementById('ai-vve-input');
  const aiVveWis=document.getElementById('ai-vve-wis');
  const zetAiVve=(code,naam)=>{
    state._aiVveCode=code||'';
    aiVveInput.value=code?`${code} — ${naam||''}`:'';
    aiVveWis.style.display=code?'':'none';
    buildAiPrompt(); parseAiAnswer();
  };
  initVveZoekveld({ input: aiVveInput, lijstEl: document.getElementById('ai-vve-sug'),
    minTekens: 0, onSelect: ({code,naam}) => zetAiVve(code,naam) });
  aiVveInput.addEventListener('input',()=>{   // overtypen = koppeling los
    if(state._aiVveCode){ state._aiVveCode=''; aiVveWis.style.display='none'; buildAiPrompt(); parseAiAnswer(); }
  });
  aiVveWis.onclick=()=>zetAiVve('','');
  document.getElementById('ai-answer').addEventListener('input',parseAiAnswer);
  document.getElementById('hamburger').onclick=()=>{
    const open=document.getElementById('sb').classList.toggle('open');
    document.getElementById('overlay').classList.toggle('on');
    document.getElementById('hamburger').setAttribute('aria-expanded',open);
  };
  document.getElementById('overlay').onclick=closeSb;

  document.getElementById('btn-add').onclick=()=>openModal(false);
  document.getElementById('m-close').onclick=closeModal;
  document.getElementById('m-cancel').onclick=closeModal;
  let _modalMouseDownTarget=null;
  document.getElementById('modal-bg').addEventListener('mousedown',e=>{_modalMouseDownTarget=e.target});
  document.getElementById('modal-bg').addEventListener('click',e=>{if(e.target.id==='modal-bg'&&_modalMouseDownTarget?.id==='modal-bg')closeModal()});
  document.getElementById('m-submit').onclick=submitTask;
  // Categorie-kiezer: een <select> geeft `change`, geen `click`, en komt dus niet langs de
  // delegatie in actions.js (zelfde reden als bij hh-type hieronder).
  // Eén kiezer, twee betekenissen. Bij TOEVOEGEN wisselt hij alleen het veldblok (kiesSectie);
  // bij BEWERKEN is hij de verplaats-knop. Die tweede weg stelt eerst een vraag en zet de kiezer
  // netjes terug als het antwoord 'nee' is — anders zou het scherm een categorie tonen waar de
  // taak niet staat.
  document.getElementById('m-sec').onchange=async e=>{
    const doel=e.target.value;
    if(!state.editMode){ kiesSectie(doel); return; }
    const r=state.editRowData;
    const bron=r&&r._sec;
    const gelukt=await verplaatsTaak(r, doel);
    if(gelukt){ closeModal(); }
    else if(bron){ e.target.value=bron; }
  };

  // Ontwikkeling modal + search
  document.getElementById('btn-add-ontw').onclick=()=>openOntwModal(false);
  document.getElementById('ontw-m-close').onclick=closeOntwModal;
  document.getElementById('ontw-m-cancel').onclick=closeOntwModal;
  document.getElementById('ontw-m-submit').onclick=submitOntwItem;
  document.getElementById('ontw-m-del').onclick=deleteOntwItem;
  let _ontwMouseDown=null;
  document.getElementById('ontw-modal-bg').addEventListener('mousedown',e=>{_ontwMouseDown=e.target});
  document.getElementById('ontw-modal-bg').addEventListener('click',e=>{if(e.target.id==='ontw-modal-bg'&&_ontwMouseDown?.id==='ontw-modal-bg')closeOntwModal()});
  setupSearch('s-ontw',()=>{pgs.ontw=1;renderOntw()});

  // Herhaalregel-modal (Fase 4)
  document.getElementById('btn-add-herhaal').onclick=()=>openHerhaalModal(null);
  document.getElementById('hh-close').onclick=closeHerhaalModal;
  document.getElementById('hh-cancel').onclick=closeHerhaalModal;
  document.getElementById('hh-submit').onclick=submitHerhaal;
  document.getElementById('hh-type').onchange=syncHerhaalVelden;
  let _hhMouseDown=null;
  document.getElementById('hh-bg').addEventListener('mousedown',e=>{_hhMouseDown=e.target});
  document.getElementById('hh-bg').addEventListener('click',e=>{if(e.target.id==='hh-bg'&&_hhMouseDown?.id==='hh-bg')closeHerhaalModal()});
  initVveZoekveld({
    input: document.getElementById('hh-code'),
    lijstEl: document.getElementById('hh-vve-sug'),
    minTekens: 2, maxItems: 8,
    onSelect: ({code,naam}) => {
      document.getElementById('hh-code').value = code;
      document.getElementById('hh-naam').value = naam;
    },
  });

  // Nieuwe-vergaderronde-modal (ALV-reset)
  document.getElementById('alvoreset-close').onclick=closeResetModal;
  let _resetMouseDown=null;
  document.getElementById('alvoreset-bg').addEventListener('mousedown',e=>{_resetMouseDown=e.target});
  document.getElementById('alvoreset-bg').addEventListener('click',e=>{if(e.target.id==='alvoreset-bg'&&_resetMouseDown?.id==='alvoreset-bg')closeResetModal()});

  // Wegleggen-modal (Fase 4)
  document.getElementById('snooze-close').onclick=closeSnoozeModal;
  document.getElementById('snooze-cancel').onclick=closeSnoozeModal;
  document.getElementById('snooze-opslaan').onclick=snoozeOpslaan;
  document.getElementById('snooze-wis').onclick=snoozeWis;
  let _snoozeMouseDown=null;
  document.getElementById('snooze-bg').addEventListener('mousedown',e=>{_snoozeMouseDown=e.target});
  document.getElementById('snooze-bg').addEventListener('click',e=>{if(e.target.id==='snooze-bg'&&_snoozeMouseDown?.id==='snooze-bg')closeSnoozeModal()});

  // Centrale Escape-handler: sluit chat → zijbalk-lade → bovenste open venster.
  // (Het commandopalet sluit zichzelf al met Escape in palette.js.)
  document.addEventListener('keydown',e=>{
    if(e.key!=='Escape') return;
    if(document.getElementById('chat-bg')?.classList.contains('open')){ closeChat(); return; }
    if(document.getElementById('sb').classList.contains('open')){ closeSb(); return; }
    // Staat het commandopalet open, dan is het klaar: palette.js sluit zichzelf op Escape. Zonder
    // deze regel deed één Escape twee dingen. Het palet is óók een .modal-bg, maar het staat in de
    // HTML ná het bewerkscherm — `bovensteModal` gaf dus het BEWERKSCHERM terug, de guard op
    // 'pal-bg' hieronder greep niet, en wie tijdens het bewerken Ctrl+K aantikte en zich bedacht,
    // raakte met één toets ook zijn halve zin kwijt.
    // Twee controles, zodat de volgorde van aanmelden niet uitmaakt: staat het palet nog open dan
    // is hij van hen, en is hij al gesloten dan heeft palette.js dat op het event gemerkt.
    if(palOpen() || e._paletSlootZichzelf) return;
    // `bovensteModal` i.p.v. querySelector: er kunnen er twee openstaan (de verwijdervraag komt
    // vanuit het bewerkscherm) en dan hoort Escape de bovenste te sluiten, niet de eerste in de HTML.
    const open=bovensteModal();
    if(open && open.id!=='pal-bg'){ const fn=MODAL_SLUITERS[open.id]; fn?fn():open.classList.remove('open'); }
  });

  // Bevestigingsvenster. Vier uitwegen, één functie: alleen de bevestigknop is 'ja'.
  document.getElementById('bevestig-ja').onclick=()=>beantwoordBevestiging(true);
  document.getElementById('bevestig-nee').onclick=()=>beantwoordBevestiging(false);
  document.getElementById('bevestig-sluit').onclick=()=>beantwoordBevestiging(false);
  // Klik náást het venster telt ook als 'nee' — zelfde mousedown/click-paar als bij de andere
  // vensters, zodat een slepende selectie die búiten eindigt het venster niet dichtgooit.
  let _bevMouseDown=null;
  document.getElementById('bevestig-bg').addEventListener('mousedown',e=>{_bevMouseDown=e.target});
  document.getElementById('bevestig-bg').addEventListener('click',e=>{if(e.target.id==='bevestig-bg'&&_bevMouseDown?.id==='bevestig-bg')beantwoordBevestiging(false)});

  // Afgerond modal
  document.getElementById('complete-close').onclick=closeCompleteModal;
  document.getElementById('complete-cancel').onclick=closeCompleteModal;
  document.getElementById('complete-confirm').onclick=doCompleteTask;
  let _compMouseDown=null;
  document.getElementById('complete-bg').addEventListener('mousedown',e=>{_compMouseDown=e.target});
  document.getElementById('complete-bg').addEventListener('click',e=>{if(e.target.id==='complete-bg'&&_compMouseDown?.id==='complete-bg')closeCompleteModal()});

  // VvE autocomplete (gedeeld component; gedrag identiek: ≥2 tekens, max 8)
  initVveZoekveld({
    input: document.getElementById('m-code'),
    lijstEl: document.getElementById('vve-sug'),
    minTekens: 2, maxItems: 8,
    onSelect: ({code,naam}) => {
      document.getElementById('m-code').value = code;
      document.getElementById('m-naam').value = naam;
    },
  });

  // 'Ook voor andere VvE's': dezelfde component als de VvE-kiezer erboven. Bewust via
  // initVveZoekveld en niet met eigen suggestiecode — een tweede kiezer naast deze loopt op eigen
  // toetsafhandeling, eigen blur-gedrag en eigen opmaak uit de pas (zie de toelichting daar).
  // Het veld leegmaken ná het kiezen: zo kun je meteen de volgende intypen zonder eerst te wissen.
  initVveZoekveld({
    input: document.getElementById('m-extra-vve'),
    lijstEl: document.getElementById('m-extra-sug'),
    minTekens: 2, maxItems: 8,
    onSelect: ({code,naam}) => {
      voegExtraVveToe(code, naam, document.getElementById('m-code').value.trim());
      document.getElementById('m-extra-vve').value = '';
      renderExtraVves();
    },
  });

  // 'Hoort bij' (Takenbundel): dezelfde component, maar met TAKEN als bron. Bewust via
  // initVveZoekveld en niet met eigen suggestiecode — een tweede kiezer naast deze loopt op eigen
  // toetsafhandeling, eigen blur-gedrag en eigen opmaak uit de pas.
  const hbVeld = document.getElementById('m-hoortbij');
  initVveZoekveld({
    input: hbVeld,
    lijstEl: document.getElementById('m-hoortbij-sug'),
    minTekens: 2, maxItems: 12,
    // Alleen taken die daadwerkelijk als doel mogen dienen. Welke dat zijn bepaalt de guard
    // (koppelKandidaten vraagt het aan magKoppelen), niet dit scherm. Vers uit D bij élke
    // toetsaanslag en niet één keer bij het openen: de 8s-poll staat stil zolang dit venster open
    // is, maar de lijst kan al van vóór het openen zijn.
    bron: () => koppelKandidaten(D.ntd, bouwBundelIndex(D.ntd, D.af), state.editRowData || {}),
    filter: taakFilter,
    // Zelfde twee regels als de VvE-lijst, maar omgedraaid: de omschrijving is waar je op zoekt,
    // de VvE eronder zegt wélke het is (twee VvE's hebben zo vaak dezelfde soort taak).
    itemHtml: m => m.map(r => `<div class="vve-sug-item">`
      + `<div class="vve-sug-code">${esc(taakTitel(r))}</div>`
      + `<div class="vve-sug-naam">${esc(r.code)}${r.naam ? ' — ' + esc(r.naam) : ''}</div></div>`).join(''),
    onSelect: (taak) => {
      state._hbDoel = taak;              // het rij-OBJECT: een koppeling wijst één rij aan
      hbVeld.value = taakVerwijzing(taak);
      document.getElementById('m-hoortbij-x').style.display = '';
    },
  });
  // Overtypen of leegmaken = de keuze weer los. Zonder dit koppelt een leeggemaakt veld bij het
  // opslaan alsnog aan de taak die er even stond (zelfde valkuil als bij de VvE-koppeling van de
  // AI-hulp hierboven).
  hbVeld.addEventListener('input', () => {
    if (!state._hbDoel || hbVeld.value === taakVerwijzing(state._hbDoel)) return;
    state._hbDoel = null;
    // Het kruisje mag alleen blijven staan als er nog een échte koppeling onder ligt om te wissen.
    if (!String((state.editRowData || {}).bundelId || '').trim())
      document.getElementById('m-hoortbij-x').style.display = 'none';
  });

  // Logboek-notitieveld (was inline onkeydown/onchange — Fase 2B)
  document.getElementById('hist-note').addEventListener('keydown', histNoteKey);
  document.getElementById('notif-deadline-hours').addEventListener('change', saveNotifPrefs);

  // Notificatie-modal handlers
  document.getElementById('notif-btn').onclick = openNotifModal;
  document.getElementById('notif-close').onclick = closeNotifModal;
  let _notifMouseDown=null;
  document.getElementById('notif-bg').addEventListener('mousedown', e => { _notifMouseDown = e.target; });
  document.getElementById('notif-bg').addEventListener('click', e => { if (e.target.id === 'notif-bg' && _notifMouseDown?.id === 'notif-bg') closeNotifModal(); });
  document.getElementById('notif-who').onchange = () => { onWhoChange(); saveNotifPrefs(); };
  document.getElementById('notif-who-other').oninput = () => saveNotifPrefs();
  document.getElementById('notif-subscribe-btn').onclick = subscribeNotifs;
  document.getElementById('notif-unsubscribe-btn').onclick = unsubscribeNotifs;
  document.getElementById('notif-test-btn').onclick = () => sendTestNotif(getCurrentWho(), 'Test melding', 'Notificaties werken correct op dit apparaat!');
  initMeldingen();

  // Waarschuw bij het sluiten zolang er een schrijfactie loopt. De browser toont zijn eigen,
  // niet-aanpasbare tekst; werkt op de desktop en op telefoon/PWA vrijwel niet.
  window.addEventListener('beforeunload', (e) => {
    if(!schrijfActieLoopt(Date.now())) return;
    e.preventDefault();
    e.returnValue = '';   // vereist door oudere browsers
  });

  // Verbinding weg of terug: meteen laten zien, niet pas bij de volgende 8s-ronde.
  // 'online' bewijst alleen dat er weer een netwerkinterface is, niet dat Google bereikbaar is —
  // daarom niet zelf de teller op 0 zetten maar gewoon een ronde doen. Slaagt die, dan zet
  // setSynced de balk en de banner zelf weg.
  window.addEventListener('offline', ()=>{ setSyncOffline(); showOfflineBanner(); });
  window.addEventListener('online',  ()=>{
    // De banner weg zodra hij niet meer waar is, óók als er geen ronde mag lopen. `isOffline()` is
    // een LIVE toets, en `blokkeerOffline` gebruikt dezelfde: op dit moment mag er dus alweer
    // geschreven worden. De banner bleef daar los van staan tot een geslaagde ronde hem opruimde,
    // en die staat stil zolang er een venster openstaat of een bulk-selectie loopt. Je kon dus
    // rustig doorwerken met een balk erboven die zei dat dat niet kon.
    if(!isOffline()) clearOfflineBanner();
    // Dezelfde remmen als de 8s-poll: een verversing mag geen open venster, bulk-selectie of
    // lopende undo onder de gebruiker weghalen. Blijft dit staan, dan haalt de poll het zo op.
    if(state._zelftestLoopt) return;   // en tijdens de zelftest helemaal niet (zie de timer hieronder)
    if(!magPollen(state)) return;
    if(document.querySelector('.modal-bg.open')) return;
    if(state.pendingWrites>0 || state.bulkMode || state._animBusy || state._undoInFlight) return;
    loadAll(true);
  });

  // Live updates — auto-refresh elke 8 seconden (smart diff voorkomt onnodige re-renders)
  // Id bewaard zodat logout() de poll kan stoppen (anders blijft hij na uitloggen doordraaien).
  state._resyncTimer=setInterval(async ()=>{
    // Tijdens de zelftest (?test=1) niet pollen. De suite zet `window.fetch` om de beurt naar een
    // eigen stub en meet dán wat er gevraagd wordt en wat de statusbalk zegt; een ronde die daar
    // dwars doorheen loopt overschrijft de gemeten URL en zet de balk op 'Live'. Dat gaf twee
    // toetsen die soms rood en soms groen waren — en een toets die je niet kunt vertrouwen is
    // erger dan geen toets. De poll zelf wordt in de suite rechtstreeks via loadAll beproefd.
    if(state._zelftestLoopt) return;
    if(document.hidden) return;
    // F4: alle modal-achtergronden delen class 'modal-bg' (index.html); één check volstaat.
    // Nieuwe modals hoeven hier niet meer te worden toegevoegd zolang ze .modal-bg gebruiken.
    if(document.querySelector('.modal-bg.open')) return;
    // 'Loopt er al een ronde?' — aan de toestand vragen, niet aan een CSS-klasse. Dit stond hier
    // als `dot.classList.contains('loading')`, en dat was een dodelijke koppeling: `setSaving()`
    // zet die klasse ook bij een schrijfactie, en de stille resync die daarná loopt zet hem alleen
    // weer weg als hij slaagt. Faalde die ene resync (netwerkhapering, 429) terwijl de teller nog
    // op één stond, dan bleef de bol op 'Laden…' — en sloeg déze regel daarna élke ronde af. Het
    // dashboard ververste vanaf dat moment nooit meer uit zichzelf, zonder één melding; alleen een
    // klik op Vernieuwen bracht het terug. `_loadInFlight` zegt hetzelfde en kan niet blijven hangen.
    if(state._loadInFlight) return;
    if(state.pendingWrites>0) return;
    if(state.bulkMode) return;
    if(state._animBusy) return;
    if(state._undoInFlight) return;
    // Nog geen sessie → niet pollen. Anders vroeg deze timer op het inlogscherm elke
    // 8 s zélf een token aan en kaapte hij het antwoord van een lopende inlogpoging.
    if(!magPollen(state)) return;
    loadAll(true);   // loadAll vernieuwt de token zelf en toont fouten in de statusbalk
  },8000);

  // Token-refresh heartbeat — elke 4 min proactief vernieuwen vóór expiry.
  // Via doOAuth(false) i.p.v. de client direct: dan wordt de callback correct (her)gebonden,
  // zodat een heartbeat geen lopende ensureToken-refresh kapot maakt (gedeelde-callback-race).
  // Id bewaard zodat logout() de heartbeat kan stoppen.
  state._heartbeatTimer=setInterval(()=>{
    if(!state.oauthToken) return;
    if(state.oauthExpiry - Date.now() > 5*60*1000) return;
    doOAuth(false);
  },4*60*1000);

  // Sessie herstellen uit sessionStorage
  const _st=sessionStorage.getItem('oauthToken');
  const _se=parseInt(sessionStorage.getItem('oauthExpiry')||'0');
  const _sm=sessionStorage.getItem('currentUserEmail');
  if(_st&&Date.now()<_se&&_sm&&ALLOWED_EMAILS.includes(_sm.toLowerCase())){
    state.oauthToken=_st;state.oauthExpiry=_se;state.currentUserEmail=_sm;
    document.getElementById('login-gate').style.display='none';
    laadUitCache();   // meteen de laatst bekende stand in beeld; loadAll vervangt hem
    loadAll();
  } else {
    // Geen geldige sessie → login nodig. Speel de gebrande launch-splash
    // (na ~1,9s → login-kaart). Bewust alleen hier: ingelogde terugkeerders
    // krijgen de gate meteen verborgen en zien dus nooit een splash-flits.
    startSplash();
  }

  goTo('ntd');
});


// ══════════════════════════════════════
//  RENDER ALL
// ══════════════════════════════════════
// renderAll woont bewust in main.js (orchestrator); data.js/crud.js importeren
// hem als live binding (kringverwijzing is ok — aanroep gebeurt op runtime).
//
// Geeft de getekende NTD-lijst door, net als `renderNtd`/`setNtd` zelf al deden (zie daar): een
// aanroeper die wil weten op welke pagina een rij beland is, hoeft er dan geen tweede volledige
// NTD-render voor te doen. Alleen die lijst en niet de andere — meer gepagineerde lijsten hebben ze
// wel (af, alvo, alfa, ontw, logboek), maar `renderNtd` is de enige render hieronder die zijn
// getekende lijst teruggeeft. Vraagt een andere lijst er ooit om, dan hoort die eerst hetzelfde te
// doen; hier iets nabouwen zou een tweede kopie van die filter/sorteer-pijplijn opleveren.
export function renderAll(){
  state._rowCache=[];
  const ntdTotal=SKEYS.reduce((s,k)=>s+(D.ntd[k]?.length||0),0);
  document.getElementById('b-ntd').textContent=ntdTotal;
  renderNtdStats();
  syncKop();
  zetKopOpen(kopOpen());
  const zichtbaar=renderNtd();
  renderAf();
  renderAlvo();
  renderAlfa();
  renderOntw();
  renderLogboek();
  renderHerhaal();
  renderVve();
  groeiVelden();   // de poll hertekent de velden; hun meegroei-hoogte moet terug
  // De bulk-balk hoort bij de lijst en moet dus mee-hertekend worden. Zonder deze regel bleef hij
  // na een verversing '30 geselecteerd' zeggen terwijl `renderNtd` alle vinkjes al leeg had
  // getekend — en die balk werkte gewoon, op rijen die niemand meer aangevinkt zag staan.
  renderBulkUi();
  return zichtbaar;
}

// ══════════════════════════════════════
//  TESTS (alleen actief met ?test=1)
// ══════════════════════════════════════
// ── Zelftest (alleen met ?test=1) — lazy-geladen, niet in productie ──
if (location.search.includes('test=1')) import('./tests.js');

