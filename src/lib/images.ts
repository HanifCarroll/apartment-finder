import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import type { Args, ImagePayload } from "../types";

function sha256Buffer(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

function sha256Text(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function mimeFromPath(path: string): string {
  const ext = extname(path).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  return "application/octet-stream";
}

function extensionForContentType(contentType: string): string {
  const normalized = contentType.split(";")[0]?.toLowerCase();
  if (normalized === "image/jpeg") return ".jpg";
  if (normalized === "image/png") return ".png";
  if (normalized === "image/webp") return ".webp";
  if (normalized === "image/gif") return ".gif";
  return ".img";
}

function imageTypeFromBytes(buffer: Buffer): string | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return "image/png";
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }
  if (
    buffer.length >= 6 &&
    ["GIF87a", "GIF89a"].includes(buffer.subarray(0, 6).toString("ascii"))
  ) {
    return "image/gif";
  }
  return null;
}

function airbnbImageVariants(url: string): string[] {
  if (!url.includes("a0.muscache.com/im/pictures/")) return [url];

  const variants = new Set<string>();
  const parsed = new URL(url);
  variants.add(parsed.href);

  const withWidth = new URL(parsed.href);
  withWidth.searchParams.set("im_w", "1200");
  variants.add(withWidth.href);

  const original = new URL(parsed.href);
  original.search = "";
  variants.add(original.href);

  return Array.from(variants);
}

async function fetchImageBuffer(url: string): Promise<{ buffer: Buffer; contentType: string; finalUrl: string }> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 apartment-finder/0.1",
      "Accept": "image/webp,image/jpeg,image/png,image/gif,image/*,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      "Referer": "https://www.airbnb.com/",
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }

  const headerContentType = response.headers.get("content-type") || "application/octet-stream";
  if (!headerContentType.toLowerCase().startsWith("image/")) {
    throw new Error(`non-image content type: ${headerContentType}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const byteContentType = imageTypeFromBytes(buffer);
  if (!byteContentType) {
    throw new Error(`invalid image bytes (${buffer.byteLength} bytes, header content type ${headerContentType})`);
  }

  return {
    buffer,
    contentType: byteContentType,
    finalUrl: response.url || url,
  };
}

export async function loadImageFromPath(path: string): Promise<ImagePayload> {
  const buffer = await readFile(path);
  const contentType = imageTypeFromBytes(buffer) || mimeFromPath(path);
  return {
    source: path,
    contentType,
    bytes: buffer.byteLength,
    sha256: sha256Buffer(buffer),
    dataUrl: `data:${contentType};base64,${buffer.toString("base64")}`,
  };
}

export async function loadImageFromUrl(url: string, cacheDir: string): Promise<ImagePayload> {
  await mkdir(cacheDir, { recursive: true });

  const urlObject = new URL(url);
  const baseName = basename(urlObject.pathname).replace(/[^a-zA-Z0-9._-]/g, "_") || "image";
  const hasImageExtension = /\.(jpe?g|png|webp|gif)$/i.test(baseName);
  const cacheKey = sha256Text(url);
  const fallbackExtension = hasImageExtension ? extname(baseName) : ".img";
  const cachedPath = join(cacheDir, `${cacheKey}${fallbackExtension}`);
  try {
    const cachedBuffer = await readFile(cachedPath);
    const contentType = imageTypeFromBytes(cachedBuffer) || mimeFromPath(cachedPath);
    return {
      source: url,
      contentType,
      bytes: cachedBuffer.byteLength,
      sha256: sha256Buffer(cachedBuffer),
      cachedPath,
      dataUrl: `data:${contentType};base64,${cachedBuffer.toString("base64")}`,
    };
  } catch (error) {
    if (!(error instanceof Error) || !("code" in error) || (error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }

  let image: Awaited<ReturnType<typeof fetchImageBuffer>> | null = null;
  const errors: string[] = [];
  for (const candidateUrl of airbnbImageVariants(url)) {
    try {
      image = await fetchImageBuffer(candidateUrl);
      break;
    } catch (error) {
      errors.push(`${candidateUrl}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (!image) {
    throw new Error(`Image download failed after ${errors.length} attempt(s): ${errors.join(" | ")}`);
  }

  const contentPath = fallbackExtension === ".img"
    ? join(cacheDir, `${cacheKey}${extensionForContentType(image.contentType)}`)
    : cachedPath;
  await writeFile(contentPath, image.buffer);

  return {
    source: url,
    contentType: image.contentType,
    bytes: image.buffer.byteLength,
    sha256: sha256Buffer(image.buffer),
    cachedPath: contentPath,
    dataUrl: `data:${image.contentType};base64,${image.buffer.toString("base64")}`,
  };
}

export async function loadImage(args: Args): Promise<ImagePayload> {
  if (args.imagePath) return loadImageFromPath(args.imagePath);
  if (args.imageUrl) return loadImageFromUrl(args.imageUrl, args.cacheDir);
  throw new Error("Missing image source.");
}
