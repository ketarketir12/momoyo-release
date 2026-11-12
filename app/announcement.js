const officialPanel=document.createElement('section');officialPanel.className='panel';
officialPanel.innerHTML='<h2>Pengumuman simbolis MOMOYO</h2><p class="hint">Tempel nama atau Nama | Hadiah sesuai urutan pengumuman. Pemenang baru ditambahkan di baris paling bawah; yang sudah diumumkan tidak diulang.</p><label for="officialNames">Nama pemenang | hadiah</label><textarea id="officialNames" placeholder="@nama_pemenang | Voucher Rp25.000"></textarea><div class="actions"><button id="saveOfficial" data-variant="primary">Simpan daftar pemenang</button><button id="restartOfficial" data-variant="danger">Ulangi pengumuman dari awal</button><button id="randomMode">Kembali ke undian acak</button></div><p id="officialProgress" class="hint"></p>';
document.querySelector('aside').prepend(officialPanel);
const setupPanel=$('names').closest('.panel');
const copyOfficial=document.createElement('button');
copyOfficial.type='button';copyOfficial.hidden=true;copyOfficial.dataset.variant='secondary';
$('saveOfficial').after(copyOfficial);
function officialMode(queue){
 return queue?.lite===true?'lite':'symbolic';
}
function selectOfficialMode(data,mode){
 if(mode==='random'){
  if(data.official)data.official.enabled=false;
  return;
 }
 const current=data.official;
 if(current&&officialMode(current)===mode){current.enabled=true;return;}
 const stored=data.officialModes??={};
 if(current)stored[officialMode(current)]=current;
 const target=stored[mode]??{queue:[],index:0};
 delete stored[mode];
 data.official={...target,enabled:true,lite:mode==='lite'};
}
function otherOfficialMode(){
 const other=liteAnnouncement()?'symbolic':'lite';
 return {label:other==='lite'?'Lite':'Simbolis',source:state.officialModes?.[other]};
}
copyOfficial.onclick=()=>{
 if(busy||!official()||state.official.queue.length)return;
 const {label,source}=otherOfficialMode();
 if(!source?.queue.length)return;
 if(!confirm(`Salin daftar dari ${label} ke mode ini?\n\nUrutan pengumuman di sini dimulai dari awal (0 dari ${source.queue.length} diumumkan). Daftar dan progres ${label} tidak berubah.`))return;
 state.official.queue=source.queue.map(winner=>({name:winner.name,prize:winner.prize??''}));
 state.official.index=0;
 save();fill();render();
 notifyOperator(`Daftar dari ${label} disalin. Progres ${label} tidak berubah.`);
};
const modeControls=document.createElement('section');
modeControls.className='panel roulette-mode-panel';
modeControls.innerHTML='<fieldset class="mode-picker"><legend>Mode acara</legend><div class="mode-buttons"><label><input type="radio" name="roulette-mode" value="random"><span>Acak</span></label><label><input type="radio" name="roulette-mode" value="symbolic"><span>Simbolis</span></label><label><input type="radio" name="roulette-mode" value="lite"><span>Lite</span></label></div><p class="mode-description" id="modeDescription" aria-live="polite"></p></fieldset>';
const modeDescriptions={random:'Acak · Undi nama dari peserta yang memenuhi syarat',symbolic:'Simbolis · Umumkan pemenang yang sudah ditetapkan, lengkap dengan hadiah',lite:'Lite · Langsung umumkan nama dari daftar'};
modeControls.querySelector('.mode-buttons').setAttribute('aria-describedby','modeDescription');
officialPanel.before(modeControls);
const modeInputs=modeControls.querySelectorAll('input');
const statusPanel=document.createElement('section');
statusPanel.className='panel operator-status';
statusPanel.append($('message'),$('saveStatus'),createObsSetup('/overlay.html',1080,600));
modeControls.after(statusPanel);
const litePrizes=document.createElement('details');
litePrizes.hidden=true;
litePrizes.innerHTML='<summary>Nama dan hadiah</summary><label>Hadiah yang sama untuk semua pemenang yang belum diumumkan<input class="lite-bulk-prize" type="text" placeholder="Contoh: Voucher Rp25.000"></label><button type="button" class="lite-fill-prizes" data-variant="secondary">Isi hadiah yang sama</button><div class="lite-prize-rows"><table aria-label="Nama dan hadiah pemenang"><thead><tr><th scope="col">Urutan</th><th scope="col">Nama</th><th scope="col" data-prize-heading>Hadiah</th><th scope="col">Status</th></tr></thead><tbody></tbody></table></div><button type="button" class="lite-save-prizes" data-variant="primary">Simpan hadiah</button><p class="hint" role="status"></p>';
officialPanel.after(litePrizes);
litePrizes.className='panel lite-prizes';
const prizeRows=litePrizes.querySelector('tbody');
const saveLitePrizes=litePrizes.querySelector('.lite-save-prizes');
const bulkPrize=litePrizes.querySelector('.lite-bulk-prize');
const fillPrizes=litePrizes.querySelector('.lite-fill-prizes');
const prizeStatus=litePrizes.querySelector('[role=status]');
fillPrizes.onclick=()=>{
 if(busy||!official())return;
 const prize=bulkPrize.value.trim();
 if(!prize){prizeStatus.textContent='Kolom hadiah masih kosong. Ketik hadiah, lalu klik Isi hadiah yang sama.';bulkPrize.focus();return;}
 for(const input of prizeRows.querySelectorAll('input:not([readonly])'))input.value=prize;
 prizeStatus.textContent='Hadiah terisi di semua baris yang belum diumumkan. Klik Simpan hadiah agar tersimpan.';
 notifyOperator('Hadiah terisi, belum tersimpan. Klik Simpan hadiah.');
};
function fillLitePrizes(){
 prizeRows.replaceChildren();
 for(const [index,winner] of (state.official?.queue||[]).entries()){
  const row=document.createElement('tr');
  const name=text('th',winner.name);name.scope='row';
  const input=document.createElement('input');
  input.type='text';input.value=winner.prize??'';input.setAttribute('aria-label',`Hadiah untuk ${winner.name}`);
  input.readOnly=index<state.official.index;
  const prize=document.createElement('td');prize.append(input);
  row.append(text('td',String(index+1)),name,prize,document.createElement('td'));
  prizeRows.append(row);
 }
}
saveLitePrizes.onclick=()=>{
 if(busy||!official())return;
 const officialState=state.official;
 const namesEdited=$('officialNames').value!==officialNamesText();
 const inputs=prizeRows.querySelectorAll('input');
 for(let index=officialState.index;index<officialState.queue.length;index++){
  officialState.queue[index].prize=inputs[index].value.trim();
 }
 save();
 if(namesEdited)fillLitePrizes();else fillOfficialNames();
 render();
 prizeStatus.textContent='Hadiah disimpan.';
 notifyOperator('Hadiah pemenang disimpan.');
};
const reveal=document.createElement('button');reveal.id='revealOfficial';reveal.className='draw';reveal.dataset.variant='primary';reveal.textContent='Umumkan pemenang berikutnya';reveal.hidden=true;$('draw').after(reveal);
const nextWinner=document.createElement('section');
nextWinner.className='official-next';nextWinner.hidden=true;
nextWinner.innerHTML='<strong>Berikutnya</strong><div data-next-name></div><div data-next-prize></div><progress aria-label="Progres pengumuman"></progress><p class="official-progress-text" data-progress-text></p><p class="official-block" id="officialBlock" data-block role="status"></p>';
reveal.before(nextWinner);
const recap=document.createElement('button');recap.type='button';recap.className='lite-recap';recap.dataset.variant='secondary';recap.hidden=true;reveal.after(recap);
const liteVisibility=document.createElement('button');
liteVisibility.type='button';liteVisibility.className='lite-recap';liteVisibility.dataset.variant='secondary';liteVisibility.hidden=true;
recap.after(liteVisibility);
const readiness=document.createElement('section');
readiness.className='readiness';
readiness.innerHTML='<h2>Kesiapan undian</h2><p class="readiness-state" data-ready-state></p><dl><div><dt>Peserta memenuhi syarat</dt><dd data-eligible></dd></div><div><dt>Stok hadiah</dt><dd data-stock></dd></div></dl><p class="readiness-prizes" data-prizes></p><p class="official-block" id="readyBlock" data-ready-block role="status"></p>';
const liveStatus=document.createElement('section');
liveStatus.className='live-status';liveStatus.hidden=true;
liveStatus.innerHTML='<h2>Status tayang Lite</h2><p class="live-now" data-live-now></p><ul aria-live="polite"><li data-check="saved"></li><li data-check="sent"></li><li data-check="obs"></li></ul>';
const broadcast=document.createElement('div');
broadcast.className='broadcast-controls';
$('draw').before(broadcast);
broadcast.append(readiness,nextWinner,$('draw'),reveal,recap,liteVisibility,liveStatus);
$('count').hidden=true;
let liteOverlayHidden=false;
function updateLiteVisibility(){
 liteVisibility.hidden=!liteAnnouncement();
 liteVisibility.textContent=liteOverlayHidden?'Tampilkan overlay':'Sembunyikan overlay';
 liteVisibility.setAttribute('aria-pressed',String(liteOverlayHidden));

}
liteVisibility.onclick=()=>{
 liteOverlayHidden=!liteOverlayHidden;
 updateLiteVisibility();
 notifyOperator(liteOverlayHidden?'Overlay Lite disembunyikan. Tampilan di OBS dikosongkan.':'Overlay Lite ditampilkan lagi.');
};
let recapSession=null;
const recapPanel=document.createElement('section');
recapPanel.className='panel lite-recap-settings';
recapPanel.innerHTML='<h2>Rekap pemenang bergilir</h2><label>Sumber nama<select><option value="announced">Pemenang yang sudah diumumkan</option><option value="manual">Ketik manual</option></select></label><label class="recap-manual" hidden>Nama pemenang<textarea placeholder="Satu nama per baris"></textarea></label><label>Durasi per giliran (detik)<input type="number" min="1" max="300" value="5" list="recap-durations"><datalist id="recap-durations"><option value="3"><option value="5"><option value="8"><option value="10"></datalist></label><p class="hint" role="status"></p>';
litePrizes.after(recapPanel);
const recapSource=recapPanel.querySelector('select');
const manualRecap=recapPanel.querySelector('.recap-manual');
const manualNames=manualRecap.querySelector('textarea');
const recapDuration=recapPanel.querySelector('input');
const recapStatus=recapPanel.querySelector('[role=status]');
function recapDurationMs(){
 const seconds=recapDuration.valueAsNumber;
 return Number.isFinite(seconds)?Math.max(1,Math.min(300,seconds))*1000:5000;
}
function groupRecap(entries){
 const pages=Math.ceil(entries.length/10);
 return Array.from({length:pages},(_,index)=>{
  const base=Math.floor(entries.length/pages),extra=entries.length%pages;
  const start=index*base+Math.min(index,extra);
  return entries.slice(start,start+base+(index<extra?1:0)).map(entry=>entry.name);
 });
}
function liteRecapFrame(){
 if(!recapSession)return null;
 const {groups,index}=recapSession;
 return {names:groups[index],page:index+1,pages:groups.length};
}
function recapEntries(){
 if(recapSource.value==='manual'){
  const names=manualNames.value.split(/\r?\n/).map(name=>name.trim()).filter(Boolean);
  return [...new Set(names)].map(name=>({name,prize:''}));
 }
 const o=state.official;
 return o?o.queue.slice(0,o.index):[];
}
function official(){return state.official?.enabled===true;}
function liteAnnouncement(){return official()&&state.official.lite===true;}
function updateRecapButton(){
 recapPanel.hidden=!liteAnnouncement();
 manualRecap.hidden=recapSource.value!=='manual';
 recap.hidden=!liteAnnouncement();
 recap.disabled=busy||(!recapSession&&!recapEntries().length);
 recap.textContent=recapSession?'Hentikan rekap di OBS':'Tampilkan rekap di OBS';
 recap.setAttribute('aria-pressed',String(Boolean(recapSession)));
}
function stopRecap(){
 if(!recapSession)return;
 recapSession=null;
 recapStatus.textContent='';
 updateRecapButton();
}
function renderRecap(){
 if(!recapSession)return;
 if(!liteAnnouncement()){stopRecap();return;}
 const {groups,deadline}=recapSession;
 const now=performance.now();
 if(groups.length<2||now<deadline)return;
 recapSession.index=(recapSession.index+1)%groups.length;
 recapSession.deadline=now+recapDurationMs();
 recapStatus.textContent=`Rekap aktif · giliran ${recapSession.index+1} dari ${groups.length}`;
}
recap.onclick=()=>{
 if(recapSession){stopRecap();notifyOperator('Rekap dihentikan. OBS kembali ke tampilan sebelumnya.');return;}
 if(busy||!liteAnnouncement())return;
 const entries=recapEntries();
 if(!entries.length)return;
 const groups=groupRecap(entries);
 recapSession={groups,index:0,deadline:performance.now()+recapDurationMs()};
 recapStatus.textContent=`Rekap aktif · giliran 1 dari ${groups.length}`;
 liteOverlayHidden=false;updateLiteVisibility();
 updateRecapButton();renderRecap();
 notifyOperator('Rekap dikirim ke OBS dan berganti otomatis.');
};
recapSource.onchange=()=>{stopRecap();updateRecapButton();};
manualNames.oninput=updateRecapButton;
timers.every(renderRecap,100);
const markIcons={
 ok:'<path d="M20 6 9 17l-5-5"/>',
 wait:'<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
 warn:'<circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>'
};
const mark=kind=>`<svg class="status-mark" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${markIcons[kind]}</svg>`;
function readinessSummary(){
 const pool=eligible(),stock=remaining(),total=stock.reduce((a,p)=>a+p.left,0);
 let block='';
 if(!state.names.length)block='Belum ada peserta. Tempel daftar peserta di Siapkan undian Acak, lalu klik Simpan daftar.';
 else if(!pool.length)block='Semua peserta sudah menang. Tambah peserta, matikan opsi menang sekali, atau reset hasil.';
 else if(!state.prizes.length)block='Belum ada hadiah. Isi hadiah & jumlah, lalu klik Simpan daftar.';
 else if(!total)block='Stok hadiah habis. Tambah jumlah hadiah, lalu klik Simpan daftar.';
 return {pool,stock,total,block};
}
function updateReadiness(){
 const {pool,stock,total,block}=readinessSummary();
 readiness.hidden=official();
 const ready=!block;
 readiness.dataset.ready=String(ready);
 readiness.querySelector('[data-ready-state]').innerHTML=mark(ready?'ok':'warn')+(ready?'Siap diundi':'Belum siap diundi');
 const won=state.names.length-pool.length;
 readiness.querySelector('[data-eligible]').textContent=`${pool.length.toLocaleString('id-ID')} dari ${state.names.length.toLocaleString('id-ID')}`+(state.exclude&&won>0?` (${won.toLocaleString('id-ID')} sudah menang)`:'');
 readiness.querySelector('[data-stock]').textContent=`${total.toLocaleString('id-ID')} hadiah tersisa`;
 const shown=stock.slice(0,4).map(p=>`${p.name} · ${p.left} dari ${p.qty}`);
 readiness.querySelector('[data-prizes]').textContent=stock.length?shown.join(' | ')+(stock.length>4?` | dan ${stock.length-4} hadiah lain`:'')+'. Hadiah dipilih acak dari stok saat undian.':'';
 readiness.querySelector('[data-ready-block]').textContent=block;
 $('draw').disabled=busy||!ready;
 if(block)$('draw').setAttribute('aria-describedby','readyBlock');else $('draw').removeAttribute('aria-describedby');
}
function liteView(){
 if(liteOverlayHidden)return 'hidden';
 if(recapSession)return `recap:${recapSession.index+1}/${recapSession.groups.length}`;
 const winner=[...$('result').children].find(e=>e.className==='winner');
 return winner?'winner:'+winner.textContent:'waiting';
}
function unsavedOfficial(){
 const o=state.official;if(!o)return false;
 if($('officialNames').value!==officialNamesText())return true;
 const inputs=prizeRows.querySelectorAll('input');
 for(let index=o.index;index<o.queue.length;index++){
  if(inputs[index]&&inputs[index].value.trim()!==(o.queue[index].prize||''))return true;
 }
 return false;
}
let liveKey='';
function updateLiveStatus(){
 const lite=liteAnnouncement();
 liveStatus.hidden=!lite;
 if(!lite)return;
 const o=state.official,link=window.momoyoLink,view=liteView();
 let now;
 if(view==='hidden')now='Overlay tersembunyi · OBS tidak menampilkan apa pun';
 else if(view.startsWith('recap:'))now=`Rekap aktif · giliran ${recapSession.index+1} dari ${recapSession.groups.length}`;
 else if(view.startsWith('winner:'))now='Pengumuman satu nama · '+view.slice(7);
 else now='Overlay kosong · menunggu pengumuman';
 let saved;
 if(unsavedOfficial())saved=['warn','Perubahan belum disimpan. Klik Simpan daftar pemenang atau Simpan hadiah.'];
 else if(link&&!link.synced())saved=['wait','Daftar pemenang disimpan di browser · menyalin ke server MOMOYO…'];
 else saved=['ok','Daftar pemenang disimpan'+(o.queue.length?` · ${o.queue.length} nama`:'')];
 let sent,obs;
 if(!link){
  sent=['warn','Tayangan belum bisa dikirim. Buka MOMOYO lewat MOMOYO Live.cmd agar OBS menerima tampilan.'];
  obs=['warn','Belum terverifikasi di OBS.'];
 }else{
  if(!link.sent.ok)sent=['warn','Belum terkirim ke overlay. Server MOMOYO tidak merespons; periksa jendela MOMOYO.'];
  else if(link.sent.view!==view)sent=['wait','Mengirim ke overlay…'];
  else sent=['ok','Terkirim ke overlay'];
  const ack=link.ack.obs,fresh=ack&&ack.age<4;
  if(sent[0]!=='ok')obs=['wait','Verifikasi OBS menunggu pengiriman ke overlay.'];
  else if(fresh&&ack.view===view)obs=['ok','Terverifikasi di OBS · Browser Source sudah memuat tampilan ini'];
  else if(fresh&&link.sent.since<3000)obs=['wait','OBS terhubung · memuat tampilan terbaru…'];
  else if(fresh)obs=['warn','OBS belum menampilkan tampilan terbaru. Klik Refresh overlay OBS di Setup & Pembaruan.'];
  else if(link.ack.browser&&link.ack.browser.age<4)obs=['warn','Overlay terbuka di browser biasa, bukan di OBS. Tambahkan Browser Source Roulette di OBS.'];
  else obs=['warn','Belum ada konfirmasi dari OBS. Periksa apakah OBS terbuka dan Browser Source Roulette aktif.'];
 }
 const key=JSON.stringify([now,saved,sent,obs]);
 if(key===liveKey)return;liveKey=key;
 liveStatus.querySelector('[data-live-now]').textContent=now;
 for(const [name,[kind,label]] of Object.entries({saved,sent,obs})){
  const item=liveStatus.querySelector(`[data-check=${name}]`);
  item.dataset.state=kind;item.innerHTML=mark(kind);item.append(label);
 }
}
function updateOfficial(){
 const enabled=official(),lite=liteAnnouncement(),o=state.official;
 const mode=lite?'lite':enabled?'symbolic':'random';
 officialPanel.hidden=!enabled;
 const other=otherOfficialMode();
 copyOfficial.hidden=!enabled||Boolean(o?.queue.length)||!other.source?.queue.length;
 copyOfficial.disabled=busy;
 copyOfficial.textContent=`Salin daftar dari ${other.label}`;
 setupPanel.hidden=enabled;
 officialPanel.querySelector('h2').textContent=lite?'Daftar pemenang Lite':'Daftar pemenang Simbolis';
 officialPanel.querySelector('.hint').textContent=lite?'Isi satu nama per baris sesuai urutan pengumuman. Hadiah bersifat opsional dan diisi di tabel.':'Tempel nama atau Nama | Hadiah sesuai urutan. Lengkapi hadiah di tabel sebelum mengumumkan.';
 litePrizes.hidden=!enabled;
 litePrizes.querySelector('[data-prize-heading]').textContent=lite?'Hadiah (opsional)':'Hadiah';
 updateLiteVisibility();
 saveLitePrizes.disabled=busy||!o||o.index>=o.queue.length;
 fillPrizes.disabled=saveLitePrizes.disabled;
 bulkPrize.disabled=saveLitePrizes.disabled;
 for(const [index,input] of prizeRows.querySelectorAll('input').entries()){
  input.readOnly=index<(o?.index||0);
  input.placeholder=lite?'Opsional':'Wajib sebelum tayang';
  const row=input.closest('tr');
  row.lastElementChild.textContent=input.readOnly?'Sudah diumumkan':index===o.index?'Berikutnya':'Menunggu';
  row.dataset.status=input.readOnly?'done':index===o.index?'next':'waiting';
 }
 const nameLabel=document.querySelector('label[for="officialNames"]');
 nameLabel.textContent=lite?'Nama pemenang · satu per baris':'Nama pemenang | hadiah';
 $('officialNames').placeholder=lite?'@nama_pemenang':'@nama_pemenang | Voucher Rp25.000';
 for(const input of modeInputs){input.checked=input.value===mode;input.disabled=busy;}
 $('modeDescription').textContent=modeDescriptions[mode];
 document.querySelector('.stage').classList.toggle('roulette-lite',lite);
 const missingPrize=enabled&&!lite&&o.index<o.queue.length&&!o.queue[o.index].prize;
 $('draw').hidden=enabled;reveal.hidden=!enabled;reveal.disabled=busy||!o||o.index>=o.queue.length||missingPrize;
 if(recapSession&&!lite)stopRecap();
 updateRecapButton();
 updateReadiness();
 const idle=$('result').children;
 if(!busy&&idle.length===1&&idle[0].className==='hint'){
  const hint={random:'Hadiah terungkap setelah nama terpilih.',symbolic:'Nama dan hadiah muncul di sini setelah diumumkan.',lite:'Nama pemenang muncul di sini setelah diumumkan.'}[mode];
  if(idle[0].textContent!==hint&&!/Siapa yang beruntung/.test(idle[0].textContent))idle[0].textContent=hint;
 }
 document.querySelector('.stage .subtitle').textContent=lite?'Mode Lite · pengumuman sesuai urutan daftar pemenang':enabled?'Mode Simbolis · pengumuman sesuai urutan daftar pemenang':'Undian acak dari peserta yang memenuhi syarat';
 if(enabled)$('officialProgress').textContent=unsavedOfficial()?'Ada perubahan yang belum disimpan. Klik Simpan daftar pemenang.':o.queue.length?`Daftar pemenang disimpan · ${o.queue.length} nama`:'Daftar masih kosong. Tambahkan nama pemenang.';
 nextWinner.hidden=!enabled;
 if(enabled){
  const total=o.queue.length,next=o.queue[o.index];
  nextWinner.querySelector('[data-next-name]').textContent=next?.name||'';
  nextWinner.querySelector('[data-next-prize]').textContent=next?(next.prize||(lite?'Tanpa hadiah':'Hadiah belum diisi')):'';
  const progress=nextWinner.querySelector('progress');
  progress.max=total||1;progress.value=o.index;
  nextWinner.querySelector('[data-progress-text]').textContent=!total?'0 dari 0 diumumkan':next?`${o.index} dari ${total} diumumkan`:`Semua pemenang sudah diumumkan (${total}/${total})`;
  const block=!total?(lite?'Daftar masih kosong. Tambahkan nama pemenang.':'Daftar masih kosong. Tambahkan nama pemenang dan hadiahnya.')
   :!next?(lite?'Pilih Tampilkan rekap di OBS jika ingin melanjutkan tayangan.':'Tambahkan nama baru di panel kanan atau ulangi pengumuman dari awal.')
   :missingPrize?`Isi hadiah untuk ${next.name} sebelum mengumumkannya. Ketik di tabel Nama dan hadiah, lalu klik Simpan hadiah.`:'';
  nextWinner.querySelector('[data-block]').textContent=busy?'':block;
  if(block&&!busy)reveal.setAttribute('aria-describedby','officialBlock');else reveal.removeAttribute('aria-describedby');
 }
 updateLiveStatus();
}
const originalRender=render;render=function(){originalRender();updateOfficial();};
function officialNamesText(){
 const lite=liteAnnouncement();
 return (state.official?.queue||[]).map(w=>lite||!w.prize?w.name:w.name+' | '+w.prize).join('\n');
}
function fillOfficialNames(){
 $('officialNames').value=officialNamesText();
 fillLitePrizes();
}
const originalFill=fill;fill=function(){originalFill();fillOfficialNames();updateOfficial();};
const originalDraw=$('draw').onclick;$('draw').onclick=async()=>{if(official())return;await originalDraw();};
$('saveOfficial').onclick=()=>{
 if(busy)return;const lines=$('officialNames').value.split(/\r?\n/).filter(l=>l.trim()),queue=[],seen=new Set();
 const lite=liteAnnouncement(),savedPrizes=new Map((state.official?.queue||[]).map(w=>[w.name.toLowerCase(),w.prize]));
 for(const line of lines){
  const [name,prize,...extra]=line.split('|').map(s=>s.trim());
  if(!name||extra.length){message('Ada baris yang tidak bisa dibaca. Tulis satu nama per baris, atau Nama | Hadiah.');return;}
  const key=name.toLowerCase();
  if(seen.has(key)){message(`Nama ${name} muncul dua kali. Hapus salah satunya, atau beri ID unik untuk orang yang berbeda.`);return;}
  seen.add(key);queue.push({name,prize:prize??savedPrizes.get(key)??''});
 }
 if(!queue.length||queue.length>100000){message('Daftar masih kosong. Tambahkan nama pemenang (maksimal 100000).');return;}
 // Winners already announced are locked: saving only appends/reorders the NOT-yet-announced ones, progress is kept.
 const old=state.official,done=old?old.queue.slice(0,old.index):[],doneNames=new Set(done.map(w=>w.name.toLowerCase()));
 const typed=new Map(queue.map(w=>[w.name.toLowerCase(),w]));
 const changed=done.filter(w=>{const t=typed.get(w.name.toLowerCase());return !t||t.prize!==w.prize;}).map(w=>w.name);
 const fresh=queue.filter(w=>!doneNames.has(w.name.toLowerCase())),merged=[...done,...fresh];
 const prevWon=new Set(state.history.filter(h=>h.source!=='official').map(h=>h.name.toLowerCase()));
 const already=fresh.filter(w=>prevWon.has(w.name.toLowerCase())).map(w=>w.name);
 const known=new Map(state.prizes.map(p=>[p.name,p.qty]));
 const unknown=[...new Set(fresh.filter(w=>w.prize&&!known.has(w.prize)).map(w=>w.prize))];
 const over=[...known].filter(([n,qty])=>merged.filter(w=>w.prize===n).length+state.history.filter(h=>h.source!=='official'&&h.prize===n).length>qty).map(([n])=>n);
 const warn=[];if(already.length)warn.push('Sudah pernah menang lewat undian Acak: '+already.slice(0,8).join(', ')+(already.length>8?' …':''));
 if(!liteAnnouncement()){
  if(unknown.length)warn.push('Hadiah belum ada di daftar hadiah Acak, jadi stoknya tidak dihitung: '+unknown.slice(0,8).join(', '));
  if(over.length)warn.push('Jumlah pemenang melebihi stok hadiah: '+over.join(', '));
 }
 if(warn.length&&!confirm('Periksa dulu sebelum menyimpan:\n\n'+warn.join('\n')+'\n\nTetap simpan daftar pemenang?'))return;
 state.official={...old,enabled:true,lite:liteAnnouncement(),queue:merged,index:done.length};if(!done.length)reveal.textContent='Umumkan pemenang berikutnya';
 // Official announcements never add names to the participant board.
 save();fill();render();
 litePrizes.open=true;
 notifyOperator('Daftar pemenang disimpan.');
 if(!done.length){$('result').replaceChildren(text('div','Siapa yang beruntung hari ini?','hint'));message(`Daftar pemenang disimpan · ${merged.length} nama. Klik Umumkan pemenang berikutnya.`);}
 else message(`Daftar pemenang disimpan · ${done.length} sudah diumumkan tetap aman, ${fresh.length} menunggu.`+(changed.length?` Perubahan pada pemenang yang sudah diumumkan diabaikan: ${changed.slice(0,5).join(', ')}.`:''));
};
$('restartOfficial').onclick=()=>{
 if(busy||!state.official?.index)return;
 if(!confirm(`Ulangi pengumuman dari awal?\n\nProgres kembali ke 0 dari ${state.official.queue.length}. Pemenang yang sudah diumumkan akan diumumkan lagi sesuai urutan, dan rekap Lite kosong sampai ada yang diumumkan. Riwayat hasil tetap tersimpan.`))return;
 stopRecap();state.official.index=0;reveal.textContent='Umumkan pemenang berikutnya';save();fill();render();$('result').replaceChildren(text('div','Siapa yang beruntung hari ini?','hint'));message('Pengumuman diulang dari awal. Progres: 0 dari '+state.official.queue.length+'.',true);
};
$('randomMode').onclick=()=>{if(busy||!state.official)return;state.official.enabled=false;save();render();$('result').replaceChildren(text('div','Hadiah terungkap setelah nama terpilih.','hint'));message('Mode Acak aktif. Daftar pemenang dan progresnya tetap tersimpan.');};
reveal.onclick=async()=>{
 if(busy||!official())return;const o=state.official;if(o.index>=o.queue.length)return;
 stopRecap();
 const w=o.queue[o.index];
 if(!liteAnnouncement()&&!w.prize)return;
 await runDraw({name:w.name,prize:w.prize,button:reveal,done:'Umumkan pemenang berikutnya',source:'official',lite:liteAnnouncement(),commit:()=>{o.index++;}});
};
fill();render();
$('randomMode').hidden=true;
$('officialNames').addEventListener('input',updateOfficial);
prizeRows.addEventListener('input',updateOfficial);
timers.every(updateLiveStatus,250);
modeControls.onchange=event=>{
 if(event.target.name!=='roulette-mode')return;
 if(busy){updateOfficial();return;}
 const mode=event.target.value;
 stopRecap();
 selectOfficialMode(state,mode);
 reveal.textContent='Umumkan pemenang berikutnya';
 fillOfficialNames();
 save();render();document.querySelector('.stage').classList.remove('announcing','celebrating');
 notifyOperator(`Mode ${{random:'Acak',symbolic:'Simbolis',lite:'Lite'}[mode]} aktif.`);
 $('result').replaceChildren(text('div','','hint'));updateOfficial();
};





