// src/ui/music-player.ts
// Self-contained BGM controller. Wires both the top-bar and bottom-sheet play
// buttons to the single audio element, manages queue + shuffle, and keeps the
// play/pause icons in sync.
//
// Idempotent at the level of `initMusicPlayer()` — but only because we attach
// one click listener per button on first init. Calling twice will add duplicate
// listeners; main.ts is the only caller, so it's called exactly once at boot.

const TRACKS = ['Echoes of the Eye - Travelers Encore.mp3'];

let initialized = false;

export function initMusicPlayer(): void {
  if (initialized) return;
  initialized = true;

  const btn = document.getElementById('btn-music');
  const bsBtn = document.getElementById('bs-btn-music');
  const audioEl = document.getElementById('bgm');
  const iconPlay = document.getElementById('music-icon-play');
  const iconPause = document.getElementById('music-icon-pause');
  const bsIconPlay = document.getElementById('bs-music-icon-play');
  const bsIconPause = document.getElementById('bs-music-icon-pause');
  if (!audioEl || !btn) return;

  const audio = audioEl as HTMLAudioElement;
  let queue: string[] = [];
  let trackIdx = 0;
  let playing = false;

  function shuffle<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function buildQueue() {
    queue = shuffle(TRACKS);
    trackIdx = 0;
  }

  function setPlaying(v: boolean) {
    playing = v;
    const musicLabel = document.getElementById('music-label');
    if (musicLabel) musicLabel.textContent = v ? '暂停' : '播放';
    const toggle = (b: HTMLElement | null, ip: HTMLElement | null, ipa: HTMLElement | null) => {
      if (!b || !ip || !ipa) return;
      b.classList.toggle('active', v);
      ip.style.display = v ? 'none' : 'block';
      ipa.style.display = v ? 'block' : 'none';
    };
    toggle(btn, iconPlay, iconPause);
    if (bsBtn) toggle(bsBtn, bsIconPlay, bsIconPause);
  }

  function playNext() {
    if (!queue.length) return;
    trackIdx = (trackIdx + 1) % queue.length;
    if (trackIdx === 0) buildQueue();
    audio.src = '/audio/' + queue[trackIdx];
    audio.play().catch(() => {});
  }

  audio.volume = 0.45;
  audio.addEventListener('ended', playNext);
  buildQueue();
  // Don't set src/load at init — <audio preload="none"> causes the browser to
  // abort the fetch immediately, surfacing as net::ERR_ABORTED. Set src lazily
  // on the first user click instead (also respects autoplay policies).

  function toggleMusic() {
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      // Lazy-load: set src on first play (avoids ERR_ABORTED at boot).
      if (!audio.src) {
        audio.src = '/audio/' + queue[trackIdx];
      }
      audio.play().then(() => setPlaying(true)).catch(() => {});
    }
  }

  btn.addEventListener('click', toggleMusic);
  if (bsBtn) bsBtn.addEventListener('click', toggleMusic);
}
