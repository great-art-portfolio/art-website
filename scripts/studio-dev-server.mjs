/** Local content API for `pnpm dev:studio` on :4333, backed by the working
 * tree. Dev only. */
import { createServer } from "node:http";
import { join } from "node:path";
import { createStudioDevApi } from "./studio-dev-api.mjs";
import { createStudioPushMock } from "./studio-push-mock.mjs";
import {
  onRequestGet as collectorsGet,
  onRequestPost as collectorsPost,
} from "../functions/api/collectors.ts";
import {
  collectorsEnv,
  createCollectorsDb,
  siteOriginFor,
} from "./studio-collectors.mjs";

export const STUDIO_DEV_API_PORT = 4333;

const api = createStudioDevApi(process.cwd());
// Dev push mock with its own VAPID keypair and in-memory subscribers. It
// serves the same /api/push, /api/push-message, and /api/notify shapes as
// the Pages Functions.
const pushMock = createStudioPushMock(
  join(process.cwd(), "node_modules", ".cache"),
);
// Email list requests go to the real collectors handler, with the mock
// forced on, mail settings from .dev.vars, and a file-backed mock table.
const collectorsDb = createCollectorsDb(
  join(process.cwd(), "node_modules", ".cache"),
);

function json404() {
  return new Response(JSON.stringify({ error: "Not found" }), {
    status: 404,
    headers: { "content-type": "application/json" },
  });
}

async function toRequest(req, chunks, host) {
  const url = `http://${host ?? `127.0.0.1:${STUDIO_DEV_API_PORT}`}${req.url ?? "/"}`;
  const init = { method: req.method ?? "GET", headers: { ...req.headers } };
  delete init.headers.host;
  delete init.headers.connection;
  if (init.method !== "GET" && init.method !== "HEAD") {
    init.body = Buffer.concat(chunks);
    init.duplex = "half";
  }
  return new Request(url, init);
}

/** Builds the collectors context with the browser-facing origin, so the dev
 * confirm link points at the site (:4332) instead of this server. */
async function toCollectorsContext(req, chunks) {
  const origin = siteOriginFor(req.headers.host);
  return {
    request: await toRequest(req, chunks, origin.replace(/^http:\/\//, "")),
    env: collectorsEnv(process.cwd(), collectorsDb),
  };
}

const server = createServer((req, res) => {
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    toRequest(req, chunks)
      .then(async (request) => {
        const path = new URL(request.url).pathname;
        if (path === "/api/commit" || path === "/api/commit/") {
          return api.handleCommit(request);
        }
        if (path === "/api/photo" || path === "/api/photo/") {
          return api.handlePhoto(request);
        }
        if (path === "/api/studio-dev" || path === "/api/studio-dev/") {
          return api.handleProbe();
        }
        if (path === "/api/push" || path === "/api/push/") {
          return pushMock.handlePush(request);
        }
        if (path === "/api/push-message" || path === "/api/push-message/") {
          return pushMock.handlePushMessage(request);
        }
        if (path === "/api/notify" || path === "/api/notify/") {
          return pushMock.handleNotify(request);
        }
        if (path === "/api/collectors" || path === "/api/collectors/") {
          const ctx = await toCollectorsContext(req, chunks);
          return request.method === "GET"
            ? collectorsGet(ctx)
            : collectorsPost(ctx);
        }
        return json404();
      })
      .catch((err) => {
        console.error(err);
        return new Response(JSON.stringify({ error: "Something went wrong" }), {
          status: 500,
          headers: { "content-type": "application/json" },
        });
      })
      .then(async (response) => {
        res.writeHead(response.status, Object.fromEntries(response.headers));
        const buf = Buffer.from(await response.arrayBuffer());
        res.end(buf);
      });
  });
});

server.on("error", (err) => {
  if (err instanceof Error && "code" in err && err.code === "EADDRINUSE") {
    console.error(
      `Port ${STUDIO_DEV_API_PORT} is already in use — another program (maybe a leftover \`pnpm dev\`) is holding it. Stop it and retry.`,
    );
  } else {
    console.error(err);
  }
  process.exit(1);
});

server.listen(STUDIO_DEV_API_PORT, "127.0.0.1", () => {
  console.log(
    `Studio dev API: working-tree backend on http://127.0.0.1:${STUDIO_DEV_API_PORT} (repo: ${process.cwd()})`,
  );
});
