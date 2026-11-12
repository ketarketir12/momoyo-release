// Browser operator -> local relay -> OBS (independent browser storage).
if(location.protocol==='http:'){
 (async()=>{
  const status=document.createElement('div');status.className='hint';$('saveStatus').after(status);
  $('draw').disabled=true;
  let postedRev=-1,pending=false,blocked=false,claiming=false;
  // Delivery facts shown to the operator: what was posted to the relay, and what an overlay page confirmed rendering.
  const link=window.momoyoLink={
   sent:{ok:true,view:'',changed:Date.now(),get since(){return Date.now()-this.changed;}},
   ack:{obs:null,browser:null},
   synced:()=>postedRev===stateRev&&!blocked
  };
  const viewOf=f=>{
   if(!f.lite)return f.official?'official':'roulette';
   if(f.hideLiteOverlay)return 'hidden';
   if(f.recap)return `recap:${f.recap.page}/${f.recap.pages}`;
   const winner=f.result.find(item=>item.kind==='winner');
   return winner?'winner:'+winner.text:'waiting';
  };
  async function readAck(){
   try{
    const r=await fetch('/api/overlay-status',{cache:'no-store',signal:AbortSignal.timeout(3000)});
    if(r.ok){const data=await r.json();link.ack.obs=data.obs;link.ack.browser=data.browser;}
   }catch{}
  }
  let inherited=null;try{inherited=sessionStorage.getItem('momoyoClaim');sessionStorage.removeItem('momoyoClaim');}catch{}
  const clientId=inherited||(crypto.randomUUID?crypto.randomUUID():Date.now()+'-'+Math.random().toString(16).slice(2)).slice(0,64);
  const banner=document.createElement('div');banner.hidden=true;
  banner.className='lock-banner';banner.setAttribute('role','alertdialog');banner.setAttribute('aria-label','Tab operator terkunci');
  const bannerText=document.createElement('div');bannerText.textContent='Tab operator lain sedang mengendalikan overlay OBS, jadi tab ini dikunci agar tayangan tidak tertimpa. Tutup tab ini, atau klik tombol di bawah untuk memindahkan kendali ke sini.';
  const claim=document.createElement('button');claim.textContent='Jadikan tab ini operator';claim.dataset.variant='primary';
  claim.onclick=()=>{claiming=true;};banner.append(bannerText,claim);document.documentElement.append(banner);
  addEventListener('pagehide',()=>{try{navigator.sendBeacon('/api/update',new Blob([JSON.stringify({client:clientId,release:true})],{type:'application/json'}));}catch{}});
  function setBlocked(on){if(blocked===on)return;blocked=on;banner.hidden=!on;document.body.inert=on;}
  async function post(update){
   return fetch('/api/update',{method:'POST',signal:AbortSignal.timeout(3000),headers:{'Content-Type':'application/json'},body:JSON.stringify({client:clientId,...update})});
  }
  try{
   const response=await fetch('/api/state',{cache:'no-store'});if(!response.ok)throw Error('server');
   const saved=await response.json(),local=state;
   if(saved){
    // Browser copy and server copy can diverge (e.g. server was down during a draw). Never overwrite a newer browser copy silently.
    const strip=o=>JSON.stringify({...o,savedAt:0}),ls=local.savedAt||0,ss=saved.savedAt||0;
    let useLocal=false;
    if(ls>ss&&strip(local)!==strip(saved)){
     useLocal=confirm('Data di browser ini lebih baru dan berbeda dari data di server MOMOYO.\n\nBrowser: '+new Date(ls).toLocaleString('id-ID')+' ('+local.history.length+' hasil)\nServer: '+(ss?new Date(ss).toLocaleString('id-ID'):'tanpa waktu')+' ('+saved.history.length+' hasil)\n\nOK = pakai data browser dan timpa data server.\nBatal = pakai data server dan buang data browser ini.');
    }
    state=useLocal?local:saved;fill();render();
    if(ls>ss&&strip(local)!==strip(saved))save(); // settle: both copies now agree, so this question is not asked again
   }
   $('draw').disabled=false;
  }catch{status.textContent='MOMOYO belum tersambung ke server lokal. Jalankan MOMOYO Live.cmd, lalu muat ulang halaman ini.';return;}
  async function sync(){
   if(pending)return;pending=true;
   try{
    const rev=stateRev;
    const lite=liteAnnouncement();
    const frame={official:state.official?.enabled===true,lite,hideLiteOverlay:lite&&liteOverlayHidden,names:lite?[]:publicBoard.names,active:lite?null:publicBoard.active,busy,result:[...$('result').children].map(e=>({text:e.textContent,kind:e.className})),page:boardPage,size:publicBoard.size,total:state.names.length,stamp:Date.now()};
    if(claiming){
     // Take control without pushing this tab's (possibly stale) data; reload to pick up the server's latest state.
     const c=await fetch('/api/update',{method:'POST',signal:AbortSignal.timeout(3000),headers:{'Content-Type':'application/json'},body:JSON.stringify({client:clientId,takeover:true,claim:true})});
     if(c.ok){try{sessionStorage.setItem('momoyoClaim',clientId);}catch{}location.reload();return;}claiming=false;
    }
    if(lite)frame.recap=liteRecapFrame();
    const view=viewOf(frame);
    const payload={client:clientId,frame};if(!blocked&&rev!==postedRev)payload.state=state;
    const r=await fetch('/api/update',{method:'POST',signal:AbortSignal.timeout(3000),headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    if(r.status===409){setBlocked(true);status.textContent='Tab operator lain sedang aktif, jadi tab ini dikunci.';return;}
    if(!r.ok)throw Error('sync');
    if(blocked){location.reload();return;} // other tab went away: reload to resync before taking control
    postedRev=rev;
    if(link.sent.view!==view)link.sent.changed=Date.now();
    link.sent.view=view;link.sent.ok=true;
    window.peachPodium?.connect(async update=>{
     if(blocked||claiming)throw Error('Tab ini tidak sedang memegang kendali. Klik Jadikan tab ini operator, lalu coba lagi.');
     const response=await post(update);
     if(response.status===409)setBlocked(true);
     if(!response.ok)throw Error('Server MOMOYO belum mengonfirmasi perubahan. Periksa jendela MOMOYO, lalu coba lagi.');
     return response.json();
    });
    status.textContent='Server MOMOYO tersambung · gunakan satu tab operator selama LIVE.';
   }catch{link.sent.ok=false;status.textContent='Server MOMOYO tidak merespons. Periksa jendela MOMOYO; tayangan di OBS berhenti sampai sambungan pulih.';}
   finally{pending=false;}
  }
  await sync();timers.every(sync,100);readAck();timers.every(readAck,1000);
 })();
}


