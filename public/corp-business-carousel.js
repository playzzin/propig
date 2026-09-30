(() => {
  'use strict';

  // One live player, with a lightweight, keyboard-accessible index of every film.
  window.createBusinessFilmCarousel = ({ stage, rail, previous, next, slots, onSelect }) => {
    let active = 0;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const wrap = (index) => (index + slots.length) % slots.length;
    const choices = slots.map((slot, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'film-choice';
      button.id = `film-choice-${index}`;
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-controls', 'showcaseCard');
      button.innerHTML = '<span class="film-thumb"><img alt="" width="320" height="180" draggable="false" decoding="async" /><span class="film-number"></span></span><strong class="film-title"></strong><span class="film-meta"></span>';
      button.querySelector('.film-number').textContent = String(index + 1).padStart(2, '0');
      button.querySelector('.film-title').textContent = slot.label;
      button.querySelector('.film-meta').textContent = slot.detail;
      button.addEventListener('click', () => select(index));
      button.addEventListener('keydown', (event) => navigate(event, index, true));
      rail.appendChild(button);
      return button;
    });
    const previews = [...stage.querySelectorAll('[data-film-offset]')];

    function select(index, direction) {
      active = wrap(index);
      onSelect(active, direction);
    }

    function navigate(event, index, focusChoice = false) {
      const movement = { ArrowLeft: -1, ArrowRight: 1 }[event.key];
      let target;
      if (movement) target = wrap(index + movement);
      else if (event.key === 'Home') target = 0;
      else if (event.key === 'End') target = slots.length - 1;
      else return;
      event.preventDefault();
      event.stopPropagation();
      select(target, movement);
      if (focusChoice) choices[target].focus({ preventScroll: true });
    }

    function centerSelection() {
      const choice = choices[active];
      // Scroll only the filmstrip; automatic video endings never move the page.
      const left = choice.getBoundingClientRect().left - rail.getBoundingClientRect().left + rail.scrollLeft - (rail.clientWidth - choice.offsetWidth) / 2;
      rail.scrollTo({ left, behavior: reducedMotion.matches ? 'instant' : 'smooth' });
    }

    function setActive(selectedIndex) {
      active = wrap(selectedIndex);
      stage.dataset.panoramaIndex = String(Math.floor(active / 2));
      choices.forEach((choice, index) => {
        choice.setAttribute('aria-selected', String(index === active));
        choice.tabIndex = index === active ? 0 : -1;
      });
      document.getElementById('filmGalleryCount').textContent = `${String(active + 1).padStart(2, '0')} / ${String(slots.length).padStart(2, '0')}`;
      centerSelection();
    }

    function update(videos, selectedIndex) {
      setActive(selectedIndex);
      choices.forEach((choice, index) => {
        const video = videos[index];
        const image = choice.querySelector('img');
        choice.setAttribute('aria-label', `${index + 1}. ${slots[index].label}, ${slots[index].detail}, ${video?.title || '소개 영상'}`);
        choice.querySelector('.film-title').textContent = video?.title || slots[index].label;
        choice.title = video?.title || slots[index].label;
        if (video?.id) {
          const source = `https://i.ytimg.com/vi/${video.id}/mqdefault.jpg`;
          if (image.getAttribute('src') !== source) image.src = source;
          image.hidden = false;
        } else {
          image.removeAttribute('src');
          image.hidden = true;
        }
      });
      previews.forEach((button) => {
        const index = wrap(active + Number(button.dataset.filmOffset));
        const video = videos[index];
        button.hidden = !video?.id;
        button.dataset.filmIndex = String(index);
        button.setAttribute('aria-label', `${slots[index].label} · ${video?.title || slots[index].detail} 재생`);
        button.querySelector('[data-site-label]').textContent = slots[index].label;
        button.querySelector('[data-site-name]').textContent = slots[index].label;
        button.querySelector('[data-site-mode]').textContent = slots[index].mode === 'technology' ? 'TECH STACK' : 'DELIVERY PROCESS';
        const image = button.querySelector('img');
        if (video?.id) image.src = `https://i.ytimg.com/vi/${video.id}/mqdefault.jpg`;
        else image.removeAttribute('src');
      });
    }

    previews.forEach((button) => button.addEventListener('click', () => select(active + Number(button.dataset.filmOffset), Math.sign(Number(button.dataset.filmOffset)))));
    previous.addEventListener('click', () => select(active - 1, -1));
    next.addEventListener('click', () => select(active + 1, 1));
    stage.addEventListener('keydown', (event) => navigate(event, active));

    function resetPanorama() {
      stage.style.removeProperty('--panorama-drift');
      stage.style.removeProperty('--panorama-light-x');
    }
    stage.addEventListener('pointermove', (event) => {
      if (event.pointerType !== 'mouse' || event.buttons || reducedMotion.matches) return;
      const bounds = stage.getBoundingClientRect();
      const position = Math.max(-1, Math.min(1, (event.clientX - bounds.left) / bounds.width * 2 - 1));
      stage.style.setProperty('--panorama-drift', `${position * 9}px`);
      stage.style.setProperty('--panorama-light-x', `${38 + position * 12}%`);
    });
    stage.addEventListener('pointerleave', (event) => { if (!event.buttons) resetPanorama(); });
    window.addEventListener('blur', resetPanorama);
    reducedMotion.addEventListener('change', resetPanorama);

    function bindDrag(surface, browseOnly = false) {
      let gesture = null;
      let suppressClickUntil = 0;
      function reset() {
        if (!gesture) return;
        const pointerId = gesture.id;
        gesture = null;
        surface.classList.remove('is-dragging');
        stage.style.removeProperty('--film-drag');
        resetPanorama();
        if (surface.hasPointerCapture(pointerId)) surface.releasePointerCapture(pointerId);
      }
      surface.addEventListener('pointerdown', (event) => {
        if (!event.isPrimary || event.button !== 0 || (browseOnly && event.pointerType !== 'mouse')) return;
        suppressClickUntil = 0;
        gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, scroll: surface.scrollLeft, axis: null };
      });
      surface.addEventListener('pointermove', (event) => {
        if (!gesture || gesture.id !== event.pointerId) return;
        if (event.pointerType === 'mouse' && !(event.buttons & 1)) { reset(); return; }
        const dx = event.clientX - gesture.x;
        const dy = event.clientY - gesture.y;
        if (!gesture.axis && Math.max(Math.abs(dx), Math.abs(dy)) >= 8) {
          gesture.axis = Math.abs(dx) > Math.abs(dy) * 1.2 ? 'x' : 'y';
          if (gesture.axis === 'x') surface.setPointerCapture(event.pointerId);
        }
        if (gesture.axis !== 'x') return;
        event.preventDefault();
        surface.classList.add('is-dragging');
        if (browseOnly) surface.scrollLeft = gesture.scroll - dx;
        else {
          stage.style.setProperty('--film-drag', `${Math.max(-64, Math.min(64, dx * 0.45))}px`);
          if (!reducedMotion.matches) stage.style.setProperty('--panorama-drift', `${Math.max(-18, Math.min(18, dx * 0.16))}px`);
        }
      });
      surface.addEventListener('pointerup', (event) => {
        if (!gesture || gesture.id !== event.pointerId) return;
        const dx = event.clientX - gesture.x;
        const horizontal = gesture.axis === 'x';
        reset();
        if (!horizontal) return;
        suppressClickUntil = Date.now() + 350;
        if (!browseOnly && Math.abs(dx) >= 36) select(active + (dx < 0 ? 1 : -1), dx < 0 ? 1 : -1);
      });
      surface.addEventListener('pointercancel', reset);
      surface.addEventListener('lostpointercapture', (event) => { if (event.target === surface) reset(); });
      window.addEventListener('pointerup', (event) => { if (gesture?.id === event.pointerId) reset(); });
      window.addEventListener('blur', reset);
      surface.addEventListener('click', (event) => {
        if (event.detail === 0 || Date.now() >= suppressClickUntil) return;
        event.preventDefault();
        event.stopImmediatePropagation();
      }, true);
      surface.addEventListener('dragstart', event => event.preventDefault());
    }
    bindDrag(stage);
    bindDrag(rail, true);
    setActive(0);
    return { update, setActive };
  };
})();
