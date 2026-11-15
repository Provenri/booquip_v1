// @ts-ignore Deno resolves npm: imports when bundling Edge Functions.
import { Image } from 'npm:imagescript@3.20.3';
// @ts-ignore Deno requires explicit TypeScript extensions.
import { downloadCover } from '../_shared/bookCoverDownload.ts';

type Approval = {
  book_id: string;
  source_url: string;
  permission_reference: string;
  attempted_at: string | null;
};

async function checksum(bytes: Uint8Array): Promise<string> {
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(bytes).buffer));
  return Array.from(hash, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function optimizeEdgeCover(input: Uint8Array): Promise<Uint8Array> {
  const isJpeg = input[0] === 0xff && input[1] === 0xd8 && input[2] === 0xff;
  const isPng = input.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => input[index] === byte);
  const isWebp = input.length >= 12 &&
    String.fromCharCode(...input.slice(0, 4)) === 'RIFF' &&
    String.fromCharCode(...input.slice(8, 12)) === 'WEBP';
  if (!isJpeg && !isPng && !isWebp) throw new Error('Unsupported cover image format.');
  const image = await Image.decode(input, { maxPixels: 4_000_000, threads: 1, gainMap: false });
  const scale = Math.min(1, 800 / image.width, 1200 / image.height);
  if (scale < 1) {
    image.resize({ width: Math.max(1, Math.round(image.width * scale)), height: Math.max(1, Math.round(image.height * scale)) });
  }
  const output = await image.encodeJPEG({ quality: 82, gainMap: false });
  if (output.byteLength > 5 * 1024 * 1024) throw new Error('Optimized cover exceeds 5 MiB.');
  return output;
}

export async function importApprovedCover(
  supabaseUrl: string,
  headers: Record<string, string>,
  fetchImpl: typeof fetch = fetch,
) {
  const report = { published: 0, errors: 0 };
  const url = new URL('/rest/v1/book_cover_imports', supabaseUrl);
  url.searchParams.set('select', 'book_id,source_url,permission_reference,attempted_at');
  url.searchParams.set('approved_for_rehosting', 'eq.true');
  url.searchParams.set('status', 'neq.published');
  url.searchParams.set('or', `(attempted_at.is.null,attempted_at.lt.${new Date(Date.now() - 10 * 60_000).toISOString()})`);
  url.searchParams.set('order', 'attempted_at.asc.nullsfirst,book_id.asc');
  url.searchParams.set('limit', '1');
  let claimed: { approval: Approval; attemptedAt: string; url: URL } | undefined;
  try {
    const pending = await fetchImpl(url, { headers, signal: AbortSignal.timeout(10_000) });
    if (!pending.ok) throw new Error(`Could not load approved cover imports: HTTP ${pending.status}`);
    const approvals = await pending.json() as Approval[];
    if (!approvals.length) return report;
    const approval = approvals[0];
    const claimUrl = new URL('/rest/v1/book_cover_imports', supabaseUrl);
    claimUrl.searchParams.set('book_id', `eq.${approval.book_id}`);
    claimUrl.searchParams.set('source_url', `eq.${approval.source_url}`);
    claimUrl.searchParams.set('permission_reference', `eq.${approval.permission_reference}`);
    claimUrl.searchParams.set('approved_for_rehosting', 'eq.true');
    claimUrl.searchParams.set('status', 'neq.published');
    claimUrl.searchParams.set('attempted_at', approval.attempted_at ? `eq.${approval.attempted_at}` : 'is.null');
    const attemptedAt = new Date().toISOString();
    const claim = await fetchImpl(claimUrl, {
      method: 'PATCH',
      headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify({ attempted_at: attemptedAt, last_error: null }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!claim.ok) throw new Error('Could not claim approved cover import.');
    const claimedRows = await claim.json() as Approval[];
    if (claimedRows.length === 0) return report;
    claimed = { approval, attemptedAt, url: claimUrl };
    const source = new URL(approval.source_url);
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,199}$/.test(approval.book_id) ||
        source.protocol !== 'https:' || source.username || source.password ||
        !approval.permission_reference?.trim()) {
      throw new Error('Invalid approved cover source or book ID.');
    }
    const bookUrl = new URL('/rest/v1/books', supabaseUrl);
    bookUrl.searchParams.set('id', `eq.${approval.book_id}`);
    bookUrl.searchParams.set('select', 'cover_url');
    const bookResponse = await fetchImpl(bookUrl, { headers, signal: AbortSignal.timeout(10_000) });
    if (!bookResponse.ok) throw new Error('Could not load book cover before import.');
    const books = await bookResponse.json() as Array<{ cover_url: string | null }>;
    if (books.length !== 1) throw new Error('Approved cover book is missing.');
    const image = await optimizeEdgeCover(await downloadCover(approval.source_url, fetchImpl));
    const hash = await checksum(image);
    const objectPath = `${approval.book_id}/${hash}.jpg`;
    const objectUrl = new URL(`/storage/v1/object/book-covers/${objectPath}`, supabaseUrl);
    const upload = await fetchImpl(objectUrl, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'image/jpeg', 'Cache-Control': 'max-age=31536000', 'x-upsert': 'true' },
      body: new Uint8Array(image).buffer,
      signal: AbortSignal.timeout(20_000),
    });
    if (!upload.ok) throw new Error(`Could not upload approved cover: HTTP ${upload.status}`);
    const publicUrl = new URL(`/storage/v1/object/public/book-covers/${objectPath}`, supabaseUrl).toString();
    if (await checksum(await downloadCover(publicUrl, fetchImpl)) !== hash) {
      throw new Error('Public uploaded cover checksum does not match.');
    }
    const publish = await fetchImpl(new URL('/rest/v1/rpc/publish_approved_book_cover', supabaseUrl), {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        p_book_id: approval.book_id,
        p_source_url: approval.source_url,
        p_permission_reference: approval.permission_reference,
        p_attempted_at: attemptedAt,
        p_original_cover_url: books[0].cover_url,
        p_object_path: objectPath,
        p_public_url: publicUrl,
        p_checksum: hash,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!publish.ok) throw new Error(`Could not publish approved cover (approval or catalog may have changed): HTTP ${publish.status}`);
    report.published += 1;
  } catch (error) {
    report.errors += 1;
    const message = error instanceof Error ? error.message : 'Approved cover import failed.';
    console.error('Approved book cover import failed:', message);
    if (claimed) {
      claimed.url.searchParams.set('attempted_at', `eq.${claimed.attemptedAt}`);
      try {
        const failure = await fetchImpl(claimed.url, {
          method: 'PATCH',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'failed', last_error: message }),
          signal: AbortSignal.timeout(10_000),
        });
        if (!failure.ok) throw new Error(`HTTP ${failure.status}`);
      } catch (failureError) {
        console.error('Could not record cover import failure:', failureError);
      }
    }
  }
  return report;
}
