import { api, ApiError } from "../lib/api";
import { $, isLocalPreview } from "../lib/dom";
import { parseStatsSeed, type StatsSeedRow } from "../lib/schemas";
import { viewsLabel } from "../lib/views";

/**
 * Metrics island (client-only): past-30-day views per painting, most
 * viewed first. Ties favor what's still for sale — sold works settle
 * below. Paintings ride baked into the page; counts arrive from
 * the analytics API. Anything less than real data leaves the rows
 * count-less with plain words about why — never a blank page.
 */

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
  $("stats-total").textContent = total > 0 ? String(total) : "—";
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
  // Count-less immediately: rows must not wait for the counts.
  render(seed, new Map());
  api
    .paintingViews()
    .then(({ views, unconfigured }) => {
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
        total === 0 ? "No views in the past 30 days — yet." : "";
    })
    .catch((err: unknown) => {
      // A missing token names itself and points at the fix; anything
      // else is already covered by the unconfigured branch above.
      if (err instanceof ApiError && err.status === 401) {
        const note = $("stats-note");
        note.innerHTML =
          `This needs your API token — enter it on the ` +
          `<a href="/admin/guide">Guide page</a>, then come back here.`;
      }
    });
}

// ClientRouter swaps studio pages without a full load — and skips
// re-running this bundle (same src), so DOMContentLoaded init leaves every
// later visit dead. astro:page-load fires on first load AND every visit;
// its document persists, so one listener covers all visits with no guard.
document.addEventListener("astro:page-load", () => init());
