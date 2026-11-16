# SkillCredit Expo — Official 16 Category Synchronization

## Source and scope
- Source ZIP: `src (3).zip` supplied by the user.
- Scope: **Expo / React Native only**. This patch updates local category labels/icons; it does **not** modify Supabase records or policies.
- Reference: `src/pages/user/CreateSkill.jsx` (the official 16 category strings). Both `EditSkill.jsx` and `SkiroAIChat.jsx` already match and are left unchanged.

## Changed files (3)
1. `src/pages/user/UserDashboard.jsx` — replace outdated 17-item category list with the 16 official category names; remove obsolete Gaming & Hobbies entry and its unused icon import. Existing `CatIcon` lookup, category filter, category lanes, recommendation logic, sorting, realtime, navigation, and save behavior remain unchanged.
2. `src/pages/user/SetupInterests.jsx` — replace outdated 17 selection labels with the 16 official names; remove Gaming & Hobbies. Existing onboarding, notification, bonus credit, and database update flows remain unchanged.
3. `src/pages/user/MyListings.jsx` — replace outdated/legacy category icon labels (19 entries) with the official 16; remove unused Gaming & Hobbies and outdated duplicate aliases; use PiggyBank for Finance to match CreateSkill. Existing list navigation, session/review calculations, edit/delete behavior, and data queries remain unchanged.

## Exclusions / intentionally unchanged
- `src/pages/user/CreateSkill.jsx` and `EditSkill.jsx`: official categories and pricing bands already correct. `EditSkill`'s legacy lookup is left in place for backwards-safe price calculations; it does not overwrite database categories.
- `src/pages/user/SkiroAIChat.jsx`: already searches the official 16 categories. No AI logic altered.
- `Messages.jsx`, `Profile.jsx`, `PublicProfile.jsx`, `SkillDetails.jsx` only display category values supplied by Supabase; no category registry to change.
- `Community.jsx` macro-category topics and `Notifications.jsx` notification-type categories are **not** the skill category list; intentionally unchanged.
- No changes to Supabase/RLS/RPC/Edge Functions, authentication, payments, sessions, notifications, moderation, themes, animations, skeletons, or navigation.

## Data note
- User reported manually correcting two ambiguous database values and executing the shared Supabase category migration on Web. This Expo patch **does not** run SQL, rename stored data, or adjust existing credit amounts.
- Since existing saved interests and skills now use the official names, the Expo category filter, category lanes, and recommendations should begin matching the stored data after the patched app is loaded.
- Unknown future categories still use the original icon fallback; the 16 supported categories all have real icons.

## Installation
- **Changes-only ZIP:** Copy `src/pages/user/{UserDashboard,SetupInterests,MyListings}.jsx` to the same paths in the Expo project, overwriting only those three files. Put this note anywhere convenient (it is not required by runtime).
- **Full updated src ZIP:** Replace your Expo project's `src/` tree only if it matches the uploaded `src (3).zip` baseline.
- Test with Expo Go / Metro (`npx expo start -c`) for development. For your installed APK build, rebuild as needed to deliver bundled changes to users.

## Suggested QA
1. Open Expo Dashboard: use category chips, confirm official 16 names, no stale `Gaming & Hobbies`, check new category icons (not Pin fallback).
2. Confirm category-specific lanes and results, e.g. Graphic Design & Digital Art, Beauty & Personal Care, Coding & Programming.
3. Verify **Recommended for you** reflects interests saved in the shared Supabase.
4. Check My Listings category icon for all listed categories and edit/view navigation.
5. New account: Setup Interests shows official 16 and saves exact names; test onboarding and starting bonus to ensure no regression.
6. Verify dark mode, bookmarks, skeletons, realtime, Skiro AI, booking and payment smoke test.

## Revert
Restore the three original source files from the rollback ZIP. No database rollback is needed for this **Expo-only** code change.

## Validation
- All three patched category sets exactly equal the official 16 names from the submitted Expo CreateSkill source.
- No non-category UI, business logic, or Supabase query was modified.
- This is static code validation, not an on-device APK/Expo runtime test.
