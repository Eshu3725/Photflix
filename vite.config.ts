import { defineConfig, type Connect, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { Readable } from 'node:stream';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';

/**
 * Google Photos Picker hands back image URLs that need an Authorization header
 * and may not allow cross-origin reads from a browser. This forwards those
 * downloads through the local dev/preview server. It only ever talks to
 * googleusercontent.com.
 */
function googlePhotosProxy(): Plugin {
  const handler: Connect.NextHandleFunction = async (req, res, next) => {
    if (!req.url?.startsWith('/api/gphoto')) return next();
    const raw = new URL(req.url, 'http://localhost').searchParams.get('u') ?? '';
    let target: URL;
    try {
      target = new URL(raw);
    } catch {
      res.statusCode = 400;
      return res.end('Bad url');
    }
    if (target.protocol !== 'https:' || !/(^|\.)googleusercontent\.com$/.test(target.hostname)) {
      res.statusCode = 403;
      return res.end('Host not allowed');
    }
    try {
      const upstream = await fetch(target, {
        headers: { Authorization: req.headers.authorization ?? '' },
      });
      res.statusCode = upstream.status;
      res.setHeader('content-type', upstream.headers.get('content-type') ?? 'application/octet-stream');
      if (!upstream.body) return res.end();
      Readable.fromWeb(upstream.body as unknown as NodeReadableStream).pipe(res);
    } catch {
      res.statusCode = 502;
      res.end('Upstream fetch failed');
    }
  };
  return {
    name: 'photflix-google-photos-proxy',
    configureServer(server) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler);
    },
  };
}

export default defineConfig({
  plugins: [react(), googlePhotosProxy()],
});
