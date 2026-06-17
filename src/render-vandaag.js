// ══════════════════════════════════════
//  RENDER-VANDAAG — Dagstart-cockpit (zie spec 2026-06-17)
// ══════════════════════════════════════
import { D, state } from './state.js';
import { SKEYS } from './config.js';
import { displayName, esc } from './util.js';
import { urgentieScore, isVanMij, letOpSignalen } from './urgentie.js';

let _scope = 'mijn';      // 'mijn' | 'iedereen'
let _scopeVoorEmail = null; // e-mail waarvoor _scope geldt — reset bij gebruikerswissel/uitloggen

const SOORT_CLS = { danger:'lo-danger', warning:'lo-warning', info:'lo-info' };
const LABEL_CLS = { 'vandaag':'u-vandaag', 'deze-week':'u-week', 'later':'u-later' };

function alleTaken(){
  const ntd = D.ntd || {}; // open taken zijn gesleuteld per sectie binnen D.ntd
  return SKEYS.flatMap(sec => (ntd[sec] || []).map(r => ({ r, sec })));
}

const SEC_FALLBACK = { 'OFFERTE-TRAJECTEN':'Offerte-traject', 'VERGADERVERZOEKEN':'Vergaderverzoek' };

function rowHtml(item){
  const { r, sec, u } = item;
  const titel = r.actiepunt || r.agendapunten || r.periode || SEC_FALLBACK[sec] || '—';
  return `<div class="vd-row ${LABEL_CLS[u.label]||''}" data-action="vve-open" data-code="${esc(r.code)}" title="Open VvE-dossier">
    <span class="vd-bar"></span>
    <div class="vd-body">
      <div class="vd-top"><span class="vd-actie">${esc(titel)}</span><span class="vd-reden">${esc(u.reden)}</span></div>
      <div class="vd-meta">${esc(r.code)}${r.naam?` · ${esc(r.naam)}`:''}</div>
    </div>
  </div>`;
}

export function renderVandaag(){
  const host = document.getElementById('dash-vandaag');
  if (!host) return;
  const email = state.currentUserEmail || '';
  if (email !== _scopeVoorEmail) { _scope = 'mijn'; _scopeVoorEmail = email; } // andere/uitgelogde gebruiker → terug naar eigen lijst
  const naam = displayName(email) || '';
  const opts = { logboek: D.logboek || [] };

  let items = alleTaken().map(it => ({ ...it, u: urgentieScore(it.r, it.sec, opts) }));
  if (_scope === 'mijn' && naam) items = items.filter(it => isVanMij(it.r, naam));
  items.sort((a, b) => b.u.score - a.u.score);

  const top = items.slice(0, 3);
  const rest = items.slice(3);
  const sig = letOpSignalen(D.ntd || {}, opts);

  const uur = new Date().getHours();
  const groet = uur < 6 ? 'Goedenacht' : uur < 12 ? 'Goedemorgen' : uur < 18 ? 'Goedemiddag' : 'Goedenavond';
  const datumRaw = new Date().toLocaleDateString('nl-NL', { weekday:'long', day:'numeric', month:'long' });
  const datum = datumRaw.charAt(0).toUpperCase() + datumRaw.slice(1);
  const wieTxt = _scope === 'mijn'
    ? (naam ? `${items.length} ${items.length===1?'taak':'taken'} voor jou` : 'log in voor je eigen lijst')
    : `${items.length} ${items.length===1?'taak':'taken'} kantoorbreed`;

  const sigHtml = sig.map(s => `<span class="vd-lo ${SOORT_CLS[s.soort]||''}">${esc(s.tekst)}</span>`).join('');
  const topHtml = top.length ? top.map(rowHtml).join('') : `<div class="vd-leeg">Niks dringends — mooi!</div>`;
  const restHtml = rest.length ? `<div class="vd-sub">Verder vandaag</div>${rest.map(rowHtml).join('')}` : '';

  host.innerHTML = `
    <div class="vd-head">
      <div><div class="vd-groet">${esc(groet)}${naam?`, ${esc(naam)}`:''}</div><div class="vd-datum">${esc(datum)} · ${esc(wieTxt)}</div></div>
      <div class="vd-toggle" id="vd-toggle">
        <span class="${_scope==='mijn'?'on':''}" data-scope="mijn">Mijn</span><span class="${_scope==='iedereen'?'on':''}" data-scope="iedereen">Iedereen</span>
      </div>
    </div>
    ${sigHtml ? `<div class="vd-lo-strip">${sigHtml}</div>` : ''}
    <div class="vd-eerst-lbl">Doe dit eerst</div>
    <div class="vd-lijst">${topHtml}</div>
    ${restHtml ? `<div class="vd-lijst vd-rest">${restHtml}</div>` : ''}`;

  const tog = document.getElementById('vd-toggle');
  if (tog) tog.addEventListener('click', e => {
    const b = e.target.closest('[data-scope]'); if (!b) return;
    _scope = b.dataset.scope; renderVandaag();
  });
}
