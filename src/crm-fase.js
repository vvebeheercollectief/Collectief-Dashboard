// ══════════════════════════════════════
//  CRM-FASE — vier stappen, opgeslagen als woord in kolom D van het CRM-blok
// ══════════════════════════════════════
// Een vraag van een eigenaar: binnengekomen, iemand pakt hem op, soms wachten we op een ander
// (bestuur, aannemer, de eigenaar zelf), en dan is hij beantwoord. Afronden (het vinkje) is de
// vijfde, echte stap: dan is de vraag afgehandeld en verhuist hij naar Afgerond.
//
// VOLLEDIG LOS VAN SUBSIDIE. Eigen woorden, eigen klikactie ('crm-fase'), eigen veld (`crmFase`).
// Alleen de tekening van de balk is gedeeld (bouwFaseRij), zie subsidie-fase.js.
//
// Puur, net als subsidie-fase.js: alleen esc() en de gedeelde tekening, geen render- of api-import.
// De schrijfweg (zetCrmFase) staat in crud.js.
import { bouwFaseRij } from './subsidie-fase.js';

// 'Opgepakt' en bewust niet 'In behandeling': dat woord is al de kolom H (een collega heeft de taak
// opgepakt), en bij Subsidie gaf die dubbele betekenis verwarring.
export const CRM_FASES = ['Ontvangen', 'Opgepakt', 'Wacht op reactie', 'Beantwoord'];

// Woord → 1-gebaseerd stapnummer. Onbekend, leeg of null = 1 (Ontvangen).
export function crmFaseIndex(woord) {
  const w = ((woord == null ? '' : woord) + '').trim().toLowerCase();
  const i = CRM_FASES.findIndex(f => f.toLowerCase() === w);
  return i < 0 ? 1 : i + 1;
}

// Stapnummer → woord. Buiten bereik = het eerste woord.
export function crmFaseWoord(n) {
  return CRM_FASES[(n | 0) - 1] || CRM_FASES[0];
}

// Moet deze overgang in het logboek? null als er niets te melden is, anders {van, naar}. Eén bron
// voor beide wegen: een klik op een bolletje in de rij, en Opslaan in het bewerkscherm.
export function crmFaseWijziging(oud, nieuw){
  const o = ((oud == null ? '' : oud) + '').trim();
  const n = ((nieuw == null ? '' : nieuw) + '').trim();
  if (!n || n === o) return null;
  // Leeg en de eerste stap tonen hetzelfde bolletje; dat invullen is geen overgang. Zonder dit
  // schreef de eerste klik of Opslaan op een verplaatste rij 'Fase gewijzigd X (was X)' (naloop 25-09).
  if (!o && n.toLowerCase() === CRM_FASES[0].toLowerCase()) return null;
  return { van: o || CRM_FASES[0], naar: n };
}

export function crmFaseRijHtml(huidig, rid, extraClass) {
  return bouwFaseRij(CRM_FASES, crmFaseIndex(huidig), rid,
                     'crm-fase ' + (extraClass || ''), 'crm-fase', 'Fase van deze vraag');
}
