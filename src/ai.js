// ══════════════════════════════════════
//  AI-HULP — plak mailtekst (slim kopieer-plak)
// ══════════════════════════════════════
import { esc, displayName } from "./util.js";
import { state, D } from "./state.js";
import { SECS } from "./config.js";
import { goTo } from "./ui.js";
import { openModal, showToast } from "./main.js";

//  AI-HULP — plak mailtekst (slim kopieer-plak)
// ══════════════════════════════════════

function openAiHelp(){
  const sel=document.getElementById('ai-vve');
  const huidige=sel.value;
  const opts=['<option value="">— Geen VvE koppelen —</option>'];
  (D.alvo||[]).slice().sort((a,b)=>String(a.code||'').localeCompare(String(b.code||''))).forEach(r=>{
    if(!r.code) return;
    opts.push(`<option value="${esc(r.code)}">${esc(r.code)} — ${esc(r.naam||'')}</option>`);
  });
  sel.innerHTML=opts.join('');
  if(huidige) sel.value=huidige;
  document.getElementById('ai-answer').value='';
  const res=document.getElementById('ai-result'); res.style.display='none'; res.innerHTML='';
  document.querySelectorAll('#ai-chips .ai-chip').forEach(c=>c.classList.add('on'));
  buildAiPrompt();
  document.getElementById('ai-bg').classList.add('open');
}
function closeAiHelp(){ document.getElementById('ai-bg').classList.remove('open'); }

function aiSelectedWants(){
  return [...document.querySelectorAll('#ai-chips .ai-chip.on')].map(c=>c.dataset.k);
}

// Live context voor een VvE-code uit de huidige dashboard-data
function aiVveContext(code){
  if(!code) return null;
  const c=String(code).toLowerCase();
  let naam='', behs=new Set(), open=[];
  SKEYS.forEach(s=>{
    (D.ntd[s]||[]).forEach(r=>{
      if(String(r.code||'').toLowerCase()!==c) return;
      if(r.naam && !naam) naam=r.naam;
      if(r.behandelaar) String(r.behandelaar).split(/[,\/]/).forEach(b=>{const t=b.trim();if(t)behs.add(t);});
      const titel=r.actiepunt||r.agendapunten||r.status||SECS[s].label;
      open.push(`${SECS[s].label}: ${titel}`.trim());
    });
  });
  if(!naam){ const a=(D.alvo||[]).find(x=>String(x.code||'').toLowerCase()===c); if(a)naam=a.naam||''; }
  const laatste=(D.logboek||[]).filter(r=>String(r.code||'').toLowerCase()===c).slice(0,3)
    .map(r=>`${fmtLogTs(r.timestamp)} — ${displayName(r.gebruiker)}: ${r.actie}${r.nieuweWaarde?' ('+r.nieuweWaarde+')':''}`);
  if(!naam && !behs.size && !open.length && !laatste.length) return null;
  return {code, naam, beh:[...behs].join(', '), open, laatste};
}

const AI_WANT_TEKST={
  samenvatting:'Een korte samenvatting in 2-3 zinnen.',
  categorie:'In welke categorie dit valt (Oppakken / Vergaderverzoeken / Offerte-trajecten / LOD) en om welke VvE het gaat, met een prioriteit-inschatting (Hoog/Midden/Laag).',
  acties:'De concrete actiepunten als bulletlijst (begin elke regel met "- ").',
  antwoord:'Een vriendelijk, professioneel concept-antwoord namens VvE Beheer Collectief.'
};
const AI_KOPPEN={samenvatting:'Samenvatting:',categorie:'Categorie:',acties:'Actiepunten:',antwoord:'Concept-antwoord:'};

function buildAiPrompt(){
  const mail=(document.getElementById('ai-mail').value||'').trim();
  const wants=aiSelectedWants();
  const code=document.getElementById('ai-vve').value;
  const ctxBox=document.getElementById('ai-ctx');
  const ctx=code?aiVveContext(code):null;

  if(ctx){
    ctxBox.classList.add('show');
    ctxBox.innerHTML=`<b>Live context — VvE ${esc(ctx.code)}${ctx.naam?' ('+esc(ctx.naam)+')':''}:</b><ul>`
      +(ctx.beh?`<li>Behandelaar: ${esc(ctx.beh)}</li>`:'')
      +(ctx.open.length?`<li>Open taken: ${esc(ctx.open.join('; '))}</li>`:'')
      +(ctx.laatste.length?`<li>Laatste logboek: ${esc(ctx.laatste[0])}</li>`:'')
      +`</ul>`;
  } else { ctxBox.classList.remove('show'); ctxBox.innerHTML=''; }

  const p=document.getElementById('ai-prompt');
  if(!mail && !wants.length){ p.innerHTML='<span class="empty">Plak een mail en kies wat je nodig hebt — hier verschijnt dan vanzelf de vraag.</span>'; return; }

  let out='<span class="k">Rol:</span> Je bent de assistent van VvE Beheer Collectief, een VvE-beheerkantoor. Antwoord in het Nederlands, zakelijk en bondig.\n\n';
  out+='<span class="k">De binnengekomen e-mail:</span>\n"""'+esc(mail||'(nog leeg)')+'"""\n';
  if(ctx){
    out+='\n<span class="k">Wat wij al weten over deze VvE ('+esc(ctx.code)+(ctx.naam?' — '+esc(ctx.naam):'')+'):</span>\n';
    if(ctx.beh) out+='- Behandelaar: '+esc(ctx.beh)+'\n';
    if(ctx.open.length) out+='- Open taken: '+esc(ctx.open.join('; '))+'\n';
    if(ctx.laatste.length) out+='- Laatste logboek: '+esc(ctx.laatste.join(' | '))+'\n';
  }
  out+='\n<span class="k">Geef mij — gebruik exact deze kopjes zodat ik het kan inlezen:</span>\n';
  if(wants.length){
    wants.forEach(w=>{ out+='\n'+AI_KOPPEN[w]+'\n'+AI_WANT_TEKST[w]+'\n'; });
  } else { out+='- (kies hierboven minstens één optie)\n'; }
  p.innerHTML=out;
}

function copyAiPrompt(waar){
  const txt=document.getElementById('ai-prompt').innerText;
  if(navigator.clipboard) navigator.clipboard.writeText(txt).catch(()=>{});
  showToast('📎 Gekopieerd','Plak in '+waar+' met Ctrl/⌘+V','var(--ac)');
  const url=waar==='Claude'?'https://claude.ai/new':'https://gemini.google.com/app';
  try{ window.open(url,'_blank'); }catch(e){}
}

// Antwoord ontleden op de vaste kopjes
function aiParseSections(txt){
  const koppen=[['samenvatting','samenvatting'],['categorie','categorie'],['acties','actiepunten'],['antwoord','concept-antwoord']];
  const res={};
  const lines=txt.split(/\r?\n/);
  let huidig=null, buf=[];
  const flush=()=>{ if(huidig) res[huidig]=buf.join('\n').trim(); buf=[]; };
  lines.forEach(line=>{
    const m=line.match(/^\s*([^:]{2,30}?)\s*:\s*(.*)$/);
    let key=null;
    if(m){ const lab=m[1].toLowerCase().replace(/[\s*#_-]/g,''); koppen.forEach(([k,l])=>{ if(lab===l.replace(/[\s-]/g,'')) key=k; }); }
    if(key){ flush(); huidig=key; if(m[2].trim()) buf.push(m[2].trim()); }
    else if(huidig){ buf.push(line); }
  });
  flush();
  return res;
}

function parseAiAnswer(){
  const box=document.getElementById('ai-result');
  const txt=(document.getElementById('ai-answer').value||'').trim();
  if(!txt){ box.style.display='none'; box.innerHTML=''; return; }
  const wants=aiSelectedWants();
  const sec=aiParseSections(txt);
  const code=document.getElementById('ai-vve').value;
  const ctx=code?aiVveContext(code):null;
  state._aiLastCode=code||''; state._aiLastNaam=ctx?(ctx.naam||''):'';

  let html='<div class="ai-rhead">📥 Wat het dashboard eruit haalt</div>';
  if(wants.includes('samenvatting') && sec.samenvatting){
    html+=`<div class="ai-card"><div class="ai-card-hd">📝 Samenvatting<span class="sp"></span></div><div class="ai-card-bd">${esc(sec.samenvatting)}</div></div>`;
  }
  if(wants.includes('categorie') && sec.categorie){
    const catSec=aiGisCategorie(sec.categorie);
    html+=`<div class="ai-card"><div class="ai-card-hd">🏷️ Categorie &amp; VvE<span class="sp"></span><button class="ai-mini" onclick="aiOvernemen('${catSec}')">Overnemen</button></div><div class="ai-card-bd">${esc(sec.categorie)}</div></div>`;
  }
  if(wants.includes('acties') && sec.acties){
    const items=sec.acties.split(/\r?\n/).map(s=>s.replace(/^[-*•\d.]+\s*/,'').trim()).filter(Boolean);
    const li=items.map(a=>`<li><span class="ck"></span><span class="atxt">${esc(a)}</span><button class="ai-mini plus" onclick="aiActieTaak(this)">+ Taak</button></li>`).join('');
    html+=`<div class="ai-card"><div class="ai-card-hd">✅ Actiepunten<span class="sp"></span></div><div class="ai-card-bd"><ul class="ai-acts">${li||'<li><span class="atxt" style="color:var(--mut)">Geen losse punten gevonden.</span></li>'}</ul></div></div>`;
  }
  if(wants.includes('antwoord') && sec.antwoord){
    html+=`<div class="ai-card"><div class="ai-card-hd">✍️ Concept-antwoord<span class="sp"></span><button class="ai-mini" onclick="aiKopieerConcept(this)">Kopieer</button></div><div class="ai-card-bd"><div class="ai-reply">${esc(sec.antwoord)}</div></div></div>`;
  }
  const gevonden=Object.keys(sec).length;
  if(!gevonden){ html+=`<div class="ai-card"><div class="ai-card-bd" style="color:var(--mut)">Geen herkenbare kopjes gevonden. Plak het hele antwoord van de AI (met de kopjes Samenvatting:, Categorie:, Actiepunten:, Concept-antwoord:).</div></div>`; }
  box.innerHTML=html;
  box.style.display='flex';
}

function aiGisCategorie(txt){
  const t=(txt||'').toLowerCase();
  if(t.includes('vergader')) return 'VERGADERVERZOEKEN';
  if(t.includes('offerte')) return 'OFFERTE-TRAJECTEN';
  if(/\blod\b/.test(t)) return 'LOD';
  return 'OPPAKKEN';
}

function prefillNieuweTaak(sec, code, naam, actiepunt){
  if(!SECS[sec]) sec='OPPAKKEN';
  closeAiHelp();
  state.activeNtd=sec;
  goTo('ntd');
  openModal(false);
  const setIf=(id,v)=>{const el=document.getElementById(id);if(el&&v)el.value=v;};
  setIf('m-code',code); setIf('m-naam',naam);
  if(actiepunt){
    if(sec==='OPPAKKEN') setIf('m-actie',actiepunt);
    else if(sec==='VERGADERVERZOEKEN') setIf('m-agenda',actiepunt);
    else if(sec==='OFFERTE-TRAJECTEN') setIf('m-opm-o',actiepunt);
    else if(sec==='LOD') setIf('m-actie-l',actiepunt);
  }
}
function aiOvernemen(sec){ prefillNieuweTaak(sec,state._aiLastCode,state._aiLastNaam,''); }
function aiActieTaak(btn){
  const txt=btn.closest('li').querySelector('.atxt').textContent;
  prefillNieuweTaak('OPPAKKEN',state._aiLastCode,state._aiLastNaam,txt);
}
function aiKopieerConcept(btn){
  const txt=btn.closest('.ai-card').querySelector('.ai-reply').innerText;
  if(navigator.clipboard) navigator.clipboard.writeText(txt).catch(()=>{});
  showToast('📋 Gekopieerd','Concept-antwoord klaar voor je mail','var(--gn)');
}




// ══════════════════════════════════════

export {
  openAiHelp, closeAiHelp, aiSelectedWants, aiVveContext, AI_WANT_TEKST, AI_KOPPEN, buildAiPrompt,
  copyAiPrompt, aiParseSections, parseAiAnswer, aiGisCategorie, prefillNieuweTaak, aiOvernemen,
  aiActieTaak, aiKopieerConcept,
};
