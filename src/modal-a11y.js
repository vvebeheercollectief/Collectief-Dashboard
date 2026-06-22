// ══════════════════════════════════════
//  MODAL-A11Y — generieke toegankelijkheid voor alle .modal-bg-vensters
//  Eén observer markeert elk venster als dialoog, focust bij openen het eerste
//  veld, houdt Tab binnen het venster (focus-trap) en geeft de focus bij sluiten
//  terug aan het element dat het venster opende. Geen wijziging aan de losse
//  open/sluit-functies nodig: het werkt op de gedeelde .modal-bg + .open-class.
// ══════════════════════════════════════

let _laatsteFocus = null;

function _focusbare(container) {
  return [...container.querySelectorAll(
    'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'
  )].filter(el => el.offsetParent !== null); // verborgen velden (display:none) overslaan
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
        _laatsteFocus = document.activeElement;
        const eerste = bg.querySelector('input:not([type=hidden]),textarea,select') || _focusbare(bg)[0];
        if (eerste) setTimeout(() => { try { eerste.focus(); } catch (_) {} }, 30);
      } else if (!open && bg.dataset._a11yOpen === '1') {
        bg.dataset._a11yOpen = '0';
        if (_laatsteFocus && _laatsteFocus.focus) { try { _laatsteFocus.focus(); } catch (_) {} }
        _laatsteFocus = null;
      }
    });
    obs.observe(bg, { attributes: true, attributeFilter: ['class'] });
  });

  // Tab-trap: houd de focus binnen het bovenste open venster.
  document.addEventListener('keydown', e => {
    if (e.key !== 'Tab') return;
    const open = document.querySelector('.modal-bg.open');
    if (!open) return;
    const f = _focusbare(open);
    if (!f.length) return;
    const eerste = f[0], laatste = f[f.length - 1];
    if (e.shiftKey && document.activeElement === eerste) { e.preventDefault(); laatste.focus(); }
    else if (!e.shiftKey && document.activeElement === laatste) { e.preventDefault(); eerste.focus(); }
  });
}
