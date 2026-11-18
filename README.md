# alexradu.co/blog

My personal blog, served at **https://alexradu.co/blog**. Same look as the [portfolio](https://github.com/alextheradu/portfolio-v3).

- **Astro 7** SSR (`@astrojs/node` standalone) with React islands, `base: '/blog'`
- **Postgres + Drizzle**; migrations run on start
- **Auth**: Hack Club Auth + GitHub (`arctic`), hashed DB sessions, admin allowlist via env
- **Editor**: TipTap v3, Slack-canvas style (toolbar, `/` blocks, `:` emoji autocomplete, `:sob:` auto-convert, image paste/drop/upload, draft autosave). JSON is the source of truth; HTML is rendered server-side on save.
- **Emoji**: ~66k Hack Club Slack customs from [Cachet](https://cachet.hackclub.com) (cached server-side, proxied via `/blog/emoji/<name>`, so the browser never hits slack-edge.com) plus unicode from emojibase with Slack shortcodes
- **Reactions** (login required), **⌘K palette**, **RSS** (`/blog/rss.xml`) + **JSON Feed** (`/blog/feed.json`), OG tags
- **S3 storage** (RustFS locally) for uploads and the emoji image cache
- UI: hand-written CSS from the portfolio, plus shadcn/ui and React Bits inside the islands

## local dev

Needs Node ≥ 22.12 and Docker.

```sh
cp .env.example .env                                # fill GITHUB_* / HCA_* to log in
docker compose -f docker-compose.dev.yml up -d      # postgres :5442, rustfs :9040 (console :9041)
npm install
npm run dev                                         # migrates, then http://localhost:4321/blog
```

- To log in locally, create a GitHub OAuth app with callback `http://localhost:4321/blog/auth/callback/github` and put your numeric GitHub id in `ADMIN_GITHUB_IDS` to get the admin menu.
- Port 4321 taken? Run `PORT=4329 PUBLIC_ORIGIN=http://localhost:4329 npm run dev` (and use that origin in the OAuth callback).
- Astro 7's dev server runs in the background: `npx astro dev logs`, `npx astro dev stop`.
- The first `/api/emojis` call after a cold start pulls the ~15 MB Cachet list (a few seconds). After that it's in memory and snapshotted to S3.

## scripts

| | |
|---|---|
| `npm run dev` | migrate + dev server |
| `npm run build` | `astro check` + production build |
| `npm run db:generate` | new SQL migration from `src/lib/db/schema.ts` → `drizzle/` |
| `npm run db:migrate` | apply migrations |
| `docker build -t blog .` | production image (runs migrations, then `dist/server/entry.mjs`; healthcheck `/blog/api/health`) |

## layout

```
src/
  pages/            routes (all under /blog): index, [slug], login, admin/, auth/, api/, emoji/, media/, avatar/, rss.xml, feed.json
  layouts/Base.astro  head/OG, header, footer, login dialog, ⌘K island
  components/
    editor/         TipTap editor + slash/emoji suggestion + input rule
    react/          Reactions, EmojiPicker, CommandPalette, …
    ui/             shadcn/ui (themed to portfolio tokens in styles/tailwind.css)
    reactbits/      React Bits (BlurText, CountUp, ClickSpark)
  lib/              db, auth, s3, emoji (cachet + unicode), render, posts, reactions
  styles/           global.css (portfolio tokens) imported into tailwind's base layer
drizzle/            SQL migrations
scripts/migrate.mjs
```

Deploying: see **[DEPLOY.md](./DEPLOY.md)**.
