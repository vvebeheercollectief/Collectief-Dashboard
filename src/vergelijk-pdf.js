// ══════════════════════════════════════
//  VERGELIJK-PDF — bibliotheken laden, PDF's knippen, en (Task 5) de PDF in de huisstijl
//  De bibliotheken staan in vendor/ en laden pas bij gebruik: het dashboard wordt er niet
//  trager van, en de CSP (script-src 'self') hoeft niet te veranderen.
// ══════════════════════════════════════

export function laadScript(src, globaal){
  if(window[globaal]) return Promise.resolve(window[globaal]);
  return new Promise((ok, nee) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => window[globaal] ? ok(window[globaal]) : nee(new Error('Bibliotheek niet geladen: ' + src));
    s.onerror = () => nee(new Error('Bibliotheek niet geladen: ' + src));
    document.head.appendChild(s);
  });
}
const vendor = pad => new URL('vendor/' + pad, document.baseURI).href;
export const laadPdfLib = () => laadScript(vendor('pdf-lib.min.js'), 'PDFLib');

// Pagina `van` t/m `tot` (1-gebaseerd, inclusief) als losse PDF.
export async function knipDeel(PDFLib, bron, van, tot){
  const doc = await PDFLib.PDFDocument.create();
  const nummers = [];
  for(let i = van - 1; i < tot; i++) nummers.push(i);
  for(const p of await doc.copyPages(bron, nummers)) doc.addPage(p);
  return doc.save();
}
