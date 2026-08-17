// ══════════════════════════════════════
//  MODAL-A11Y — generieke toegankelijkheid voor alle .modal-bg-vensters
//  Eén observer markeert elk venster als dialoog, focust bij openen het eerste
//  veld, houdt Tab binnen het venster (focus-trap) en geeft de focus bij sluiten
//  terug aan het element dat het venster opende. Geen wijziging aan de losse
//  open/sluit-functies nodig: het werkt op de gedeelde .modal-bg + .open-class.
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

export function initModalA11y() {
  document.querySelectorAll('.modal-bg').forEach(bg => {
    const venster = bg.querySelector('.modal, .pal') || bg.firstElementChild;
    if (venster) {
      venster.setAttribute('role', 'dialog');
      venster.setAttribute('aria-modal', 'true');
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
    if (e.shiftKey && document.activeElement === eerste) { e.preventDefault(); laatste.focus(); }
    else if (!e.shiftKey && document.activeElement === laatste) { e.preventDefault(); eerste.focus(); }
  });
}
