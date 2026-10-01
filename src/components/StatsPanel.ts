import { api, ApiError } from "../lib/api";
import { $, isLocalPreview } from "../lib/dom";
import { parseStatsSeed, type StatsSeedRow } from "../lib/schemas";
import { viewsLabel } from "../lib/views";

/**
 * Metrics page script: views over the past 30 days per painting, most
 * viewed first, with unsold paintings ahead of sold ones on ties. The
 * painting list is baked into the page and counts come from the analytics
 * API. Without counts, the rows still render with a note explaining why.
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
  // Render the rows right away without waiting for counts.
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
      // Explain a missing token. Other errors are covered by the
      // unconfigured branch above.
      if (err instanceof ApiError && err.status === 401) {
        const note = $("stats-note");
        note.innerHTML =
          `This needs your API token — enter it on the ` +
          `<a href="/admin/guide">Guide page</a>, then come back here.`;
      }
    });
}

// ClientRouter swaps pages without re-running this bundle, so init runs on
// astro:page-load, which fires on the first load and every navigation. The
// listener persists across swaps, so it needs no guard.
document.addEventListener("astro:page-load", () => init());
