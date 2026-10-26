/** Turns Cloudflare Web Analytics rows into the studio's Metrics page, in
 * plain terms: visits over time, which paintings, where people come from,
 * where they are, and phone or computer. The studio's own pages and local
 * test copies are filtered out in the query (see METRICS_QUERY). */

export interface MetricsRows {
  days: Array<{
    count: number;
    dimensions: { date: string };
    sum: { visits: number };
  }>;
  before: Array<{ count: number; sum: { visits: number } }>;
  pages: Array<{ count: number; dimensions: { requestPath: string } }>;
  sources: Array<{
    dimensions: { refererHost: string };
    sum: { visits: number };
  }>;
  places: Array<{
    dimensions: { countryName: string };
    sum: { visits: number };
  }>;
  devices: Array<{
    dimensions: { deviceType: string };
    sum: { visits: number };
  }>;
}

export interface Metrics {
  /** One entry per day of the window, oldest first, zeros included. */
  days: Array<{ date: string; visits: number; views: number }>;
  visits: number;
  views: number;
  /** Visits in the 30 days before the window, for "up / down". */
  visitsBefore: number;
  paintings: Array<{ slug: string; views: number }>;
  sources: Array<{ name: string; visits: number }>;
  /** ISO country codes; the page names them in her language. */
  places: Array<{ code: string; visits: number }>;
  devices: Array<{ kind: "phone" | "computer" | "tablet"; visits: number }>;
}

const FILTER = `siteTag: $site, requestHost: $host, requestPath_notlike: "/admin%"`;

/** One request for the whole page. Visits are sessions; views are page
 * loads. */
export const METRICS_QUERY = `query Metrics($account: String!, $site: String!, $host: String!, $from: Time!, $to: Time!, $before: Time!) {
  viewer {
    accounts(filter: { accountTag: $account }) {
      days: rumPageloadEventsAdaptiveGroups(limit: 40, filter: { datetime_geq: $from, datetime_leq: $to, ${FILTER} }, orderBy: [date_ASC]) { count dimensions { date } sum { visits } }
      before: rumPageloadEventsAdaptiveGroups(limit: 1, filter: { datetime_geq: $before, datetime_lt: $from, ${FILTER} }) { count sum { visits } }
      pages: rumPageloadEventsAdaptiveGroups(limit: 100, filter: { datetime_geq: $from, datetime_leq: $to, ${FILTER}, requestPath_like: "/paintings/%" }, orderBy: [count_DESC]) { count dimensions { requestPath } }
      sources: rumPageloadEventsAdaptiveGroups(limit: 50, filter: { datetime_geq: $from, datetime_leq: $to, ${FILTER} }, orderBy: [sum_visits_DESC]) { dimensions { refererHost } sum { visits } }
      places: rumPageloadEventsAdaptiveGroups(limit: 10, filter: { datetime_geq: $from, datetime_leq: $to, ${FILTER} }, orderBy: [sum_visits_DESC]) { dimensions { countryName } sum { visits } }
      devices: rumPageloadEventsAdaptiveGroups(limit: 5, filter: { datetime_geq: $from, datetime_leq: $to, ${FILTER} }, orderBy: [sum_visits_DESC]) { dimensions { deviceType } sum { visits } }
    }
  }
}`;

/** A referring site in words she'd use. "" is someone who typed the
 * address, used a bookmark, or tapped a link in an app or email. */
export function sourceName(host: string, ownHost: string): string | null {
  const h = host.toLowerCase().replace(/^www\./, "");
  if (h === ownHost || h === "127.0.0.1" || h === "localhost") return null;
  if (h === "") return "Typed in, bookmarks, apps and email";
  const known: Array<[RegExp, string]> = [
    [/(^|\.)google\./, "Google"],
    [/(^|\.)bing\.com$/, "Bing"],
    [/(^|\.)duckduckgo\.com$/, "DuckDuckGo"],
    [/(^|\.)instagram\.com$/, "Instagram"],
    [/(^|\.)(facebook\.com|fb\.com|fb\.me)$/, "Facebook"],
    [/(^|\.)pinterest\./, "Pinterest"],
    [/(^|\.)(t\.co|twitter\.com|x\.com)$/, "X (Twitter)"],
    [/(^|\.)threads\.net$/, "Threads"],
    [/(^|\.)reddit\.com$/, "Reddit"],
    [/(^|\.)linkedin\.com$/, "LinkedIn"],
    [/(^|\.)(mail\.google\.com|outlook\.live\.com|mail\.yahoo\.com)$/, "Email"],
  ];
  for (const [re, name] of known) if (re.test(h)) return name;
  return h;
}

function dayKeys(from: Date, to: Date): string[] {
  const keys: string[] = [];
  const d = new Date(
    Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()),
  );
  for (; d <= to; d.setUTCDate(d.getUTCDate() + 1))
    keys.push(d.toISOString().slice(0, 10));
  return keys;
}

export function buildMetrics(
  rows: MetricsRows,
  window: { from: Date; to: Date },
  ownHost: string,
): Metrics {
  const byDay = new Map(rows.days.map((d) => [d.dimensions.date, d]));
  const days = dayKeys(window.from, window.to).map((date) => ({
    date,
    visits: byDay.get(date)?.sum.visits ?? 0,
    views: byDay.get(date)?.count ?? 0,
  }));
  // /paintings/x and /paintings/x/ are the same page.
  const paintingViews = new Map<string, number>();
  for (const p of rows.pages) {
    const slug = p.dimensions.requestPath
      .replace(/^\/paintings\//, "")
      .replace(/\/+$/, "");
    if (slug === "" || slug.includes("/")) continue;
    paintingViews.set(slug, (paintingViews.get(slug) ?? 0) + p.count);
  }
  const sources = new Map<string, number>();
  for (const s of rows.sources) {
    const name = sourceName(s.dimensions.refererHost, ownHost);
    if (name === null || s.sum.visits <= 0) continue;
    sources.set(name, (sources.get(name) ?? 0) + s.sum.visits);
  }
  const deviceKind = (t: string): "phone" | "computer" | "tablet" =>
    t === "mobile" ? "phone" : t === "tablet" ? "tablet" : "computer";
  const devices = new Map<"phone" | "computer" | "tablet", number>();
  for (const d of rows.devices) {
    const k = deviceKind(d.dimensions.deviceType);
    devices.set(k, (devices.get(k) ?? 0) + d.sum.visits);
  }
  const byCount = <T extends { visits: number }>(a: T, b: T): number =>
    b.visits - a.visits;
  return {
    days,
    visits: days.reduce((n, d) => n + d.visits, 0),
    views: days.reduce((n, d) => n + d.views, 0),
    visitsBefore: rows.before[0]?.sum.visits ?? 0,
    paintings: [...paintingViews]
      .map(([slug, views]) => ({ slug, views }))
      .sort((a, b) => b.views - a.views),
    sources: [...sources]
      .map(([name, visits]) => ({ name, visits }))
      .sort(byCount)
      .slice(0, 6),
    places: rows.places
      .filter((p) => p.dimensions.countryName !== "" && p.sum.visits > 0)
      .map((p) => ({ code: p.dimensions.countryName, visits: p.sum.visits }))
      .slice(0, 5),
    devices: [...devices]
      .map(([kind, visits]) => ({ kind, visits }))
      .filter((d) => d.visits > 0)
      .sort(byCount),
  };
}
