# Supabase Setup

1. Create a Supabase project and enable **Anonymous Sign-Ins** under Authentication provider settings.
2. Link this repository to the project and apply the database migrations:

   ```bash
   npx supabase login
   npx supabase link --project-ref YOUR_PROJECT_REF
   npx supabase db push --remote
   ```

3. Copy `.env.example` to `.env` and set `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` using the project URL and public anon/publishable key from the Supabase API settings.
4. Restart Expo after changing `.env`:

   ```bash
   npx expo start --web
   ```

5. In **Authentication → URL Configuration**, add the app URLs to the Redirect URLs allow-list. For local web development, add `http://localhost:8081/**`. For native builds, allow the `booquip://**` scheme; Expo Go may use a development URL that must also be allowed.

## Book Catalog

When Supabase is configured, the app loads book metadata from `public.books`, category labels from `public.pillars`, and adaptations from `public.book_adaptations`; the bundled data in `lib/books.ts` remains a local/offline fallback if Supabase is unavailable. The catalog contains 80 records: 30 active Screen books and 50 archived records retained for existing user shelves and history. Add future books and adaptations through migrations so configured clients share one source.

## Book Taglines

Discovery shows a short, curated tagline below the author in emphasized type. The `book_taglines` migration adds the optional `public.books.tagline` field and seeds taglines for the curated catalog. Apply the latest database migrations before using this app version with Supabase; the bundled catalog also includes taglines for offline preview.

The `chart_taglines` migration and updated `global-chart-sync` function generate missing Charts taglines in batches of 25, using the existing server-only `OPENAI_API_KEY`. `OPENAI_BOOK_TAGLINE_MODEL` optionally selects a model independently of other AI features. The hourly job preserves existing taglines, records attempt times for fair retries, and reports generation failures in `taglines`. Generated lines are editorial descriptions based on supplied metadata, not quotations from a book. Until a stored tagline is available, Charts shows a neutral reading invitation rather than an empty gap. Pull-to-refresh loads newly generated taglines into the app.

## Book Cover Storage

The `book_cover_storage` migration prepares the public `book-covers` bucket for covers with confirmed rehosting rights. It accepts JPEG, PNG, and WebP files up to 5 MiB. Public object URLs allow unauthenticated image downloads; client uploads, updates, and deletes are blocked by restrictive policies, even if another policy allows writes to other buckets. Backend imports must use the server-only service-role key. Never expose that key to the app.

Apply the migration with `npx supabase db push --remote`. This step does not import images or change catalog URLs. Existing external cover URLs remain in use. Do not copy Open Library or NYT-supplied covers into the bucket without establishing permission to rehost them.

### Importing Approved Covers

Run `pipeline/import-book-covers.mjs` with Node.js 22.18+ from a trusted backend/admin environment after installing development dependencies (`npm ci --include=dev`). It requires server-only `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` environment variables. Do not put these credentials in the manifest, app, or repository.

Create a trusted JSON manifest outside version control with this shape:

```json
{
  "covers": [
    {
      "bookId": "catalog-book-id",
      "sourceUrl": "https://approved-provider.example/cover.jpg",
      "approvedForRehosting": true,
      "permissionReference": "Reference to permission covering storage, resizing, and public distribution"
    }
  ]
}
```

Only list images whose rights have actually been confirmed; the approval fields record your decision, not an automatic license check. Use reviewed HTTPS image URLs, not untrusted user submissions. Redirects are rejected; specify the final permitted image URL.

```bash
node pipeline/import-book-covers.mjs /secure/path/approved-covers.json
```

The importer validates and bounds downloads to 10 MiB and 40 million decoded pixels, converts single-frame JPEG/PNG/WebP images to WebP within 800 x 1200 without enlarging, and uploads sequentially to content-hashed paths. Existing objects are not overwritten. The default local journal, `pipeline/.cover-import/results.json`, is gitignored and atomically updated after each attempt. Keep it for provenance and recovery: it records the approval reference, source URL, original catalog cover URL, uploaded URL, checksum, and failures. Re-run the same command to skip successful objects that still exist and retry failures or missing objects. Do not run concurrent imports against the same journal.

An optional second argument selects a different journal path. Journals are project-specific. Errors are reported and cause a nonzero exit status. This importer does **not** update `books.cover_url` or chart ingestion; publishing uploaded covers is a separate step.

### Publishing Uploaded Covers

Use the import journal with `pipeline/publish-book-covers.mjs` in the same trusted environment and with the same server-only credentials. Preview changes first:

```bash
node pipeline/publish-book-covers.mjs pipeline/.cover-import/results.json
node pipeline/publish-book-covers.mjs pipeline/.cover-import/results.json --apply
```

The default is read-only. Only successfully uploaded entries with approval records are eligible. Before updating each `books.cover_url`, the publisher checks the target project and object path, downloads the public Storage URL without credentials, and verifies its SHA-256 checksum. Failed imports and unavailable or mismatched objects leave the existing URL unchanged. It updates only records whose current cover still matches the original value saved by the importer, including null values, and checks that exactly one row changed. Conflicts and failures are reported with a nonzero exit status; other eligible books continue. Re-runs recognize already-published URLs. Keep the import journal, which preserves the original URLs for recovery.

Apply the `approved_cover_imports` migration before publishing. The publisher sets `books.hosted_cover_url` alongside `cover_url`; a database trigger keeps that hosted URL in place during future catalog upserts while retaining provider URLs in `cover_source_url`.

### Automatic Supabase Cover Imports

The `approved_cover_imports` migration queues existing and newly inserted catalog books in the backend-only `book_cover_imports` table. Queue entries start **unapproved**. Neither catalog ingestion nor this migration grants rehosting rights. Source URLs and permission references must be reviewed by an administrator; do not blanket-approve a provider. For a cover with confirmed permission, use the SQL editor or a trusted service-role client:

```sql
update public.book_cover_imports
set source_url = 'https://approved-provider.example/cover.jpg',
    permission_reference = 'Reference to permission covering resizing and public distribution',
    approved_for_rehosting = true
where book_id = 'catalog-book-id';
```

Deploy `global-chart-sync` after applying the migration:

```bash
npx supabase functions deploy global-chart-sync
```

The existing hourly Supabase job processes one approved, unpublished cover per invocation before metadata ingestion; new catalog titles become eligible on a later invocation after approval. No GitHub Actions worker or new credentials are needed. The Edge-compatible ImageScript optimizer decodes JPEG, PNG, or WebP, applies orientation, limits input to 10 MiB and 4 million decoded pixels, and produces JPEG within 800 x 1200 without enlarging. JPEG output avoids native Node.js dependencies and keeps Edge CPU usage low. The optional manual Node tools still produce WebP.

Uploads use content-hashed paths and long cache lifetimes. Before publishing, the job fetches the public URL without credentials and checks its SHA-256 hash. A database function atomically rechecks approval, attempt ownership, Storage object existence, and the previous catalog URL before publishing and recording provenance. Metadata sync cannot overwrite `hosted_cover_url`. Retries may re-upload identical bytes at the same hash path; changed image content gets a different path.

Attempts use a ten-minute lease to prevent overlapping sync invocations from processing the same approval. Failures retain the current cover URL, save `last_error`, and are eligible for a later retry; inspect the sync report's `covers` section and `book_cover_imports`. Changing a source, permission reference, or approval resets its pending status and invalidates in-flight publication. Existing approval records are not automatically replaced or reapproved when upstream metadata changes.

Revoking approval stops future imports but does not remove a published image. For a takedown, also clear the book's `hosted_cover_url` (the trigger restores its last provider URL) and remove the Storage object through a trusted administrator. Retain any required permission/provenance records before replacing or deleting an approval.

## Book Keywords

Discovery cards display three stored keywords when available. Apply the latest migrations and deploy `global-chart-sync` to enable keyword generation for existing books and new chart imports. The scheduled sync uses the server-side `OPENAI_API_KEY` and processes up to 25 pending books per run; `OPENAI_BOOK_KEYWORDS_MODEL` optionally selects a model. Books without sufficient information or a successful generation remain pending and are retried on later syncs. Offline preview does not generate keywords. Check the sync report's `keywords` section for generation errors.

The hourly `global-chart-sync` job also requires the deployed function, the `CHART_SYNC_SECRET` function secret, and the `chart_sync_url` and `chart_sync_secret` Vault entries described by the scheduling migration. Until the migration is applied and the sync runs, the new keyword data is not available.

## TMDb Adaptation Matching

`TMDB_API_KEY` is held as a Supabase Function secret. The one-time `tmdb-adaptation-sync` function searches only pending curated adaptations, sequentially with a 300 ms pause, and stores a TMDb ID only when media type, normalized title, and release year all match exactly. It then requests credits once for each exact match and caches only the first three credited names. It stores lookup/credits check times so completed records are not repeatedly queried. It does not retrieve posters, overviews, or provider listings, and the app makes no TMDb requests while users browse.

For a future catalog refresh, set a temporary random `TMDB_SYNC_SECRET` in Supabase Function secrets, deploy `tmdb-adaptation-sync`, and invoke it from a secure admin environment using the `x-tmdb-sync-secret` header. After it finishes, unset `TMDB_SYNC_SECRET` and delete the temporary deployed function. Keep the required TMDb attribution in the app wherever matched TMDb data is shown.

## Account Deletion

Linked, confirmed users can permanently delete their account from the account panel. The `delete-user-account` Edge Function verifies the caller's session and derives the deletion target from that identity; it never accepts a user ID from the client. Profiles and swipe data are removed by their `ON DELETE CASCADE` foreign keys.

```bash
npx supabase functions deploy delete-user-account
```

The function uses Supabase's server-side `SUPABASE_SERVICE_ROLE_KEY` runtime secret. Never expose that key to the app or add it to an `EXPO_PUBLIC_` variable.

## AI On-Ramp

The book-card on-ramp runs in the `book-on-ramp` Edge Function. Keep the OpenAI API key in Supabase Functions secrets, never in an `EXPO_PUBLIC_` variable:

```bash
npx supabase secrets set OPENAI_API_KEY=your-openai-api-key
npx supabase functions deploy book-on-ramp
```

The function requires a signed-in Supabase session and uses `gpt-4o-mini` by default. To choose another supported model for this feature only, set the server-side `OPENAI_BOOK_ON_RAMP_MODEL` secret. Future AI functions should use their own model setting, such as `OPENAI_SOCIAL_GHOSTWRITER_MODEL`, so changing one feature never changes another.

## Social Ghostwriter

The Read shelf's **Draft** action opens an editable LinkedIn or X post. The authenticated `social-ghostwriter` Edge Function verifies that the selected book is in the caller's Read shelf before generating a draft. It uses `gpt-4o` by default, independently of the On-Ramp model; to choose another supported model, set `OPENAI_SOCIAL_GHOSTWRITER_MODEL` as a Supabase Function secret.

```bash
npx supabase functions deploy social-ghostwriter
```

## Trend Interceptor

The Quip page sends reviewed seed text from writing, screenshot extraction, or a selected trend to the authenticated `trend-interceptor` Edge Function; nothing is published automatically. The function verifies selected books against the caller's RLS-protected, Quip-enabled Read-shelf rows and limits seed text to 2,000 characters. When a trend ID is provided, its current topic and related headlines are loaded as context. It uses `gpt-4o` by default; set `OPENAI_TREND_INTERCEPTOR_MODEL` as a Supabase Function secret to choose another model that supports JSON-object responses.

New clients send explicit nonempty `bookIds`, `includeRelevance: true`, `stance` (`pro`, `neutral`, `cons`), and `style` (`natural`, `curious`, `reflective`, `witty`, `challenging`, `practical`, `empathetic`, `concise`). Omitted stance/style default to Neutral + Natural, retaining the original writing instructions. Concise replaces the usual writing length with 1–2 sentences and at most 280 characters; both server and client reject longer results instead of truncating them. Other styles retain their 600-character limit. One model call returns `{ reply, relevance: [{ bookId, level }] }`, with `level` one of `high`, `medium`, `low`, `insufficient`. Relevance is to the seed, independently of stance/style and actual use in the reply, based only on supplied metadata and short takes. Every selected book must have exactly one assessment; missing, duplicate, foreign IDs, invalid flags, truncated output, and oversized Quips are rejected. Ineligible selections return an error instead of silently generating from a subset. Deselected books are never loaded into the model context. No schema migration is required.

Book-based idea generation sends `{ mode: "idea", bookIds: [...] }` to the same authenticated endpoint. Explicit selected IDs are required and undergo the same Read-shelf/Quip-enabled verification. Seed, trend, stance, style, and relevance inputs are rejected in this mode and are not sent to OpenAI. One JSON-mode model call uses only selected-book metadata and short takes, connecting books when justified or choosing one standalone idea. The prompt makes clear that one book and a short or truncated but substantive summary can be sufficient; ranking-only or promotional information is not. This guidance cannot guarantee the model's judgment. It returns `{ idea }`; empty, malformed, extra-field, truncated, or over-200-character results are rejected rather than silently shortened. When the model reports insufficient summaries, the endpoint returns a descriptive 422 error instead of a seed. The app inserts a valid idea into the editable seed, requires AI consent for both idea and Quip generation, and keeps screenshot consent separate. Consent is a client UX control, not a new server authorization mechanism or stored legal record.

Deploy this function before distributing the updated app, including builds that expose Concise; older deployments reject that new style. Older clients that omit `includeRelevance` retain the plain `{ reply }` response, original prompt, and original token budget. Enhanced Quip and idea generation have a 45-second model timeout and a 60-second app timeout. The app bounds the wait even if a transport ignores cancellation. The 30s-read client has a 30-second deadline and cancels on book changes; no on-ramp backend changes are required. UI changes require a fresh app build.

Style guidance requires a recognizable technique: Natural makes one plainspoken point, Curious asks a genuine open-ended question, Reflective develops a tension or implication, Witty adds a playful turn, Challenging questions an explicit assumption, Practical offers a concrete next step, and Empathetic acknowledges a relevant human difficulty without assuming personal circumstances. Witty, Challenging, and Empathetic include stance-matched technique illustrations that must not be copied. The model is instructed to check and revise its draft within the same generation request, without a separate model call or validator. The existing Neutral + Natural prompt is deliberately unchanged; Natural's stronger guidance applies to Pro and Cons. Prompt guidance improves consistency but does not guarantee style adherence, so review real outputs when tuning it. These backend-only refinements need no app layout change, database migration, or new APK.

```bash
npx supabase functions deploy trend-interceptor
```

The account screen links an email to the existing anonymous user with `auth.updateUser`, so the user ID and shelf are preserved. The email must be confirmed before the account is considered linked.

The public anon/publishable key is intended for app clients; row-level security protects user data. Never put a Supabase service-role key or other private API key in an `EXPO_PUBLIC_` variable. Without these environment values, the app runs in local preview mode and swipe changes last only for the current session.