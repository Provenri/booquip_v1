# 💬📖 BooQuip — Book Discovery & Quip

> **Find a book. Shape a thought.**

**BooQuip** is a cross-platform reading app with a library hub and two destinations: **Book** for discovering and managing a reading list, and **Quip** for drafting book-informed replies to current conversations.

---

## Product Experience

### Your Library
The app opens on **Book**. Tap the booquip logo to open the **Your Library** hub with its **Book** and **Quip** sections.

### Book
Book discovery has three top-level categories: **Screen**, **Charts**, and **Classics**. Screen is selected initially; search finds available titles in the selected category and Surprise Me chooses from all categories. Touch the cover, title, or author to reveal the directions: swipe left for the next book or right to move the book to **To read**. While touching the cover, a compact hint explains that double-tapping marks it **Already read**. Screen readers can access all three book actions. The separate **Snooze** and **Already read** buttons remain available. Completed actions provide haptic feedback on supported devices.

Mobile navigation uses **Book**, **Quip**, **To read**, **Finished**, and **Snoozed** tabs. Book headings use the bundled Newsreader font; counts, covers, and adaptation details come from the real catalog and shelves.

Discovery preloads the next book's cover, including hosted Supabase covers. Covers use Expo Image's memory and disk cache on native devices; web caching follows the browser and image server's cache rules. Hosted covers use content-hashed URLs, so replacements get fresh cache entries without clearing cached images. Image recycling and failure states follow the cover URL rather than the book ID, so a failed old image does not hide its replacement. Adding Expo Image requires a new development or preview build.

Taglines and keywords sit directly below the author, with category details above the action buttons. While touching or dragging the book, **Next book** and **Move to shelf** hints appear beside the cover at its vertical midpoint without covering it. The hints are not buttons; they move and leave with the book during a swipe, and hide when a touch ends without a swipe. Book changes use a quick fade-in without an extra waiting period. Tap **30s read** to load a saved AI-generated on-ramp based on the book's short catalog summary; tap again to hide or show it. Loading shows a spinner, and a missing read is reported without making an AI request. Shelf-saving delays show a spinner and **Waiting…** on the active **Snooze** or **Already read** button. Duplicate requests are blocked, changing books cancels the old request, and a stalled request shows a retryable error after 30 seconds.

After applying the 30s-read cache migration, generate reads from a trusted admin environment with server-only `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `OPENAI_API_KEY`. Run `npm run onramp:cache -- --limit 5` to review a small batch, `npm run onramp:cache -- --book-id dune` for a specific book, or `npm run onramp:cache` for the whole catalog. Add `--force` to regenerate current entries. `OPENAI_BOOK_ON_RAMP_MODEL` optionally selects the model and defaults to `gpt-4o-mini`. Generation makes one OpenAI request per uncached book; failures are reported and make the command exit nonzero. The source title, author, publication year, and summary are checked before saving; edits invalidate cached reads. Bump `BOOK_ON_RAMP_CACHE_VERSION` when the prompt or output contract changes, and rerun the batch after catalog changes. Keep credentials outside the app and repository. Existing installed builds still call the original `book-on-ramp` function and may incur AI costs until updated.

Apply the 30s-read migration before distributing the updated app, and populate the cache before rollout so books have reads available. The new app never falls back to live generation; books without a current cached read show an unavailable message.

The legacy `book-on-ramp` function source has been removed. Retire a deployed copy with `npx supabase functions delete book-on-ramp`; older builds that call it will lose live reads after deletion. The cache generator and current cached **30s read** feature remain available.

Pull down on Book, Quip, Library, or any shelf page to reload catalog metadata, category availability, rankings, and shelf state without discarding a Quip draft or existing source selections. Refresh failures are shown in the page; local preview rechecks its in-memory state.

Screen books remain active. Former Civilization/Digital titles are archived rather than deleted, preserving existing TBR, Read, and snooze records while removing them from new discovery. Category availability follows the loaded catalog.

### Quip
Quip starts with **one book from To read or Finished**. Swipe right on a shelf book or tap **Quip** to open the workspace with that book selected; it stays on its shelf. **Change book** opens a virtualized picker covering both shelves and identifies each book's available actions. Opening Quip directly lets users choose a book. A left swipe or **Return** removes a book from the shelf and offers **Undo** to restore its shelf and previous legacy Quip setting. Horizontal gestures ignore vertical scrolling; visible buttons provide alternatives to swiping. Snoozed books retain their existing Wake action.

After selecting a book, choose **Explore ready-made Quips** or **Craft a Quip**. Both shelves allow ready-made drafts; crafting is available only for Finished books and is checked again by the backend. The old Quip on/off switch is no longer needed in the new UI; older multi-book clients retain their Quip-enabled shelf filter.

**Craft a Quip** reveals an idea box with the placeholder “Share a thought or paste a post. Bring this book’s perspective to the conversation.” The placeholder is not submitted as content. The new journey does not include Idea, Trends, Screenshot, or Suggest a book. Check the initially unchecked **I agree to send Quip inputs to OpenAI** checkbox, then tap **Generate Quip**. The idea and selected book's metadata/summary are sent via Supabase; the model does not read the full book. Consent lasts only while the workspace remains mounted and resets when changing books. Remove private or sensitive information before submitting. Nothing is published automatically.

Crafting offers **Stance** (Pro, Neutral, Cons) and **Style** (Neutral, Curious, Witty), defaulting to Neutral for both. The Neutral style keeps the internal `natural` value. Quips request 1–2 sentences and are capped at **280 characters**, enforced by the backend, response parser, and editor. Selecting a different book switches immediately and clears the current idea and draft, resets the selected path and preferences, and unchecks consent. Selecting the current book or closing the picker leaves the workspace unchanged. Custom drafts are marked stale when their inputs change. Inputs are locked during generation, and stale or unfinished responses are not presented as new drafts.

The selected book's cache loads in the background so its topic and explanation remain in the book card while the user moves between Quip paths. Only the selected book's cache is loaded; it contains up to nine drafts. **Explore ready-made Quips** lets users choose a **Stance** (Pro, Neutral, Cons) and **Style** (Neutral, Curious, Witty) to preview one saved version at a time. The selected values remain visible in the controls, outside the Quip preview. Choose **Edit this Quip** to load it into the editor or **Copy as-is** to copy the saved text directly without replacing the editor. Replacing an existing draft requires confirmation. These are pre-generated alternatives, not controls that trigger generation, and no user idea is sent to OpenAI. Missing caches and load errors have explicit messages and retry. Loaded drafts are reused in memory while the workspace remains mounted; refresh clears that cache. Shelf pages do not load Quip drafts.

Generate or refresh the shared cache only from a trusted backend/admin environment after applying the Quip-cache migration. Set server-only `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `OPENAI_API_KEY`, then run `npm run quip:cache -- --book-id dune` to generate one book or `npm run quip:cache -- --limit 5` for up to five catalog books. Add `--force` to regenerate matching entries. `OPENAI_QUIP_CACHE_MODEL` optionally selects the batch model; it defaults to `gpt-4o-mini`. The generator validates the full nine-variant matrix before upserting, skips complete current caches, and reports failures with a nonzero exit status. Never put these credentials in the app or repository. Changes to a book title, author, or summary automatically invalidate its cached variants; prompt changes require bumping `QUIP_CACHE_PROMPT_VERSION`.

Crafting shows **Crafting…** during generation. Duplicate submissions and conflicting inputs are disabled while unrelated navigation stays available. Generation has a 60-second client deadline and cache loading a 15-second deadline, including stalled transports, with explicit retryable errors.

**Deployment:** apply the Quip-cache migration and deploy `supabase functions deploy trend-interceptor` before distributing the updated app. New clients send `workflow: "single-book"` with exactly one Finished book ID. This workflow no longer requires `quip_enabled`, but still rejects books outside Finished, unsupported styles, and relevance options, returning only `{ "reply": "..." }`. Requests without the workflow field retain existing multi-book, relevance, style, and length behaviour and the legacy Quip-enabled filter. No new dependency is required. Ready-made Quips remain unavailable until the trusted batch generator is run; crafting does not depend on cache entries.

## 🔐 Authentication & User Management (Supabase Auth)

* With Supabase configured, anonymous sign-in lets guests browse and save books without creating an account first. Row-level security protects each user's shelf.
* The account panel links an email to the existing guest account, preserving its user ID and shelf. Email confirmation completes linking; returning users sign in with an email magic link.
* Confirmed, linked users can choose **Delete Account & Data**. The `delete-user-account` Edge Function deletes the authenticated user and cascading profile/swipe records.
* Without Supabase configuration, local preview keeps shelf changes only for the current session.

---

## 🎨 Brand Identity & Visual System

* **Brand Name:** BooQuip

### Mobile UI foundations

The Expo SDK 54 app uses Reanimated and Gesture Handler for native swipe and press feedback, FlashList for the book picker and growing shelf lists, and shared color, spacing, radius, and typography tokens from `constants/theme.ts`. Safe-area context is applied at the app root and to modal sheets. These native dependencies require a development or preview build; rebuild the app after changing them rather than relying on an older installed binary.

---

## 🛠️ Technical Stack (Windows + Cloud Workflow)

* **Universal Frontend (iOS, Android, & Web):** React Native + Expo + Expo Router (TypeScript)
* **Live Mobile Testing:** Expo development or preview builds (iOS/Android); FlashList 2 requires a native build rather than Expo Go
* **Web Hosting & CDN:** Vercel (Free Tier — auto-deploys static Expo Web builds from GitHub)
* **Mobile Store Compiles:** Expo Application Services (EAS Build — compiles iOS `.ipa` and Android `.aab` without a Mac)
* **Backend, Auth & Database:** Supabase (PostgreSQL, Auth, Edge Functions, Storage)
* **Catalog Sync:** Scheduled Supabase Edge Function for book charts and metadata enrichment
* **AI:** Server-side OpenAI calls for custom Quips and catalog enrichment; trusted Node.js batch generators for cached Quips and 30s reads

---

## 📂 Repository Structure
```text
├── app/ # Expo Router entry, layout, Book/Quip navigation, and shelves
├── components/ # Book cards, Quip workspace/picker, and account panel
├── constants/ # Shared theme tokens
├── lib/ # Catalog, shelves, authentication, cache clients, and Quip helpers
├── pipeline/ # Trusted admin cache generators and approved cover tools
├── supabase/
│ ├── functions/ # Catalog sync, Quip generation, account deletion, and compatibility endpoints
│ └── migrations/ # PostgreSQL database schemas, auto-profile triggers, & RLS policies
└── README.md
```

---


### 1. Prerequisites
* A [Supabase](https://supabase.com) project with Anonymous Sign-Ins and Email enabled for synced shelves and email accounts; see [backend setup](supabase/README.md).
* Server-only [OpenAI API](https://openai.com) credentials for AI features, and a [TMDb API](https://themoviedb.org) key only when running adaptation sync.
* An EAS development or preview build installed on your physical iPhone or Android device

### 2. Environment Setup
Create a `.env` file in the root directory with public app configuration:

```env
EXPO_PUBLIC_SUPABASE_URL=your_supabase_project_url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

Keep OpenAI, TMDb, and service-role credentials in trusted admin environments or Supabase Function secrets, not the app configuration.

### 3. Install Dependencies & Run Dev Servers
Run the following commands inside your Codespaces terminal:

```bash
# Install universal frontend packages
npm install

# Option A: Start Mobile Dev Server with tunnel mode (Codespaces -> Physical Phone via development build)
npx expo start --tunnel

# Option B: Start Web Dev Server (Preview in Codespaces browser port 8081)
npx expo start --web
```
---

## ☁️ Deployment (Web, App Store & Google Play from Windows)

### 1. Deploy Web App to Vercel
Connect your GitHub repository to [Vercel](https://vercel.com) using the following build settings:
* **Build Command:** `npx expo export --platform web`
* **Output Directory:** `dist`

### 2. Build Mobile Binaries via Expo EAS (No Mac Required)

Android and iOS use the application identifier `app.booquip.mobile` and the
`booquip` URL scheme. Preview builds use default Expo/OS branding for now;
final icons, splash assets, store screenshots, and privacy/support URLs are
still required before a public release.

```bash
# Sign in and create/link this repository's Expo project (once)
npx eas-cli login
npx eas-cli init

# Installable Android APK: runs standalone without a development server
npx eas-cli build --platform android --profile preview

# Development clients: connect to Metro with npm run dev
npx eas-cli build --platform android --profile development

# Store builds: Android AAB and iOS TestFlight/App Store binary
npx eas-cli build --platform all --profile production
```

Before building, configure `EXPO_PUBLIC_SUPABASE_URL` and
`EXPO_PUBLIC_SUPABASE_ANON_KEY` in the EAS environment used by the profile
(`development`, `preview`, or `production`). These are public client values;
never supply service-role keys, OpenAI keys, or `CHART_SYNC_SECRET` to the app.
Local `.env` files are git-ignored and excluded from the default EAS upload.

The `preview` profile produces an Android APK for direct installation.
An iOS internal preview requires an Apple Developer membership and registered
devices (register with `npx eas-cli device:create` before building).
The `production` profile increments build versions remotely. TestFlight requires
an Apple Developer membership, signing credentials, and an App Store Connect app;
Google Play distribution requires a Play Console account.
After creating the store records, submit with
`npx eas-cli submit --platform ios --profile production` or the Android equivalent.
The first Google Play upload may need to be done manually in Play Console.

For native email sign-in, allow `booquip://` and `booquip:///` in Supabase Auth's
redirect URL settings. Verify magic links on a real installed build, along with
keyboard layout, shelf sync,
and account deletion. A successful cloud build alone does not verify these flows.

Screenshot input and its image-picker dependency/plugin have been removed. Rebuild
native apps to apply the removal; existing installed binaries are unchanged.
Android and iOS builds can be compiled with EAS from Linux;
no local Mac is needed for cloud builds.
