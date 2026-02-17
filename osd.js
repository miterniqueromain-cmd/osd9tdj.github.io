/* osd.js — OSD9TDJ
   - Musique de fond: aléatoire, boucle, nouvelle musique à chaque page
   - Démarrage robuste: tente autoplay immédiat (muted) puis son au 1er geste
   - Son d'épée: au clic/tap sur toutes les pages
   - N'écrase/supprime aucun autre son déjà présent dans tes pages
*/
(() => {
  "use strict";

  // === CONFIG (racine du site) ===
  const TRACKS = [
    "/charlvera-guardian-of-the-holy-land-epic-background-music-for-video-206639.mp3",
    "/charlvera-knight-of-the-sacred-order-epic-background-music-for-video-206650.mp3",
    "/charlvera-legends-of-the-iron-cross_-a-symphony-of-war-and-glory-472348.mp3",
    "/deuslower-fantasy-medieval-epic-music-239599.mp3",
    "/fideascende-crux-invicta-325224.mp3",
  ];

  // Son épée (d'après ton menu.html)
  const SWORD_SRC = "/sons/epee.mp3";

  // Volumes
  const BGM_VOLUME = 0.40;   // volume musique de fond
  const SWORD_VOLUME = 0.90; // volume épée

  // Anti-répétition "très aléatoire"
  const HISTORY_SIZE = 4; // évite de rejouer les 4 derniers titres

  // sessionStorage keys (par onglet)
  const K_LAST = "osd_bgm_last";
  const K_HIST = "osd_bgm_hist";
  const K_UNLOCKED = "osd_audio_unlocked";

  function safeParse(json, fallback) {
    try { return JSON.parse(json); } catch { return fallback; }
  }

  function ensureAudioEl(id) {
    let el = document.getElementById(id);
    if (!el) {
      el = document.createElement("audio");
      el.id = id;
      el.preload = "auto";
      el.playsInline = true;
      // Important: ne pas afficher
      el.style.display = "none";
      document.body.appendChild(el);
    }
    return el;
  }

  function pickTrack() {
    const last = sessionStorage.getItem(K_LAST) || "";
    const hist = safeParse(sessionStorage.getItem(K_HIST) || "[]", []);
    const banned = new Set([last, ...hist].filter(Boolean));

    let candidates = TRACKS.filter(t => !banned.has(t));
    if (candidates.length === 0) candidates = TRACKS.slice();

    const chosen = candidates[Math.floor(Math.random() * candidates.length)] || TRACKS[0];

    // update history
    const newHist = [chosen, ...hist.filter(t => t !== chosen)].slice(0, HISTORY_SIZE);
    sessionStorage.setItem(K_LAST, chosen);
    sessionStorage.setItem(K_HIST, JSON.stringify(newHist));

    return chosen;
  }

  // ---- Elements audio ----
  const bgm = ensureAudioEl("osd_bgm");
  bgm.loop = true;
  bgm.volume = BGM_VOLUME;

  const sword = ensureAudioEl("osd_sword");
  sword.src = SWORD_SRC;
  sword.volume = SWORD_VOLUME;

  function setBgmSrc(src) {
    // src doit être absolu ("/xxx.mp3")
    if (!src) return;
    if (bgm.getAttribute("data-track") === src) return;
    bgm.setAttribute("data-track", src);
    bgm.src = src;
  }

  async function tryPlayBgm({ mutedStart } = { mutedStart: false }) {
    const chosen = pickTrack();
    setBgmSrc(chosen);

    // stratégie: démarrer muted si demandé (passe souvent sans geste utilisateur)
    bgm.muted = !!mutedStart;

    try {
      const p = bgm.play();
      if (p && typeof p.then === "function") await p;
      return true;
    } catch {
      return false;
    }
  }

  function markUnlocked() {
    sessionStorage.setItem(K_UNLOCKED, "1");
    // Une fois “unlock”, on remet le son
    bgm.muted = false;
    bgm.volume = BGM_VOLUME;
  }

  // 1) Démarrage au chargement (tentative)
  // - si déjà unlocked dans cette session, on tente direct en son
  // - sinon on tente en muted (robuste)
  async function startOnLoad() {
    const unlocked = sessionStorage.getItem(K_UNLOCKED) === "1";

    if (unlocked) {
      const ok = await tryPlayBgm({ mutedStart: false });
      if (!ok) {
        // fallback : muted (certains contextes)
        await tryPlayBgm({ mutedStart: true });
      }
    } else {
      // tentative “sans action” la plus fiable
      const okMuted = await tryPlayBgm({ mutedStart: true });
      // si par miracle le navigateur autorise l'audio en son sans geste, on peut tester
      if (!okMuted) {
        // rien, on attendra l’unlock par geste utilisateur
      }
    }
  }

  // 2) Déverrouillage sur premier geste utilisateur (met le son + relance si besoin)
  async function unlockAudio() {
    markUnlocked();

    // Si la musique tourne déjà (muted), on passe en son
    if (!bgm.paused) {
      bgm.muted = false;
      return;
    }

    // Sinon on relance en son
    await tryPlayBgm({ mutedStart: false });
  }

  // 3) Son d'épée au clic/tap (sur toutes les pages)
  function playSword() {
    try {
      sword.currentTime = 0;
      const p = sword.play();
      if (p && typeof p.catch === "function") p.catch(() => {});
    } catch {}
  }

  // ---- Hooks ----
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startOnLoad, { once: true });
  } else {
    startOnLoad();
  }

  // Pointerdown + keydown: unlock + épée
  const onFirstUserGesture = async () => {
    await unlockAudio();
    // on retire seulement l’unlock “one-shot”, mais on garde épée sur chaque clic via un autre listener
    document.removeEventListener("pointerdown", onFirstUserGesture, true);
    document.removeEventListener("keydown", onFirstUserGesture, true);
  };
  document.addEventListener("pointerdown", onFirstUserGesture, true);
  document.addEventListener("keydown", onFirstUserGesture, true);

  // Épée à chaque clic/tap (capture pour passer même si stopPropagation)
  document.addEventListener("pointerdown", () => {
    // si l'audio n'est pas encore unlock, ce clic servira aussi à unlock via listener ci-dessus
    playSword();
  }, true);

  // Si on revient sur l’onglet et que la musique est stoppée, on relance (muted si pas unlock)
  document.addEventListener("visibilitychange", async () => {
    if (document.hidden) return;
    if (!bgm.paused) return;
    const unlocked = sessionStorage.getItem(K_UNLOCKED) === "1";
    await tryPlayBgm({ mutedStart: !unlocked });
    if (unlocked) bgm.muted = false;
  });

})();
