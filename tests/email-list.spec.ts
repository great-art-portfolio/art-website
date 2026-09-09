import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import {
  expect,
  request as baseRequest,
  test,
  type APIRequestContext,
} from "@playwright/test";

/**
 * Double opt-in + unsubscribe, end to end through the real Functions.
 * A tiny in-spec mock stands in for Resend (the Pages runtime points
 * RESEND_API_BASE at it via playwright.config bindings), so subscribes,
 * taps, goodbyes, and broadcasts run with zero live calls. Nothing is
 * stored anywhere except the mock's memory: subscribing sends a
 * confirmation email, tapping its link creates the contact, leaving
 * deletes it. Addresses are unique per test; each test cleans up after
 * itself. When the server wasn't booted with the mock bindings (a reused
 * local server), the mock-backed tests skip and only the keyless
 * validation tests run.
 */

const MOCK_PORT = 4499;

interface MockContact {
  unsubscribed: boolean;
}

const contacts = new Map<string, MockContact>();
const emails: Array<{ to: string[]; subject: string; text: string }> = [];
const broadcasts: Array<{ subject: string; text: string }> = [];

function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (chunk: unknown) => {
      raw += String(chunk);
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(raw) as Record<string, unknown>);
      } catch {
        resolve({});
      }
    });
  });
}

function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

let mockServer: Server | null = null;

async function startMock(): Promise<boolean> {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const parts = url.pathname.split("/").filter((p) => p !== "");
    if (
      req.method === "GET" &&
      parts[0] === "segments" &&
      parts[2] === "contacts"
    ) {
      send(res, 200, {
        object: "list",
        has_more: false,
        data: [...contacts.entries()].map(([email, c]) => ({
          id: email,
          email,
          unsubscribed: c.unsubscribed,
        })),
      });
    } else if (
      req.method === "POST" &&
      parts[0] === "contacts" &&
      parts.length === 1
    ) {
      const body = await readJson(req);
      const email = typeof body["email"] === "string" ? body["email"] : "";
      if (email === "" || contacts.has(email)) {
        send(res, 400, { error: "exists" });
      } else {
        contacts.set(email, {
          unsubscribed: body["unsubscribed"] === true,
        });
        send(res, 200, { id: email });
      }
    } else if (
      req.method === "POST" &&
      parts[0] === "contacts" &&
      parts[2] === "segments"
    ) {
      const email = decodeURIComponent(parts[1] ?? "");
      if (!contacts.has(email)) send(res, 404, { error: "gone" });
      else send(res, 200, { id: email });
    } else if (
      req.method === "DELETE" &&
      parts[0] === "contacts" &&
      parts.length === 2
    ) {
      const email = decodeURIComponent(parts[1] ?? "");
      if (!contacts.has(email)) send(res, 404, { error: "gone" });
      else {
        contacts.delete(email);
        send(res, 200, { id: email });
      }
    } else if (req.method === "POST" && parts[0] === "emails") {
      const body = await readJson(req);
      emails.push({
        to: Array.isArray(body["to"]) ? (body["to"] as string[]) : [],
        subject: typeof body["subject"] === "string" ? body["subject"] : "",
        text: typeof body["text"] === "string" ? body["text"] : "",
      });
      send(res, 200, { id: "mock-email" });
    } else if (req.method === "POST" && parts[0] === "broadcasts") {
      const body = await readJson(req);
      broadcasts.push({
        subject: typeof body["subject"] === "string" ? body["subject"] : "",
        text: typeof body["text"] === "string" ? body["text"] : "",
      });
      send(res, 200, { id: "mock-broadcast" });
    } else {
      send(res, 404, { error: "mock: unknown route" });
    }
  });
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(MOCK_PORT, "127.0.0.1", () => resolve());
    });
    mockServer = server;
    return true;
  } catch {
    return false;
  }
}

function stamp(): string {
  return `e2e-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}@example.com`;
}

function confirmPartsOf(email: string): { email: string; token: string } {
  const mail = emails.find((m) => m.to.includes(email));
  expect(mail, `no confirmation email recorded for ${email}`).toBeTruthy();
  const match = /https:\/\/\S+/.exec(mail?.text ?? "");
  expect(match, "confirmation email carries no link").toBeTruthy();
  // The emailed link is absolute (production host) — replay its params
  // against the local server, which runs the same Functions.
  const url = new URL(match?.[0] ?? "https://barbart.ca/");
  return {
    email: url.searchParams.get("email") ?? "",
    token: url.searchParams.get("token") ?? "",
  };
}

function confirmPathOf(email: string): string {
  const parts = confirmPartsOf(email);
  return `/email/confirmed?email=${encodeURIComponent(parts.email)}&token=${parts.token}`;
}

let mockBacked = false;

test.beforeAll(async () => {
  if (!(await startMock())) return;
  // Prove the running server actually talks to this mock (not a reused
  // server with live bindings): a probe subscribe must land here.
  const api = await baseRequest.newContext({
    baseURL: "http://127.0.0.1:4331",
  });
  try {
    const probe = `probe-${process.pid}@example.com`;
    const res = await api.post("/api/collectors", {
      data: { email: probe },
    });
    mockBacked =
      res.status() === 201 && emails.some((m) => m.to.includes(probe));
    if (mockBacked) {
      await api.post("/api/collectors", {
        data: { action: "unsubscribe", email: probe },
      });
      emails.length = 0;
    }
  } finally {
    await api.dispose();
  }
});

test.afterAll(async () => {
  if (mockServer !== null) {
    await new Promise<void>((resolve) => mockServer?.close(() => resolve()));
    mockServer = null;
  }
});

async function leave(request: APIRequestContext, email: string): Promise<void> {
  await request.post("/api/collectors", {
    data: { action: "unsubscribe", email },
  });
}

test("subscribe asks for confirmation, the link confirms", async ({
  page,
  request,
}) => {
  test.skip(!mockBacked, "server isn't bound to the mock Resend");
  const email = stamp();
  try {
    await page.goto("/");
    await page.locator("#notify-nav").click();
    await page.locator("#notify-email").fill(email);
    await page.locator("#notify-email-form button[type=submit]").click();
    await expect(page.locator("#notify-status")).toContainText(
      "Check your inbox",
    );
    expect(contacts.has(email)).toBe(false);
    await page.goto(confirmPathOf(email));
    await expect(page.locator("#email-token-say")).toContainText(
      "You're on the list",
    );
    expect(contacts.get(email)).toEqual({ unsubscribed: false });
    // Tapping twice stays on the list.
    await page.goto(confirmPathOf(email));
    await expect(page.locator("#email-token-say")).toContainText(
      "You're on the list",
    );
  } finally {
    await leave(request, email);
  }
});

test("already confirmed rejoins silently", async ({ request }) => {
  test.skip(!mockBacked, "server isn't bound to the mock Resend");
  const email = stamp();
  try {
    const first = await request.post("/api/collectors", { data: { email } });
    expect(first.status()).toBe(201);
    await page_goto_confirm(request, email);
    const again = await request.post("/api/collectors", { data: { email } });
    expect((await again.json()).already).toBe(true);
    expect(emails.filter((m) => m.to.includes(email)).length).toBe(1);
  } finally {
    await leave(request, email);
  }
});

async function page_goto_confirm(
  request: APIRequestContext,
  email: string,
): Promise<void> {
  // Confirm through the API (the page flow is covered above); the link
  // the email carried is what a buyer taps.
  const parts = confirmPartsOf(email);
  const res = await request.post("/api/collectors", {
    data: {
      action: "confirm",
      email: parts.email,
      token: parts.token,
    },
  });
  expect((await res.json()).ok).toBe(true);
}

test("tampered links don't confirm", async ({ page }) => {
  await page.goto(
    "/email/confirmed?email=a%40example.com&token=forged-token-here",
  );
  await expect(page.locator("#email-token-say")).toContainText("didn't work");
});

test("modal leave button removes", async ({ page, request }) => {
  test.skip(!mockBacked, "server isn't bound to the mock Resend");
  const email = stamp();
  try {
    await request.post("/api/collectors", { data: { email } });
    await page_goto_confirm(request, email);
    expect(contacts.has(email)).toBe(true);
    await page.goto("/");
    await page.locator("#notify-nav").click();
    await page.locator("#notify-email").fill(email);
    await page.locator("#notify-email-leave").click();
    await expect(page.locator("#notify-status")).toContainText("off the list");
    expect(contacts.has(email)).toBe(false);
    const goodbye = emails.find(
      (m) => m.to.includes(email) && /Removed/.test(m.subject),
    );
    expect(goodbye, "goodbye email recorded").toBeTruthy();
  } finally {
    await leave(request, email);
  }
});

test("broadcast reaches the segment in one call", async ({ request }) => {
  test.skip(!mockBacked, "server isn't bound to the mock Resend");
  const email = stamp();
  const before = broadcasts.length;
  try {
    await request.post("/api/collectors", { data: { email } });
    await page_goto_confirm(request, email);
    const res = await request.post("/api/notify", {
      data: { push: false, email: true },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.emailed).toBe(true);
    expect(body.emailTotal).toBe(1);
    expect(broadcasts.length).toBe(before + 1);
    expect(broadcasts[before]?.text).toContain("{{{RESEND_UNSUBSCRIBE_URL}}}");
  } finally {
    await leave(request, email);
  }
});

test("rejects a bad address before touching Resend", async ({ request }) => {
  const res = await request.post("/api/collectors", {
    data: { email: "nope" },
  });
  expect(res.status()).toBe(400);
});

test("pages without links explain themselves", async ({ page }) => {
  await page.goto("/email/confirmed");
  await expect(page.locator("#email-token-say")).toContainText(
    "needs its link",
  );
  await page.goto("/email/goodbye");
  await expect(page.locator("#email-token-say")).toContainText(
    "needs its link",
  );
});
