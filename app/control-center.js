(() => {
  const panel = document.createElement('dialog');
  panel.className = 'momoyo-control';
  panel.setAttribute('aria-labelledby', 'momoyo-control-title');
  panel.innerHTML = `<header class="momoyo-control-head">
      <h2 id="momoyo-control-title">Setup &amp; Pembaruan <small data-version></small></h2>
      <form method="dialog"><button data-variant="ghost" data-close><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>Tutup</button></form>
    </header>
    <div class="momoyo-control-body">
    <section>
      <h3>Sambungkan OBS</h3>
      <label>Port WebSocket OBS <input type="number" min="1" max="65535" value="4455"></label>
      <label>Password WebSocket OBS <input type="password" autocomplete="off"></label>
      <label class="obs-remember"><input type="checkbox" checked data-remember-obs aria-describedby="obs-remember-note"> Ingat koneksi OBS di PC ini</label>
      <p id="obs-remember-note" class="hint">Port dan password disimpan di profil browser ini. Aktifkan hanya pada profil yang kamu gunakan sendiri.</p>
      <div class="actions"><button data-action="connect" data-variant="primary">Sambungkan ke OBS</button><button data-action="tutorial" data-variant="secondary" aria-expanded="false">Tampilkan tutorial setup</button></div>
      <label>Scene tujuan <select disabled></select></label>
      <div class="actions"><button data-action="sources" data-variant="secondary" disabled>Deteksi atau tambahkan overlay</button><button data-action="refresh" data-variant="secondary" disabled>Refresh overlay OBS</button></div>
      <p data-status="obs" role="status"></p>
      <section data-guide hidden>
        <img src="/setup-guide.png" alt="Ilustrasi menu Tools dan WebSocket Server Settings di OBS">
        <ol><li>Di OBS, buka Tools → WebSocket Server Settings.</li><li>Aktifkan server dan autentikasi. Salin port dan password ke MOMOYO.</li><li>Klik Sambungkan ke OBS, pilih scene, lalu klik Deteksi atau tambahkan overlay. Source baru berstatus tersembunyi; tampilkan lewat ikon mata di OBS saat siap.</li></ol>
      </section>
    </section>
    <section>
      <h3>Pembaruan aplikasi</h3>
      <div class="actions"><button data-action="check" data-variant="secondary">Cek pembaruan</button><button data-action="download" data-variant="secondary" disabled>Unduh pembaruan</button><button data-action="install" data-variant="primary" disabled>Pasang dan mulai ulang</button></div>
      <p data-status="update" role="status"></p>
    </section>
    <section>
      <h3>Matikan MOMOYO</h3>
      <p>Menghentikan server MOMOYO. Overlay di OBS menjadi kosong sampai MOMOYO dibuka lagi. Menutup jendela panel juga menanyakan hal ini.</p>
      <div class="actions"><button data-action="shutdown" data-variant="danger">Matikan MOMOYO</button></div>
      <p data-status="shutdown" role="status"></p>
    </section></div>`;
  document.body.append(panel);
  const open = document.createElement('button');
  open.type = 'button'; open.className = 'momoyo-control-button'; open.textContent = 'Setup & Pembaruan';
  open.dataset.variant = 'secondary'; open.setAttribute('aria-haspopup', 'dialog');
  // The running server's version stays visible next to the button, on both the Roulette and Peach Podium tabs.
  const serverVersion = document.createElement('span');
  serverVersion.className = 'momoyo-version'; serverVersion.setAttribute('role', 'status');
  serverVersion.textContent = 'Memeriksa versi server…';
  const utility = document.createElement('div');
  utility.className = 'nav-utility'; utility.append(serverVersion, open);
  document.querySelector('.peach-navigation').append(utility);
  open.onclick = () => panel.showModal();
  const action = name => panel.querySelector(`[data-action="${name}"]`);
  const obsStatus = panel.querySelector('[data-status="obs"]');
  const updateStatus = panel.querySelector('[data-status="update"]');
  const scene = panel.querySelector('select');
  const port=panel.querySelector('input[type="number"]');
  const password=panel.querySelector('input[type="password"]');
  const remember=panel.querySelector('[data-remember-obs]');
  const connectionKey='momoyo-obs-connection-v1';
  const rememberPreferenceKey='momoyo-obs-remember-preference';
  try{remember.checked=localStorage.getItem(rememberPreferenceKey)!=='off';}catch{}
  remember.onchange=()=>{
    try{localStorage.setItem(rememberPreferenceKey,remember.checked?'on':'off');}catch{}
    if(remember.checked){
      obsStatus.textContent='Klik Sambungkan ke OBS untuk menyimpan koneksi.';
      return;
    }
    try{
      localStorage.removeItem(connectionKey);
      obsStatus.textContent='Koneksi OBS tidak lagi disimpan di browser ini.';
    }catch{
      obsStatus.textContent='Gagal menghapus koneksi tersimpan. Hapus data situs MOMOYO di browser.';
    }
  };
  const sources = [
    {name:'ROULETTE', path:'/overlay.html', height:600},
    {name:'PODIUM', path:'/podium.html', height:420}
  ];
  let socket, identified = false;
  const pending = new Map();
  const hash = async value => btoa(String.fromCharCode(...new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))));

  function call(requestType, requestData = {}) {
    return new Promise((resolve, reject) => {
      if (!identified || socket?.readyState !== WebSocket.OPEN) { reject(Error('MOMOYO belum tersambung ke OBS. Periksa apakah OBS terbuka dan WebSocket aktif, lalu klik Sambungkan ke OBS.')); return; }
      const requestId = crypto.randomUUID();
      const timer = setTimeout(() => { pending.delete(requestId); reject(Error('OBS tidak merespons. Periksa apakah OBS masih terbuka, lalu coba lagi.')); }, 4500);
      pending.set(requestId, {resolve, reject, timer});
      socket.send(JSON.stringify({op:6,d:{requestType,requestId,requestData}}));
    });
  }
  function connect() {
    const localPort = port.valueAsNumber;
    if (!Number.isInteger(localPort) || localPort < 1 || localPort > 65535) return Promise.reject(Error('Port OBS belum valid. Isi angka 1–65535 (bawaan OBS: 4455).'));
    socket?.close();
    identified = false;
    return new Promise((resolve,reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${localPort}`);
      socket = ws;
      const timer = setTimeout(() => { ws.close(); reject(Error('OBS tidak merespons. Periksa apakah OBS terbuka dan WebSocket aktif.')); }, 4500);
      ws.onclose = () => {
        clearTimeout(timer);
        reject(Error('Tidak bisa tersambung ke OBS. Periksa port dan password WebSocket di OBS, lalu coba lagi.'));
        if (socket !== ws) return;
        identified=false; scene.disabled=true; action('sources').disabled=true; action('refresh').disabled=true;
        for (const request of pending.values()) { clearTimeout(request.timer); request.reject(Error('Sambungan ke OBS terputus. Klik Sambungkan ke OBS untuk menyambung lagi.')); }
        pending.clear();
        obsStatus.textContent='MOMOYO belum tersambung ke OBS. Periksa apakah OBS terbuka dan WebSocket aktif.';
      };
      ws.onmessage = async ({data}) => {
        try {
          const {op,d}=JSON.parse(data);
          if(op===0){
            const identify={rpcVersion:1,eventSubscriptions:0};
            if(d.authentication){
              const {salt,challenge}=d.authentication;
              identify.authentication=await hash(await hash(password.value+salt)+challenge);
            }
            ws.send(JSON.stringify({op:1,d:identify}));
          }else if(op===2&&socket===ws){
            clearTimeout(timer);identified=true;resolve();
          }else if(op===7&&socket===ws){
            const request=pending.get(d.requestId);
            if(!request)return;
            clearTimeout(request.timer);pending.delete(d.requestId);
            if(d.requestStatus.result)request.resolve(d.responseData||{});
            else request.reject(Error(d.requestStatus.comment||`OBS menolak ${d.requestType}.`));
          }
        }catch(error){ws.close();reject(error);}
      };
    });
  }
  async function connectPanel(){
    await connect();
    if(remember.checked){
      try{localStorage.setItem(connectionKey,JSON.stringify({port:port.valueAsNumber,password:password.value}));}
      catch{obsStatus.textContent='Browser tidak bisa menyimpan koneksi OBS.';}
    }
    const {scenes,currentProgramSceneName}=await call('GetSceneList');
    scene.replaceChildren(...scenes.map(item=>new Option(item.sceneName)));
    scene.value=currentProgramSceneName;
    scene.disabled=false;action('sources').disabled=false;action('refresh').disabled=false;
    obsStatus.textContent='Tersambung ke OBS. Pilih scene, lalu klik Deteksi atau tambahkan overlay.';
  }
  async function matchingSources(){
    const {inputs}=await call('GetInputList',{inputKind:'browser_source'});
    const matches=new Map();
    for(const input of inputs){
      const {inputSettings}=await call('GetInputSettings',{inputName:input.inputName});
      if(inputSettings.is_local_file)continue;
      try{
        const url=new URL(inputSettings.url);
        const source=sources.find(candidate=>url.origin===location.origin&&url.pathname===candidate.path);
        if(source&&!matches.has(source.path))matches.set(source.path,input.inputName);
      }catch{}
    }
    return matches;
  }
  async function setupSources(){
    const sceneName=scene.value;
    if(!sceneName)throw Error('Scene belum dipilih. Pilih scene tujuan, lalu coba lagi.');
    const {sceneItems}=await call('GetSceneItemList',{sceneName});
    const matches=await matchingSources();
    const {inputs}=await call('GetInputList');
    const names=new Set(inputs.map(input=>input.inputName));
    let added=0;
    for(const source of sources){
      const existing=matches.get(source.path);
      if(existing){
        if(sceneItems.some(item=>item.sourceName===existing))continue;
        await call('CreateSceneItem',{sceneName,sourceName:existing,sceneItemEnabled:false});
      }else{
        let inputName=source.name;
        for(let suffix=2;names.has(inputName);suffix++)inputName=`${source.name} MOMOYO ${suffix}`;
        await call('CreateInput',{sceneName,inputName,inputKind:'browser_source',sceneItemEnabled:false,
          inputSettings:{is_local_file:false,url:location.origin+source.path,width:1080,height:source.height,
            shutdown:false,restart_when_active:false}});
      }
      added++;
    }
    obsStatus.textContent=added?`${added} overlay ditambahkan dan masih tersembunyi. Nyalakan ikon mata di OBS saat siap tayang.`:'Kedua overlay sudah ada di scene ini. Tidak ada yang diubah.';
  }
  async function refreshSources(){
    const matches=await matchingSources();
    if(!matches.size)throw Error('Browser Source MOMOYO belum ditemukan di OBS. Klik Deteksi atau tambahkan overlay dulu.');
    for(const inputName of matches.values()){
      await call('PressInputPropertiesButton',{inputName,propertyName:'refreshnocache'});
    }
    obsStatus.textContent=`${matches.size} overlay OBS dimuat ulang. Status tayang akan terverifikasi setelah OBS memuat tampilan.`;
  }
  function bind(name,task,status){
    action(name).onclick=async()=>{
      const button=action(name);button.disabled=true;
      try{await task();}catch(error){status.textContent=error.message;}
      finally{button.disabled=false;}
    };
  }
  action('tutorial').onclick=()=>{const guide=panel.querySelector('[data-guide]');guide.hidden=!guide.hidden;action('tutorial').setAttribute('aria-expanded',String(!guide.hidden));action('tutorial').textContent=guide.hidden?'Tampilkan tutorial setup':'Sembunyikan tutorial setup';};
  bind('connect',connectPanel,obsStatus);
  try{
    const saved=JSON.parse(localStorage.getItem(connectionKey));
    if(remember.checked&&saved&&Number.isInteger(saved.port)&&saved.port>=1&&saved.port<=65535&&typeof saved.password==='string'){
      port.value=saved.port;password.value=saved.password;remember.checked=true;
      action('connect').disabled=true;
      obsStatus.textContent='Mencoba menyambung ke OBS…';
      connectPanel().catch(()=>{obsStatus.textContent='Belum tersambung. Buka OBS, lalu klik Sambungkan ke OBS.';})
        .finally(()=>{action('connect').disabled=false;});
    }
  }catch{}
  bind('sources',setupSources,obsStatus);
  bind('refresh',refreshSources,obsStatus);
  async function request(path,method='GET'){
    const response=await fetch(path,{method,headers:method==='POST'?{'Content-Type':'application/json'}:{},cache:'no-store'});
    const data=await response.json();
    if(!response.ok)throw Error(data.message||'Permintaan ke server MOMOYO gagal. Periksa jendela MOMOYO, lalu coba lagi.');
    return data;
  }
  async function showVersion(){
    try{
      const info=await request('/api/health');
      const label='v'+info.version;
      panel.querySelector('[data-version]').textContent=label;
      serverVersion.textContent='MOMOYO '+label;
      serverVersion.removeAttribute('data-state');
      serverVersion.title='Versi server yang sedang berjalan, dibaca dari /api/health';
    }catch{
      serverVersion.textContent='Versi server tidak terbaca';
      serverVersion.dataset.state='warn';
      serverVersion.title='Server MOMOYO tidak merespons. Periksa jendela MOMOYO.';
    }
  }
  showVersion();setInterval(showVersion,30000);
  bind('check',async()=>{
    action('download').disabled=true;action('install').disabled=true;
    updateStatus.textContent='Mengecek versi terbaru di GitHub Releases…';
    const {release}=await request('/api/releases/check','POST');
    action('download').disabled=!release;
    updateStatus.textContent=release?`Versi ${release.version} tersedia. Klik Unduh pembaruan.\n${release.notes}`:'Versi ini sudah yang terbaru.';
  },updateStatus);
  bind('download',async()=>{
    updateStatus.textContent='Mengunduh dan memeriksa berkas pembaruan…';
    const {version}=await request('/api/releases/download','POST');
    action('install').disabled=false;
    updateStatus.textContent=`Versi ${version} sudah diunduh dan diperiksa. Klik Pasang dan mulai ulang setelah LIVE selesai.`;
  },updateStatus);
  bind('install',async()=>{
    if(!confirm('Pasang pembaruan dan mulai ulang MOMOYO sekarang?\n\nOverlay di OBS kosong beberapa detik dan halaman operator ini dimuat ulang. Data yang tersimpan tidak dihapus. Jangan lanjutkan saat LIVE.'))return;
    const reconnect=identified;
    await request('/api/releases/install','POST');
    updateStatus.textContent='MOMOYO sedang dimulai ulang. Halaman ini dimuat ulang otomatis.';
    for(let attempt=0;attempt<90;attempt++){
      await new Promise(resolve=>setTimeout(resolve,700));
      let status;
      try{status=await request('/api/update-status');}catch{continue;}
      if(!['installed','rollback','error'].includes(status.state))continue;
      if(reconnect){
        try{
          if(!identified)await connectPanel();
          await refreshSources();
          status.message+=' '+obsStatus.textContent;
        }catch(error){status.message+=' Overlay OBS belum dimuat ulang ('+error.message+') Klik Refresh overlay OBS secara manual.';}
      }
      try{sessionStorage.setItem('momoyo-update-message',status.message);}catch{}
      location.reload();return;
    }
    throw Error('Hasil pembaruan belum terbaca. Buka launcher.log di folder MOMOYO untuk melihat penyebabnya sebelum mencoba lagi.');
  },updateStatus);
  bind('shutdown',async()=>{
    if(!confirm('Matikan MOMOYO sekarang?\n\nOverlay di OBS akan kosong sampai MOMOYO dibuka lagi. Jangan lanjutkan saat LIVE.'))return;
    await request('/api/shutdown','POST');
    document.body.innerHTML='<main style="font:18px system-ui;padding:48px;max-width:560px;margin:auto"><h1>MOMOYO sudah dimatikan</h1><p>Anda boleh menutup jendela ini. Untuk memakai lagi, buka MOMOYO Live dari Menu Start.</p></main>';
  },panel.querySelector('[data-status="shutdown"]'));
  try{
    const message=sessionStorage.getItem('momoyo-update-message');
    if(message){sessionStorage.removeItem('momoyo-update-message');notifyOperator(message);}
  }catch{}
})();
