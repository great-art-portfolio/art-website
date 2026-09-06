import type { AppEnv } from "../_lib/env";
import { json, requireAdmin, serverError } from "../_lib/http";

/**
 * Admin: most-viewed painting pages (past 30 days) from Cloudflare Web
 * Analytics, so mom sees it in /admin instead of the Cloudflare dashboard.
 *
 * Needs three vars (see wrangler.toml): CF_ACCOUNT_ID, CF_ANALYTICS_TOKEN
 * (API token with Account Analytics: Read), CF_ANALYTICS_SITE (the beacon
 * token — it doubles as the site tag). Missing any of them returns
 * { unconfigured: true } and the admin UI shows the setup hint.
 */

interface RumRow {
  dimensions: { pathname?: string };
  sum: { pageViews?: number };
}

export const onRequestGet: PagesFunction<AppEnv> = async (context) => {
  const denied = requireAdmin(context.request, context.env);
  if (denied !== null) return denied;
  const account = context.env.CF_ACCOUNT_ID ?? "";
  const token = context.env.CF_ANALYTICS_TOKEN ?? "";
  const site = context.env.CF_ANALYTICS_SITE ?? "";
  if (account === "" || token === "" || site === "") {
    return json({ unconfigured: true, views: [] });
  }
  const to = new Date();
  const from = new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
  try {
    const res = await fetch("https://api.cloudflare.com/client/v4/graphql", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: `query Views($accountTag: String!, $siteTag: String!, $from: Time!, $to: Time!) {
          viewer {
            accounts(filter: { accountTag: $accountTag }) {
              rumPageloadEventsAdaptiveGroups(
                limit: 50
                filter: { datetime_geq: $from, datetime_leq: $to, siteTag: $siteTag }
                orderBy: [sum_pageViews_DESC]
              ) {
                dimensions { pathname }
                sum { pageViews }
              }
            }
          }
        }`,
        variables: {
          accountTag: account,
          siteTag: site,
          from: from.toISOString(),
          to: to.toISOString(),
        },
      }),
    });
    if (!res.ok) throw new Error(`Cloudflare API ${res.status}`);
    const data = (await res.json()) as {
      data?: {
        viewer?: {
          accounts?: Array<{ rumPageloadEventsAdaptiveGroups?: RumRow[] }>;
        };
      };
      errors?: Array<{ message?: string }>;
    };
    const rows =
      data.data?.viewer?.accounts?.[0]?.rumPageloadEventsAdaptiveGroups ?? [];
    const views = rows
      .filter((r) => (r.dimensions.pathname ?? "").startsWith("/paintings/"))
      .map((r) => ({
        slug: (r.dimensions.pathname ?? "")
          .replace("/paintings/", "")
          .replace(/\/$/, ""),
        views: r.sum.pageViews ?? 0,
      }))
      .filter((v) => v.slug !== "")
      .slice(0, 10);
    return json({ views });
  } catch (err) {
    console.error(err);
    return serverError("Analytics lookup failed.");
  }
};
