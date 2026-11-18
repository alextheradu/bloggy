// @ts-check
import { defineConfig, envField } from 'astro/config';
import node from '@astrojs/node';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

// Served at https://alexradu.co/blog behind Traefik with Strip Path OFF,
// so the app itself owns the /blog prefix. Every internal URL goes through
// `u()` in src/lib/url.ts, which prefixes this base.
export default defineConfig({
  site: process.env.PUBLIC_ORIGIN || 'http://localhost:4321',
  base: '/blog',
  trailingSlash: 'ignore',
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  integrations: [react()],
  // Cloudflare (Flexible SSL) -> port 80 -> Traefik -> container means the
  // app sees http:// while browsers are on https://, so Astro's built-in
  // origin check would 403 every POST. We do our own check against
  // PUBLIC_ORIGIN in src/middleware.ts instead.
  security: { checkOrigin: false },
  server: { port: Number(process.env.PORT) || 4321, host: true },
  env: {
    // Read at runtime (process.env) by the node adapter, never inlined at build.
    schema: {
      // access 'secret' = read from process.env at RUNTIME. ('public' server vars get
      // inlined at build time, which would bake localhost into the Docker image.)
      PUBLIC_ORIGIN: envField.string({ context: 'server', access: 'secret', default: 'http://localhost:4321' }),
      DATABASE_URL: envField.string({ context: 'server', access: 'secret', default: 'postgres://blog:blog@localhost:5442/blog' }),
      HCA_CLIENT_ID: envField.string({ context: 'server', access: 'secret', optional: true }),
      HCA_CLIENT_SECRET: envField.string({ context: 'server', access: 'secret', optional: true }),
      GITHUB_CLIENT_ID: envField.string({ context: 'server', access: 'secret', optional: true }),
      GITHUB_CLIENT_SECRET: envField.string({ context: 'server', access: 'secret', optional: true }),
      ADMIN_HCA_IDS: envField.string({ context: 'server', access: 'secret', default: '' }),
      ADMIN_GITHUB_IDS: envField.string({ context: 'server', access: 'secret', default: '' }),
      S3_ENDPOINT: envField.string({ context: 'server', access: 'secret', default: 'http://localhost:9040' }),
      S3_REGION: envField.string({ context: 'server', access: 'secret', default: 'us-east-1' }),
      S3_BUCKET: envField.string({ context: 'server', access: 'secret', default: 'blog' }),
      S3_ACCESS_KEY: envField.string({ context: 'server', access: 'secret', default: '' }),
      S3_SECRET_KEY: envField.string({ context: 'server', access: 'secret', default: '' }),
      CACHET_URL: envField.string({ context: 'server', access: 'secret', default: 'https://cachet.hackclub.com' }),
    },
  },
  vite: {
    plugins: [tailwindcss()],
    server: { allowedHosts: true },
    preview: { allowedHosts: true },
  },
});
