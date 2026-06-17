// ══════════════════════════════════════
//  URGENTIE — pure motor voor de Dagstart-cockpit (zie spec 2026-06-17)
// ══════════════════════════════════════
// Bundelt deadline + dagen-stil + opvolgen-vandaag + LOD-gewicht tot één score (0–100)
// met de zwaarst wegende reden. Gewichten zijn richtinggevend (afgestemd via tests.js).
import {
  PRIO_REGELS, STIL_ESCALATIE_REGELS, berekenPrioriteit, opvolgStatus,
  offerteBriefingFeiten, _vandaagAmsterdam, _verschilInKalenderdagen,
} from './util.js';

const STIL_DREMPEL = 4;

// Dagen sinds de laatste logboek-activiteit van deze taak (code + sectie).
// Spiegelt bepaalStil() in render-lijsten.js: alleen taken IN BEHANDELING, niet weggelegd.
// Geeft null als er geen activiteit-data is. Geen drempel hier — die past urgentieScore toe.
export function dagenStil(taak, sec, logboek, vandaag){
  vandaag = vandaag || _vandaagAmsterdam();
  if (!taak) return null;
  if (opvolgStatus(taak, vandaag).weggelegd) return null;
  if (taak.inBehandeling !== 'TRUE') return null;
  const entries = (logboek || []).filter(e => e.code === taak.code && (!sec || e.sectie === sec));
  if (!entries.length) return null;
  let laatst = null;
  entries.forEach(e => {
    const t = e.timestamp ? new Date(e.timestamp) : null;
    if (t && !isNaN(t) && (!laatst || t > laatst)) laatst = t;
  });
  if (!laatst) return null;
  return _verschilInKalenderdagen(vandaag, laatst); // positief = dagen geleden
}

// Eén urgentie-score + reden + label voor een taak.
export function urgentieScore(taak, sec, opts){
  opts = opts || {};
  const vandaag = opts.vandaag || _vandaagAmsterdam();
  const logboek = opts.logboek || [];
  const { dagenTot, teLaat } = berekenPrioriteit(taak && taak.deadline, sec, vandaag);
  const reg = PRIO_REGELS[sec] || { hoog: 7, midden: 14 };

  let dPts = 0, dTxt = '';
  const dStr = n => `${n} ${n === 1 ? 'dag' : 'dagen'}`;
  if (dagenTot === null) { dPts = 0; }
  else if (teLaat) { dPts = Math.min(90, 65 + Math.abs(dagenTot) * 5); dTxt = `deadline ${dStr(Math.abs(dagenTot))} te laat`; }
  else if (dagenTot <= reg.hoog) {
    dPts = Math.round(20 + (1 - dagenTot / reg.hoog) * 30);
    dTxt = sec === 'LOD' ? `officiële LOD-termijn — nog ${dStr(dagenTot)}` : `deadline over ${dStr(dagenTot)}`;
  }
  else if (dagenTot <= reg.midden) { dPts = 12; dTxt = `deadline over ${dStr(dagenTot)}`; }
  else { dPts = 4; dTxt = 'deadline nog ver weg'; }

  const stilReg = STIL_ESCALATIE_REGELS[sec] || { trap1: 7, trap2: 14 };
  const dS = dagenStil(taak, sec, logboek, vandaag);
  let sPts = 0;
  if (dS !== null && dS >= STIL_DREMPEL) {
    if (dS < stilReg.trap1) sPts = Math.round((dS - STIL_DREMPEL) / Math.max(1, stilReg.trap1 - STIL_DREMPEL) * 10);
    else if (dS < stilReg.trap2) sPts = 12 + Math.round((dS - stilReg.trap1) / Math.max(1, stilReg.trap2 - stilReg.trap1) * 10);
    else sPts = 25;
  }
  const sTxt = (dS !== null && dS >= STIL_DREMPEL) ? `${dS} dagen geen activiteit` : '';

  const oPts = opvolgStatus(taak, vandaag).vandaag ? 15 : 0;
  const lPts = sec === 'LOD' ? 20 : 0;

  const score = Math.min(100, dPts + sPts + oPts + lPts);
  const termen = [
    { pts: dPts, txt: dTxt },
    { pts: sPts, txt: sTxt },
    { pts: oPts, txt: 'opvolgafspraak voor vandaag' },
    { pts: lPts, txt: 'officiële LOD-termijn weegt extra' },
  ];
  let top = termen[0];
  termen.forEach(t => { if (t.pts > top.pts) top = t; });
  const reden = (top.pts > 0 && top.txt) ? top.txt : 'geen urgentie';
  const label = score >= 70 ? 'vandaag' : score >= 40 ? 'deze-week' : 'later';
  return { score, reden, label };
}

// Hoort deze taak bij <naam>? behandelaar kan meerdere namen bevatten (',' of '/').
export function isVanMij(taak, naam){
  if (!naam) return false;
  const b = ((taak && taak.behandelaar) || '') + '';
  return b.split(/[,/]/).map(s => s.trim().toLowerCase()).filter(Boolean).includes(naam.toLowerCase());
}

// Kantoorbrede signalen voor de let-op-strook. D = de geparste secties (state.D).
// Elk signaal: { soort:'danger'|'warning'|'info', icon, tekst }.
export function letOpSignalen(D, opts){
  opts = opts || {};
  const vandaag = opts.vandaag || _vandaagAmsterdam();
  const logboek = opts.logboek || [];
  const out = [];
  const lod = (D && D['LOD']) || [];
  const lodNabij = lod
    .map(r => ({ r, p: berekenPrioriteit(r.deadline, 'LOD', vandaag) }))
    .filter(x => x.p.dagenTot !== null && x.p.dagenTot <= 7);
  if (lodNabij.length) {
    lodNabij.sort((a, b) => a.p.dagenTot - b.p.dagenTot);
    const e = lodNabij[0];
    out.push({ soort:'danger', icon:'alert', tekst:
      `LOD ${e.r.naam || e.r.code} ${e.p.teLaat ? 'is over de termijn' : `verloopt over ${e.p.dagenTot} ${e.p.dagenTot===1?'dag':'dagen'}`}` });
  }
  const SECS_ALL = ['OPPAKKEN','VERGADERVERZOEKEN','OFFERTE-TRAJECTEN','LOD'];
  let langStil = 0;
  SECS_ALL.forEach(sec => ((D && D[sec]) || []).forEach(r => {
    const reg = STIL_ESCALATIE_REGELS[sec];
    const dS = dagenStil(r, sec, logboek, vandaag);
    if (dS !== null && reg && dS >= reg.trap2) langStil++;
  }));
  if (langStil) out.push({ soort:'warning', icon:'clock', tekst:
    `${langStil} ${langStil===1?'taak ligt':'taken liggen'} lang stil` });
  const offFeiten = offerteBriefingFeiten((D && D['OFFERTE-TRAJECTEN']) || [], vandaag);
  if (offFeiten.klaarTeGunnen) out.push({ soort:'info', icon:'file', tekst:
    `${offFeiten.klaarTeGunnen} ${offFeiten.klaarTeGunnen===1?'offerte wacht':'offertes wachten'} op gunning` });
  return out;
}
