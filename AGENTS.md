# hop — URL shortener

Nome di lavoro "hop", rinominabile.

## Documentazione
La documentazione di progetto è in `docs/` (panorama, requisiti, feature scelte, architettura, YOURLS attuale, piano).
`docs/` NON va committata con il progetto (decisione dell'utente): è esclusa tramite `.git/info/exclude`.

## Regole
- Codice e nomi in inglese; testi UI in inglese con traduzione italiana (i18n).
- Test E2E (Playwright) prima del codice, contro D1 locale dedicata ai test in `.test-state/`. Mai dati reali.
- Vitest solo per logica pura.
