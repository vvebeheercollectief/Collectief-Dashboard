// ══════════════════════════════════════
//  VvE-DOSSIER AI-AGENT — vraag-en-antwoord over één VvE (read-only)
// ══════════════════════════════════════
import { esc, displayName } from "./util.js";
import { SECS } from "./config.js";
import { state, D } from "./state.js";
import { vveOverzicht } from "./render-vve.js";
import { fmtLogTs } from "./render-overig.js";
import { askChat } from "./api.js";
import { ensureToken } from "./auth.js";

// Pure helper (testbaar): compacte, feitelijke context-tekst over één VvE.
function dossierContextTekst(code, data, vandaag){
  const o = vveOverzicht(code, data, vandaag);
  const t = r => (r.actiepunt || r.agendapunten || r.status || r.periode || '').trim();
  const L = [];
  L.push(`VvE: ${o.code}${o.naam ? ' — ' + o.naam : ''}`);
  if(o.behandelaars.length) L.push(`Behandelaar(s): ${o.behandelaars.join(', ')}`);
  if(o.open.length){
    L.push('Lopende taken:');
    o.open.forEach(r=>{
      const sec = SECS[r._sec] ? SECS[r._sec].label : (r._sec || '');
      L.push(`- [${sec}] ${t(r)}${r.deadline?` (deadline ${r.deadline})`:''}${r.behandelaar?` — ${r.behandelaar}`:''}`);
    });
  } else L.push('Lopende taken: geen.');
  if(o.weggelegd.length){
    L.push('Weggelegd (later opvolgen):');
    o.weggelegd.forEach(r=>L.push(`- ${t(r)}${r.opvolgdatum?` (terug op ${r.opvolgdatum})`:''}`));
  }
  if(o.afgerond.length){
    L.push('Recent afgerond:');
    o.afgerond.slice(0,8).forEach(r=>L.push(`- ${t(r)}${r.datum?` (${r.datum})`:''}`));
  }
  if(o.alvo){
    L.push(`Komende ALV: status ${o.alvo.status}; uitnodiging ${o.alvo.uitnodiging?'verstuurd':'nog niet'}, `
      + `notulen ${o.alvo.notulen?'ja':'nee'}, begroting ${o.alvo.begroting?'ja':'nee'}.`);
  }
  if(o.alfa && o.alfa.length) L.push(`Laatst gehouden ALV: ${o.alfa[0].datum}.`);
  if(o.logboek.length){
    L.push('Laatste logboek/contactmomenten (nieuwste eerst):');
    o.logboek.slice(0,15).forEach(r=>{
      const wie = displayName(r.gebruiker) || r.gebruiker || '?';
      const wat = r.actie === 'Contact'
        ? `${r.veld || 'Contact'} met ${r.oudeWaarde || '?'}: ${r.nieuweWaarde || ''}`
        : `${r.actie}${r.nieuweWaarde ? ': ' + r.nieuweWaarde : ''}`;
      L.push(`- ${fmtLogTs(r.timestamp)} (${wie}) ${wat}`);
    });
  }
  return L.join('\n');
}

// Pure helper (testbaar): systeem-instructie met harde regels + context.
function buildChatSysteemPrompt(contextTekst){
  return [
    'Je bent de assistent van VvE Beheer Collectief, een VvE-beheerkantoor.',
    'Je beantwoordt vragen van een beheerder over ÉÉN specifieke VvE, in het Nederlands, bondig en zakelijk.',
    '',
    'Harde regels:',
    '- Antwoord ALLEEN op basis van de hieronder gegeven dossier-gegevens.',
    '- Verzin niets. Blijkt het antwoord niet uit de gegevens, zeg dat eerlijk ("daar staat niets over in het dossier").',
    '- Verzin geen namen, datums of bedragen die er niet staan.',
    '- Houd het kort en concreet.',
    '',
    'De dossier-gegevens van deze VvE:',
    '"""',
    contextTekst,
    '"""',
  ].join('\n');
}

// ── UI ──
function openChat(){
  if(!state._chatHistorie) state._chatHistorie = [];
  if(!state._chatVve) state._chatVve = state.vveCode || '';
  renderChat();
  document.getElementById('chat-bg').classList.add('open');
  const inp = document.getElementById('chat-input'); if(inp) setTimeout(()=>inp.focus(), 30);
}
function closeChat(){ document.getElementById('chat-bg')?.classList.remove('open'); }

function setChatVve(code){
  state._chatVve = code;
  state._chatHistorie = [];
  const z = document.getElementById('chat-vve-zoek'); if(z) z.value='';
  const s = document.getElementById('chat-vve-sug'); if(s){ s.innerHTML=''; s.classList.remove('show'); }
  renderChat();
}

function renderChat(){
  const code = state._chatVve;
  const naam = code ? (((D.alvo||[]).find(r=>r.code===code)||{}).naam || '') : '';
  const lbl = document.getElementById('chat-vve-label');
  if(lbl) lbl.textContent = code ? `${code}${naam?' — '+naam:''}` : 'kies een VvE';
  const box = document.getElementById('chat-bubbles');
  if(!box) return;
  if(!code){ box.innerHTML = '<div class="chat-leeg">Kies eerst een VvE om vragen over te stellen.</div>'; return; }
  let html = (state._chatHistorie||[]).map(m =>
    `<div class="chat-bub ${m.rol==='user'?'user':'ai'}">${esc(m.tekst)}</div>`).join('');
  if(!html) html = `<div class="chat-leeg">Stel een vraag over ${esc(code)}${naam?' ('+esc(naam)+')':''}.</div>`;
  if(state._chatBezig) html += '<div class="chat-bub bezig">aan het typen…</div>';
  box.innerHTML = html;
  box.scrollTop = box.scrollHeight;
}

async function vraagChat(){
  const inp = document.getElementById('chat-input');
  const vraag = (inp?.value || '').trim();
  const code = state._chatVve;
  if(!vraag || !code || state._chatBezig) return;
  inp.value = '';
  state._chatHistorie.push({ rol:'user', tekst:vraag });
  state._chatBezig = true; renderChat();
  try{
    if(!await ensureToken()) throw new Error('Niet ingelogd');
    const systeem = buildChatSysteemPrompt(dossierContextTekst(code, D));
    const messages = state._chatHistorie.map(m => ({ role: m.rol==='user'?'user':'assistant', content: m.tekst }));
    const antwoord = await askChat(systeem, messages);
    state._chatHistorie.push({ rol:'assistant', tekst: antwoord || '(leeg antwoord)' });
  }catch(e){
    console.error('chat-fout', e);
    state._chatHistorie.push({ rol:'assistant', tekst:'⚠️ Kon nu geen antwoord ophalen. Probeer het later opnieuw.' });
  }finally{
    state._chatBezig = false; renderChat();
  }
}

export { dossierContextTekst, buildChatSysteemPrompt, openChat, closeChat, setChatVve, renderChat, vraagChat };
