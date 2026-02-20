/* osd.js — OSD9TDJ (playlist + épée)
   - Playlist ordonnée, boucle complète
   - À chaque page: piste suivante
   - Anti-superposition: singleton + lock global (onglets/fenêtres) + pause sur sortie
   - Google Translate: nouvelle fenêtre => ancienne perd focus => pause (mais blur court dropdown ignoré)
   - Épée: uniquement sur click (pas scroll)
   - CHECK AUTO: supprime automatiquement les pistes MP3 introuvables (404/etc.)
*/
(() => {
  "use strict";

  // ===== SINGLETON (évite double init sur même page) =====
  if (window.__OSD_AUDIO_SINGLETON__ && window.__OSD_AUDIO_SINGLETON__.alive) return;

  // ===== CONFIG =====
  // Ordre: agressif -> épique -> transition sacrée -> grégorien -> mystique final
  // (14 pistes: 5 anciennes + 8 nouvelles uniques + 1 répétée pour faire 14, comme on a vu dans tes listes)
  let TRACKS = [
    // ⚔️ AGRESSIF / GUERRE (début)
    "/charlvera-legends-of-the-iron-cross_-a-symphony-of-war-and-glory-472348.mp3",
    "/paulyudin-epic-485934.mp3",
    "/charlvera-guardian-of-the-holy-land-epic-background-music-for-video-206639.mp3",

    // ⚔️ ÉPIQUE CINÉ / CHEVALERIE
    "/sigmamusicart-epic-cinematic-background-music-484595.mp3",
    "/charlvera-knight-of-the-sacred-order-epic-background-music-for-video-206650.mp3",
    "/deuslower-fantasy-medieval-epic-music-239599.mp3",

    // ✝️ TRANSITION SACRÉE (entrée liturgique)
    "/fideascende-crux-bellum-vox-325218.mp3",
    "/fideascende-crux-invicta-325224.mp3",
    "/fideascende-sanguis-dei-325211.mp3",

    // ✝️ GRÉGORIEN PROFOND
    "/nickpanek-act-of-contrition-latin-gregorian-chant-340859.mp3",
    "/nickpanek-gregorian-chant-regina-caeli-prayer-340861.mp3",
    "/nickpanek-amo-te-gregorian-chant-in-latin-340860.mp3",

    // ✝️ FIN MYSTIQUE
    "/fideascende-pater-noster-324805.mp3",

    // (doublon volontaire pour atteindre 14 pistes)
    "/nickpanek-amo-te-gregorian-chant-in-latin-340860.mp3"
  ];

  const SWORD_SRC = "/sons/epee.mp3";

  const BGM_VOLUME = 0.40;
  const SWORD_VOLUME = 0.90;

  // sessionStorage (par onglet)
  const K_INDEX = "osd_playlist_index";
  const K_UNLOCKED = "osd_audio_unlocked";

  // lock global (entre fenêtres/onglets)
  const LOCK_KEY = "osd_audio_lock";
  const CHANNEL_NAME = "osd_audio_channel";
  const instanceId = `${Date.now()}_${Math.random().toString(16).slice(2)}`;

  // sécurité: si un lock reste coincé (crash/kill), au bout de X ms on le considère "stale"
  const STALE_LOCK_MS = 15_000;

  // blur anti-dropdown: délai avant pause
  const BLUR_PAUSE_DELAY_MS = 300;

  // CHECK AUTO: timeout d’un check de piste (ms)
  const TRACK_CHECK_TIMEOUT_MS = 3500;

  // ===== UTILS =====
  function playlistLen() { return Array.isArray(TRACKS) ? TRACKS.length : 0; }

  function clampIndex(n) {
    const L = playlistLen();
    if (!L) return 0;
    return ((n % L) + L) % L;
  }
  function getIndex() {
    try {
      const raw = sessionStorage.getItem(K_INDEX);
      const n = raw == null ? 0 : parseInt(raw, 10);
      return Number.isFinite(n) ? clampIndex(n) : 0;
    } catch { return 0; }
  }
  function setIndex(n) {
    try { sessionStorage.setItem(K_INDEX, String(clampIndex(n))); } catch {}
  }
  function nextIndex(i) { return clampIndex(i + 1); }
  function markUnlocked() { try { sessionStorage.setItem(K_UNLOCKED, "1"); } catch {} }
  function isUnlocked() { try { return sessionStorage.getItem(K_UNLOCKED) === "1"; } catch { return false; } }

  function ensureAudioEl(id) {
    // supprime doublons éventuels
    const all = document.querySelectorAll(`#${CSS.escape(id)}`);
    if (all.length > 1) {
      all.forEach((n, idx) => {
        if (idx === 0) return;
        try { n.pause(); } catch {}
        try { n.remove(); } catch {}
      });
    }
    let el = document.getElementById(id);
    if (!el) {
      el = document.createElement("audio");
      el.id = id;
      el.preload = "auto";
      el.playsInline = true;
      el.style.display = "none";
      (document.body || document.documentElement).appendChild(el);
    }
    return el;
  }

  function withTimeout(ms, fn) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    return Promise.resolve()
      .then(() => fn(ctrl.signal))
      .finally(() => clearTimeout(t));
  }

  // ===== CHECK AUTO DES PISTES (supprime celles qui ne répondent pas) =====
  async function checkOneTrack(url) {
    // même origine => OK GitHub Pages. On force no-store pour éviter cache chelou.
    // 1) HEAD
    try {
      const ok = await withTimeout(TRACK_CHECK_TIMEOUT_MS, (signal) =>
        fetch(url, { method: "HEAD", cache: "no-store", signal })
          .then((r) => r && r.ok)
      );
      if (ok) return true;
    } catch {}

    // 2) fallback GET Range 0-0 (ultra léger)
    try {
      const ok2 = await withTimeout(TRACK_CHECK_TIMEOUT_MS, (signal) =>
        fetch(url, {
          method: "GET",
          headers: { Range: "bytes=0-0" },
          cache: "no-store",
          signal
        }).then((r) => r && (r.ok || r.status === 206))
      );
      return !!ok2;
    } catch {
      return false;
    }
  }

  async function validateTracks() {
    if (!Array.isArray(TRACKS) || TRACKS.length === 0) return;

    // dédoublonnage “optionnel” : on garde les doublons voulus,
    // mais on évite de checker 2 fois la même URL
    const unique = Array.from(new Set(TRACKS));
    const results = await Promise.all(unique.map(async (u) => [u, await checkOneTrack(u)]));
    const okSet = new Set(results.filter(([, ok]) => ok).map(([u]) => u));

    const before = TRACKS.slice();
    TRACKS = before.filter((u) => okSet.has(u));

    // si la playlist devient vide -> on ne jouera pas
    // sinon on recale l’index session
    if (TRACKS.length > 0) {
      const idx = getIndex();
      setIndex(idx); // clamp sur nouvelle taille
    }
  }

  // ===== AUDIO =====
  const bgm = ensureAudioEl("osd_bgm");
  bgm.volume = BGM_VOLUME;
  bgm.loop = false;

  const sword = ensureAudioEl("osd_sword");
  sword.src = SWORD_SRC;
  sword.volume = SWORD_VOLUME;

  let currentTrackIndex = getIndex();

  function pauseBgm() {
    try { bgm.pause(); } catch {}
  }

  function stopBgmHard() {
    try { bgm.pause(); } catch {}
    try { bgm.currentTime = 0; } catch {}
  }

  function loadTrack(i) {
    if (!playlistLen()) return;
    currentTrackIndex = clampIndex(i);
    const src = TRACKS[currentTrackIndex];
    stopBgmHard();
    bgm.src = src;
    bgm.setAttribute("data-track-index", String(currentTrackIndex));
  }

  async function playCurrent({ mutedStart } = { mutedStart: false }) {
    if (!playlistLen()) return false;
    try { bgm.volume = BGM_VOLUME; } catch {}
    bgm.muted = !!mutedStart;
    try {
      const p = bgm.play();
      if (p && typeof p.then === "function") await p;
      return true;
    } catch {
      return false;
    }
  }

  // ===== GLOBAL LOCK (anti multi-fenêtre / translate / onglets) =====
  let bc = null;
  try { bc = ("BroadcastChannel" in window) ? new BroadcastChannel(CHANNEL_NAME) : null; } catch { bc = null; }

  function writeLock(owner) {
    try { localStorage.setItem(LOCK_KEY, JSON.stringify({ owner, t: Date.now() })); } catch {}
  }

  function readLock() {
    try {
      const raw = localStorage.getItem(LOCK_KEY);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (!obj || typeof obj !== "object") return null;
      if (!obj.owner || typeof obj.owner !== "string") return null;
      if (!obj.t || typeof obj.t !== "number") return null;
      if (Date.now() - obj.t > STALE_LOCK_MS) return null; // stale lock
      return obj;
    } catch {
      return null;
    }
  }

  function lockIsMine() {
    const lock = readLock();
    return lock && lock.owner === instanceId;
  }

  function claimLock() {
    writeLock(instanceId);
    if (bc) {
      try { bc.postMessage({ type: "CLAIM", owner: instanceId }); } catch {}
    }
  }

  function handleClaim(owner) {
    if (!owner || owner === instanceId) return;
    pauseBgm();
  }

  if (bc) {
    bc.onmessage = (ev) => {
      const msg = ev && ev.data;
      if (msg && msg.type === "CLAIM") handleClaim(msg.owner);
    };
  }

  window.addEventListener("storage", (e) => {
    if (e.key !== LOCK_KEY) return;
    const lock = readLock();
    if (lock && lock.owner && lock.owner !== instanceId) pauseBgm();
  });

  // ===== START LOGIC =====
  async function startOnThisPage() {
    // 1) check automatique (une seule fois au boot de la page)
    await validateTracks();

    // 2) si plus rien -> on ne tente pas d’audio
    if (!playlistLen()) return;

    // 3) revendique lock et démarre
    claimLock();

    currentTrackIndex = getIndex();
    loadTrack(currentTrackIndex);

    const unlocked = isUnlocked();
    await playCurrent({ mutedStart: !unlocked });

    // à chaque page, on prépare la suivante
    setIndex(nextIndex(currentTrackIndex));

    if (unlocked) bgm.muted = false;
  }

  // fin de piste => piste suivante => boucle
  bgm.addEventListener("ended", async () => {
    if (!playlistLen()) return;
    claimLock();
    const i = nextIndex(currentTrackIndex);
    loadTrack(i);

    const unlocked = isUnlocked();
    await playCurrent({ mutedStart: !unlocked });

    setIndex(nextIndex(i));
    if (unlocked) bgm.muted = false;
  });

  // unlock audio au 1er geste
  async function unlockAudio() {
    markUnlocked();
    bgm.muted = false;

    claimLock();

    if (document.hidden) return;
    if (!lockIsMine()) return;

    if (bgm.paused) await playCurrent({ mutedStart: false });
  }

  // ===== STOP MUSIC ON EXIT/LOSS OF FOCUS =====
  let blurTimer = null;
  let wasPlayingBeforeBlur = false;

  function schedulePauseOnBlur() {
    wasPlayingBeforeBlur = !bgm.paused;

    if (blurTimer) clearTimeout(blurTimer);

    blurTimer = setTimeout(() => {
      blurTimer = null;
      const stillNoFocus = (typeof document.hasFocus === "function") ? !document.hasFocus() : true;
      if (document.hidden || stillNoFocus) pauseBgm();
    }, BLUR_PAUSE_DELAY_MS);
  }

  window.addEventListener("blur", schedulePauseOnBlur, true);

  window.addEventListener("focus", () => {
    if (blurTimer) {
      clearTimeout(blurTimer);
      blurTimer = null;
    }

    if (!document.hidden && isUnlocked() && wasPlayingBeforeBlur && lockIsMine() && bgm.paused) {
      try { bgm.play().catch(() => {}); } catch {}
    }
  }, true);

  // Changement d'onglet => hidden est fiable, on pause direct
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) pauseBgm();
  }, true);

  window.addEventListener("pagehide", pauseBgm, true);
  window.addEventListener("beforeunload", pauseBgm, true);

  // si page restaurée via BFCache
  window.addEventListener("pageshow", () => {
    if (document.hidden) return;
    if (!isUnlocked()) return;

    claimLock();
    if (!lockIsMine()) return;

    try { if (bgm.paused) bgm.play().catch(() => {}); } catch {}
  }, true);

  // ===== ÉPÉE UNIQUEMENT SUR CLICK (pas scroll) =====
  function playSword() {
    try {
      sword.currentTime = 0;
      const p = sword.play();
      if (p && typeof p.catch === "function") p.catch(() => {});
    } catch {}
  }

  document.addEventListener("click", (e) => {
    if (!e.isTrusted) return;

    // évite l’UI translate
    const t = e.target;
    if (t && t.closest) {
      if (t.closest("#google_translate_element, .goog-te-gadget, .skiptranslate, .goog-te-menu-frame")) return;
    }

    playSword();
  }, true);

  const firstGesture = async () => {
    await unlockAudio();
    document.removeEventListener("click", firstGesture, true);
    document.removeEventListener("keydown", firstGesture, true);
  };
  document.addEventListener("click", firstGesture, true);
  document.addEventListener("keydown", firstGesture, true);

  // ===== BOOT =====
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startOnThisPage, { once: true });
  } else {
    startOnThisPage();
  }

  window.__OSD_AUDIO_SINGLETON__ = { alive: true, id: instanceId };
})();
