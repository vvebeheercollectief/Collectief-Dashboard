// ══════════════════════════════════════
//  MIGRATIE-START — TIJDELIJK BESTAND (uitrol v12.5, 2026-09-02). Mag na de migratie weg.
//
//  Waarvoor: de eenmalige migratie starten in een pagina die AL draait en AL ingelogd is,
//  zonder de console te gebruiken. Wordt door NIETS geïmporteerd — de modulegraaf vanaf main.js
//  raakt dit bestand niet — en doet dus alleen iets als het met de hand als
//      <script type="module" src="./src/migratie-start.js">
//  aan de pagina wordt toegevoegd. Een bezoeker die de site normaal opent laadt hem nooit.
//
//  De uitslag landt in het attribuut data-migratie-uitslag op <html>, zodat hij van BUITEN de
//  module af te lezen is (een afgeschermde scriptomgeving deelt wél de DOM, niet de modules).
//
//  De import draagt bewust een querystring: mislukt een eerdere import van dezelfde URL, dan
//  onthoudt de browser die fout en gooit élke volgende import van díe URL hem opnieuw. Met een
//  afwijkende URL komt er een verse kopie van dit ene bestand — terwijl al zijn eigen imports
//  (state, crud, main, …) zonder querystring blijven en dus de instanties van de draaiende app
//  zijn. Dat is precies wat nodig is: verse startcode, dezelfde gegevens en hetzelfde token.
// ══════════════════════════════════════
const el = document.documentElement;
el.dataset.migratieUitslag = 'bezig';
import('./migratie-offerte.js?start=1')
  .then(m => m.migreerOfferteStappen())
  .then(uit => { el.dataset.migratieUitslag = 'KLAAR: ' + uit; console.log('[migratie]', uit); })
  .catch(e => { el.dataset.migratieUitslag = 'FOUT: ' + ((e && e.message) || e); console.error('[migratie]', e); });
