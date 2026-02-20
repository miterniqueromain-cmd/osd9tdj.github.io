/* osd.js — OSD9TDJ (playlist 5 musiques + épée)
   - Playlist ordonnée, boucle complète
   - À chaque page: piste suivante
   - Anti-superposition: singleton + lock global (onglets/fenêtres) + pause sur sortie
   - Google Translate: nouvelle fenêtre => ancienne perd focus => pause (mais blur court dropdown ignoré)
   - Épée: uniquement sur click (pas scroll)
*/
(() => {
  "use strict";

  // ===== SINGLETON (évite double init sur même page) =====
  if (window.__OSD_AUDIO_SINGLETON__ && window.__OSD_AUDIO_SINGLETON__.alive) return;

  // ===== CONFIG =====
  const TRACKS = [

  // ⚔️ AGRESSIF / GUERRE
  "/charlvera-legends-of-the-iron-cross_-a-symphony-of-war-and-glory-472348.mp3",
  "/paulyudin-epic-485934.mp3",
  "/charlvera-guardian-of-the-holy-land-epic-background-music-for-video-206639.mp3",

  // ⚔️ CHEVALERIE / ÉPIQUE
  "/charlvera-knight-of-the-sacred-order-epic-background-music-for-video-206650.mp3",
  "/deuslower-fantasy-medieval-epic-music-239599.mp3",


  // ✝️ TRANSITION SACRÉE
  "/fideascende-crux-bellum-vox-325218.mp3",
  "/fideascende-sanguis-dei-325211.mp3",
  "/fideascende-crux-invicta-325224.mp3",

  // ✝️ GRÉGORIEN PROFOND
  "/nickpanek-act-of-contrition-latin-gregorian-chant-340859.mp3",
  "/nickpanek-gregorian-chant-regina-caeli-prayer-340861.mp3",
  "/nickpanek-amo-te-gregorian-chant-in-latin-340860.mp3",

  // ✝️ FIN MYSTIQUE
  "/fideascende-pater-noster-324805.mp3",

  
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
  const STALE_LOCK_MS = 15_000; // 15s, suffisant pour éviter des blocages anormaux

  // blur anti-dropdown: délai avant pause
  const BLUR_PAUSE_DELAY_MS = 300;

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
    // garde volume à chaque play (au cas où une autre page l'aurait modifié via même ID)
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
      const obj = JSON.parse(raw);
      if (!obj || typeof obj !== "object") return null;
      if (!obj.owner || typeof obj.owner !== "string") return null;
      if (!obj.t || typeof obj.t !== "number") return null;

      // stale lock ?
      if (Date.now() - obj.t > STALE_LOCK_MS) return null;
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

    // si pas unlocked, on tente un "mutedStart" (pas de son) pour amorcer, puis unmute après geste
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

    // on réclame le lock, puis on ne relance que si lock à nous + visible
    claimLock();

    if (document.hidden) return;
    if (!lockIsMine()) return;

    if (bgm.paused) await playCurrent({ mutedStart: false });
  }

  // ===== STOP MUSIC ON EXIT/LOSS OF FOCUS =====
  // Objectif: éviter que les <select>/menus natifs déclenchent un blur qui coupe la musique,
  // tout en gardant le "vrai" anti-superposition (Google Translate / changement d'onglet/fenêtre).

  let blurTimer = null;
  let wasPlayingBeforeBlur = false;

  function schedulePauseOnBlur() {
    // on note l'état avant blur (pour éventuellement reprendre)
    wasPlayingBeforeBlur = !bgm.paused;

    if (blurTimer) clearTimeout(blurTimer);

    // délai court: si blur = UI native (dropdown), le focus revient vite => on annule
    blurTimer = setTimeout(() => {
      blurTimer = null;

      // Si on a encore perdu le focus, ou si la page est cachée => on pause
      const stillNoFocus = (typeof document.hasFocus === "function") ? !document.hasFocus() : true;
      if (document.hidden || stillNoFocus) pauseBgm();
    }, BLUR_PAUSE_DELAY_MS);
  }

  // blur: pause potentielle (différée)
  window.addEventListener("blur", schedulePauseOnBlur, true);

  // focus: si c'était un blur "court" (dropdown), on annule et on reprend si nécessaire
  window.addEventListener("focus", () => {
    if (blurTimer) {
      clearTimeout(blurTimer);
      blurTimer = null;
    }

    // Reprise uniquement si:
    // - audio déjà unlock
    // - page visible
    // - ça jouait avant le blur
    // - le lock est toujours à nous (sinon un autre onglet/page joue)
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
  window.addEventListener("pageshow", (e) => {
    if (document.hidden) return;
    if (!isUnlocked()) return;

    // on reprend seulement si lock à nous (sinon on risquerait un doublon)
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
