// ══════════════════════════════════════
//  VVE-ZOEKVELD — herbruikbare zoek/kies-component (taakmodal + AI-hulp)
// ══════════════════════════════════════
import { D } from './state.js';
import { esc } from './util.js';

// Pure filter: zoekt case-insensitief op code én naam. Lege query → hele lijst.
function filterVves(q, lijst){
  const z=(q||'').trim().toLowerCase();
  const vves=(lijst||[]).filter(r=>r&&r.code);
  if(!z) return vves;
  return vves.filter(r=>String(r.code).toLowerCase().includes(z)||String(r.naam||'').toLowerCase().includes(z));
}

export { filterVves };
