import sharp from "sharp";
import sharpService, {
  resolveSharpEncoderOptions,
} from "astro/assets/services/sharp";
import type { ImageOutputFormat, LocalImageService } from "astro";

/** Astro's sharp pipeline strips embedded ICC profiles — and five of the
 * seven painting photos are Display P3, so every painting dulled to sRGB
 * on wide-gamut screens. Same pipeline, plus keepIccProfile: profiles
 * ride through untouched, sRGB sources come out as before. URLs,
 * validation, and srcsets stay Astro's; only the pixels change hands.
 */

const fitMap: Record<string, "fill" | "inside" | "cover" | "outside"> = {
  fill: "fill",
  contain: "inside",
  cover: "cover",
  none: "outside",
  "scale-down": "inside",
  outside: "outside",
  inside: "inside",
};

function sniffFormat(input: Uint8Array): ImageOutputFormat | undefined {
  if (input[0] === 0xff && input[1] === 0xd8) return "jpeg";
  if (
    input[0] === 0x89 &&
    input[1] === 0x50 &&
    input[2] === 0x4e &&
    input[3] === 0x47
  )
    return "png";
  if (
    input[0] === 0x52 &&
    input[1] === 0x49 &&
    input[2] === 0x46 &&
    input[3] === 0x46
  )
    return "webp";
  return undefined;
}

const service: LocalImageService = {
  ...sharpService,
  async transform(inputBuffer, transformOptions, config, logger) {
    const transform = transformOptions;
    const bufferFormat = sniffFormat(inputBuffer);
    if (bufferFormat === undefined) {
      logger.warn(
        `No image metadata for "${String(transform.src)}" — passing it through unoptimized.`,
      );
      return { data: inputBuffer, format: "webp" };
    }
    // validateOptions already constrains this; the cast only tells
    // TypeScript what Astro guaranteed.
    const outputFormat = (transform.format ?? "webp") as ImageOutputFormat;
    const serviceConfig = config.service.config ?? {};
    const pipeline = sharp(inputBuffer, {
      failOn: "none",
      limitInputPixels: serviceConfig.limitInputPixels,
    });
    // The one line Astro lacks: keep the embedded profile (Display P3
    // on the painting photos) through resize and encode.
    pipeline.rotate().keepIccProfile();
    const width =
      typeof transform.width === "number"
        ? Math.round(transform.width)
        : undefined;
    const height =
      typeof transform.height === "number"
        ? Math.round(transform.height)
        : undefined;
    if (width !== undefined && height !== undefined) {
      const fit =
        typeof transform.fit === "string"
          ? (fitMap[transform.fit] ?? "inside")
          : undefined;
      pipeline.resize({
        width,
        height,
        kernel: serviceConfig.kernel,
        fit,
        position: transform.position,
        withoutEnlargement: true,
      });
    } else if (width !== undefined || height !== undefined) {
      pipeline.resize({
        width,
        height,
        kernel: serviceConfig.kernel,
        withoutEnlargement: true,
      });
    }
    if (typeof transform.background === "string") {
      pipeline.flatten({ background: transform.background });
    }
    const encoderOptions = resolveSharpEncoderOptions(
      { format: outputFormat, quality: transform.quality },
      bufferFormat,
      serviceConfig,
    );
    if (outputFormat === "svg") {
      return { data: inputBuffer, format: outputFormat };
    } else if (outputFormat === "webp") pipeline.webp(encoderOptions);
    else if (outputFormat === "png") pipeline.png(encoderOptions);
    else if (outputFormat === "avif") pipeline.avif(encoderOptions);
    else if (outputFormat === "jpeg" || outputFormat === "jpg")
      pipeline.jpeg(encoderOptions);
    else {
      // Unreachable for our content (validateOptions allows webp, png,
      // avif, jpeg, svg) — sharp takes the validated remainder.
      pipeline.toFormat(
        outputFormat as "tiff" | "heif" | "jxl" | "raw",
        encoderOptions,
      );
    }
    let data: Uint8Array;
    try {
      ({ data } = await pipeline.toBuffer({ resolveWithObject: true }));
    } catch {
      logger.warn(
        `Astro could not optimize image "${String(transform.src)}" — using it unoptimized.`,
      );
      return { data: inputBuffer, format: bufferFormat };
    }
    return { data: new Uint8Array(data), format: outputFormat };
  },
};

export default service;
