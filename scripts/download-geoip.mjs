// Downloads the free DB-IP "IP to City Lite" database (MaxMind format, CC BY 4.0, https://db-ip.com)
// into <DATA_DIR>/geoip/city.mmdb, where hop picks it up at startup.
//
//   node scripts/download-geoip.mjs            (in the container: docker exec <name> node scripts/download-geoip.mjs)
//
// DB-IP publishes a new file every month: run it again from time to time, then restart hop.
import { createWriteStream } from "node:fs";
import { mkdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGunzip } from "node:zlib";

const dir = path.join(path.resolve(process.env.DATA_DIR || "./data"), "geoip");
const target = path.join(dir, "city.mmdb");
await mkdir(dir, { recursive: true });

function candidates() {
  const months = [];
  const now = new Date();
  for (let i = 0; i < 3; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    months.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return months.map((m) => `https://download.db-ip.com/free/dbip-city-lite-${m}.mmdb.gz`);
}

for (const url of candidates()) {
  const res = await fetch(url);
  if (!res.ok || !res.body) {
    console.log(`${url}: ${res.status}, trying the previous month`);
    continue;
  }
  const partial = `${target}.part`;
  try {
    await pipeline(Readable.fromWeb(res.body), createGunzip(), createWriteStream(partial));
    await rename(partial, target);
  } catch (e) {
    await rm(partial, { force: true });
    throw e;
  }
  console.log(`saved ${target} from ${url}. Restart hop to load it.`);
  process.exit(0);
}
console.error("Could not download the DB-IP database. Check the network, or set GEOIP_DB to a .mmdb file you downloaded yourself.");
process.exit(1);
