import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { runScheduledJobs } from "./jobs";
import { installSafeFetchTransport } from "./lib/safe-fetch-node";
import { staticHandler } from "./node-static";
import { createNodeRuntime } from "./platform/node";
import { ConfigError, parseNodeEnv } from "./platform/node-config";

const HOUR = 60 * 60 * 1000;

async function main() {
  let settings;
  try {
    settings = parseNodeEnv(process.env);
  } catch (e) {
    if (e instanceof ConfigError) {
      console.error(e.message);
      process.exit(1);
    }
    throw e;
  }

  installSafeFetchTransport();
  const runtime = await createNodeRuntime(settings);
  const { platform } = runtime;

  const app = createApp({ platform: () => platform, serveAssets: staticHandler(settings.staticDir) });
  const server = serve(
    {
      port: settings.port,
      fetch: (req, env) => {
        const address = env?.incoming?.socket?.remoteAddress;
        if (address) {
          runtime.remoteAddresses.set(req, address);
          // Without a trusted proxy the socket address is the only truth; Better Auth's rate
          // limiter reads this header, so a client must not be able to choose it.
          if (!settings.trustProxy) req.headers.set("x-forwarded-for", address);
        }
        return app.fetch(req, env);
      },
    },
    (info) => console.log(`hop listening on :${info.port} (app host ${settings.config.appHost}, data in ${settings.dataDir})`),
  );

  // Periodic jobs: the Workers cron trigger, as a timer.
  const timer = setInterval(() => {
    platform.waitUntil(runScheduledJobs(platform));
  }, HOUR);
  timer.unref();

  let stopping = false;
  const stop = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    console.log(`${signal} received, shutting down`);
    clearInterval(timer);
    server.close();
    // Idle keep-alive connections would hold the server open.
    (server as { closeIdleConnections?: () => void }).closeIdleConnections?.();
    await runtime.close();
    process.exit(0);
  };
  process.on("SIGTERM", () => void stop("SIGTERM"));
  process.on("SIGINT", () => void stop("SIGINT"));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
