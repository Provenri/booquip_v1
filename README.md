# 💬📖 BooQuip — Book Discovery & Quip

> **Find a book. Shape a thought.**

**BooQuip** is a cross-platform reading app with a library hub and two destinations: **Book** for discovering and managing a reading list, and **Quip** for drafting book-informed replies to current conversations.

---

## Product Experience

### Your Library
The landing page keeps the **Your Library** banner and presents two peer sections, **Book** and **Quip**. Neither section is selected by default.

### Book
Book discovery has three top-level categories: **Screen**, **Charts**, and **Classics**. Search and Surprise Me find active catalog titles; book cards retain the three actions **Save to TBR**, **Already read**, and **Snooze 90 days**. The category wheel and nested shelves are not used.

Screen books remain active. Former Civilization/Digital titles are archived rather than deleted, preserving existing TBR, Read, and snooze records while removing them from new discovery. Charts and Classics start empty for future curation.

### Quip
Quip opens the trend-reply workflow from the Read shelf. Readers can use one Read book or their entire Read shelf as context, paste a post or topic, edit the generated reply, and copy it. Nothing is published automatically.

### 🤖 BooQuip AI Companion
* **Intellectual On-Ramp:** Translates dense historical classics into 30-second modern analogies right on the reveal card.
* **Social Ghostwriter & Trend Interceptor:** Scans a user's `Swiped Up` (Read) archive to draft high-status LinkedIn/X posts or contrarian replies to live trending topics (*"Forged on BooQuip"*).

### 🌐 Web Companion & Public Share Cards (`booquip.app`)
* **Landing & Interactive Demo:** Public marketing page with a live try-before-you-download single-card demo and App Store / Google Play badges.
* **Public Taste Constellations:** Shareable profile URLs (`booquip.app/u/[username]`) linked from *"Forged on BooQuip"* social posts.
* **Desktop AI Studio:** Logged-in web app allowing desktop users to review their TBR shelf and generate LinkedIn/X threads directly beside their open social tabs.

---

## 🔐 Authentication & User Management (Supabase Auth)

BooQuip syncs user shelves, swipe states, and *Humanity Quotient* metrics seamlessly across iOS, Android, and Web (`booquip.app`) using **Supabase Auth**:

   * Launches immediately using **Supabase Anonymous Sign-Ins** so new users can tap and swipe cards with zero login friction.
   * Prompts account creation after **3 Right Swipes (TBR)** or upon opening the **AI Social Studio**, automatically merging guest swipes into the permanent account.
2. **Sign-In Providers:**
   * **Continue with Apple** (mandatory for iOS App Store compliance).
   * **Continue with Google** (fast Android and desktop web sign-in).
   * **Email Magic Link** (passwordless authentication).
3. **Profile & Tier Management (`public.profiles`):**
   * Auto-provisioned via PostgreSQL trigger upon registration.
   * Tracks `username` (for public share URLs), `tier` (`free` vs. `pro`), `daily_spins_used` (10/day cap on free tier), and `hq_score` / `taste_map` stats.
   * Protected via PostgreSQL **Row-Level Security (RLS)** so users only read/write their own private swipes while public profile stats remain shareable.
4. **App Store & Play Store Compliance (Self-Serve Deletion):**
   * Includes an in-app **"Delete Account & Data"** setting backed by a `delete-user-account` Edge Function that permanently wipes the `auth.users` record and all cascading swipe/profile data.

---

## 🎨 Brand Identity & Visual System

* **Brand Name:** BooQuip
* **Primary Mark:** Mint speech-bubble open book icon (`#3ED19A`) paired with deep slate charcoal (`#1E2E30`) and crisp off-white (`#F6F8F8`).

---

## 🛠️ Technical Stack (Windows + Cloud Workflow)

* **Universal Frontend (iOS, Android, & Web):** React Native + Expo + Expo Router (TypeScript)
* **Live Mobile Testing:** Expo Go (iOS/Android via Wi-Fi Tunnel)
* **Web Hosting & CDN:** Vercel (Free Tier — auto-deploys static Expo Web builds from GitHub)
* **Mobile Store Compiles:** Expo Application Services (EAS Build — compiles iOS `.ipa` and Android `.aab` without a Mac)
* **Backend, Auth & Database:** Supabase (PostgreSQL, Auth, Edge Functions, Storage)
* **Data Ingestion Workers:** Python Cron Jobs hosted on Render
* **AI Orchestration (Pay-As-You-Go API):**
  * `gpt-4o-mini` (Structured JSON metadata tagging & Cognitive Load scoring)
  * `gpt-4o` (Live AI On-Ramp, Book Club Debriefs, & Social Media Ghostwriting)

---

## 📂 Repository Structure
```text
├── app/ # Expo Router universal screens (Landing, Discover, Shelf, AI Studio, Profile, Auth)
├── assets/ # Brand marks (mint speech-bubble book icon, splash screens, favicons)
├── components/ # Cross-platform UI (CategoryPillBar, FourWaySwiper, TasteConstellation, AuthModal)
├── lib/ # Supabase client, Auth session provider, OpenAI hooks, & state management (Zustand)
├── supabase/
│ ├── functions/ # Edge Functions (ai-on-ramp, social-ghostwriter, trend-interceptor, delete-user-account)
│ └── migrations/ # PostgreSQL database schemas, auto-profile triggers, & RLS policies
├── .devcontainer/ # GitHub Codespaces environment setup
└── README.md
```

---


### 1. Prerequisites
* A free [Supabase](https://supabase.com) account (with Anonymous Sign-Ins, Apple, Google, and Email enabled under Authentication)
* An [OpenAI API](https://openai.com) pay-as-you-go key
* A free [TMDb API](https://themoviedb.org) key (for movie/TV adaptation metadata)
* **Expo Go** installed on your physical iPhone or Android device

### 2. Environment Setup
Create a `.env` file in the root directory and populate your keys:

```env
EXPO_PUBLIC_SUPABASE_URL=your_supabase_project_url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
OPENAI_API_KEY=your_openai_api_key
TMDB_API_KEY=your_tmdb_api_key
```

### 3. Install Dependencies & Run Dev Servers
Run the following commands inside your Codespaces terminal:

```bash
# Install universal frontend packages
npm install

# Option A: Start Mobile Dev Server with tunnel mode (Codespaces -> Physical Phone via Expo Go)
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
screenshot uploads, trend-picker navigation, keyboard layout, shelf sync,
and account deletion. A successful cloud build alone does not verify these flows.

Camera and microphone permissions are disabled; screenshot input uses only the
photo library. Android and iOS builds can be compiled with EAS from Linux;
no local Mac is needed for cloud builds.

---
- [ ] **Phase 3: Core Discovery Loop** — Use the Book/Quip library hub, Screen/Charts/Classics categories, Search and Surprise Me, and the three TBR/Read/Snooze actions.
- [ ] **Phase 4: AI Integration** — Connect Supabase Edge Functions for the *AI On-Ramp*, *Social Post Generator*, and *Account Deletion*.
- [ ] **Phase 5: Web & Mobile Beta Launch** — Deploy web companion to Vercel (`booquip.app`) and mobile builds via Apple TestFlight and Google Play Internal Testing.
