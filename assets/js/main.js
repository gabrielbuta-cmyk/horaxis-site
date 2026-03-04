/**
 * HORAXIS ENTERPRISE MAIN ENGINE
 * Purpose: Secure Consent Management & Industrial UI Persistence
 */

(function () {
  'use strict';

  const CONSENT_KEY = "horaxis_consent"; // "granted" | "denied"
  
  /**
   * 1. Consent Management (GDPR/Enterprise Standard)
   */
  function updateAnalyticsConsent(status) {
    if (typeof window.gtag === "function") {
      window.gtag("consent", "update", {
        'analytics_storage': status === 'granted' ? 'granted' : 'denied',
        'ad_storage': 'denied' // Enterprise sites should default-deny ad tracking
      });
    }
  }

  function handleConsent(choice) {
    localStorage.setItem(CONSENT_KEY, choice);
    updateAnalyticsConsent(choice);
    
    const banner = document.getElementById('cookie-banner');
    if (banner) {
      banner.style.opacity = '0';
      setTimeout(() => banner.remove(), 400);
    }
  }

  /**
   * 2. Enterprise UI: Cookie Banner Injection
   * Using Industrial Navy/Orange theme matching global CSS
   */
  function injectBanner() {
    if (localStorage.getItem(CONSENT_KEY)) return;

    const banner = document.createElement('div');
    banner.id = 'cookie-banner';
    banner.style.cssText = `
      position: fixed; bottom: 0; left: 0; right: 0; 
      background: #0F172A; color: #F8FAFC; 
      padding: 20px; text-align: center; z-index: 10000;
      border-top: 2px solid #EA580C; transition: opacity 0.4s ease;
      font-family: 'Inter', sans-serif; font-size: 14px;
    `;

    banner.innerHTML = `
      <div style="max-width: 1200px; margin: 0 auto; display: flex; flex-direction: column; align-items: center; gap: 15px;">
        <p style="margin: 0; opacity: 0.8;">
          Horaxis uses essential technical cookies for security and anonymized telemetry to improve our enterprise AI models. 
          See our <a href="privacy.html" style="color: #EA580C; text-decoration: underline;">Privacy Policy</a>.
        </p>
        <div style="display: flex; gap: 10px;">
          <button id="accept-c" style="background: #EA580C; color: white; border: none; padding: 10px 24px; cursor: pointer; font-weight: 700; border-radius: 2px; text-transform: uppercase; font-size: 12px;">Accept All</button>
          <button id="deny-c" style="background: transparent; color: #94A3B8; border: 1px solid #334155; padding: 10px 24px; cursor: pointer; font-weight: 700; border-radius: 2px; text-transform: uppercase; font-size: 12px;">Reject Optional</button>
        </div>
      </div>
    `;

    document.body.appendChild(banner);

    document.getElementById('accept-c').onclick = () => handleConsent('granted');
    document.getElementById('deny-c').onclick = () => handleConsent('denied');
  }

  /**
   * 3. Industrial Utility: Smooth Anchor Scrolling
   * Crucial for long technical 'Security' or 'Product' pages
   */
  function initSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
      anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
          window.scrollTo({
            top: target.offsetTop - 80, // Offset for sticky nav
            behavior: 'smooth'
          });
        }
      });
    });
  }

  /**
   * 4. Lifecycle Initialization
   */
  function init() {
    injectBanner();
    initSmoothScroll();
    
    // Check for existing consent and apply to GA
    const existing = localStorage.getItem(CONSENT_KEY);
    if (existing) updateAnalyticsConsent(existing);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

})();