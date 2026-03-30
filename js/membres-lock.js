(function () {
  "use strict";

  // ==========================================
  // PARAMÈTRES
  // ==========================================
  const DUREE_VALIDITE_MS = 60 * 60 * 1000; // 1 heure

  // Un seul code par page/groupe
  const CODES = {
    MEMBRES_DOCS: "osd9tdj3105@",
    BUREAU_ADMIN: "gm3105@"
  };

  const CONFIG = {
    MEMBRES_DOCS: {
      titre: "Accès réservé",
      sousTitre: "Documents internes",
      message: "Veuillez saisir le code d’accès pour continuer.",
      bouton: "Entrer"
    },
    BUREAU_ADMIN: {
      titre: "Accès réservé au bureau",
      sousTitre: "Administration",
      message: "Veuillez saisir le code d’accès autorisé.",
      bouton: "Accéder"
    }
  };

  const group = (window.ACCESS_GROUP || "").trim();

  if (!group || !CODES[group] || !CONFIG[group]) {
    alert("Configuration d’accès manquante.");
    window.location.href = "index.html";
    return;
  }

  const storageKey = "access_" + group;
  const now = Date.now();

  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || "null");
    if (saved && saved.expire > now) return;
  } catch (e) {}

  function normaliser(valeur) {
    return String(valeur || "").trim().toLowerCase();
  }

  const codeAttendu = normaliser(CODES[group]);
  const conf = CONFIG[group];

  // ==========================================
  // STYLES
  // ==========================================
  const style = document.createElement("style");
  style.id = "access-lock-style";
  style.textContent = `
    #access-lock-overlay {
      position: fixed;
      inset: 0;
      z-index: 999999;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      background: rgba(0, 0, 0, 0.55);
      backdrop-filter: blur(6px);
      -webkit-backdrop-filter: blur(6px);
    }

    #access-lock-card {
      width: 100%;
      max-width: 460px;
      background: rgba(20, 20, 20, 0.92);
      color: #fff;
      border-radius: 18px;
      padding: 24px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.35);
      border: 1px solid rgba(255,255,255,0.10);
      font-family: Arial, Helvetica, sans-serif;
    }

    #access-lock-card h1 {
      margin: 0 0 8px;
      font-size: 28px;
      line-height: 1.15;
    }

    #access-lock-card .sub {
      font-size: 15px;
      opacity: 0.9;
      margin-bottom: 10px;
    }

    #access-lock-card .msg {
      font-size: 14px;
      opacity: 0.8;
      margin-bottom: 18px;
      line-height: 1.5;
    }

    #access-lock-card label {
      display: block;
      font-size: 14px;
      margin-bottom: 8px;
      font-weight: bold;
    }

    #access-lock-input-wrap {
      position: relative;
      margin-bottom: 10px;
    }

    #access-lock-input {
      width: 100%;
      padding: 14px 44px 14px 14px;
      border-radius: 12px;
      border: 1px solid rgba(255,255,255,0.15);
      background: rgba(255,255,255,0.08);
      color: #fff;
      font-size: 16px;
      outline: none;
      box-sizing: border-box;
    }

    #access-lock-input::placeholder {
      color: rgba(255,255,255,0.5);
    }

    #access-lock-toggle {
      position: absolute;
      top: 50%;
      right: 10px;
      transform: translateY(-50%);
      border: none;
      background: transparent;
      color: #fff;
      font-size: 18px;
      cursor: pointer;
    }

    #access-lock-help {
      font-size: 12px;
      opacity: 0.7;
      margin-bottom: 14px;
    }

    #access-lock-error {
      display: none;
      margin-bottom: 14px;
      padding: 10px 12px;
      border-radius: 10px;
      background: rgba(220, 38, 38, 0.20);
      border: 1px solid rgba(248, 113, 113, 0.35);
      color: #fecaca;
      font-size: 14px;
      line-height: 1.4;
    }

    #access-lock-actions {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }

    #access-lock-submit,
    #access-lock-home {
      border: none;
      border-radius: 12px;
      padding: 12px 16px;
      font-size: 15px;
      font-weight: bold;
      cursor: pointer;
    }

    #access-lock-submit {
      background: #2563eb;
      color: #fff;
      flex: 1;
    }

    #access-lock-home {
      background: rgba(255,255,255,0.10);
      color: #fff;
    }
  `;
  document.head.appendChild(style);

  // ==========================================
  // OVERLAY
  // ==========================================
  const overlay = document.createElement("div");
  overlay.id = "access-lock-overlay";
  overlay.innerHTML = `
    <div id="access-lock-card">
      <h1>${conf.titre}</h1>
      <div class="sub">${conf.sousTitre}</div>
      <div class="msg">${conf.message}</div>

      <div id="access-lock-error"></div>

      <label for="access-lock-input">Code d’accès</label>
      <div id="access-lock-input-wrap">
        <input
          id="access-lock-input"
          type="password"
          placeholder="Saisir le code"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
        />
        <button id="access-lock-toggle" type="button">👁️</button>
      </div>

      <div id="access-lock-help">
        Les majuscules et minuscules sont ignorées.
      </div>

      <div id="access-lock-actions">
        <button id="access-lock-submit" type="button">${conf.bouton}</button>
        <button id="access-lock-home" type="button">Retour accueil</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const input = document.getElementById("access-lock-input");
  const errorBox = document.getElementById("access-lock-error");
  const submitBtn = document.getElementById("access-lock-submit");
  const homeBtn = document.getElementById("access-lock-home");
  const toggleBtn = document.getElementById("access-lock-toggle");

  input.focus();

  function showError(message) {
    errorBox.textContent = message;
    errorBox.style.display = "block";
  }

  function hideError() {
    errorBox.style.display = "none";
  }

  function unlock() {
    localStorage.setItem(
      storageKey,
      JSON.stringify({ expire: Date.now() + DUREE_VALIDITE_MS })
    );
    overlay.remove();
  }

  function verifierCode() {
    hideError();

    const saisie = normaliser(input.value);

    if (!saisie) {
      showError("Merci de saisir le code d’accès.");
      input.focus();
      return;
    }

    if (saisie !== codeAttendu) {
      showError("Code incorrect.");
      input.focus();
      input.select();
      return;
    }

    unlock();
  }

  submitBtn.addEventListener("click", verifierCode);

  input.addEventListener("keydown", function (e) {
    if (e.key === "Enter") verifierCode();
  });

  input.addEventListener("input", hideError);

  toggleBtn.addEventListener("click", function () {
    input.type = input.type === "password" ? "text" : "password";
    toggleBtn.textContent = input.type === "password" ? "👁️" : "🙈";
    input.focus();
  });

  homeBtn.addEventListener("click", function () {
    window.location.href = "index.html";
  });
})();
