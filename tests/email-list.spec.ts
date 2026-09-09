import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";

/**
 * Double opt-in + one-click unsubscribe, end to end against the local
 * D1 (migrated) and the real Functions. Signup confirmation emails go
 * nowhere observable (Resend is server-side), so tests read the token
 * straight from local D1 and visit the same links a buyer would tap.
 * Addresses are unique per test; confirmed rows are removed in a
 * finally so counts never leak between tests (or runs).
 */

function stamp(): string {
  return `e2e-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}@example.com`;
}

function d1(sql: string): Array<Record<string, string | null>> {
  const out = execFileSync(
    "pnpm",
    [
      "wrangler",
      "d1",
      "execute",
      "art-gallery-db",
      "--local",
      "--json",
      "--command",
      sql,
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  const parsed = JSON.parse(out) as Array<{
    results?: Array<Record<string, string | null>>;
  }>;
  return parsed[0]?.results ?? [];
}

function rowOf(email: string): {
  token: string | null;
  confirmed_at: string | null;
} | null {
  const rows = d1(
    `SELECT token, confirmed_at FROM email_collectors WHERE email = '${email}'`,
  );
  const row = rows[0];
  if (row === undefined) return null;
  return {
    token: (row["token"] as string | null) ?? null,
    confirmed_at: (row["confirmed_at"] as string | null) ?? null,
  };
}

function forget(email: string): void {
  d1(`DELETE FROM email_collectors WHERE email = '${email}'`);
}

async function confirmedTotal(request: {
  get: (url: string) => Promise<{ json: () => Promise<{ total: number }> }>;
}): Promise<number> {
  return (await (await request.get("/api/collectors")).json()).total;
}

test("subscribe asks for confirmation, the link confirms", async ({ page }) => {
  const email = stamp();
  try {
    await page.goto("/");
    await page.locator("#notify-nav").click();
    await page.locator("#notify-email").fill(email);
    await page.locator("#notify-email-form button[type=submit]").click();
    await expect(page.locator("#notify-status")).toContainText(
      "Check your inbox",
    );
    const row = rowOf(email);
    expect(row?.confirmed_at).toBe(null);
    await page.goto(`/email/confirmed?token=${row?.token ?? "missing"}`);
    await expect(page.locator("#email-token-say")).toContainText(
      "You're on the list",
    );
    expect(rowOf(email)?.confirmed_at).not.toBe(null);
  } finally {
    forget(email);
  }
});

test("expired links don't confirm", async ({ page }) => {
  const email = stamp();
  try {
    const signup = await page.request.post("/api/collectors", {
      data: { email },
    });
    expect(signup.status()).toBe(201);
    d1(
      `UPDATE email_collectors SET token_created_at = '2020-01-01T00:00:00Z' WHERE email = '${email}'`,
    );
    const token = rowOf(email)?.token ?? "missing";
    await page.goto(`/email/confirmed?token=${token}`);
    await expect(page.locator("#email-token-say")).toContainText("didn't work");
    expect(rowOf(email)?.confirmed_at).toBe(null);
  } finally {
    forget(email);
  }
});

test("goodbye link removes in one tap", async ({ page, request }) => {
  const email = stamp();
  try {
    await request.post("/api/collectors", { data: { email } });
    const token = rowOf(email)?.token ?? "missing";
    const confirmed = await request.post("/api/collectors", {
      data: { action: "confirm", token },
    });
    expect(confirmed.ok()).toBe(true);
    await page.goto(`/email/goodbye?token=${token}`);
    await expect(page.locator("#email-token-say")).toContainText(
      "been removed",
    );
    expect(rowOf(email)).toBe(null);
    // Gone means joining starts over as pending, not "already".
    const again = await request.post("/api/collectors", { data: { email } });
    expect((await again.json()).already).toBe(false);
  } finally {
    forget(email);
  }
});

test("broadcast reaches confirmed addresses only", async ({ request }) => {
  const pending = stamp();
  const confirmed = stamp();
  try {
    const before = await confirmedTotal(request);
    await request.post("/api/collectors", { data: { email: pending } });
    await request.post("/api/collectors", { data: { email: confirmed } });
    const token = rowOf(confirmed)?.token ?? "missing";
    await request.post("/api/collectors", {
      data: { action: "confirm", token },
    });
    expect(await confirmedTotal(request)).toBe(before + 1);
    // emailTotal counts receivers; emailed depends on a live Resend key,
    // so only the count is asserted (one local send may still go out).
    const res = await request.post("/api/notify", {
      data: { push: false, email: true },
    });
    expect(res.ok()).toBe(true);
    expect((await res.json()).emailTotal).toBe(before + 1);
  } finally {
    forget(pending);
    forget(confirmed);
  }
});

test("modal leave button removes", async ({ page, request }) => {
  const email = stamp();
  try {
    await request.post("/api/collectors", { data: { email } });
    const token = rowOf(email)?.token ?? "missing";
    await request.post("/api/collectors", {
      data: { action: "confirm", token },
    });
    await page.goto("/");
    await page.locator("#notify-nav").click();
    await page.locator("#notify-email").fill(email);
    await page.locator("#notify-email-leave").click();
    await expect(page.locator("#notify-status")).toContainText("off the list");
    expect(rowOf(email)).toBe(null);
  } finally {
    forget(email);
  }
});
