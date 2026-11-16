# SkillCredit Expo — Functional Sync (Web 7 → Expo 4)

## Source baselines
- Expo: `skillcredit-mobile-fixed(4).zip` (complete Expo/React Native app code and native assets).
- Web: `capstoneskillcredit (7).zip` (functional reference, **not** copied as Web JSX).
- Existing Supabase project is shared between Web and Expo. All SQL objects, table definitions, RLS policies, and Edge Functions remain **unchanged**.

## What changed (11 application files)

| File | Change |
|---|---|
| `src/App.jsx` | Registers new native `SkiroAI` screen; other existing navigation routes retained. |
| `src/pages/user/Messages.jsx` | Adds Skiro AI entry in chat list; Quick Mark Done now uses `confirm_session_completion` RPC instead of directly updating instructor credits and session flags. |
| `src/pages/user/Sessions.jsx` | Mark Done now uses the same existing RPC and only emits completion notifications after confirmed server outcome; adds standard cancel/decline notifications. Refund logic is **not** modified. |
| `src/pages/auth/Register.jsx` | Normalizes email, handles Supabase Auth duplicate / obfuscated-user responses, refuses to insert a 20 CR profile when there is no authenticated session. One-time 20 CR amount unchanged. |
| `src/pages/user/UserDashboard.jsx` | Displays daily-streak claim UI after the existing welcome-bonus popup; no client-side credit arithmetic. |
| `src/components/DailyRewardModal.jsx` | **New:** native daily reward UI using existing `daily_reward_claims` and `claim_daily_reward()` RPC; respects signup-day lock and Asia/Manila dates; creates best-effort reward notice after successful award. |
| `src/pages/user/SkiroAIChat.jsx` | **New:** native Skiro AI with 6 existing modes, saved cross-platform `ai_chat_messages` history, Edge Function `skillcredit-ai-chat`, quota display, cooldown, safe result links, and reviewable skill drafts. No AI-controlled wallet or booking writes. |
| `src/pages/user/CreateSkill.jsx` | Optional validated prefill from Skiro AI draft. User reviews, edits, and manually publishes through unchanged CreateSkill submission. |
| `src/pages/user/Payments.jsx` | Read-only daily reward entries and earnings totals in wallet history, using existing reward-claims table. PayMongo checkout flow unchanged. |
| `src/pages/user/Notifications.jsx` | Displays `daily_reward` in System notifications and session reminder type in Booking; reward acknowledgment uses reward-specific wording. |
| `src/layouts/UserLayout.jsx` | Existing notification bell recognizes `daily_reward`/`session_reminder_1h`. Checks for due sessions only while app is open/active and inserts a deduplicated notification into the existing table. No push service or native permission change. |

## Confirmed unchanged
- No table, column, SQL migration, RLS, RPC, or Edge Function edits; no new backend services.
- No changes to moderator/admin/support dispute logic or to PayMongo backend code.
- No new packages and no dependency/version changes.
- Existing Expo visual design and routes retained except intentional Skiro AI entry and optional AI draft prefill.
- Existing 20 CR welcome popup and Setup Interests welcome notification unchanged.

## Validation
- All JavaScript/JSX files successfully parsed with TypeScript's JSX compiler front-end.
- Android Metro resolved and bundled 3,029 modules, generating the Android Hermes bundle and assets using the existing Expo dependencies. `expo export --platform android` reported `Exported` on the generated source.
- Confirmed both mobile Mark Done locations invoke the existing RPC and no longer directly award instructor balance.
- Release ZIP includes the full source project and app assets/config, but excludes `node_modules`, `.git`, and generated `.expo` cache. Use `npm ci` in the project root before running.

## Live testing required before real payment/production use
1. **Session completion:** Two users confirm from separate devices, once from Web and once from Expo; verify exactly one award and `credits_awarded_at`, with retries/simultaneous taps.
2. **Daily reward:** Registration day must not claim; next Manila day can claim once; day-7 roll over; double-device race; visible balance and wallet entry.
3. **Skiro AI:** Existing deployed function must accept authenticated Expo user; test history, 20/hr, 5-second cooldown, mixed Web/Expo chats, result cards, and AI drafts.
4. **Registration:** Duplicate account, confirmed-email settings, login flow, and no duplicate 20 CR profile. Existing Supabase Auth behavior may vary with email confirmation configuration.
5. **Notifications:** Session cancel/decline and 1-hour reminders, tap navigation, already-existing Web notifications, two-device duplication prevention.
6. **Payments and disputes:** Retest PayMongo webhook/checkout and all credit refunds/dispute resolutions. Existing **client-side cancellation refund** is unchanged and should have a separate backend integrity audit before production. `process_escrow_refund` and moderator payouts were not modified by this patch.

## Important behavior notes
- Daily reward grants credits **only through** the existing `claim_daily_reward()` RPC. The app may write a normal notification row after the RPC succeeds; a notification failure does not refund or retry credits.
- Android/iOS 1-hour reminders are **in-app while running/foregrounded**, **not** OS push notifications with guaranteed delivery when closed. They reuse the existing `notifications` table and also dedupe against Web-generated reminders; truly simultaneous independent app/browser checks could still duplicate a notice without server uniqueness rules.
- `SkiroAIChat` reads/writes existing chat messages and calls the deployed AI Edge Function. Rate limits are enforced by the server; the UI also shows the status and a 5-second delay.
- Current email uniqueness handling matches Web, but deleting an account and permanently forbidding its email would require authoritative Auth/backend rules not added here.
- The original `.env` contains only the existing Expo public client URL/anon credential and is copied unchanged for local compatibility. Never add service-role keys or private Groq/PayMongo secrets to the mobile app.

## How to run
1. Extract ZIP to its own folder, opening the `skillcredit-mobile` directory.
2. `npm ci`
3. `npx expo start --clear` (or your existing EAS build flow).
4. Verify on your actual Android device **before** replacing the production APK.

## Rollback
Keep your original `skillcredit-mobile-fixed(4).zip` untouched. These changes are in a separate ZIP, and no external Supabase project state was modified during preparation.
