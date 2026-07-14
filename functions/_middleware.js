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
export const onRequest = async (context) => {
  const url = new URL(context.request.url);

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
