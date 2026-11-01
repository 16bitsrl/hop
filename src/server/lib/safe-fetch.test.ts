import { describe, expect, it } from "vitest";
import { isPrivateHost, isPrivateIp, safeFetch, UnsafeUrlError } from "./safe-fetch";

describe("isPrivateIp", () => {
  it("flags private, loopback, link-local and reserved IPv4", () => {
    for (const ip of ["0.0.0.0", "10.0.0.1", "127.0.0.1", "127.9.9.9", "100.64.0.1", "169.254.169.254", "172.16.0.1", "172.31.255.255", "192.168.1.1", "192.0.0.8", "198.18.0.1", "224.0.0.1", "255.255.255.255"]) {
      expect(isPrivateIp(ip), ip).toBe(true);
    }
    for (const ip of ["8.8.8.8", "1.1.1.1", "172.15.0.1", "172.32.0.1", "100.63.0.1", "100.128.0.1", "198.20.0.1", "223.255.255.255"]) {
      expect(isPrivateIp(ip), ip).toBe(false);
    }
  });

  it("flags private IPv6 in every notation", () => {
    for (const ip of ["::", "::1", "[::1]", "0:0:0:0:0:0:0:1", "fc00::1", "fd12:3456::1", "fe80::1", "fe80::1%eth0", "febf::1", "fec0::1", "ff02::1", "fd00:ec2::254", "2001:db8::1", "2001::1"]) {
      expect(isPrivateIp(ip), ip).toBe(true);
    }
    for (const ip of ["2606:4700:4700::1111", "2001:4860:4860::8888", "2a00:1450::1"]) expect(isPrivateIp(ip), ip).toBe(false);
  });

  it("looks through IPv4 embedded in IPv6", () => {
    for (const ip of ["::ffff:127.0.0.1", "::ffff:7f00:1", "::ffff:10.1.2.3", "::ffff:a9fe:a9fe", "0:0:0:0:0:ffff:192.168.0.1", "::127.0.0.1", "64:ff9b::7f00:1", "64:ff9b::169.254.169.254", "64:ff9b:1::1", "2002:7f00:1::", "2002:a00:1::1"]) {
      expect(isPrivateIp(ip), ip).toBe(true);
    }
    for (const ip of ["::ffff:8.8.8.8", "::ffff:808:808", "64:ff9b::808:808", "2002:808:808::1"]) expect(isPrivateIp(ip), ip).toBe(false);
  });

  it("does not treat garbage as private", () => {
    for (const s of ["example.com", "1.2.3", "1.2.3.256", "::1::2", "fcm.example.com", "12345::"]) expect(isPrivateIp(s), s).toBe(false);
  });
});

describe("isPrivateHost", () => {
  it("flags local names", () => {
    for (const h of ["localhost", "LOCALHOST.", "a.localhost", "printer.local", "metadata.google.internal", "[::1]", "127.0.0.1"]) {
      expect(isPrivateHost(h), h).toBe(true);
    }
    expect(isPrivateHost("example.com")).toBe(false);
  });
  it("sees what the URL parser normalises", () => {
    for (const u of ["http://2130706433/", "http://0x7f.1/", "http://127.1/", "http://[::ffff:127.0.0.1]/", "http://0/"]) {
      expect(isPrivateHost(new URL(u).hostname), u).toBe(true);
    }
  });
});

const redirect = (to: string, status = 302) => new Response(null, { status, headers: { location: to } });

describe("safeFetch", () => {
  it("refuses a private first hop without calling the network", async () => {
    let calls = 0;
    const fetchImpl = (async () => (calls++, new Response("x"))) as unknown as typeof fetch;
    await expect(safeFetch("http://169.254.169.254/latest", { fetchImpl })).rejects.toThrow(UnsafeUrlError);
    await expect(safeFetch("ftp://example.com/", { fetchImpl })).rejects.toThrow(UnsafeUrlError);
    expect(calls).toBe(0);
  });

  it("follows redirects by hand and re-checks every hop", async () => {
    const seen: string[] = [];
    const fetchImpl = (async (u: URL, init: RequestInit) => {
      seen.push(String(u));
      expect(init.redirect).toBe("manual");
      if (String(u) === "https://a.example/") return redirect("/b");
      if (String(u) === "https://a.example/b") return redirect("http://127.0.0.1:8080/admin");
      return new Response("secret");
    }) as unknown as typeof fetch;
    await expect(safeFetch("https://a.example/", { fetchImpl })).rejects.toThrow("private_address");
    expect(seen).toEqual(["https://a.example/", "https://a.example/b"]);
  });

  it("returns the final response", async () => {
    const fetchImpl = (async (u: URL) => (String(u).endsWith("/start") ? redirect("https://b.example/end", 301) : new Response("ok"))) as unknown as typeof fetch;
    const res = await safeFetch("https://a.example/start", { fetchImpl });
    expect(await res.text()).toBe("ok");
  });

  it("stops after 5 redirects", async () => {
    let calls = 0;
    const fetchImpl = (async () => (calls++, redirect("https://a.example/loop"))) as unknown as typeof fetch;
    await expect(safeFetch("https://a.example/loop", { fetchImpl })).rejects.toThrow("too_many_redirects");
    expect(calls).toBe(6);
    calls = 0;
    await expect(safeFetch("https://a.example/loop", { fetchImpl, maxRedirects: 1 })).rejects.toThrow("too_many_redirects");
    expect(calls).toBe(2);
  });

  it("lets tests reach local fixtures with allowPrivate", async () => {
    const fetchImpl = (async () => new Response("fixture")) as unknown as typeof fetch;
    expect(await (await safeFetch("http://app.localhost:8806/x", { fetchImpl, allowPrivate: true })).text()).toBe("fixture");
  });

  it("switches to GET after 303", async () => {
    const methods: string[] = [];
    const fetchImpl = (async (_u: URL, init: RequestInit) => {
      methods.push(init.method!);
      return methods.length === 1 ? redirect("https://b.example/", 303) : new Response("ok");
    }) as unknown as typeof fetch;
    await safeFetch("https://a.example/", { fetchImpl, method: "POST" });
    expect(methods).toEqual(["POST", "GET"]);
  });
});
