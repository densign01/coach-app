# Coach — Product Requirements Document (PRD)

## 1. Problem Statement

Most apps silo nutrition and fitness. They either:

- Force precise calorie counting (which is unsustainable and frustrating).
- Or provide rigid, one-size-fits-all workout plans that ignore real-life changes.

**Coach** solves this by being holistic: it pairs nutrition + exercise coaching into one lightweight, conversational system. It adapts to the user — whether they did a 10k run, 20 push-ups, or just took a walk. It responds dynamically if the user is tired, sore,  traveling, or just busy. Coach meets you where you are, with the right tone and style for you.

---

## 2. Goals

### Beta (MVP)

- 3 core tabs (Home, Nutrition, Fitness).
- Chat-first interface powered by GPT-5-nano for parsing.
- Directional macro feedback (not calorie micromanagement).
- Adaptive workout logging (any activity counts) with weekly workout plans.
- Gentle nudges for small behavior changes (e.g., run an extra 10 minutes today, or do 20 pushups in the morning).
- Text-based meal logging (image uploads are post-MVP).

### Future

- Weekly trend dashboards (protein average, workout adherence).
- Food database integration for precise macros.
- Goal-based nudging (marathon vs. fat-loss vs. strength).
- Multi-platform syncing (wearables, steps, HR).

---

## 3. User Stories

- As a user, I want to log a meal in plain language and get directional feedback.
- As a user, I want to log any activity (walk, yoga, run) and have it count.
- As a user, I want the app to adapt if I’m tired, sick, or traveling.
- As a user, I want the interface to be minimal and not overwhelming.

---

## 4. Features

### Home Tab (Chat)

- Serves as primary interface with your **Coach;** where you tell it how you are doing and get feedback and support.
- Free text input → GPT-5-nano parses into JSON **and returns it in the chat for confirmation/correction**.
- Optional **image uploads (future)**: meal photos trigger the vision model flow after MVP.
- **Photos are not retained**: once the vision flow ships, the image is processed transiently and discarded; only the confirmed structured JSON is stored.
- Chat can **query your data** (workout plan for today, recent meals, macro totals) and summarize impacts (e.g., "how did lunch affect my protein target?").
- Context-aware nudges based on input ("I’m tired" → lighter plan suggestion).

### Nutrition Tab

- Displays meals by category (Breakfast, Lunch, Dinner, Snacks).
- Shows daily totals vs. directional targets.
- Feedback framed as coaching guidance, not precision math.
- **Meal photos (future)**: once enabled, uploads appear in the chat preview only, with extracted items + estimated macros for confirmation, then discarded.

### Fitness Tab

- Workout plan (Strength A/B/C + cardio template).
- Workout history (all activities count).
- Adaptive adjustments based on skipped/modified sessions.

---

## 5. Data Flow

1. User logs input in Home tab.
2. **Text meals/workouts** → GPT-5-nano parses into JSON.
3. On confirmation/correction, JSON is saved (per user, per day). Nutrition and Fitness tabs render from state.
4. **Meal photos (future)** → uploaded to an **ephemeral endpoint** (no persistent storage). The vision model extracts foods/quantities and returns JSON to the chat for **user confirmation/correction**. The photo is discarded.
5. Chat can call simple **data queries** (e.g., get today’s plan, totals, recent meals) to answer questions and produce recaps.

Example JSON for text meal result:

```json
{
  "date": "2025-09-17",
  "meal": {
    "type": "Lunch",
    "items": ["chicken sandwich", "side salad"],
    "macros": {"cal": 500, "protein": 35, "fat": 15, "carbs": 45}
  }
}
```

Example JSON for photo meal result (after user confirmation):

```json
{
  "date": "2025-09-17",
  "meal": {
    "type": "Dinner",
    "items": ["grilled salmon (6 oz)", "rice (1 cup)", "broccoli (1 cup)"],
    "macros": {"cal": 700, "protein": 45, "fat": 25, "carbs": 70},
    "source": "vision_estimate"
  }
}
```

---

## 6. Design Style

- Palette: Black & white, Swiss-style minimalism.
- Typography: Inter or Helvetica Neue.
- Layout: Grid with generous padding.
- UX: Feels like a clean notebook, not a dashboard.

---

## 7. Scope Definition

**Coach is:**

- Holistic (nutrition + fitness in one flow).
- Adaptive (responds to lifestyle and energy changes).
- Directional (big-picture guidance).
- Minimal (chat-first, not cluttered).

**Coach is not:**

- A calorie counter with precision “X calories left” metrics.
- A rigid training program.
- A cluttered dashboard app (dashboards come later).

---

## 8. Technical Stack (Beta)

- **Frontend (Web MVP):** React for web.
- **Frontend (Mobile later):** React Native / Expo (iOS, Android).
- **AI Layer:** GPT-5-nano for meal/workout parsing and feedback; **vision model** for meal photos.
- **Backend:** Supabase (Postgres + Auth + Edge Functions). **No persistent photo storage** for meal images in beta.
  - **Auth:** Supabase Auth (email, Apple, Google sign-in).
  - **Database:** Supabase Postgres with RLS.
  - **Edge Functions:**
    - `/parseMealPhoto` accepts image bytes → calls vision → returns draft JSON; image discarded.
    - `/parseMeal` for text parsing.
    - `/confirmMeal` to persist user-confirmed JSON.
  - **(Optional later)** Storage: only if you decide to retain photos with explicit user consent.
- **Local State (MVP):** Browser localStorage; AsyncStorage on mobile.

### Privacy & Retention (beta)

- Meal photos (future): **processed transiently and discarded**. No retention by default.
- Only **user-confirmed JSON** is stored.
- Provide user controls for delete/export of their data. \*\* Browser localStorage; AsyncStorage on mobile. \*\* Browser localStorage; AsyncStorage on mobile.

### Data Model (initial)

- **users** (id, email, auth\_provider, created\_at)
- **days** (id, user\_id, date, targets\_json, created\_at)
- **meals** (id, day\_id, type ENUM[breakfast,lunch,dinner,snack], items\_json, macros\_json, source ENUM[est,api,vision], created\_at)
- **meal\_drafts** (ephemeral; id, user\_id, temp\_id, parsed\_json, created\_at, expires\_at) — used for photo/text parses awaiting user confirmation; auto-deleted
- **workouts** (id, day\_id, type, minutes, distance, raw\_text, created\_at)
- **summaries** (id, day\_id, daily\_totals\_json, coach\_notes, created\_at)
- **integrations** (future: provider, scopes, status) for Apple Health and other services
- **health\_samples** (future: type, value, unit, timestamp) for step counts, workouts, body metrics

### Chat Orchestration & Queries

- The chat layer can call read-only queries:
  - **get\_today\_plan(user\_id, date)** → returns planned workout.
  - **get\_day\_totals(user\_id, date)** → returns macro totals and deltas.
  - **get\_recent\_meals(user\_id, n)** → returns last N meals with items/macros/photos.
  - **get\_last\_workout(user\_id)** → returns last completed workout.
- These power responses like: "What’s my plan today?", "How did lunch impact protein?", "Summarize my week."

### API Surface (MVP)

- `POST /parseMeal` → { items[], macros{} } (text)
- `POST /parseMealPhoto` → { draft\_id, parsed\_json } (image uploaded to ephemeral endpoint)
- `POST /confirmMeal` → accepts `draft_id` + optional user corrections; writes to `meals`
- `POST /meal` → create or update meal (text path)
- `POST /workout` → create workout
- `GET /day?date=YYYY-MM-DD` → meals, workouts, totals, notes
- `POST /summary` → write daily coach recap

### Mobile & Health Integration (later)

- Native iOS app with **HealthKit** integration (via React Native bridge).
- Ask for permissions: steps, active energy, workouts, weight, etc.
- Sync data securely to backend tied to the user’s account.
- Android later: support via Google Fit / Health Connect.

---

## 9. Success Metrics

- Daily active users logging at least one meal or workout.
- Consistent week-over-week logging growth.
- High satisfaction with simplicity (qualitative feedback).

---

## 10. Roadmap

1. **MVP Web App**: 3 tabs, local storage, GPT-5-nano parsing stub.
2. **Beta Testing**: Add basic weekly summary dashboards.
3. **API Integration**: Replace naive food dictionary with food database API.
4. **Mobile Release**: React Native/Expo build.
5. **Personalization Layer**: Goals, nudges tuned to user history.
