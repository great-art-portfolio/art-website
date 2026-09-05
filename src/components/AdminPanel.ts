import { api } from "../lib/api";
import { loadImageFile, prepareImage } from "../lib/image";
import { buildCaption, sharePainting } from "../lib/share";
import { dollarsToCents, formatCAD } from "../lib/money";
import { slugifyTitle } from "../lib/site";

/**
 * Admin island (client-only): publish paintings to git, share kit,
 * homepage banner, collector push. Protected in production by
 * Cloudflare Access; ADMIN_API_TOKEN is local backup.
 *
 * Paintings live in git: saving commits a .md + photo (+ AR models) to
 * the repo; Pages rebuilds on push — live a few minutes later.
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
let lastShare: { title: string; caption: string; pageUrl: string } | null = null;

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

/** Quote a one-line YAML string ("..." with escapes). */
function yamlQuote(s: string): string {
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function buildMarkdown(input: {
  title: string;
  price: number;
  alt: string;
  description: string;
  imageFile: string;
  widthIn: number | null;
  heightIn: number | null;
  depthIn: number | null;
  modelGlb: string;
  modelUsdz: string;
}): string {
  const today = new Date().toISOString().slice(0, 10);
  const lines = [
    "---",
    `title: ${yamlQuote(input.title)}`,
    `dateAdded: ${today}`,
    `image: ${yamlQuote(input.imageFile)}`,
    `alt: ${yamlQuote(input.alt)}`,
    "sold: false",
    `price: ${input.price.toFixed(2)}`,
  ];
  if (input.widthIn !== null) lines.push(`widthIn: ${input.widthIn}`);
  if (input.heightIn !== null) lines.push(`heightIn: ${input.heightIn}`);
  if (input.depthIn !== null) lines.push(`depthIn: ${input.depthIn}`);
  if (input.modelGlb !== "") lines.push(`modelGlb: ${yamlQuote(input.modelGlb)}`);
  if (input.modelUsdz !== "") lines.push(`modelUsdz: ${yamlQuote(input.modelUsdz)}`);
  lines.push("---", input.description === "" ? "Fresh from the studio." : input.description, "");
  return lines.join("\n");
}

/** Unique slug for a new painting, checking the repo's paintings folder. */
async function uniqueSlug(title: string): Promise<string> {
  const base = slugifyTitle(title) === "" ? "untitled" : slugifyTitle(title);
  let files: string[] = [];
  try {
    files = await api.listPaintingFiles();
  } catch {
    // Offline or unconfigured — proceed; the commit may still land.
  }
  const taken = new Set(files);
  if (!taken.has(`${base}.md`)) return base;
  for (let n = 2; n < 100; n += 1) {
    if (!taken.has(`${base}-${n}.md`)) return `${base}-${n}`;
  }
  return `${base}-${Date.now().toString(36)}`;
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

async function refreshViews(): Promise<void> {
  const list = $("views-list");
  try {
    const { views, unconfigured } = await api.paintingViews();
    if (unconfigured) {
      list.innerHTML =
        "<li>Analytics isn't wired up yet — add the site in Cloudflare Web Analytics, " +
        "then set the beacon token + API vars (see README).</li>";
      return;
    }
    if (views.length === 0) {
      list.innerHTML = "<li>No views yet.</li>";
      return;
    }
    list.innerHTML = views
      .map((v) => {
        const slug = v.slug.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
        return `<li><em>${slug}</em> — ${v.views} views</li>`;
      })
      .join("");
  } catch (err) {
    list.innerHTML = `<li>Could not load views: ${(err as Error).message}</li>`;
  }
}

/** Tell her what this browser can do (Safari vs Chrome, online vs offline). */
async function refreshCapabilities(): Promise<void> {
  const sw = "serviceWorker" in navigator ? "on" : "unavailable";
  let sync = "unavailable";
  try {
    const reg = (await navigator.serviceWorker.ready) as ServiceWorkerRegistration & {
      sync?: unknown;
    };
    sync = reg.sync === undefined ? "unavailable" : "on";
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

function blobToFile(blob: Blob, name: string, type: string): File {
  return new File([blob], name, { type });
}

function init(): void {
  greet();

  api
    .getBanner()
    .then((text) => {
      ($("f-announce") as HTMLTextAreaElement).value = text;
    })
    .catch(() => {
      // Publishing not configured yet — the editor still works once it is.
    });

  $("announce-save").addEventListener("click", () => {
    const text = ($("f-announce") as HTMLTextAreaElement).value.trim().slice(0, 280);
    setStatus("Publishing banner… (live in a few minutes)");
    api
      .commitFiles("Update homepage banner", [
        { path: "src/content/announcement.txt", blob: text },
      ])
      .then(() => setStatus(text === "" ? "Banner cleared." : "Banner updated on the homepage."))
      .catch((err: unknown) => setStatus((err as Error).message, true));
  });

  const tokenInput = $("admin-token") as HTMLInputElement;
  tokenInput.value = sessionStorage.getItem("ADMIN_API_TOKEN") ?? "";
  tokenInput.addEventListener("change", () => {
    sessionStorage.setItem("ADMIN_API_TOKEN", tokenInput.value.trim());
    setStatus("Token saved on this device.");
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
      const numOrNull = (id: string): number | null => {
        const raw = ($(id) as HTMLInputElement).value.trim();
        if (raw === "") return null;
        const n = Number(raw);
        return Number.isFinite(n) && n > 0 && n <= 240 ? Math.round(n * 10) / 10 : null;
      };
      const widthIn = numOrNull("f-w");
      const heightIn = numOrNull("f-h");
      const depthIn = numOrNull("f-d");
      const alt = ($("f-alt") as HTMLInputElement).value.trim();
      const description = ($("f-desc") as HTMLTextAreaElement).value.trim();

      setStatus("Publishing… (photo, page, and preview in one commit)");
      try {
        const slug = await uniqueSlug(title);
        const imageFile = `${slug}.jpg`;
        const pageUrl = `${window.location.origin}/paintings/${slug}`;
        const files: Array<{ path: string; blob: Blob | string }> = [
          // Placeholder markdown first so every path below is complete even
          // if AR fails halfway — the AR retry overwrites the same files.
          {
            path: `src/content/paintings/${slug}.md`,
            blob: buildMarkdown({
              title,
              price,
              alt,
              description,
              imageFile,
              widthIn,
              heightIn,
              depthIn,
              modelGlb: "",
              modelUsdz: "",
            }),
          },
          { path: `src/content/paintings/${imageFile}`, blob: preparedBlob },
        ];
        let modelGlb = "";
        let modelUsdz = "";
        let glbBlob: Blob | null = null;
        let usdzBlob: Blob | null = null;
        if (($("f-ar") as HTMLInputElement).checked) {
          setStatus("Building AR preview… (true size, takes a few seconds)");
          try {
            const { buildArModels, estimateDims } = await import("../lib/ar");
            // Decode the prepared (rotated/cropped) photo so the model
            // matches exactly what buyers see.
            const arImg = await loadImageFile(
              blobToFile(preparedBlob, "ar-source.jpg", "image/jpeg"),
            );
            const dims = estimateDims(arImg, widthIn, heightIn, depthIn);
            const models = await buildArModels(arImg, dims.w, dims.h, dims.d);
            glbBlob = models.glb;
            usdzBlob = models.usdz;
            modelGlb = `/models/${slug}.glb`;
            modelUsdz = `/models/${slug}.usdz`;
            files.push(
              { path: `public/models/${slug}.glb`, blob: models.glb },
              { path: `public/models/${slug}.usdz`, blob: models.usdz },
            );
            // Rebuild the markdown with the model URLs in.
            files[0] = {
              path: `src/content/paintings/${slug}.md`,
              blob: buildMarkdown({
                title,
                price,
                alt,
                description,
                imageFile,
                widthIn,
                heightIn,
                depthIn,
                modelGlb,
                modelUsdz,
              }),
            };
          } catch (err) {
            console.error(err);
            setStatus("AR build failed — publishing without it. Uncheck AR next time to skip the wait.");
          }
        }
        await api.commitFiles(`Add painting: ${title}`, files);
        if (glbBlob !== null && usdzBlob !== null) {
          // Preview from memory — the committed files go live after rebuild.
          showArPreview(URL.createObjectURL(glbBlob), URL.createObjectURL(usdzBlob));
        }
        const caption = buildCaption({
          title,
          priceCents,
          alt,
          description,
          pageUrl,
          widthIn,
          heightIn,
          depthIn,
        });
        lastShare = { title, caption, pageUrl };
        // Subtle confirmation buzz on phones (no-op where unsupported).
        try {
          if (typeof navigator.vibrate === "function") navigator.vibrate(10);
        } catch {
          // ignore
        }
        ($("share-caption") as HTMLTextAreaElement).value = caption;
        $("share-panel").hidden = false;
        setStatus(
          `Published "${title}" (${formatCAD(priceCents)}) — live in a few minutes at ${pageUrl}.`,
        );
        (e.target as HTMLFormElement).reset();
        loadedImage = null;
      } catch (err) {
        setStatus((err as Error).message, true);
      }
    })();
  });

  $("share-native").addEventListener("click", () => {
    if (lastShare === null) return;
    const caption = ($("share-caption") as HTMLTextAreaElement).value;
    void sharePainting({
      title: lastShare.title,
      caption,
      pageUrl: lastShare.pageUrl,
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
    if (lastShare === null) return;
    const caption = ($("share-caption") as HTMLTextAreaElement).value;
    setStatus("Trying one-click post…");
    api
      .autoPost({ text: caption, imageUrl: lastShare.pageUrl })
      .then(() => setStatus("Posted automatically."))
      .catch((err: unknown) => setStatus((err as Error).message, true));
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

  $("views-refresh").addEventListener("click", () => void refreshViews());

  void refreshViews();
  void refreshFlags();
  void refreshCapabilities();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
