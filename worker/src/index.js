import { loadConfig } from './config.js';
import { corsHeadersForRequest, CORS_METHOD_HEADERS, isOriginAllowed } from './cors.js';
import { handleAction } from './handlers.js';

export default {
  /** @param {Request} request @param {object} env */
  async fetch(request, env) {
    const config = loadConfig(env);
    const corsHeaders = corsHeadersForRequest(request, config);

    if (request.method === 'OPTIONS') {
      if (!isOriginAllowed(request, config)) {
        return new Response(null, { status: 403 });
      }
      return new Response(null, {
        status: 204,
        headers: { ...CORS_METHOD_HEADERS, ...corsHeaders },
      });
    }

    const url = new URL(request.url);
    const action = url.searchParams.get('action') || '';

    let body = {};
    if (request.method === 'POST') {
      const text = await request.text();
      if (text) {
        try {
          body = JSON.parse(text);
        } catch {
          return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON body' }), {
            status: 400,
            headers: {
              'Content-Type': 'application/json',
              ...CORS_METHOD_HEADERS,
              ...corsHeaders,
            },
          });
        }
      }
    }

    const clientIp =
      request.headers.get('CF-Connecting-IP') ||
      request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
      'unknown';

    const response = await handleAction(action, request.method, body, config, env.DB, {
      corsHeaders,
      clientIp,
    });

    const headers = new Headers(response.headers);
    for (const [k, v] of Object.entries(CORS_METHOD_HEADERS)) headers.set(k, v);
    for (const [k, v] of Object.entries(corsHeaders)) headers.set(k, v);
    return new Response(response.body, { status: response.status, headers });
  },
};
