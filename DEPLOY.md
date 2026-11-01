# Deploying hop

hop runs from the same code in two places: **Cloudflare Workers** (D1 + R2) or a **Docker container** (SQLite on a volume). Pick one.

Terms: the **app host** serves the admin app and API (e.g. `hop.example.com`). **Short domains** (e.g. `go.example.com`) only redirect. Both can point at the same deployment; the app host is whatever `APP_HOST` says, every other host is treated as a short domain.

Settings used by both:

| Variable | Required | Meaning |
| --- | --- | --- |
| `APP_HOST` | yes | Host of the admin app, e.g. `hop.example.com` |
| `APP_URL` | Workers: yes. Container: no | Public URL of the app, e.g. `https://hop.example.com` (container default: `https://APP_HOST`) |
| `AUTH_SECRET` | yes | At least 32 random characters: `openssl rand -base64 32`. Changing it signs everyone out |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `SMTP_SECURE` | no | Outgoing email. Can also be set in the app (Settings), which takes precedence |
| `SAFE_BROWSING_KEY` | no | Google Safe Browsing key for destination checks |
| `METRICS_TOKEN` | no | Bearer token protecting `/metrics` |

The first person to open the app host sees the setup page and becomes the admin.

## Cloudflare

Prerequisites: a Cloudflare account, `pnpm install`, and `pnpm exec wrangler login`.

1. **Database and storage**

   ```sh
   pnpm exec wrangler d1 create hop
   pnpm exec wrangler r2 bucket create hop-blobs
   ```

   Put the printed `database_id` in `wrangler.jsonc` (`d1_databases[0].database_id`). Keep `bucket_name` equal to the bucket you created.

2. **Variables**: in `wrangler.jsonc` set `vars.APP_HOST` and `vars.APP_URL` to your real app host (not `app.localhost:5173`).

3. **Secrets**

   ```sh
   pnpm exec wrangler secret put AUTH_SECRET
   # optional: SMTP_PASS, SAFE_BROWSING_KEY, METRICS_TOKEN
   ```

4. **Migrations** (run again after every update that adds a file to `migrations/`):

   ```sh
   pnpm exec wrangler d1 migrations apply DB --remote
   ```

5. **Deploy**

   ```sh
   pnpm build && pnpm exec wrangler deploy
   ```

   The cron trigger (`17 * * * *`, hourly) is declared in `wrangler.jsonc` and is created by the deploy. It runs the periodic jobs (data retention, link checks).

6. **Domains**: the zone of each domain must be on Cloudflare. In the dashboard, Workers & Pages, `hop`, Settings, Domains & Routes: add a **Custom Domain** for the app host and one for every short domain. Cloudflare creates DNS records and certificates. Then add the short domains in the app (Domains).

Geolocation and client IP come from Cloudflare itself; nothing to configure.

## Container (Coolify / Openship / any Docker host)

The image is a single Node 22 process with SQLite in `/data`. Everything that must survive restarts lives there: the database (`hop.db`), uploaded images (`blobs/`) and the GeoIP file (`geoip/`). Migrations run by themselves at startup.

1. **Build the image**: point Coolify / Openship at this repository with the `Dockerfile` build pack, or build by hand:

   ```sh
   docker build -t hop .
   ```

   `docker-compose.yml` is a ready example (one service, one volume). In Coolify choose "Docker Compose" and set the variables below in its environment screen.

2. **Environment**: at least `APP_HOST` and `AUTH_SECRET`. Set `TRUST_PROXY=1` when the container sits behind a reverse proxy (it always does on Coolify / Openship): the client IP then comes from `X-Forwarded-For` and the country and city from Cloudflare's `CF-IPCountry` / `CF-IPCity` headers if present. **Leave it off if the container is reachable directly**, otherwise visitors can fake their IP.

   Other variables: `PORT` (default `3000`), `DATA_DIR` (default `/data`), `GEOIP_DB` (default `/data/geoip/city.mmdb`), plus the table above. The container refuses to start and prints what is missing or wrong.

3. **Volume**: mount a persistent volume on `/data`. Without it everything is lost on redeploy.

4. **Domains and proxy**: point the app host **and every short domain** at the same container (port `3000`) in the proxy. In Coolify list them comma separated in the service's domains field (`https://hop.example.com,https://go.example.com`). Each domain needs DNS to the server and gets its own certificate. The proxy must pass the original `Host` header (the default); hop uses it to tell the app from the short domains. Then add the short domains in the app (Domains).

5. **Health check**: the image has one (`/healthz` on the app host). If your platform asks for a path, use `/healthz`.

6. **GeoIP** (optional, country and city statistics). Without it, clicks have no location unless the proxy is Cloudflare with `TRUST_PROXY=1`. Download the free DB-IP City Lite database (MaxMind format, CC BY 4.0: mention [DB-IP.com](https://db-ip.com) somewhere visible if you publish statistics):

   ```sh
   docker exec <container> node scripts/download-geoip.mjs
   ```

   Then restart the container. It is a monthly file: repeat now and then (a cron job on the host works). Any MaxMind-format City `.mmdb` (e.g. GeoLite2-City) works too: put it in `/data/geoip/city.mmdb` or set `GEOIP_DB`.

7. **Backups**: everything is in `/data`. For a consistent copy of the database while hop runs, use SQLite's own backup, then copy the file out:

   ```sh
   docker exec <container> node -e "const D=require('better-sqlite3');new D('/data/hop.db').backup('/data/backup.db').then(()=>process.exit())"
   docker cp <container>:/data/backup.db ./hop-$(date +%F).db
   ```

   Or snapshot the whole volume (Coolify can schedule volume backups to S3). Also copy `/data/blobs`. Restore by putting the files back into an empty volume before starting.

8. **Updates**: redeploy the new image; the database is migrated on start. Take a backup first. Stop with `SIGTERM` (Docker default): hop finishes in-flight work, then exits.

### Notes

- Outgoing requests (page title lookup, link checks) refuse private, loopback, link-local and cloud-metadata addresses, and re-check every redirect, so a link to `http://169.254.169.254/` cannot be used to probe the host network.
- Periodic jobs run on an hourly timer inside the process.
- Running two replicas on the same volume is not supported (single SQLite writer, in-process timers).

## Running the tests on both runtimes

```sh
HOP_TEST_PORT=8806 pnpm e2e        # Workers (local D1 in .test-state/)
HOP_TEST_PORT=8806 pnpm e2e:node   # Node + SQLite (fresh .test-state-node/ each run)
```
