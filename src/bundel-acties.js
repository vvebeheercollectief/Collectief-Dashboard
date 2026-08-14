// ══════════════════════════════════════
//  BUNDEL-ACTIES — schrijfwegen voor de Takenbundel
// ══════════════════════════════════════
// Drie acties die kolom Q, R en S van 'Nog Te Doen' aanraken: koppelen, ontkoppelen en
// herordenen. Alle drie volgen exact de weg die de rest van het dashboard ook loopt —
// blokkeerOffline() vóór de mutatie, ensureToken(), optimistisch muteren + renderAll(),
// dan backgroundWrite() met een assertRowsMatch() binnen de writeFn.
//
// Wat de rij-guard hier wél en niet ziet (nagezocht in api.js, 2026-08-14):
// FP_KOLOMMEN['Nog Te Doen'] is { tekst:[0,2] } plus de deadline-kolom van de sectie, en
// `vingerafdruk` plakt daar kolom Q (index 16) voor. R en S vallen daar bewust buiten — ze staan
// niet in FP_KOLOMMEN en `_rijNaarCellen` vult ze niet. Twee gevolgen, allebei belangrijk:
//   - Voor bundelId/bundelVolg is er GEEN richting-omkering nodig zoals in bulkVeld. Wat wij
//     wijzigen ziet de guard niet, dus een rij-object dat al optimistisch is bijgewerkt levert
//     dezelfde vingerafdruk op als de rij in de Sheet.
//   - Voor het taaknummer (Q) is die omkering wél nodig, want dat zit er juist wél in en
//     `koppelTaak` kent hem soms pas net toe. Zie daar.
// Wordt FP_KOLOMMEN ooit tot R/S uitgebreid, dan gaan de checks hieronder vals alarm slaan
// (zichtbaar als 'De lijst was net gewijzigd' bij élke stapelactie) en moeten ze meeveranderen.
import { SID } from "./config.js";
import { state, D } from "./state.js";
import { _veiligeRij, assertRowsMatch } from "./api.js";
import { backgroundWrite, blokkeerOffline } from "./data.js";
import { ensureToken } from "./auth.js";
import { showUndoToast } from "./notifications.js";
import { nieuwTaakId } from "./util.js";
import { bouwBundelIndex, bundelVan, volgendeVolg, hernummerLeden, magKoppelen, bundelSleutel } from "./bundel.js";
import { renderAll } from "./main.js";

// ── Opbouw van de schrijfopdrachten (puur, los testbaar) ──────────────────────
// Alles gaat via values:batchUpdate met meerdere bereiken: één atomaire POST, alles-of-niets.
// Zo kan een halve herordening niet bestaan.

// Q:S op de rij van de kop (alleen als die nog geen bundel had) plus Q:S op de rij van de subtaak.
// Kolom Q gaat mee met de waarde die het rij-object nú draagt: één aaneengesloten bereik per rij
// in plaats van twee losse. Voor een rij die zijn taaknummer al had is dat een overschrijving met
// dezelfde waarde; voor een rij van vóór de backfill is het precies de plek waar `koppelTaak` het
// zojuist toegekende nummer kwijt kan.
export function koppelBereiken(sub, kop, bundelId, volg){
  const uit = [];
  if (!(kop.bundelId||'').trim())
    uit.push({ range:`'Nog Te Doen'!Q${kop._row}:S${kop._row}`,
               values:[_veiligeRij([kop.taakId||'', bundelId, '0'])] });
  uit.push({ range:`'Nog Te Doen'!Q${sub._row}:S${sub._row}`,
             values:[_veiligeRij([sub.taakId||'', bundelId, String(volg)])] });
  return uit;
}

// Ontkoppelen wist R en S. Het taaknummer (Q) blijft staan — dat is de identiteit van de taak
// en die mag nooit verdwijnen, anders wordt de rij een wees voor de schrijf-guard.
export function ontkoppelBereiken(r){
  return [{ range:`'Nog Te Doen'!Q${r._row}:S${r._row}`,
            values:[_veiligeRij([r.taakId||'', '', ''])] }];
}

// Herordenen raakt alleen kolom S, en alleen de leden die daadwerkelijk een ander nummer krijgen.
export function herordenBereiken(wijzigingen){
  return (wijzigingen||[]).map(w => ({ range:`'Nog Te Doen'!S${w.r._row}`,
                                       values:[_veiligeRij([String(w.volg)])] }));
}

// ── De schrijfweg zelf ────────────────────────────────────────────────────────
async function schrijfBereiken(data){
  const resp = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SID}/values:batchUpdate`, {
    method:'POST',
    headers:{ Authorization:`Bearer ${state.oauthToken}`, 'Content-Type':'application/json' },
    body: JSON.stringify({ valueInputOption:'USER_ENTERED', data }),
  });
  if (!resp.ok){
    // .catch op het foutlichaam: een 502 van een tussenliggende proxy stuurt HTML, en dan zou
    // resp.json() een SyntaxError zónder .status gooien — die telt als netwerkfout en zet het
    // dashboard onterecht op offline (zelfde reden als in writeRange, api.js).
    const e = await resp.json().catch(() => ({}));
    if (resp.status === 401){ state.oauthToken = null; state.oauthExpiry = 0; }
    const err = new Error(e.error?.message || 'Bundel-actie mislukt'); err.status = resp.status; throw err;
  }
}

// Rijnummer aanwezig? assertRowsMatch filtert een check ZONDER rijnummer er stil uit en keert dan
// zonder één lezing terug — de schrijfactie zou daarna ongecontroleerd naar een bereik als
// 'Nog Te Doen'!Qundefined gaan. Liever hier stoppen met een melding die de gebruiker kan volgen.
function heeftRij(...rijen){
  if (rijen.every(r => r && r._row)) return true;
  alert('Deze taak is niet meer op zijn plek te vinden. Vernieuw de pagina en probeer het opnieuw.');
  return false;
}

// Hang `sub` als subtaak onder `doel`.
export async function koppelTaak(sub, doel){
  if (blokkeerOffline()) return;
  if (!await ensureToken()){ alert('Inloggen mislukt. Probeer het opnieuw.'); return; }
  if (!heeftRij(sub, doel)) return;
  const ix = bouwBundelIndex(D.ntd, D.af);
  const check = magKoppelen(sub, doel, ix);
  if (!check.mag){ alert(check.reden); return; }

  // Rij van vóór de backfill (kolom Q leeg): eerst een taaknummer toekennen. Voor de kop moet dat
  // wel — zonder nummer is er niets om als bundelnummer naar te wijzen. Voor de subtaak moet het
  // óók: lidmaatschap is een verwijzing tussen taken mét identiteit, en `bouwBundelIndex` laat een
  // rij zonder taaknummer in 'Afgerond' bewust buiten de bundel vallen. Een subtaak zonder nummer
  // zou dus stil uit zijn eigen bundel verdwijnen zodra hij wordt afgevinkt.
  // De cel wordt hier toch al beschreven (koppelBereiken zet Q, R en S in één bereik), dus dit
  // kost geen extra schrijfverkeer.
  const oudSubNr = sub.taakId, oudKopNr = doel.taakId;
  if (!(doel.taakId||'').trim()) doel.taakId = nieuwTaakId();
  if (!(sub.taakId||'').trim())  sub.taakId  = nieuwTaakId();
  const bundelId = bundelSleutel(check.bundelId || doel.taakId);
  const leden = bundelVan(ix, doel);
  const volg = leden ? volgendeVolg(leden) : '10';

  const oudSub = { bundelId: sub.bundelId, bundelVolg: sub.bundelVolg };
  const oudKop = { bundelId: doel.bundelId, bundelVolg: doel.bundelVolg };
  const data = koppelBereiken(sub, doel, bundelId, volg);

  // Optimistisch: meteen zichtbaar, daarna pas wegschrijven — zelfde patroon als afronden.
  if (!(doel.bundelId||'').trim()){ doel.bundelId = bundelId; doel.bundelVolg = '0'; }
  sub.bundelId = bundelId; sub.bundelVolg = volg;
  // Via bundelSleutel, want state.bundelOpen wordt op precies die sleutel gelezen; een ongetrimde
  // sleutel erin zou een bundel opleveren die wel opengaat maar nooit meer dicht.
  state.bundelOpen.add(bundelId);
  renderAll();

  // Ongedaan maken = gewoon weer ontkoppelen, maar pas nádat de koppel-write klaar is: die twee
  // schrijven naar dezelfde cellen, en de wachtrij van backgroundWrite zou de ontkoppeling er
  // anders vóór kunnen zetten (zelfde volgorde-eis als bij de bulk-undo).
  // De kop houdt zijn bundelnummer; die is met één lid geen bundel meer (isBundel eist er twee)
  // en wordt dus weer als gewone taakrij getekend.
  showUndoToast('Gestapeld', `onder ${doel.naam||doel.code}`,
    async () => { await state._writeChain; await ontkoppelTaak(sub); }, 'plus');
  backgroundWrite(
    async () => {
      // Bescherming: beide rijen moeten nog dezelfde TAAK zijn. Het taaknummer gaat als OUDE
      // waarde mee, want dat is wat er nu in de Sheet staat — hierboven kan er net een vers nummer
      // aan het rij-object gehangen zijn dat er nog niet is weggeschreven. Zonder die omkering
      // vergelijkt de guard 'T:<nieuw>' met een rij zónder nummer en zou élke koppeling op een
      // rij van vóór de backfill gegarandeerd afketsen. (Voor bundelId/bundelVolg is dezelfde
      // omkering niet nodig — zie de kop van dit bestand.)
      await assertRowsMatch([
        { row: sub._row,  r: { ...sub,  taakId: oudSubNr } },
        { row: doel._row, r: { ...doel, taakId: oudKopNr } },
      ]);
      await schrijfBereiken(data);
    },
    () => { sub.bundelId = oudSub.bundelId; sub.bundelVolg = oudSub.bundelVolg; sub.taakId = oudSubNr;
            doel.bundelId = oudKop.bundelId; doel.bundelVolg = oudKop.bundelVolg; doel.taakId = oudKopNr; },
    'Stapelen mislukt'
  );
}

// Maak van een subtaak weer een losse taak.
export async function ontkoppelTaak(r){
  if (blokkeerOffline()) return;
  if (!await ensureToken()){ alert('Inloggen mislukt. Probeer het opnieuw.'); return; }
  if (!heeftRij(r)) return;
  const oud = { bundelId: r.bundelId, bundelVolg: r.bundelVolg };
  const data = ontkoppelBereiken(r);
  r.bundelId = ''; r.bundelVolg = '';
  renderAll();
  backgroundWrite(
    async () => { await assertRowsMatch([{ row: r._row, r }]); await schrijfBereiken(data); },
    () => { r.bundelId = oud.bundelId; r.bundelVolg = oud.bundelVolg; },
    'Ontkoppelen mislukt'
  );
}

// Eén schrijfronde volgnummers: de rij-controle en de schrijfactie in één closure, gedeeld door de
// sleepactie en zijn undo. Bewust gedeeld: de undo schrijft naar dezelfde rijnummers, maar pas
// seconden later — juist dán is de kans het grootst dat er intussen een rij is bijgekomen of weg
// is, en dus juist dáár mag de guard niet ontbreken.
const schrijfVolg = wijzigingen => async () => {
  await assertRowsMatch(wijzigingen.map(w => ({ row: w.r._row, r: w.r })));
  await schrijfBereiken(herordenBereiken(wijzigingen));
};

// Nieuwe volgorde vastleggen na slepen. `nieuweVolgorde` is de lijst leden in de gewenste
// volgorde ({r, af}-objecten uit de index).
export async function herordenBundel(nieuweVolgorde){
  if (blokkeerOffline()) return;
  if (!await ensureToken()){ alert('Inloggen mislukt. Probeer het opnieuw.'); return; }
  const wijzigingen = hernummerLeden(nieuweVolgorde);
  if (!wijzigingen.length) return;                      // niets veranderd → geen verzoek
  if (!heeftRij(...wijzigingen.map(w => w.r))) return;
  // De oude nummers in dezelfde vorm als `wijzigingen`, zodat de undo exact dezelfde weg loopt.
  // `?? ''` en niet `|| ''`: 0 is een echt volgnummer (zo begint een verse bundel) en moet als '0'
  // terugkomen, terwijl een ontbrekend veld anders als de tekst 'undefined' in de cel zou landen.
  const oud = wijzigingen.map(w => ({ r: w.r, volg: w.r.bundelVolg ?? '' }));
  wijzigingen.forEach(w => { w.r.bundelVolg = w.volg; });
  renderAll();

  showUndoToast('Volgorde gewijzigd', '', async () => {
    // Eerst de lopende schrijfactie afwachten en dán pas terugzetten: draaide de undo ervoorheen,
    // dan zou de heenweg de teruggezette nummers alsnog overschrijven (zelfde volgorde-eis als bij
    // de bulk-undo). En blokkeerOffline erná, want anders staat het scherm op 'oud' terwijl de
    // Sheet de nieuwe volgorde houdt.
    await state._writeChain;
    if (blokkeerOffline()) return;
    oud.forEach(o => { o.r.bundelVolg = o.volg; });
    renderAll();
    backgroundWrite(schrijfVolg(oud), () => { wijzigingen.forEach(w => { w.r.bundelVolg = w.volg; }); }, 'Undo mislukt');
  }, 'herhaal');

  backgroundWrite(
    schrijfVolg(wijzigingen),
    () => { oud.forEach(o => { o.r.bundelVolg = o.volg; }); },
    'Volgorde opslaan mislukt'
  );
}
