/**
 * The test database is recreated by e2e/prepare-db.mjs, which is part of the webServer command in
 * playwright.config.ts: the server starts before this hook runs, so resetting the files here
 * would pull them from under the running server.
 */
export default function globalSetup() {}
