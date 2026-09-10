/** Local content API for `pnpm dev:studio` (:4333, working-tree backed).
 * Localhost-only, never deployed. */
import { createServer } from "node:http";
import { createStudioDevApi } from "./studio-dev-api.mjs";

export const STUDIO_DEV_API_PORT = 4333;

const api = createStudioDevApi(process.cwd());

function json404() {
  return new Response(JSON.stringify({ error: "Not found" }), {
    status: 404,
    headers: { "content-type": "application/json" },
  });
}

async function toRequest(req, chunks) {
  const url = `http://127.0.0.1:${STUDIO_DEV_API_PORT}${req.url ?? "/"}`;
  const init = { method: req.method ?? "GET", headers: { ...req.headers } };
  delete init.headers.host;
  delete init.headers.connection;
  if (init.method !== "GET" && init.method !== "HEAD") {
    init.body = Buffer.concat(chunks);
    init.duplex = "half";
  }
  return new Request(url, init);
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
