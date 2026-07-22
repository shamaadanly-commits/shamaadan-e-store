/**
 * Cloudflare R2 product image uploads via S3-compatible API.
 * Uses @aws-sdk/client-s3. Credentials from process.env only (server-side).
 */
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

/**
 * @returns {boolean}
 */
export function isR2Configured() {
  return Boolean(
    process.env.R2_ACCOUNT_ID
    && process.env.R2_ACCESS_KEY_ID
    && process.env.R2_SECRET_ACCESS_KEY
    && process.env.R2_BUCKET_NAME
    && process.env.R2_PUBLIC_BASE_URL,
  );
}

/**
 * @returns {S3Client}
 */
function createR2Client() {
  if (!isR2Configured()) {
    throw new Error(
      '[shared/r2] Missing R2 env: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_BASE_URL',
    );
  }

  return new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });
}

/**
 * @param {string} name
 * @returns {string}
 */
function sanitizeFilename(name) {
  return String(name || 'image')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80) || 'image';
}

/**
 * Upload a product image buffer to R2.
 * @param {{
 *   buffer: Buffer | Uint8Array,
 *   contentType: string,
 *   filename?: string,
 *   folder?: string,
 * }} input
 * @returns {Promise<{ ok: true, url: string, key: string }>}
 */
export async function uploadProductImage(input) {
  const client = createR2Client();
  const bucket = process.env.R2_BUCKET_NAME;
  const publicBase = process.env.R2_PUBLIC_BASE_URL.replace(/\/$/, '');
  const folder = String(input.folder || 'products').replace(/^\/+|\/+$/g, '');
  const key = `${folder}/${Date.now().toString(36)}-${sanitizeFilename(input.filename)}`;

  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: input.buffer,
    ContentType: input.contentType || 'application/octet-stream',
  }));

  return {
    ok: true,
    url: `${publicBase}/${key}`,
    key,
  };
}

/**
 * Extract R2 object key from a public CDN URL for this bucket.
 * @param {string} url
 * @returns {string | null}
 */
export function r2KeyFromPublicUrl(url) {
  const raw = String(url || '').trim();
  if (!raw || raw.startsWith('data:')) return null;

  const base = String(process.env.R2_PUBLIC_BASE_URL || '').replace(/\/$/, '');
  if (base && (raw === base || raw.startsWith(`${base}/`))) {
    return raw.slice(base.length).replace(/^\//, '').split('?')[0] || null;
  }

  // Fallback: path after /products/ (our upload prefix)
  try {
    const u = new URL(raw);
    const match = u.pathname.match(/\/(?:products\/[^?#]+)/);
    if (match) return match[0].replace(/^\//, '');
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Delete an object from R2 by key.
 * @param {string} key
 * @returns {Promise<{ ok: true }>}
 */
export async function deleteProductImage(key) {
  const client = createR2Client();
  const objectKey = String(key || '').replace(/^\//, '');
  if (!objectKey) throw new Error('key is required');

  await client.send(new DeleteObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME,
    Key: objectKey,
  }));

  return { ok: true };
}

/**
 * Delete many product images from R2 by public URL.
 * Non-R2 URLs are skipped. Failures are collected, not thrown.
 * @param {string[]} urls
 * @returns {Promise<{ deleted: number, skipped: number, errors: string[] }>}
 */
export async function deleteProductImagesByUrls(urls) {
  const list = Array.isArray(urls) ? urls.map((u) => String(u || '').trim()).filter(Boolean) : [];
  if (!list.length) return { deleted: 0, skipped: 0, errors: [] };
  if (!isR2Configured()) return { deleted: 0, skipped: list.length, errors: ['R2 not configured'] };

  let deleted = 0;
  let skipped = 0;
  const errors = [];

  for (const url of list) {
    const key = r2KeyFromPublicUrl(url);
    if (!key || !key.startsWith('products/')) {
      skipped += 1;
      continue;
    }
    try {
      await deleteProductImage(key);
      deleted += 1;
    } catch (err) {
      errors.push(`${key}: ${err?.message || err}`);
    }
  }

  return { deleted, skipped, errors };
}

/**
 * Build public CDN URL for a stored key.
 * @param {string} key
 * @returns {string}
 */
export function publicUrlForKey(key) {
  if (!process.env.R2_PUBLIC_BASE_URL) {
    throw new Error('[shared/r2] R2_PUBLIC_BASE_URL is not set');
  }
  const base = process.env.R2_PUBLIC_BASE_URL.replace(/\/$/, '');
  return `${base}/${String(key).replace(/^\//, '')}`;
}
