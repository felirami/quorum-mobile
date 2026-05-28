/**
 * Farcaster profile update helpers.
 *
 * Flow:
 *  - POST /v1/generate-image-upload-url → { url, optimisticImageId }
 *  - multipart POST to the returned Cloudflare URL
 *  - PATCH /v2/me  with { displayName?, bio?, pfp?, location? }
 */

const FARCASTER_API = 'https://client.farcaster.xyz';
const CLOUDFLARE_CDN = 'https://imagedelivery.net/BXluQx4ige9GuW0Ia56BHw';

interface UpdateResult {
  ok: boolean;
  error?: string;
}

interface GenerateImageUploadUrlResponse {
  result: {
    url: string;
    optimisticImageId: string;
  };
}

async function generateImageUploadUrl(token: string): Promise<{ url: string; imageId: string } | null> {
  const res = await fetch(`${FARCASTER_API}/v1/generate-image-upload-url`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({}),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as GenerateImageUploadUrlResponse;
  if (!json?.result?.url || !json?.result?.optimisticImageId) return null;
  return {
    url: json.result.url,
    imageId: json.result.optimisticImageId,
  };
}

/**
 * Upload an image to Cloudflare. Returns the canonical pfp URL on success.
 * `imageUri` can be a local file URI or a data URI.
 */
export async function uploadFarcasterPfpImage(
  token: string,
  imageUri: string,
): Promise<{ ok: boolean; url?: string; error?: string }> {
  try {
    const upload = await generateImageUploadUrl(token);
    if (!upload) {
      return { ok: false, error: 'Failed to generate upload URL' };
    }

    const form = new FormData();
    // React Native's FormData accepts { uri, type, name } for file fields
    form.append('file', {
      uri: imageUri,
      type: 'image/jpeg',
      name: 'pfp.jpg',
    } as unknown as Blob);

    const uploadRes = await fetch(upload.url, {
      method: 'POST',
      body: form,
    });
    if (!uploadRes.ok) {
      const text = await uploadRes.text().catch(() => '');
      return { ok: false, error: `Upload failed: ${uploadRes.status} ${text}` };
    }

    const pfpUrl = `${CLOUDFLARE_CDN}/${upload.imageId}/original`;
    return { ok: true, url: pfpUrl };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

interface UpdateUserBody {
  displayName?: string;
  bio?: string;
  pfp?: string;
}

export async function patchFarcasterMe(
  token: string,
  body: UpdateUserBody,
): Promise<UpdateResult> {
  try {
    const res = await fetch(`${FARCASTER_API}/v2/me`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { ok: false, error: `HTTP ${res.status}: ${text}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * High-level helper: uploads a new pfp if a local/data URI is provided, then
 * patches /v2/me with all supplied fields.
 */
export async function updateFarcasterProfile(
  token: string,
  fields: {
    displayName?: string;
    bio?: string;
    /** data URI or file URI for a new image; or an existing https:// URL to keep */
    pfp?: string;
  },
): Promise<{ ok: boolean; error?: string; uploadedPfpUrl?: string }> {
  const body: UpdateUserBody = {};
  if (fields.displayName !== undefined) body.displayName = fields.displayName;
  if (fields.bio !== undefined) body.bio = fields.bio;

  let uploadedPfpUrl: string | undefined;
  if (fields.pfp !== undefined) {
    const isRemote = /^https?:\/\//i.test(fields.pfp);
    if (isRemote) {
      body.pfp = fields.pfp;
    } else {
      const up = await uploadFarcasterPfpImage(token, fields.pfp);
      if (!up.ok || !up.url) {
        return { ok: false, error: up.error ?? 'pfp upload failed' };
      }
      body.pfp = up.url;
      uploadedPfpUrl = up.url;
    }
  }

  const patch = await patchFarcasterMe(token, body);
  if (!patch.ok) return { ok: false, error: patch.error };
  return { ok: true, uploadedPfpUrl };
}
