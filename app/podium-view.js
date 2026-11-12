function normalizePeachDesign(design) {
  return design === 'left' || design === 'center' ? design : 'right';
}

function createPeachPodium(container) {
  container.innerHTML = `<section class="peach-podium" hidden aria-label="Peach Podium">
    <header class="peach-title"><strong data-shine="Peach Podium">Peach Podium</strong></header>
    <ol class="peach-ranks"></ol>
  </section>`;
  const panel = container.firstElementChild;
  const ranks = panel.querySelector('ol');
  const cards = new Map();
  const movement = new WeakMap();
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let effect;
  let revision;

  function fitNames() {
    for (const card of cards.values()) {
      const name = card.children[1];
      name.style.removeProperty('font-size');
      if (!name.clientWidth) continue;
      const preferredSize = parseFloat(getComputedStyle(name).fontSize);
      for (let size = Math.floor(preferredSize); size >= 18 && name.scrollWidth > name.clientWidth; size--) {
        name.style.fontSize = `${size}px`;
      }
    }
  }
  new ResizeObserver(fitNames).observe(ranks);

  function render(entries, visible, design = 'right') {
    const key = JSON.stringify([entries, visible, design]);
    if (revision === key) return;
    revision = key;
    const wasVisible = !panel.hidden;
    const oldPositions = new Map([...cards].map(([id, card]) => [id, card.getBoundingClientRect().top]));
    panel.hidden = !visible;
    panel.dataset.design = normalizePeachDesign(design);
    const ids = new Set(entries.map(entry => entry.id));
    for (const [id, card] of cards) {
      if (ids.has(id)) continue;
      movement.get(card)?.cancel();
      card.remove();
      cards.delete(id);
    }
    entries.forEach(({id, name}, index) => {
      let card = cards.get(id);
      if (!card) {
        card = document.createElement('li');
        card.innerHTML = '<span class="peach-rank"></span><span class="peach-name"></span><span class="peach-idle" aria-hidden="true"><i></i></span>';
        cards.set(id, card);
      }
      card.dataset.rank = index + 1;
      card.children[0].textContent = String(index + 1).padStart(2, '0');
      card.children[1].textContent = name;
      card.children[1].title = name;
      if (ranks.children[index] !== card) ranks.insertBefore(card, ranks.children[index] ?? null);
    });
    fitNames();
    entries.forEach(({id}, index) => {
      const card = cards.get(id);
      const previousMovement = movement.get(card);
      if (previousMovement) {
        previousMovement.cancel();
        movement.delete(card);
        card.style.removeProperty('transform');
        card.style.removeProperty('opacity');
      }
      if (!visible || reducedMotion.matches) return;
      const motion = window.Motion;
      if (!wasVisible || !oldPositions.has(id)) {
        const frames = {opacity: [0, 1], transform: ['translateX(-24px)', 'translateX(0px)']};
        movement.set(card, motion
          ? motion.animate(card, frames, {duration: 0.42, delay: index * 0.085, ease: 'easeOut'})
          : card.animate(frames, {duration: 420, delay: index * 85, fill: 'backwards', easing: 'ease-out'}));
        return;
      }
      const offset = oldPositions.get(id) - card.getBoundingClientRect().top;
      if (Math.abs(offset) > 1) {
        const frames = {transform: [`translateY(${offset}px)`, 'translateY(0px)']};
        movement.set(card, motion
          ? motion.animate(card, frames, {type: 'spring', duration: 0.48, bounce: 0.18})
          : card.animate(frames, {duration: 460, easing: 'cubic-bezier(.22,.85,.3,1.12)'}));
      }
    });
  }

  function celebrate(id) {
    const card = cards.get(id);
    if (panel.hidden || !card) return;
    effect?.remove();
    effect = document.createElement('span');
    effect.className = 'peach-celebration';
    effect.innerHTML = '<span class="peach-shine"></span>';
    effect.setAttribute('aria-hidden', 'true');
    card.append(effect);
    const burst = effect;
    if (!reducedMotion.matches) {
      for (let index = 0; index < 24; index++) {
        const petal = document.createElement('i');
        const angle = index * Math.PI / 12;
        petal.style.setProperty('--x', `${Math.cos(angle) * card.offsetWidth * (0.32 + (index % 3) * 0.06)}px`);
        petal.style.setProperty('--y', `${Math.sin(angle) * card.offsetHeight * (0.33 + (index % 3) * 0.12)}px`);
        petal.style.animationDelay = `${(index % 4) * 45}ms`;
        burst.append(petal);
      }
    }
    setTimeout(() => burst.remove(), 2100);
  }

  return {render, celebrate};
}

const livePeachPodium = document.getElementById('peach-live');
if (livePeachPodium) {
  const view = createPeachPodium(livePeachPodium);
  let initialized = false;
  let lastEvent;
  async function pollPeachPodium() {
    try {
      const response = await fetch('/api/podium', {cache: 'no-store', signal: AbortSignal.timeout(3000)});
      if (!response.ok) throw Error('Podium unavailable');
      const {entries, visible, celebration, design} = await response.json();
      view.render(entries, visible, design);
      if (initialized && celebration && celebration.id !== lastEvent && Date.now() - celebration.at * 1000 < 2000) {
        view.celebrate(celebration.winner);
      }
      lastEvent = celebration?.id;
      initialized = true;
    } catch {
      initialized = false;
    } finally {
      setTimeout(pollPeachPodium, 100);
    }
  }
  pollPeachPodium();
}
