import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import type { Args, ImagePayload } from "./types";

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

export async function loadImageFromPath(path: string): Promise<ImagePayload> {
  const buffer = await readFile(path);
  const contentType = mimeFromPath(path);
  return {
    source: path,
    contentType,
    bytes: buffer.byteLength,
    dataUrl: `data:${contentType};base64,${buffer.toString("base64")}`,
  };
}

export async function loadImageFromUrl(url: string, cacheDir: string): Promise<ImagePayload> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "apartment-laundry-classifier/0.1",
      Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
    },
  });

  if (!response.ok) {
    throw new Error(`Image download failed: HTTP ${response.status} ${response.statusText}`);
  }

  const contentType = response.headers.get("content-type") || "application/octet-stream";
  if (!contentType.toLowerCase().startsWith("image/")) {
    throw new Error(`URL did not return an image content type: ${contentType}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  await mkdir(cacheDir, { recursive: true });

  const urlObject = new URL(url);
  const baseName = basename(urlObject.pathname).replace(/[^a-zA-Z0-9._-]/g, "_") || "image";
  const hasImageExtension = /\.(jpe?g|png|webp|gif)$/i.test(baseName);
  const slug = `${Date.now()}-${baseName}${hasImageExtension ? "" : extensionForContentType(contentType)}`;
  const cachedPath = join(cacheDir, slug);
  await writeFile(cachedPath, buffer);

  return {
    source: url,
    contentType,
    bytes: buffer.byteLength,
    cachedPath,
    dataUrl: `data:${contentType};base64,${buffer.toString("base64")}`,
  };
}

export async function loadImage(args: Args): Promise<ImagePayload> {
  if (args.imagePath) return loadImageFromPath(args.imagePath);
  if (args.imageUrl) return loadImageFromUrl(args.imageUrl, args.cacheDir);
  throw new Error("Missing image source.");
}
