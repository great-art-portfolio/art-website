import { api, type ApiInquiry, type ApiPainting } from "../lib/api";
import { loadImageFile, prepareImage } from "../lib/image";
import { buildCaption, sharePainting } from "../lib/share";
import { dollarsToCents, formatCAD } from "../lib/money";
import { formatDimensions } from "../lib/dims";

/**
 * Admin island (client-only): upload paintings, share kit, inbox, fulfillment.
 * Protected in production by Cloudflare Access; ADMIN_API_TOKEN is local backup.
 */

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (el === null) throw new Error(`Missing #${id}`);
  return el as T;
};

let loadedImage: HTMLImageElement | null = null;
let preparedBlob: Blob | null = null;
let lastPreviewUrl: string | null = null;
let rotation: 0 | 90 | 180 | 270 = 0;
let lastSaved: { painting: ApiPainting; caption: string } | null = null;
let cachePaintings: ApiPainting[] = [];
let cacheInquiries: ApiInquiry[] = [];
let cacheViews: Array<{ slug: string; views: number }> = [];

function renderStats(): void {
  const listed = cachePaintings.length;
  const available = cachePaintings.filter((p) => p.status === "available").length;
  const fresh = cacheInquiries.filter((q) => q.status === "new").length;
  const views = cacheViews.reduce((sum, v) => sum + v.views, 0);
  $("admin-stats").textContent =
    `${listed} listed · ${available} available · ${fresh} new inquiries · ${views} views`;
}

function greet(): void {
  const hour = new Date().getHours();
  const part = hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
  $("admin-greeting").textContent = `Good ${part} — here's your studio.`;
}

function setStatus(msg: string, isError = false): void {
  const el = $("admin-status");
  el.textContent = msg;
  el.dataset.tone = isError ? "error" : "ok";
}

async function refreshPreview(): Promise<void> {
  if (loadedImage === null) return;
  const prepared = await prepareImage(loadedImage, rotation);
  if (lastPreviewUrl !== null) URL.revokeObjectURL(lastPreviewUrl);
  preparedBlob = prepared.blob;
  lastPreviewUrl = prepared.previewUrl;
  const img = $<HTMLImageElement>("photo-preview");
  img.src = prepared.previewUrl;
  img.hidden = false;
  $("photo-meta").textContent = `${prepared.width} × ${prepared.height} px`;
}

async function refreshInbox(): Promise<void> {
  const list = $("inbox-list");
  try {
    const inquiries: ApiInquiry[] = await api.listInquiries();
    cacheInquiries = inquiries;
    renderStats();
    await updateBadge(inquiries.filter((q) => q.status === "new").length);
    if (inquiries.length === 0) {
      list.innerHTML = "<li>No inquiries yet.</li>";
      return;
    }
    list.innerHTML = inquiries
      .map(
        (q) =>
          `<li><strong>${escapeHtml(q.buyer_name)}</strong> (${escapeHtml(q.buyer_email)}) ` +
          `about <em>${escapeHtml(q.painting_title)}</em> — ${escapeHtml(q.status)}<br>` +
          `<span>${escapeHtml(q.message === "" ? "(no message)" : q.message)}</span></li>`,
      )
      .join("");
  } catch (err) {
    list.innerHTML = `<li>Could not load inbox: ${escapeHtml((err as Error).message)}</li>`;
  }
}

async function refreshViews(): Promise<void> {
  const list = $("views-list");
  try {
    const views = await api.paintingViews();
    cacheViews = views;
    renderStats();
    if (views.length === 0) {
      list.innerHTML = "<li>No views yet.</li>";
      return;
    }
    list.innerHTML = views
      .slice(0, 10)
      .map((v) => `<li><em>${escapeHtml(v.slug)}</em> — ${v.views} views</li>`)
      .join("");
  } catch (err) {
    list.innerHTML = `<li>Could not load views: ${escapeHtml((err as Error).message)}</li>`;
  }
}

async function refreshCollection(): Promise<void> {
  const list = $("collection-list");
  try {
    const paintings = await api.listPaintings();
    cachePaintings = paintings;
    renderStats();
    if (paintings.length === 0) {
      list.innerHTML = "<li>Nothing listed yet — add your first painting above.</li>";
      return;
    }
    list.innerHTML = paintings
      .map(
        (p) =>
          `<li data-id="${escapeHtml(p.id)}">` +
          `<strong>${escapeHtml(p.title)}</strong> — ${formatCAD(p.price_cents)} — ${escapeHtml(p.status)}` +
          (formatDimensions(p.width_in, p.height_in, p.depth_in) === ""
            ? ""
            : ` — ${escapeHtml(formatDimensions(p.width_in, p.height_in, p.depth_in))}`) +
          `<br>` +
          `<span class="row">` +
          `<button type="button" data-status="draft">Draft</button>` +
          `<button type="button" data-status="available">Publish</button>` +
          `<button type="button" data-status="reserved">Reserved</button>` +
          `<button type="button" data-status="sold">Sold</button>` +
          `<button type="button" data-edit="1">Edit</button>` +
          `<button type="button" data-copy="1">Copy link</button>` +
          `<button type="button" data-delete="1">Delete</button>` +
          `</span></li>`,
      )
      .join("");
  } catch (err) {
    list.innerHTML = `<li>Could not load collection: ${escapeHtml((err as Error).message)}</li>`;
  }
}

function armCollectionActions(): void {
  $("collection-list").addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest("button");
    const item = (e.target as HTMLElement).closest("li[data-id]");
    if (btn === null || item === null) return;
    const id = (item as HTMLElement).dataset["id"] ?? "";
    if (btn.dataset["copy"] === "1") {
      const url = `${window.location.origin}/art?slug=${encodeURIComponent(id)}`;
      navigator.clipboard
        .writeText(url)
        .then(() => setStatus("Link copied — text it to your buyer."))
        .catch(() => setStatus("Copy failed — long-press the gallery link instead.", true));
      return;
    }
    if (btn.dataset["delete"] === "1") {
      if (!window.confirm("Delete this painting? This cannot be undone.")) return;
      api
        .deletePainting(id)
        .then(() => {
          setStatus("Deleted.");
          return refreshCollection();
        })
        .catch((err: unknown) => setStatus((err as Error).message, true));
      return;
    }
    const status = btn.dataset["status"];
    if (
      status === "draft" ||
      status === "available" ||
      status === "reserved" ||
      status === "sold"
    ) {
      api
        .updatePainting(id, { status })
        .then(() => {
          setStatus(
            status === "available" ? "Published — it's live on the site." : `Marked as ${status}.`,
          );
          return refreshCollection();
        })
        .catch((err: unknown) => setStatus((err as Error).message, true));
      return;
    }
    if (btn.dataset["edit"] === "1") {
      openEditForm(item as HTMLElement, id);
      return;
    }
    if (btn.dataset["save"] === "1") {
      saveEditForm(id);
    }
  });
}

function openEditForm(item: HTMLElement, id: string): void {
  const p = cachePaintings.find((x) => x.id === id);
  if (p === undefined) return;
  const dims = (n: number | null): string => (n === null ? "" : String(n));
  item.innerHTML =
    `<label>Title <input id="ed-title" type="text" maxlength="120" value="${escapeHtml(p.title)}" /></label>` +
    `<label>Price (CAD) <input id="ed-price" type="number" min="1" step="0.01" inputmode="decimal" value="${(p.price_cents / 100).toFixed(2)}" /></label>` +
    `<label>Description <textarea id="ed-desc" rows="3" maxlength="2000">${escapeHtml(p.description)}</textarea></label>` +
    `<div class="row">` +
    `<label>W (in) <input id="ed-w" type="number" min="1" step="0.5" inputmode="decimal" value="${dims(p.width_in)}" /></label>` +
    `<label>H (in) <input id="ed-h" type="number" min="1" step="0.5" inputmode="decimal" value="${dims(p.height_in)}" /></label>` +
    `<label>D (in) <input id="ed-d" type="number" min="0.5" step="0.5" inputmode="decimal" value="${dims(p.depth_in)}" /></label>` +
    `</div>` +
    `<span class="row"><button type="button" data-save="1">Save</button></span>`;
}

function saveEditForm(id: string): void {
  const title = ($("ed-title") as HTMLInputElement).value.trim();
  const price = Number(($("ed-price") as HTMLInputElement).value);
  const priceCents = dollarsToCents(price);
  if (title === "" || priceCents === null) {
    setStatus("Title and a valid price are required.", true);
    return;
  }
  const dim = (eid: string): number | null => {
    const raw = ($(eid) as HTMLInputElement).value.trim();
    if (raw === "") return null; // blank keeps the old value server-side
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  api
    .updatePainting(id, {
      title,
      priceCents,
      description: ($("ed-desc") as HTMLTextAreaElement).value.trim(),
      widthIn: dim("ed-w"),
      heightIn: dim("ed-h"),
      depthIn: dim("ed-d"),
    })
    .then(() => {
      setStatus("Saved.");
      return refreshCollection();
    })
    .catch((err: unknown) => setStatus((err as Error).message, true));
}

/** Inline <model-viewer> test so she can try AR before buyers do. */
function showArPreview(glbUrl: string, usdzUrl: string): void {
  const mount = $("ar-preview");
  mount.hidden = false;
  mount.innerHTML = "";
  void import("@google/model-viewer")
    .then(() => {
      const el = document.createElement("model-viewer") as unknown as HTMLElement;
      el.setAttribute("src", glbUrl);
      el.setAttribute("ios-src", usdzUrl);
      el.setAttribute("ar", "");
      el.setAttribute("ar-modes", "webxr scene-viewer quick-look");
      el.setAttribute("ar-scale", "fixed");
      el.setAttribute("ar-placement", "wall");
      el.setAttribute("camera-controls", "");
      el.setAttribute("alt", "AR preview");
      el.style.width = "100%";
      el.style.height = "22rem";
      el.style.borderRadius = "0.6rem";
      mount.appendChild(el);
    })
    .catch(() => {
      mount.textContent = "AR preview unavailable in this browser.";
    });
}

/** Tell her what this browser can do (Safari vs Chrome, online vs offline). */
async function refreshCapabilities(): Promise<void> {
  const sw = "serviceWorker" in navigator ? "on" : "unavailable";
  let sync = "unavailable";
  try {
    const reg = (await navigator.serviceWorker.ready) as ServiceWorkerRegistration & {
      sync?: unknown;
    };
    sync = reg.sync === undefined ? "unavailable (lists still refresh online)" : "on";
  } catch {
    // No service worker — offline mode unavailable.
  }
  const net = navigator.onLine ? "online" : "offline";
  $("cap-sw").textContent = sw;
  $("cap-sync").textContent = sync;
  $("cap-net").textContent = net;
  window.addEventListener("online", () => {
    $("cap-net").textContent = "online";
  });
  window.addEventListener("offline", () => {
    $("cap-net").textContent = "offline";
  });
}

/** Show pending inquiries on the home-screen icon (iOS/Safari PWA + Chromium). */
async function updateBadge(count: number): Promise<void> {
  try {
    const nav = navigator as Navigator & {
      setAppBadge?: (n: number) => Promise<void>;
      clearAppBadge?: () => Promise<void>;
    };
    if (count > 0) await nav.setAppBadge?.(count);
    else await nav.clearAppBadge?.();
  } catch {
    // Badging unsupported — the inbox list is the source of truth.
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

async function refreshFlags(): Promise<void> {
  try {
    const s = await api.status();
    $("flag-email").textContent = s.email ? "on" : "off";
    $("flag-push").textContent = s.push ? "on" : "off";
    $("flag-stripe").textContent = s.stripe ? "on" : "off";
    $("flag-shippo").textContent = s.shippo ? "on" : "off";
    $("flag-social").textContent = s.socialPost ? "on (auto)" : "share kit";
  } catch {
    // API not reachable locally until wrangler pages dev.
  }
}

function init(): void {
  greet();

  api
    .getAnnouncement()
    .then((text) => {
      ($("f-announce") as HTMLTextAreaElement).value = text;
    })
    .catch(() => {
      // API not provisioned yet — editor still works once it is.
    });

  $("announce-save").addEventListener("click", () => {
    const text = ($("f-announce") as HTMLTextAreaElement).value;
    api
      .setAnnouncement(text)
      .then(() => setStatus(text === "" ? "Banner cleared." : "Banner updated on the homepage."))
      .catch((err: unknown) => setStatus((err as Error).message, true));
  });

  const tokenInput = $("admin-token") as HTMLInputElement;
  tokenInput.value = sessionStorage.getItem("ADMIN_API_TOKEN") ?? "";
  tokenInput.addEventListener("change", () => {
    sessionStorage.setItem("ADMIN_API_TOKEN", tokenInput.value.trim());
    setStatus("Token saved on this device.");
    void refreshInbox();
    void refreshFlags();
  });

  const fileInput = $("photo-file") as HTMLInputElement;
  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (file === undefined) return;
    rotation = 0;
    loadImageFile(file)
      .then(async (img) => {
        loadedImage = img;
        await refreshPreview();
      })
      .catch((err: unknown) => setStatus((err as Error).message, true));
  });

  for (const deg of [90, 270] as const) {
    $(`rotate-${deg}`).addEventListener("click", () => {
      rotation = ((rotation + deg) % 360) as 0 | 90 | 180 | 270;
      void refreshPreview().catch((err: unknown) => setStatus((err as Error).message, true));
    });
  }

  $("upload-form").addEventListener("submit", (e) => {
    e.preventDefault();
    void (async () => {
      const title = ($("f-title") as HTMLInputElement).value.trim();
      const price = Number(($("f-price") as HTMLInputElement).value);
      const priceCents = dollarsToCents(price);
      if (title === "" || priceCents === null) {
        setStatus("Title and a valid price are required.", true);
        return;
      }
      if (preparedBlob === null) {
        setStatus("Choose a photo first.", true);
        return;
      }
      setStatus("Uploading photo…");
      try {
        const numOrNull = (id: string): number | null => {
          const n = Number(($(id) as HTMLInputElement).value);
          return Number.isFinite(n) && n > 0 ? n : null;
        };
        const upload = await api.uploadImage(preparedBlob);
        const widthIn = numOrNull("f-w");
        const heightIn = numOrNull("f-h");
        const depthIn = numOrNull("f-d");
        let modelGlbUrl = "";
        let modelUsdzUrl = "";
        if (($("f-ar") as HTMLInputElement).checked) {
          setStatus("Building AR preview… (true size, takes a few seconds)");
          try {
            const { buildArModels, estimateDims } = await import("../lib/ar");
            // Decode the prepared (rotated/cropped) photo so the model
            // matches exactly what buyers see.
            const arImg = await loadImageFile(
              new File([preparedBlob], "ar-source.jpg", { type: "image/jpeg" }),
            );
            const dims = estimateDims(arImg, widthIn, heightIn, depthIn);
            const models = await buildArModels(arImg, dims.w, dims.h, dims.d);
            setStatus("Uploading AR preview…");
            const [glb, usdz] = await Promise.all([
              api.uploadModel(models.glb, "painting.glb"),
              api.uploadModel(models.usdz, "painting.usdz"),
            ]);
            modelGlbUrl = glb.url;
            modelUsdzUrl = usdz.url;
            showArPreview(modelGlbUrl, modelUsdzUrl);
          } catch (err) {
            console.error(err);
            setStatus("AR build failed — saving without it. You can retry next time.");
          }
        }
        setStatus("Saving painting…");
        const painting = await api.createPainting({
          title,
          priceCents,
          alt: ($("f-alt") as HTMLInputElement).value.trim(),
          description: ($("f-desc") as HTMLTextAreaElement).value.trim(),
          imageKey: upload.key,
          imageUrl: upload.url,
          widthIn,
          heightIn,
          depthIn,
          modelGlbUrl,
          modelUsdzUrl,
        });
        const caption = buildCaption({
          title: painting.title,
          priceCents: painting.price_cents,
          alt: painting.alt,
          description: painting.description,
          pageUrl: `${window.location.origin}/art?slug=${painting.slug}`,
          widthIn: painting.width_in,
          heightIn: painting.height_in,
          depthIn: painting.depth_in,
        });
        lastSaved = { painting, caption };
        void refreshCollection();
        // Subtle confirmation buzz on phones (no-op where unsupported).
        try {
          if (typeof navigator.vibrate === "function") navigator.vibrate(10);
        } catch {
          // ignore
        }
        ($("share-caption") as HTMLTextAreaElement).value = caption;
        $("share-panel").hidden = false;
        setStatus(
          `Saved "${painting.title}" (${formatCAD(painting.price_cents)}) as a draft — check the AR preview, then Publish.`,
        );
        (e.target as HTMLFormElement).reset();
      } catch (err) {
        setStatus((err as Error).message, true);
      }
    })();
  });

  $("share-native").addEventListener("click", () => {
    if (lastSaved === null) return;
    const caption = ($("share-caption") as HTMLTextAreaElement).value;
    void sharePainting({
      title: lastSaved.painting.title,
      caption,
      pageUrl: `${window.location.origin}/art?slug=${lastSaved.painting.slug}`,
      imageBlob: preparedBlob ?? undefined,
    }).then((result) => {
      setStatus(
        result === "shared"
          ? "Share sheet opened — post it to Instagram/Facebook."
          : result === "copied"
            ? "Caption copied — paste it into your post."
            : "Sharing failed on this device; copy the caption manually.",
        result === "failed",
      );
    });
  });

  $("share-copy").addEventListener("click", () => {
    const caption = ($("share-caption") as HTMLTextAreaElement).value;
    navigator.clipboard
      .writeText(caption)
      .then(() => setStatus("Caption copied."))
      .catch(() => setStatus("Copy failed — select the text manually.", true));
  });

  $("share-auto").addEventListener("click", () => {
    if (lastSaved === null) return;
    const caption = ($("share-caption") as HTMLTextAreaElement).value;
    setStatus("Trying one-click post…");
    api
      .autoPost({ text: caption, imageUrl: lastSaved.painting.image_url })
      .then(() => setStatus("Posted automatically."))
      .catch((err: unknown) => setStatus((err as Error).message, true));
  });

  $("inbox-refresh").addEventListener("click", () => {
    void refreshInbox();
    void refreshCollection();
    void refreshViews();
  });

  api
    .collectorCount()
    .then((n) => {
      $("collectors-hint").textContent =
        n === 0
          ? "No collectors subscribed yet — the button appears on the homepage."
          : `${n} collector${n === 1 ? "" : "s"} will get a push alert.`;
    })
    .catch(() => undefined);

  $("notify-collectors").addEventListener("click", () => {
    setStatus("Notifying collectors…");
    api
      .notifyCollectors()
      .then((r) => setStatus(`Notified ${r.sent} of ${r.total} collectors.`))
      .catch((err: unknown) => setStatus((err as Error).message, true));
  });

  $("collection-refresh").addEventListener("click", () => void refreshCollection());

  armCollectionActions();
  void refreshInbox();
  void refreshCollection();
  void refreshViews();
  void refreshFlags();
  void refreshCapabilities();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
