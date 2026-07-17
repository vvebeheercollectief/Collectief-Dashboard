// ══════════════════════════════════════
//  ICONS — centrale custom iconenset (duotone inline-SVG)
//  Zelfde stijl als DASH_ICONS/ALVO_ICONS/TOAST_ICONS: viewBox 24, stroke 1.8,
//  ronde kappen, kleurvlak fill-opacity 0.18 (accent 0.35). Kleur via currentColor.
//  Gebruik: ico('prullenbak')          → SVG die meeschaalt via CSS
//           ico('prullenbak', 13)      → SVG met vaste width/height
//  Nooit een SVG door esc()/textContent/sendTestNotif halen — alleen in innerHTML.
// ══════════════════════════════════════
const _s='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';
const ICONS={
  prullenbak:_s+'<path d="M6.5 7.5l.7 11.6a2 2 0 0 0 2 1.9h5.6a2 2 0 0 0 2-1.9l.7-11.6z" fill="currentColor" fill-opacity="0.18"/><path d="M4 7.5h16"/><path d="M9.5 7.5V6a1.8 1.8 0 0 1 1.8-1.8h1.4A1.8 1.8 0 0 1 14.5 6v1.5"/><path d="M10 11.5v5M14 11.5v5"/></svg>',
  bel:_s+'<path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6z" fill="currentColor" fill-opacity="0.18"/><path d="M10 19a2 2 0 0 0 4 0"/></svg>',
  belUit:_s+'<path d="M8.2 4.7A6 6 0 0 1 18 9c0 3.6 1 5.2 1.6 5.9M6.1 6.9C6 7.6 6 8.3 6 9c0 5-2 6-2 6h13" fill="currentColor" fill-opacity="0.18"/><path d="M10 19a2 2 0 0 0 4 0"/><path d="M4 3.5l16 16"/></svg>',
  telefoon:_s+'<path d="M20.5 16.6v2.6a1.7 1.7 0 0 1-1.9 1.7 17 17 0 0 1-7.4-2.6 16.7 16.7 0 0 1-5.1-5.1A17 17 0 0 1 3.5 5.7 1.7 1.7 0 0 1 5.2 3.8h2.6a1.7 1.7 0 0 1 1.7 1.5c.1.8.3 1.7.6 2.4a1.7 1.7 0 0 1-.4 1.8L8.6 10.6a13.6 13.6 0 0 0 5.1 5.1l1.1-1.1a1.7 1.7 0 0 1 1.8-.4c.7.3 1.6.5 2.4.6a1.7 1.7 0 0 1 1.5 1.8z" fill="currentColor" fill-opacity="0.18"/></svg>',
  envelop:_s+'<path d="M3 6.5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-11z" fill="currentColor" fill-opacity="0.18"/><path d="M3.5 7l8.5 6 8.5-6"/></svg>',
  gesprek:_s+'<path d="M3.5 6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v4.5a2 2 0 0 1-2 2H9.2L6 15.2v-2.7h-.5a2 2 0 0 1-2-2z" fill="currentColor" fill-opacity="0.18"/><path d="M20.5 9.5v5a2 2 0 0 1-2 2H18v2.7l-3.2-2.7h-3.3"/></svg>',
  potlood:_s+'<path d="M4 20l.9-4.1L15.6 5.2a1.9 1.9 0 0 1 2.7 0l.5.5a1.9 1.9 0 0 1 0 2.7L8.1 19.1z" fill="currentColor" fill-opacity="0.18"/><path d="M14.4 6.4l3.2 3.2"/></svg>',
  paperclip:_s+'<path d="M20.2 11.6l-8 8a5 5 0 0 1-7.1-7.1l8.6-8.6a3.4 3.4 0 0 1 4.8 4.8l-8.6 8.6a1.7 1.7 0 0 1-2.4-2.4l7.9-7.9"/></svg>',
  klembord:_s+'<rect x="5" y="4" width="14" height="17" rx="2" fill="currentColor" fill-opacity="0.18"/><rect x="9" y="2.5" width="6" height="3.5" rx="1" fill="currentColor" fill-opacity="0.35"/><path d="M9 11h6M9 14.5h6M9 18h4"/></svg>',
  kalender:_s+'<rect x="4" y="5" width="16" height="16" rx="2" fill="currentColor" fill-opacity="0.18"/><path d="M4 9.5h16"/><path d="M8 3v4M16 3v4"/></svg>',
  persoon:_s+'<circle cx="12" cy="8" r="3.6" fill="currentColor" fill-opacity="0.18"/><path d="M4.8 20c.9-3.4 3.6-5.3 7.2-5.3s6.3 1.9 7.2 5.3" fill="currentColor" fill-opacity="0.18"/></svg>',
  waarschuwing:_s+'<path d="M12 4.2L2.9 19.4a1.2 1.2 0 0 0 1 1.8h16.2a1.2 1.2 0 0 0 1-1.8z" fill="currentColor" fill-opacity="0.18"/><path d="M12 10v4.2"/><path d="M12 17.6h.01"/></svg>',
  kolf:_s+'<path d="M7.6 13.5h8.8l2.2 4.1a2.4 2.4 0 0 1-2.1 3.5h-9a2.4 2.4 0 0 1-2.1-3.5z" fill="currentColor" fill-opacity="0.18" stroke="none"/><path d="M10.8 3.5v5.2L5.4 17.6a2.4 2.4 0 0 0 2.1 3.5h9a2.4 2.4 0 0 0 2.1-3.5L13.2 8.7V3.5"/><path d="M9.5 3.5h5"/></svg>',
  opslaan:_s+'<path d="M4.5 6.5a2 2 0 0 1 2-2h9.6L20.5 8v9.5a2 2 0 0 1-2 2h-12a2 2 0 0 1-2-2z" fill="currentColor" fill-opacity="0.18"/><path d="M8 4.5V9h7V4.7"/><path d="M7.5 19.5v-6h9v6"/></svg>',
  chat:_s+'<path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H10l-4.6 4v-4H6.5A2.5 2.5 0 0 1 4 13.5z" fill="currentColor" fill-opacity="0.18"/><path d="M8.5 9h7M8.5 12h4.5"/></svg>',
  label:_s+'<path d="M4 11.9V5.8A1.8 1.8 0 0 1 5.8 4h6.1a1.8 1.8 0 0 1 1.3.5l6.4 6.4a1.8 1.8 0 0 1 0 2.5l-6.2 6.2a1.8 1.8 0 0 1-2.5 0l-6.4-6.4A1.8 1.8 0 0 1 4 11.9z" fill="currentColor" fill-opacity="0.18"/><circle cx="8.3" cy="8.3" r="1.2"/></svg>',
  zoek:_s+'<circle cx="11" cy="11" r="7" fill="currentColor" fill-opacity="0.18"/><path d="m20.5 20.5-4.6-4.6"/></svg>',
  herhaal:_s+'<path d="M17.5 3.5l3 3-3 3"/><path d="M20.5 6.5H8a4.5 4.5 0 0 0-4.5 4.5v.5"/><path d="M6.5 20.5l-3-3 3-3"/><path d="M3.5 17.5H16a4.5 4.5 0 0 0 4.5-4.5v-.5"/></svg>',
  postvakLeeg:_s+'<path d="M4.5 13.5L7 5.5h10l2.5 8v4a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2z" fill="currentColor" fill-opacity="0.18"/><path d="M4.5 13.5H9a3 3 0 0 0 6 0h4.5"/></svg>',
  postvakIn:_s+'<path d="M4.5 13.5L6.5 7h11l2 6.5v4a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2z" fill="currentColor" fill-opacity="0.18"/><path d="M4.5 13.5H9a3 3 0 0 0 6 0h4.5"/><path d="M12 2.5v6M9.4 6.2L12 8.8l2.6-2.6"/></svg>',
  notitieboek:_s+'<rect x="5" y="3.5" width="14" height="17" rx="2" fill="currentColor" fill-opacity="0.18"/><path d="M9 3.5v17"/><path d="M12.5 8.5h3.5M12.5 12h3.5"/></svg>',
  grafiek:_s+'<path d="M3.5 20.5h17"/><path d="M6 20.5V13a1 1 0 0 1 1-1h1.4a1 1 0 0 1 1 1v7.5z" fill="currentColor" fill-opacity="0.18"/><path d="M10.8 20.5V7a1 1 0 0 1 1-1h1.4a1 1 0 0 1 1 1v13.5z" fill="currentColor" fill-opacity="0.18"/><path d="M15.6 20.5V10a1 1 0 0 1 1-1H18a1 1 0 0 1 1 1v10.5z" fill="currentColor" fill-opacity="0.18"/></svg>',
  oog:_s+'<path d="M2.8 12S6.5 5.7 12 5.7 21.2 12 21.2 12 17.5 18.3 12 18.3 2.8 12 2.8 12z" fill="currentColor" fill-opacity="0.18"/><circle cx="12" cy="12" r="2.7"/></svg>',
  gebouw:_s+'<rect x="6" y="3.5" width="12" height="17" rx="1.2" fill="currentColor" fill-opacity="0.18"/><path d="M4 20.5h16"/><path d="M9.5 7.5h1.5M13 7.5h1.5M9.5 11h1.5M13 11h1.5M9.5 14.5h1.5M13 14.5h1.5"/><path d="M11 20.5v-3h2v3"/></svg>',
  vlag:_s+'<path d="M5.5 3.5v17"/><path d="M5.5 4.5c2.2-1.1 4.2-1.1 6.5 0s4.3 1.1 6.5 0v8.6c-2.2 1.1-4.2 1.1-6.5 0s-4.3-1.1-6.5 0z" fill="currentColor" fill-opacity="0.18"/></svg>',
  feest:_s+'<path d="M6.2 12.4L3.5 20.5l8.1-2.7z" fill="currentColor" fill-opacity="0.35"/><path d="M6.2 12.4l5.4 5.4"/><path d="M12.3 3.5l.4 2.1M18.2 5.8l-1.5 1.5M20.5 11.7l-2.1.4"/><path d="M14.8 9.2c1.2-1.2 2.6-1.4 4-2.4M11.5 11.4c.4-1.9-.3-3.6.4-5.4"/></svg>',
  vinkCirkel:_s+'<circle cx="12" cy="12" r="9" fill="currentColor" fill-opacity="0.18"/><path d="M8 12.5l2.7 2.7L16 9.8"/></svg>',
  checkbox:_s+'<rect x="4.5" y="4.5" width="15" height="15" rx="3" fill="currentColor" fill-opacity="0.18"/><path d="M8.5 12.3l2.6 2.6 4.9-5.4"/></svg>',
  sparkle:_s+'<path d="M12 4l1.9 5.3L19 11.2l-5.1 1.9L12 18.4l-1.9-5.3L5 11.2l5.1-1.9z" fill="currentColor" fill-opacity="0.18"/></svg>',
  zandloper:_s+'<path d="M8 3.5v3.2c0 2 1.6 3.2 4 5.3 2.4-2.1 4-3.3 4-5.3V3.5" fill="currentColor" fill-opacity="0.18"/><path d="M8 20.5v-3.2c0-2 1.6-3.2 4-5.3 2.4 2.1 4 3.3 4 5.3v3.2" fill="currentColor" fill-opacity="0.18"/><path d="M6.5 3.5h11M6.5 20.5h11"/></svg>',
  pauze:_s+'<rect x="6.5" y="4.5" width="4" height="15" rx="1.2" fill="currentColor" fill-opacity="0.18"/><rect x="13.5" y="4.5" width="4" height="15" rx="1.2" fill="currentColor" fill-opacity="0.18"/></svg>',
  afspelen:_s+'<path d="M7.5 4.8v14.4a.8.8 0 0 0 1.2.7l11-7.2a.8.8 0 0 0 0-1.4l-11-7.2a.8.8 0 0 0-1.2.7z" fill="currentColor" fill-opacity="0.18"/></svg>',
  ongedaan:_s+'<path d="M8.5 4.5L4 9l4.5 4.5"/><path d="M4 9h9.5a6.5 6.5 0 0 1 0 13H9"/></svg>',
  kruis:_s+'<path d="M6 6l12 12M18 6L6 18"/></svg>',
  vink:_s+'<path d="M4.5 13l5 5L19.5 6.5"/></svg>',
  plus:_s+'<path d="M12 5v14M5 12h14"/></svg>',
  chevronRechts:_s+'<path d="M9 6l6 6-6 6"/></svg>',
  chevronOnder:_s+'<path d="M6 9l6 6 6-6"/></svg>',
  cirkelOpen:_s+'<circle cx="12" cy="12" r="8" fill="currentColor" fill-opacity="0.18"/></svg>',
  klok:_s+'<circle cx="12" cy="13" r="8" fill="currentColor" fill-opacity="0.18"/><path d="M12 9v4l2.5 2"/><path d="M4.5 5.5l3-2M19.5 5.5l-3-2"/></svg>',
  pijlOmhoog:_s+'<path d="M12 19V5.5M5.5 12L12 5.5 18.5 12"/></svg>',
};
// Vaste maat nodig (bv. in een knoplabel)? ico('naam', 13). Zonder maat schaalt CSS.
const ico=(naam,maat)=>{
  const s=ICONS[naam]||'';
  return maat?s.replace('<svg ',`<svg width="${maat}" height="${maat}" `):s;
};
export { ICONS, ico };
