import { api, ApiError } from "../lib/api";
import { $, isLocalPreview } from "../lib/dom";
import { parseStatsSeed, type StatsSeedRow } from "../lib/schemas";
import { viewsLabel } from "../lib/views";

/**
 * Views island (client-only): past-30-day views per painting, most
 * watched first. Titles ride baked into the page; counts arrive from
 * the analytics API. Anything less than real data leaves the table
 * count-less with plain words about why — never a blank page.
 */

function statusOf(r: StatsSeedRow): string {
  if (r.draft) return "Draft";
  return r.sold ? "Sold" : "Available";
}

function render(
  seed: StatsSeedRow[],
  counts: Map<string, number>,
): { rows: number; total: number } {
  const esc = (s: string): string =>
    s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  const rows = seed
    .map((r) => ({ ...r, views: counts.get(r.slug) ?? 0 }))
    .sort((a, b) => b.views - a.views || a.title.localeCompare(b.title));
  $("stats-body").innerHTML = rows
    .map(
      (r) =>
        `<tr><td>${esc(r.title)}</td>` +
        `<td>${statusOf(r)}</td>` +
        `<td class="num">${r.views > 0 ? viewsLabel(r.views) : "—"}</td></tr>`,
    )
    .join("");
  const total = rows.reduce((n, r) => n + r.views, 0);
  $("stats-total").textContent = total > 0 ? viewsLabel(total) : "—";
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
          ? "View counts live on the live site — this preview has none."
          : "No view counts yet — they appear once visitors arrive.";
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
