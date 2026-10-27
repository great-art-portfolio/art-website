import type { AppEnv } from "../_lib/env";
import { PAINTING_FILE } from "../_lib/gallery-paths";
import { gitConfig, readTextFile } from "../_lib/github";
import { json, requireAdmin, sameSecret, serverError } from "../_lib/http";
import { logEvent } from "../_lib/log";
import {
  cleanBroadcastBody,
  cleanBroadcastSubject,
  paintingAlertEmail,
  segmentBroadcastEmail,
  sendCollectorBroadcast,
  type BroadcastOptions,
  type PaintingAlert,
} from "../_lib/notify";
import { parseCatalog } from "../_lib/validation";
import { parsePainting } from "../../src/lib/painting-edit";
import { slugifyTitle } from "../../src/lib/site";

/** How long a publish alert waits for the build that puts the painting
 * online, so the email's photo and link work when it lands. */
export const ALERT_DELAY = "in 10 min";

/** The painting a publish alert is about, read from git (her latest
 * words), and whether its page is already live. The studio names the
 * painting's file; the nightly job names its slug. Null when it can't be
 * found, and the plain note goes instead. */
async function paintingFor(
  env: AppEnv,
  origin: string,
  file: string,
  slug: string,
): Promise<{ painting: PaintingAlert; live: boolean } | null> {
  const config = gitConfig(env);
  if (config === null) return null;
  const catalogRes = await env.ASSETS.fetch(
    new Request(`${origin}/catalog.json`),
  ).catch(() => null);
  const catalog =
    catalogRes?.ok === true ? parseCatalog(await catalogRes.json()) : [];
  const path = PAINTING_FILE.test(file)
    ? file
    : (catalog.find((p) => p.slug === slug)?.file ?? "");
  if (!PAINTING_FILE.test(path)) return null;
  const md = await readTextFile(config, path);
  const parsed = md === null ? null : parsePainting(md);
  if (parsed === null || parsed.title === "") return null;
  const num = (v: string): number | null => {
    const n = Number(v);
    return v.trim() !== "" && Number.isFinite(n) && n > 0 ? n : null;
  };
  const paintingSlug = slugifyTitle(parsed.title);
  return {
    painting: {
      slug: paintingSlug,
      title: parsed.title,
      priceCents: Math.round((num(parsed.price) ?? 0) * 100),
      sold: parsed.sold,
      medium: parsed.medium,
      widthIn: num(parsed.widthIn),
      heightIn: num(parsed.heightIn),
      depthIn: num(parsed.depthIn),
      description: parsed.description,
      alt: parsed.alt,
    },
    live: catalog.some((p) => p.slug === paintingSlug && p.image !== ""),
  };
}

/** Admin: emails her list. { email: true, file | slug } sends the
 * new-painting email for that painting: its photo, words and price,
 * held until its page is live. { email: { subject, body } } comes from the
 * Email page. An unconfigured list is skipped. */
export const onRequestPost: PagesFunction<AppEnv> = async (context) => {
  // The nightly scheduled-publish workflow has its own key, good for the
  // standard publish alert only: no custom text.
  const alertsKey = context.env.ALERTS_TOKEN ?? "";
  const viaAlertsKey =
    alertsKey !== "" &&
    sameSecret(
      context.request.headers.get("authorization") ?? "",
      `Bearer ${alertsKey}`,
    );
  const denied = viaAlertsKey
    ? null
    : await requireAdmin(context.request, context.env);
  if (denied !== null) return denied;
  let body: Record<string, unknown>;
  try {
    body = (await context.request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }
  const emailOpt = body["email"];
  const emailCopy =
    typeof emailOpt === "object" && emailOpt !== null
      ? (emailOpt as Record<string, unknown>)
      : null;
  if (viaAlertsKey && emailCopy !== null)
    return json(
      { error: "This key only sends the standard publish alert." },
      { status: 403 },
    );
  if (emailOpt === false) return json({ emailed: false, emailTotal: 0 });
  try {
    const site = context.env.SITE_URL ?? "https://barbart.ca";
    const text = (v: unknown): string => (typeof v === "string" ? v : "");
    // Only the studio may name a file; the alerts key names a slug.
    const found =
      emailCopy === null
        ? await paintingFor(
            context.env,
            new URL(context.request.url).origin,
            viaAlertsKey ? "" : text(body["file"]),
            text(body["slug"]),
          ).catch(async (err: unknown) => {
            await logEvent(context.env, {
              event: "broadcast.painting_lookup_failed",
              message: "Couldn't find the painting a publish alert is for",
              err,
              detail: { slug: text(body["slug"]) },
              request: context.request,
            });
            return null;
          })
        : null;
    // The nightly key only announces a real painting: with no painting to
    // show, it sends nothing rather than a generic note to everyone.
    if (viaAlertsKey && found === null)
      return json({ error: "No such painting to announce." }, { status: 404 });
    const opts: BroadcastOptions =
      found === null
        ? {}
        : {
            mail: paintingAlertEmail(site, found.painting),
            scheduledAt: found.live ? undefined : ALERT_DELAY,
          };
    const result = await sendCollectorBroadcast(
      context.env,
      site,
      emailCopy === null ? "" : cleanBroadcastSubject(emailCopy["subject"]),
      emailCopy === null ? "" : cleanBroadcastBody(emailCopy["body"]),
      opts,
    ).catch(async (err: unknown) => {
      await logEvent(context.env, {
        event: "broadcast.threw",
        message: "The broadcast threw",
        err,
        request: context.request,
      });
      return { sent: 0, total: 0, failed: true };
    });
    return json({
      emailed: result.sent > 0,
      emailTotal: result.total,
      scheduled: result.sent > 0 && opts.scheduledAt !== undefined,
      // The send was tried and didn't go out (logged as broadcast.*).
      failed: result.failed,
    });
  } catch (err) {
    await logEvent(context.env, {
      event: "notify.threw",
      message: "The notify endpoint threw",
      err,
      request: context.request,
    });
    return serverError();
  }
};

/** Admin: the email a send would deliver, for the Email page preview. */
export const onRequestGet: PagesFunction<AppEnv> = async (context) => {
  const denied = await requireAdmin(context.request, context.env);
  if (denied !== null) return denied;
  try {
    const site = context.env.SITE_URL ?? "https://barbart.ca";
    // The preview request includes the draft subject and body.
    const params = new URL(context.request.url).searchParams;
    const { subject, text, html } = segmentBroadcastEmail(
      site,
      cleanBroadcastSubject(params.get("subject")),
      cleanBroadcastBody(params.get("body")),
    );
    return json({ emailSubject: subject, emailText: text, emailHtml: html });
  } catch (err) {
    await logEvent(context.env, {
      event: "notify.preview_threw",
      message: "The email preview threw",
      err,
      request: context.request,
    });
    return serverError();
  }
};
