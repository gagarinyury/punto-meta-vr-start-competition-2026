// punto.example.com -> the Cloud Run service (DEPLOY.md). A Cloudflare Worker on the route
// punto.example.com/*: Cloudflare's own *.example.com certificate covers the name, so it never shows
// up in the public certificate logs, and Cloud Run gets the Host it expects (its own address).
//
// It adds two headers the service trusts only from here:
//   x-punto-edge     the shared secret (PUNTO_EDGE_SECRET on the service): without it the service
//                    answers 403, so its run.app address is useless to anyone who finds it
//   x-punto-visitor  the visitor's address: a request a Worker makes reaches Cloud Run from
//                    Cloudflare's address, and every visitor would count as one
// Bindings: ORIGIN (plain text, e.g. punto-xxxx.europe-west1.run.app), EDGE_SECRET (secret).
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    // punto.example.com/ru: the Russian voice (?lang=ru, src/intro-lines.ts); the rest of the address is kept (?key=...)
    if (url.pathname === '/ru' || url.pathname === '/ru/') {
      url.pathname = '/';
      url.searchParams.set('lang', 'ru');
      return Response.redirect(url.toString(), 302);
    }
    url.protocol = 'https:';
    url.hostname = env.ORIGIN;
    url.port = '';
    const headers = new Headers(request.headers);
    headers.set('x-punto-edge', env.EDGE_SECRET);
    headers.set('x-punto-visitor', request.headers.get('cf-connecting-ip') ?? '');
    return fetch(url, {
      method: request.method,
      headers,
      body: request.body,
      redirect: 'manual',
    });
  },
};
