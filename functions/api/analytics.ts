import type { AppEnv } from "../_lib/env";
import { json, requireAdmin, serverError } from "../_lib/http";
import { buildMetrics, METRICS_QUERY, type MetricsRows } from "../_lib/metrics";

/**
 * Admin: the past 30 days of visits from Cloudflare Web Analytics (free, no
 * cookies), for the studio's Metrics page and the collection's view counts.
 * Public pages on the live site only: the studio and local copies are left
 * out.
 *
 * Needs CF_ACCOUNT_ID, CF_ANALYTICS_TOKEN (an API token with Account
 * Analytics: Read), and CF_ANALYTICS_SITE (the Web Analytics site tag, which
 * is NOT the beacon token). Without them it returns { unconfigured: true }.
 */
export const onRequestGet: PagesFunction<AppEnv> = async (context) => {
  const denied = await requireAdmin(context.request, context.env);
  if (denied !== null) return denied;
  const account = context.env.CF_ACCOUNT_ID ?? "";
  const token = context.env.CF_ANALYTICS_TOKEN ?? "";
  const site = context.env.CF_ANALYTICS_SITE ?? "";
  if (account === "" || token === "" || site === "") {
    return json({ unconfigured: true, views: [] });
  }
  const host = new URL(context.env.SITE_URL ?? "https://barbart.ca").hostname;
  const to = new Date();
  const from = new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
  const before = new Date(from.getTime() - 30 * 24 * 60 * 60 * 1000);
  try {
    const res = await fetch("https://api.cloudflare.com/client/v4/graphql", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: METRICS_QUERY,
        variables: {
          account,
          site,
          host,
          from: from.toISOString(),
          to: to.toISOString(),
          before: before.toISOString(),
        },
      }),
    });
    if (!res.ok) throw new Error(`Cloudflare API ${res.status}`);
    const data = (await res.json()) as {
      data?: { viewer?: { accounts?: Array<Partial<MetricsRows>> } };
      errors?: Array<{ message?: string }> | null;
    };
    if (
      data.errors !== undefined &&
      data.errors !== null &&
      data.errors.length > 0
    )
      throw new Error(`Cloudflare API: ${data.errors[0]?.message ?? "error"}`);
    const raw = data.data?.viewer?.accounts?.[0] ?? {};
    const metrics = buildMetrics(
      {
        days: raw.days ?? [],
        before: raw.before ?? [],
        pages: raw.pages ?? [],
        sources: raw.sources ?? [],
        places: raw.places ?? [],
        devices: raw.devices ?? [],
      },
      { from, to },
      host,
    );
    return json({ views: metrics.paintings, metrics });
  } catch (err) {
    console.error(err);
    return serverError("Analytics lookup failed.");
  }
};
