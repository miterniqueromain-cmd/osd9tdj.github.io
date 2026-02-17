/* osd.js — Playlist OSD9TDJ (5 musiques) + épée au clic
   FIX: anti-superposition (Google Translate / double injection)
*/
(() => {
  "use strict";

  // ✅ Singleton global: empêche double exécution => pas de double musique
  if (window.__OSD_AUDIO_SINGLETON__ && window.__OSD_AUDIO_SINGLETON__.alive) {
    // Si le script est relancé (translate), on ne relance pas une 2e musique.
    // On peut juste sortir.
    return;
  }

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

  const K_INDEX = "osd_playlist_index";
  const K_UNLOCKED = "osd_audio_unlocked";

  function ensureAudioEl(id) {
    // ✅ Nettoie d’éventuels doublons (cas rare)
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

  function getIndex() {
    try {
      const raw = sessionStorage.getItem(K_INDEX);
      const n = raw == null ? 0 : parseInt(raw, 10);
      return Number.isFinite(n) ? ((n % TRACKS.length) + TRACKS.length) % TRACKS.length : 0;
    } catch {
      return 0;
    }
  }

  function setIndex(n) {
    try { sessionStorage.setItem(K_INDEX, String(n)); } catch {}
  }

  function nextIndex(i) {
    return (i + 1) % TRACKS.length;
  }

  function markUnlocked() {
    try { sessionStorage.setItem(K_UNLOCKED, "1"); } catch {}
  }

  function isUnlocked() {
    try { return sessionStorage.getItem(K_UNLOCKED) === "1"; } catch { return false; }
  }

  const bgm = ensureAudioEl("osd_bgm");
  bgm.volume = BGM_VOLUME;
  bgm.loop = false;

  const sword = ensureAudioEl("osd_sword");
  sword.src = SWORD_SRC;
  sword.volume = SWORD_VOLUME;

  let currentTrackIndex = getIndex();

  function loadTrack(i) {
    currentTrackIndex = ((i % TRACKS.length) + TRACKS.length) % TRACKS.length;
    const src = TRACKS[currentTrackIndex];

    // ✅ Important: si déjà en lecture, on coupe avant de changer de source
    try { bgm.pause(); } catch {}
    bgm.currentTime = 0;

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

  async function startOnThisPage() {
    loadTrack(currentTrackIndex);

    const unlocked = isUnlocked();
    await playCurrent({ mutedStart: !unlocked });

    // ✅ changement de musique au changement de page
    setIndex(nextIndex(currentTrackIndex));

    if (unlocked) bgm.muted = false;
  }

  bgm.addEventListener("ended", async () => {
    const i = nextIndex(currentTrackIndex);
    loadTrack(i);

    const unlocked = isUnlocked();
    await playCurrent({ mutedStart: !unlocked });

    // garde l’index page suivante cohérent
    setIndex(nextIndex(i));

    if (unlocked) bgm.muted = false;
  });

  async function unlockAudio() {
    markUnlocked();
    bgm.muted = false;
    if (bgm.paused) await playCurrent({ mutedStart: false });
  }

  function playSword() {
    try {
      sword.currentTime = 0;
      const p = sword.play();
      if (p && typeof p.catch === "function") p.catch(() => {});
    } catch {}
  }

  // ✅ Épée sur "click" seulement (pas scroll)
  document.addEventListener("click", (e) => {
    if (!e.isTrusted) return;

    // (optionnel) ignore translate UI si tu veux
    const t = e.target;
    if (t && t.closest) {
      if (t.closest("#google_translate_element, .goog-te-gadget, .skiptranslate")) return;
    }

    playSword();
  }, true);

  // ✅ Unlock audio au 1er geste utilisateur
  const firstGesture = async () => {
    await unlockAudio();
    document.removeEventListener("click", firstGesture, true);
    document.removeEventListener("keydown", firstGesture, true);
  };
  document.addEventListener("click", firstGesture, true);
  document.addEventListener("keydown", firstGesture, true);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startOnThisPage, { once: true });
  } else {
    startOnThisPage();
  }

  document.addEventListener("visibilitychange", async () => {
    if (document.hidden) return;
    if (!bgm.paused) return;
    const unlocked = isUnlocked();
    await playCurrent({ mutedStart: !unlocked });
    if (unlocked) bgm.muted = false;
  });

  // ✅ marque singleton vivant
  window.__OSD_AUDIO_SINGLETON__ = { alive: true };
})();
