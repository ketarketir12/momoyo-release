const $ = id => document.getElementById(id);
// Timers that keep running when this tab is in the background: Chrome throttles page timers there, but not Web Worker timers.
const timers=(()=>{
 let worker=null,seq=0;const waiting=new Map(),every=[];
 const fallback=()=>{worker=null;waiting.forEach(w=>{if(w.once)w.fn();});waiting.clear();every.splice(0).forEach(([fn,ms])=>setInterval(fn,ms));};
 try{
  worker=new Worker(URL.createObjectURL(new Blob(["onmessage=e=>{const d=e.data;if(d.op==='sleep')setTimeout(()=>postMessage(d.id),d.ms);else setInterval(()=>postMessage(d.id),d.ms);};"],{type:'text/javascript'})));
  worker.onmessage=e=>{const w=waiting.get(e.data);if(w){if(w.once)waiting.delete(e.data);w.fn();}};worker.onerror=fallback;
 }catch{worker=null;}
 return{
  sleep:ms=>new Promise(r=>{if(!worker){setTimeout(r,ms);return;}const id=++seq;waiting.set(id,{once:true,fn:r});worker.postMessage({op:'sleep',id,ms});setTimeout(()=>{if(waiting.has(id)){waiting.delete(id);r();}},ms+2500);}),
  every:(fn,ms)=>{if(!worker){setInterval(fn,ms);return;}every.push([fn,ms]);const id=++seq;waiting.set(id,{fn});worker.postMessage({op:'every',id,ms});}
 };
})();
const sleep=ms=>timers.sleep(ms);
const KEY='momoyo-picker-v1';
let state={names:[],prizes:[],history:[],exclude:true},busy=false;
try{const s=JSON.parse(localStorage.getItem(KEY));if(s&&Array.isArray(s.names)&&s.names.every(n=>typeof n==='string')&&Array.isArray(s.prizes)&&s.prizes.every(p=>typeof p.name==='string'&&Number.isSafeInteger(p.qty)&&p.qty>0)&&Array.isArray(s.history)&&s.history.every(h=>typeof h.name==='string'&&typeof h.prize==='string'&&typeof h.date==='string'))state=s;}catch{}
function save(){stateRev++;state.savedAt=Date.now();try{localStorage.setItem(KEY,JSON.stringify(state));$('saveStatus').textContent='Tersimpan di browser perangkat ini.';}catch{$('saveStatus').textContent='Browser tidak bisa menyimpan data. Ekspor CSV hasil sebelum menutup halaman ini.';}}
function randomIndex(n){const limit=4294967296-4294967296%n;let v;do{v=crypto.getRandomValues(new Uint32Array(1))[0];}while(v>=limit);return v%n;}
function eligible(){const won=new Set(state.history.map(h=>h.name.toLowerCase()));return state.names.filter(n=>!state.exclude||!won.has(n.toLowerCase()));}
function remaining(){return state.prizes.map(p=>({...p,left:Math.max(0,p.qty-state.history.filter(h=>h.prize===p.name).length)}));}
function text(tag,value,cls){const e=document.createElement(tag);e.textContent=value;if(cls)e.className=cls;return e;}
let boardPage=0,shownNames=[],highlighted=null,stateRev=0,publicBoard={names:[],active:null,size:20};
function showBoard(names,active){
 highlighted=active||null;
 const query=active?'':$('search').value.trim().toLowerCase();
 if(active)$('search').value='';
 const roster=state.names;
 const filtered=query?roster.filter(n=>n.toLowerCase().includes(query)):roster;
 $('board').dataset.size=$('pageSize').value;const size=Number($('pageSize').value),pages=Math.max(1,Math.ceil(filtered.length/size));
 if(active){const index=filtered.indexOf(active);if(index>=0)boardPage=Math.floor(index/size);}
 boardPage=Math.max(0,Math.min(boardPage,pages-1));
 shownNames=filtered.slice(boardPage*size,(boardPage+1)*size);
 // What viewers see: never the operator's search results, only the plain roster page (or the active draw).
 if(!query)publicBoard={names:shownNames.slice(),active:highlighted,size};
 $('board').replaceChildren();
 if(!shownNames.length)$('board').append(text('div',roster.length?'Tidak ada nama yang cocok.':'Tambahkan peserta dan hadiah untuk memulai undian.','placeholder'));
 const won=new Set(state.history.map(h=>h.name.toLowerCase()));
 shownNames.forEach(n=>{const isWon=won.has(n.toLowerCase());const e=text('div',n,'tile'+(n===active?' active':isWon?' won':''));e.title=n+(isWon?' · Sudah menang':'');$('board').append(e);});
 $('pageInfo').textContent=filtered.length?`${boardPage*size+1}–${Math.min((boardPage+1)*size,filtered.length)} dari ${filtered.length.toLocaleString('id-ID')} nama · Hal. ${boardPage+1}/${pages}`:'0 nama';
 $('prev').disabled=busy||boardPage===0;$('next').disabled=busy||boardPage===pages-1;
 $('search').disabled=busy;$('pageSize').disabled=busy;$('autoplay').disabled=busy;
 if(active){const el=$('board').querySelector('.active');if(el)$('board').scrollTop=Math.max(0,el.offsetTop-$('board').offsetTop-$('board').clientHeight/2);}else $('board').scrollTop=0;
}
function browse(delta){if(busy)return;boardPage+=delta;showBoard(state.names);}
$('prev').onclick=()=>browse(-1);$('next').onclick=()=>browse(1);
$('search').oninput=()=>{boardPage=0;showBoard(state.names);};
$('pageSize').onchange=()=>{boardPage=0;showBoard(state.names);};
setInterval(()=>{if(busy||document.hidden||!$('autoplay').checked||highlighted)return;const query=$('search').value.trim().toLowerCase(),total=state.names.filter(n=>n.toLowerCase().includes(query)).length;boardPage=(boardPage+1)%Math.max(1,Math.ceil(total/Number($('pageSize').value)));showBoard(state.names);},5000);
function render(){const pool=eligible();showBoard(pool);$('count').textContent=`${pool.length} peserta tersedia · ${remaining().reduce((a,p)=>a+p.left,0)} hadiah tersisa`;$('won').textContent=state.history.length;$('history').replaceChildren();if(!state.history.length)$('history').append(text('li','Belum ada pemenang.'));state.history.slice().reverse().forEach(h=>{const li=text('li',h.name);li.append(text('span',h.prize+' · '+new Date(h.date).toLocaleString('id-ID')));$('history').append(li);});$('draw').disabled=busy;}
function fill(){ $('names').value=state.names.join('\n');$('prizes').value=state.prizes.map(p=>p.name+' | '+p.qty).join('\n');$('exclude').checked=state.exclude;}
const operatorToast=document.createElement('div');
operatorToast.className='operator-toast';operatorToast.setAttribute('role','status');
operatorToast.setAttribute('aria-atomic','true');document.body.append(operatorToast);
let operatorToastTimer;
function notifyOperator(message){
 clearTimeout(operatorToastTimer);
 operatorToast.textContent=message;
 operatorToast.classList.add('is-visible');
 operatorToastTimer=setTimeout(()=>{
  operatorToast.classList.remove('is-visible');operatorToast.textContent='';
 },3600);
}
function message(m,success=false){$('message').textContent=m;if(success)notifyOperator(m);}
function createObsSetup(path,width,height){
 const setup=document.createElement('details');
 setup.className='obs-setup';
 setup.innerHTML=`<summary>Pengaturan OBS · URL Browser Source</summary>
  <p>Di Properties Browser Source, matikan <strong>Local file</strong>, lalu tempel URL ini.</p>
  <div class="obs-setup-url"><input type="url" aria-label="URL Browser Source OBS" readonly>
  <button type="button" data-variant="secondary">Salin URL</button></div>
  <dl><div><dt>Width</dt><dd>${width} px</dd></div><div><dt>Height</dt><dd>${height} px</dd></div></dl>`;
 const input=setup.querySelector('input');
 input.value=new URL(path,location.href).href;
 input.onclick=()=>input.select();
 setup.querySelector('button').onclick=async()=>{
  try{
   await navigator.clipboard.writeText(input.value);
   notifyOperator('URL Browser Source disalin.');
  }catch{
   input.focus();input.select();
   notifyOperator('Browser menolak menyalin otomatis. URL sudah dipilih, tekan Ctrl + C.');
  }
 };
 return setup;
}
$('apply').onclick=()=>{if(busy)return;const raw=$('names').value.split(/\r?\n/).map(n=>n.trim()).filter(Boolean);const unique=new Map();raw.forEach(n=>{if(!unique.has(n.toLowerCase()))unique.set(n.toLowerCase(),n);});const prizes=[];for(const line of $('prizes').value.split(/\r?\n/).filter(l=>l.trim())){const parts=line.split('|');const name=parts[0].trim(),qty=parts.length===1?1:Number(parts[1].trim());if(parts.length>2||!name||!Number.isSafeInteger(qty)||qty<1||qty>100000){message('Format hadiah belum sesuai. Tulis Nama hadiah | jumlah (1–100000) di setiap baris.');return;}if(prizes.some(p=>p.name===name)){message('Ada nama hadiah yang sama di dua baris. Gabungkan jadi satu baris dengan jumlah total.');return;}prizes.push({name,qty});}if(!unique.size||!prizes.length){message('Isi minimal satu peserta dan satu hadiah, lalu klik Simpan daftar.');return;}if(unique.size>100000||prizes.reduce((a,p)=>a+p.qty,0)>100000){message('Daftar terlalu besar. Maksimal 100000 peserta dan 100000 total hadiah.');return;}state.names=[...unique.values()];state.prizes=prizes;state.exclude=$('exclude').checked;save();fill();render();$('result').replaceChildren(text('div','Hadiah terungkap setelah nama terpilih.','hint'));$('draw').textContent='Acak pemenang';message(`Daftar peserta disimpan · ${unique.size} nama${raw.length>unique.size?`, ${raw.length-unique.size} duplikat dihapus`:''}.`,true);};
$('demo').onclick=()=>{if(busy)return;$('names').value='Emma\nOlivia\nAva\nSophia\nIsabella\nMia\nCharlotte\nAbbie\nEmily\nHarper\nNoah\nLiam\nWilliam\nMason\nJames\nBenjamin\nJacob\nMichael\nElijah\nEthan';$('prizes').value='Voucher Rp25.000 | 5\nWhite Peach Oolong Milk Tea | 15';message('Daftar contoh sudah diisi. Klik Simpan daftar untuk memakainya.');};
function placeWinner(name){
 if($('board').querySelector('.active'))return;
 const size=Number($('pageSize').value),lower=name.toLowerCase();
 let at=shownNames.findIndex(n=>n.toLowerCase()===lower);
 if(at>=0)shownNames[at]=name;
 else{
  // Winner is not in the participant list: show them at a random spot on a random page, like any drawn participant (an alphabetical spot would always land at the end when the name sorts after the whole roster).
  const roster=state.names,pos=roster.length?randomIndex(roster.length):0;
  boardPage=Math.floor(pos/size);
  shownNames=roster.slice(boardPage*size,(boardPage+1)*size);
  const slot=Math.min(pos-boardPage*size,shownNames.length);
  shownNames.splice(slot,0,name);
  if(shownNames.length>size)shownNames.pop();
  at=shownNames.indexOf(name);
  const pages=Math.max(1,Math.ceil(roster.length/size));
  $('pageInfo').textContent=`${boardPage*size+1}–${Math.min((boardPage+1)*size,roster.length)} dari ${roster.length.toLocaleString('id-ID')} nama · Hal. ${boardPage+1}/${pages}`;
  $('prev').disabled=boardPage===0;$('next').disabled=boardPage===pages-1;
 }
 const won=new Set(state.history.map(h=>h.name.toLowerCase()));
 $('board').replaceChildren();shownNames.forEach((n,k)=>{const e=text('div',n,'tile'+(k===at?' active':won.has(n.toLowerCase())?' won':''));e.title=n;$('board').append(e);});
 publicBoard={names:shownNames.slice(),active:name,size};
}
function showWinnerResult(heading,name,prize){
 const nodes=[text('div',heading,'eyebrow'),text('div',name,'winner')];
 if(prize)nodes.push(text('div',prize,'prize'));
 $('result').replaceChildren(...nodes);
}
// Share result and history bookkeeping across random and official announcements.
async function runDraw(forced){
 if(busy)return;const pool=eligible(),prizes=remaining(),total=prizes.reduce((a,p)=>a+p.left,0);
 if(!forced&&(!pool.length||!total)){message(!pool.length?'Belum ada peserta yang memenuhi syarat. Simpan daftar peserta atau reset hasil.':'Stok hadiah habis. Tambah jumlah hadiah, lalu klik Simpan daftar.');return;}
 const button=forced?forced.button:$('draw');
 const lite=forced?.lite===true;
 busy=true;const lock=on=>document.querySelectorAll('aside button,aside input,aside textarea').forEach(e=>e.disabled=on);lock(true);button.disabled=true;
 if(!lite){button.textContent=forced?'Mengumumkan…':'Mengacak…';$('result').replaceChildren(text('div','Siapa yang beruntung hari ini?','hint'));}
 try{
  let name,prize;
  if(forced){name=forced.name;prize=forced.prize;}else{name=pool[randomIndex(pool.length)];let ticket=randomIndex(total);for(const p of prizes){if(ticket<p.left){prize=p.name;break;}ticket-=p.left;}}
  const spin=pool.length?pool:state.names,reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(!lite&&spin.length)for(let i=0;i<(reduced?1:28);i++){showBoard(pool,spin[randomIndex(spin.length)]);await sleep(reduced?150:55+i*5);}
  const entry={name,prize,date:new Date().toISOString()};if(forced?.source)entry.source=forced.source;
  state.history.push(entry);if(forced?.commit)forced.commit();save();busy=false;render();
  if(!lite){showBoard(pool,name);placeWinner(name);}
  showWinnerResult('SELAMAT KEPADA',name,prize);
  notifyOperator(`${name} diumumkan sebagai pemenang.`);
  button.textContent=forced?forced.done:'Acak pemenang berikutnya';lock(false);
  if(!lite)for(let i=0;i<45;i++){const e=text('i','','confetti');e.style.left=Math.random()*100+'%';e.style.background=['#a13e30','#618348','#d49b3e'][i%3];e.style.animationDelay=Math.random()*.5+'s';$('confetti').append(e);setTimeout(()=>e.remove(),3200);}
 }catch(err){busy=false;lock(false);render();message('Pengundian gagal. Muat ulang halaman ini, lalu coba lagi.');console.error(err);}
}
$('draw').onclick=()=>runDraw();
$('reset').onclick=()=>{
 if(busy)return;
 if(!confirm('Langkah 1 dari 2 · Reset hasil & nama\n\nYang akan dikosongkan: semua hasil undian, daftar pemenang Simbolis dan Lite beserta progres pengumumannya, dan daftar peserta. Daftar hadiah tetap tersimpan.\n\nEkspor CSV dulu jika hasilnya masih dibutuhkan. Lanjutkan?'))return;
 if(!confirm('Langkah 2 dari 2 · Konfirmasi terakhir\n\nHapus semua hasil, daftar pemenang, dan nama peserta sekarang? Tindakan ini tidak bisa dibatalkan.'))return;
 state.history=[];state.names=[];delete state.official;delete state.officialModes;
 boardPage=0;$('search').value='';$('autoplay').checked=false;
 save();fill();render();
 $('draw').textContent='Acak pemenang';
 if($('revealOfficial'))$('revealOfficial').textContent='Umumkan pemenang berikutnya';
 document.querySelector('.stage').classList.remove('announcing','celebrating');
 $('confetti').replaceChildren();
 $('result').replaceChildren(text('div','Hadiah terungkap setelah nama terpilih.','hint'));
 message('Reset selesai. Hasil, daftar pemenang, dan nama peserta dikosongkan. Daftar hadiah tetap tersimpan.',true);
};
$('export').onclick=()=>{if(!state.history.length){message('Belum ada pemenang untuk diekspor. Lakukan undian atau pengumuman dulu.');return;}const cell=v=>'"'+String(/^[=+\-@\t\r]/.test(v)?"'"+v:v).replaceAll('"','""')+'"';const rows=[['Nama','Hadiah','Waktu ISO'],...state.history.map(h=>[h.name,h.prize,h.date])];const url=URL.createObjectURL(new Blob(['\uFEFF'+rows.map(r=>r.map(cell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='momoyo-pemenang-'+new Date().toISOString().slice(0,10)+'.csv';a.click();notifyOperator('Ekspor CSV dimulai. Periksa folder Unduhan.');setTimeout(()=>URL.revokeObjectURL(url),1000);};
function presentation(on){document.body.classList.toggle('present',on);$('presentation').textContent=on?'Kembali ke pengaturan':'Buka mode presentasi';}
$('presentation').onclick=()=>presentation(!document.body.classList.contains('present'));document.addEventListener('keydown',e=>{if(e.key==='Escape')presentation(false);});fill();render();




