// ══════════════════════════════════════
//  RENDER-ANALYTICS — grafieken, KPI's, dashboard
// ══════════════════════════════════════
import { esc, displayName, persBadges, emptyRow, parseDt, _parseAnyDate, vveCodeSpan } from "./util.js";
import { SECS, SKEYS, TEAM } from "./config.js";
import { state, D } from "./state.js";
import { ico } from "./icons.js";

// Leiblauwe accentkleur uitlezen op render-moment (Chart.js kan geen CSS-var-strings
// renderen). Volgt zo de huisstijl én het licht/donker-thema, want de grafieken worden
// opnieuw getekend bij een themawissel (applyTheme in ui.js).
function acColor(){ return (getComputedStyle(document.documentElement).getPropertyValue('--ac')||'').trim()||'#4a5b7a'; }
// Leeg/onbenut donut-segment: licht in lichte modus, donkergrijs in donkere modus
// (zodat het niet als felle witte vlek op een donkere kaart blijft staan).
function emptyDonutClr(){ return document.documentElement.dataset.theme==='dark'?'#343a44':'#E5E'+'7EB'; }

// ══════════════════════════════════════
//  ANALYTICS — Productiviteits-tracker
// ══════════════════════════════════════
// ── Chart.js lazy-load (Fase 5): pas laden bij eerste bezoek statistiek/dashboard ──
let _chartJsPromise=null;
function ensureChartJs(){
  if(window.Chart) return Promise.resolve();
  if(_chartJsPromise) return _chartJsPromise;
  _chartJsPromise=new Promise((res,rej)=>{
    const s=document.createElement('script');
    // Bewust het ORIGINELE npm-artefact (chart.umd.js), niet jsdelivr's gegenereerde
    // .min.js-wrapper: alleen echte npm-bestanden zijn byte-stabiel en dus SRI-veilig
    // (de wrapper waarschuwt daar zelf tegen). Al geminificeerd door Chart.js zelf.
    s.src='https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.js';
    // SRI: een gecompromitteerd CDN kan dan geen ander script serveren dan exact
    // deze gepubliceerde 4.4.0-build (hash zelf berekend over het CDN-bestand).
    s.integrity='sha384-FcQlsUOd0TJjROrBxhJdUhXTUgNJQxTMcxZe6nHbaEfFL1zjQ+bq/uRoBQxb0KMo';
    s.crossOrigin='anonymous';
    s.onload=res;
    s.onerror=()=>{ _chartJsPromise=null; rej(new Error('Chart.js laden mislukt')); };
    document.head.appendChild(s);
  });
  return _chartJsPromise;
}

const PERIODS=['dag','week','maand','kwartaal'];
const MAAND_KORT=['Jan','Feb','Mrt','Apr','Mei','Jun','Jul','Aug','Sep','Okt','Nov','Dec'];
const PERIODE_LABEL_NU={dag:'vandaag',week:'deze week',maand:'deze maand',kwartaal:'dit kwartaal'};
const PERIODE_LABEL_PREV={dag:'gisteren',week:'vorige week',maand:'vorige maand',kwartaal:'vorig kwartaal'};
const HERO_BUCKETS={dag:14,week:12,maand:12,kwartaal:8};
const SPARK_BUCKETS=8;

// Bucket helpers — datum (Date, string, of {y,m,d}) → sleutel
function _toDateObj(v){
  if(!v) return null;
  if(v instanceof Date) return isNaN(v)?null:v;
  if(typeof v==='object'&&v.y) return new Date(v.y,v.m-1,v.d);
  if(typeof v!=='string') return null;
  const p=_parseAnyDate(v);
  return p?new Date(p.y,p.m-1,p.d):null;
}
function bucketKey(date,period){
  const d=_toDateObj(date); if(!d) return null;
  if(period==='dag'){
    return`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
  if(period==='week'){
    // ISO-week jaar: pak donderdag van die week
    const t=new Date(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate()));
    const day=t.getUTCDay()||7;
    t.setUTCDate(t.getUTCDate()+4-day);
    const wk=getWeekNum(d);
    return`${t.getUTCFullYear()}-W${String(wk).padStart(2,'0')}`;
  }
  if(period==='maand'){
    return`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
  }
  if(period==='kwartaal'){
    return`${d.getFullYear()}-Q${Math.floor(d.getMonth()/3)+1}`;
  }
  return null;
}
function bucketLabel(key,period){
  if(!key) return '';
  if(period==='dag'){
    const [y,m,d]=key.split('-').map(Number);
    return`${d} ${MAAND_KORT[m-1].toLowerCase()}`;
  }
  if(period==='week'){
    const [y,w]=key.split('-W');
    return`W${+w} '${y.slice(2)}`;
  }
  if(period==='maand'){
    const [y,m]=key.split('-').map(Number);
    return`${MAAND_KORT[m-1]} '${String(y).slice(2)}`;
  }
  if(period==='kwartaal'){
    const [y,q]=key.split('-Q');
    return`Q${q} '${y.slice(2)}`;
  }
  return key;
}
// Genereer laatste n bucket-sleutels eindigend op vandaag
function lastBucketKeys(period,n){
  const today=new Date();
  const out=[];
  for(let i=n-1;i>=0;i--){
    let d=new Date(today.getFullYear(),today.getMonth(),today.getDate());
    if(period==='dag') d.setDate(d.getDate()-i);
    else if(period==='week') d.setDate(d.getDate()-i*7);
    else if(period==='maand') d=new Date(today.getFullYear(),today.getMonth()-i,1);
    else if(period==='kwartaal'){
      const curQ=Math.floor(today.getMonth()/3);
      d=new Date(today.getFullYear(),(curQ-i)*3,1);
    }
    out.push(bucketKey(d,period));
  }
  return out;
}
// rows = array met datum-string; geef array {key,label,count} voor laatste n buckets
function seriesByPeriod(rows,dateField,period,n){
  const keys=lastBucketKeys(period,n);
  const counts={}; keys.forEach(k=>counts[k]=0);
  rows.forEach(r=>{
    const k=bucketKey(r[dateField],period);
    if(k!=null&&counts[k]!==undefined) counts[k]++;
  });
  return keys.map(k=>({key:k,label:bucketLabel(k,period),count:counts[k]}));
}
// behandelaar-veld kan "Jer" of "Cihad, Jer" zijn → split op komma
function _splitBeh(v){
  return String(v||'').split(/[,;/]/).map(s=>displayName(s.trim())).filter(Boolean);
}
// rows + behandelaar-veld → dict {persoon: [{key,label,count}]}
function seriesPerPersonByPeriod(rows,dateField,persField,period,n){
  const keys=lastBucketKeys(period,n);
  const out={};
  rows.forEach(r=>{
    const names=_splitBeh(r[persField]);
    if(!names.length) return;
    const k=bucketKey(r[dateField],period);
    if(k==null) return;
    names.forEach(name=>{
      if(!out[name]){out[name]={}; keys.forEach(kk=>out[name][kk]=0)}
      if(out[name][k]!==undefined) out[name][k]++;
    });
  });
  const res={};
  Object.keys(out).forEach(name=>{
    res[name]=keys.map(k=>({key:k,label:bucketLabel(k,period),count:out[name][k]}));
  });
  return res;
}
function computeTrend(series){
  const n=series.length;
  const huidig=n?series[n-1].count:0;
  const vorig=n>1?series[n-2].count:0;
  let dir='flat',label='0%',deltaPct=0;
  if(vorig===0&&huidig===0){dir='flat';label='0%'}
  else if(vorig===0&&huidig>0){dir='up';label='nieuw'}
  else{
    deltaPct=Math.round((huidig-vorig)/vorig*100);
    if(deltaPct>0){dir='up';label='+'+deltaPct+'%'}
    else if(deltaPct<0){dir='down';label=deltaPct+'%'}
    else{dir='flat';label='0%'}
  }
  return{huidig,vorig,deltaPct,dir,label};
}

// Sparkline — kleine lijngrafiek zonder assen
function renderSparkline(canvasId,values,color){
  if(state.charts[canvasId]) state.charts[canvasId].destroy();
  const el=document.getElementById(canvasId); if(!el) return;
  state.charts[canvasId]=new Chart(el,{
    type:'line',
    data:{labels:values.map((_,i)=>i),datasets:[{
      data:values,
      borderColor:color,
      backgroundColor:color+'22',
      borderWidth:2,
      fill:true,
      tension:.35,
      pointRadius:0,
      pointHoverRadius:3,
      pointHoverBackgroundColor:color
    }]},
    options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:{display:false},tooltip:{enabled:false}},
      scales:{x:{display:false},y:{display:false,beginAtZero:true}},
      elements:{line:{borderJoinStyle:'round'}}}
  });
}

// KPI-tegel updaten (titel/getal/sub blijven HTML; trend wordt ingevoegd)
function renderKpiTile(id,opts){
  // opts: {num, sub, trend:{dir,label}, sparkId?, sparkValues?, sparkColor?}
  const numEl=document.getElementById(id+'-num');
  const subEl=document.getElementById(id+'-sub');
  if(numEl) numEl.textContent=opts.num;
  if(subEl){
    const arrow=opts.trend?(opts.trend.dir==='up'?'▲':opts.trend.dir==='down'?'▼':'■'):'';
    const trendHtml=opts.trend?`<span class="kpi-trend ${opts.trend.dir}"><span class="kpi-trend-arrow">${arrow}</span>${opts.trend.label}</span>`:'';
    const subText=opts.sub||'';
    subEl.innerHTML=`${trendHtml}${subText?'&nbsp;&nbsp;'+subText:''}`;
  }
  if(opts.sparkId&&opts.sparkValues){
    renderSparkline(opts.sparkId,opts.sparkValues,opts.sparkColor||acColor());
  }
}

// KPI 4: per persoon — mini-balkjes
function renderKpiPersonTile(period){
  const rowsEl=document.getElementById('kpi-pers-rows'); if(!rowsEl) return;
  // Verzamel alle taken in laatste bucket (huidige periode)
  const keys=lastBucketKeys(period,1);
  const curKey=keys[0];
  const allTaken=SKEYS.flatMap(s=>D.af[s]||[]);
  const tally={};
  TEAM.forEach(n=>tally[n]=0);
  allTaken.forEach(r=>{
    const k=bucketKey(r.datum,period);
    if(k!==curKey) return;
    _splitBeh(r.behandelaar).forEach(name=>{
      if(!name) return;
      tally[name]=(tally[name]||0)+1; // óók namen buiten het vaste team tellen mee (niet stil droppen)
    });
  });
  const max=Math.max(1,...Object.values(tally));
  // Vast team in config-volgorde eerst, daarna eventuele extra namen uit de data.
  const namen=[...TEAM, ...Object.keys(tally).filter(n=>!TEAM.includes(n))];
  rowsEl.innerHTML=namen.map(name=>{
    const v=tally[name];
    const pct=Math.round(v/max*100);
    return`<div class="kpi-person-row"><div class="kpi-person-name">${esc(name)}</div><div class="kpi-person-bar"><div class="kpi-person-fill" style="width:${pct}%"></div></div><div class="kpi-person-num">${v}</div></div>`;
  }).join('');
}

// Hoofdgrafiek: combo bar + lijn (vorige cyclus van gelijke lengte, verschoven)
function renderHeroChart(metric,period){
  const dark=document.documentElement.dataset.theme==='dark';
  const tc=dark?'#94a3b8':'#64748b';
  const gc=dark?'#1e293b':'#f1f5f9';
  const n=HERO_BUCKETS[period]||12;
  // Bouw 2n buckets om huidige + vorige cyclus te dekken
  const fullN=n*2;
  let rows,dateField,color,title;
  if(metric==='vergader'){
    rows=D.alfa||[]; dateField='datum'; color=acColor(); title='Vergaderingen uitgeschreven';
  }else{
    rows=SKEYS.flatMap(s=>D.af[s]||[]); dateField='datum'; color='#047857'; title='Taken afgerond';
  }
  const full=seriesByPeriod(rows,dateField,period,fullN);
  const curr=full.slice(n);             // laatste n
  const prev=full.slice(0,n).map(b=>b.count); // de n daarvoor
  document.getElementById('hero-chart-title').textContent=title;
  const periodeNoun={dag:'dagen',week:'weken',maand:'maanden',kwartaal:'kwartalen'}[period]||period;
  document.getElementById('hero-chart-sub').textContent=` — laatste ${n} ${periodeNoun}`;
  if(state.charts['chart-hero']) state.charts['chart-hero'].destroy();
  state.charts['chart-hero']=new Chart(document.getElementById('chart-hero'),{
    type:'bar',
    data:{
      labels:curr.map(b=>b.label),
      datasets:[
        {type:'bar',label:'Deze cyclus',data:curr.map(b=>b.count),backgroundColor:color,borderRadius:6,borderSkipped:false,order:2},
        {type:'line',label:'Vorige cyclus (referentie)',data:prev,borderColor:dark?'#cbd5e1':'#94a3b8',backgroundColor:'transparent',borderWidth:2,borderDash:[5,4],pointRadius:0,pointHoverRadius:4,tension:.3,order:1}
      ]
    },
    options:{responsive:true,maintainAspectRatio:false,
      plugins:{
        legend:{position:'top',align:'end',labels:{color:tc,padding:12,font:{size:11},usePointStyle:true,pointStyle:'circle',boxWidth:8}},
        tooltip:{mode:'index',intersect:false,backgroundColor:dark?'#0f172a':'#fff',titleColor:tc,bodyColor:dark?'#e2e8f0':'#1e293b',borderColor:gc,borderWidth:1,padding:10,cornerRadius:8,displayColors:true,usePointStyle:true}
      },
      scales:{
        x:{grid:{display:false},ticks:{color:tc,font:{size:11}}},
        y:{grid:{color:gc},ticks:{color:tc,precision:0},beginAtZero:true}
      }}
  });
}

// Leaderboard — taken per behandelaar deze vs vorige periode
function renderLeaderboard(period){
  const rows=SKEYS.flatMap(s=>D.af[s]||[]);
  const series=seriesPerPersonByPeriod(rows,'datum','behandelaar',period,2);
  // Vast team + iedereen die in de data afgeronde taken heeft (zo valt een collega/stagiair
  // buiten EMAIL_NAMES niet stil uit het leaderboard).
  const team=[...new Set([...TEAM, ...Object.keys(series)])];
  const data=team.map(name=>{
    const s=series[name]||[{count:0},{count:0}];
    const huidig=s[s.length-1].count;
    const vorig=s.length>1?s[s.length-2].count:0;
    const trend=computeTrend(s);
    return{name,huidig,vorig,trend};
  }).sort((a,b)=>b.huidig-a.huidig);

  document.getElementById('lb-title').textContent=`Leaderboard — Taken afgerond ${PERIODE_LABEL_NU[period]}`;
  document.getElementById('lb-now-hdr').textContent=PERIODE_LABEL_NU[period].charAt(0).toUpperCase()+PERIODE_LABEL_NU[period].slice(1);
  document.getElementById('lb-prev-hdr').textContent=PERIODE_LABEL_PREV[period].charAt(0).toUpperCase()+PERIODE_LABEL_PREV[period].slice(1);

  const tbody=document.getElementById('lb-tbody');
  const medalCls=['gold','silver','bronze',''];
  const totaal=data.reduce((a,b)=>a+b.huidig,0);
  if(totaal===0){
    tbody.innerHTML=`<tr><td colspan="5" class="empty"><div class="empty-ico">${ico('vlag')}</div>Nog geen afgeronde taken in deze periode</td></tr>`;
    return;
  }
  tbody.innerHTML=data.map((r,i)=>{
    const arrow=r.trend.dir==='up'?'▲':r.trend.dir==='down'?'▼':'■';
    // Geen medaille toekennen aan een score van 0 (anders 'goud' voor wie niets deed)
    const medal=r.huidig>0?(medalCls[i]||''):'';
    return`<tr>
      <td class="lb-rank ${medal}">${i+1}</td>
      <td class="lb-name">${esc(r.name)}</td>
      <td class="lb-now">${r.huidig}</td>
      <td class="lb-prev">${r.vorig}</td>
      <td class="lb-trend"><span class="kpi-trend ${r.trend.dir}"><span class="kpi-trend-arrow">${arrow}</span>${r.trend.label}</span></td>
    </tr>`;
  }).join('');
}

// Globale periode-balk
function renderPeriodBar(){
  const el=document.getElementById('ana-period-bar'); if(!el) return;
  el.innerHTML=PERIODS.map(p=>{
    const lbl=p.charAt(0).toUpperCase()+p.slice(1);
    return`<button class="period-btn${state.anaPeriod===p?' on':''}" data-p="${p}">${lbl}</button>`;
  }).join('');
  el.querySelectorAll('.period-btn').forEach(b=>{
    b.onclick=()=>{
      state.anaPeriod=b.dataset.p;
      el.querySelectorAll('.period-btn').forEach(x=>x.classList.toggle('on',x.dataset.p===state.anaPeriod));
      buildAnalytics();
    };
  });
}
// Metric-toggle in hoofdgrafiek
function renderMetricToggle(){
  const el=document.getElementById('hero-metric-toggle'); if(!el) return;
  const metrics=[{k:'vergader',l:'Vergaderingen'},{k:'taken',l:'Taken'}];
  el.innerHTML=metrics.map(m=>`<button class="metric-btn${state.anaMetric===m.k?' on':''}" data-m="${m.k}">${m.l}</button>`).join('');
  el.querySelectorAll('.metric-btn').forEach(b=>{
    b.onclick=()=>{
      state.anaMetric=b.dataset.m;
      el.querySelectorAll('.metric-btn').forEach(x=>x.classList.toggle('on',x.dataset.m===state.anaMetric));
      renderHeroChart(state.anaMetric,state.anaPeriod);
    };
  });
}

function _try(label,fn){try{fn()}catch(e){console.error('[Analytics]',label,e)}}

function buildAnalytics(){
  if(!window.Chart){ ensureChartJs().then(buildAnalytics).catch(e=>console.warn(e)); return; }
  _try('periode-bar',()=>renderPeriodBar());
  _try('metric-toggle',()=>renderMetricToggle());

  // ── KPI 1: Vergaderingen uitgeschreven (D.alfa, per periode)
  _try('kpi-vergader',()=>{
    const vSeries=seriesByPeriod(D.alfa||[],'datum',state.anaPeriod,SPARK_BUCKETS);
    const vTrend=computeTrend(vSeries);
    renderKpiTile('kpi-vergader',{
      num:vTrend.huidig,
      sub:`vs ${vTrend.vorig} ${PERIODE_LABEL_PREV[state.anaPeriod]}`,
      trend:vTrend,
      sparkId:'spark-vergader',
      sparkValues:vSeries.map(b=>b.count),
      sparkColor:acColor()
    });
  });

  // ── KPI 2: Open ALV's (cumulatief, stand-meting)
  _try('kpi-openalv',()=>{
    const totAlv=(D.alvo||[]).length;
    const openAlv=(D.alvo||[]).filter(r=>!r.notulen).length;
    const openPct=totAlv?Math.round(openAlv/totAlv*100):0;
    const numEl=document.getElementById('kpi-openalv-num');
    const subEl=document.getElementById('kpi-openalv-sub');
    if(numEl) numEl.textContent=openAlv;
    if(subEl) subEl.textContent=totAlv?`van ${totAlv} ALV's · ${openPct}% nog uit te schrijven`:'geen data';
    const barEl=document.getElementById('kpi-openalv-bar');
    if(barEl) barEl.style.width=openPct+'%';
  });

  // ── KPI 3: Taken afgerond (D.af alle SKEYS, per periode)
  _try('kpi-taken',()=>{
    const tRows=SKEYS.flatMap(s=>(D.af||{})[s]||[]);
    const tSeries=seriesByPeriod(tRows,'datum',state.anaPeriod,SPARK_BUCKETS);
    const tTrend=computeTrend(tSeries);
    renderKpiTile('kpi-taken',{
      num:tTrend.huidig,
      sub:`vs ${tTrend.vorig} ${PERIODE_LABEL_PREV[state.anaPeriod]}`,
      trend:tTrend,
      sparkId:'spark-taken',
      sparkValues:tSeries.map(b=>b.count),
      sparkColor:'#047857'
    });
  });

  // ── KPI 4: Per persoon
  _try('kpi-pers',()=>renderKpiPersonTile(state.anaPeriod));

  // ── Hoofdgrafiek
  _try('hero-chart',()=>renderHeroChart(state.anaMetric,state.anaPeriod));

  // ── Leaderboard
  _try('leaderboard',()=>renderLeaderboard(state.anaPeriod));
}

function getWeekNum(d){
  const d2=new Date(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate()));
  const dayNum=d2.getUTCDay()||7;
  d2.setUTCDate(d2.getUTCDate()+4-dayNum);
  const yearStart=new Date(Date.UTC(d2.getUTCFullYear(),0,1));
  return Math.ceil((((d2-yearStart)/86400000)+1)/7);
}

function buildBarChart(id,labels,data,color,tc,gc){
  if(state.charts[id]) state.charts[id].destroy();
  state.charts[id]=new Chart(document.getElementById(id),{
    type:'bar',
    data:{labels,datasets:[{label:'Aantal',data,backgroundColor:color,borderRadius:6,borderSkipped:false}]},
    options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:{display:false}},
      scales:{x:{grid:{display:false},ticks:{color:tc,font:{size:11}}},
              y:{grid:{color:gc},ticks:{color:tc,precision:0},beginAtZero:true}}}
  });
}

function buildDonut(id,labels,data,colors,tc,centerVal,centerLbl){
  if(state.charts[id]) state.charts[id].destroy();
  const el=document.getElementById(id); if(!el) return;
  // Maak verticale gradient van basiskleur naar lichtere variant
  const ctxG=el.getContext('2d');
  const gradients=colors.map(c=>{
    const g=ctxG.createLinearGradient(0,0,0,el.height||220);
    g.addColorStop(0,c);
    g.addColorStop(1,_lightenHex(c,18));
    return g;
  });
  const centerPlugin={
    id:'center',
    afterDraw(chart){
      if(!centerVal) return;
      const {ctx,chartArea}=chart;
      const cx=(chartArea.left+chartArea.right)/2;
      const cy=(chartArea.top+chartArea.bottom)/2;
      ctx.save();
      ctx.textAlign='center'; ctx.textBaseline='middle';
      const isFrac=centerVal&&String(centerVal).includes('/');
      const fSize=isFrac?'22px':'30px';
      // Subtiele schaduw onder het cijfer
      ctx.shadowColor='rgba(0,0,0,.08)';
      ctx.shadowBlur=4;
      ctx.shadowOffsetY=1;
      ctx.font=`800 ${fSize} 'DM Sans',sans-serif`;
      ctx.fillStyle=colors[0];
      ctx.fillText(centerVal,cx,cy-8);
      ctx.shadowColor='transparent';
      ctx.font="600 11px 'DM Sans',sans-serif";
      ctx.fillStyle=tc;
      const lbl=(centerLbl||'').toUpperCase();
      // Letter-spacing simuleren door letters één voor één te tekenen
      const letters=lbl.split('');
      const trackEm=0.08;
      ctx.font="600 10px 'DM Sans',sans-serif";
      let totalW=0;
      letters.forEach(c=>{totalW+=ctx.measureText(c).width+10*trackEm});
      let x=cx-totalW/2;
      letters.forEach(c=>{
        ctx.textAlign='left';
        ctx.fillText(c,x,cy+18);
        x+=ctx.measureText(c).width+10*trackEm;
      });
      ctx.restore();
    }
  };
  state.charts[id]=new Chart(el,{
    type:'doughnut',
    data:{labels,datasets:[{data,backgroundColor:gradients,borderWidth:0,hoverOffset:10,hoverBorderWidth:3,hoverBorderColor:'var(--sur)',spacing:2}]},
    options:{responsive:true,maintainAspectRatio:false,cutout:'72%',
      animation:{animateRotate:true,animateScale:false,duration:900,easing:'easeOutCubic'},
      plugins:{
        legend:{position:'right',align:'center',labels:{color:tc,padding:14,font:{size:12,weight:'500'},
          usePointStyle:true,pointStyle:'circle',boxWidth:9,boxHeight:9}},
        tooltip:{backgroundColor:'rgba(15,23,42,.94)',titleColor:'#fff',bodyColor:'#e2e8f0',
          padding:11,cornerRadius:8,displayColors:true,usePointStyle:true,boxPadding:4,
          titleFont:{size:12,weight:'600'},bodyFont:{size:12}}
      }},
    plugins:[centerPlugin]
  });
}

// Lichten/donker maken van hex-kleur (perc -100..+100)
function _lightenHex(hex,perc){
  let h=hex.replace('#','');
  if(h.length===3) h=h.split('').map(c=>c+c).join('');
  const r=parseInt(h.slice(0,2),16),g=parseInt(h.slice(2,4),16),b=parseInt(h.slice(4,6),16);
  const f=(v)=>Math.max(0,Math.min(255,Math.round(v+(perc/100)*(perc>0?255-v:v))));
  return`#${[f(r),f(g),f(b)].map(v=>v.toString(16).padStart(2,'0')).join('')}`;
}

// ══════════════════════════════════════
//  DASHBOARD
// ══════════════════════════════════════
const DASH_ICONS={
  // Klembord met lijntjes — open taken
  open:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="4" width="14" height="17" rx="2" fill="currentColor" fill-opacity="0.18"/><rect x="9" y="2.5" width="6" height="3.5" rx="1" fill="currentColor" fill-opacity="0.35"/><path d="M9 11h6M9 14.5h6M9 18h4"/></svg>`,
  // Cirkel met dikke vink — taken afgerond
  done:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="currentColor" fill-opacity="0.18"/><path d="M8 12.5l2.7 2.7L16 9.8"/></svg>`,
  // Envelop met vinkje en pijl — ALV uitgeschreven
  alv:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6.5a2 2 0 012-2h14a2 2 0 012 2v11a2 2 0 01-2 2H5a2 2 0 01-2-2v-11z" fill="currentColor" fill-opacity="0.18"/><path d="M3.5 7l8.5 6 8.5-6"/><path d="M9 16.5l1.6 1.6L14 14.7"/></svg>`,
  // Document met pen — notulen verstuurd
  notes:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 3h7l4 4v13a1.5 1.5 0 01-1.5 1.5h-9A1.5 1.5 0 016 20V4.5A1.5 1.5 0 017.5 3z" fill="currentColor" fill-opacity="0.18"/><path d="M14 3v4h4"/><path d="M9 12h6M9 15h6M9 18h3"/><path d="M17.6 13.4l1.4-1.4a1.1 1.1 0 011.6 1.6l-1.4 1.4-1.6-1.6z" fill="currentColor" fill-opacity="0.35"/></svg>`,
  // Tab-iconen (kleine 14px versies)
  tabAlv:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6.5a2 2 0 012-2h14a2 2 0 012 2v11a2 2 0 01-2 2H5a2 2 0 01-2-2v-11z"/><path d="M3.5 7l8.5 6 8.5-6"/></svg>`,
  tabNotes:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3h7l4 4v13a1.5 1.5 0 01-1.5 1.5h-9A1.5 1.5 0 016 20V4.5A1.5 1.5 0 017.5 3z"/><path d="M14 3v4h4"/><path d="M9 13h6M9 16h4"/></svg>`,
  tabBudget:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M14.5 9.5c-.6-.7-1.5-1.1-2.5-1.1-1.7 0-3 1.1-3 2.5s1.3 2.5 3 2.5 3 1.1 3 2.5-1.3 2.5-3 2.5c-1 0-1.9-.4-2.5-1.1"/><path d="M12 7v10"/></svg>`,
  tabTasks:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="4" width="14" height="17" rx="2"/><rect x="9" y="2.5" width="6" height="3.5" rx="1"/><path d="M9 11h6M9 14.5h6M9 18h4"/></svg>`,
};

const HERO_VIEWS=[
  {
    key:'alv', label:'ALV Voortgang', icon:'tabAlv',
    color:'#4a5b7a',
    title:'ALV Voortgang — Uitnodigingen',
    sub:'Hoeveel uitnodigingen zijn de deur uit',
    build:()=>{
      const u=D.alvo.filter(r=>r.uitnodiging).length;
      const t=D.alvo.length;
      return{labels:['Uitgeschreven','Nog uitschrijven'],data:[u,t-u],colors:[acColor(),emptyDonutClr()],centerVal:`${u}/${t}`,centerLbl:'Uitgeschreven'};
    }
  },
  {
    key:'notulen', label:'Notulen', icon:'tabNotes',
    color:'#15803D',
    title:'Notulen verstuurd',
    sub:'Van uitgeschreven vergaderingen',
    build:()=>{
      const u=D.alvo.filter(r=>r.uitnodiging).length;
      const n=D.alvo.filter(r=>r.notulen).length;
      // Noemer = max(u,n): bij losse vlaggen kan notulen>uitnodiging zijn; zonder clamp toont
      // het centercijfer dan een onmogelijke breuk >1 (bv. '3/2'). Met max leest het 'n/n' = vol,
      // consistent met de reeds-geklemde donut-data. Normale geval (u>=n) blijft ongewijzigd.
      return{labels:['Notulen verstuurd','Nog te versturen'],data:[n,Math.max(0,u-n)],colors:['#15803D',emptyDonutClr()],centerVal:`${n}/${Math.max(u,n)}`,centerLbl:'Verstuurd'};
    }
  },
  {
    key:'begroting', label:'Begroting', icon:'tabBudget',
    color:'#6D5BD0',
    title:'Begroting doorgezet',
    sub:'Vergaderingen waar de begroting is doorgezet',
    build:()=>{
      const b=D.alvo.filter(r=>r.begroting).length;
      const t=D.alvo.length;
      return{labels:['Doorgezet','Niet doorgezet'],data:[b,t-b],colors:['#6D5BD0',emptyDonutClr()],centerVal:`${b}/${t}`,centerLbl:'Doorgezet'};
    }
  },
  {
    key:'taken', label:'Open Taken', icon:'tabTasks',
    color:'#B45309',
    title:'Open taken per categorie',
    sub:'Verdeling van openstaande werkzaamheden',
    build:()=>{
      const data=SKEYS.map(s=>D.ntd[s]?.length||0);
      const tot=data.reduce((a,b)=>a+b,0);
      return{labels:SKEYS.map(s=>SECS[s].label),data,colors:[acColor(),'#B45309','#6D5BD0','#B91C1C'],centerVal:`${tot}`,centerLbl:'Open Taken'};
    }
  },
];

function renderHeroDonut(){
  const dark=document.documentElement.dataset.theme==='dark';
  const tc=dark?'#94a3b8':'#64748b';
  const view=HERO_VIEWS.find(v=>v.key===state.activeHeroView)||HERO_VIEWS[0];
  const card=document.querySelector('.hero-donut-card');
  if(card) card.style.setProperty('--hero-color',view.color);
  document.getElementById('hero-donut-title').textContent=view.title;
  document.getElementById('hero-donut-sub').textContent=view.sub;
  const tabsEl=document.getElementById('hero-donut-tabs');
  // Bouw de tab-knoppen ÉÉN keer (incl. SVG-iconen + onclick); daarna bij een tabwissel alleen de
  // actieve-staat bijwerken. Voorheen werd per klik de hele tab-DOM herbouwd + iconen herparsed +
  // handlers herbonden, plus een vroege-return ontbrak zodat her-klikken de 900ms-donut herhaalde.
  if(tabsEl && !tabsEl.children.length){
    tabsEl.innerHTML=HERO_VIEWS.map(v=>
      `<button class="hdt-tab" data-key="${v.key}">${DASH_ICONS[v.icon]||''}<span>${v.label}</span></button>`
    ).join('');
    tabsEl.querySelectorAll('.hdt-tab').forEach(btn=>{
      btn.onclick=()=>{ if(btn.dataset.key===state.activeHeroView) return; state.activeHeroView=btn.dataset.key; renderHeroDonut(); };
    });
  }
  if(tabsEl) tabsEl.querySelectorAll('.hdt-tab').forEach(btn=>{
    const on=btn.dataset.key===state.activeHeroView;
    btn.classList.toggle('on',on);
    btn.style.setProperty('--hero-color', on?view.color:'');
  });
  const cfg=view.build();
  buildDonut('chart-hero-donut',cfg.labels,cfg.data,cfg.colors,tc,cfg.centerVal,cfg.centerLbl);
}

function buildDash(){
  if(!window.Chart){ ensureChartJs().then(buildDash).catch(e=>console.warn(e)); return; }
  const uitnD=D.alvo.filter(r=>r.uitnodiging).length;
  const notulenD=D.alvo.filter(r=>r.notulen).length;
  const ntdTotal=SKEYS.reduce((s,k)=>s+(D.ntd[k]?.length||0),0);
  const afTotal=SKEYS.reduce((s,k)=>s+(D.af[k]?.length||0),0);

  const dItem=(val,cls,cap,hint)=>`<div class="stat-item"><span class="stat-val ${cls}">${val}</span><div class="stat-meta"><span class="stat-cap">${cap}</span>${hint?`<span class="stat-hint">${hint}</span>`:''}</div></div>`;
  document.getElementById('dash-stats').innerHTML=
    dItem(ntdTotal,'teal','Open taken','')+
    dItem(afTotal,'green','Taken afgerond','')+
    dItem(uitnD,'amber',"ALV's uitgeschreven",'')+
    dItem(notulenD,'green','Notulen verstuurd',`van ${uitnD}`);

  renderHeroDonut();

  // Recent afgerond
  const secPill={
    OPPAKKEN:`<span style="background:var(--bl-l);color:var(--bl)" class="badge">Oppakken</span>`,
    VERGADERVERZOEKEN:`<span style="background:var(--am-l);color:var(--am)" class="badge">Vergadering</span>`,
    'OFFERTE-TRAJECTEN':`<span style="background:var(--pu-l);color:var(--pu)" class="badge">Offerte</span>`,
    LOD:`<span style="background:var(--rd-l);color:var(--rd)" class="badge">LOD</span>`,
  };
  const all=SKEYS.flatMap(s=>(D.af[s]||[]).map(r=>({...r,_sec:s})));
  all.sort((a,b)=>parseDt(b.datum)-parseDt(a.datum));
  document.getElementById('recent-tbody').innerHTML=all.slice(0,10).map(r=>`<tr>
    <td>${secPill[r._sec]||''}</td>
    <td>${vveCodeSpan(r.code, SECS[r._sec].css)}</td>
    <td class="cell-name">${esc(r.naam)}</td>
    <td class="cell-txt">${esc(r.actiepunt||r.periode||'')}</td>
    <td>${persBadges(r.behandelaar)}</td>
    <td class="cell-sm">${esc(r.datum||'')}</td>
  </tr>`).join('')||`<tr><td colspan="6">${emptyRow(6,true)}</td></tr>`;
}


export {
  PERIODS, MAAND_KORT, PERIODE_LABEL_NU, PERIODE_LABEL_PREV, HERO_BUCKETS, SPARK_BUCKETS,
  _toDateObj, bucketKey, bucketLabel, lastBucketKeys, seriesByPeriod, _splitBeh,
  seriesPerPersonByPeriod, computeTrend, renderSparkline, renderKpiTile, renderKpiPersonTile,
  renderHeroChart, renderLeaderboard, renderPeriodBar, renderMetricToggle, _try, buildAnalytics,
  getWeekNum, buildBarChart, buildDonut, _lightenHex, DASH_ICONS, HERO_VIEWS, renderHeroDonut, buildDash,
};
