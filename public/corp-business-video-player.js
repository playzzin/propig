/* YouTube playback for the business carousel. Navigation stays in the page. */
(() => {
  let apiPromise;

  function loadYouTubeApi() {
    if (window.YT?.Player) return Promise.resolve(window.YT);
    if (apiPromise) return apiPromise;
    apiPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      let timeout;
      const previousReady = window.onYouTubeIframeAPIReady;
      const ready = () => {
        window.clearTimeout(timeout);
        previousReady?.();
        resolve(window.YT);
      };
      const fail = () => {
        window.clearTimeout(timeout);
        if (window.onYouTubeIframeAPIReady === ready) window.onYouTubeIframeAPIReady = previousReady;
        script.remove();
        apiPromise = undefined;
        reject(new Error('YouTube player unavailable'));
      };
      window.onYouTubeIframeAPIReady = ready;
      script.src = 'https://www.youtube.com/iframe_api';
      script.onerror = fail;
      timeout = window.setTimeout(fail, 15000);
      document.head.appendChild(script);
    });
    return apiPromise;
  }

  function videoId(value) {
    if (typeof value !== 'string' || !value.trim()) return null;
    const input = value.trim();
    if (/^[\w-]{11}$/.test(input)) return input;
    try {
      const url = new URL(input);
      if (url.protocol !== 'https:') return null;
      const host = url.hostname.toLowerCase();
      const parts = url.pathname.split('/').filter(Boolean);
      let id;
      if (host === 'youtu.be') id = parts[0];
      else if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'www.youtube-nocookie.com'].includes(host)) {
        id = url.pathname === '/watch' ? url.searchParams.get('v') : ['embed', 'shorts', 'live'].includes(parts[0]) ? parts[1] : null;
      }
      return typeof id === 'string' && /^[\w-]{11}$/.test(id) ? id : null;
    } catch {
      return null;
    }
  }

  function videoMetadata(source) {
    const entry = source && typeof source === 'object' ? source : { url: source };
    return {
      id: videoId(entry.url),
      title: typeof entry.title === 'string' ? entry.title : '',
      creator: typeof entry.creator === 'string' ? entry.creator : '',
    };
  }

  window.createBusinessVideoPlayer = ({ stage, mount, status, action, soundButton, pauseButton, onEnded, onVideoChange, onDuration, onProgress }) => {
    let configuration;
    let player = null;
    let selection = null;
    let generation = 0;
    let muted = false;
    let volume = 65;
    let mutedFallback = false;
    let fallbackAttempted = false;
    let ready = false;
    let inView = false;
    let pendingPlay = false;
    let playbackStarted = false;
    let loadTimeout;
    let progressTimer;

    function updateControls() {
      const silent = muted || mutedFallback;
      const playable = ready && stage.dataset.videoState !== 'error';
      soundButton.disabled = !playable;
      pauseButton.disabled = !playable;
      soundButton.setAttribute('aria-label', silent ? '소리 켜기' : '소리 끄기');
      soundButton.setAttribute('aria-pressed', String(!silent));
      soundButton.querySelector('[data-player-label]').textContent = silent ? '소리 꺼짐' : '소리 켜짐';
      const playing = ready && player.getPlayerState() === 1;
      pauseButton.setAttribute('aria-label', playing ? '영상 일시정지' : '영상 재생');
      pauseButton.setAttribute('aria-pressed', String(playing));
      pauseButton.querySelector('[data-player-label]').textContent = playing ? '일시정지' : '재생';
    }

    function reportProgress() {
      if (!ready) return;
      const duration = player.getDuration?.();
      const elapsed = player.getCurrentTime?.();
      if (Number.isFinite(duration) && duration > 0) {
        onDuration?.(duration);
        if (Number.isFinite(elapsed)) onProgress?.(Math.min(1, Math.max(0, elapsed / duration)));
      }
    }

    const setStatus = (message, label = '') => {
      status.textContent = message;
      action.textContent = label;
      action.hidden = !label;
    };

    function stop() {
      generation += 1;
      window.clearTimeout(loadTimeout);
      window.clearInterval(progressTimer);
      if (player) {
        if (ready) {
          // Our controls own the preference; iframe audio commands may still
          // be in flight when the user immediately selects the next film.
          volume = player.getVolume();
        }
        player.destroy();
      }
      player = null;
      ready = false;
      mutedFallback = false;
      fallbackAttempted = false;
      pendingPlay = false;
      playbackStarted = false;
      mount.replaceChildren();
      mount.hidden = true;
      updateControls();
      onProgress?.(0);
    }

    function playWhenVisible() {
      if (ready && pendingPlay && inView && !document.hidden) {
        pendingPlay = false;
        player.playVideo();
      }
    }

    function playFromGesture() {
      // Keep play/unmute in the click's activation window. The visibility
      // observer will continue to pause playback when the user scrolls away.
      stage.scrollIntoView({ block: 'nearest', behavior: 'instant' });
      inView = true;
      pendingPlay = false;
      setStatus(muted ? '소리 없이 재생합니다.' : '영상이 끝나면 다음 이야기로 이어집니다.');
      player.playVideo();
      updateControls();
    }

    async function show(nextSelection) {
      stop();
      selection = nextSelection;
      const token = generation;
      const isCurrent = () => token === generation;
      setStatus('영상을 준비하고 있습니다.');
      stage.dataset.videoState = 'loading';
      try {
        configuration ??= fetch('/corp-business-videos.json', { signal: AbortSignal.timeout(10000) }).then((response) => {
          if (!response.ok) throw new Error('Video configuration unavailable');
          return response.json();
        }).catch((error) => {
          configuration = undefined;
          throw error;
        });
        const config = await configuration;
        if (!isCurrent()) return;
        const source = config?.[selection.business]?.[selection.mode];
        const current = videoMetadata(source);
        const next = videoMetadata(config?.[selection.next?.business]?.[selection.next?.mode]);
        const following = videoMetadata(config?.[selection.following?.business]?.[selection.following?.mode]);
        const videos = (selection.playlist || []).map(({ business, mode }) => videoMetadata(config?.[business]?.[mode]));
        const { id } = current;
        onVideoChange?.({ current, next, following, videos });
        if (!id) {
          stage.dataset.videoState = 'empty';
          setStatus(source ? '영상 주소를 확인해 주세요. 다른 단계도 선택할 수 있습니다.' : '이 단계의 소개 영상을 준비 중입니다. 다른 단계도 선택할 수 있습니다.');
          return;
        }
        const YT = await loadYouTubeApi();
        if (!isCurrent()) return;
        const target = document.createElement('div');
        mount.appendChild(target);
        mount.hidden = false;
        pendingPlay = selection.autoplay;
        loadTimeout = window.setTimeout(() => {
          if (!isCurrent()) return;
          stage.dataset.videoState = 'error';
          setStatus('영상 연결이 지연되고 있습니다. 다시 시도하거나 다음 영상을 선택해 주세요.', '다시 시도');
        }, 15000);
        player = new YT.Player(target, {
          host: 'https://www.youtube-nocookie.com',
          videoId: id,
          width: '100%',
          height: '100%',
          playerVars: { autoplay: 0, controls: 0, disablekb: 1, fs: 0, iv_load_policy: 3, playsinline: 1, rel: 0, origin: window.location.origin },
          events: {
            onReady: (event) => {
              if (!isCurrent()) return;
              window.clearTimeout(loadTimeout);
              ready = true;
              event.target.setVolume(volume);
              if (muted) event.target.mute();
              else event.target.unMute();
              const frame = event.target.getIframe();
              frame.title = current.title ? `${current.title} · ${selection.title}` : `${selection.title} 유튜브 영상`;
              frame.setAttribute('allow', 'autoplay; encrypted-media');
              frame.removeAttribute('allowfullscreen');
              frame.tabIndex = -1;
              frame.setAttribute('aria-hidden', 'true');
              frame.inert = true;
              frame.referrerPolicy = 'strict-origin-when-cross-origin';
              stage.dataset.videoState = 'ready';
              setStatus(muted ? '영상을 만나보세요.' : '소리와 함께 만나보세요.', muted ? '영상 재생' : '소리 켜고 재생');
              updateControls();
              playWhenVisible();
            },
            onStateChange: (event) => {
              if (!isCurrent()) return;
              if (event.data === YT.PlayerState.PLAYING) {
                if (!inView || document.hidden) {
                  event.target.pauseVideo();
                  return;
                }
                window.clearTimeout(loadTimeout);
                playbackStarted = true;
                stage.dataset.videoState = 'playing';
                setStatus(mutedFallback ? '소리와 함께 감상해 보세요.' : '영상이 끝나면 다음 이야기로 이어집니다.', mutedFallback ? '소리 켜고 재생' : '');
                window.clearInterval(progressTimer);
                reportProgress();
                progressTimer = window.setInterval(reportProgress, 250);
              } else if (event.data === YT.PlayerState.ENDED && playbackStarted) {
                window.clearInterval(progressTimer);
                playbackStarted = false;
                onEnded();
              } else if (event.data === YT.PlayerState.PAUSED) {
                window.clearInterval(progressTimer);
                stage.dataset.videoState = 'paused';
                setStatus('일시 정지됨 · 재생하면 이어서 볼 수 있습니다.', '영상 재생');
              }
              updateControls();
            },
            onAutoplayBlocked: () => {
              if (!isCurrent() || !ready || player.getPlayerState() === YT.PlayerState.PLAYING) return;
              pendingPlay = false;
              if (!fallbackAttempted && !muted) {
                fallbackAttempted = true;
                mutedFallback = true;
                player.mute();
                pendingPlay = true;
                playWhenVisible();
              }
              setStatus(muted ? '버튼을 눌러 영상을 재생해 주세요.' : '소리와 함께 감상해 보세요.', muted ? '영상 재생' : '소리 켜고 재생');
              updateControls();
            },
            onError: () => {
              if (!isCurrent()) return;
              window.clearTimeout(loadTimeout);
              window.clearInterval(progressTimer);
              pendingPlay = false;
              playbackStarted = false;
              stage.dataset.videoState = 'error';
              setStatus('이 영상을 재생할 수 없습니다. 다시 시도하거나 다음 영상을 선택해 주세요.', '다시 시도');
              updateControls();
            },
          },
        });
      } catch {
        if (!isCurrent()) return;
        stage.dataset.videoState = 'error';
        setStatus('영상을 불러오지 못했습니다. 연결을 확인한 후 다시 시도해 주세요.', '다시 시도');
      }
    }

    action.addEventListener('click', () => {
      if (ready && stage.dataset.videoState !== 'error') {
        if (mutedFallback || !muted) {
          muted = false;
          mutedFallback = false;
          player.unMute();
        }
        playFromGesture();
      } else if (selection) {
        show({ ...selection, autoplay: true });
      }
    });
    soundButton.addEventListener('click', () => {
      if (!ready || stage.dataset.videoState === 'error') return;
      muted = !(muted || mutedFallback);
      mutedFallback = false;
      if (muted) player.mute();
      else {
        player.unMute();
        playFromGesture();
      }
      updateControls();
      setStatus(muted ? '소리 없이 재생합니다.' : '소리와 함께 재생합니다.');
    });
    pauseButton.addEventListener('click', () => {
      if (!ready || stage.dataset.videoState === 'error') return;
      if (player.getPlayerState() === 1) {
        pendingPlay = false;
        player.pauseVideo();
      } else {
        playFromGesture();
      }
      updateControls();
    });
    const observer = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting && entry.intersectionRatio >= 0.25;
      if (!inView && ready && player.getPlayerState() === 1) player.pauseVideo();
      playWhenVisible();
    }, { threshold: 0.25 });
    observer.observe(stage);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && ready && player.getPlayerState() === 1) player.pauseVideo();
      else playWhenVisible();
    });
    window.addEventListener('pagehide', () => { stop(); observer.disconnect(); });
    window.addEventListener('pageshow', (event) => {
      if (!event.persisted) return;
      observer.observe(stage);
      if (selection) show({ ...selection, autoplay: false });
    });
    return { show, stop };
  };
})();
