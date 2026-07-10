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
