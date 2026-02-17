/* osd.js — OSD9TDJ
   Playlist 5 musiques (ordre) + changement à chaque page + boucle playlist
   Anti-superposition (Google Translate / double injection)
   Coupe la musique si la page perd le focus (Translate ouvre une nouvelle fenêtre)
   Épée uniquement sur CLICK (pas scroll)
*/
(() => {
  "use strict";

  // ✅ Singleton global: évite double exécution => pas de double musique
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

  // sessionStorage keys (par onglet)
  const K_INDEX = "osd_playlist_index";     // index piste courante
  const K_UNLOCKED = "osd_audio_unlocked";  // audio autorisé (après geste)

  // ===== UTILS =====
  function ensureAudioEl(id) {
    // Nettoie d’éventuels doublons (cas injecté/dupliqué)
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

  function clampIndex(n) {
    const L = TRACKS.length;
    return ((n % L) + L) % L;
  }

  function getIndex() {
    try {
      const raw = sessionStorage.getItem(K_INDEX);
      const n = raw == null ? 0 : parseInt(raw, 10);
      return Number.isFinite(n) ? clampIndex(n) : 0;
    } catch {
      return 0;
    }
  }

  function setIndex(n) {
    try { sessionStorage.setItem(K_INDEX, String(clampIndex(n))); } catch {}
  }

  function nextIndex(i) {
    return clampIndex(i + 1);
  }

  function markUnlocked() {
    try { sessionStorage.setItem(K_UNLOCKED, "1"); } catch {}
  }

  function isUnlocked() {
    try { return sessionStorage.getItem(K_UNLOCKED) === "1"; } catch { return false; }
  }

  // ===== AUDIO ELEMENTS =====
  const bgm = ensureAudioEl("osd_bgm");
  bgm.volume = BGM_VOLUME;
  bgm.loop = false; // boucle gérée par playlist

  const sword = ensureAudioEl("osd_sword");
  sword.src = SWORD_SRC;
  sword.volume = SWORD_VOLUME;

  let currentTrackIndex = getIndex();

  function loadTrack(i) {
    currentTrackIndex = clampIndex(i);
    const src = TRACKS[currentTrackIndex];

    // stop sûr avant changement de src
    try { bgm.pause(); } catch {}
    try { bgm.currentTime = 0; } catch {}

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

  // ===== START / PAGE CHANGE =====
  async function startOnThisPage() {
    loadTrack(currentTrackIndex);

    // autoplay: si pas unlock -> muted pour démarrer sans geste (quand possible)
    const unlocked = isUnlocked();
    await playCurrent({ mutedStart: !unlocked });

    // À CHAQUE PAGE: on prépare l’index de la musique suivante
    setIndex(nextIndex(currentTrackIndex));

    // si unlocked, on s’assure que ce n’est pas muted
    if (unlocked) bgm.muted = false;
  }

  // Fin de piste => piste suivante (playlist) => boucle
  bgm.addEventListener("ended", async () => {
    const i = nextIndex(currentTrackIndex);
    loadTrack(i);

    const unlocked = isUnlocked();
    await playCurrent({ mutedStart: !unlocked });

    // garde l’index page suivante cohérent
    setIndex(nextIndex(i));

    if (unlocked) bgm.muted = false;
  });

  // ===== UNLOCK AUDIO (1er geste utilisateur) =====
  async function unlockAudio() {
    markUnlocked();
    bgm.muted = false;

    // si autoplay avait été bloqué, on relance maintenant
    if (bgm.paused) {
      await playCurrent({ mutedStart: false });
    }
  }

  // ===== STOP MUSIC WHEN TRANSLATE OPENS NEW WINDOW / TAB =====
  function pauseBgm() {
    try { bgm.pause(); } catch {}
  }
  function resumeBgmIfAllowed() {
    // on relance uniquement si déjà unlock (sinon ça sera bloqué)
    if (!isUnlocked()) return;
    try {
      if (bgm.paused) bgm.play().catch(() => {});
    } catch {}
  }

  // Translate ouvre une nouvelle fenêtre => l’ancienne perd le focus => on coupe
  window.addEventListener("blur", pauseBgm, true);

  // Onglet masqué => on coupe ; retour => on relance si autorisé
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) pauseBgm();
    else resumeBgmIfAllowed();
  }, true);

  // iOS/Safari: page cachée/suspendue
  window.addEventListener("pagehide", pauseBgm, true);

  // ===== SWORD: ONLY ON CLICK (NOT SCROLL) =====
  function playSword() {
    try {
      sword.currentTime = 0;
      const p = sword.play();
      if (p && typeof p.catch === "function") p.catch(() => {});
    } catch {}
  }

  document.addEventListener("click", (e) => {
    if (!e.isTrusted) return;

    // évite de jouer quand on clique sur l’UI translate
    const t = e.target;
    if (t && t.closest) {
      if (t.closest("#google_translate_element, .goog-te-gadget, .skiptranslate, .goog-te-menu-frame")) return;
    }

    playSword();
  }, true);

  // Premier geste utilisateur => unlock
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

  // Si on revient sur la page et que la musique est stoppée, on relance (si autorisé)
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) return;
    if (!bgm.paused) return;
    resumeBgmIfAllowed();
  });

  // ✅ marque singleton vivant
  window.__OSD_AUDIO_SINGLETON__ = { alive: true };
})();
