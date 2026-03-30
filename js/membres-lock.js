(function () {
  "use strict";

  // =========================
  // RÉGLAGES
  // =========================
  const DUREE_VALIDITE_MS = 60 * 60 * 1000; // 1 heure

  // Anti-bot simple
  const DELAI_MIN_AVANT_VALIDATION_MS = 1800;   // empêche validation instantanée
  const MAX_ECHECS = 5;                         // nb d'essais avant blocage
  const DUREE_BLOCAGE_MS = 15 * 60 * 1000;     // 15 minutes

  const CODES = {
    MEMBRES_DOCS: "osd9tdj3105@",
    BUREAU_ADMIN: "gm3105@"
  };

  const CONFIG = {
    MEMBRES_DOCS: {
      titre: "ACCÈS RÉSERVÉ",
      sousTitre: "Documents internes",
      message: "Veuillez saisir votre code d’accès."
    },
    BUREAU_ADMIN: {
      titre: "ACCÈS RÉSERVÉ",
      sousTitre: "Administration",
      message: "Veuillez saisir votre code d’accès administrateur."
    }
  };

  const group = (window.ACCESS_GROUP || "").trim();

  if (!group || !CODES[group] || !CONFIG[group]) {
    alert("Configuration d’accès manquante.");
    window.location.href = "index.html";
    return;
  }

  const storageKey = "access_" + group;
  const antiBotKey = "anti_bot_" + group;
  const now = Date.now();

  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || "null");
    if (saved && saved.expire > now) return;
  } catch (e) {}

  function normaliser(texte) {
    return String(texte || "").trim().toLowerCase();
  }

  const codeAttendu = normaliser(CODES[group]);
  const conf = CONFIG[group];
  const pageLoadedAt = Date.now();

  let humanInteracted = false;

  function getAntiBotState() {
    try {
      return JSON.parse(localStorage.getItem(antiBotKey) || "null") || {
        fails: 0,
        blockedUntil: 0
      };
    } catch (e) {
      return { fails: 0, blockedUntil: 0 };
    }
  }

  function setAntiBotState(state) {
    localStorage.setItem(antiBotKey, JSON.stringify(state));
  }

  function resetAntiBotState() {
    setAntiBotState({ fails: 0, blockedUntil: 0 });
  }

  function registerFailure() {
    const state = getAntiBotState();
    state.fails = (state.fails || 0) + 1;

    if (state.fails >= MAX_ECHECS) {
      state.blockedUntil = Date.now() + DUREE_BLOCAGE_MS;
      state.fails = 0;
    }

    setAntiBotState(state);
    return state;
  }

  function getRemainingBlockMs() {
    const state = getAntiBotState();
    if (!state.blockedUntil) return 0;
    return Math.max(0, state.blockedUntil - Date.now());
  }

  function formatRemaining(ms) {
    const totalSec = Math.ceil(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return min > 0 ? `${min} min ${sec}s` : `${sec}s`;
  }

  // =========================
  // BLOQUER LE SCROLL
  // =========================
  const oldHtmlOverflow = document.documentElement.style.overflow;
  const oldBodyOverflow = document.body.style.overflow;
  document.documentElement.style.overflow = "hidden";
  document.body.style.overflow = "hidden";

  // =========================
  // CSS
  // =========================
  const style = document.createElement("style");
  style.id = "membres-lock-style";
  style.textContent = `
    #membres-lock-overlay {
      position: fixed;
      inset: 0;
      z-index: 2147483647;
      background: #000000;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }

    #membres-lock-box {
      width: 100%;
      max-width: 480px;
      background: #111111;
      color: #ffffff;
      border: 2px solid #d4af37;
      border-radius: 16px;
      padding: 28px;
      box-sizing: border-box;
      font-family: Arial, Helvetica, sans-serif;
      box-shadow: 0 0 30px rgba(0,0,0,0.45);
    }

    #membres-lock-title {
      margin: 0 0 8px 0;
      font-size: 30px;
      line-height: 1.15;
      text-align: center;
      color: #d4af37;
      font-weight: bold;
    }

    #membres-lock-subtitle {
      margin: 0 0 16px 0;
      text-align: center;
      font-size: 18px;
      color: #ffffff;
    }

    #membres-lock-message {
      margin: 0 0 20px 0;
      text-align: center;
      font-size: 15px;
      line-height: 1.5;
      color: #dddddd;
    }

    #membres-lock-label {
      display: block;
      margin-bottom: 8px;
      font-size: 14px;
      font-weight: bold;
      color: #d4af37;
    }

    #membres-lock-input,
    #membres-lock-honeypot {
      width: 100%;
      padding: 14px;
      font-size: 16px;
      border: 1px solid #555;
      border-radius: 10px;
      background: #1a1a1a;
      color: #fff;
      box-sizing: border-box;
      outline: none;
      margin-bottom: 10px;
    }

    #membres-lock-input:focus {
      border-color: #d4af37;
    }

    #membres-lock-help {
      font-size: 13px;
      color: #bbbbbb;
      margin-bottom: 16px;
      text-align: center;
      line-height: 1.4;
    }

    #membres-lock-error {
      display: none;
      background: #3a1010;
      color: #ffb3b3;
      border: 1px solid #a94442;
      border-radius: 10px;
      padding: 10px 12px;
      margin-bottom: 16px;
      font-size: 14px;
      text-align: center;
      line-height: 1.4;
    }

    #membres-lock-actions {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }

    .membres-lock-btn {
      flex: 1;
      min-width: 140px;
      border: none;
      border-radius: 10px;
      padding: 13px 16px;
      font-size: 15px;
      font-weight: bold;
      cursor: pointer;
    }

    #membres-lock-submit {
      background: #d4af37;
      color: #000;
    }

    #membres-lock-home {
      background: #2a2a2a;
      color: #fff;
      border: 1px solid #555;
    }

    .hp-wrap {
      position: absolute !important;
      left: -9999px !important;
      top: -9999px !important;
      width: 1px !important;
      height: 1px !important;
      overflow: hidden !important;
      opacity: 0 !important;
      pointer-events: none !important;
    }
  `;
  document.head.appendChild(style);

  // =========================
  // HTML
  // =========================
  const overlay = document.createElement("div");
  overlay.id = "membres-lock-overlay";
  overlay.innerHTML = `
    <div id="membres-lock-box">
      <h1 id="membres-lock-title">${conf.titre}</h1>
      <div id="membres-lock-subtitle">${conf.sousTitre}</div>
      <div id="membres-lock-message">${conf.message}</div>

      <div id="membres-lock-error"></div>

      <div class="hp-wrap" aria-hidden="true">
        <label for="membres-lock-honeypot">Ne pas remplir ce champ</label>
        <input
          id="membres-lock-honeypot"
          type="text"
          tabindex="-1"
          autocomplete="off"
        />
      </div>

      <label id="membres-lock-label" for="membres-lock-input">Code d’accès</label>
      <input
        id="membres-lock-input"
        type="password"
        placeholder="Saisir le code"
        autocomplete="off"
        autocapitalize="off"
        spellcheck="false"
      />

      <div id="membres-lock-help">
        Les majuscules et minuscules sont ignorées.<br>
        En cas de trop nombreuses tentatives, l’accès est temporairement bloqué.
      </div>

      <div id="membres-lock-actions">
        <button class="membres-lock-btn" id="membres-lock-submit" type="button">ENTRER</button>
        <button class="membres-lock-btn" id="membres-lock-home" type="button">RETOUR</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const input = document.getElementById("membres-lock-input");
  const honeypot = document.getElementById("membres-lock-honeypot");
  const errorBox = document.getElementById("membres-lock-error");
  const submitBtn = document.getElementById("membres-lock-submit");
  const homeBtn = document.getElementById("membres-lock-home");

  const markHuman = () => { humanInteracted = true; };
  document.addEventListener("pointerdown", markHuman, { passive: true });
  document.addEventListener("keydown", markHuman, { passive: true });
  document.addEventListener("touchstart", markHuman, { passive: true });

  input.focus();

  function showError(message) {
    errorBox.textContent = message;
    errorBox.style.display = "block";
  }

  function hideError() {
    errorBox.style.display = "none";
  }

  function unlock() {
    resetAntiBotState();

    localStorage.setItem(
      storageKey,
      JSON.stringify({ expire: Date.now() + DUREE_VALIDITE_MS })
    );

    overlay.remove();
    style.remove();
    document.documentElement.style.overflow = oldHtmlOverflow;
    document.body.style.overflow = oldBodyOverflow;
  }

  function verifierCode() {
    hideError();

    const blockRemaining = getRemainingBlockMs();
    if (blockRemaining > 0) {
      showError("Trop de tentatives. Réessaie dans " + formatRemaining(blockRemaining) + ".");
      return;
    }

    // Anti-bot 1 : interaction humaine requise
    if (!humanInteracted) {
      showError("Interaction requise avant validation.");
      return;
    }

    // Anti-bot 2 : délai minimum
    if (Date.now() - pageLoadedAt < DELAI_MIN_AVANT_VALIDATION_MS) {
      showError("Merci de patienter un instant avant de valider.");
      return;
    }

    // Anti-bot 3 : champ piège rempli = blocage
    if (honeypot && honeypot.value.trim() !== "") {
      const state = registerFailure();
      if (state.blockedUntil && state.blockedUntil > Date.now()) {
        showError("Accès temporairement bloqué.");
      } else {
        showError("Validation refusée.");
      }
      return;
    }

    const saisie = normaliser(input.value);

    if (!saisie) {
      showError("Veuillez saisir le code.");
      input.focus();
      return;
    }

    if (saisie !== codeAttendu) {
      const state = registerFailure();

      if (state.blockedUntil && state.blockedUntil > Date.now()) {
        showError("Trop de tentatives. Réessaie dans " + formatRemaining(state.blockedUntil - Date.now()) + ".");
      } else {
        showError("Code incorrect.");
      }

      input.focus();
      input.select();
      return;
    }

    unlock();
  }

  submitBtn.addEventListener("click", verifierCode);

  input.addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      verifierCode();
    }
  });

  input.addEventListener("input", hideError);

  homeBtn.addEventListener("click", function () {
    window.location.href = "index.html";
  });
})();
