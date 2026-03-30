(function () {
  "use strict";

  // =========================================================
  // PARAMÈTRES
  // =========================================================

  // Durée de mémorisation : 1 heure
  const DUREE_VALIDITE_MS = 60 * 60 * 1000;

  // Un seul code par page / groupe
  // Change simplement les valeurs ici quand tu veux
  const CODES = {
    MEMBRES_DOCS: "osd9tdj3105@",
    BUREAU_ADMIN: "gm3105@"
  };

  // Textes affichés selon la page
  const CONFIG = {
    MEMBRES_DOCS: {
      titre: "Accès réservé",
      sousTitre: "Documents internes",
      message:
        "Cette page est réservée aux personnes autorisées. Merci de saisir le code d’accès.",
      bouton: "Entrer"
    },

    BUREAU_ADMIN: {
      titre: "Accès strictement réservé",
      sousTitre: "Administration du bureau",
      message:
        "Cette page contient des contenus sensibles. Merci de saisir le code d’accès autorisé.",
      bouton: "Accéder"
    }
  };

  // Page/groupe défini dans le HTML
  // Exemple dans la page :
  // <script>window.ACCESS_GROUP = "MEMBRES_DOCS";</script>
  const group = (window.ACCESS_GROUP || "").trim();

  // =========================================================
  // SÉCURITÉ DE BASE
  // =========================================================

  if (!group || !CODES[group] || !CONFIG[group]) {
    document.body.innerHTML = "";
    alert("Configuration d’accès manquante.");
    window.location.href = "index.html";
    return;
  }

  const storageKey = "access_" + group;
  const now = Date.now();

  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || "null");
    if (saved && saved.expire > now) {
      return;
    }
  } catch (e) {
    // On ignore si localStorage est corrompu
  }

  // =========================================================
  // NORMALISATION DU CODE
  // - trim() : ignore espaces avant/après
  // - toLowerCase() : ignore majuscules/minuscules
  // =========================================================

  function normaliser(valeur) {
    return String(valeur || "")
      .trim()
      .toLowerCase();
  }

  const codeAttendu = normaliser(CODES[group]);
  const conf = CONFIG[group];

  // =========================================================
  // BLOQUER L’AFFICHAGE DE LA PAGE TANT QUE NON VALIDÉ
  // =========================================================

  const contenuOriginal = document.body.innerHTML;
  document.body.innerHTML = "";
  document.body.style.margin = "0";
  document.body.style.fontFamily =
    "Inter, Arial, Helvetica, sans-serif";
  document.documentElement.style.background =
    "linear-gradient(135deg, #0f172a 0%, #111827 45%, #1e293b 100%)";
  document.body.style.background = "transparent";

  // =========================================================
  // STYLES
  // =========================================================

  const style = document.createElement("style");
  style.textContent = `
    * {
      box-sizing: border-box;
    }

    body {
      min-height: 100vh;
    }

    .lock-screen {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      background:
        radial-gradient(circle at top left, rgba(59,130,246,0.18), transparent 30%),
        radial-gradient(circle at bottom right, rgba(168,85,247,0.18), transparent 30%),
        linear-gradient(135deg, #0f172a 0%, #111827 45%, #1e293b 100%);
    }

    .lock-card {
      width: 100%;
      max-width: 520px;
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid rgba(255,255,255,0.14);
      backdrop-filter: blur(14px);
      -webkit-backdrop-filter: blur(14px);
      border-radius: 24px;
      padding: 34px 28px;
      box-shadow: 0 30px 80px rgba(0,0,0,0.42);
      color: #ffffff;
    }

    .lock-badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 8px 14px;
      border-radius: 999px;
      background: rgba(255,255,255,0.10);
      border: 1px solid rgba(255,255,255,0.12);
      font-size: 13px;
      margin-bottom: 18px;
    }

    .lock-title {
      font-size: 32px;
      line-height: 1.1;
      font-weight: 800;
      margin: 0 0 8px;
      letter-spacing: -0.02em;
    }

    .lock-subtitle {
      font-size: 16px;
      line-height: 1.4;
      color: rgba(255,255,255,0.84);
      margin: 0 0 22px;
    }

    .lock-message {
      font-size: 15px;
      line-height: 1.6;
      color: rgba(255,255,255,0.74);
      margin-bottom: 24px;
    }

    .lock-label {
      display: block;
      font-size: 14px;
      font-weight: 600;
      margin-bottom: 10px;
      color: rgba(255,255,255,0.92);
    }

    .lock-input-wrap {
      position: relative;
      margin-bottom: 14px;
    }

    .lock-input {
      width: 100%;
      padding: 16px 48px 16px 16px;
      border-radius: 16px;
      border: 1px solid rgba(255,255,255,0.16);
      background: rgba(255,255,255,0.10);
      color: #ffffff;
      font-size: 16px;
      outline: none;
      transition: 0.2s ease;
    }

    .lock-input::placeholder {
      color: rgba(255,255,255,0.45);
    }

    .lock-input:focus {
      border-color: rgba(96,165,250,0.9);
      box-shadow: 0 0 0 4px rgba(96,165,250,0.18);
      background: rgba(255,255,255,0.14);
    }

    .toggle-btn {
      position: absolute;
      right: 10px;
      top: 50%;
      transform: translateY(-50%);
      border: none;
      background: transparent;
      color: rgba(255,255,255,0.75);
      cursor: pointer;
      font-size: 18px;
      padding: 6px;
    }

    .lock-help {
      font-size: 13px;
      color: rgba(255,255,255,0.58);
      margin-bottom: 22px;
    }

    .lock-error {
      display: none;
      margin-bottom: 18px;
      padding: 12px 14px;
      border-radius: 14px;
      background: rgba(239,68,68,0.16);
      border: 1px solid rgba(239,68,68,0.28);
      color: #fecaca;
      font-size: 14px;
      line-height: 1.4;
    }

    .lock-actions {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
    }

    .lock-btn {
      border: none;
      cursor: pointer;
      border-radius: 16px;
      padding: 14px 18px;
      font-size: 15px;
      font-weight: 700;
      transition: transform 0.12s ease, opacity 0.12s ease, box-shadow 0.12s ease;
    }

    .lock-btn:hover {
      transform: translateY(-1px);
    }

    .lock-btn:active {
      transform: translateY(0);
    }

    .lock-btn-primary {
      background: linear-gradient(135deg, #3b82f6, #8b5cf6);
      color: #fff;
      box-shadow: 0 14px 32px rgba(59,130,246,0.28);
      flex: 1;
      min-width: 180px;
    }

    .lock-btn-secondary {
      background: rgba(255,255,255,0.08);
      color: rgba(255,255,255,0.88);
      border: 1px solid rgba(255,255,255,0.14);
    }

    .lock-footer {
      margin-top: 22px;
      font-size: 12px;
      color: rgba(255,255,255,0.42);
      text-align: center;
    }

    @media (max-width: 640px) {
      .lock-card {
        padding: 24px 18px;
        border-radius: 20px;
      }

      .lock-title {
        font-size: 26px;
      }

      .lock-actions {
        flex-direction: column;
      }

      .lock-btn-primary,
      .lock-btn-secondary {
        width: 100%;
      }
    }
  `;
  document.head.appendChild(style);

  // =========================================================
  // HTML DE LA PAGE D’ACCÈS
  // =========================================================

  const wrapper = document.createElement("div");
  wrapper.className = "lock-screen";
  wrapper.innerHTML = `
    <div class="lock-card">
      <div class="lock-badge">🔐 Zone protégée</div>
      <h1 class="lock-title">${conf.titre}</h1>
      <div class="lock-subtitle">${conf.sousTitre}</div>
      <div class="lock-message">${conf.message}</div>

      <div class="lock-error" id="lockError">
        ⛔ Code incorrect. Vérifie ton saisie et réessaie.
      </div>

      <label class="lock-label" for="accessCode">Code d’accès</label>

      <div class="lock-input-wrap">
        <input
          id="accessCode"
          class="lock-input"
          type="password"
          placeholder="Saisis ton code ici"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
        />
        <button class="toggle-btn" id="toggleVisibility" type="button" aria-label="Afficher ou masquer le code">
          👁️
        </button>
      </div>

      <div class="lock-help">
        Les différences entre majuscules et minuscules sont ignorées.
      </div>

      <div class="lock-actions">
        <button class="lock-btn lock-btn-primary" id="submitAccess" type="button">
          ${conf.bouton}
        </button>
        <button class="lock-btn lock-btn-secondary" id="goBack" type="button">
          Retour accueil
        </button>
      </div>

      <div class="lock-footer">
        Accès protégé • session mémorisée pendant 1 heure
      </div>
    </div>
  `;

  document.body.appendChild(wrapper);

  const input = document.getElementById("accessCode");
  const errorBox = document.getElementById("lockError");
  const submitBtn = document.getElementById("submitAccess");
  const backBtn = document.getElementById("goBack");
  const toggleBtn = document.getElementById("toggleVisibility");

  input.focus();

  // =========================================================
  // FONCTIONS
  // =========================================================

  function afficherErreur(message) {
    errorBox.textContent = message;
    errorBox.style.display = "block";
  }

  function masquerErreur() {
    errorBox.style.display = "none";
  }

  function ouvrirPage() {
    localStorage.setItem(
      storageKey,
      JSON.stringify({ expire: Date.now() + DUREE_VALIDITE_MS })
    );

    document.body.innerHTML = contenuOriginal;
    document.documentElement.style.background = "";
    document.body.style.background = "";
    document.body.style.margin = "";
    document.body.style.fontFamily = "";
  }

  function verifierCode() {
    masquerErreur();

    const saisie = normaliser(input.value);

    if (!saisie) {
      afficherErreur("⛔ Merci de saisir le code d’accès.");
      input.focus();
      return;
    }

    if (saisie !== codeAttendu) {
      afficherErreur("⛔ Code incorrect. Les espaces sont ignorés, et les majuscules/minuscules n’ont pas d’importance.");
      input.focus();
      input.select();
      return;
    }

    ouvrirPage();
  }

  // =========================================================
  // ÉVÉNEMENTS
  // =========================================================

  submitBtn.addEventListener("click", verifierCode);

  input.addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      verifierCode();
    }
  });

  input.addEventListener("input", masquerErreur);

  backBtn.addEventListener("click", function () {
    window.location.href = "index.html";
  });

  toggleBtn.addEventListener("click", function () {
    const isPassword = input.getAttribute("type") === "password";
    input.setAttribute("type", isPassword ? "text" : "password");
    toggleBtn.textContent = isPassword ? "🙈" : "👁️";
    input.focus();
  });
})();
