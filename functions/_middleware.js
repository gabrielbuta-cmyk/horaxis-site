/**
 * Global Pages middleware — host-based routing.
 *
 * Root of riskguard.horaxis.com serves /riskguard.html content, but the
 * URL bar stays at "/".
 *
 * Gotcha this handles: Cloudflare Pages auto-redirects /file.html → /file
 * (pretty-URL canonicalization). Without intercepting that, the browser
 * follows the 301 and ends up with /riskguard in the URL bar. We follow
 * any internal 301s ourselves and return the final content with a 200,
 * so the browser never sees a redirect.
 *
 * Every other path passes through context.next().
 */
import { getSession, notFound } from "../lib/axis.js";

// The Axis page answers 404 unless the visitor has a live session from /support/start
// (2026-10-01). Every spelling of the path Pages would serve is covered.
const AXIS_PAGE_PATHS = new Set(["/support", "/support/", "/support.html"]);

export const onRequest = async (context) => {
  const url = new URL(context.request.url);

  // Shared server code (gate logic, prompts, knowledge base) is bundled into the
  // functions; the files themselves must never be served as static assets.
  // Same for the functions' source and the repository's own files (README, package
  // manifests), which a static host would otherwise hand out.
  const HIDDEN = ["/lib", "/functions", "/node_modules", "/docs"];
  const HIDDEN_FILES = new Set(["/README.md", "/package.json", "/package-lock.json"]);
  if (HIDDEN.some((d) => url.pathname === d || url.pathname.startsWith(d + "/")) || HIDDEN_FILES.has(url.pathname)) {
    return notFound(context.env, context.request);
  }

  if (AXIS_PAGE_PATHS.has(url.pathname)) {
    const s = await getSession(context.request, context.env);
    if (!s) return notFound(context.env, context.request);
    const res = await context.next();
    const out = new Response(res.body, res);
    out.headers.set("Cache-Control", "no-store");
    out.headers.set("X-Robots-Tag", "noindex");
    out.headers.set("Referrer-Policy", "no-referrer");
    return out;
  }

  if (url.hostname === 'riskguard.horaxis.com' && url.pathname === '/') {
    const target = new URL('/riskguard.html', url).toString();
    const req = new Request(target, {
      method: 'GET',
      headers: context.request.headers,
      redirect: 'manual',
    });

    let response = await context.env.ASSETS.fetch(req);

    // Follow Cloudflare Pages' internal .html → pretty-URL redirect ourselves.
    let hops = 0;
    while (response.status >= 300 && response.status < 400 && hops < 3) {
      const location = response.headers.get('location');
      if (!location) break;
      const next = new URL(location, url).toString();
      response = await context.env.ASSETS.fetch(next, { redirect: 'manual' });
      hops++;
    }

    // Return the final content with 200, stripping any lingering Location
    // header so the browser doesn't try to redirect.
    const outHeaders = new Headers(response.headers);
    outHeaders.delete('location');
    return new Response(response.body, {
      status: 200,
      statusText: 'OK',
      headers: outHeaders,
    });
  }

  return context.next();
};
