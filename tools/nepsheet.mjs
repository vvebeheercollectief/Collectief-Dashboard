// Nagebootste Google Sheet voor de zelftest (src/tests.js) en voor schermafbeeldingen.
// Beantwoordt dezelfde verzoeken als de Sheets-API v4 die het dashboard doet: values (lezen,
// schrijven, append), values:batchGet, :batchUpdate (rij invoegen/verwijderen, cellen, tabblad
// aanmaken/kopiëren) en de lijst met tabbladen. Waarden zijn tekst, vinkjes 'TRUE'/'FALSE'.
// Niet publiek: tools/ gaat niet mee in de build (tools/bouw.mjs).
const kolNr = s => s.split('').reduce((n,c)=>n*26+c.charCodeAt(0)-64,0)-1;
function a1(bereik){
  const m=bereik.match(/^'((?:[^']|'')*)'(?:!(.*))?$/) || bereik.match(/^([^!]+)(?:!(.*))?$/);
  const tab=m[1].replace(/''/g,"'"), rest=m[2]||'';
  const deel=s=>{ const x=s.match(/^([A-Z]+)?(\d+)?$/); return { c:x[1]!=null?kolNr(x[1]):null, r:x[2]!=null?+x[2]:null }; };
  const [a,b]=rest ? rest.split(':') : ['',''];
  const A=a?deel(a):{ c:0, r:null }, B=b?deel(b):(a?deel(a):{ c:null, r:null });
  return { tab, c1:A.c??0, r1:A.r??1, c2:B.c, r2:B.r };
}
const leeg = v => v==null || v==='';
function trim(rows){
  const uit=rows.map(r=>{ const k=r.slice(); while(k.length && leeg(k[k.length-1])) k.pop(); return k; });
  while(uit.length && !uit[uit.length-1].length) uit.pop();
  return uit;
}
export class NepSheet{
  constructor(tabs){
    this.tabs={}; this.volg=100; this.verzoeken=[];
    Object.entries(tabs).forEach(([t,rows],i)=>{ this.tabs[t]={ sheetId:this.volg++, index:i, rows:rows.map(r=>r.map(v=>v==null?'':String(v))) }; });
  }
  tab(naam){ return this.tabs[naam]; }
  lees(bereik){
    const b=a1(bereik), t=this.tabs[b.tab];
    if(!t) throw Object.assign(new Error(`Unable to parse range: ${bereik}`), { status:400 });
    const tot=b.r2??t.rows.length;
    const rows=[];
    for(let r=b.r1; r<=tot; r++){ const rij=t.rows[r-1]||[]; rows.push(rij.slice(b.c1, b.c2==null?undefined:b.c2+1)); }
    return trim(rows);
  }
  schrijf(bereik, waarden, userEntered=true){
    const b=a1(bereik), t=this.tabs[b.tab];
    if(!t) throw Object.assign(new Error(`Unable to parse range: ${bereik}`), { status:400 });
    waarden.forEach((rij,i)=>{
      const r=b.r1-1+i; while(t.rows.length<=r) t.rows.push([]);
      rij.forEach((v,j)=>{ let s=v==null?'':String(v); if(userEntered && s.startsWith("'")) s=s.slice(1); const c=b.c1+j; while(t.rows[r].length<=c) t.rows[r].push(''); t.rows[r][c]=s; });
    });
  }
  voegToe(bereik, waarden){
    const b=a1(bereik), t=this.tabs[b.tab];
    if(!t) throw Object.assign(new Error(`Unable to parse range: ${bereik}`), { status:400 });
    let laatste=0; t.rows.forEach((r,i)=>{ if(r.some(v=>!leeg(v))) laatste=i+1; });
    t.rows.splice(laatste, 0, ...waarden.map(()=>[]));
    this.schrijf(`'${b.tab.replace(/'/g,"''")}'!A${laatste+1}`, waarden);
  }
  opId(id){ const e=Object.entries(this.tabs).find(([,v])=>v.sheetId===id); if(!e) throw Object.assign(new Error('sheetId onbekend'),{status:400}); return e[1]; }
  batch(requests){
    // Eerst alles controleren (Google voert een batch als geheel uit of niet), dan uitvoeren.
    for(const q of requests){
      if(q.addSheet && this.tabs[q.addSheet.properties.title]) throw Object.assign(new Error(`A sheet with the name "${q.addSheet.properties.title}" already exists.`), { status:400 });
    }
    for(const q of requests){
      if(q.insertDimension){ const { sheetId, startIndex, endIndex }=q.insertDimension.range; this.opId(sheetId).rows.splice(startIndex, 0, ...Array.from({length:endIndex-startIndex},()=>[])); }
      else if(q.deleteDimension){ const { sheetId, startIndex, endIndex }=q.deleteDimension.range; this.opId(sheetId).rows.splice(startIndex, endIndex-startIndex); }
      else if(q.updateCells){
        const rg=q.updateCells.range, t=this.opId(rg.sheetId);
        q.updateCells.rows.forEach((rij,i)=>rij.values.forEach((c,j)=>{
          const r=rg.startRowIndex+i, k=(rg.startColumnIndex||0)+j; while(t.rows.length<=r) t.rows.push([]); while(t.rows[r].length<=k) t.rows[r].push('');
          const u=c.userEnteredValue||{}; t.rows[r][k]= 'boolValue' in u ? (u.boolValue?'TRUE':'FALSE') : String(u.stringValue??'');
        }));
      }
      else if(q.repeatCell){
        const rg=q.repeatCell.range, t=this.opId(rg.sheetId), u=q.repeatCell.cell.userEnteredValue;
        for(let r=rg.startRowIndex;r<rg.endRowIndex;r++) for(let k=rg.startColumnIndex;k<rg.endColumnIndex;k++){ while(t.rows.length<=r) t.rows.push([]); while(t.rows[r].length<=k) t.rows[r].push(''); t.rows[r][k]=('boolValue' in u)?(u.boolValue?'TRUE':'FALSE'):String(u.stringValue??''); }
      }
      else if(q.addSheet){ this.tabs[q.addSheet.properties.title]={ sheetId:this.volg++, index:Object.keys(this.tabs).length, rows:[] }; }
      else if(q.duplicateSheet){ const bron=this.opId(q.duplicateSheet.sourceSheetId); this.tabs[q.duplicateSheet.newSheetName]={ sheetId:this.volg++, index:q.duplicateSheet.insertSheetIndex, rows:bron.rows.map(r=>r.slice()) }; }
      else throw Object.assign(new Error('Onbekend verzoek in de nep-Sheet: '+Object.keys(q)), { status:400 });
    }
    return { replies: requests.map(()=>({})) };
  }
  // Beantwoordt een fetch zoals de Sheets-API dat doet.
  antwoord(url, opts={}){
    const u=new URL(url), m=(opts.method||'GET').toUpperCase(), body=opts.body?JSON.parse(opts.body):null;
    this.verzoeken.push(m+' '+decodeURIComponent(u.pathname.split('/').slice(4).join('/'))+(u.search.includes('ranges=')?'':''));
    const json=(o,status=200)=>new Response(JSON.stringify(o), { status, headers:{ 'Content-Type':'application/json' } });
    try{
      const pad=decodeURIComponent(u.pathname);
      if(pad.endsWith(':batchUpdate')) return json(this.batch(body.requests));
      if(pad.includes('/values:batchGet')){
        const ranges=u.searchParams.getAll('ranges');
        return json({ valueRanges: ranges.map(r=>({ range:r, values:this.lees(r) })) });
      }
      const vi=pad.indexOf('/values/');
      if(vi>=0){
        let bereik=pad.slice(vi+8);
        if(bereik.endsWith(':append')){ this.voegToe(bereik.slice(0,-7), body.values); return json({}); }
        if(m==='PUT'){ this.schrijf(bereik, body.values); return json({}); }
        return json({ range:bereik, values:this.lees(bereik) });
      }
      return json({ sheets: Object.entries(this.tabs).map(([title,t])=>({ properties:{ sheetId:t.sheetId, title, index:t.index, gridProperties:{ rowCount:Math.max(1000,t.rows.length), columnCount:26 } } })) });
    }catch(e){ return json({ error:{ message:e.message, code:e.status||500 } }, e.status||500); }
  }
}

// Een realistische beginstand: alle zes de oude blokken, zodat de grenzen getoetst worden.
const KOP = ['VvE Code','VvE','Omschrijving','Status','Wie','Deadline','Opmerkingen','In behandeling'];
export const ntd = () => [
  ['OPPAKKEN'], KOP, ['1042','VvE Lindehof','Oude taak die blijft staan','','Jer','01-10-2026','','FALSE'],
  [],
  ['VERGADERVERZOEKEN'], KOP, ['1187','VvE Parkzicht','week 45','agenda','Cihad','10-11-2026','','FALSE'],
  ['OFFERTE-TRAJECTEN'], KOP,
  ['LOD'], KOP,
  ['1042','VvE Lindehof','Achterstand bijdrage nr. 18','Eerste aanmaning verstuurd','Cihan','6 november 2026','','FALSE','','','','','','','','','Tl001'],
  ['1187','VvE Parkzicht','Achterstand servicekosten nr. 31','Wacht op betalingsregeling','Jer','14 november 2026','Eigenaar belt terug','FALSE','','','','','','','','','Tl002'],
  ['1712','VvE Duinpark','Achterstand bijdrage appartement 7','Tweede brief verstuurd','Cihad','20 november 2026','','FALSE'],
  ['SUBSIDIE-TRAJECTEN'], KOP,
  ['1529','VvE Hofzicht','SVVE verduurzaming','In behandeling','Jer','15 december 2026','','FALSE','','','','','','','','','Ts001'],
  ['1455','VvE Westerhaven','ISDE zonnepanelen','Aangevraagd','Cihad','28 november 2026','','FALSE','','','','','','','','','Ts002'],
  ['CRM'], KOP, ['1310','VvE De Kroonwerf','Vraag over de parkeerplaats','','Cihan','12-11-2026','','FALSE'],
];
export const af = () => [
  ['OPPAKKEN'], KOP, ['LOD'], KOP, ['1603','VvE Oranjestaete','Oud dossier','Afgerond','Gabos','','','','01-09-2026'],
  ['SUBSIDIE-TRAJECTEN'], KOP, ['CRM'], KOP,
];
export const alvo = () => [
  ['VvE Code','VvE Naam','Uitnodiging','Notulen','Begroting','Opmerkingen','Klaargezet'],
  ['Totaal','','','','','',''],
  ['1042','VvE Lindehof','TRUE','FALSE','TRUE','','TRUE'],
  ['1187','VvE Parkzicht','FALSE','FALSE','FALSE','','TRUE'],
  ['1455','VvE Westerhaven','FALSE','FALSE','FALSE','Budget','FALSE'],
  ['1529','VvE Hofzicht','TRUE','TRUE','TRUE','','TRUE'],
  ['1712','VvE Duinpark','FALSE','FALSE','FALSE','',''],
];
export const alfa = () => [['VvE Code','VvE Naam','Datum afgerond'], ['1529','VvE Hofzicht','15 oktober 2026'], ['1310','VvE De Kroonwerf','22-10-2026']];


// Voorbeeldgegevens voor schermafbeeldingen: verzonnen VvE's en taken, echte teamnamen.
export function demo(){
  const taken=[
    ['ID','Eigenaar','Taak','VvE-code','VvE','Notitie','Aangemaakt','Afgevinkt'],
    ['M1','Jer','Nieuwe VvE-map aanmaken in Drive','','','Voor VvE Kanaalzicht','02-11-2026 09:10',''],
    ['M2','Jer','Accountant bellen over de jaarafsluiting','','','','03-11-2026 10:00',''],
    ['M3','Jer','Polis opstalverzekering doorsturen aan eigenaar nr. 12','1712','VvE Duinpark','','04-11-2026 11:30',''],
    ['M4','Jer','Bestuur bellen over de lekkage op de derde etage','1310','VvE De Kroonwerf','','05-11-2026 14:00',''],
    ['M5','Jer','Tweede offerte liftonderhoud opvragen','1529','VvE Hofzicht','Eerste leverancier reageert niet','06-11-2026 09:00',''],
    ['M6','Jer','Jaarstukken naar de kascommissie sturen','1455','VvE Westerhaven','','09-11-2026 16:20',''],
    ['M7','Jer','Offertes dakgoot doorsturen aan het bestuur','1042','VvE Lindehof','Twee van de drie offertes zijn binnen','10-11-2026 08:45',''],
    ['M8','Cihad','Opdracht schilderwerk bevestigen aan de schilder','1187','VvE Parkzicht','','09-11-2026 10:00',''],
    ['M9','Cihad','Hertaxatie herbouwwaarde uitzetten','1712','VvE Duinpark','Besloten op de ALV van 14 oktober','09-11-2026 11:00',''],
    ['M10','Cihad','Beschikking subsidie controleren','1042','VvE Lindehof','','10-11-2026 09:00',''],
    ['M11','Cihad','Inloggegevens bank aanvragen','','','','10-11-2026 09:30',''],
    ['M12','Gabos','Uitnodiging ALV klaarzetten','1603','VvE Oranjestaete','','08-11-2026 15:00',''],
    ['M13','Gabos','Datum prikken met het bestuur','1820','VvE Kanaalzicht','Voorkeur voor een dinsdagavond','09-11-2026 12:00',''],
    ['M14','Gabos','Presentielijst ALV inscannen','1529','VvE Hofzicht','','10-11-2026 08:00',''],
    ['M15','Cihan','Eigenaar terugbellen over de servicekosten','1187','VvE Parkzicht','','10-11-2026 09:15',''],
    ['M16','Cihan','Aannemer bellen over de lekkage','1310','VvE De Kroonwerf','','10-11-2026 09:40',''],
  ];
  const n=ntd();
  // Een vierde LOD-dossier en een derde subsidie, zodat de lijsten op het echte werk lijken.
  const iLod=n.findIndex(r=>r[0]==='SUBSIDIE-TRAJECTEN');
  n.splice(iLod, 0, ['1603','VvE Oranjestaete','Incasso eigenaar nr. 4','Bij de deurwaarder','Gabos','1 december 2026','','FALSE','','','','','','','','','Tl004']);
  const iSub=n.findIndex(r=>r[0]==='CRM');
  n.splice(iSub, 0, ['1042','VvE Lindehof','Gemeentelijke subsidie groen dak','Voorbereiden','Gabos','12 november 2026','','FALSE','','','','','','','','','Ts003']);
  const a=alvo();
  a.push(['1820','VvE Kanaalzicht','FALSE','FALSE','FALSE','',''], ['1904','VvE Molenhoek','TRUE','TRUE','FALSE','','TRUE'],
         ['2011','VvE Rozenhof','FALSE','FALSE','FALSE','','TRUE'], ['1310','VvE De Kroonwerf','TRUE','TRUE','TRUE','','TRUE'], ['1603','VvE Oranjestaete','FALSE','FALSE','FALSE','','']);
  const f=alfa();
  f.push(['1904','VvE Molenhoek','8 oktober 2026'], ['1366','VvE Zeezicht','30 september 2026']);
  return { 'Nog Te Doen':n, 'Afgerond':af(), "ALV's overzicht":a, "ALV's afgerond":f, 'Mijn taken':taken };
}
