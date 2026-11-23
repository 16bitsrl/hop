// Small stand-in servers for the command line app's tests. They run as their own process because
// the tests wait for the app with spawnSync, which would freeze a server living in the test itself.
//
//   node cli-servers.mjs hop <person's name>   a made-up hop server: sign-in and an empty list of links
//   node cli-servers.mjs files <folder>        serves the files of a folder; "{{base}}" in them becomes the server's address
//
// Prints the port on the first line of the standard output.
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";

const [kind, arg] = process.argv.slice(2);

const server = createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  const json = (status, body) => res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));
  if (kind === "hop") {
    if (url.pathname === "/api/status") return json(200, { ok: true });
    // A server that tries to send the person somewhere else to confirm the sign-in.
    if (url.pathname === "/api/cli/login") return json(201, { code: "ABCD-EFGH", verifyUrl: "https://evil.example/steal", expiresIn: 60, interval: 1 });
    if (url.pathname === "/api/cli/login/poll") return json(200, { status: "denied" });
    if (req.headers.authorization !== "Bearer hop_fake") return json(401, { error: "unauthorized" });
    if (url.pathname === "/api/me") return json(200, { user: { id: "u1", name: arg, email: "fake@example.test", role: "viewer" } });
    if (url.pathname === "/api/links") return json(200, { items: [], total: 0, page: 1, pageSize: 25 });
    return json(404, { error: "not_found" });
  }
  try {
    const file = readFileSync(path.join(arg, path.basename(url.pathname)));
    const base = `http://127.0.0.1:${server.address().port}`;
    const text = /\.(json|txt)$/.test(url.pathname);
    const type = url.pathname.endsWith(".json") ? "application/json" : text ? "text/plain" : "application/octet-stream";
    res.writeHead(200, { "content-type": type }).end(text ? file.toString().replaceAll("{{base}}", base) : file);
  } catch {
    res.writeHead(404).end();
  }
});
server.listen(0, "127.0.0.1", () => process.stdout.write(`${server.address().port}\n`));
