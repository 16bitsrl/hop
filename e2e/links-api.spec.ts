import { expect, test, type APIRequestContext } from "@playwright/test";
import { SHORT } from "../playwright.config";
import { apiAs, createUser } from "./helpers";
import { createLink, DESKTOP_UA, ensureDomain, IPHONE_UA, uniq } from "./links-helpers";

const go = (request: APIRequestContext, slug: string, headers: Record<string, string> = {}) =>
  request.get(`${SHORT}/${slug}`, { maxRedirects: 0, headers: { "user-agent": DESKTOP_UA, ...headers } });

test.describe("links API", () => {
  test("create with custom and generated slug, follow both", async ({ request, playwright }) => {
    const admin = await apiAs(playwright, await createUser(request, { role: "admin" }));
    await ensureDomain(admin);
    const slug = uniq("Cust");
    const a = await createLink(admin, { slug, url: "https://example.com/a" });
    expect(a.slug).toBe(slug);
    expect(a.shortUrl).toBe(`${SHORT}/${slug}`);
    expect(a.passwordHash).toBeUndefined();
    expect((await go(request, slug)).headers().location).toBe("https://example.com/a");

    const b = await createLink(admin, { url: "https://example.com/b" });
    expect(b.slug).toMatch(/^[a-z0-9]{6}$/);
    expect((await go(request, b.slug)).headers().location).toBe("https://example.com/b");
  });

  test("slug rules: duplicates, characters, case", async ({ request, playwright }) => {
    const admin = await apiAs(playwright, await createUser(request, { role: "admin" }));
    await ensureDomain(admin);
    const slug = uniq("dup");
    await createLink(admin, { slug, url: "https://example.com/1" });
    const again = await admin.post("/api/links", { data: { slug, url: "https://example.com/2", fetchMeta: false } });
    expect(again.status()).toBe(409);
    expect((await again.json()).error).toBe("slug_taken");
    // Case-sensitive: same letters in another case is a different slug.
    const upper = await admin.post("/api/links", { data: { slug: slug.toUpperCase(), url: "https://example.com/3", fetchMeta: false } });
    expect(upper.ok()).toBeTruthy();
    const bad = await admin.post("/api/links", { data: { slug: "has space", url: "https://example.com/4", fetchMeta: false } });
    expect(bad.status()).toBe(400);
    const badUrl = await admin.post("/api/links", { data: { url: "javascript:alert(1)", fetchMeta: false } });
    expect(badUrl.status()).toBe(400);
  });

  test("generator settings change length and alphabet (admin only)", async ({ request, playwright }) => {
    const admin = await apiAs(playwright, await createUser(request, { role: "admin" }));
    const member = await apiAs(playwright, await createUser(request, { role: "member" }));
    await ensureDomain(admin);
    expect((await member.put("/api/settings/slugs", { data: { length: 4, alphabet: "ab" } })).status()).toBe(403);
    const put = await admin.put("/api/settings/slugs", { data: { length: 9, alphabet: "xyz" } });
    expect(put.ok()).toBeTruthy();
    try {
      const l = await createLink(admin, { url: "https://example.com/gen" });
      expect(l.slug).toMatch(/^[xyz]{9}$/);
    } finally {
      await admin.put("/api/settings/slugs", { data: { length: 6, alphabet: "abcdefghijklmnopqrstuvwxyz0123456789" } });
    }
  });

  test("permissions: member sees but cannot change another member's link", async ({ request, playwright }) => {
    const admin = await apiAs(playwright, await createUser(request, { role: "admin" }));
    const alice = await apiAs(playwright, await createUser(request, { role: "member" }));
    const bob = await apiAs(playwright, await createUser(request, { role: "member" }));
    const viewer = await apiAs(playwright, await createUser(request, { role: "viewer" }));
    await ensureDomain(admin);

    const mine = await createLink(alice, { url: "https://example.com/alice" });
    expect(mine.canModify).toBe(true);
    const seen = await (await bob.get(`/api/links/${mine.id}`)).json();
    expect(seen.link.canModify).toBe(false);
    const list = await (await bob.get(`/api/links?q=${mine.slug}`)).json();
    expect(list.items.map((l: { id: string }) => l.id)).toContain(mine.id);

    expect((await bob.patch(`/api/links/${mine.id}`, { data: { title: "hacked" } })).status()).toBe(403);
    expect((await bob.delete(`/api/links/${mine.id}`)).status()).toBe(403);
    expect((await viewer.patch(`/api/links/${mine.id}`, { data: { title: "x" } })).status()).toBe(403);
    expect((await viewer.post("/api/links", { data: { url: "https://example.com/v", fetchMeta: false } })).status()).toBe(403);
    expect((await viewer.get(`/api/links/${mine.id}`)).ok()).toBeTruthy();
    expect((await request.get("/api/links")).status()).toBe(401);

    expect((await admin.patch(`/api/links/${mine.id}`, { data: { title: "by admin" } })).ok()).toBeTruthy();
    expect((await alice.patch(`/api/links/${mine.id}`, { data: { title: "by owner" } })).ok()).toBeTruthy();
    expect((await admin.delete(`/api/links/${mine.id}`)).ok()).toBeTruthy();
    expect((await alice.get(`/api/links/${mine.id}`)).status()).toBe(404);
  });

  test("edit destination, password never returned, history records changes", async ({ request, playwright }) => {
    const admin = await apiAs(playwright, await createUser(request, { role: "admin" }));
    await ensureDomain(admin);
    const l = await createLink(admin, { url: "https://example.com/old", title: "First" });
    const res = await admin.patch(`/api/links/${l.id}`, {
      data: { url: "https://example.com/new", title: "Second", password: "s3cret-pass" },
    });
    const updated = (await res.json()).link;
    expect(updated.hasPassword).toBe(true);
    expect(JSON.stringify(updated)).not.toContain("pbkdf2");
    const hist = (await (await admin.get(`/api/links/${l.id}/history`)).json()).items;
    expect(hist.map((h: { action: string }) => h.action)).toEqual(["link.update", "link.create"]);
    expect(hist[0].data.before.url).toBe("https://example.com/old");
    expect(hist[0].data.after.url).toBe("https://example.com/new");
    expect(hist[0].data.after.hasPassword).toBe(true);
    expect(JSON.stringify(hist)).not.toContain("pbkdf2");
    const removed = (await (await admin.patch(`/api/links/${l.id}`, { data: { password: null } })).json()).link;
    expect(removed.hasPassword).toBe(false);
  });

  test("tags, folders, filters, search, sort, pagination", async ({ request, playwright }) => {
    const admin = await apiAs(playwright, await createUser(request, { role: "admin" }));
    const member = await apiAs(playwright, await createUser(request, { role: "member" }));
    await ensureDomain(admin);
    const key = uniq("flt");
    const folder = (await (await admin.post("/api/folders", { data: { name: `F ${key}` } })).json()).folder;
    const sub = (await (await admin.post("/api/folders", { data: { name: `Sub ${key}`, parentId: folder.id } })).json()).folder;
    const a = await createLink(admin, {
      slug: `${key}-a`,
      url: "https://example.com/alpha",
      title: "Alpha page",
      tags: [`t1${key}`, `t2${key}`],
      folderId: folder.id,
    });
    const b = await createLink(member, {
      slug: `${key}-b`,
      url: "https://example.com/beta",
      notes: `note ${key}`,
      tags: [`t2${key}`],
      folderId: sub.id,
    });
    const c = await createLink(admin, { slug: `${key}-c`, url: "https://example.com/gamma", enabled: false });
    const search = async (qs: string) =>
      ((await (await admin.get(`/api/links?${qs}`)).json()).items as { id: string }[]).map((i) => i.id);

    expect(await search(`q=${key}`)).toHaveLength(3);
    expect(await search(`q=alpha`)).toContain(a.id);
    expect(await search(`q=note+${key}`)).toEqual([b.id]);
    const tags = (await (await admin.get("/api/tags")).json()).tags as { id: string; name: string; color: string; linkCount: number }[];
    const t2 = tags.find((t) => t.name === `t2${key}`)!;
    expect(t2.color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(t2.linkCount).toBe(2);
    expect((await search(`q=${key}&tag=${t2.id}`)).sort()).toEqual([a.id, b.id].sort());
    // A folder filter includes its sub-folders.
    expect((await search(`folder=${folder.id}`)).sort()).toEqual([a.id, b.id].sort());
    expect(await search(`folder=${sub.id}`)).toEqual([b.id]);
    expect(await search(`q=${key}&folder=none`)).toEqual([c.id]);
    expect(await search(`q=${key}&owner=${b.ownerId}`)).toEqual([b.id]);
    expect(await search(`q=${key}&state=disabled`)).toEqual([c.id]);
    expect((await search(`q=${key}&state=active`)).sort()).toEqual([a.id, b.id].sort());
    expect(await search(`q=${key}&sort=slug&dir=asc`)).toEqual([a.id, b.id, c.id]);
    expect(await search(`q=${key}&sort=slug&dir=desc`)).toEqual([c.id, b.id, a.id]);
    const page = await (await admin.get(`/api/links?q=${key}&sort=slug&dir=asc&pageSize=2&page=2`)).json();
    expect(page.total).toBe(3);
    expect(page.items.map((i: { id: string }) => i.id)).toEqual([c.id]);

    // Folder delete moves its links to the root; the sub-folder moves up.
    expect((await admin.delete(`/api/folders/${folder.id}`)).ok()).toBeTruthy();
    expect((await (await admin.get(`/api/links/${a.id}`)).json()).link.folderId).toBeNull();
    const folders = (await (await admin.get("/api/folders")).json()).folders as { id: string; parentId: string | null }[];
    expect(folders.find((f) => f.id === sub.id)!.parentId).toBeNull();
    const renamed = await admin.patch(`/api/folders/${sub.id}`, { data: { name: "Renamed" } });
    expect((await renamed.json()).folder.name).toBe("Renamed");
  });

  test("states: protected, expired by date, disabled", async ({ request, playwright }) => {
    const admin = await apiAs(playwright, await createUser(request, { role: "admin" }));
    await ensureDomain(admin);
    const key = uniq("st");
    const p = await createLink(admin, { slug: `${key}-p`, url: "https://example.com/p", password: "open-sesame" });
    const e = await createLink(admin, {
      slug: `${key}-e`,
      url: "https://example.com/e",
      expiresAt: Date.now() - 60_000,
      fallbackUrl: "https://example.com/fallback",
    });
    const d = await createLink(admin, { slug: `${key}-d`, url: "https://example.com/d", enabled: false });
    const ids = async (state: string) =>
      ((await (await admin.get(`/api/links?q=${key}&state=${state}`)).json()).items as { id: string }[]).map((i) => i.id);
    expect(await ids("protected")).toEqual([p.id]);
    expect(await ids("expired")).toEqual([e.id]);
    expect(await ids("disabled")).toEqual([d.id]);
    expect(await ids("active")).toEqual([p.id]);

    expect((await go(request, `${key}-e`)).headers().location).toBe("https://example.com/fallback");
    expect((await go(request, `${key}-d`)).status()).toBe(404);
    const html = await (await go(request, `${key}-p`)).text();
    expect(html).toContain('type="password"');
    const wrong = await request.post(`${SHORT}/${key}-p`, { form: { password: "nope" }, maxRedirects: 0 });
    expect(wrong.status()).toBe(200);
    const right = await request.post(`${SHORT}/${key}-p`, { form: { password: "open-sesame" }, maxRedirects: 0 });
    expect(right.status()).toBe(303);
    expect((await go(request, `${key}-p`)).headers().location).toBe("https://example.com/p");
  });

  test("bulk actions apply where permitted and report skipped", async ({ request, playwright }) => {
    const admin = await apiAs(playwright, await createUser(request, { role: "admin" }));
    const alice = await apiAs(playwright, await createUser(request, { role: "member" }));
    await ensureDomain(admin);
    const key = uniq("blk");
    const mine = await createLink(alice, { slug: `${key}-m`, url: "https://example.com/m" });
    const theirs = await createLink(admin, { slug: `${key}-t`, url: "https://example.com/t" });
    const folder = (await (await admin.post("/api/folders", { data: { name: `B ${key}` } })).json()).folder;

    const tagRes = await (
      await alice.post("/api/links/bulk", { data: { ids: [mine.id, theirs.id], action: "addTag", tag: `bulk${key}` } })
    ).json();
    expect(tagRes.done).toBe(1);
    expect(tagRes.skipped).toEqual([{ id: theirs.id, reason: "forbidden" }]);
    expect((await (await alice.get(`/api/links/${mine.id}`)).json()).link.tags.map((t: { name: string }) => t.name)).toEqual([`bulk${key}`]);
    await alice.post("/api/links/bulk", { data: { ids: [mine.id], action: "removeTag", tag: `bulk${key}` } });
    expect((await (await alice.get(`/api/links/${mine.id}`)).json()).link.tags).toEqual([]);

    await admin.post("/api/links/bulk", { data: { ids: [mine.id, theirs.id], action: "move", folderId: folder.id } });
    expect((await (await alice.get(`/api/links/${theirs.id}`)).json()).link.folderId).toBe(folder.id);
    await admin.post("/api/links/bulk", { data: { ids: [mine.id, theirs.id], action: "disable" } });
    expect((await go(request, `${key}-m`)).status()).toBe(404);
    await admin.post("/api/links/bulk", { data: { ids: [mine.id], action: "enable" } });
    expect((await go(request, `${key}-m`)).status()).toBe(302);

    const del = await (await alice.post("/api/links/bulk", { data: { ids: [mine.id, theirs.id, "missing"], action: "delete" } })).json();
    expect(del.done).toBe(1);
    expect(del.skipped.map((s: { reason: string }) => s.reason).sort()).toEqual(["forbidden", "not_found"]);
  });

  test("a member can delete their own folder only when nobody else's links or folders are inside", async ({ request, playwright }) => {
    const admin = await apiAs(playwright, await createUser(request, { role: "admin" }));
    const alice = await apiAs(playwright, await createUser(request, { role: "member" }));
    await ensureDomain(admin);
    const key = uniq("fdel");
    const makeFolder = async (api: APIRequestContext, name: string, parentId?: string) =>
      (await (await api.post("/api/folders", { data: { name, parentId } })).json()).folder as { id: string };

    // Someone else's link lands in Alice's folder: she cannot delete it from under them.
    const folder = await makeFolder(alice, `Mine ${key}`);
    const mine = await createLink(alice, { slug: `${key}-m`, url: "https://example.com/m", folderId: folder.id });
    const theirs = await createLink(admin, { slug: `${key}-t`, url: "https://example.com/t", folderId: folder.id });
    const refused = await alice.delete(`/api/folders/${folder.id}`);
    expect(refused.status()).toBe(409);
    expect(await refused.json()).toMatchObject({ error: "folder_not_yours_inside" });
    expect((await (await admin.get(`/api/links/${theirs.id}`)).json()).link.folderId).toBe(folder.id);

    // Same for a sub-folder made by someone else.
    await admin.patch(`/api/links/${theirs.id}`, { data: { folderId: null } });
    const sub = await makeFolder(admin, `Theirs ${key}`, folder.id);
    expect((await alice.delete(`/api/folders/${folder.id}`)).status()).toBe(409);

    // Once only her own things are inside, it goes, and her links move to the root.
    await admin.delete(`/api/folders/${sub.id}`);
    expect((await alice.delete(`/api/folders/${folder.id}`)).ok()).toBeTruthy();
    expect((await (await alice.get(`/api/links/${mine.id}`)).json()).link.folderId).toBeNull();

    // An admin can always delete.
    const other = await makeFolder(alice, `Again ${key}`);
    await createLink(admin, { slug: `${key}-x`, url: "https://example.com/x", folderId: other.id });
    expect((await admin.delete(`/api/folders/${other.id}`)).ok()).toBeTruthy();
  });

  test("bulk actions and CSV imports are limited to 25 items per request", async ({ request, playwright }) => {
    const admin = await apiAs(playwright, await createUser(request, { role: "admin" }));
    await ensureDomain(admin);
    const ids = Array.from({ length: 26 }, (_, i) => `missing-${i}`);
    const bulk = await admin.post("/api/links/bulk", { data: { ids, action: "disable" } });
    expect(bulk.status()).toBe(400);
    expect(await bulk.json()).toMatchObject({ error: "batch_too_large" });
    expect((await admin.post("/api/links/bulk", { data: { ids: ids.slice(0, 25), action: "disable" } })).ok()).toBeTruthy();

    const key = uniq("cap");
    const rows = (n: number) => ["url,slug", ...Array.from({ length: n }, (_, i) => `https://example.com/${i},${key}-${i}`)].join("\n");
    const tooMany = await admin.post("/api/links/import", { data: { csv: rows(26) } });
    expect(tooMany.status()).toBe(400);
    expect(await tooMany.json()).toMatchObject({ error: "batch_too_large" });
    const ok = await (await admin.post("/api/links/import", { data: { csv: rows(25), lineOffset: 50 } })).json();
    expect(ok.created).toBe(25);
    // Line numbers in a report point at the original file.
    const again = await (await admin.post("/api/links/import", { data: { csv: rows(2), lineOffset: 50 } })).json();
    expect(again.failed.map((f: { line: number }) => f.line)).toEqual([52, 53]);
  });

  test("CSV import: preview validates rows, import reports a bad row", async ({ request, playwright }) => {
    const admin = await apiAs(playwright, await createUser(request, { role: "admin" }));
    await ensureDomain(admin);
    const key = uniq("csv");
    const csv = [
      "url,slug,title,tags,folder,notes,domain",
      `https://example.com/one,${key}-1,One,"red;blue",Imports ${key},first note,`,
      `not a url,${key}-2,Bad,,,,`,
      `https://example.com/three,${key}-1,Dup,,,,`,
      `https://example.com/four,,Four,,,,s.localhost`,
    ].join("\n");
    const preview = await (await admin.post("/api/links/import/preview", { data: { csv } })).json();
    expect(preview.rows).toHaveLength(4);
    expect(preview.validCount).toBe(2);
    expect(preview.rows[1].errors).toContain("invalid_url");
    expect(preview.rows[2].errors).toContain("slug_duplicate");
    const res = await (await admin.post("/api/links/import", { data: { csv } })).json();
    expect(res.created).toBe(2);
    expect(res.failed.map((f: { line: number }) => f.line)).toEqual([3, 4]);
    expect((await go(request, `${key}-1`)).headers().location).toBe("https://example.com/one");
    const one = (await (await admin.get(`/api/links?q=${key}-1`)).json()).items[0];
    expect(one.tags.map((t: { name: string }) => t.name).sort()).toEqual(["blue", "red"]);
    const again = await (await admin.post("/api/links/import", { data: { csv } })).json();
    expect(again.created).toBe(1);
    expect(again.failed.some((f: { errors: string[] }) => f.errors.includes("slug_taken"))).toBe(true);
  });

  test("rules and variants are validated and honoured by the redirect", async ({ request, playwright }) => {
    const admin = await apiAs(playwright, await createUser(request, { role: "admin" }));
    await ensureDomain(admin);
    const l = await createLink(admin, {
      url: "https://example.com/main",
      rules: [
        { devices: ["ios"], url: "https://example.com/ios", appUrl: "myapp://open" },
        { languages: ["it"], url: "https://example.com/it" },
      ],
    });
    expect((await go(request, l.slug, { "user-agent": IPHONE_UA })).status()).toBe(200); // deep link page
    expect((await go(request, l.slug, { "accept-language": "it-IT" })).headers().location).toBe("https://example.com/it");
    expect((await go(request, l.slug)).headers().location).toBe("https://example.com/main");

    expect((await admin.patch(`/api/links/${l.id}`, { data: { rules: [{ url: "ftp://x" }] } })).status()).toBe(400);
    const oneVariant = await admin.patch(`/api/links/${l.id}`, { data: { variants: [{ url: "https://example.com/v1", weight: 1 }] } });
    expect(oneVariant.status()).toBe(400);

    const v = await createLink(admin, {
      url: "https://example.com/main",
      variants: [
        { url: "https://example.com/va", weight: 1 },
        { url: "https://example.com/vb", weight: 1 },
      ],
    });
    const seen = new Set<string>();
    for (let i = 0; i < 20; i++) seen.add((await go(request, v.slug)).headers().location!);
    expect([...seen].every((u) => u === "https://example.com/va" || u === "https://example.com/vb")).toBe(true);
  });

  test("blocked destinations are refused (host and parent domain)", async ({ request, playwright }) => {
    const admin = await apiAs(playwright, await createUser(request, { role: "admin" }));
    const member = await apiAs(playwright, await createUser(request, { role: "member" }));
    await ensureDomain(admin);
    const host = `${uniq("evil")}.example`;
    expect((await member.post("/api/blocked-domains", { data: { host } })).status()).toBe(403);
    const add = await admin.post("/api/blocked-domains", { data: { host: `https://${host.toUpperCase()}/path`, reason: "phishing" } });
    expect(add.ok(), await add.text()).toBeTruthy();
    const entry = (await add.json()).blocked;
    expect(entry.host).toBe(host);

    for (const url of [`https://${host}/x`, `https://deep.sub.${host}/x`]) {
      const res = await member.post("/api/links", { data: { url, fetchMeta: false } });
      expect(res.status()).toBe(400);
      expect((await res.json()).error).toBe("destination_blocked");
    }
    const ok = await createLink(member, { url: "https://example.com/fine" });
    for (const patch of [
      { fallbackUrl: `https://${host}/f` },
      { rules: [{ url: `https://${host}/r`, devices: ["ios"] }] },
      {
        variants: [
          { url: `https://${host}/v`, weight: 1 },
          { url: "https://example.com/v2", weight: 1 },
        ],
      },
    ]) {
      const res = await member.patch(`/api/links/${ok.id}`, { data: patch });
      expect((await res.json()).error).toBe("destination_blocked");
    }
    // Look-alike hosts are fine.
    await createLink(member, { url: `https://not${host}/ok` });
    expect((await admin.delete(`/api/blocked-domains/${entry.id}`)).ok()).toBeTruthy();
    await createLink(member, { url: `https://${host}/now-fine` });
  });

  test("domains: admin manages, host validated, cannot delete with links", async ({ request, playwright }) => {
    const admin = await apiAs(playwright, await createUser(request, { role: "admin" }));
    const member = await apiAs(playwright, await createUser(request, { role: "member" }));
    await ensureDomain(admin);
    const host = `${uniq("dm")}.localhost`;
    expect((await member.post("/api/domains", { data: { host } })).status()).toBe(403);
    expect((await admin.post("/api/domains", { data: { host: `http://${host}` } })).status()).toBe(400);
    expect((await admin.post("/api/domains", { data: { host: `${host}:8803` } })).status()).toBe(400);
    const created = (
      await (
        await admin.post("/api/domains", { data: { host, rootUrl: "https://example.com/root", notFoundUrl: "https://example.com/nf" } })
      ).json()
    ).domain;
    expect((await admin.post("/api/domains", { data: { host } })).status()).toBe(409);
    expect((await (await member.get("/api/domains")).json()).domains.some((d: { host: string }) => d.host === host)).toBe(true);

    const port = new URL(SHORT).port;
    const root = await request.get(`http://${host}:${port}/`, { maxRedirects: 0 });
    expect(root.headers().location).toBe("https://example.com/root");
    const nf = await request.get(`http://${host}:${port}/zzz`, { maxRedirects: 0 });
    expect(nf.headers().location).toBe("https://example.com/nf");

    const l = await createLink(admin, { domainId: created.id, slug: "hello", url: "https://example.com/h" });
    expect(l.shortUrl).toBe(`http://${host}:${port}/hello`);
    expect((await request.get(`http://${host}:${port}/hello`, { maxRedirects: 0 })).status()).toBe(302);
    const del = await admin.delete(`/api/domains/${created.id}`);
    expect(del.status()).toBe(409);
    expect((await del.json()).error).toBe("domain_has_links");
    await admin.delete(`/api/links/${l.id}`);
    expect((await admin.delete(`/api/domains/${created.id}`)).ok()).toBeTruthy();
  });

  test("default domain: user choice wins, else the default domain", async ({ request, playwright }) => {
    const admin = await apiAs(playwright, await createUser(request, { role: "admin" }));
    const member = await apiAs(playwright, await createUser(request, { role: "member" }));
    const def = await ensureDomain(admin);
    const other = await ensureDomain(admin, `${uniq("od")}.localhost`);
    await admin.patch(`/api/domains/${def.id}`, { data: { isDefault: true } });
    const plain = await createLink(member, { url: "https://example.com/default" });
    expect(plain.domainId).toBe(def.id);
    const patch = await member.patch("/api/me", { data: { defaultDomainId: other.id } });
    expect((await patch.json()).user.defaultDomainId).toBe(other.id);
    const mine = await createLink(member, { url: "https://example.com/mine" });
    expect(mine.domainId).toBe(other.id);
    expect((await member.patch("/api/me", { data: { defaultDomainId: "nope" } })).status()).toBe(400);
  });

  test("page metadata, media upload and serving", async ({ request, playwright }) => {
    const admin = await apiAs(playwright, await createUser(request, { role: "admin" }));
    const viewer = await apiAs(playwright, await createUser(request, { role: "viewer" }));
    await ensureDomain(admin);
    const page = `http://app.localhost:${new URL(SHORT).port}/api/_test/page`;
    const meta = await (await admin.get(`/api/links/meta?url=${encodeURIComponent(page)}`)).json();
    expect(meta.title).toBe("Hop test page");
    expect(meta.description).toBe("A page used by the tests.");
    expect((await admin.get("/api/links/meta?url=ftp://x")).status()).toBe(400);
    // Looking up a page makes the server fetch it: only people who can create links may ask.
    expect((await viewer.get(`/api/links/meta?url=${encodeURIComponent(page)}`)).status()).toBe(403);

    const created = await createLink(admin, { url: page, fetchMeta: true });
    expect(created.title).toBe("Hop test page");

    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      "base64",
    );
    expect((await viewer.post("/api/media", { data: png, headers: { "content-type": "image/png" } })).status()).toBe(403);
    const up = await admin.post("/api/media", { data: png, headers: { "content-type": "image/png" } });
    expect(up.ok(), await up.text()).toBeTruthy();
    const { url } = await up.json();
    expect(url).toMatch(/\/media\/[a-z0-9-]+\.png$/);
    const served = await request.get(url);
    expect(served.status()).toBe(200);
    expect(served.headers()["content-type"]).toBe("image/png");
    expect(served.headers()["cache-control"]).toContain("immutable");
    expect((await served.body()).equals(png)).toBe(true);
    const svg = await admin.post("/api/media", { data: Buffer.from("<svg/>"), headers: { "content-type": "image/svg+xml" } });
    expect(svg.status()).toBe(400);
  });
});
