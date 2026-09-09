import {
  commitFiles,
  listDir,
  readTextFile,
  type GitHubConfig,
} from "../_lib/github";
import type { AppEnv } from "../_lib/env";
import { badRequest, json, requireAdmin, serverError } from "../_lib/http";
import { parseCommitBody } from "../_lib/validation";

/** Repo path of the homepage banner (empty file = hidden). */
export const BANNER_PATH = "src/content/announcement.txt";

function gitConfig(env: AppEnv): GitHubConfig | null {
  const token = env.GITHUB_TOKEN ?? "";
  const repo = env.GITHUB_REPO ?? "";
  if (token === "" || repo === "") return null;
  return { token, repo, branch: env.GITHUB_BRANCH ?? "main" };
}

import { GALLERY_PATH, PAINTING_FILE } from "../_lib/gallery-paths";

/** Admin: read the banner text, or one painting file (?path=…). Lives in git. */
export const onRequestGet: PagesFunction<AppEnv> = async (context) => {
  const denied = requireAdmin(context.request, context.env);
  if (denied !== null) return denied;
  const config = gitConfig(context.env);
  if (config === null) return badRequest("GitHub publishing is not configured");
  const url = new URL(context.request.url);
  const path = url.searchParams.get("path");
  try {
    if (path !== null) {
      if (!PAINTING_FILE.test(path)) return badRequest("Unknown file");
      const content = await readTextFile(config, path);
      if (content === null) return badRequest("Unknown file");
      return json({ content });
    }
    return json({
      announcement: (await readTextFile(config, BANNER_PATH)) ?? "",
    });
  } catch (err) {
    console.error(err);
    return serverError();
  }
};

/**
 * Admin: commit a batch of files (painting .md + photo, banner text,
 * AR models) and/or delete gallery files. Body:
 * { message, files: [{ path, contentBase64 }], delete: [path] }.
 * Cloudflare Pages rebuilds on push — the change is live ~a minute later.
 */
export const onRequestPost: PagesFunction<AppEnv> = async (context) => {
  const denied = requireAdmin(context.request, context.env);
  if (denied !== null) return denied;
  const config = gitConfig(context.env);
  if (config === null) return badRequest("GitHub publishing is not configured");
  let raw: unknown;
  try {
    raw = (await context.request.json()) as unknown;
  } catch {
    return badRequest("Invalid JSON");
  }
  const body = parseCommitBody(raw);
  if (body === null) return badRequest("Invalid JSON");
  const message = body.message.trim().slice(0, 200);
  const inputs = body.inputs;
  const deletePaths: string[] = [];
  for (const d of body.deletes) {
    if (typeof d !== "string" || !GALLERY_PATH.test(d)) {
      return badRequest(`Refusing to delete outside the gallery: ${String(d)}`);
    }
    deletePaths.push(d);
  }
  if (
    message === "" ||
    inputs.length + deletePaths.length === 0 ||
    inputs.length + deletePaths.length > 12
  ) {
    return badRequest("A message and 1–12 files are required");
  }
  const files: Array<{
    path: string;
    content: ArrayBuffer;
    deleted?: boolean;
  }> = [];
  for (const input of inputs) {
    if (
      typeof input.path !== "string" ||
      typeof input.contentBase64 !== "string"
    ) {
      return badRequest("Each file needs a path and base64 content");
    }
    if (!GALLERY_PATH.test(input.path)) {
      return badRequest(`Refusing to write outside the gallery: ${input.path}`);
    }
    if (input.contentBase64.length > 24_000_000) {
      return badRequest(`${input.path} is too large (24MB base64 cap)`);
    }
    try {
      const bin = atob(input.contentBase64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
      files.push({ path: input.path, content: bytes.buffer });
    } catch {
      return badRequest(`${input.path} is not valid base64`);
    }
  }
  for (const path of deletePaths) {
    files.push({ path, content: new ArrayBuffer(0), deleted: true });
  }
  try {
    const sha = await commitFiles(config, message, files);
    return json({ ok: true, commit: sha }, { status: 201 });
  } catch (err) {
    console.error(err);
    return serverError("Publishing failed — the commit did not land.");
  }
};

/** Admin: filenames in the paintings folder, for slug-collision checks. */
export const onRequestPut: PagesFunction<AppEnv> = async (context) => {
  const denied = requireAdmin(context.request, context.env);
  if (denied !== null) return denied;
  const config = gitConfig(context.env);
  if (config === null) return badRequest("GitHub publishing is not configured");
  try {
    return json({ files: await listDir(config, "src/content/paintings") });
  } catch (err) {
    console.error(err);
    return serverError();
  }
};
