/* osd.js — OSD9TDJ (playlist 5 musiques + épée)
   - Playlist ordonnée, boucle complète
   - À chaque page: piste suivante
   - Anti-superposition: singleton + lock global (onglets/fenêtres) + pause sur sortie
   - Google Translate: nouvelle fenêtre => ancienne perd focus => pause
   - Épée: uniquement sur click (pas scroll)
*/
(() => {
  "use strict";

  // ===== SINGLETON (évite double init sur même page) =====
  if (window.__OSD_AUDIO_SINGLETON__ && window.__OSD_AUDIO_SINGLETON__.alive) return;

  // ===== CONFIG =====
  const TRACKS = [
    "/charlvera-guardian-of-the-holy-land-epic-background-music-for-video-206639.mp3",
    "/charlvera-knight-of-the-sacred-order-epic-background-music-for-video-206650.mp3",
    "/charlvera-legends-of-the-iron-cross_-a-symphony-of-war-and-glory-472348.mp3",
    "/deuslower-fantasy-medieval-epic-music-239599.mp3",
    "/fideascende-crux-invicta-325224.mp3"
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

  // ===== UTILS =====
  function clampIndex(n) {
    const L = TRACKS.length;
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
      document.body.appendChild(el);
    }
    return el;
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
    currentTrackIndex = clampIndex(i);
    const src = TRACKS[currentTrackIndex];
    stopBgmHard();
    bgm.src = src;
    bgm.setAttribute("data-track-index", String(currentTrackIndex));
  }

  async function playCurrent({ mutedStart } = { mutedStart: false }) {
    bgm.muted = !!mutedStart;
    try {
      const p = bgm.play();
      if (p && typeof p.then === "function") await p;
      return true;
    } catch {
      return false;
    }
  }

  // ===== GLOBAL LOCK (anti “naviguer comme un fou” / translate / multi-fenêtre) =====
  let bc = null;
  try { bc = ("BroadcastChannel" in window) ? new BroadcastChannel(CHANNEL_NAME) : null; } catch { bc = null; }

  function writeLock(owner) {
    try {
      localStorage.setItem(LOCK_KEY, JSON.stringify({ owner, t: Date.now() }));
    } catch {}
  }

  function readLock() {
    try {
      const raw = localStorage.getItem(LOCK_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function claimLock() {
    // je prends le lock => tout le monde doit se taire
    writeLock(instanceId);
    if (bc) {
      try { bc.postMessage({ type: "CLAIM", owner: instanceId }); } catch {}
    }
  }

  function handleClaim(owner) {
    // si un autre revendique, je coupe
    if (!owner || owner === instanceId) return;
    pauseBgm();
  }

  if (bc) {
    bc.onmessage = (ev) => {
      const msg = ev && ev.data;
      if (msg && msg.type === "CLAIM") handleClaim(msg.owner);
    };
  }

  // fallback via storage event (si pas BroadcastChannel)
  window.addEventListener("storage", (e) => {
    if (e.key !== LOCK_KEY) return;
    const lock = readLock();
    if (lock && lock.owner && lock.owner !== instanceId) pauseBgm();
  });

  // ===== START LOGIC =====
  async function startOnThisPage() {
    // je revendique le lock dès le démarrage => évite double musique si ancienne page survit un peu
    claimLock();

    loadTrack(currentTrackIndex);

    const unlocked = isUnlocked();
    await playCurrent({ mutedStart: !unlocked });

    // à chaque page, on prépare la suivante
    setIndex(nextIndex(currentTrackIndex));

    if (unlocked) bgm.muted = false;
  }

  // fin de piste => piste suivante => boucle
  bgm.addEventListener("ended", async () => {
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
    if (bgm.paused) await playCurrent({ mutedStart: false });
  }

  // ===== STOP MUSIC ON EXIT/LOSS OF FOCUS =====
  // (Google Translate ouvre une autre fenêtre => blur/hidden/pagehide)
  window.addEventListener("blur", pauseBgm, true);

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) pauseBgm();
  }, true);

  window.addEventListener("pagehide", pauseBgm, true);
  window.addEventListener("beforeunload", pauseBgm, true);

  // si page restaurée via BFCache
  window.addEventListener("pageshow", (e) => {
    // si on revient, on ne relance que si déjà unlock
    if (document.hidden) return;
    if (!isUnlocked()) return;
    claimLock();
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
