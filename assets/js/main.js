// assets/js/main.js
(function () {
  // ---- Cookie consent + GA gating (GDPR-safe) ----

  var KEY = "cookieConsent"; // "accepted" | "rejected" | null

  function storageGet(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }
  function storageSet(key, val) {
    try { localStorage.setItem(key, val); } catch (e) {}
  }

  function grantAnalytics() {
    // Consent update for GA v4
    if (typeof window.gtag === "function") {
      window.gtag("consent", "update", { analytics_storage: "granted" });
    }
    // Your pages define window.configureGA() which calls gtag('config', ...)
    if (typeof window.configureGA === "function") {
      window.configureGA();
    }
  }

  function denyAnalytics() {
    if (typeof window.gtag === "function") {
      window.gtag("consent", "update", { analytics_storage: "denied" });
    }
  }

  function ensureBannerStyles() {
    if (document.getElementById("cookie-banner-style")) return;

    var style = document.createElement("style");
    style.id = "cookie-banner-style";
    style.textContent =
      "#cookie-banner{position:fixed;left:0;right:0;bottom:0;" +
      "background:#0f172a;color:#fff;" +
      "padding:14px 14px calc(14px + env(safe-area-inset-bottom));" +
      "text-align:center;z-index:99999;display:none;" +
      "box-shadow:0 -6px 20px rgba(0,0,0,.4)}" +
      "#cookie-banner .cookie-inner{max-width:980px;margin:0 auto;line-height:1.45}" +
      "#cookie-banner .cookie-actions{margin-top:10px;display:flex;justify-content:center;gap:10px;flex-wrap:wrap}" +
      "#cookie-banner button{padding:8px 14px;border-radius:8px;font-weight:700;cursor:pointer}" +
      "#cookie-accept{background:#2563eb;color:#fff;border:none}" +
      "#cookie-reject{background:rgba(255,255,255,.08);color:#fff;border:1px solid rgba(255,255,255,.18)}" +
      "#cookie-banner a{color:#93c5fd;text-decoration:underline}";
    document.head.appendChild(style);
  }

  function ensureBannerHTML() {
    var existing = document.getElementById("cookie-banner");
    if (existing) return existing;

    var banner = document.createElement("div");
    banner.id = "cookie-banner";
    banner.innerHTML =
      '<div class="cookie-inner">' +
        'We use analytics to improve ProcureAI. See ' +
        '<a href="privacy.html">Privacy</a> and <a href="cookies.html">Cookies</a>.' +
        '<div class="cookie-actions">' +
          '<button id="cookie-accept" type="button">Accept</button>' +
          '<button id="cookie-reject" type="button">Reject</button>' +
        "</div>" +
      "</div>";

    document.body.appendChild(banner);
    return banner;
  }

  function initCookieBanner() {
    ensureBannerStyles();
    var banner = ensureBannerHTML();

    var acceptBtn = document.getElementById("cookie-accept");
    var rejectBtn = document.getElementById("cookie-reject");

    var consent = storageGet(KEY);

    if (consent === "accepted") {
      grantAnalytics();
      banner.style.display = "none";
    } else if (consent === "rejected") {
      denyAnalytics();
      banner.style.display = "none";
    } else {
      // Unknown -> show banner, keep denied until user accepts
      denyAnalytics();
      banner.style.display = "block";
    }

    if (acceptBtn) {
      acceptBtn.addEventListener("click", function () {
        storageSet(KEY, "accepted");
        grantAnalytics();
        banner.style.display = "none";
      });
    }

    if (rejectBtn) {
      rejectBtn.addEventListener("click", function () {
        storageSet(KEY, "rejected");
        denyAnalytics();
        banner.style.display = "none";
      });
    }
  }

  // Run after DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initCookieBanner);
  } else {
    initCookieBanner();
  }
})();