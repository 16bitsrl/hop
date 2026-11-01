import { lookup } from "node:dns";
import http from "node:http";
import https from "node:https";
import { Readable } from "node:stream";
import { createBrotliDecompress, createGunzip, createInflate } from "node:zlib";
import { isPrivateIp, setSafeFetchTransport, UnsafeUrlError } from "./safe-fetch";

/**
 * Node transport for `safeFetch`: the socket's own DNS lookup is the one that is checked, so a
 * name cannot resolve to a public address for the check and to a private one for the connection.
 */
export function installSafeFetchTransport() {
  setSafeFetchTransport(
    (url, init, { allowPrivate }) =>
      new Promise<Response>((resolve, reject) => {
        const lib = url.protocol === "https:" ? https : http;
        const req = lib.request(
          url,
          {
            method: init.method,
            headers: { "accept-encoding": "gzip, deflate, br", ...init.headers },
            signal: init.signal,
            lookup(hostname, options, cb) {
              lookup(hostname, { ...options, all: true }, (err, addrs) => {
                const done = cb as unknown as (e: Error | null, a?: unknown, f?: number) => void;
                if (err) return done(err);
                if (!allowPrivate && addrs.some((a) => isPrivateIp(a.address))) return done(new UnsafeUrlError("private_address"));
                if (options.all) return done(null, addrs);
                done(null, addrs[0]!.address, addrs[0]!.family);
              });
            },
          },
          (msg) => {
            const headers = new Headers();
            for (const [k, v] of Object.entries(msg.headers)) {
              for (const item of Array.isArray(v) ? v : v === undefined ? [] : [v]) headers.append(k, item);
            }
            const encoding = msg.headers["content-encoding"]?.toLowerCase();
            const decoder =
              encoding === "gzip" ? createGunzip() : encoding === "deflate" ? createInflate() : encoding === "br" ? createBrotliDecompress() : null;
            if (decoder) {
              headers.delete("content-encoding");
              headers.delete("content-length");
            }
            const status = msg.statusCode ?? 502;
            const source: Readable = decoder ? msg.pipe(decoder) : msg;
            source.on("error", () => {});
            const empty = status === 204 || status === 304 || init.method === "HEAD";
            if (empty) msg.resume();
            resolve(new Response(empty ? null : (Readable.toWeb(source) as ReadableStream), { status, headers }));
          },
        );
        req.on("error", reject);
        req.end();
      }),
  );
}
