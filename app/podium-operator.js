(() => {
  // Lucide 0.468.0 icon paths. See vendor/LICENSE-lucide.txt.
  const icons = {
    'arrow-up': '<path d="m5 12 7-7 7 7" /><path d="M12 19V5" />',
    'arrow-down': '<path d="M12 5v14" /><path d="m19 12-7 7-7-7" />',
    'eye': '<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" /><circle cx="12" cy="12" r="3" />',
    'eye-off': '<path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49" /><path d="M14.084 14.158a3 3 0 0 1-4.242-4.242" /><path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143" /><path d="m2 2 20 20" />',
    'send': '<path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z" /><path d="m21.854 2.147-10.94 10.939" />',
    'eraser': '<path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21" /><path d="M22 21H7" /><path d="m5 11 9 9" />',
    'shuffle': '<path d="m18 14 4 4-4 4" /><path d="m18 2 4 4-4 4" /><path d="M2 18h2.5c6 0 9-12 15-12H22" /><path d="M2 6h2.5c2.5 0 4.5 2 6 4m3 4c1.5 2 3.5 4 6 4H22" />',
    'download': '<path d="M12 3v12m-5-5 5 5 5-5M4 16v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4" />',
    'save': '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h12l4 4v12a2 2 0 0 1-2 2Z" /><path d="M7 3v5h10M7 21v-8h10v8" />',
    'monitor': '<rect x="2" y="3" width="20" height="14" rx="2" /><path d="M12 17v4m-4 0h8" />',
  };
  const icon = name => `<svg class="peach-control-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${icons[name]}</svg>`;
  const navigation = document.createElement('nav');
  navigation.className = 'peach-navigation';
  navigation.setAttribute('aria-label', 'Mode MOMOYO');
  navigation.innerHTML = '<button type="button" aria-pressed="true">Roulette</button><button type="button" aria-pressed="false">Peach Podium</button>';
  const [rouletteTab, podiumTab] = navigation.children;
  const roulette = document.querySelector('main');
  roulette.before(navigation);
  const rouletteIcons = {
    prev: 'arrow-up', next: 'arrow-down', draw: 'shuffle', revealOfficial: 'send',
    apply: 'save', saveOfficial: 'save', demo: 'eye', export: 'download',
    reset: 'eraser', restartOfficial: 'eraser', presentation: 'monitor'
  };
  for (const [id, name] of Object.entries(rouletteIcons)) {
    const button = document.getElementById(id);
    if (!button) continue;
    const svg = icon(name).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');
    button.style.setProperty('--roulette-icon', `url("data:image/svg+xml,${encodeURIComponent(svg)}")`);
    button.classList.add('roulette-icon');
    if (id === 'prev' || id === 'next') button.textContent = '';
  }
  const operator = document.createElement('section');
  operator.className = 'peach-operator';
  operator.hidden = true;
  operator.innerHTML = `<section class="panel">
    <h2>Pengaturan Peach Podium</h2>
    <label for="peach-design">Desain leaderboard</label>
    <select id="peach-design"><option value="right">Desain Kanan</option><option value="left">Desain Kiri</option><option value="center">Desain Tengah</option></select>
    <p>Isi hingga tiga username. Perubahan nama dan urutan baru tampil di OBS setelah Anda klik Terapkan ke OBS.</p>
    <div class="peach-editor"></div>
    <div class="peach-actions">
      <button type="button" data-action="apply" data-icon="send" data-variant="primary">${icon('send')}Terapkan ke OBS</button>
      <button type="button" data-action="visibility" data-icon="eye" data-variant="secondary">Tampilkan podium</button>
      <button type="button" data-action="reset" data-icon="eraser" data-variant="danger">${icon('eraser')}Kosongkan draf</button>
    </div>
    <p role="status"></p>
  </section><section class="peach-preview"><h2>Pratinjau draf</h2><div></div></section>`;
  operator.querySelector('.panel').append(createObsSetup('/podium.html',1080,420));
  roulette.after(operator);
  const editor = operator.querySelector('.peach-editor');
  const preview = createPeachPodium(operator.querySelector('.peach-preview div'));
  const status = operator.querySelector('[role=status]');
  const apply = operator.querySelector('[data-action=apply]');
  const visibility = operator.querySelector('[data-action=visibility]');
  const reset = operator.querySelector('[data-action=reset]');
  const design = operator.querySelector('#peach-design');
  const blank = () => ({id: crypto.randomUUID(), name: ''});
  let draft = [];
  let published = {entries: [], visible: false, design: 'right'};
  let send;
  let loaded = false;
  let pending = false;

  function entries() {
    return draft.filter(entry => entry.name.trim()).map(entry => ({id: entry.id, name: entry.name.trim()}));
  }

  function refresh() {
    const next = entries();
    const dirty = design.value !== published.design || JSON.stringify(next) !== JSON.stringify(published.entries);
    preview.render(next, true, design.value);
    design.disabled = !loaded || pending;
    apply.disabled = !loaded || pending || !dirty;
    visibility.disabled = !loaded || pending || (!published.visible && !published.entries.length);
    reset.disabled = !loaded || pending;
    visibility.innerHTML = published.visible ? icon('eye-off') + 'Sembunyikan podium' : icon('eye') + 'Tampilkan podium';
    visibility.dataset.icon = published.visible ? 'eye-off' : 'eye';
    editor.inert = !loaded || pending;
  }
  design.onchange = refresh;

  function renderEditor(focusIndex) {
    editor.replaceChildren();
    draft.forEach((entry, index) => {
      const row = document.createElement('div');
      row.className = 'peach-editor-row';
      row.innerHTML = `<label>Posisi ${index + 1}<input type="text" maxlength="64" placeholder="@username"></label>
        <button type="button" data-icon="arrow-up" data-variant="ghost" aria-label="Naikkan posisi ${index + 1}">${icon('arrow-up')}</button>
        <button type="button" data-icon="arrow-down" data-variant="ghost" aria-label="Turunkan posisi ${index + 1}">${icon('arrow-down')}</button>`;
      const input = row.querySelector('input');
      const [up, down] = row.querySelectorAll('button');
      input.value = entry.name;
      input.oninput = () => { entry.name = input.value; refresh(); };
      up.disabled = index === 0;
      down.disabled = index === draft.length - 1;
      function move(destination) {
        [draft[index], draft[destination]] = [draft[destination], draft[index]];
        renderEditor(destination);
      }
      up.onclick = () => move(index - 1);
      down.onclick = () => move(index + 1);
      editor.append(row);
      if (focusIndex === index) input.focus();
    });
    refresh();
  }

  async function load() {
    if (!send || loaded || pending || operator.hidden) return;
    pending = true;
    status.textContent = 'Memuat data podium…';
    try {
      const response = await fetch('/api/podium', {cache: 'no-store', signal: AbortSignal.timeout(3000)});
      if (!response.ok) throw Error();
      const {entries, visible, design: savedDesign} = await response.json();
      published = {entries, visible, design: normalizePeachDesign(savedDesign)};
      design.value = published.design;
      draft = entries.map(entry => ({...entry}));
      while (draft.length < 3) draft.push(blank());
      loaded = true;
      status.textContent = visible ? 'Podium diatur tampil di overlay.' : 'Podium diatur tersembunyi di overlay.';
      renderEditor();
    } catch {
      status.textContent = 'Data podium belum bisa dimuat. Pastikan jendela MOMOYO masih terbuka; panel mencoba lagi otomatis.';
    } finally {
      pending = false;
      refresh();
    }
  }

  async function commit(update, success) {
    pending = true;
    refresh();
    status.textContent = 'Mengirim ke server MOMOYO…';
    try {
      const confirmed = await send(update);
      if (confirmed?.design !== update.podium.design) {
        throw Error('Server MOMOYO belum mengenali desain ini, kemungkinan masih versi lama. Jalankan Tutup MOMOYO Live.cmd lalu MOMOYO Live.cmd, dan muat ulang panel.');
      }
      published = update.podium;
      status.textContent = success;
      notifyOperator(success);
    } catch (error) {
      status.textContent = error.message || 'Pengiriman gagal. Periksa jendela MOMOYO, lalu klik tombolnya lagi.';
    } finally {
      pending = false;
      refresh();
    }
  }

  apply.onclick = () => {
    const next = entries();
    if (new Set(next.map(entry => entry.name.toLowerCase())).size !== next.length) {
      status.textContent = 'Ada username yang sama di dua posisi. Ubah salah satunya, lalu klik Terapkan ke OBS.';
      return;
    }
    const update = {
      podium: {entries: next, visible: published.visible && next.length > 0, design: design.value},
      celebratePromotion: crypto.randomUUID()
    };
    commit(update,
      next.length ? 'Peringkat dikirim ke overlay Podium.' : 'Podium dikosongkan dan disembunyikan.');
  };
  visibility.onclick = () => {
    const visible = !published.visible;
    commit({podium: {...published, visible}}, visible ? 'Podium diatur tampil di overlay.' : 'Podium diatur tersembunyi di overlay.');
  };
  reset.onclick = () => {
    draft = Array.from({length: 3}, blank);
    renderEditor();
    status.textContent = 'Draf dikosongkan. Podium di OBS baru berubah setelah Anda klik Terapkan ke OBS.';
  };

  function selectPodium(active) {
    if (document.body.classList.contains('peach-mode') === active) return;
    document.body.classList.toggle('peach-mode', active);
    roulette.hidden = active;
    operator.hidden = !active;
    rouletteTab.setAttribute('aria-pressed', String(!active));
    podiumTab.setAttribute('aria-pressed', String(active));
    notifyOperator(active ? 'Mode Peach Podium aktif.' : 'Mode Roulette aktif.');
    if (active) {
      status.textContent ||= 'Menunggu sambungan ke server MOMOYO…';
      load();
      requestAnimationFrame(refresh);
    }
  }
  rouletteTab.onclick = () => selectPodium(false);
  podiumTab.onclick = () => selectPodium(true);
  window.peachPodium = {connect(post) { send = post; load(); }};
  refresh();
})();
