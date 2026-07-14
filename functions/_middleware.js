/**
 * Global Pages middleware.
 *
 * Purpose: host-based routing so that the ROOT of riskguard.horaxis.com
 * serves /riskguard.html instead of the shared /index.html.
 *
 * Every other path on the subdomain (contact.html, privacy.html, etc.)
 * passes through unchanged so the shared static site keeps working.
 *
 * URL bar stays on riskguard.horaxis.com because this is a rewrite,
 * not a redirect (we fetch the static asset and return it in-place).
 */
export const onRequest = async (context) => {
  const url = new URL(context.request.url);

  if (url.hostname === 'riskguard.horaxis.com' && url.pathname === '/') {
    const rewriteUrl = new URL(url);
    rewriteUrl.pathname = '/riskguard.html';
    return await context.env.ASSETS.fetch(new Request(rewriteUrl, context.request));
  }

  return context.next();
};
