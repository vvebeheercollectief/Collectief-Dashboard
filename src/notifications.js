// ══════════════════════════════════════
//  NOTIFICATIONS — meldingen (wachtrij/push) + in-app toasts
// ══════════════════════════════════════
import { esc, displayName, parseDt, meldSleutel, kiesAfgerondRij, splitBehandelaar } from "./util.js";
import { state, D, _shownToasts } from "./state.js";
import { SID, ONESIGNAL_APP_ID } from "./config.js";
import { ensureToken } from "./auth.js";
import { fetchSheet, appendRange, assertRowMatch, sheetsFetch } from "./api.js";
import { logEvent } from "./render-overig.js";
import { getSheetIds, insertAndWriteRow, getInsertRow, bevestigInvoegPlek } from "./crud.js";
import { loadAll, parseSections, metWriteMarkering, serieleWrite, blokkeerOffline } from "./data.js";
import { flashRow } from "./anim.js";
import { ico } from "./icons.js";

//  NOTIF — enqueuet event in de Notif-wachtrij én toont directe in-app toast
// ══════════════════════════════════════
async function fireNotifEvent(event, payload) {
  const who   = getCurrentWho();
  const prefs = getNotifPrefs();
  const code  = (payload.code  || '').toString();
  const naam  = (payload.naam  || '').toString();
  const beh   = (payload.behandelaar || '').toString();
  const sec   = (payload.sec   || '').toString().toLowerCase();

  if (event === 'newtask' && prefs.newtask) {
    const msg = code + (naam ? ' · ' + naam : '') + (beh ? ' → ' + beh : '');
    showToast('Nieuwe taak — ' + sec, msg, 'var(--ac)', 'n_newtask');
  } else if (event === 'assigned' && prefs.assigned && who) {
    const behs = splitBehandelaar(beh);
    if (behs.includes(who)) {
      showToast('Toegewezen aan jou', code + (naam ? ' · ' + naam : ''), 'var(--gn)', 'n_assigned');
    }
  }

  // Schrijf een meldings-intentie als rij in de Notif-wachtrij (via het OAuth-schrijfpad).
  // Een onChange-trigger in Apps Script pikt 'm op en verstuurt de push — geen secret meer
  // nodig in de frontend.
  try {
    const data = Object.assign({}, payload, { event, actor: who });
    await appendRange("'Notif-wachtrij'!A:D", [new Date().toISOString(), event, JSON.stringify(data), '']);
  } catch (e) { console.warn('Notif-wachtrij faalde:', e); }
}

// ══════════════════════════════════════
//  IN-APP TOASTS
// ══════════════════════════════════════
const TOAST_ICONS  = {
  n_newtask:'<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="4" width="14" height="17" rx="2" fill="currentColor" fill-opacity="0.18"/><rect x="9" y="2.5" width="6" height="3.5" rx="1" fill="currentColor" fill-opacity="0.35"/><path d="M9 11h6M9 14.5h6M9 18h4"/></svg>',
  n_assigned:'<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="8" r="3.4" fill="currentColor" fill-opacity="0.18"/><path d="M3.8 19c0-3.2 2.6-5.2 6.2-5.2 1.3 0 2.5.3 3.5.8" fill="currentColor" fill-opacity="0.18"/><path d="M18 14v6M15 17h6"/></svg>',
  n_deadline:'<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13" r="8" fill="currentColor" fill-opacity="0.18"/><path d="M12 9v4l2.5 2"/><path d="M4.5 5.5l3-2M19.5 5.5l-3-2"/></svg>',
  n_alv:'<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="8" width="8" height="13" rx="1" fill="currentColor" fill-opacity="0.18"/><rect x="11" y="4" width="10" height="17" rx="1" fill="currentColor" fill-opacity="0.18"/><path d="M2 21h20M6 12h2M6 15.5h2M15 8h2M15 11.5h2M15 15h2"/></svg>',
  n_daily:'<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4.5" fill="currentColor" fill-opacity="0.18"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.2 5.2l1.8 1.8M17 17l1.8 1.8M18.8 5.2L17 7M7 17l-1.8 1.8"/></svg>',
  test:'<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9a6 6 0 0112 0c0 5 2 6 2 6H4s2-1 2-6z" fill="currentColor" fill-opacity="0.18"/><path d="M10 19a2 2 0 004 0"/></svg>',
  // De drie eigen soorten van de opvolgmotor. Uit de centrale set, zodat ze meelopen met elke
  // latere wijziging daar; zonder deze regels viel `toastIco` terug op een lege string en kwam de
  // melding zonder icoon binnen.
  n_escalatie: ico('waarschuwing', 18),
  n_opvolg:    ico('bel', 18),
  n_herhaal:   ico('herhaal', 18)
};
// De drie eigen soorten die Apps Script sinds v11.0 meegeeft (n_escalatie, n_opvolg, n_herhaal)
// staan hier BEWUST met een kleur maar NIET in TYPE_NAAR_PREFS hieronder: een onbekend type wordt
// door de voorkeurenfilter niet weggegooid, en dat is precies de bedoeling. Ze liften voor de PUSH
// nog wel mee op een bestaande tag (dat is de enige tag die mensen op hun toestel hebben staan),
// maar in de app horen ze altijd zichtbaar te zijn — een stil dossier dat escaleert is de zwaarste
// melding die dit systeem kent en mag niet verdwijnen omdat iemand 'Nieuwe taak' heeft uitgezet.
const TOAST_COLORS = { n_newtask:'var(--ac)', n_assigned:'var(--gn)', n_deadline:'var(--am)', n_alv:'var(--pu)', n_daily:'var(--am)',
                       n_escalatie:'var(--rd)', n_opvolg:'var(--am)', n_herhaal:'var(--ac)', test:'var(--ac)' };
const TOAST_DURATION = 5000;
// Dedup-venster: vangt de dubbele toast (zelfde event via directe fire én via de meelezende
// meldingen-ronde), die binnen ~8s arriveert. Bewust korter dan voorheen (30s) zodat twee échte,
// snel-opeenvolgende acties met toevallig identieke titel+tekst niet onnodig lang worden
// onderdrukt; ruim boven de rondecadans van 8s zodat de kruispad-dedup intact blijft.
// De sleutel loopt via meldSleutel() en niet over de ruwe tekst — zie de uitleg daar.
const TOAST_DEDUP_MS = 15000;

// Hoeveel toasts er hoogstens tegelijk uit één ronde komen. Zonder plafond stort een inhaalronde
// (tabblad een weekend verborgen, of de deadline-motor die 's nachts 23 meldingen in 40 seconden
// wegschrijft) de hele achterstand in één keer uit: er passen er een stuk of elf op het scherm,
// de rest wordt onder de onderrand getekend en is na vijf seconden weg. En weg is écht weg — het
// tabblad Meldingen wordt nergens in de app getoond. Liever vier leesbare meldingen plus een
// eerlijke telling van wat je gemist hebt.
const MAX_TOAST_BURST = 4;

// Elke systeemmelding een eigen tag. Stond op 'cd-' + Date.now(), maar de lus die de nieuwe
// meldingen afwerkt is synchroon: meerdere meldingen uit dezelfde ronde landen in dezelfde
// milliseconde, krijgen dezelfde tag en de Notification-API vervángt er dan één. Van N
// systeemmeldingen bleef er precies één over — en door de nieuwste-eerst-volgorde was dat de
// oudste. Precies in het scenario waar de systeemmelding voor bedoeld is: venster open, niet in
// focus. Op productie komen meldingen aantoonbaar in paren binnen één ronde binnen.
let _notifSeq = 0;
const _notifTag = () => 'cd-' + Date.now() + '-' + (++_notifSeq);

// Icoon-vak links in de toast: kent zowel de notificatie-iconen (TOAST_ICONS)
// als de algemene set (ICONS). Zonder (geldige) naam → geen vak, layout als vanouds.
const toastIco = (naam) => {
  const svg = naam ? (TOAST_ICONS[naam] || ico(naam, 18)) : '';
  return svg ? `<span class="toast-ico">${svg}</span>` : '';
};

// opts: { geenDedup:true }        → sla de 15s-ontdubbeling over. Nodig voor opslagbevestigingen:
//                                   twee keer dezelfde taak opslaan binnen 15 s zou anders de
//                                   TWEEDE bevestiging inslikken, wat als 'mislukt' leest.
//       { geenSysteemmelding:true } → geen OS-notificatie als het venster niet in focus is.
//                                   Anders krijgt de gebruiker bij élke opslag met het venster
//                                   op de achtergrond een systeemmelding — precies het scenario
//                                   waarvoor de eerlijke status bedoeld is.
function showToast(title, msg, color, icoNaam, opts) {
  const o = opts || {};
  if (!o.geenDedup) {
    const key = meldSleutel(title, msg);
    if (_shownToasts.has(key)) return;
    _shownToasts.add(key);
    setTimeout(() => _shownToasts.delete(key), TOAST_DEDUP_MS);
  }

  const el = document.createElement('div');
  el.className = 'toast';
  el.style.setProperty('--toast-clr', color || 'var(--ac)');
  el.style.position = 'relative';
  el.style.overflow = 'hidden';
  el.innerHTML = `
    ${toastIco(icoNaam)}
    <div class="toast-body">
      <div class="toast-title">${esc(title)}</div>
      ${msg ? `<div class="toast-msg">${esc(msg)}</div>` : ''}
    </div>
    <button class="toast-close" data-action="toast-sluiten" aria-label="Melding sluiten">×</button>
    <div class="toast-bar" style="animation-duration:${TOAST_DURATION}ms"></div>`;

  const container = document.getElementById('toast-container');
  container.appendChild(el);

  // Systeemmelding wanneer pagina niet in focus (ander venster of tabblad)
  if (!o.geenSysteemmelding && 'Notification' in window && Notification.permission === 'granted' && !document.hasFocus()) {
    const tag = _notifTag();
    try {
      new Notification(title, { body: msg, icon: 'icon-192.png', badge: 'icon-192.png', tag });
    } catch(e) {
      navigator.serviceWorker?.ready.then(reg => reg.showNotification(title, {
        body: msg, icon: 'icon-192.png', badge: 'icon-192.png', tag
      })).catch(() => {});
    }
  }

  setTimeout(() => dismissToast(el), TOAST_DURATION);
}

function dismissToast(el) {
  if (!el || el.classList.contains('removing')) return;
  el.classList.add('removing');
  setTimeout(() => el.remove(), 260);
}

// `opts.geenDedup` werkt hier hetzelfde als bij showToast hierboven, en is om dezelfde reden nodig
// als bij blokkeerOffline (data.js): stilte leest als 'er valt niets te doen'. Bij een undo-toast
// weegt dat zwaarder dan bij een gewone melding — de knop erin is de ENIGE weg terug, en de sleutel
// blijft 30 seconden staan terwijl de toast na 8 seconden verdwijnt. In dat gat van 22 seconden
// voorkomt de ontdubbeling dus niets dubbels; ze laat een herhaalde handeling gewoon onherstelbaar.
// De standaard blijft ontdubbelen: een dubbelklik op dezelfde knop hoort geen twee toasts te geven.
function showUndoToast(title, msg, undoFn, icoNaam, opts) {
  const UNDO_DURATION = 8000;
  if (!(opts||{}).geenDedup) {
    // `opts.sleutel` laat de aanroeper ontdubbelen op IDENTITEIT (het vaste taaknummer) in plaats
    // van op tekst. Twee taken van dezelfde VvE kunnen dezelfde titel+tekst hebben — bij
    // offerte-trajecten is dat zelfs de regel, want daar valt de omschrijving terug op de code —
    // en dan slikte deze ontdubbeling de tweede undo-knop in.
    const key = 'undo|' + ((opts||{}).sleutel || (title + '|' + msg));
    if (_shownToasts.has(key)) return;
    _shownToasts.add(key);
    setTimeout(() => _shownToasts.delete(key), 30000);
  }

  const el = document.createElement('div');
  el.className = 'toast';
  el.style.setProperty('--toast-clr', 'var(--gn)');
  el.style.position = 'relative';
  el.style.overflow = 'hidden';
  el.innerHTML = `
    ${toastIco(icoNaam)}
    <div class="toast-body">
      <div class="toast-title">${esc(title)}</div>
      ${msg ? `<div class="toast-msg">${esc(msg)}</div>` : ''}
      <button class="toast-undo" id="undo-btn-${Date.now()}">${ico('ongedaan',12)} Ongedaan maken</button>
    </div>
    <button class="toast-close" data-action="toast-sluiten" aria-label="Melding sluiten">×</button>
    <div class="toast-bar" style="animation-duration:${UNDO_DURATION}ms"></div>`;

  const container = document.getElementById('toast-container');
  container.appendChild(el);

  const undoBtn = el.querySelector('.toast-undo');
  undoBtn.onclick = async () => {
    undoBtn.disabled = true;
    undoBtn.innerHTML = `${ico('zandloper',12)} Bezig…`;
    try { await undoFn(); } catch(e) { alert('Undo mislukt: ' + e.message); }
    dismissToast(el);
  };

  setTimeout(() => dismissToast(el), UNDO_DURATION);
}

async function undoComplete(undoData) {
  if(blokkeerOffline()) return;   // offline: niets wijzigen, ook niet optimistisch
  if (!await ensureToken()) { alert('Inloggen mislukt.'); return; }
  const { sec, ntdValues, ntdRow } = undoData;
  state._undoInFlight = true; // pauzeer de 8s-poll; deze undo doet z'n eigen loadAll
  try {
    // Eén beurt in de seriële schrijfwachtrij (serieleWrite, data.js): de afronding-write is dan
    // per definitie klaar vóór we de rij zoeken, én er kan geen andere schrijfactie (een tweede
    // undo, een nieuwe taak) meer tussen het narekenen van de invoegplek en de invoeging zelf
    // schieten. Het oude `await state._writeChain` hier wachtte wel op de rij, maar maakte deze
    // undo geen onderdeel ervan — twee snelle undo's berekenden dan allebei hetzelfde anker en
    // schreven om beurten over elkaars invoeging heen (naloop 2026-08-28).
    await serieleWrite(async () => {
      // Is de afronding zélf mislukt (rij-guard, 401, 5xx), dan staat de taak er gewoon nog en zou
      // deze undo hem een TWEEDE keer invoegen — met hetzelfde vaste taaknummer. De toast blijft na
      // een mislukking namelijk nog seconden staan mét een werkende knop. Zelfde weigering als
      // `undoDeleteLog` in render-overig.js.
      if (!undoData.gelukt) {
        // De tekst zegt bewust NIET 'hij staat er nog'. `gelukt` is alleen true na een OK-antwoord,
        // en géén antwoord (een afgebroken verzoek na 20 s) bewijst niet dat de Sheet niets deed —
        // de schrijfactie kán geland zijn. Terugzetten mag daarom niet, maar het als feit
        // presenteren evenmin. De lijst wordt opnieuw geladen zodat de gebruiker het zelf ziet.
        showToast('Niet ongedaan gemaakt',
                  'We konden niet bevestigen dát de taak is afgerond, dus er is niets teruggezet. De lijst wordt opnieuw geladen — kijk of de taak er nog staat.',
                  'var(--am)', 'label', { geenDedup:true, geenSysteemmelding:true });
        await loadAll();
        return;
      }
      // De invoegplek in 'Nog Te Doen' vers narekenen, net als bij het aanmaken van een taak.
      // BEWUST vóór metWriteMarkering: daarbinnen staat pendingWrites al op >0 en keert
      // bevestigInvoegPlek meteen terug zonder iets te bewaken.
      const insertRowVooraf = getInsertRow(sec);
      try { await bevestigInvoegPlek(sec, insertRowVooraf); }
      catch(e){ alert(e.melding || e.message); await loadAll(); return; }
      // Alleen het schrijvende deel onder de teller — de loadAll hieronder moet zijn verse data
      // WÉL kunnen gebruiken (zie de waarschuwing bij metWriteMarkering).
      await metWriteMarkering(async () => {
        const ids = await getSheetIds();
        const afId = ids['Afgerond'];
        // Verse Afgerond-data en de ZOJUIST afgeronde rij zoeken (nieuwste datum eerst, zelfde
        // sortering als D.af). D.af kan nog verouderd zijn.
        // De keuze zelf staat in `kiesAfgerondRij` (util.js), gedeeld met de bulk-undo: die matcht
        // eerst op het vaste taaknummer uit `ntdValues[16]` en valt alleen daarna terug op de code.
        // Zoeken op code + datum is namelijk een GOK zodra er twee afrondingen van dezelfde VvE op
        // dezelfde dag in dezelfde sectie staan — zie de toelichting daar.
        const afData = (parseSections(await fetchSheet('Afgerond'), 'Afgerond').data[sec] || [])
          .slice().sort((a, b) => parseDt(b.datum) - parseDt(a.datum));
        const doelAf = kiesAfgerondRij(afData, (ntdValues || [])[16], undoData.code);
        // EERST terugzetten, DAN pas weghalen. Breekt de verbinding ertussen, dan staat de taak
        // dubbel (zichtbaar, herstelbaar) in plaats van nergens (onzichtbaar, verloren).
        await insertAndWriteRow('Nog Te Doen', insertRowVooraf, ntdValues);
        if (doelAf) {
          // Guard op 'Afgerond': deze deleteDimension leunt op een rijnummer uit een verse lezing,
          // maar tussen die lezing en dit verzoek kan de Sheet alsnog verschoven zijn. Klopt de rij
          // niet meer, dan zou hier stil een ándere afronding verdwijnen.
          await assertRowMatch(doelAf._row, doelAf, 'Afgerond');
          const resp = await sheetsFetch(`https://sheets.googleapis.com/v4/spreadsheets/${SID}:batchUpdate`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${state.oauthToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ requests: [{ deleteDimension: { range: { sheetId: afId, dimension: 'ROWS', startIndex: doelAf._row - 1, endIndex: doelAf._row } } }] })
          });
          // Dit antwoord bleef als ENIGE in de app ongecontroleerd. Gevolg: 'Ongedaan gemaakt' op
          // het scherm terwijl de afronding nog in 'Afgerond' staat — de taak staat dan dubbel
          // zonder dat iemand het weet, en er werd bovendien een logregel 'Teruggezet' bij
          // geschreven die beweert dat het rond is. bulk.js doet bij precies dezelfde delete al
          // wél deze controle. Het foutlichaam met .catch uitlezen om de reden uit api.js: een
          // HTML-antwoord van een tussenliggende proxy geeft anders een SyntaxError zónder
          // .status, die dan als NETWERKfout telt en het dashboard onterecht offline zet.
          if(!resp.ok){
            const e = await resp.json().catch(()=>({}));
            if(resp.status===401){ state.oauthToken=null; state.oauthExpiry=0; }
            const err = new Error(e.error?.message
              || 'De taak staat terug in Nog Te Doen, maar de regel in Afgerond kon niet worden weggehaald — hij staat nu dubbel.');
            err.status = resp.status;
            throw err;
          }
        }
        await logEvent(undoData.code, sec, 'Teruggezet', 'status', 'Afgerond', 'Nog Te Doen');
      });
      // De loadAll hoort nog bínnen de beurt: zo staat D weer vers vóórdat een wachtende
      // schrijfactie (bijvoorbeeld een tweede undo) zijn eigen anker uit D berekent.
      showToast('Ongedaan gemaakt', `${undoData.code} terug in Nog Te Doen`, 'var(--am)', 'ongedaan');
      await loadAll();
      const terug=(D.ntd[sec]||[]).filter(x=>x.code===undoData.code).pop();
      if(terug) flashRow('ntd-tbody', terug._row, 'rij-flits-amber');
    });
  } catch(e) { alert('Undo fout: ' + e.message); }
  finally { state._undoInFlight = false; }
}

async function undoDelete(undoData) {
  if(blokkeerOffline()) return;   // offline: niets wijzigen, ook niet optimistisch
  if (!await ensureToken()) { alert('Inloggen mislukt.'); return; }
  state._undoInFlight = true; // pauzeer de 8s-poll; deze undo doet z'n eigen loadAll
  try {
    // Zelfde beurt-constructie als undoComplete hierboven: de delete-write is klaar vóór de
    // re-insert, en niets anders schrijft meer tussen het narekenen van de invoegplek en de
    // invoeging zelf (naloop 2026-08-28).
    await serieleWrite(async () => {
      const { sec, ntdValues } = undoData;
      // Is er niets verwijderd (rij-guard, 401, 5xx), dan staat de taak er nog en zou deze undo een
      // duplicaat met hetzelfde taaknummer maken. Zie de toelichting bij undoComplete.
      if (!undoData.gelukt) {
        // Zie de toelichting bij undoComplete: 'geen antwoord' is geen bewijs van 'niets gebeurd'.
        showToast('Niet ongedaan gemaakt',
                  'We konden niet bevestigen dát de taak is verwijderd, dus er is niets teruggezet. De lijst wordt opnieuw geladen — kijk of de taak er nog staat.',
                  'var(--am)', 'label', { geenDedup:true, geenSysteemmelding:true });
        await loadAll();
        return;
      }
      const insertRow = getInsertRow(sec);
      try { await bevestigInvoegPlek(sec, insertRow); }
      catch(e){ alert(e.melding || e.message); await loadAll(); return; }
      await metWriteMarkering(async () => {
        await insertAndWriteRow('Nog Te Doen', insertRow, ntdValues);
        await logEvent(undoData.code, sec, 'Teruggezet', 'status', 'Verwijderd', 'Nog Te Doen');
      });
      showToast('Ongedaan gemaakt', `${undoData.code} terug in Nog Te Doen`, 'var(--am)', 'ongedaan');
      await loadAll();
      const terug=(D.ntd[sec]||[]).filter(x=>x.code===undoData.code).pop();
      if(terug) flashRow('ntd-tbody', terug._row, 'rij-flits-amber');
    });
  } catch(e) { alert('Undo fout: ' + e.message); }
  finally { state._undoInFlight = false; }
}

// ══════════════════════════════════════
//  POLLING — toont toasts voor andere gebruikers
// ══════════════════════════════════════
function getNotifPrefs() {
  const g = k => localStorage.getItem(_prefSleutel(k, state.currentUserEmail)) !== 'false';
  return { newtask:g('newtask'), assigned:g('assigned'), deadline:g('deadline'), alv:g('alv'), daily:g('daily') };
}

const TYPE_NAAR_PREFS = { n_newtask:'newtask', n_assigned:'assigned', n_deadline:'deadline', n_alv:'alv', n_daily:'daily' };

// Beslist wat er getoond moet worden. PUUR: geen netwerk, geen DOM, geen state — daarom voor het
// eerst los te testen. Hij las voorheen zélf elke 10 seconden het hele tabblad op; de rijen komen
// nu mee in de batchGet van loadAll (zie _meldBereik in data.js).
//
// Retourneert:
//   toon        — de meldingen die dit moment op het scherm horen, nieuwste eerst
//   watermerk   — de nieuwe basislijn (de HOOGSTE tijdstempel, niet de laatste rij: meldingen
//                 worden door meerdere Apps-Script-paden aangehangen, dus een regel kan
//                 buiten volgorde onderaan belanden en zou de basislijn te ver vooruit zetten)
//   gatMogelijk — het gelezen venster reikt niet terug tot de basislijn, dus er kan een melding
//                 tussen gevallen zijn die wij nooit gezien hebben → volledig herlezen
//   kopStuk     — de koprij mist de kolom Timestamp of Titel; zónder deze vlag zou de filtering
//                 hieronder stilzwijgend ÁLLE rijen weggooien en zou er nooit meer een melding
//                 komen, zonder één spoor op het scherm of in de console
function verwerkMeldingRijen(koppen, rijen, watermerk, who, prefs) {
  const leeg = { toon: [], watermerk, gatMogelijk: false, kopStuk: false };
  const h = (koppen || []).map(c => (c||'').toString().toLowerCase().trim());
  const iTs=h.indexOf('timestamp'), iTi=h.indexOf('titel'), iIn=h.indexOf('inhoud'), iVo=h.indexOf('voor'), iTy=h.indexOf('type');
  if (iTs < 0 || iTi < 0) return { ...leeg, kopStuk: true };

  const rows = (rijen || [])
    .map(row => ({ ts:(row[iTs]||'').toString(), type:(row[iTy]||'').toString(), title:(row[iTi]||'').toString(), body:(row[iIn]||'').toString(), voor:(row[iVo]||'').toString() }))
    .filter(n => n.ts && n.title);
  if (!rows.length) return leeg;

  const hoogste = rows.reduce((m, n) => n.ts > m ? n.ts : m, '');
  const oudste  = rows.reduce((m, n) => (m === '' || n.ts < m) ? n.ts : m, '');
  const gatMogelijk = watermerk != null && oudste > watermerk;

  // Koude start: GEEN toasts voor al bestaande meldingen; alleen de basislijn zetten op de echte
  // (server-)tijdstempel. Voorheen werd die op de BROWSERklok gezet, wat bij een scheve klok oude
  // meldingen als nieuw toonde of juist nieuwe miste.
  if (watermerk == null) return { toon: [], watermerk: hoogste, gatMogelijk: false, kopStuk: false };

  const toon = rows
    .filter(n => n.ts > watermerk)
    // Persoonsgerichte melding alleen aan de juiste persoon. Op een apparaat zonder ingestelde
    // naam (who==='') NIET tonen (geen 'who &&'-kortsluiting → anders lekt het).
    // Hoofdletter- en spatie-ongevoelig vergelijken. De 'voor'-waarde komt uit een Sheet-cel die
    // door Apps Script wordt gevuld en de eigen naam uit een instelling die de gebruiker zelf
    // typt; ' jer' of 'JER' liet de melding stil verdwijnen bij precies de persoon voor wie hij
    // bedoeld was. 'allen' blijft de vaste sleutel.
    .filter(n => { const v = String(n.voor || '').trim().toLowerCase();
                   return !(v && v !== 'allen' && v !== String(who || '').trim().toLowerCase()); })
    .filter(n => { const k = TYPE_NAAR_PREFS[n.type]; return !(k && prefs[k] === false); })
    .sort((a, b) => a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0);   // nieuwste bovenaan

  return { toon, watermerk: hoogste > watermerk ? hoogste : watermerk, gatMogelijk, kopStuk: false };
}

// Zet de uitkomst op het scherm, met een plafond op het aantal toasts per ronde.
function toonMeldingen(lijst) {
  const eerste = (lijst || []).slice(0, MAX_TOAST_BURST);
  for (const n of eerste) showToast(n.title, n.body, TOAST_COLORS[n.type] || 'var(--ac)', n.type);
  const rest = (lijst || []).length - eerste.length;
  // geenDedup: deze telling MOET verschijnen, ook als er net een gelijkluidende stond — stilte
  // zou hier lezen als 'er was niets meer'.
  if (rest > 0) showToast(`+ ${rest} ${rest === 1 ? 'melding' : 'meldingen'} niet getoond`, 'Er kwamen er meer binnen dan er op het scherm passen.', 'var(--ac)', '', { geenDedup: true });
}

// Benoemde handler (i.p.v. anoniem) zodat logout() 'm netjes kan loskoppelen, met een
// token-guard zodat een uitgelogde tab niet alsnog gaat laden.
// De meldingen liften mee op loadAll, dus één ronde haalt hier álles op: verse lijsten én de
// meldingen die tijdens het verborgen zijn binnenkwamen.
function onNotifVisibility() {
  // Zelfde rem als op de 8s-poll: tijdens de zelftest geen eigen laadronde beginnen. De suite
  // verwisselt `window.fetch` per toets, en een ronde die daar doorheen loopt meet mee met de
  // verkeerde stub. Dat maakte twee toetsen wisselvallig — juist bij het draaien in een venster
  // dat afwisselend zichtbaar en verborgen is, want dán vuurt deze gebeurtenis om de haverklap.
  if (state._zelftestLoopt) return;
  if (document.hidden || !state.oauthToken) return;
  // Zelfde guards als de 8s-poll: een loadAll mag geen open modal / bulk-selectie / lopende
  // animatie / undo onder de gebruiker vandaan trekken (resync gooit _rowCache + D om).
  if (document.querySelector('.modal-bg.open')) return;
  if (state.bulkMode || state._animBusy || state._undoInFlight || state.pendingWrites > 0) return;
  if (state._loadInFlight) return; // een lopende/ingeplande ronde levert toch verse data → geen extra loadAll erbovenop stapelen bij elke tabwissel
  loadAll(true);
}

// Was: een eigen setInterval die elke 10 seconden het hele tabblad 'Meldingen' ophaalde — 6 van de
// 13,5 leesverzoeken per minuut, bijna de helft van het Google-quotum, voor één tabblad dat nergens
// in het scherm terechtkomt. De rijen komen nu mee in de batchGet die er tóch al is (zie
// _meldBereik in data.js), wat 0 extra verzoeken kost. Hier blijft alleen het aanhaken op
// tabwissel over.
function initMeldingen() {
  document.removeEventListener('visibilitychange', onNotifVisibility);
  document.addEventListener('visibilitychange', onNotifVisibility);
}

// ══════════════════════════════════════
//  NOTIFICATIE MODAL
// ══════════════════════════════════════
function openNotifModal() {
  const who = localStorage.getItem(_whoSleutel(state.currentUserEmail)) || '';
  const known = ['Jer','Cihad','Gabos','Cihan',''];
  if (known.includes(who)) {
    document.getElementById('notif-who').value = who;
    document.getElementById('notif-who-other').style.display = 'none';
  } else {
    document.getElementById('notif-who').value = '__other__';
    document.getElementById('notif-who-other').style.display = '';
    document.getElementById('notif-who-other').value = who;
  }
  ['newtask','assigned','deadline','alv','daily'].forEach(k => {
    const v  = localStorage.getItem(_prefSleutel(k, state.currentUserEmail));
    const el = document.getElementById('tog-notif-' + k);
    if (el) { const on = v === null ? true : v === 'true'; el.classList.toggle('on', on); el.setAttribute('aria-checked', on); }
  });
  document.getElementById('notif-deadline-hours').value = localStorage.getItem(_prefSleutel('deadline_hours', state.currentUserEmail)) || '1';
  refreshNotifUI();
  document.getElementById('notif-bg').classList.add('open');
}

function closeNotifModal() {
  document.getElementById('notif-bg').classList.remove('open');
}

function refreshNotifUI() {
  document.getElementById('notif-subscribe-section').style.display = state.isSubscribed ? 'none' : 'block';
  document.getElementById('notif-settings-section').style.display  = state.isSubscribed ? 'block' : 'none';
  const dot = document.getElementById('notif-dot');
  if (dot) dot.style.display = state.isSubscribed ? 'none' : 'block';
}

function onWhoChange() {
  const sel = document.getElementById('notif-who');
  document.getElementById('notif-who-other').style.display = sel.value === '__other__' ? '' : 'none';
}

// De naam hangt aan het ACCOUNT, niet aan het apparaat — zelfde reden als _cacheSleutel in
// data.js: localStorage is gebonden aan de origin, niet aan de gebruiker. Op een gedeelde
// computer bleef de naam van de vorige gebruiker staan, en schreef logEvent zijn logregels
// (kolom H van 'Logboek') onder díe naam; ook 'toegewezen aan jou'-meldingen gingen dan naar de
// verkeerde persoon. Er is bovendien geen uitlogknop — mensen sluiten het tabblad — dus niets
// ruimde die waarde ooit op.
// Bewust GEEN migratie van de oude platte sleutel: valt de nieuwe leeg uit, dan geeft
// getCurrentWho hieronder gewoon displayName(state.currentUserEmail) terug, wat voor het vaste
// team exact dezelfde naam oplevert.
const _whoSleutel = email => 'notif_who_' + (email || 'onbekend').toLowerCase();
// …en dezelfde regel voor de VOORKEUREN. Die stonden nog op een kale sleutel ('notif_newtask'),
// terwijl localStorage aan de ORIGIN hangt en niet aan de gebruiker: op een gedeelde computer
// erfde de volgende collega de vinkjes én het deadline-uur van zijn voorganger, en met de eerste
// keer opslaan schreef hij die stand ook nog naar OneSignal onder zijn eigen naam. Precies de
// reden waarom de naam hierboven al per account bewaard wordt.
// Geen migratie nodig: elke voorkeur staat standaard AAN, dus een lege sleutel geeft exact het
// gedrag van een verse installatie.
const _prefSleutel = (k, email) => 'notif_' + k + '_' + (email || 'onbekend').toLowerCase();

function getCurrentWho() {
  const sel = document.getElementById('notif-who');
  if (sel) {
    if (sel.value === '__other__') {
      const v = (document.getElementById('notif-who-other').value || '').trim();
      if (v) return v;
    } else if (sel.value) return sel.value;
  }
  const stored = localStorage.getItem(_whoSleutel(state.currentUserEmail));
  if (stored) return stored;
  if (state.currentUserEmail) return displayName(state.currentUserEmail);
  return '';
}

// De tags bij OneSignal gelijkzetten met een gegeven stand. Losgetrokken uit saveNotifPrefs, want
// er zijn twee soorten aanroepers en die mogen NIET dezelfde bron gebruiken:
//   · het instellingenvenster → de SCHAKELAARS op het scherm (de gebruiker zet ze net om);
//   · inloggen en inschrijven → de OPGESLAGEN stand, want dan is dat venster nooit geopend en
//     staan alle schakelaars in de HTML uit. Las die weg dan de DOM, dan zette één keer inloggen
//     alle meldingen uit — in de app én bij OneSignal — zonder één woord.
// `state.isSubscribed` wordt hier VERS opgehaald in plaats van geloofd: `logout()` zet hem op
// false, en niets zette hem daarna terug behalve een paginalading. Zonder deze verse lezing deed
// de herstelweg na een uitlog-inlog in hetzelfde tabblad helemaal niets.
async function _syncNotifTags(who, prefs, deadlineHours) {
  if (!state.oneSignalReady) return;
  try {
    if (window.OneSignal?.User?.PushSubscription?.optedIn === true) state.isSubscribed = true;
  } catch(_) {}
  if (!state.isSubscribed) return;
  try {
    await OneSignal.User.addTags({
      behandelaar: who,
      n_newtask:  prefs.newtask  ? '1' : '0',
      n_assigned: prefs.assigned ? '1' : '0',
      n_deadline: prefs.deadline ? '1' : '0',
      n_alv:      prefs.alv      ? '1' : '0',
      n_daily:    prefs.daily    ? '1' : '0',
      deadline_h: deadlineHours,
    });
    if (who) await OneSignal.login(who);
  } catch(e) { console.warn('Tag sync faalde:', e); }
}

// Herstel de koppeling met OneSignal vanuit de OPGESLAGEN stand. Aangeroepen na een geslaagde
// inlog (logout() koppelt het toestel los en gooit de tags weg) en na het inschrijven.
async function herstelNotifKoppeling() {
  const who = getCurrentWho();
  const uren = localStorage.getItem(_prefSleutel('deadline_hours', state.currentUserEmail)) || '1';
  await _syncNotifTags(who, getNotifPrefs(), uren);
  try { refreshNotifUI(); } catch(_) {}
}

async function saveNotifPrefs() {
  const who = getCurrentWho();
  if (!who) return;
  localStorage.setItem(_whoSleutel(state.currentUserEmail), who);
  const prefs = {
    newtask:  document.getElementById('tog-notif-newtask').classList.contains('on'),
    assigned: document.getElementById('tog-notif-assigned').classList.contains('on'),
    deadline: document.getElementById('tog-notif-deadline').classList.contains('on'),
    alv:      document.getElementById('tog-notif-alv').classList.contains('on'),
    daily:    document.getElementById('tog-notif-daily').classList.contains('on'),
  };
  const deadlineHours = document.getElementById('notif-deadline-hours').value || '1';
  Object.entries(prefs).forEach(([k, v]) => localStorage.setItem(_prefSleutel(k, state.currentUserEmail), v));
  localStorage.setItem(_prefSleutel('deadline_hours', state.currentUserEmail), deadlineHours);
  await _syncNotifTags(who, prefs, deadlineHours);
}

async function waitForOneSignal(timeoutMs) {
  timeoutMs = timeoutMs || 10000;
  const start = Date.now();
  while (!state.oneSignalReady && (Date.now() - start) < timeoutMs) {
    await new Promise(r => setTimeout(r, 150));
  }
  return state.oneSignalReady;
}

async function subscribeNotifs() {
  const who = getCurrentWho();
  if (!who) { alert('Selecteer of typ eerst je naam.'); return; }
  const btn = document.getElementById('notif-subscribe-btn');
  const orig = btn.innerHTML;
  btn.disabled = true; btn.innerHTML = `${ico('zandloper',12)} Bezig…`;
  const ready = await waitForOneSignal();
  if (!ready) {
    btn.disabled = false; btn.innerHTML = orig;
    alert('Notificatiesysteem kon niet worden geladen.\n\nMogelijke oorzaken:\n• Geen internet\n• Ad-blocker blokkeert OneSignal\n• Probeer Cmd+Shift+R');
    return;
  }
  try {
    await OneSignal.Notifications.requestPermission();
    if (!OneSignal.Notifications.permission) {
      alert('Geen toestemming gegeven. Zet notificaties aan in je browserinstellingen.');
      return;
    }
    await OneSignal.User.PushSubscription.optIn();
    await OneSignal.login(who);
    ['newtask','assigned','deadline','alv','daily'].forEach(k => {
      if (localStorage.getItem(_prefSleutel(k, state.currentUserEmail)) === null) localStorage.setItem(_prefSleutel(k, state.currentUserEmail), 'true');
    });
    if (!localStorage.getItem(_prefSleutel('deadline_hours', state.currentUserEmail))) localStorage.setItem(_prefSleutel('deadline_hours', state.currentUserEmail), '1');
    localStorage.setItem(_whoSleutel(state.currentUserEmail), who);
    // EERST de vlag, dán de tags: `_syncNotifTags` keert terug zolang `isSubscribed` false is, en
    // in die volgorde werden de tags bij het allereerste inschrijven helemaal niet weggeschreven.
    state.isSubscribed = true;
    await herstelNotifKoppeling();
    sendTestNotif(who, 'Notificaties zijn aan!', 'Je ontvangt voortaan meldingen op dit apparaat.');
  } catch(e) {
    console.error('subscribeNotifs error:', e);
    alert('Aanzetten mislukt: ' + (e.message || e));
  } finally {
    btn.disabled = false; btn.innerHTML = orig;
  }
}

// De ENIGE `window.confirm()` die in de app is blijven staan — bewust, niet vergeten.
// Alle andere ja/nee-vragen lopen via `vraagBevestiging` (bevestig.js), en die geeft een Promise:
// de aanroeper komt dan pas ná een `await` bij de regels hieronder. `confirm()` is synchroon, dus
// nu wordt `optOut()` nog in dezelfde taak als de klik bereikt.
// Dat verschil is hier niet vrijblijvend: sommige browser-API's werken alleen binnen een
// 'user gesture', en die vervalt over een `await` heen. Of `OneSignal.User.PushSubscription.optOut()`
// daar één van is, is hier NIET vastgesteld — de SDK komt van het CDN (geen bron in de repo om na
// te lezen) en de zelftest draait zonder toestemming en zonder echte push-registratie, dus het is
// langs deze weg ook niet te meten. Uitzetten is de weg waarlangs iemand van de meldingen af wil;
// die stilletjes laten mislukken is duurder dan één venster dat afwijkt van de rest.
// Wie dit alsnog wil omzetten: eerst op een echt apparaat met werkende pushmeldingen aanzetten,
// dan uitzetten ná een `await`, en controleren dat er daarna écht geen meldingen meer binnenkomen —
// `state.isSubscribed` op false zetten lukt hoe dan ook en bewijst dus niets.
async function unsubscribeNotifs() {
  if (!confirm('Push-meldingen uitzetten op dit apparaat?')) return;
  try {
    if (state.oneSignalReady) {
      await OneSignal.User.PushSubscription.optOut();
      await OneSignal.logout();
    }
    state.isSubscribed = false;
    refreshNotifUI();
  } catch(e) { alert('Uitzetten mislukt: ' + e.message); }
}

function sendTestNotif(who, title, body) {
  showToast(title || 'Test melding', body || 'Notificaties werken correct!', 'var(--ac)', 'kolf');
  try {
    appendRange("'Notif-wachtrij'!A:D", [new Date().toISOString(), 'test', JSON.stringify({ event:'test', who, title, body }), '']).catch(() => {});
  } catch (e) { console.warn('Notif-wachtrij faalde:', e); }
}

// ══════════════════════════════════════
//  ONESIGNAL INIT
// ══════════════════════════════════════
window.OneSignalDeferred = window.OneSignalDeferred || [];
OneSignalDeferred.push(async function(OneSignal) {
  try {
    const swBase = location.pathname.replace(/\/[^/]*$/, '') || '';
    await OneSignal.init({
      appId: ONESIGNAL_APP_ID,
      // Deze twee opties worden door de SDK GENEGEERD zolang de worker-instelling in het
      // OneSignal-dashboard staat ingevuld (workerName 'sw.js', scope '/Collectief-Dashboard/').
      // Op productie geverifieerd: een eigen bestand op een eigen bereik werd niet overgenomen,
      // de SDK registreerde onverstoorbaar 'sw.js?appId=…&sdkVersion=…' op ons eigen bereik.
      // Ze staan hier daarom gelijk aan wat het dashboard doet, zodat code en werkelijkheid
      // elkaar niet tegenspreken. Wil je dit ooit scheiden, dan moet dat in het OneSignal-
      // dashboard gebeuren, niet hier.
      serviceWorkerPath: swBase + '/sw.js',
      serviceWorkerParam: { scope: swBase + '/' },
      notifyButton: { enable: false },
      allowLocalhostAsSecureOrigin: true,
    });
    state.oneSignalReady = true;
    state.isSubscribed   = OneSignal.User.PushSubscription.optedIn === true;
    refreshNotifUI();
    OneSignal.User.PushSubscription.addEventListener('change', e => {
      state.isSubscribed = e.current.optedIn === true;
      refreshNotifUI();
    });
  } catch(e) {
    console.error('[Notif] OneSignal init faalde:', e);
  }
});

// ══════════════════════════════════════

export {
  fireNotifEvent, TOAST_ICONS, TOAST_COLORS, TOAST_DURATION, MAX_TOAST_BURST, showToast, dismissToast, showUndoToast,
  undoComplete, undoDelete, getNotifPrefs, verwerkMeldingRijen, toonMeldingen, initMeldingen, openNotifModal, closeNotifModal,
  refreshNotifUI, onWhoChange, getCurrentWho, _whoSleutel, saveNotifPrefs, herstelNotifKoppeling, waitForOneSignal, subscribeNotifs,
  unsubscribeNotifs, sendTestNotif,
};
