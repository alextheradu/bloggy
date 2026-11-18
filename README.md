# alexradu.co/blog

My personal blog, built with Astro and Postgres, with custom emoji from the Hack Club Slack. Read it at [alexradu.co/blog](https://alexradu.co/blog) or follow along via [RSS](https://alexradu.co/blog/rss.xml).

## Run it locally

You'll need Node.js 22.12 or newer and Docker.

```sh
cp .env.example .env
docker compose -f docker-compose.dev.yml up -d
npm install
npm run dev
```

Open [localhost:4321/blog](http://localhost:4321/blog). If you want to sign in locally, see the OAuth settings in [.env.example](./.env.example).

For deployment, see [DEPLOY.md](./DEPLOY.md).
