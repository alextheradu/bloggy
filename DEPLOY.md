# deploying to dokploy

Target: `https://alexradu.co/blog`, next to the existing portfolio on the same host.

```
browser ──https──▶ cloudflare (flexible ssl) ──http:80──▶ router ──▶ traefik (dokploy)
                                                                   ├─ Host(alexradu.co)                       → portfolio
                                                                   └─ Host(alexradu.co) && PathPrefix(/blog)  → blog :4321
blog ──▶ postgres (dokploy database, internal)
     ──▶ rustfs   (dokploy application, internal S3 API :9000)
```

Three services, all on Dokploy's internal network. Only the blog gets a domain.

> **Why things are set up this way**
> - The app owns the `/blog` prefix itself (`base: '/blog'`), so **Strip Path stays OFF**.
> - Cloudflare terminates TLS and talks plain http to the origin, so the container only ever sees `http://`. `PUBLIC_ORIGIN=https://alexradu.co` tells the app what browsers actually use: OAuth redirect URIs, RSS/OG absolute URLs and the `Secure` cookie flag all come from it. It's read at **runtime**, so the same image works anywhere.
> - Astro's built-in `checkOrigin` would 403 every POST because of that http/https mismatch. It's disabled, and `src/middleware.ts` checks `Origin` against `PUBLIC_ORIGIN` on every mutating request instead.
> - Traefik orders routers by rule length by default, so `Host && PathPrefix(/blog)` automatically beats the portfolio's host-only rule. The portfolio needs no changes.

---

## 1. postgres

1. Dokploy → your project → **Create Service → Database → PostgreSQL**.
   - name: `blog-db`, database: `blog`, user: `blog`, password: generate one.
   - image: `postgres:17` (the default is fine).
2. **Deploy**.
3. Open the database → **Connection** → copy the **Internal Connection URL**. It looks like
   `postgresql://blog:<password>@blog-db-xxxxxx:5432/blog`
   You'll paste it as `DATABASE_URL` in step 3.
4. Don't expose an external port. The blog reaches it over the internal network.

Migrations run automatically every time the blog container starts (`scripts/migrate.mjs`, idempotent, and it waits up to 30 s for postgres).

## 2. object storage (RustFS)

The official `minio/minio` image is gone (project archived 2026), so this uses **RustFS**, an S3-compatible Apache-2.0 server. The app only speaks the generic S3 API, so swapping to Garage/MinIO/R2 later is just a change of env vars.

1. **Create Service → Application**, name `blog-s3`.
2. **Provider → Docker**: image `rustfs/rustfs:1.0.6` (pinned; Dokploy's one-click template uses `:latest`).
3. **Advanced → Run command / args**: `/data`
4. **Environment**:
   ```env
   RUSTFS_ACCESS_KEY=<openssl rand -base64 24>
   RUSTFS_SECRET_KEY=<openssl rand -base64 24>
   RUSTFS_ADDRESS=:9000
   RUSTFS_CONSOLE_ADDRESS=:9001
   RUSTFS_CONSOLE_ENABLE=true
   ```
   Never leave the default `rustfsadmin` creds.
5. **Advanced → Volumes**: add a **volume mount**, name `blog-s3-data`, mount path `/data`.
   (Use a named volume. A host bind mount would need `chown -R 10001:10001` first, because the container runs as uid 10001.)
6. **Deploy**. The internal hostname is the app's **App Name** shown in Dokploy (e.g. `blog-s3-abc123`), so the blog uses
   `S3_ENDPOINT=http://blog-s3-abc123:9000`.
7. **No domain for port 9000.** The browser never talks to the bucket: uploads stream through `/blog/media/*` and emoji through `/blog/emoji/*`.
   - Optional: to use the web console, add a domain like `s3-console.alexradu.co` → container port **9001**, ideally behind Cloudflare Access. Otherwise leave it unexposed.

**Bucket + keys.** Nothing to do. The app creates the bucket (`S3_BUCKET`, default `blog`) on its first write. Simplest setup: use the RustFS root creds as `S3_ACCESS_KEY` / `S3_SECRET_KEY`. Stricter: in the console (port 9001) create the bucket and an access key scoped to it, and use that instead.

Manual alternative (verified against RustFS), from any machine on the Dokploy network:
```sh
docker run --rm --network dokploy-network \
  -e AWS_ACCESS_KEY_ID=… -e AWS_SECRET_ACCESS_KEY=… -e AWS_DEFAULT_REGION=us-east-1 \
  amazon/aws-cli --endpoint-url http://blog-s3-abc123:9000 s3 mb s3://blog
```
Health: `GET http://blog-s3-abc123:9000/health` → 200.

## 3. the blog

1. **Create Service → Application**, name `blog`.
2. **Provider → GitHub**: your blog repo, branch `main`. Turn on autodeploy if you want deploy-on-push.
3. **Build type → Dockerfile** (path `Dockerfile`, context `.`).
4. **Environment** (paste, then fill in):
   ```env
   PUBLIC_ORIGIN=https://alexradu.co
   PORT=4321
   DATABASE_URL=postgresql://blog:<password>@blog-db-xxxxxx:5432/blog

   HCA_CLIENT_ID=
   HCA_CLIENT_SECRET=
   GITHUB_CLIENT_ID=
   GITHUB_CLIENT_SECRET=
   ADMIN_HCA_IDS=ident!xxxxxx
   ADMIN_GITHUB_IDS=12345678

   S3_ENDPOINT=http://blog-s3-abc123:9000
   S3_REGION=us-east-1
   S3_BUCKET=blog
   S3_ACCESS_KEY=<rustfs access key>
   S3_SECRET_KEY=<rustfs secret key>
   ```
5. **Domains → Add domain**:
   | field | value |
   |---|---|
   | host | `alexradu.co` |
   | path | `/blog` |
   | **strip path** | **off** |
   | container port | `4321` |
   | https | **off** (Cloudflare terminates TLS; Flexible mode reaches the origin on :80) |
   | certificate | none |
6. **Deploy**. The image has a `HEALTHCHECK` on `/blog/api/health` (checks postgres), so Dokploy/Swarm only routes to it once it's up. Check the logs for `[migrate] up to date`, then `Server listening`.
7. Smoke test:
   ```sh
   curl -s https://alexradu.co/blog/api/health          # {"ok":true}
   curl -sI https://alexradu.co/ | head -1              # portfolio still answers
   curl -s https://alexradu.co/blog/rss.xml | grep -m1 '<link>'   # https://alexradu.co/blog/
   ```

**Cloudflare**: keep SSL/TLS on Flexible (as now). If you ever switch to Full, nothing in the app changes, because `PUBLIC_ORIGIN` already says https. Cache rules aren't required: responses set their own `Cache-Control` (emoji 7 d, media 1 y immutable, HTML not cached).

### multi-arch image (x86 server + Raspberry Pi swarm nodes)

Dokploy's own Dockerfile build is single-arch (whatever the build server is). For a swarm that schedules the blog on arm64 Pis, push one multi-arch image to a registry and point the app at it.

The Dockerfile compiles **once**, natively on the x86 host: `deps`, `build` and `prod-deps` are pinned to `$BUILDPLATFORM`. `prod-deps` cross-installs the target arch's native packages (`npm ci --cpu=arm64 …`), and the per-arch `runtime` stage only `COPY`s. No QEMU/binfmt needed.

```sh
# once: multi-platform output needs a docker-container builder
docker buildx create --name multiarch --driver docker-container --use

docker buildx build --platform linux/amd64,linux/arm64 \
  -t <registry>/alexradu-blog:latest --push .
```

Then in Dokploy, set the blog's **Provider → Docker** to `<registry>/alexradu-blog:latest` (plus registry creds if it's private). Each swarm node pulls the matching arch from the manifest list. 32-bit Pi OS: add `linux/arm/v7` to `--platform`.

## 4. oauth apps + finding your admin ids

### GitHub
1. https://github.com/settings/developers → **OAuth Apps → New OAuth App**.
   - Homepage URL: `https://alexradu.co/blog`
   - Authorization callback URL: `https://alexradu.co/blog/auth/callback/github`
2. Copy the Client ID, generate a client secret, and paste both into the blog env.
3. Your numeric id: `curl -s https://api.github.com/users/<your-username> | grep '"id"'` → `ADMIN_GITHUB_IDS`.
4. For local dev, make a **second** OAuth app with callback `http://localhost:4321/blog/auth/callback/github`. GitHub allows only one callback URL per app.

### Hack Club Auth
1. https://auth.hackclub.com/developer/apps → **new app**.
   - Redirect URI: `https://alexradu.co/blog/auth/callback/hca` (add `http://localhost:4321/blog/auth/callback/hca` too for dev if it allows several).
   - Scopes: `openid profile email name slack_id` (the community-app set).
2. Paste the client id and secret into the env. The token exchange uses `client_secret_post` with PKCE.
3. Your HCA id (looks like `ident!AbC123`): the easiest way is to log in to the blog once with Hack Club, then in Dokploy → `blog-db` → **Terminal**:
   ```sh
   psql -U blog -d blog -c "select provider, provider_user_id, name from users;"
   ```
   Put that id in `ADMIN_HCA_IDS` and redeploy (env changes need a restart). The same query also shows your GitHub id.

Admin = any user whose provider id is in either allowlist. Readers can use either provider.

## 5. backups

**Postgres** (posts, users, reactions are the important data):
1. Dokploy → **Settings → Destinations → add an S3 destination**, somewhere *off this box* (Cloudflare R2 / Backblaze B2 are cheap).
2. `blog-db` → **Backups → Create backup**: that destination, schedule `0 4 * * *`, keep ~14.
3. Restore test once: Dokploy's backup list → **Restore**, or `pg_restore`/`psql` the dump into a scratch database.

**Bucket**: only `uploads/` is irreplaceable. `emoji/`, `avatar/` and `cache/` are re-fetched on demand.
- Easiest: Dokploy **Volume Backups** on the `blog-s3-data` volume to the same destination, nightly.
- Or a scheduled job (Dokploy → Schedules, or host cron) that mirrors just the uploads to the off-site bucket:
  ```sh
  docker run --rm --network dokploy-network \
    -e RCLONE_CONFIG_SRC_TYPE=s3 -e RCLONE_CONFIG_SRC_PROVIDER=Other \
    -e RCLONE_CONFIG_SRC_ENDPOINT=http://blog-s3-abc123:9000 \
    -e RCLONE_CONFIG_SRC_ACCESS_KEY_ID=… -e RCLONE_CONFIG_SRC_SECRET_ACCESS_KEY=… \
    -e RCLONE_CONFIG_DST_TYPE=s3 -e RCLONE_CONFIG_DST_PROVIDER=Cloudflare \
    -e RCLONE_CONFIG_DST_ENDPOINT=https://<account>.r2.cloudflarestorage.com \
    -e RCLONE_CONFIG_DST_ACCESS_KEY_ID=… -e RCLONE_CONFIG_DST_SECRET_ACCESS_KEY=… \
    rclone/rclone sync src:blog/uploads dst:blog-backup/uploads
  ```

## troubleshooting

| symptom | cause |
|---|---|
| portfolio shows a 404 for `/blog/...` | blog domain missing the `/blog` path, or the blog container is unhealthy (check logs) |
| blog pages render without `/blog` in links / 404 on assets | Strip Path is **on**: turn it off |
| `cross-origin request blocked` (403) on reactions/saves | `PUBLIC_ORIGIN` isn't exactly `https://alexradu.co` (no trailing slash, no `/blog`) |
| OAuth "redirect_uri mismatch" | callback URL in the provider ≠ `PUBLIC_ORIGIN` + `/blog/auth/callback/<provider>` |
| logged in but no admin menu | id not in `ADMIN_*_IDS`, or you didn't redeploy after changing env |
| custom emoji broken | the container can't reach `cachet.hackclub.com` / `emoji.slack-edge.com` outbound, or S3 creds are wrong (check logs for `[proxy]` / `[cachet]`) |
