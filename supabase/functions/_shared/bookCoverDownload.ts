const MAX_DOWNLOAD_BYTES = 10 * 1024 * 1024;
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export async function downloadCover(url: string, fetchImpl: typeof fetch = fetch): Promise<Uint8Array> {
  const response = await fetchImpl(url, {
    redirect: 'error',
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`Cover download failed: HTTP ${response.status}`);
  const mimeType = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
  if (!mimeType || !IMAGE_TYPES.has(mimeType)) throw new Error('Cover must be a JPEG, PNG, or WebP image.');
  if (Number(response.headers.get('content-length')) > MAX_DOWNLOAD_BYTES) {
    await response.body?.cancel();
    throw new Error('Cover download exceeds 10 MiB.');
  }
  if (!response.body) throw new Error('Cover download returned no body.');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_DOWNLOAD_BYTES) throw new Error('Cover download exceeds 10 MiB.');
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
  const result = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}
