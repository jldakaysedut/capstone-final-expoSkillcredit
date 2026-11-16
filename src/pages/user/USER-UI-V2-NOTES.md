# SkillCredit Expo — Premium Regular User UI V2 (full trial)

**Date:** 2026-11-09  
**Project:** Expo React Native only, `src/pages/user/`  
**Baseline:** user-uploaded `skillcredit-mobile-fixed (2)(1).zip`; previous `skillcredit-expo-premium-user-ui-trial.zip` is retained unchanged.

## Scope

This visual experiment covers all **16 existing Regular User screens**. It is **not** a redesign of the Supabase/data layer, app routes, authentication, AI model, or transaction flow. The first three pilot screens are unchanged from the previous trial:

- `SetupInterests.jsx` — onboarding hero, selection chips, animated save feedback
- `UserDashboard.jsx` — discovery hero, elevated search/skill cards, press feedback
- `SkillDetails.jsx` — card treatment, booking CTA appearance, soft entrance

**13 additional Regular User screens updated in this continuation:**

| File | Presentation changes only |
| --- | --- |
| `Community.jsx` | Lifted post surfaces, soft composition bar, accent chip colors, entrance and composer feedback |
| `CreateSkill.jsx` | Improved form typography, category tiles, form borders, cover preview and animated next/select controls |
| `EditSkill.jsx` | More polished form sections, inputs, cover preview, save button and animated callout |
| `Leaderboard.jsx` | Soft-green podium treatment, refined metric typography, row hierarchy, animated podium/profile presses |
| `Messages.jsx` | More tactile conversation list header, search field, chat bubbles, booking cards, send button feedback |
| `MyListings.jsx` | Stronger summary typography, elevated listing rows, soft filters and subtle CTA feedback |
| `Notifications.jsx` | Refined unread summary, grouping headers, notification row spacing, mark-all feedback |
| `Payments.jsx` | Wallet balance emphasis, refined transaction rows, top-up button and sheet surfaces |
| `Profile.jsx` | Premium cover fallback, typography, avatar outline, profile tabs and action feedback |
| `PublicProfile.jsx` | Same profile visual language, clearer rating/skill display and cover styling |
| `Sessions.jsx` | Session card depth, role chips, group controls and action press feedback |
| `Settings.jsx` | Grouped settings panels, cleaner inputs, stronger section headings, action feedback |
| `SkiroAIChat.jsx` | Refined assistant header, bubbles, verified recommendation cards, composer and card taps; NO AI/search/clarification logic changes |

All 13 reference the **unchanged** shared `PremiumVisual.jsx` helper from the pilot. `Reveal` and `PressScale` use React Native's built-in `Animated` and honor OS Reduce Motion preference. No new packages.

## Protected functionality / scope restrictions

- Existing `supabase` calls, RPCs, Edge Functions, realtime subscriptions, notifications, AI quotas/cooldown, chat history, search, filtering, booking, wallet/top-up, profile saving, and navigation are unchanged.
- No Web project, `src/layouts`, admin, moderator, or support screens modified.
- No new permissions or changes to RLS/database tables.
- No new animation or UI dependencies installed.

## Verification performed

- Parsed all 16 updated JSX screens and `PremiumVisual.jsx` using Babel's JSX parser.
- Compared the **13 continuation screens** against the original uploaded source using parsed AST: when visual-only styles, `Reveal`/`PressScale` wrappers, and their import were removed from the comparison, original structure and business logic matched for all 13.
- Confirmed first three pilot screens and `PremiumVisual.jsx` match the prior trial byte-for-byte.
- ZIP archives contain only `src/pages/user/` changes and passed ZIP integrity checks.

**Not verified:** visual spacing/animations on an Android device, full Metro build, or live Supabase workflows. Test in Expo Go before using as a release build.

## ZIP choices

1. **Continuation patch:** `skillcredit-expo-premium-user-ui-v2-rest.zip` — the 13 newly changed screens + unchanged `PremiumVisual.jsx` helper + these notes. Apply over your **current premium pilot** project.
2. **All screens patch:** `skillcredit-expo-premium-user-ui-v2-all-screens.zip` — all 16 regular user screens + helper + notes, convenient if you are starting from the original uploaded ZIP.
3. **Original rollback:** `skillcredit-expo-premium-user-ui-v2-rollback.zip` — all 16 original regular user JSX files from the user-uploaded baseline + rollback notes. Original screens do not import `PremiumVisual.jsx`; optionally delete that helper and the V2 notes after restoring.

## How to install

1. Keep a backup or Git commit of your currently working Expo project, especially any modifications made **after** uploading the baseline.
2. Extract your chosen patch **into the Expo project root** so `src/pages/user/...` paths align; **not into `src/`**, to avoid a duplicate `src/src/` directory.
3. Allow overwrite only for the listed Regular User JSX files. Do not copy from the older source over any unrelated current changes.
4. Restart Metro with `npx expo start --clear`.
5. Open regular-user pages from Setup Interests to Settings, and test AI chat, payment/booking and navigation without changing the database.

## Suggested acceptance checklist

- Dashboard: search, categories, saved skills, navigation, streak popup
- Create/Edit Skill: all steps, price calculation, cover upload, save/submit
- Community: like/unlike, comments, feed filter, post creation and image attachment
- Messages / Skiro AI: keyboard placement, deep-link cards, typing state, chat selection, message history
- My Listings: expand, edit/delete, filter and realtime updates
- Sessions: book/reschedule/confirm/review and modal behavior
- Profile: editing, avatar/portfolio upload, empty states and list navigation
- Wallet: balance, package selection, checkout and recent transactions (test mode)
- Notifications / Settings / Leaderboard: tabs, read/unread, password, profile links and scroll
- Accessibility: Reduce Motion on/off, small screen, font scaling, dark text contrast

### Notes on rollback

If you dislike the design, restore your backed-up `src` folder. Alternatively apply the rollback ZIP, which restores **only the 16 user screen files** to the uploaded baseline and does not touch your Web or backend.
