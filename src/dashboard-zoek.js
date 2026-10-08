// ══════════════════════════════════════
//  DASHBOARD-ZOEK — de zes zoekfilters van de dashboard-chat, uitgevoerd in de browser
// ══════════════════════════════════════
// Claude vraagt een filter aan (zie ../zoek-tools.js), dit bestand voert hem uit op de gegevens die
// het dashboard al heeft geladen (`D`) en geeft een korte tekst terug. Er komt dus geen extra
// leesverzoek bij Google bij, en Claude ziet alleen wat het filter oplevert.
//
// Twee vaste regels, en die zijn de reden dat dit filters zijn en geen grote lap tekst:
//  1. HET FILTER TELT, NIET HET MODEL. Elk resultaat begint met het exacte aantal treffers. Een
//     taalmodel dat zelf regels telt, zit er bij dertig regels geregeld een paar naast.
//  2. HOOGSTENS 25 REGELS. Meer kost tokens zonder dat het antwoord beter wordt; het aantal erboven
//     zegt Claude dat er meer is, zodat hij gerichter kan zoeken of het erbij kan zeggen.
// Alles hier is puur (gegevens en datum gaan erin), zodat het zonder netwerk te toetsen is.
import { SECS, SKEYS } from './config.js';
import { displayName, taakTitel, parseDt, parseOff, opvolgStatus, teLaatVoorTelling,
         offerteAangevraagd, splitBehandelaar, _vandaagAmsterdam, _verschilInKalenderdagen,
         parseAannemers, reconcileOffertes } from './util.js';
import { fmtLogTs, logPaginaSoort } from './render-overig.js';
import { telbaar } from './bundel.js';
import { zonderOpmaak } from './opmaak.js';
import { ZOEK_TOOL_NAMEN } from '../zoek-tools.js';

const MAX_REGELS = 25;
const MAX_TEKST = 220;          // één omschrijving of notitie; een geplakte mail mag niet alles opeten
const DAG_MS = 86400000;

const _kap = (t, n = MAX_TEKST) => {
  const s = zonderOpmaak(String(t || '')).replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n) + '…' : s;
};
const _klein = s => String(s || '').toLowerCase();

// Tabbladnaam zoals Claude hem kent ('Offerte-trajecten') → sleutel in D ('OFFERTE-TRAJECTEN').
const SEC_OP_LABEL = Object.fromEntries(SKEYS.map(k => [_klein(SECS[k].label), k]));
const _secLabel = k => (SECS[k] && SECS[k].label) || k;

// 'jjjj-mm-dd' → ms om 00:00 lokale tijd; ongeldig of leeg → null.
function _invoerDatum(s){
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || '').trim());
  if(!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  return isNaN(d) ? null : d.getTime();
}
// Valt `ms` binnen [van, tot]? Beide grenzen inclusief, 'tot' tot het eind van die dag.
function _inPeriode(ms, van, tot){
  if(van == null && tot == null) return true;
  if(!ms) return false;
  if(van != null && ms < van) return false;
  if(tot != null && ms >= tot + DAG_MS) return false;
  return true;
}

// Matcht een behandelaarveld ('Jer, Cihad') op één naam. Op hele namen en hoofdletterongevoelig:
// 'Jer' mag niet 'Jeroen' vinden.
function _isBehandelaar(veld, naam){
  const n = _klein(naam).trim();
  if(!n) return true;
  return splitBehandelaar(veld).some(b => _klein(b) === n || _klein(displayName(b)) === n);
}

// Alle bekende VvE's: code → naam. Het ALV-overzicht is het register; taken vullen aan.
function _vveRegister(data){
  const reg = new Map();
  (data.alvo || []).forEach(r => { if(r.code) reg.set(r.code, r.naam || ''); });
  SKEYS.forEach(s => (data.ntd?.[s] || []).forEach(r => { if(r.code && !reg.has(r.code)) reg.set(r.code, r.naam || ''); }));
  return reg;
}

// De VvE uit de invoer: een code, of anders een (deel van een) naam die precies één VvE aanwijst.
// Geeft { code } of { fout } terug. Leeg → { code:'' } (= geen filter).
function vindVve(invoer, data){
  const v = String(invoer || '').trim();
  if(!v) return { code: '' };
  const reg = _vveRegister(data);
  if(reg.has(v)) return { code: v };
  // Een VvE die alleen nog in de historie staat (bijv. uit beheer) moet op zijn exacte code wél te
  // vinden zijn: juist dan wil je terugzoeken wat er speelde.
  const inHistorie = SKEYS.some(s => (data.af?.[s] || []).some(r => r.code === v))
    || (data.alfa || []).some(r => r.code === v) || (data.logboek || []).some(r => r.code === v);
  if(inHistorie) return { code: v };
  const treffers = [...reg].filter(([, naam]) => _klein(naam).includes(_klein(v)));
  if(treffers.length === 1) return { code: treffers[0][0] };
  if(treffers.length > 1){
    return { fout: `"${v}" past op ${treffers.length} VvE's: `
      + treffers.slice(0, 8).map(([c, n]) => `${c} (${n})`).join(', ') + '. Gebruik de VvE-code.' };
  }
  return { fout: `VvE "${v}" staat niet in het register.` };
}

// De omschrijving van een taak, met dezelfde volgorde als het dossier (dossier-chat.js).
function _omschrijving(r, sec){
  return (r.actiepunt || r.agendapunten || r.status || r.periode || r.subsidie || r.onderwerp || '').trim()
    || taakTitel(r, sec);
}
function _zoekTekst(r, sec){
  return _klein([r.code, r.naam, _omschrijving(r, sec), r.opmerkingen, r.opmerking, r.aannemers].join(' '));
}

// Kop + regels + eventueel 'nog N meer'. De kop noemt altijd het exacte aantal.
function _resultaat(kop, regels, totaal){
  if(!totaal) return `${kop}: 0 gevonden.`;
  const uit = [`${kop}: ${totaal} gevonden${totaal > MAX_REGELS ? `, de eerste ${MAX_REGELS} hieronder` : ''}.`];
  uit.push(...regels.slice(0, MAX_REGELS));
  if(totaal > MAX_REGELS) uit.push(`… en nog ${totaal - MAX_REGELS} meer (zoek gerichter om die te zien).`);
  return uit.join('\n');
}
function _groepeer(items, sleutel, kop){
  const telling = new Map();
  items.forEach(it => sleutel(it).forEach(k => telling.set(k, (telling.get(k) || 0) + 1)));
  const rijen = [...telling].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
  return `${kop}: ${items.length} in totaal.\n` + rijen.map(([k, n]) => `- ${k}: ${n}`).join('\n');
}
const _groepSleutel = {
  behandelaar: it => { const b = splitBehandelaar(it.r.behandelaar); return b.length ? b.map(displayName) : ['(geen behandelaar)']; },
  tabblad: it => [_secLabel(it.sec)],
  vve: it => [`${it.r.code}${it.r.naam ? ' ' + it.r.naam : ''}`],
  maand: it => { const ms = parseDt(it.r.datum); if(!ms) return ['(geen datum)']; const d = new Date(ms);
                 return [`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`]; },
};

function _secties(tabblad){
  if(!tabblad) return { secs: SKEYS };
  const k = SEC_OP_LABEL[_klein(tabblad)];
  return k ? { secs: [k] } : { fout: `Onbekend tabblad "${tabblad}".` };
}

// ── 1. Open taken ──────────────────────────────────────────────────────────
function zoekTaken(inv, data, vandaag){
  const s = _secties(inv.tabblad); if(s.fout) return s.fout;
  const v = vindVve(inv.vve_code, data); if(v.fout) return v.fout;
  const van = _invoerDatum(inv.deadline_van), tot = _invoerDatum(inv.deadline_tot);
  const woord = _klein(inv.zoekwoord).trim();
  // `telbaar` laat de automatische stap 'offertes voorleggen' weg, net als de pillen bovenin en
  // Analytics. Zonder dat noemde de chat een ander aantal dan het scherm ernaast.
  const tel = telbaar(data.ntd, data.af);
  const items = [];
  s.secs.forEach(sec => (tel.ntd[sec] || []).forEach(r => {
    if(v.code && r.code !== v.code) return;
    if(inv.behandelaar && !_isBehandelaar(r.behandelaar, inv.behandelaar)) return;
    const weg = opvolgStatus(r, vandaag).weggelegd;
    if(inv.weggelegd === true && !weg) return;
    if(inv.weggelegd === false && weg) return;
    const laat = teLaatVoorTelling(r, sec, vandaag);
    if(inv.te_laat === true && !laat) return;
    if(inv.te_laat === false && laat) return;
    if((van != null || tot != null) && !_inPeriode(parseDt(r.deadline), van, tot)) return;
    if(woord && !_zoekTekst(r, sec).includes(woord)) return;
    items.push({ r, sec, laat, weg });
  }));
  if(inv.groepeer_op && _groepSleutel[inv.groepeer_op]) return _groepeer(items, _groepSleutel[inv.groepeer_op], 'Open taken');
  // Te laat eerst, dan de vroegste deadline: wat het eerst aandacht vraagt staat bovenaan.
  items.sort((a, b) => (a.laat === b.laat ? 0 : a.laat ? -1 : 1)
    || (parseDt(a.r.deadline) || Infinity) - (parseDt(b.r.deadline) || Infinity));
  const regels = items.map(({ r, sec, laat, weg }) => {
    const extra = [r.deadline ? `deadline ${r.deadline}` : '', laat ? 'TE LAAT' : '',
      weg ? `weggelegd tot ${r.opvolgdatum}` : '', r.behandelaar ? displayName(r.behandelaar) : ''].filter(Boolean).join(' · ');
    const opm = r.opmerkingen ? ` | opmerking: ${_kap(r.opmerkingen, 120)}` : '';
    return `- [${_secLabel(sec)}] ${r.code}${r.naam ? ' ' + r.naam : ''} — ${_kap(_omschrijving(r, sec))}${extra ? ` (${extra})` : ''}${opm}`;
  });
  return _resultaat('Open taken', regels, items.length);
}

// ── 2. Afgeronde taken ─────────────────────────────────────────────────────
function zoekAfgerond(inv, data){
  const s = _secties(inv.tabblad); if(s.fout) return s.fout;
  const v = vindVve(inv.vve_code, data); if(v.fout) return v.fout;
  const van = _invoerDatum(inv.van), tot = _invoerDatum(inv.tot);
  const woord = _klein(inv.zoekwoord).trim();
  const tel = telbaar(data.ntd, data.af);   // zie zoekTaken
  const items = [];
  s.secs.forEach(sec => (tel.af[sec] || []).forEach(r => {
    if(v.code && r.code !== v.code) return;
    if(inv.behandelaar && !_isBehandelaar(r.behandelaar, inv.behandelaar)) return;
    if(!_inPeriode(parseDt(r.datum), van, tot)) return;
    if(woord && !_zoekTekst(r, sec).includes(woord)) return;
    items.push({ r, sec });
  }));
  if(inv.groepeer_op && _groepSleutel[inv.groepeer_op]) return _groepeer(items, _groepSleutel[inv.groepeer_op], 'Afgeronde taken');
  items.sort((a, b) => parseDt(b.r.datum) - parseDt(a.r.datum));
  const regels = items.map(({ r, sec }) => {
    const extra = [r.datum ? `afgerond ${r.datum}` : '', r.behandelaar ? displayName(r.behandelaar) : ''].filter(Boolean).join(' · ');
    const opm = r.opmerking ? ` | afrondopmerking: ${_kap(r.opmerking, 120)}` : '';
    return `- [${_secLabel(sec)}] ${r.code}${r.naam ? ' ' + r.naam : ''} — ${_kap(_omschrijving(r, sec))}${extra ? ` (${extra})` : ''}${opm}`;
  });
  return _resultaat('Afgeronde taken', regels, items.length);
}

// ── 3. ALV's ───────────────────────────────────────────────────────────────
function zoekAlvs(inv, data){
  const v = vindVve(inv.vve_code, data); if(v.fout) return v.fout;
  const van = _invoerDatum(inv.afgerond_van), tot = _invoerDatum(inv.afgerond_tot);
  if(van != null || tot != null){
    // De archieflijst: per gehouden ALV de dag waarop 'notulen versturen' is afgevinkt.
    const items = (data.alfa || []).filter(r => (!v.code || r.code === v.code) && _inPeriode(parseDt(r.datum), van, tot))
      .sort((a, b) => parseDt(b.datum) - parseDt(a.datum));
    return _resultaat('Afgeronde ALV\'s', items.map(r => `- ${r.code}${r.naam ? ' ' + r.naam : ''} — afgerond op ${r.datum}`), items.length);
  }
  const alle = (data.alvo || []).filter(r => (!v.code || r.code === v.code) && (inv.budget !== true || r.budget));
  const perStatus = ['Open', 'Klaargezet', 'Gepland', 'Afgerond']
    .map(st => `${st} ${alle.filter(r => r.status === st).length}`).join(', ');
  const items = inv.status ? alle.filter(r => r.status === inv.status) : alle;
  const regels = items.map(r => {
    const stappen = [r.klaargezet ? 'agenda klaargezet' : 'agenda nog niet klaargezet',
      r.uitnodiging ? 'uitnodiging verstuurd' : 'uitnodiging nog niet verstuurd',
      r.notulen ? 'notulen verstuurd' : 'notulen nog niet', r.begroting ? 'begroting ja' : 'begroting nee'].join(', ');
    return `- ${r.code}${r.naam ? ' ' + r.naam : ''} — ${r.status} (${stappen})${r.budget ? ' · budgetpakket' : ''}`
      + `${r.opmerkingen && !r.budget ? ` | opmerking: ${_kap(r.opmerkingen, 100)}` : ''}`;
  });
  return `Stand van alle ${alle.length} ALV's per status: ${perStatus}.\n`
    + _resultaat(`ALV's${inv.status ? ` met status ${inv.status}` : ''}`, regels, items.length);
}

// ── 4. Offerte-trajecten ───────────────────────────────────────────────────
function zoekOffertes(inv, data, vandaag){
  const v = vindVve(inv.vve_code, data); if(v.fout) return v.fout;
  const nu = (vandaag || _vandaagAmsterdam()).getTime();
  const items = [];
  (telbaar(data.ntd, data.af).ntd['OFFERTE-TRAJECTEN'] || []).forEach(r => {
    if(v.code && r.code !== v.code) return;
    if(inv.behandelaar && !_isBehandelaar(r.behandelaar, inv.behandelaar)) return;
    const aangevraagd = offerteAangevraagd(r);
    // In kalenderdagen en niet in milliseconden: over de overgang naar zomertijd heen scheelt het
    // anders een uur, en dan valt een traject van precies 30 dagen buiten 'minstens 30'.
    const dagen = aangevraagd ? -_verschilInKalenderdagen(new Date(parseDt(r.datumAangevraagd)), vandaag || new Date(nu)) : null;
    if(inv.min_dagen_open != null && (dagen == null || dagen < inv.min_dagen_open)) return;
    // De teller uit de aannemerslijst, zoals het Offerte-tabblad hem toont. Kolom D zelf loopt achter
    // zodra er een lijst is; het tabblad verrijkt de rij pas bij het tekenen (_verrijkOfferteRij),
    // en na elke poll staat de ruwe waarde er weer.
    const teller = reconcileOffertes(r._offertesManual !== undefined ? r._offertesManual : r.offertes, parseAannemers(r.aannemers));
    const [binnen, gevraagd] = parseOff(teller);
    const stand = !gevraagd ? null : binnen === 0 ? 'geen' : binnen >= gevraagd ? 'alle' : 'deels';
    if(inv.binnen && stand !== inv.binnen) return;
    items.push({ r, dagen, binnen, gevraagd });
  });
  items.sort((a, b) => (b.dagen ?? -1) - (a.dagen ?? -1));
  const regels = items.map(({ r, dagen, binnen, gevraagd }) => {
    const extra = [dagen != null ? `aangevraagd ${r.datumAangevraagd}, ${dagen} dagen open` : 'nog niet aangevraagd',
      gevraagd ? `${binnen}/${gevraagd} offertes binnen` : '', r.behandelaar ? displayName(r.behandelaar) : ''].filter(Boolean).join(' · ');
    return `- ${r.code}${r.naam ? ' ' + r.naam : ''} — ${_kap(taakTitel(r, 'OFFERTE-TRAJECTEN'))} (${extra})`
      + `${r.opmerkingen ? ` | opmerking: ${_kap(r.opmerkingen, 120)}` : ''}`;
  });
  return _resultaat('Offerte-trajecten', regels, items.length);
}

// ── 5. Logboek ─────────────────────────────────────────────────────────────
function zoekLogboek(inv, data){
  const v = vindVve(inv.vve_code, data); if(v.fout) return v.fout;
  const van = _invoerDatum(inv.van), tot = _invoerDatum(inv.tot);
  const woord = _klein(inv.zoekwoord).trim();
  // Een notitie heet in het logboek 'Opmerking' (crud.js, addTaskNote); 'Notitie' bestaat alleen als
  // SOORT contactmoment (actie 'Contact', veld 'Notitie'). Zonder soort dezelfde selectie als de
  // Logboek-pagina (logPaginaSoort): geen kenmerk-, vinkje- of wegleg-ruis.
  const isNotitie = r => r.actie === 'Opmerking' || (r.actie === 'Contact' && r.veld === 'Notitie');
  const items = (data.logboek || []).filter(r => {
    if(v.code && r.code !== v.code) return false;
    if(!logPaginaSoort(r.actie)) return false;
    if(inv.soort === 'contact' && (r.actie !== 'Contact' || isNotitie(r))) return false;
    if(inv.soort === 'notitie' && !isNotitie(r)) return false;
    if(inv.medewerker && _klein(displayName(r.gebruiker)) !== _klein(inv.medewerker).trim()) return false;
    if((van != null || tot != null) && !_inPeriode(new Date(r.timestamp).getTime(), van, tot)) return false;
    if(woord && !_klein([r.code, r.veld, r.oudeWaarde, zonderOpmaak(r.nieuweWaarde)].join(' ')).includes(woord)) return false;
    return true;
  }).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  const regels = items.map(r => {
    const wie = displayName(r.gebruiker) || r.gebruiker || '?';
    const wat = r.actie === 'Contact'
      ? `${r.veld || 'Contact'} met ${r.oudeWaarde || '?'}: ${_kap(r.nieuweWaarde)}`
      : `${r.actie === 'Opmerking' ? 'Notitie' : r.actie}${r.nieuweWaarde ? ': ' + _kap(r.nieuweWaarde) : ''}`;
    return `- ${fmtLogTs(r.timestamp)} · ${r.code || '—'} · (${wie}) ${wat}`;
  });
  return _resultaat('Logboekregels', regels, items.length);
}

// ── Uitvoeren ──────────────────────────────────────────────────────────────
// `opties.dossier` = dossierContextTekst uit dossier-chat.js. Meegegeven in plaats van geïmporteerd,
// omdat dossier-chat.js dit bestand importeert en een kringverwijzing daar niets toevoegt.
function voerZoekUit(naam, invoer, data, vandaag, opties = {}){
  const inv = (invoer && typeof invoer === 'object') ? invoer : {};
  vandaag = vandaag || _vandaagAmsterdam();
  try{
    switch(naam){
      case 'zoek_taken':    return zoekTaken(inv, data, vandaag);
      case 'zoek_afgerond': return zoekAfgerond(inv, data);
      case 'zoek_alvs':     return zoekAlvs(inv, data);
      case 'zoek_offertes': return zoekOffertes(inv, data, vandaag);
      case 'zoek_logboek':  return zoekLogboek(inv, data);
      case 'vve_dossier': {
        const v = vindVve(inv.vve_code, data);
        if(v.fout) return v.fout;
        if(!v.code) return 'Geef een VvE-code op.';
        return opties.dossier ? opties.dossier(v.code, data, vandaag) : 'Dossier niet beschikbaar.';
      }
      default: return `Onbekend filter "${naam}". Beschikbaar: ${ZOEK_TOOL_NAMEN.join(', ')}.`;
    }
  }catch(e){
    // Een fout in één filter mag het gesprek niet stoppen; Claude hoort wat er misging en kan
    // anders zoeken of het eerlijk zeggen.
    return `Dit filter liep vast (${(e && e.message) || 'onbekende fout'}). Probeer een ander filter.`;
  }
}

// Wat de gebruiker ziet terwijl Claude zoekt: 'zoekt in het logboek op "lekkage"…'.
const _WAAR = { zoek_taken: 'de open taken', zoek_afgerond: 'de afgeronde taken', zoek_alvs: 'de ALV\'s',
  zoek_offertes: 'de offertes', zoek_logboek: 'het logboek', vve_dossier: 'het dossier' };
function beschrijfZoek(naam, invoer){
  const inv = invoer || {};
  const bij = [inv.zoekwoord ? `op "${inv.zoekwoord}"` : '', inv.vve_code ? `van ${inv.vve_code}` : '',
    inv.behandelaar ? `van ${inv.behandelaar}` : '', inv.medewerker ? `van ${inv.medewerker}` : '',
    inv.te_laat ? '(te laat)' : '', inv.status ? `(${inv.status})` : ''].filter(Boolean).join(' ');
  return `zoekt in ${_WAAR[naam] || 'het dashboard'}${bij ? ' ' + bij : ''}…`;
}

export { voerZoekUit, beschrijfZoek, vindVve, MAX_REGELS };
