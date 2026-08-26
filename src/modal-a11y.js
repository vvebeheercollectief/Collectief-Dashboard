// ══════════════════════════════════════
//  MODAL-A11Y — generieke toegankelijkheid voor alle .modal-bg-vensters
//  Eén observer markeert elk venster als dialoog, focust bij openen het eerste
//  veld, houdt Tab binnen het venster (focus-trap) en geeft de focus bij sluiten
//  terug aan het element dat het venster opende. Geen wijziging aan de losse
//  open/sluit-functies nodig: het werkt op de gedeelde .modal-bg + .open-class.
//
//  Daarnaast loopt hier bij het opstarten één pas over het scherm die drie dingen
//  koppelt die in de HTML alleen VISUEEL bij elkaar staan: het label bij zijn veld,
//  de schakelaar bij zijn tekst, en het venster bij zijn kop. Bewust hier en niet
//  50× met de hand in index.html — dan moet elk nieuw veld er zelf aan denken, en
//  dat is precies wat er tot nu toe misging (48 labels zonder `for`).
// ══════════════════════════════════════

// Waar de focus vandaan kwam, PER venster. Vensters kunnen gestapeld openstaan — het
// bevestigingsvenster komt bovenop het bewerkscherm — en met één gedeelde variabele overschreef het
// bovenste venster bij openen het herkomst-element van het venster eronder. Dat onderste venster
// gaf de focus daarna aan niets meer terug.
const _herkomst = new WeakMap();

function _focusbare(container) {
  return [...container.querySelectorAll(
    'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'
  )].filter(el => el.offsetParent !== null); // verborgen velden (display:none) overslaan
}

// Het venster dat Escape en de Tab-trap moeten bedienen. Normaal is dat het enige open venster;
// staan er twee open, dan het venster met `data-bovenop` — dat is de bevestigingsvraag, die per
// definitie over de rest heen komt (zie src/bevestig.js). Zonder deze regel valt `querySelector`
// terug op HTML-volgorde en zou Escape het bewerkscherm ónder de vraag sluiten, met de vraag
// verweesd in beeld.
export function bovensteModal() {
  return document.querySelector('.modal-bg.open[data-bovenop]')
      || document.querySelector('.modal-bg.open');
}

// Een id waar we er een nodig hebben om naar te wijzen. Alleen uitdelen als het element er
// nog geen heeft: bestaande id's zijn overal aanknopingspunten voor code en tests.
let _hulpTeller = 0;
function _zorgVoorId(el, voorvoegsel) {
  if (!el.id) el.id = `${voorvoegsel}-${++_hulpTeller}`;
  return el.id;
}

// ── Label ↔ veld ────────────────────────────────────────────────────────
// De vensters schrijven `<div class="fld"><label>Deadline</label><input id="m-dl"></div>`:
// het label staat NAAST het veld, niet eromheen, en zonder `for`. Voor het oog klopt dat,
// maar de koppeling bestaat alleen in de opmaak. Gevolg: een schermlezer noemt het veld
// naamloos ("invoerveld, leeg") en een klik op het woord 'Deadline' zet de cursor nergens.
// Deze pas legt de koppeling alsnog, per veldvak.
export function koppelFormulierLabels(root = document) {
  let gekoppeld = 0;
  root.querySelectorAll('label:not([for])').forEach(label => {
    // Een label dat zijn veld al ómvat is programmatisch wél gekoppeld; `for` zou daar niets
    // toevoegen (de Budgetpakket-vinkjes doen het zo).
    if (label.querySelector('input, select, textarea')) return;
    const vak = label.parentElement;
    if (!vak) return;
    const velden = [...vak.querySelectorAll('input:not([type=hidden]), select, textarea')];
    if (!velden.length) return;                    // een kop boven knoppen, geen veldlabel
    label.setAttribute('for', _zorgVoorId(velden[0], 'veld'));
    gekoppeld++;
    // Staan er méér bedieningen in hetzelfde vak (de offerte-teller, 'Wie ben jij?' met het
    // eigen-naam-veld), dan wijst `for` er maar één aan. De rest krijgt dezelfde tekst als
    // eigen naam, anders blijven ze naamloos — met hun plaatshouder erachter als die er is,
    // want dat is precies wat ze onderscheidt.
    velden.slice(1).forEach(veld => {
      if (veld.getAttribute('aria-label') || veld.getAttribute('aria-labelledby')) return;
      const kern = (label.textContent || '').trim();
      const extra = (veld.placeholder || '').trim();
      veld.setAttribute('aria-label', extra ? `${kern} — ${extra}` : kern);
    });
  });
  return gekoppeld;
}

// ── Schakelaar ↔ tekst ──────────────────────────────────────────────────
// `<button role="switch" class="tog"></button><span>In behandeling</span>`: de knop is leeg,
// de betekenis staat ernaast. Zonder koppeling kondigt een schermlezer 'schakelaar, uit' aan
// zonder te zeggen wáárvan. Negen stuks: vier keer 'In behandeling' en vijf meldingsvoorkeuren.
export function benoemSchakelaars(root = document) {
  let benoemd = 0;
  root.querySelectorAll('[role="switch"]').forEach(knop => {
    if (knop.getAttribute('aria-label') || knop.getAttribute('aria-labelledby')) return;
    if ((knop.textContent || '').trim()) return;   // heeft zelf al tekst
    const tekstEl = [...(knop.parentElement ? knop.parentElement.children : [])]
      .find(el => el !== knop && (el.textContent || '').trim());
    if (!tekstEl) return;
    knop.setAttribute('aria-labelledby', _zorgVoorId(tekstEl, 'schakelaar-tekst'));
    benoemd++;
  });
  return benoemd;
}

export function initModalA11y() {
  koppelFormulierLabels();
  benoemSchakelaars();
  document.querySelectorAll('.modal-bg').forEach(bg => {
    const venster = bg.querySelector('.modal, .pal') || bg.firstElementChild;
    if (venster) {
      venster.setAttribute('role', 'dialog');
      venster.setAttribute('aria-modal', 'true');
      // Een dialoog zonder naam wordt aangekondigd als kaal 'dialoog'. Elk venster hééft een
      // zichtbare kop; die is meteen de naam. Niet overschrijven als het venster er zelf al een
      // meegekregen heeft — het commandopalet doet dat, want zijn kop is een invoerveld.
      const kop = bg.querySelector('.modal-hdr h2');
      if (kop && !venster.getAttribute('aria-label') && !venster.getAttribute('aria-labelledby'))
        venster.setAttribute('aria-labelledby', _zorgVoorId(kop, 'venster-kop'));
      // Het sluitkruisje is een '×'. Voorgelezen wordt dat 'maal' of 'vermenigvuldigingsteken';
      // een echte naam maakt er 'Sluiten, knop' van.
      bg.querySelectorAll('.modal-close:not([aria-label])').forEach(k => k.setAttribute('aria-label', 'Sluiten'));
    }
    const obs = new MutationObserver(() => {
      const open = bg.classList.contains('open');
      if (open && bg.dataset._a11yOpen !== '1') {
        bg.dataset._a11yOpen = '1';
        _herkomst.set(bg, document.activeElement);
        // `data-autofocus` gaat vóór: een venster mag zelf aanwijzen wat de focus krijgt. Het
        // bevestigingsvenster gebruikt dat om op Annuleren te beginnen in plaats van op het
        // kruisje — het verschijnt juist als er iets op het spel staat. De regel eronder blijft
        // voor alle formuliervensters: daar is het eerste invoerveld de logische plek.
        const eerste = bg.querySelector('[data-autofocus]')
                    || bg.querySelector('input:not([type=hidden]),textarea,select')
                    || _focusbare(bg)[0];
        // Alleen als het venster er dan nóg staat. Een venster dat binnen die 30 ms alweer dicht is
        // — een snelle klik op de bevestigingsvraag — zou de focus anders naar een onzichtbare knop
        // trekken, en wel ná de terugzetting in de tak hieronder.
        if (eerste) setTimeout(() => {
          if (!bg.classList.contains('open')) return;
          try { eerste.focus(); } catch (_) {}
        }, 30);
      } else if (!open && bg.dataset._a11yOpen === '1') {
        bg.dataset._a11yOpen = '0';
        const terug = _herkomst.get(bg);
        _herkomst.delete(bg);
        if (terug && terug.focus) { try { terug.focus(); } catch (_) {} }
      }
    });
    obs.observe(bg, { attributes: true, attributeFilter: ['class'] });
  });

  // Tab-trap: houd de focus binnen het bovenste open venster.
  document.addEventListener('keydown', e => {
    if (e.key !== 'Tab') return;
    const open = bovensteModal();
    if (!open) return;
    const f = _focusbare(open);
    if (!f.length) return;
    const eerste = f[0], laatste = f[f.length - 1];
    // Eerst: staat de focus HELEMAAL BUITEN het venster? Dat is niet zeldzaam — klik in een open
    // venster op iets dat geen focus kan krijgen (een kop, een stuk uitleg) en `activeElement`
    // valt terug op <body>. Dan matchte geen van de twee takken hieronder, greep de val niet in,
    // en tabde je gewoon de pagina áchter het venster in: bij een bevestigingsvraag over
    // verwijderen sta je dan met Tab op de knoppen van de lijst eronder.
    if (!open.contains(document.activeElement)) { e.preventDefault(); (e.shiftKey ? laatste : eerste).focus(); return; }
    if (e.shiftKey && document.activeElement === eerste) { e.preventDefault(); laatste.focus(); }
    else if (!e.shiftKey && document.activeElement === laatste) { e.preventDefault(); eerste.focus(); }
  });
}
