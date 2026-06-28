import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));

/* Strict, network-free CSP for the PACKAGED build only. In dev, Vite serves
 * over http://localhost with HMR (websocket + eval-style module injection),
 * which a strict `script-src 'self'` would block — so we inject the meta tag
 * at build time only. The packaged renderer is static JS loaded via file://,
 * which satisfies 'self'. */
const PROD_CSP =
  "default-src 'none'; " +
  "script-src 'self'; " +
  "style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data:; " +
  "font-src 'self'; " +
  "connect-src 'self';";

function injectProdCsp() {
  return {
    name: 'inject-prod-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        '</title>',
        `</title>\n  <meta http-equiv="Content-Security-Policy" content="${PROD_CSP}" />`
      );
    }
  };
}

export default defineConfig({
  root: path.resolve(root, 'src/renderer-src'),
  base: './',                       // relative asset URLs — required for file://
  plugins: [react(), injectProdCsp()],
  server: {
    host: '127.0.0.1',              // bind IPv4 so wait-on / Electron connect reliably
    port: 5173,
    strictPort: true,
    // Allow importing the pure core modules that live in src/ (outside the
    // renderer root) during dev.
    fs: { allow: [root] }
  },
  build: {
    outDir: path.resolve(root, 'src/renderer-dist'),
    emptyOutDir: true
  }
});
