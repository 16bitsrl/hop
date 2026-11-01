# Migrating from YOURLS to hop

This guide moves every link, its running click total and the full click history from a YOURLS
installation (tested against the dump format of YOURLS 1.10) into hop, then points the short
domain at hop. Nothing is deleted on the YOURLS side.

## What is imported

| YOURLS | hop |
| --- | --- |
| `yourls_url.keyword` | link ending (slug), exactly as written (case and hyphens kept) |
| `url`, `title` | destination and title |
| `timestamp` | creation date |
| `clicks` | the link's lifetime click counter (it can differ a little from the number of log rows) |
| `yourls_log` rows | one click each, `source = import`: time, referrer, country, device, system and browser (from the user agent), bot flag |
| `ip_address` + `user_agent` | only a daily-salted visitor hash, like live clicks. The IP address is never stored |

Log rows whose short link is not in the dump are counted in the report and not imported. Links whose
keyword uses characters hop does not allow in an ending (anything other than letters, digits, `-` and `_`,
up to 64 characters) are listed in the report as not imported.

## 1. Take the dump on the YOURLS server

```sh
mysqldump --single-transaction --skip-lock-tables yourls yourls_url yourls_log > yourls.sql
gzip -k yourls.sql        # optional: hop reads .sql and .sql.gz
```

`--single-transaction` gives a consistent copy without stopping YOURLS. The table prefix (here `yourls_`)
is detected from the file, so a different prefix needs no option. Take the dump close to the day you
switch DNS, or take a second one later and re-run the import (see "Running it again").

Note the numbers to compare later:

```sql
SELECT COUNT(*) AS links, SUM(clicks) AS lifetime_clicks FROM yourls_url;
SELECT COUNT(*) AS log_rows FROM yourls_log;
```

## 2. Import in hop

1. Add the short domain in **Domains** (for example `go.example.com`) while DNS still points at YOURLS.
2. Sign in as an admin, open **Settings > Data > Import from YOURLS** and choose the file.
   The file is read in your browser and sent in small parts (200 links or 500 clicks per request),
   so a file of tens of megabytes is fine. Keep the page open until it ends.
3. Check the summary (links, clicks, first and last click, clicks without a link), then **Continue**.
4. Choose the options:
   - **Short domain**: where the links will live.
   - **Owner of imported links**: who sees them as theirs.
   - **Redirect type**: 302 by default, matching the Always-302 plugin, so every visit passes through hop and is counted.
   - **Time zone of the dates**: see below.
   - **Existing links**: if some endings already exist on that domain you can skip them (their clicks are skipped too) or replace them.
5. **Start import**. The report lists links created, updated and skipped, clicks imported and clicks
   without a link, and the totals now present on the domain.

### Time zone of the dates

YOURLS 1.10 calls `date_default_timezone_set('UTC')` when it loads and writes `timestamp` and `click_time`
with PHP's `date('Y-m-d H:i:s')`, so the stored values are UTC. The `YOURLS_HOURS_OFFSET` setting is only
applied when dates are displayed. hop therefore reads the dates as **UTC by default**, which is right for a
YOURLS 1.7 or later even when the server is in Europe. If you know your data was written in local time
(very old versions, or a patched install) or imported click times look a few hours off compared with
YOURLS's own stats page, choose your zone (for example `Europe/Rome`) in the import options: daylight saving
is handled per date.

## 3. Verify the counts

On the report, and on the domain afterwards:

- **Links** in hop on the domain = `links` from the first query (plus any link that already lived there).
- **Clicks counted on the links** = `lifetime_clicks`.
- **Clicks in the history** = `log_rows` minus the clicks without a link shown in the summary.
- Open a few links in hop (**Links > the link > Statistics**) and compare their totals with the YOURLS stats page.
- `GET /metrics` (see below) shows `hop_links` and `hop_clicks_total` if you prefer numbers from a script.

## Running it again

The import is safe to repeat. Every imported click carries the identity of its YOURLS `click_id` and the
target domain, so importing the same (or a newer) dump again never duplicates clicks:

- To finish an interrupted import, run it again with **Replace existing links**. Links are updated in place
  and only the missing clicks are added.
- To bring over clicks recorded after the first dump, take a new dump and run it with **Replace existing links**.
- With **Skip existing links**, existing links and their clicks are left untouched.

One limit: do not import dumps of two different YOURLS installations into the same domain, because their
`click_id` numbers would be confused with each other.

## 4. Switch the short domain to hop

1. Make a backup of hop (**Settings > Data > Download backup**) so you have a point to return to.
2. Lower the TTL of the short domain's DNS record a day in advance (for example to 300 seconds).
3. Test hop before switching: open `https://<hop-app-host>` and, with a hosts-file entry or a `curl --resolve`,
   try a few short links: `curl -I --resolve go.example.com:443:<hop-ip> https://go.example.com/<keyword>`.
   You should see the right `Location` and a `302`.
4. Do a final dump and import (Replace existing links) just before switching, so no click is lost.
5. Change the DNS record of the short domain to hop (for Cloudflare: attach the domain to the Worker as a
   custom domain; for the container: point the record at the host and make sure the proxy forwards the `Host` header).
6. Watch **Dashboard** and `/healthz`; visits to old short links should appear as clicks within seconds.
7. Keep YOURLS running (read-only, nobody adding links) for a while as a fallback, then retire it.

## After the switch

- Turn on the **broken link check** (Settings > Links) to spot old destinations that no longer work.
- Set a `METRICS_TOKEN` to scrape `GET /metrics` with `Authorization: Bearer <token>` (Prometheus text format).
- Back up regularly: download from Settings > Data while signed in as an admin (API keys cannot download backups, because a backup holds password hashes and other secrets). For scheduled copies on Cloudflare, export the database with `wrangler d1 export hop --remote --env production --output hop-$(date +%F).sql` and copy the R2 bucket of uploaded images; on Docker, follow the backup step in DEPLOY.md.
  To restore on a new empty installation, open the first-run page and choose **Restore from a backup**.
