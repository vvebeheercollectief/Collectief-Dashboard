// ══════════════════════════════════════
//  BEVESTIGING — het eigen ja/nee-venster van de app
// ══════════════════════════════════════
// `window.confirm()` doet functioneel precies wat we willen, maar Chrome tekent hem bovenaan het
// scherm, met de URL van de site erboven, los van de app. Elk ánder venster hier (afronden,
// bewerken, wegleggen, ALV-reset) is een gecentreerde eigen modal; deze vraag hoorde dat ook te
// zijn. De opmaak komt daarom volledig uit de bestaande .modal-klassen — er is geen eigen
// vormgeving bijgekomen, alleen een z-index (styles.css) voor het stapelen.
//
// Één venster in de HTML (#bevestig-bg), één functie ernaartoe. Titel, tekst en het label van de
// bevestigknop worden per vraag gezet, zodat er geen tweede weg naast deze ontstaat.
//
// Het grote verschil met `confirm()`: die blokkeert de hele pagina tot er geklikt is, en kon dus
// midden in een gewone functie staan. Dit venster niet — `vraagBevestiging` geeft een Promise die
// pas afloopt bij de klik. Aanroepers worden daarmee `if(!await vraagBevestiging(…)) return;`.
//
// En dat verschil heeft een staart die nergens anders staat opgeschreven. `confirm()` legde de
// JS-thread stil, dus er kón tijdens de vraag geen achtergrondcode lopen. Over een `await` heen kan
// dat wél. De 8s-poll is daar tegen beschermd (main.js remt op `.modal-bg.open` — #bevestig-bg
// draagt die class — en op `state.bulkMode`), maar de stille resync in de `finally` van
// `backgroundWrite` niet: die doet onvoorwaardelijk `if(state.pendingWrites===0){ loadAll(true) }`
// (data.js). Loopt er dus nog een schrijfactie van een vórige handeling af terwijl deze vraag
// openstaat, dan bouwt `parseSections`/`parseHerhaal` een VERS D — en de rij-objecten die de
// aanroeper over de `await` heen vasthoudt (`rows` in bulk.js, `state._snoozeRow`,
// `state.herhaalEditRow`) zitten daar niet meer in. Het gevolg bij 'ja' verschilt per weg — alle
// drie nagelopen, want één symptoom voor alle drie opschrijven zou hier onwaar zijn:
//   - `bulkVerwijderen` (bulk.js): `arr.indexOf(it.r)` geeft -1, de rij verdwijnt dus niet uit het
//     scherm, én `_shiftNtdRows(it.origRow,-1)` schuift verse objecten op een verouderd rijnummer.
//   - `deleteHerhaal` (render-herhaal.js): ook een `indexOf`, maar op `D.herhaal` en met een eigen
//     `x._row--`-lus; `_shiftNtdRows` komt daar niet aan te pas.
//   - `schrijfOpvolgdatum` (snooze.js): geen van beide. Daar wordt `r.opvolgdatum` op het
//     losgeraakte object gezet, waarna `renderAll()` het simpelweg niet toont.
//
// Niet gerepareerd, wel bewust. De Sheet zelf is gedekt: élke schrijfweg hierachter draait eerst
// `assertRowMatch`/`assertRowsMatch`, en die vergelijkt de doelrij vóór het schrijven en geeft
// anders de 'lijst was net gewijzigd'-melding. Het scherm wordt bij de eerstvolgende resync weer
// recht getrokken. En het is niet met dit venster ontstaan: `deleteTaskRow` (crud.js) houdt zijn
// rij-object al even lang vast over een `await` en staat zo op productie. Wie het toch wil
// dichtzetten: geef die resync dezelfde remmen als de poll — en regel dán dat hij alsnog een keer
// komt, want hij zet ook de statusbalk terug op 'Live'.

// De nog niet beantwoorde vraag: de resolve-functie van de openstaande Promise, of null als er
// geen venster staat. Dit is meteen de dubbelklik-rem — zie `vraagBevestiging`.
let _openVraag = null;

/**
 * Stelt een ja/nee-vraag in een eigen venster.
 * @param {{titel?:string, tekst?:string, bevestigTekst?:string, gevaarlijk?:boolean}} opties
 * @returns {Promise<boolean>} true = de gebruiker koos de bevestigknop.
 */
export function vraagBevestiging(opties = {}) {
  // Dubbelklik-rem. Twee snelle klikken op Afronden leveren twee aanroepen op, en zonder deze regel
  // zou de tweede het venster opnieuw vullen en de eerste Promise voor altijd laten hangen. De
  // tweede krijgt daarom meteen 'nee': de vraag die er al staat blijft ongemoeid, en het is
  // dezelfde handeling — één antwoord hoort te volstaan. (Er is bewust geen wachtrij: de twee
  // aanroepers zijn allebei een directe klik van de gebruiker, er is geen achtergrondproces dat
  // hier iets te vragen heeft.)
  if (_openVraag) return Promise.resolve(false);

  const bg = document.getElementById('bevestig-bg');
  const titelEl = document.getElementById('bevestig-titel');
  const tekstEl = document.getElementById('bevestig-tekst');
  const jaEl = document.getElementById('bevestig-ja');
  // Ontbreekt het venster, dan kúnnen we het niet vragen. Dan is 'nee' het antwoord: de aanroeper
  // breekt af en er verandert niets — beter dan een niet-gestelde vraag als 'ja' opvatten.
  if (!bg || !titelEl || !tekstEl || !jaEl) return Promise.resolve(false);

  const { titel = 'Weet je het zeker?', tekst = '', bevestigTekst = 'Doorgaan', gevaarlijk = false } = opties;
  titelEl.textContent = titel;
  tekstEl.textContent = tekst;
  jaEl.textContent = bevestigTekst;
  // `btn-del` is de rode knop die 'Verwijder' in het bewerkscherm en 'Reset' in het
  // ALV-resetvenster al gebruiken; `btn-pri` de gewone. Volledig overschrijven i.p.v. classList
  // toggelen, zodat de knop niet de kleur van een vórige vraag meesleept.
  jaEl.className = gevaarlijk ? 'btn btn-del' : 'btn btn-pri';
  bg.classList.add('open');
  // De focus komt niet hier vandaan maar uit modal-a11y.js: die ziet de .open-class erbij komen en
  // focust het element met `data-autofocus` (de Annuleren-knop). Zo loopt dit venster langs
  // dezelfde weg als alle andere, in plaats van er een eigen focus-regel naast te zetten.
  return new Promise(resolve => { _openVraag = resolve; });
}

/**
 * Sluit het venster en beantwoordt de openstaande vraag. Elke uitweg loopt hierlangs — de twee
 * knoppen, het kruisje, een klik naast het venster en Escape (allemaal geknoopt in main.js).
 * Alles behalve de bevestigknop is 'nee'.
 * @param {boolean} ja
 */
export function beantwoordBevestiging(ja) {
  const resolve = _openVraag;
  // Leegzetten hoort bij het SLUITEN, niet bij het antwoord: `_openVraag` is de rem uit
  // `vraagBevestiging`, en zolang hij gezet is telt het venster als open. Twee keer beantwoorden
  // (Escape ná een klik) doet daardoor niets meer. Dat dit vóór de `resolve` staat is netjes maar
  // niet dragend — `resolve` laat de wachtende `await` pas als microtask verdergaan, dus er is
  // geen moment waarop de aanroeper loopt terwijl de rem nog vastzit.
  _openVraag = null;
  document.getElementById('bevestig-bg')?.classList.remove('open');
  if (resolve) resolve(!!ja);
}

/** Staat er een onbeantwoorde vraag? Alleen voor de zelftest. */
export function _vraagStaatOpen() { return _openVraag !== null; }
