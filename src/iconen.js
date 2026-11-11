// ══════════════════════════════════════
//  ICONEN — de eigen iconen van de huisstijl (dak van 45°, rechte lijnen), als SVG-tekst
// ══════════════════════════════════════
// Paden overgenomen uit het ontwerpsysteem 'VvE Beheer Collectief' (component Icoon). Ze nemen de
// tekstkleur over. Decoratief: aria-hidden; de knop of link eromheen draagt de naam.
const PADEN = {
  klaar:       'M5 12L10 17L19 8',
  document:    'M6 3H14L18 7V21H6ZM14 3V7H18M9 11h6M9 14h6M9 17h4',
  financien:   'M17 6L15 4H10L7 7V17L10 20H15L17 18M5 10h8M5 14h8',
  vergadering: 'M3 14H21M5 14V20M19 14V20M5 7h3.5v3.5H5ZM10.25 7h3.5v3.5h-3.5ZM15.5 7h3.5v3.5h-3.5Z',
  notulen:     'M6 3H18V21H6ZM9 7h6M9 10h6M9 13h6M9 16h3',
  zoeken:      'M8 5H12L15 8V12L12 15H8L5 12V8ZM14 14L20 20',
  informatie:  'M9 3H15L21 9V15L15 21H9L3 15V9ZM12 11V17M12 7v1',
  sluiten:     'M6 6L18 18M18 6L6 18',
  menu:        'M4 7H20M4 12H20M4 17H20',
  potlood:     'M4 20L5 15L15 5L19 9L9 19ZM13 7L17 11',
  vernieuwen:  'M20 7V3M20 7H16M20 7L17 4H9L4 9V15L9 20H15L20 15',
  uitloggen:   'M14 4H19V20H14M4 12H14M10 8L14 12L10 16',
};
export function icoon(naam, grootte=20){
  const d=PADEN[naam]; if(!d) return '';
  return `<svg class="icoon" width="${grootte}" height="${grootte}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true"><path d="${d}"/></svg>`;
}
// Het vinkje in een afvinkrondje.
export const ICOON = {
  vink: icoon('klaar', 14),
  potlood: icoon('potlood', 16),
};
