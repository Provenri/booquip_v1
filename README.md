# 💬📖 BooQuip — High-Impact Book Discovery & Social Ghostwriter

> **Tap a pillar. Swipe or key in 4 directions. Forge sharper social takes.**

**BooQuip** eliminates bedtime scrolling and decision paralysis through frictionless, high-impact book discovery across **iOS, Android, and Web**. Instead of endless text lists or spinning wheels, users tap one of **3 Core Impact Buttons** (or **✨ Surprise Me**) to reveal **one single curated book card**. Users triage each book in seconds using a **4-Way Gestural Swipe** (or desktop arrow keys)—and turn completed reads into high-status social media posts via AI.

---

## 🎯 Core Product Architecture

### 🔘 The 3 Core Buttons + Surprise Me (Zero-Friction Discovery)
Users tap a single pill at the top of the screen based on their immediate energy to draw one high-impact book at a time:

1. **🎬 Screen** *(Visual Impact)*
   * Rotates internally across *The Launchpad* (adaptations premiering in the next 12 months), *Oscar Gold Standard* (award-winning films), and *Streaming Universe* (multi-season TV epics).
2. **🏛️ Civilization** *(Historical Impact)*
   * Rotates internally across *Blueprints of Power* (political/social treatises), *Scientific Paradigm Shifts*, and *The Forbidden Shelves* (historically banned texts).
3. **📱 Digital** *(Cultural Immediacy)*
   * Rotates internally across *Substack & Longform Pioneers* (viral digital essays turned books) and *Algorithmic Blockbusters* (#BookTok, Reddit, and crowdfunded hits).
4. **✨ Surprise Me** *(Serendipity Mode)*
   * Draws a single high-impact book randomly across all three pillars.

### 🕹️ The 4-Way Triage (Mobile Touch + Web Keyboard)
Each revealed book card occupies center stage and is sorted with one thumb gesture on mobile or arrow key on web:
* **▶️ Swipe Right / `ArrowRight`:** Lock into **To-Be-Read (TBR)** queue.
* **🔼 Swipe Up / `ArrowUp`:** Mark as **Already Read** (updates user's *Humanity Quotient* & *Taste Constellation*).
* **◀️ Swipe Left / `ArrowLeft`:** **Deep Freeze** (snooze book for 90 days).
* **🔽 Swipe Down / `ArrowDown`:** **Next / Recycle** (drop book back into the discovery pool and deal the next card).

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

1. **Frictionless Onboarding ("Try Before You Sign Up"):**
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
* **App Store Subtitle:** *High-Impact Books & Smart Takes*
* **Primary Mark:** Mint speech-bubble open book icon (`#3ED19A`) paired with deep slate charcoal (`#1E2E30`) and crisp off-white (`#F6F8F8`).

---

## 🛠️ Technical Stack (Windows + Cloud Workflow)

* **IDE & Cloud Workspace:** GitHub Codespaces (VS Code + GitHub Copilot)
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
├── pipeline/ # Python data scrapers (TMDb API, Open Syllabus, Substack/Reddit)
├── .devcontainer/ # GitHub Codespaces environment setup
└── README.md
```

---

## 🚀 Getting Started in GitHub Codespaces

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
```bash
# Install EAS CLI globally
npm install -g eas-cli

# Log in to your Expo account
eas login

# Trigger cloud builds for both iOS (TestFlight) and Android (Play Console)
eas build --platform all
```

---

## 🗺️ MVP Development Roadmap

- [ ] **Phase 1: Foundation** — Initialize universal Expo TypeScript template (iOS, Android, Web) and configure `.devcontainer` for Codespaces.
- [ ] **Phase 2: Database, Auth & Ingestion** — Set up Supabase Auth (Anonymous + Apple/Google/Magic Link), tables (`profiles`, `books`, `user_swipes`, `ai_insights`), and run initial `gpt-4o-mini` tagging script for 100 seed books.
- [ ] **Phase 3: Core Discovery Loop** — Build the 3-Button + Surprise Me top bar and the 4-Way Swipe / Arrow-Key Card component.
- [ ] **Phase 4: AI Integration** — Connect Supabase Edge Functions for the *AI On-Ramp*, *Social Post Generator*, and *Account Deletion*.
- [ ] **Phase 5: Web & Mobile Beta Launch** — Deploy web companion to Vercel (`booquip.app`) and mobile builds via Apple TestFlight and Google Play Internal Testing.
