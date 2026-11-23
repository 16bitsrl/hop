# hop in your terminal

`hop` is the command line app for [hop](../README.md): create short links, read their statistics, get QR codes and manage a hop server without leaving the terminal. One small program for macOS, Linux and Windows, in English and Italian.

```console
$ hop https://example.com/spring-sale --slug spring --copy
✓ Short link created

  https://go.example.com/spring
  → https://example.com/spring-sale
  Copied to the clipboard.
```

## Install

macOS and Linux:

```sh
curl -fsSL https://raw.githubusercontent.com/16bitsrl/hop/main/cli/install.sh | sh
```

Windows (PowerShell):

```powershell
irm https://raw.githubusercontent.com/16bitsrl/hop/main/cli/install.ps1 | iex
```

The installer downloads the program for your system from the latest [release](https://github.com/16bitsrl/hop/releases), checks it against the published checksum and puts it in `~/.local/bin` (`%LOCALAPPDATA%\hop\bin` on Windows, added to your PATH). Set `HOP_INSTALL_DIR` to install elsewhere, `HOP_VERSION` to pick a version.

With Go installed you can also build it yourself: `cd cli && go build -o hop .`

## Sign in

```sh
hop login https://hop.example.com
```

Your browser opens on a page of your hop server that shows a short code: check that it is the one in your terminal and press **Connect**. It works with passwords, passkeys and single sign-on, and also when the terminal is on another computer (open the address it prints, or go to `/cli` on your server and type the code).

The app gets its own key, listed in your profile with the name of the computer, so you can revoke it there at any time. `hop logout` revokes it too. The key is kept in the system keychain when there is one, otherwise in a settings file only you can read. Keys are only sent over https (plain http is accepted for `localhost`, or with `--insecure`).

To sign in with an API key you created yourself, pass it on the standard input so it stays out of your shell history: `hop login hop.example.com --with-token < key.txt`.

### Several servers

Sign in to as many servers as you like. The last one becomes the default.

```sh
hop servers                      # the servers you know; ● marks the default
hop use hop.acme.example         # change the default
hop list --server acme           # one command on another server (a part of the name is enough)
```

### Scripts and CI

No sign-in needed: create an API key in your profile and set two variables.

```sh
export HOP_SERVER=https://hop.example.com
export HOP_TOKEN=hop_…
hop create https://example.com/release-notes --slug v2    # prints only the short link
```

Every command takes `--json`. Without a terminal there are no colours, no questions (commands that would ask need `--yes`) and lists come out tab separated.

## What it does

| | |
| --- | --- |
| **Links** | `create` (or just `hop <address>`), `list`, `show`, `edit`, `rm`, `enable`, `disable`, `open`, `check`, `history` |
| **Sharing** | `qr` in the terminal or as PNG/SVG with your colours |
| **Statistics** | `stats` for one link or all of them: clicks over time, visitors, sources, countries, devices; CSV export |
| **In bulk** | `import` and `export` with CSV files |
| **Organise** | `domains`, `tags`, `folders` |
| **Manage** | `settings`, `blocked`, `users`, `activity`, `profile`, and `api` for anything else |
| **The app itself** | `update`, `config`, `skill`, `completion`, `version` |

A link is named by its ending (`spring`), its short address (`go.example.com/spring`) or its id.

```sh
hop create https://example.com/app \
  --rule "device=ios url=https://apps.apple.com/app/id1" \
  --rule "device=android url=https://play.google.com/store/apps/details?id=x"   # one link, three destinations
hop edit spring --url https://example.com/summer --add-tag summer --expires 2026-08-31
hop edit spring --variant 50:https://example.com/a --variant 50:https://example.com/b   # A/B test
hop list --search sale --tag promo --sort clicks
hop stats spring --period 7d
hop qr spring -o spring.svg --color '#0f7a5c'
hop settings set stats.keep 365
```

`hop help` lists every command and `hop help <command>` explains one, with examples.

What needs a signed-in person stays in the web app, by design: inviting people and changing roles, sign-in and email settings, backups. An API key can never give itself more access.

## For AI agents

```sh
hop skill              # for Claude Code; --target codex|gemini|agents, or --all
```

This writes the Agent Skill of hop (a `SKILL.md` file) where agents look for it, so they know how to create links, read statistics and the rest without being told. The file keeps itself current: whenever `hop` runs, it brings the copies it wrote up to date with the installed version. A copy you edited is left as it is.

## Updates

`hop` looks for a new version once a day and tells you when there is one.

```sh
hop update                     # install the newest version now
hop update --check             # only tell
hop config set updates auto    # install new versions by themselves
hop config set updates off     # never look
```

Downloads are checked against the checksums published with each release before anything is replaced. Scripts and CI are never slowed down: the check only runs when a person is at the terminal.

## Preferences

```sh
hop config                     # what is set, and where the settings file is
hop config set language it     # en, it, or auto to follow the system
hop completion zsh             # Tab completion for bash, zsh, fish and PowerShell
```

| Variable | What it does |
| --- | --- |
| `HOP_SERVER`, `HOP_TOKEN` | Server and key for scripts, instead of signing in. The key is only ever sent to that server |
| `HOP_ALLOW_HTTP` | Set to anything to allow a server without https (like `hop login --insecure`). Never needed for `localhost` |
| `HOP_LANG` | Language: `en` or `it` |
| `HOP_CONFIG_DIR` | Where the settings live (default `~/.config/hop`, `%AppData%\hop` on Windows) |
| `HOP_NO_UPDATE_CHECK` | Set to anything to never look for new versions |
| `HOP_NO_SKILL_AUTOUPDATE` | Set to anything to leave installed copies of the agent skill alone |
| `HOP_NO_KEYRING` | Set to anything to keep keys in the settings file instead of the system keychain |
| `NO_COLOR` | Set to anything to turn colours off (like `--no-color`) |

## Development

```sh
cd cli
go test ./...                              # unit tests (parsing, settings, updates, translations)
go build -o hop . && ./hop help
```

End-to-end tests drive the real program against a real hop server, with the rest of the suite: `pnpm exec playwright test e2e/00-setup.spec.ts e2e/cli-login.spec.ts e2e/cli.spec.ts` from the repository root.

Texts are written in English in the code (`t("…")`) and translated in [`internal/i18n/it.go`](internal/i18n/it.go); a test fails when a translation is missing.

### Releasing

Push a tag like `cli-v1.2.3`. The [release workflow](../.github/workflows/cli-release.yml) tests the app, builds it for every system with [`scripts/build-release.sh`](scripts/build-release.sh) and publishes the archives with their checksums. The installers and `hop update` pick up the newest `cli-v*` release.
