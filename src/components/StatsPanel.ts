import { api, ApiError } from "../lib/api";
import { $, isLocalPreview } from "../lib/dom";
import {
  parseStatsSeed,
  viewsSchema,
  type SiteMetrics,
  type StatsSeedRow,
} from "../lib/schemas";
import {
  bars,
  countryName,
  dayLabel,
  deviceLabel,
  trendSentence,
  visitsLabel,
} from "../lib/metrics-view";
import { viewsLabel } from "../lib/views";

/**
 * Metrics page script: visits over the past 30 days with a daily chart,
 * views per painting (most viewed first, unsold ahead of sold on ties),
 * and where visitors come from. The painting list is baked into the page
 * and counts come from the analytics API. Without counts, the rows still
 * render with a note explaining why.
 */

const SVG = "http://www.w3.org/2000/svg";

/** The last numbers this browser loaded, shown at once on the next visit
 * while fresh ones come from Cloudflare (about a second). Only counts, so
 * nothing private sits on her device. */
const CACHE_KEY = "studio-metrics-v1";

function readCache(): {
  views: Array<{ slug: string; views: number }>;
  metrics: SiteMetrics | null;
} | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw === null) return null;
    const parsed = viewsSchema.safeParse(JSON.parse(raw));
    return parsed.success
      ? { views: parsed.data.views, metrics: parsed.data.metrics ?? null }
      : null;
  } catch {
    return null;
  }
}

function writeCache(
  views: Array<{ slug: string; views: number }>,
  metrics: SiteMetrics,
): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ views, metrics }));
  } catch {
    // Storage blocked: the page just waits for the live numbers.
  }
}

/** Daily bars with a hover/tap readout; the hidden table reads them out. */
function renderChart(m: SiteMetrics): void {
  const svg = document.getElementById("stats-bars");
  const label = document.getElementById("stats-chart-label");
  const figure = document.getElementById("stats-chart");
  const first = document.getElementById("stats-first-day");
  const table = document.querySelector("#stats-table tbody");
  if (svg === null || label === null || figure === null) return;
  const geo = bars(m.days.map((d) => d.visits));
  const idle = "Tap or hover over a day to see its visits.";
  const nodes: Element[] = [];
  const base = document.createElementNS(SVG, "line");
  base.setAttribute("class", "base");
  base.setAttribute("x1", "0");
  base.setAttribute("x2", "300");
  base.setAttribute("y1", "80");
  base.setAttribute("y2", "80");
  nodes.push(base);
  m.days.forEach((day, i) => {
    const g = geo[i];
    if (g === undefined) return;
    const bar = document.createElementNS(SVG, "rect");
    bar.setAttribute("class", "bar");
    bar.setAttribute("x", g.x.toFixed(2));
    bar.setAttribute("y", g.y.toFixed(2));
    bar.setAttribute("width", g.w.toFixed(2));
    bar.setAttribute("height", g.h.toFixed(2));
    bar.setAttribute("rx", "1.5");
    // The hit area is the whole day's column, bigger than the bar.
    const hit = document.createElementNS(SVG, "rect");
    hit.setAttribute("class", "hit");
    hit.setAttribute("x", (g.x - 1).toFixed(2));
    hit.setAttribute("y", "0");
    hit.setAttribute("width", (g.w + 2).toFixed(2));
    hit.setAttribute("height", "80");
    const show = (): void => {
      for (const b of svg.querySelectorAll(".bar.on")) b.classList.remove("on");
      bar.classList.add("on");
      label.textContent = `${dayLabel(day.date)}: ${visitsLabel(day.visits)}`;
    };
    hit.addEventListener("pointerenter", show);
    hit.addEventListener("pointerdown", () => {
      svg.classList.add("picking");
      show();
    });
    nodes.push(bar, hit);
  });
  svg.replaceChildren(...nodes);
  // Drawn twice per visit (saved numbers, then fresh), wired once.
  if (svg.dataset.wired !== "1") {
    svg.dataset.wired = "1";
    svg.addEventListener("pointerleave", () => {
      if (svg.classList.contains("picking")) return;
      for (const b of svg.querySelectorAll(".bar.on")) b.classList.remove("on");
      label.textContent = idle;
    });
  }
  label.textContent = idle;
  if (first !== null && m.days[0] !== undefined)
    first.textContent = dayLabel(m.days[0].date);
  if (table !== null)
    table.replaceChildren(
      ...m.days.map((d) => {
        const tr = document.createElement("tr");
        const a = document.createElement("td");
        a.textContent = dayLabel(d.date);
        const b = document.createElement("td");
        b.textContent = String(d.visits);
        tr.appendChild(a);
        tr.appendChild(b);
        return tr;
      }),
    );
  figure.hidden = false;
}

/** A short list: name, count, and a thin bar for its share of the top. */
function renderList(
  id: string,
  rows: Array<{ name: string; value: string; n: number }>,
): void {
  const ul = document.getElementById(id);
  if (ul === null) return;
  if (rows.length === 0) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = "Nothing yet";
    ul.replaceChildren(li);
    return;
  }
  const top = Math.max(1, ...rows.map((r) => r.n));
  ul.replaceChildren(
    ...rows.map((r) => {
      const li = document.createElement("li");
      const name = document.createElement("span");
      name.textContent = r.name;
      const n = document.createElement("span");
      n.className = "n";
      n.textContent = r.value;
      const share = document.createElement("span");
      share.className = "share";
      share.style.width = `${Math.max(4, Math.round((r.n / top) * 100))}%`;
      li.appendChild(name);
      li.appendChild(n);
      li.appendChild(share);
      return li;
    }),
  );
}

function renderSite(m: SiteMetrics): void {
  const total = $("stats-total");
  total.textContent = m.visits.toLocaleString();
  total.removeAttribute("data-loading");
  $("stats-trend").textContent = trendSentence(m.visits, m.visitsBefore);
  renderChart(m);
  renderList(
    "stats-sources",
    m.sources.map((s) => ({
      name: s.name,
      value: s.visits.toLocaleString(),
      n: s.visits,
    })),
  );
  renderList(
    "stats-places",
    m.places.map((p) => ({
      name: countryName(p.code),
      value: p.visits.toLocaleString(),
      n: p.visits,
    })),
  );
  const devices = m.devices.reduce((n, d) => n + d.visits, 0);
  renderList(
    "stats-devices",
    m.devices.map((d) => ({
      name: deviceLabel(d.kind),
      value: `${Math.round((d.visits / Math.max(1, devices)) * 100)}%`,
      n: d.visits,
    })),
  );
}

function render(
  seed: StatsSeedRow[],
  counts: Map<string, number>,
): { rows: number; total: number } {
  const esc = (s: string): string =>
    s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  const rows = seed
    .map((r) => ({ ...r, views: counts.get(r.slug) ?? 0 }))
    .sort(
      (a, b) =>
        b.views - a.views ||
        Number(a.sold) - Number(b.sold) ||
        a.title.localeCompare(b.title),
    );
  const top = Math.max(1, ...rows.map((r) => r.views));
  $("stats-body").innerHTML = rows
    .map((r) => {
      const sold = r.sold ? `<span class="metric-sold"> · Sold</span>` : "";
      const bar =
        r.views > 0
          ? `<span class="metric-bar" style="width:${Math.max(4, Math.round((r.views / top) * 100))}%"></span>`
          : "";
      return (
        `<li class="metric-row">` +
        `<img class="metric-thumb" src="${esc(r.image)}" alt="" loading="lazy" width="96" height="96">` +
        `<a class="metric-title" href="/paintings/${esc(r.slug)}">${esc(r.title)}${sold}</a>` +
        `<span class="metric-views">${r.views > 0 ? viewsLabel(r.views) : "—"}</span>` +
        bar +
        `</li>`
      );
    })
    .join("");
  const total = rows.reduce((n, r) => n + r.views, 0);
  return { rows: rows.length, total };
}

function init(): void {
  const seedEl = document.getElementById("stats-seed");
  const seed =
    seedEl === null ? null : parseStatsSeed(seedEl.textContent ?? "");
  if (seed === null) {
    $("stats-note").textContent =
      "Couldn't read the painting list — reload the page and try again.";
    return;
  }
  // Render right away: last visit's numbers when this browser has them,
  // else the bare rows, then the fresh numbers replace them.
  const cached = readCache();
  render(seed, new Map(cached?.views.map((v) => [v.slug, v.views]) ?? []));
  if (cached?.metrics) renderSite(cached.metrics);
  api
    .paintingViews()
    .then(({ views, metrics, unconfigured }) => {
      if (metrics !== null) {
        renderSite(metrics);
        writeCache(views, metrics);
      }
      // No numbers to show: settle the waiting ellipsis on a plain dash.
      const totalEl = $("stats-total");
      if (totalEl.hasAttribute("data-loading")) {
        totalEl.textContent = "—";
        totalEl.removeAttribute("data-loading");
      }
      if (views.length === 0 && unconfigured) {
        $("stats-note").textContent = isLocalPreview()
          ? "Counts appear once buyers visit the live site."
          : "No views yet — counts appear as buyers visit.";
        return;
      }
      const { total } = render(
        seed,
        new Map(views.map((v) => [v.slug, v.views])),
      );
      $("stats-note").textContent =
        total === 0 && (metrics?.visits ?? 0) === 0
          ? "No visits in the past 30 days — yet."
          : "";
    })
    .catch((err: unknown) => {
      // The day-long sign-in ran out. Other errors are covered by the
      // unconfigured branch above.
      if (err instanceof ApiError && err.status === 401) {
        const note = $("stats-note");
        note.innerHTML =
          `Your sign-in has run out. ` +
          `<a href="/admin/metrics">Reload the page</a> to sign in again.`;
      }
    });
}

// ClientRouter swaps pages without re-running this bundle, so init runs on
// astro:page-load, which fires on the first load and every navigation. The
// listener persists across swaps, so it needs no guard.
document.addEventListener("astro:page-load", () => init());
