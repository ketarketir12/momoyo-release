const board=document.getElementById('board'),result=document.getElementById('result'),connection=document.getElementById('connection'),title=document.querySelector('.title');
function resize(){
 const height=document.body.classList.contains('roulette-lite')?600:780;
 const scale=Math.min(innerWidth/1080,innerHeight/height);
 const left=(innerWidth-1080*scale)/2;
 document.getElementById('overlay').style.transform=`translateX(${left}px) scale(${scale})`;
}
addEventListener('resize',resize);resize();
let previous='',previousResult='',build=null,failures=0;
let announcementAnimation;
let recapBoard, recapTimer, recapKey='';
function renderRecapBoard(recap){
 const key=JSON.stringify(recap);
 if(key===recapKey)return;
 recapKey=key;
 clearTimeout(recapTimer);
 const first=!recapBoard;
 if(first){
  announcementAnimation?.cancel();
  const heading=document.createElement('h2');heading.textContent='Daftar Pemenang';
  const grid=document.createElement('ol');grid.className='lite-recap-grid';
  const slots=Array.from({length:10},()=>document.createElement('li'));
  grid.append(...slots);
  const indicator=document.createElement('p');indicator.className='lite-recap-indicator';
  result.replaceChildren(heading,grid,indicator);
  recapBoard={slots,indicator};
 }
 const animate=!matchMedia('(prefers-reduced-motion: reduce)').matches;
 const {slots,indicator}=recapBoard;
 function populate(){
  indicator.textContent=recap.pages>1?`${recap.page} / ${recap.pages}`:'';
  slots.forEach((slot,index)=>{
   slot.replaceChildren();
   if(!recap.names[index])return;
   const name=document.createElement('span');name.textContent=recap.names[index];name.title=name.textContent;slot.append(name);
   if(animate)name.animate([{opacity:0,transform:'scale(.86)'},{opacity:1,transform:'scale(1)'}],
    {duration:220,delay:Math.floor(index/2)*55,easing:'ease-out',fill:'backwards'});
  });
 }
 if(first||!animate){populate();return;}
 slots.forEach((slot,index)=>slot.firstChild?.animate(
  [{opacity:1,transform:'scale(1)'},{opacity:0,transform:'scale(.88)'}],
  {duration:140,delay:Math.floor(index/2)*55,easing:'ease-in',fill:'forwards'}));
 recapTimer=setTimeout(populate,360);
}
// Update tiles in place (no rebuild) so the board never flashes while names shuffle.
function syncBoard(names,active,size){
 board.classList.toggle('dense',size>20);
 if(!names.length){if(!board.querySelector('.empty')){board.replaceChildren();const e=document.createElement('div');e.className='empty';e.textContent='Menunggu daftar peserta';board.append(e);}return;}
 const empty=board.querySelector('.empty');if(empty)empty.remove();
 while(board.children.length>names.length)board.lastChild.remove();
 names.forEach((n,i)=>{let e=board.children[i];if(!e){e=document.createElement('div');board.append(e);}if(e.textContent!==n)e.textContent=n;const cls='tile'+(n===active?' active':'');if(e.className!==cls)e.className=cls;});
}
function applyFrame(f){
  const recap=f.lite?f.recap:null;
  const key=JSON.stringify([f.lite,f.hideLiteOverlay,f.names,f.active,f.result,f.size,recap]);if(key===previous)return;previous=key;
  const wasLite=document.body.classList.contains('roulette-lite');
  document.body.classList.toggle('roulette-lite',f.lite===true);
  if(wasLite!==(f.lite===true))resize();
  document.body.classList.toggle('lite-overlay-hidden',f.lite===true&&f.hideLiteOverlay===true);
  document.body.classList.toggle('roulette-lite-waiting',f.lite===true&&!recap&&!f.result.some(item=>item.kind==='winner'));
  document.body.classList.toggle('roulette-lite-recap',Boolean(recap));
  if(recap){renderRecapBoard(recap);return;}
  if(recapBoard){clearTimeout(recapTimer);recapBoard=null;recapKey='';previousResult='';}
  title.textContent='CAP-CIP-CUP WIN';
  if(!f.lite)syncBoard(f.names,f.active,f.size);
  const resultKey=JSON.stringify(f.result);
  if(resultKey!==previousResult){
   previousResult=resultKey;
   announcementAnimation?.cancel();
   result.replaceChildren();
   for(const item of f.result){
    const e=document.createElement('div');e.className=['hint','eyebrow','winner','prize'].includes(item.kind)?item.kind:'hint';
    e.textContent=item.text;result.append(e);
   }
   const announced=f.result.some(item=>item.kind==='eyebrow'&&item.text==='SELAMAT KEPADA');
   if(f.lite&&!f.hideLiteOverlay&&announced&&!matchMedia('(prefers-reduced-motion: reduce)').matches){
    announcementAnimation=result.animate([
     {opacity:0,transform:'translateY(14px) scale(.965)'},
     {opacity:1,transform:'translateY(-3px) scale(1.008)',offset:.76},
     {opacity:1,transform:'none'}
    ],{duration:510,easing:'cubic-bezier(.2,.7,.25,1)'});
   }
  }
  const winner=result.querySelector('.winner');
  if(winner){
   const name=winner.textContent;
   winner.style.removeProperty('font-size');
   winner.classList.remove('is-wrapped');
   if(f.lite){
    winner.title=name;
    for(let size=Math.floor(parseFloat(getComputedStyle(winner).fontSize))-1;size>=40&&winner.scrollWidth>winner.clientWidth;size--){
     winner.style.fontSize=size+'px';
    }
    if(winner.scrollWidth>winner.clientWidth)winner.classList.add('is-wrapped');
   }else{
    winner.removeAttribute('title');
   }
  }
}
// Tell the relay which view this page actually rendered, so the operator panel can show "verified in OBS".
let reportedView='',reportedAt=0;
function viewOf(f){
 if(!f.lite)return f.official?'official':'roulette';
 if(f.hideLiteOverlay)return 'hidden';
 if(f.recap)return `recap:${f.recap.page}/${f.recap.pages}`;
 const winner=f.result.find(item=>item.kind==='winner');
 return winner?'winner:'+winner.text:'waiting';
}
function reportView(f){
 const view=viewOf(f),now=Date.now();
 if(view===reportedView&&now-reportedAt<1500)return;
 reportedView=view;reportedAt=now;
 fetch('/api/overlay-ack',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({view,obs:Boolean(window.obsstudio)}),signal:AbortSignal.timeout(3000)}).catch(()=>{});
}
async function poll(){
 try{
  const r=await fetch('/api/frame',{cache:'no-store',signal:AbortSignal.timeout(3000)});if(!r.ok)throw Error();
  // Server restarts or edited files: reload once so OBS never keeps running stale code.
  const b=r.headers.get('X-Build');if(b){if(build!==null&&b!==build){location.reload();return;}build=b;}
  const f=await r.json();if(failures>=3){location.reload();return;}failures=0;
  if(!f){connection.style.display='block';return;}
  connection.style.display=Date.now()-f.stamp>5000?'block':'none';
  applyFrame(f);reportView(f);
 }catch{if(++failures>=3)connection.style.display='block';}
}
(async function loop(){await poll();setTimeout(loop,100);})();
