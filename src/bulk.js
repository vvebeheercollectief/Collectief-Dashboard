// ══════════════════════════════════════
//  BULK-ACTIES — selecteren + groepsacties op de NTD-lijst (Fase 5)
// ══════════════════════════════════════
import { state, D } from "./state.js";
import { renderNtd } from "./render-lijsten.js";

const _sel = new Set();   // geselecteerde taak-objecten (rij-referenties in D)

// Pure helper (testbaar): verwerk-volgorde hoog→laag _row, zodat
// rij-verwijderingen in de Sheet elkaars indexen niet verschuiven.
function _bulkVolgorde(rows){ return [...rows].sort((a,b)=>b._row-a._row); }

function bulkGeselecteerd(r){ return _sel.has(r); }
function bulkSelectie(){ return _bulkVolgorde(_sel); }

function toggleBulkMode(){
  state.bulkMode=!state.bulkMode;
  _sel.clear();
  document.getElementById('bulk-btn').classList.toggle('on',state.bulkMode);
  renderNtd();
  renderBulkUi();
}
function bulkVink(rid){
  const r=state._rowCache[rid]; if(!r) return;
  _sel.has(r)?_sel.delete(r):_sel.add(r);
  renderNtd();
  renderBulkUi();
}
function bulkWis(){ _sel.clear(); }
function renderBulkUi(){
  const teller=document.getElementById('bulk-teller');
  const balk=document.getElementById('bulk-balk');
  teller.style.display=state.bulkMode?'':'none';
  teller.textContent=`${_sel.size} geselecteerd`;
  balk.style.display=(state.bulkMode&&_sel.size>0)?'flex':'none';
  if(!state.bulkMode) _sluitMenus();
}
function toggleBulkMenu(menu){
  const el=document.getElementById('bb-menu-'+menu);
  const open=el.classList.contains('open');
  _sluitMenus();
  if(!open) el.classList.add('open');
}
function _sluitMenus(){ document.querySelectorAll('.bb-menu').forEach(m=>m.classList.remove('open')); }

export { _bulkVolgorde, bulkGeselecteerd, bulkSelectie, toggleBulkMode, bulkVink, bulkWis, renderBulkUi, toggleBulkMenu, _sluitMenus };
