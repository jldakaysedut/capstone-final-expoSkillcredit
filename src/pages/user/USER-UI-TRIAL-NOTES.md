# SkillCredit Expo — Premium User UI Trial (Nov 2026)

## Scope and baseline

- Source: user-uploaded `skillcredit-mobile-fixed (2)(1).zip`, folder `skillcredit-mobile-fixed/skillcredit-mobile/`.
- Target: Expo React Native **Regular User** screens only.
- This is a visual **pilot**, not a project-wide redesign.
- Modified existing screens: `src/pages/user/SetupInterests.jsx`, `src/pages/user/UserDashboard.jsx`, `src/pages/user/SkillDetails.jsx`.
- Added visual helper: `src/pages/user/PremiumVisual.jsx`.
- No other existing files modified. No Web, admin, moderator, support, Skiro AI, Supabase, payment, route, form validation, or DB code changed.

## UI/UX updates

### SetupInterests.jsx
- Added deep-emerald personalized onboarding hero and decorative shapes.
- Better type hierarchy, soft neutral page background, refined selection chips and selected states.
- New native press feedback on chips and Continue button; fade/slide section entrance.
- Soft pulse animation on the **existing** saving icon; progress/save/auth logic remains unchanged.

### UserDashboard.jsx
- Added a decorative welcome/discovery hero above the **existing** search and category controls.
- Existing search/sort/filter controls now sit in a floating surface with a soft shadow.
- More premium lane headers, skill card presentation, row surfaces, typography, and spacing.
- Animated card/chip press feedback; hero/search entrance fade/slide.
- All original handlers for search, save, view, navigation, realtime, fetching, and daily rewards preserved.

### SkillDetails.jsx
- New rounded image frame and elevated content cards.
- Improved title typography, section readability, and sticky booking action bar styling.
- Entrance fade/slide on cover and title; native press feedback on the existing CTA.
- No booking, credits, status, permission, date picker, or Supabase logic edits.

### PremiumVisual.jsx (new)
- Reusable `Reveal`, `PressScale`, and `SoftPulse` built only with React Native `Animated`.
- Animations use the native driver and check the OS Reduce Motion preference.
- No extra NPM packages or native modules required.

## Installation

1. Back up your Expo project or commit your current work.
2. Extract **`skillcredit-expo-premium-user-ui-trial.zip` into the Expo project root** (`skillcredit-mobile/`), not into `src/`.
3. Replace matching files under `src/pages/user/`, and allow the new helper/notes files.
4. Restart Expo: `npx expo start --clear`.
5. Check on your device. The JSX syntax passed parsing tests, but the animations and layout have **not** been verified on an Android/iOS device here.

## Suggested manual testing

- Setup Interests on a new account: choose/unchoose category, scroll, save once, bonus popup appears correctly.
- Dashboard: scrolling, search, category chips, saved filter, sorting, card taps, bookmarks, pull-to-refresh, daily bonus modal.
- Skill Details: image/no-image states, instructor tap, long descriptions, booking modal, disabled states, review expansion, sticky bar, small screens.
- Try with system **Reduce motion** enabled, and with a keyboard open on search.
- Watch for clipping, text contrast, jank, or unexpected navigation in Expo Go.

## Rollback

- Extract `skillcredit-expo-premium-user-ui-trial-rollback.zip` into the same project root to restore the 3 original screens.
- Optionally delete `src/pages/user/PremiumVisual.jsx` and this notes file after restoring, since the originals do not import them.
- Rollback never changes or replaces other Expo files.
