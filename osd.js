/* osd.js — Playlist OSD9TDJ (5 musiques) + épée au clic
   - Musiques: lecture dans l’ordre, passe à la suivante à la fin, boucle playlist
   - Changement de page: passe à la musique suivante
   - Démarrage robuste: tente autoplay (muted), son activé au 1er clic
   - Épée: uniquement sur "click" (pas pendant scroll)
   - N'affecte pas les autres sons présents sur tes pages
*/
(() => {
  "use strict";

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
  const K_INDEX = "osd_playlist_index";     // index de la musique courante
  const K_UNLOCKED = "osd_audio_unlocked";  // audio autorisé (après geste utilisateur)

  // ===== UTIL =====
  function ensureAudioEl(id) {
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

  function nextIndex(current) {
    return (current + 1) % TRACKS.length;
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
  bgm.loop = false; // on gère la boucle playlist nous-mêmes

  const sword = ensureAudioEl("osd_sword");
  sword.src = SWORD_SRC;
  sword.volume = SWORD_VOLUME;

  // ===== PLAYLIST LOGIC =====
  let currentTrackIndex = getIndex();

  function loadTrack(i) {
    currentTrackIndex = ((i % TRACKS.length) + TRACKS.length) % TRACKS.length;
    const src = TRACKS[currentTrackIndex];
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
    // À CHAQUE PAGE: on joue la musique courante,
    // et on prépare la suivante pour le prochain changement de page.
    loadTrack(currentTrackIndex);

    const unlocked = isUnlocked();

    // Démarrage robuste:
    // - si unlocked -> tente en son
    // - sinon -> tente muted (autoplay)
    const ok = await playCurrent({ mutedStart: !unlocked });

    // prépare la musique suivante pour la prochaine page
    setIndex(nextIndex(currentTrackIndex));

    // si ok et unlocked, on s’assure que ce n’est pas muted
    if (ok && unlocked) bgm.muted = false;
  }

  // Quand une musique finit: passe à la suivante (playlist) et continue.
  bgm.addEventListener("ended", async () => {
    const i = nextIndex(currentTrackIndex);
    loadTrack(i);

    const unlocked = isUnlocked();
    const ok = await playCurrent({ mutedStart: !unlocked });

    // on maintient aussi l'index "page suivante" cohérent
    setIndex(nextIndex(i));

    if (ok && unlocked) bgm.muted = false;
  });

  // ===== UNLOCK (1er geste utilisateur) =====
  async function unlockAudio() {
    markUnlocked();
    bgm.muted = false;

    // si la musique ne joue pas (autoplay bloqué), on relance
    if (bgm.paused) {
      await playCurrent({ mutedStart: false });
    }
  }

  // ===== ÉPÉE: UNIQUEMENT SUR CLICK (pas scroll) =====
  function playSword() {
    try {
      sword.currentTime = 0;
      const p = sword.play();
      if (p && typeof p.catch === "function") p.catch(() => {});
    } catch {}
  }

  // Click = action réelle (sur mobile, scroll ne déclenche pas click)
  document.addEventListener("click", (e) => {
    if (!e.isTrusted) return;
    playSword();
  }, true);

  // Premier geste utilisateur: unlock audio (click + keydown)
  const firstGesture = async () => {
    await unlockAudio();
    document.removeEventListener("click", firstGesture, true);
    document.removeEventListener("keydown", firstGesture, true);
  };
  document.addEventListener("click", firstGesture, true);
  document.addEventListener("keydown", firstGesture, true);

  // Relance au chargement
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startOnThisPage, { once: true });
  } else {
    startOnThisPage();
  }

  // Si on revient sur l’onglet et que ça s’est stoppé, on relance
  document.addEventListener("visibilitychange", async () => {
    if (document.hidden) return;
    if (!bgm.paused) return;
    const unlocked = isUnlocked();
    await playCurrent({ mutedStart: !unlocked });
    if (unlocked) bgm.muted = false;
  });

})();
