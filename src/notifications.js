// ══════════════════════════════════════
//  NOTIFICATIONS — meldingen (wachtrij/push) + in-app toasts
// ══════════════════════════════════════
import { esc, displayName, parseDt } from "./util.js";
import { state, D, _shownToasts } from "./state.js";
import { SID, ONESIGNAL_APP_ID } from "./config.js";
import { ensureToken } from "./auth.js";
import { fetchSheet, appendRange } from "./api.js";
import { logEvent } from "./render-overig.js";
import { getSheetIds, insertAndWriteRow, getInsertRow } from "./crud.js";
import { loadAll, parseSections } from "./data.js";
import { flashRow } from "./anim.js";

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
    showToast('📋 Nieuwe taak — ' + sec, msg, 'var(--ac)');
  } else if (event === 'assigned' && prefs.assigned && who) {
    const behs = beh.split(/[,\/]/).map(s => s.trim());
    if (behs.includes(who)) {
      showToast('➕ Toegewezen aan jou', code + (naam ? ' · ' + naam : ''), 'var(--gn)');
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
  n_memo:'<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2.5" width="6" height="11" rx="3" fill="currentColor" fill-opacity="0.18"/><path d="M5.5 11a6.5 6.5 0 0013 0M12 17.5V21M9 21h6"/></svg>',
  test:'<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9a6 6 0 0112 0c0 5 2 6 2 6H4s2-1 2-6z" fill="currentColor" fill-opacity="0.18"/><path d="M10 19a2 2 0 004 0"/></svg>'
};
const TOAST_COLORS = { n_newtask:'var(--ac)', n_assigned:'var(--gn)', n_deadline:'var(--am)', n_alv:'var(--pu)', n_daily:'var(--am)', n_memo:'var(--ac)', test:'var(--ac)' };
const TOAST_DURATION = 5000;
// Dedup-venster: vangt de dubbele toast (zelfde event via directe fire én via de 10s-poll), die
// binnen ~10s arriveert. Bewust korter dan voorheen (30s) zodat twee échte, snel-opeenvolgende
// acties met toevallig identieke titel+tekst niet onnodig lang worden onderdrukt; ruim boven de
// poll-cadans van 10s zodat de cross-pad-dedup intact blijft.
const TOAST_DEDUP_MS = 15000;

function showToast(title, msg, color) {
  const key = title + '|' + msg;
  if (_shownToasts.has(key)) return;
  _shownToasts.add(key);
  setTimeout(() => _shownToasts.delete(key), TOAST_DEDUP_MS);

  const el = document.createElement('div');
  el.className = 'toast';
  el.style.setProperty('--toast-clr', color || 'var(--ac)');
  el.style.position = 'relative';
  el.style.overflow = 'hidden';
  el.innerHTML = `
    <div class="toast-body">
      <div class="toast-title">${esc(title)}</div>
      ${msg ? `<div class="toast-msg">${esc(msg)}</div>` : ''}
    </div>
    <button class="toast-close" data-action="toast-sluiten">×</button>
    <div class="toast-bar" style="animation-duration:${TOAST_DURATION}ms"></div>`;

  const container = document.getElementById('toast-container');
  container.appendChild(el);

  // Systeemmelding wanneer pagina niet in focus (ander venster of tabblad)
  if ('Notification' in window && Notification.permission === 'granted' && !document.hasFocus()) {
    try {
      new Notification(title, { body: msg, icon: 'icon-192.png', badge: 'icon-192.png', tag: 'cd-' + Date.now() });
    } catch(e) {
      navigator.serviceWorker?.ready.then(reg => reg.showNotification(title, {
        body: msg, icon: 'icon-192.png', badge: 'icon-192.png', tag: 'cd-' + Date.now()
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

function showUndoToast(title, msg, undoFn) {
  const UNDO_DURATION = 8000;
  const key = 'undo|' + title + '|' + msg;
  if (_shownToasts.has(key)) return;
  _shownToasts.add(key);
  setTimeout(() => _shownToasts.delete(key), 30000);

  const el = document.createElement('div');
  el.className = 'toast';
  el.style.setProperty('--toast-clr', 'var(--gn)');
  el.style.position = 'relative';
  el.style.overflow = 'hidden';
  el.innerHTML = `
    <div class="toast-body">
      <div class="toast-title">${esc(title)}</div>
      ${msg ? `<div class="toast-msg">${esc(msg)}</div>` : ''}
      <button class="toast-undo" id="undo-btn-${Date.now()}">↩ Ongedaan maken</button>
    </div>
    <button class="toast-close" data-action="toast-sluiten">×</button>
    <div class="toast-bar" style="animation-duration:${UNDO_DURATION}ms"></div>`;

  const container = document.getElementById('toast-container');
  container.appendChild(el);

  const undoBtn = el.querySelector('.toast-undo');
  undoBtn.onclick = async () => {
    undoBtn.disabled = true;
    undoBtn.textContent = '⏳ Bezig…';
    try { await undoFn(); } catch(e) { alert('Undo mislukt: ' + e.message); }
    dismissToast(el);
  };

  setTimeout(() => dismissToast(el), UNDO_DURATION);
}

async function undoComplete(undoData) {
  if (!await ensureToken()) { alert('Inloggen mislukt.'); return; }
  const { sec, ntdValues, ntdRow } = undoData;
  state._undoInFlight = true; // pauzeer de 8s-poll; deze undo doet z'n eigen loadAll
  try {
    await state._writeChain; // de afronding-write moet eerst klaar zijn vóór we de rij zoeken
    const ids = await getSheetIds();
    const afId = ids['Afgerond'];
    // Verse Afgerond-data en de ZOJUIST afgeronde rij zoeken (nieuwste datum eerst, zelfde
    // sortering als D.af). D.af kan nog verouderd zijn; we matchen op code én pakken de
    // nieuwste, zodat we niet per ongeluk een óúdere afronding met dezelfde code wissen.
    const afData = (parseSections(await fetchSheet('Afgerond')).data[sec] || [])
      .slice().sort((a, b) => parseDt(b.datum) - parseDt(a.datum));
    const doelAf = afData.find(x => x.code === undoData.code) || null;
    if (doelAf) {
      await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SID}:batchUpdate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${state.oauthToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ requests: [{ deleteDimension: { range: { sheetId: afId, dimension: 'ROWS', startIndex: doelAf._row - 1, endIndex: doelAf._row } } }] })
      });
    }
    const insertRow = getInsertRow(sec);
    await insertAndWriteRow('Nog Te Doen', insertRow, ntdValues);
    logEvent(undoData.code, sec, 'Teruggezet', 'status', 'Afgerond', 'Nog Te Doen');
    showToast('↩ Ongedaan gemaakt', `${undoData.code} terug in Nog Te Doen`, 'var(--am)');
    await loadAll();
    const terug=(D.ntd[sec]||[]).filter(x=>x.code===undoData.code).pop();
    if(terug) flashRow('ntd-tbody', terug._row, 'rij-flits-amber');
  } catch(e) { alert('Undo fout: ' + e.message); }
  finally { state._undoInFlight = false; }
}

async function undoDelete(undoData) {
  if (!await ensureToken()) { alert('Inloggen mislukt.'); return; }
  state._undoInFlight = true; // pauzeer de 8s-poll; deze undo doet z'n eigen loadAll
  try {
    await state._writeChain;            // delete-write gegarandeerd vóór de re-insert
    const { sec, ntdValues } = undoData;
    const insertRow = getInsertRow(sec);
    await insertAndWriteRow('Nog Te Doen', insertRow, ntdValues);
    logEvent(undoData.code, sec, 'Teruggezet', 'status', 'Verwijderd', 'Nog Te Doen');
    showToast('↩ Ongedaan gemaakt', `${undoData.code} terug in Nog Te Doen`, 'var(--am)');
    await loadAll();
    const terug=(D.ntd[sec]||[]).filter(x=>x.code===undoData.code).pop();
    if(terug) flashRow('ntd-tbody', terug._row, 'rij-flits-amber');
  } catch(e) { alert('Undo fout: ' + e.message); }
  finally { state._undoInFlight = false; }
}

// ══════════════════════════════════════
//  POLLING — toont toasts voor andere gebruikers
// ══════════════════════════════════════
function getNotifPrefs() {
  return {
    newtask:  localStorage.getItem('notif_newtask')  !== 'false',
    assigned: localStorage.getItem('notif_assigned') !== 'false',
    deadline: localStorage.getItem('notif_deadline') !== 'false',
    alv:      localStorage.getItem('notif_alv')      !== 'false',
    daily:    localStorage.getItem('notif_daily')    !== 'false',
    memo:     localStorage.getItem('notif_memo')     !== 'false',
  };
}

async function pollNotifsForToast() {
  try {
    const r = await fetchSheet('Meldingen');
    if (!r || r.length < 2) return;
    const h = r[0].map(c => (c||'').toString().toLowerCase().trim());
    const iTs=h.indexOf('timestamp'), iTi=h.indexOf('titel'), iIn=h.indexOf('inhoud'), iVo=h.indexOf('voor'), iTy=h.indexOf('type');
    const rows = r.slice(1).reverse()
      .map(row => ({ ts:(row[iTs]||'').toString(), type:(row[iTy]||'').toString(), title:(row[iTi]||'').toString(), body:(row[iIn]||'').toString(), voor:(row[iVo]||'').toString() }))
      .filter(n => n.ts && n.title);
    if (!rows.length) return;

    const who   = getCurrentWho();
    const prefs = getNotifPrefs();
    const typeToPrefs = { n_newtask:'newtask', n_assigned:'assigned', n_deadline:'deadline', n_alv:'alv', n_daily:'daily', n_memo:'memo' };

    // Bij cold-start (_lastNotifTs === null) tonen we GEEN toasts voor al bestaande meldingen;
    // we zetten alleen de basislijn op de echte (server-)timestamp van de nieuwste rij. Voorheen
    // werd die basislijn op de BROWSERklok gezet (state.js), wat bij klokscheef oude meldingen
    // als nieuw toonde of juist nieuwe miste.
    const newRows = state._lastNotifTs == null ? [] : rows.filter(n => n.ts > state._lastNotifTs);
    for (const n of newRows) {
      // Persoonsgerichte melding alleen tonen aan de juiste persoon. Op een apparaat zonder
      // ingestelde naam (who==='') NIET tonen (geen 'who &&'-kortsluiting → anders lekt het).
      if (n.voor && n.voor !== 'allen' && n.voor !== who) continue;
      const prefKey = typeToPrefs[n.type];
      if (prefKey && prefs[prefKey] === false) continue;
      showToast(n.title, n.body, TOAST_COLORS[n.type] || 'var(--ac)');
    }
    if (state._lastNotifTs == null || newRows.length) state._lastNotifTs = rows[0].ts;
  } catch(e) { /* stil falen */ }
}

// Benoemde handler (i.p.v. anoniem) zodat logout() 'm netjes kan loskoppelen, met een
// token-guard zodat een uitgelogde tab niet alsnog gaat pollen/laden.
function onNotifVisibility() {
  if (document.hidden || !state.oauthToken) return;
  pollNotifsForToast();
  // Zelfde guards als de 8s-poll: een loadAll mag geen open modal / bulk-selectie / lopende
  // animatie / undo onder de gebruiker vandaan trekken (resync gooit _rowCache + D om).
  if (document.querySelector('.modal-bg.open')) return;
  if (state.bulkMode || state._animBusy || state._undoInFlight || state.pendingWrites > 0) return;
  if (state._loadInFlight) return; // een lopende/ingeplande poll levert toch verse data → geen extra loadAll erbovenop stapelen bij elke tabwissel
  loadAll(true);
}

function startNotifPoll() {
  pollNotifsForToast();
  if (state._notifPollTimer) clearInterval(state._notifPollTimer); // idempotent: geen dubbele poll
  // hidden-guard: een verborgen tab hoeft de 'Meldingen'-sheet niet elke 10s te lezen (quota/batterij)
  state._notifPollTimer = setInterval(() => { if (document.hidden) return; pollNotifsForToast(); }, 10000);
  document.removeEventListener('visibilitychange', onNotifVisibility);
  document.addEventListener('visibilitychange', onNotifVisibility);
  state._notifVisibilityHandler = onNotifVisibility; // logout() koppelt 'm via state los
}

// ══════════════════════════════════════
//  NOTIFICATIE MODAL
// ══════════════════════════════════════
function openNotifModal() {
  const who = localStorage.getItem('notif_who') || '';
  const known = ['Jer','Cihad','Gabos','Cihan',''];
  if (known.includes(who)) {
    document.getElementById('notif-who').value = who;
    document.getElementById('notif-who-other').style.display = 'none';
  } else {
    document.getElementById('notif-who').value = '__other__';
    document.getElementById('notif-who-other').style.display = '';
    document.getElementById('notif-who-other').value = who;
  }
  ['newtask','assigned','deadline','alv','daily','memo'].forEach(k => {
    const v  = localStorage.getItem('notif_' + k);
    const el = document.getElementById('tog-notif-' + k);
    if (el) { const on = v === null ? true : v === 'true'; el.classList.toggle('on', on); el.setAttribute('aria-checked', on); }
  });
  document.getElementById('notif-deadline-hours').value = localStorage.getItem('notif_deadline_hours') || '1';
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

function getCurrentWho() {
  const sel = document.getElementById('notif-who');
  if (sel) {
    if (sel.value === '__other__') {
      const v = (document.getElementById('notif-who-other').value || '').trim();
      if (v) return v;
    } else if (sel.value) return sel.value;
  }
  const stored = localStorage.getItem('notif_who');
  if (stored) return stored;
  if (state.currentUserEmail) return displayName(state.currentUserEmail);
  return '';
}

async function saveNotifPrefs(forceInit) {
  const who = getCurrentWho();
  if (!who && !forceInit) return;
  if (who) localStorage.setItem('notif_who', who);
  const prefs = {
    newtask:  document.getElementById('tog-notif-newtask').classList.contains('on'),
    assigned: document.getElementById('tog-notif-assigned').classList.contains('on'),
    deadline: document.getElementById('tog-notif-deadline').classList.contains('on'),
    alv:      document.getElementById('tog-notif-alv').classList.contains('on'),
    daily:    document.getElementById('tog-notif-daily').classList.contains('on'),
    memo:     document.getElementById('tog-notif-memo').classList.contains('on'),
  };
  const deadlineHours = document.getElementById('notif-deadline-hours').value || '1';
  Object.entries(prefs).forEach(([k, v]) => localStorage.setItem('notif_' + k, v));
  localStorage.setItem('notif_deadline_hours', deadlineHours);
  if (state.oneSignalReady && state.isSubscribed) {
    try {
      await OneSignal.User.addTags({
        behandelaar: who,
        n_newtask:  prefs.newtask  ? '1' : '0',
        n_assigned: prefs.assigned ? '1' : '0',
        n_deadline: prefs.deadline ? '1' : '0',
        n_alv:      prefs.alv      ? '1' : '0',
        n_daily:    prefs.daily    ? '1' : '0',
        n_memo:     prefs.memo     ? '1' : '0',
        deadline_h: deadlineHours,
      });
      if (who) await OneSignal.login(who);
    } catch(e) { console.warn('Tag sync faalde:', e); }
  }
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
  btn.disabled = true; btn.innerHTML = '⏳ Bezig…';
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
    ['newtask','assigned','deadline','alv','daily','memo'].forEach(k => {
      if (localStorage.getItem('notif_' + k) === null) localStorage.setItem('notif_' + k, 'true');
    });
    if (!localStorage.getItem('notif_deadline_hours')) localStorage.setItem('notif_deadline_hours', '1');
    localStorage.setItem('notif_who', who);
    await saveNotifPrefs(true);
    state.isSubscribed = true;
    refreshNotifUI();
    sendTestNotif(who, 'Notificaties zijn aan! 🔔', 'Je ontvangt voortaan meldingen op dit apparaat.');
  } catch(e) {
    console.error('subscribeNotifs error:', e);
    alert('Aanzetten mislukt: ' + (e.message || e));
  } finally {
    btn.disabled = false; btn.innerHTML = orig;
  }
}

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
  showToast(title || '🧪 Test melding', body || 'Notificaties werken correct!', 'var(--ac)');
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
  fireNotifEvent, TOAST_ICONS, TOAST_COLORS, TOAST_DURATION, showToast, dismissToast, showUndoToast,
  undoComplete, undoDelete, getNotifPrefs, pollNotifsForToast, startNotifPoll, openNotifModal, closeNotifModal,
  refreshNotifUI, onWhoChange, getCurrentWho, saveNotifPrefs, waitForOneSignal, subscribeNotifs,
  unsubscribeNotifs, sendTestNotif,
};
