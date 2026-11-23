# hop — URL shortener

Nome di lavoro "hop", rinominabile.

## Documentazione
La documentazione di progetto è in `docs/` (panorama, requisiti, feature scelte, architettura, YOURLS attuale, piano).
`docs/` NON va committata con il progetto (decisione dell'utente): è esclusa tramite `.git/info/exclude`.

## Regole
- Codice e nomi in inglese; testi UI in inglese con traduzione italiana (i18n).
- Test E2E (Playwright) prima del codice, contro D1 locale dedicata ai test in `.test-state/`. Mai dati reali.
- Vitest solo per logica pura.

## CLI
`cli/` contiene la CLI `hop` (Go, modulo a parte): multi-server, login dal browser, auto-aggiornamento.
- Testi in inglese nel codice con `t("…")`, traduzione italiana in `cli/internal/i18n/it.go` (un test fallisce se manca).
- Test: `go test ./...` in `cli/` per la logica pura; E2E in `e2e/cli*.spec.ts` (programma vero contro il server di test).
- Release: tag `cli-vX.Y.Z` → `.github/workflows/cli-release.yml`. Dettagli in `cli/README.md` e `docs/cli.md`.
