---
name: hop
description: >-
  Creates and manages short links on a hop URL shortener with the `hop` CLI.
  Use it when the user wants to shorten an address, get or save the QR code of a
  link, change where a short link goes, switch it off, make it expire or protect
  it with a password, send visitors to different destinations by device, country
  or language, run an A/B test, read click statistics, import or export links as
  CSV, manage short domains, tags and folders, change server settings, or work
  with several hop servers. Also when the user mentions hop, a short domain of
  theirs, or the `hop` command.
---

# hop CLI

`hop` is the command line app for hop, a self-hosted URL shortener: short links on
your own domains, with click statistics. One program talks to any number of hop
servers.

Run `hop help` for every command and `hop help <command>` for its options and
examples: that is always current, this file is a summary.

## Before anything else

```bash
hop servers            # which servers are signed in; * or ● marks the default
hop whoami             # who you are on the default server, and your role
```

If no server is signed in, `hop login https://hop.example.com` opens the browser on
a page where the person confirms a short code. **You cannot confirm it yourself**:
start the command, show the person the address and the code it prints, and wait
(the code lasts 10 minutes). Without a browser on this machine add `--no-browser`
and give them the address. In CI or other unattended places use an API key instead:
`HOP_SERVER=https://hop.example.com HOP_TOKEN=hop_… hop …`, or
`hop login <server> --token <key>`.

## Rules for agents

- Add `--json` when you need to read the answer: it prints the server's JSON on
  the standard output. Without a terminal, `hop create` prints only the short link
  and lists are tab separated.
- Commands that delete ask for confirmation and stop without a terminal: add
  `--yes` only after the person agreed to that exact deletion. Deleting a link
  removes its statistics and cannot be undone; to stop a link, prefer
  `hop disable`.
- Changing a link's destination affects everyone who already has the link or a
  printed QR code. Say what will change before doing it on a link you did not
  just create.
- Pick the server explicitly with `--server <name>` when more than one is signed
  in and the person did not say which: a part of the name is enough
  (`--server acme`). Never change the default (`hop use`) unless asked.
- Never print or store API keys. `hop` keeps them in the system keychain.

## Naming a link

Every command that takes `<link>` accepts its ending (`spring`), its short address
(`go.example.com/spring`, with or without `https://`) or its id. When the same
ending exists on two domains, use the short address.

## Links

```bash
hop create https://example.com/spring-sale                 # random ending
hop create https://example.com/spring-sale --slug spring --title "Spring sale" --tag promo,newsletter
hop https://example.com/spring-sale --domain go.example.com --expires 30d   # `hop <address>` = `hop create`
hop list --search sale --tag promo --sort clicks           # also --folder, --domain, --owner me, --state
hop list --all --json                                      # every link
hop show spring
hop edit spring --url https://example.com/summer --add-tag summer --remove-tag promo
hop edit spring --expires 2026-08-31 --max-clicks 1000 --fallback https://example.com/over
hop edit spring --password secret        # --no-password removes it
hop disable spring ; hop enable spring
hop check spring                         # does the destination still answer?
hop history spring                       # who changed what
hop rm spring --yes
```

Useful options of `create` and `edit` (see `hop help edit` for all):

| Option | Meaning |
|---|---|
| `--slug` | The ending (create only). Letters, numbers, `-` and `_`; case matters |
| `--domain` | Which short domain (create only); default: the person's default domain |
| `--expires` | A date (`2026-12-31`), date and time, a duration (`12h`, `7d`, `2w`) or `never` |
| `--max-clicks` | Stop after N clicks; `0` removes the limit |
| `--fallback` | Where visitors go once the link expired |
| `--redirect` | 301, 302 (default), 307 or 308 |
| `--forward-query` | Pass `?…` of the short link on to the destination |
| `--folder` | By name or path (`Campaigns/2026`); `none` takes it out |
| `--public-stats` | Give the link a public statistics page |
| `--preview-title`, `--preview-description`, `--preview-image` | What social networks and chats show |
| `--no-title-lookup` | Don't fetch the title from the destination (create only) |

An empty text (`--title ""`) removes a value. `--tag` replaces all tags;
`--add-tag` / `--remove-tag` change single ones.

### Different destinations for different visitors

```bash
# One link for the App Store, Google Play and the website. The first rule that matches wins.
hop edit app --rule "device=ios url=https://apps.apple.com/app/id1" \
             --rule "device=android url=https://play.google.com/store/apps/details?id=x"
# Conditions: device=ios,android,desktop,mobile,tablet  country=IT,FR  lang=it ; app=myapp://… tries the app first
hop edit app --no-rules

# A/B test: at least two, as weight:address
hop edit landing --variant 50:https://example.com/a --variant 50:https://example.com/b
hop edit landing --no-variants
```

`--rule` and `--variant` replace the whole list each time: repeat every rule you
want to keep.

## QR codes

```bash
hop qr spring                              # drawn in the terminal
hop qr spring -o spring.png --size 1024    # PNG; .svg for SVG
hop qr spring -o spring.svg --color '#0f7a5c' --background '#ffffff'
```

Looking at or generating a QR code is not counted as a click.

## Statistics

```bash
hop stats spring                    # last 30 days
hop stats spring --period 7d        # 24h, 7d, 30d, 12m, 1y, all
hop stats spring --from 2026-01-01 --to 2026-03-31
hop stats                           # every link together, with the most clicked
hop stats spring --json             # totals, series, referrers, countries, devices…
hop stats spring --csv clicks -o clicks.csv    # one row per click; --csv summary for totals
```

Bots are left out unless `--bots` is given. Days follow this computer's time zone
(`--tz Europe/Rome` to choose).

## In bulk

```bash
hop import --template > links.csv   # example file: url,slug,title,tags,folder,notes,domain
hop import links.csv --dry-run      # check only: lists the rows with problems
hop import links.csv                # creates the good rows, reports the others
hop export -o links.csv             # every link
```

## Organising and managing

```bash
hop domains                         # short domains; add / edit / rm need an administrator
hop domains add go.example.com --default
hop tags ; hop tags add promo --color '#3b82f6' ; hop tags edit promo --name sale
hop folders ; hop folders add 2026 --in Campaigns
hop settings                        # administrators: endings, statistics retention, broken link check
hop settings set stats.keep 365     # or: forever
hop blocked add spam.example        # websites links may not point to
hop users ; hop activity            # people, and who did what (administrators)
hop profile set domain go.example.com
hop api /api/links -q pageSize=5    # anything else: the server's API, signed in as you
```

Roles: administrators manage everything, members create links and change only
their own, viewers only read. A "permission" error usually means the role is
not enough, not that something is broken.

Not possible from the CLI, by design (use the web app): inviting people and
changing roles, sign-in and email settings, backups.

## Several servers

```bash
hop login https://hop.acme.example  # adds a server; it becomes the default
hop servers
hop use hop.example.com             # change the default
hop list --server acme              # one command elsewhere
hop logout hop.acme.example
```

## The app itself

```bash
hop update            # newest version (hop also tells when there is one)
hop config            # language (en, it) and update preferences
hop skill             # writes this file where agents look for it; it then keeps itself current
```

Exit codes: 0 done, 1 the server or the network refused, 2 the command was not
written correctly, 130 cancelled.
