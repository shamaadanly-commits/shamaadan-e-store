/**
 * Cloudflare R2 image upload API.
 * Configure R2 env vars later — until then returns a clear not-configured response
 * so the admin UI can keep a local preview URL.
 *
 * Required env (when ready):
 *   R2_ACCOUNT_ID
 *   R2_ACCESS_KEY_ID
 *   R2_SECRET_ACCESS_KEY
 *   R2_BUCKET_NAME
 *   R2_PUBLIC_BASE_URL  (e.g. https://cdn.shamaadan.ly or r2.dev public URL)
 */
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '8mb',
    },
  },
};

function isR2Configured() {
  return Boolean(
    process.env.R2_ACCOUNT_ID
    && process.env.R2_ACCESS_KEY_ID
    && process.env.R2_SECRET_ACCESS_KEY
    && process.env.R2_BUCKET_NAME
    && process.env.R2_PUBLIC_BASE_URL,
  );
}

function sanitizeFilename(name) {
  return String(name || 'image')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80) || 'image';
}

function extensionFromType(contentType) {
  if (contentType?.includes('png')) return 'png';
  if (contentType?.includes('webp')) return 'webp';
  if (contentType?.includes('gif')) return 'gif';
  return 'jpg';
}

async function uploadToR2({ buffer, contentType, filename }) {
  const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');

  const accountId = process.env.R2_ACCOUNT_ID;
  const bucket = process.env.R2_BUCKET_NAME;
  const publicBase = process.env.R2_PUBLIC_BASE_URL.replace(/\/$/, '');
  const key = `products/${Date.now().toString(36)}-${sanitizeFilename(filename)}`;

  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });

  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  }));

  return `${publicBase}/${key}`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { filename, contentType, data } = body || {};

    if (!data || typeof data !== 'string') {
      return res.status(400).json({ ok: false, error: 'Missing image data' });
    }

    const base64 = data.includes(',') ? data.split(',')[1] : data;
    const buffer = Buffer.from(base64, 'base64');

    if (!buffer.length) {
      return res.status(400).json({ ok: false, error: 'Empty image payload' });
    }

    if (buffer.length > 7 * 1024 * 1024) {
      return res.status(400).json({ ok: false, error: 'Image too large (max 7MB)' });
    }

    const type = contentType || 'image/jpeg';
    const safeName = sanitizeFilename(filename || `upload.${extensionFromType(type)}`);

    if (!isR2Configured()) {
      return res.status(200).json({
        ok: true,
        configured: false,
        code: 'R2_NOT_CONFIGURED',
        message: 'Cloudflare R2 is not configured yet. Using local preview until R2 credentials are set.',
        // Echo data URL so the product can still be saved locally for now
        url: data.startsWith('data:') ? data : `data:${type};base64,${base64}`,
        filename: safeName,
      });
    }

    const url = await uploadToR2({
      buffer,
      contentType: type,
      filename: safeName,
    });

    return res.status(200).json({
      ok: true,
      configured: true,
      url,
      filename: safeName,
    });
  } catch (error) {
    console.error('[upload]', error);
    return res.status(500).json({
      ok: false,
      error: error.message || 'Upload failed',
    });
  }
}
