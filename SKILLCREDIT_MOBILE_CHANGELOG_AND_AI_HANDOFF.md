# SkillCredit Mobile — Complete Change History & AI Handoff

**Prepared:** November 6, 2026  
**Audience:** A collaborator, their AI coding assistant, or anyone cloning the original SkillCredit Mobile repository.  
**Primary stack:** Expo / React Native, React Navigation, Supabase, EAS Build.  
**Core rule:** Preserve existing business logic, database writes, role permissions, navigation behavior, and PayMongo processing unless a specific change is requested.

> **READ FIRST — This is a history plus integration guide, not a claim that all patches are already committed to the original GitHub repository.** Several updates were delivered as separate ZIP patches. A clone of an older repository **does not automatically contain them**. Compare the clone against the final ZIP and the patches before applying anything. The most recently uploaded **full mobile snapshot** was `skillcredit-mobile-fixed(1).zip`; the **centered-dialog** and **optimistic-UI** patches were delivered *after* that snapshot and must be checked separately.

## 1. Original, intermediate, and final artifacts

| Artifact | Role | State / use |
|---|---|---|
| `skillcredit-mobile.zip` | Original Mobile project initially supplied | Historical reference for comparison. |
| `skillcredit-mobile-fixed.zip` | First integrated navigation/recovery/APK-ready fix | Adds routing and password recovery integration. |
| `skillcredit-mobile-realtime-notifications.zip` | Integrated realtime and notification update | Based on first fixed ZIP; 10 source files changed. |
| `skillcredit-performance-skeleton-patch.zip` | Selective performance UX update | Adds `ScreenSkeleton.jsx` and six modified screens. |
| `skillcredit-payments-skeleton-only.zip` | Selective payment loading UI update | Changes only `src/pages/user/Payments.jsx` loading UI; **not** the PayMongo logic. |
| `skillcredit-mobile-fixed(1).zip` | **User-provided final full Mobile ZIP**, uploaded Nov 6 | Treat this as the **authoritative full-project snapshot** when comparing newer patches. Includes the skeleton-related source updates. |
| `skillcredit-centered-dialogs-patch.zip` | Selective UI patch **after** the full snapshot | New shared dialog, root provider, and affected screen imports. |
| `skillcredit-optimistic-ui-patch.zip` | Latest selective interaction patch | Community hearts + Dashboard saved/bookmarks; **based on the centered-dialog patch**. |

**Important order:** original → first fixed → realtime → skeleton + payment skeleton → user-provided full snapshot → centered dialogs → optimistic UI. The full snapshot was supplied by the user; its exact history outside the compared source files cannot be inferred solely from these ZIPs.

**Never** replace a working current project with an older full ZIP. Prefer selective merge and inspection of Git diffs. Especially preserve local `.env`, `app.json`, `eas.json`, Git history, current assets, and any newer Web-derived adjustments.

## 2. Baseline project organization

```text
skillcredit-mobile/
├── assets/                         # App icons, logo, splash images
├── src/
│   ├── App.jsx                     # Root navigation, session, recovery links
│   ├── supabaseClient.js           # Supabase React Native client
│   ├── components/                 # Shared UI components
│   ├── layouts/                    # User, Admin, Moderator, Support navigation
│   └── pages/
│       ├── auth/
│       ├── public/
│       ├── user/
│       ├── moderator/
│       ├── support/
│       └── admin/
├── app.json                        # Expo name, logo, scheme, Android package, EAS ID
├── eas.json                        # EAS build profiles
├── package.json
└── .env                            # Local environment values; DO NOT COMMIT
```

Main role stacks include `User`, `Mod`, `Admin`, and `Support`; `Login`, `Register`, `ForgotPassword`, and `ResetPassword` are auth flows. Tabs such as `Dashboard`, `Community`, `Sessions`, `Messages`, and `Leaderboard` are **nested inside** the `User` navigator. They should not be treated as root routes.

## 3. First integrated fixes: `skillcredit-mobile.zip` → `skillcredit-mobile-fixed.zip`

### 3.1 Root navigation, cross-role routing, and recovery

**File:** `src/App.jsx`

- Stabilized screen registration around session/role changes to prevent errors such as **“The action 'NAVIGATE' ... was not handled by any navigator.”**
- Registered the missing `TicketChat` screen and shared User screens required by role-switching actions.
- Introduced a `SafeAreaProvider` around the navigation UI.
- Added handling for incoming password-recovery deep links: process the relevant URL/token or code, establish the recovery session, and route to `ResetPassword` in-app.
- Prevented the recovery flow from getting displaced by the normal session-based landing-route logic.
- Preserved the existing role and profile checks, including banned-account handling and interest setup.

**Other first-fix files:**

| File | Change |
|---|---|
| `src/pages/auth/Login.jsx` | Corrected role navigation: `Moderator` → `Mod`; `Dashboard` → `User` for the logged-in user route. |
| `src/pages/auth/ForgotPassword.jsx` | Replaced placeholder with native mobile email reset request UI; sends `supabase.auth.resetPasswordForEmail()` using the app redirect. Retained reset-request audit insert. |
| `src/pages/auth/ResetPassword.jsx` | Replaced placeholder with native password entry/confirmation and `supabase.auth.updateUser()`; recovery-session validation, sign-out/return-to-login flow, and missing confirmation input ref handled. |
| `src/pages/user/Notifications.jsx` | Corrected `Browse`/`Dashboard` nested-tab route mapping. |
| `src/pages/user/SkillDetails.jsx` | Corrected Dashboard-tab fallback navigation. |
| `src/layouts/UserLayout.jsx` | Corrected notification/deep-link route handling for nested tabs (`Sessions`, `Messages`, `Community`, `Dashboard`) and related actions. |

**Verified file comparison:** these are the **7 source JSX files** whose contents differed between the original ZIP and first fixed ZIP. Changes to configuration/build files are listed separately below.

### 3.2 Password reset from Gmail into the installed Android app

**Intended flow:** Forgot Password in SkillCredit → Supabase reset email → user taps link in Gmail → Android opens installed SkillCredit → native Reset Password screen → Supabase password update → return to Login.

Required configuration:

```text
App URL scheme: skillcredit
Password reset redirect: skillcredit://reset-password
Supabase redirect allow-list: skillcredit://reset-password
```

Supabase Dashboard: **Authentication → URL Configuration → Redirect URLs** must include the exact mobile redirect. The reset email template should use Supabase's generated confirmation URL (`{{ .ConfirmationURL }}`), not a hard-coded website reset address. Keep the original website redirect URL allowed too; the Web project has its own flow.

Expo Go cannot register the project's custom `skillcredit://` URL scheme as a standalone installed application. **Test full Gmail → app recovery using a development/standalone build**, not Expo Go alone. A registered scheme is necessary but does **not** guarantee every email client or recovery link will work: test the entire flow.

The app attempts an audit insert into `password_reset_requests` with `{ email, status: 'link_sent' }`; failures are logged, but should be independently checked against Supabase schema and RLS policies.

### 3.3 EAS / APK configuration and startup crash investigation

- Added explicit Android package ID `com.anonymous.skillcreditmobile` and custom scheme `skillcredit` to Expo config.
- Added `eas.json` with `preview` internal distribution / Android **APK**, plus production Android app bundle profile.
- EAS project was linked to the Expo account and an Android signing keystore was created during setup.
- Initial installed APK was closing immediately; the EAS **Preview** environment initially showed **no environment variables**.
- Adding the following to the **Preview** environment and rebuilding was followed by the user confirming the app worked:

```text
EXPO_PUBLIC_SUPABASE_URL
EXPO_PUBLIC_SUPABASE_ANON_KEY
```

**Causality note:** The missing Preview variables were a strong likely cause; no captured Android crash log definitively proved the exact exception. Never claim more than that. These are public client values; **never put the service-role or PayMongo secret key into an `EXPO_PUBLIC_` variable**. Supabase RLS must protect app data.

### 3.4 Display name and launcher icon

The later **user-provided full ZIP** `app.json` contains:

```json
{
  "expo": {
    "name": "SkillCredit",
    "slug": "skillcredit-mobile",
    "icon": "./assets/logo.png",
    "scheme": "skillcredit",
    "android": {
      "package": "com.anonymous.skillcreditmobile",
      "adaptiveIcon": {
        "backgroundColor": "#FFFFFF",
        "foregroundImage": "./assets/logo.png"
      }
    },
    "extra": {
      "eas": {
        "projectId": "5f14bb1b-96ca-42b6-bec5-d5e704893306"
      }
    }
  }
}
```

This is an **excerpt**, not a complete replacement `app.json`: preserve the other existing fields/plugins. The desired name is **SkillCredit** and logo is green with a white background. For the ideal Android adaptive icon, a properly padded **transparent foreground** generally avoids Android launchers cropping the artwork; a logo PNG with solid background may look different on different launchers. Changing native icon/name configuration requires a **new APK build**. Do not discard the existing EAS project ID, package name, or signing keystore.

## 4. Realtime and notification navigation patch

**Source:** `skillcredit-mobile-fixed.zip` → `skillcredit-mobile-realtime-notifications.zip`.

Exactly **10 source files differed**:

```text
src/pages/user/Notifications.jsx
src/pages/user/Sessions.jsx
src/pages/user/MyListings.jsx
src/pages/user/Profile.jsx
src/pages/moderator/SkillApprovals.jsx
src/pages/moderator/UserReports.jsx
src/pages/moderator/Disputes.jsx
src/pages/moderator/ModDashboard.jsx
src/pages/moderator/ModLogs.jsx
src/pages/moderator/RepeatOffenders.jsx
```

Changes:

- `Notifications.jsx`: refetch on screen focus; handle live DELETE events and partially populated UPDATE payloads; check failed mark-read writes; route record-specific notification URLs to corresponding screens where valid identifiers are supplied.
- Supports internal record URL forms such as `/sessions/:id`, `/messages/:id`, `/community/:id` and relevant query parameter aliases, as documented in the original patch.
- `Sessions.jsx`: refresh original session/report queries when returning to the screen.
- `MyListings.jsx`: subscribe to skill changes and reuse existing list loader.
- `Profile.jsx`: realtime reviews/portfolio/session changes plus focus refresh using existing fetch logic.
- Moderator screens listed above: add Supabase Postgres change subscriptions and unsubscribe on unmount; reuse original loaders and writes.
- Preexisting realtime features in Messages, Community, User Dashboard, Admin, Support, and Payments were kept in this patch; **not every app-wide realtime scenario was proven end-to-end**.

**Backend limitations:** Relevant tables must be included in Supabase Realtime publications with suitable RLS policies. Never disable RLS just to receive events. Notification producers must include the correct record IDs/link URLs: the mobile app cannot infer missing IDs. Older notifications may still open a general list rather than a specific item. Subscriptions are not a substitute for revalidation after reconnect, focus, or backgrounding.

## 5. Skeleton loading and initial performance UX

**Patch:** `skillcredit-performance-skeleton-patch.zip`  
**Base:** `skillcredit-mobile-realtime-notifications.zip`

**7 JSX files:**

```text
src/components/ScreenSkeleton.jsx          # NEW shared component
src/pages/public/SplashScreen.jsx          # Shorter fixed splash sequence
src/pages/user/Sessions.jsx                # Session skeleton
src/pages/user/Messages.jsx                # Conversation skeleton
src/pages/user/Community.jsx               # Feed/post skeleton
src/pages/user/Leaderboard.jsx             # Ranking skeleton
src/pages/user/Settings.jsx                # Settings skeleton
```

- Replaced initial blank/spinning loaders with lightweight skeleton placeholders on those pages.
- Shortened a fixed splash sequence from approximately **1.8 seconds to 0.5 seconds** as described in the performance patch.
- Existing skeletons already present on some other screens were not rewritten.
- These changes mainly improve **perceived responsiveness**; they do **not** prove network queries themselves became faster.
- No full Supabase query benchmark, app-wide cache-first architecture, or complete render-performance rewrite was implemented.

### 5.1 Payments skeleton — UI only

**Patch:** `skillcredit-payments-skeleton-only.zip`  
**Exactly one file:** `src/pages/user/Payments.jsx`

Replaced the payment screen's first-load spinner with skeleton shapes representing balance, credit statistics, filters, and transaction history. The patch was intended to leave **PayMongo checkout, credit calculations, database operations and payment verification logic unchanged**. The user's newer Web PayMongo implementation **has not yet been provided or merged**. When it is provided, compare logic carefully rather than blindly copying Web JSX into React Native.

### 5.2 User's final full Mobile snapshot

Comparing `skillcredit-mobile-realtime-notifications.zip` against the uploaded `skillcredit-mobile-fixed(1).zip` showed differences in these **8 source files**:

```text
src/components/ScreenSkeleton.jsx
src/pages/public/SplashScreen.jsx
src/pages/user/Community.jsx
src/pages/user/Leaderboard.jsx
src/pages/user/Messages.jsx
src/pages/user/Payments.jsx
src/pages/user/Sessions.jsx
src/pages/user/Settings.jsx
```

This is consistent with integrating the performance and payment skeleton changes into the final full snapshot. Do not assume that other local untracked adjustments are absent: always compare actual files before merging.

## 6. Centered SkillCredit dialogs patch

**Patch:** `skillcredit-centered-dialogs-patch.zip`  
**Based on:** uploaded final full snapshot `skillcredit-mobile-fixed(1).zip`.  
**Purpose:** Replace native dark `Alert.alert()` popups with a consistent **white, green-accented, rounded, center-aligned dialog**.

A static scan of that snapshot found **108 `Alert.alert()` calls across 23 source files**, and **41 `Modal` component occurrences**. These counts include a duplicate `ReportDetails copy.jsx` and are static occurrences, not necessarily 108 unique user interactions. Existing hand-designed React Native Modals should not all be replaced merely because they are called `Modal`.

**25 JSX files in this patch:**

```text
src/App.jsx                                  # Shared alert provider
src/components/SkillCreditAlert.jsx         # NEW reusable dialog
src/layouts/UserLayout.jsx
src/layouts/SupportLayout.jsx
src/pages/auth/Login.jsx
src/pages/user/Community.jsx
src/pages/user/CreateSkill.jsx
src/pages/user/EditSkill.jsx
src/pages/user/Messages.jsx
src/pages/user/MyListings.jsx
src/pages/user/Payments.jsx
src/pages/user/Profile.jsx
src/pages/user/Sessions.jsx
src/pages/user/Settings.jsx
src/pages/user/SetupInterests.jsx
src/pages/user/UserDashboard.jsx
src/pages/moderator/DisputeDetails.jsx
src/pages/moderator/ModLogs.jsx
src/pages/moderator/RepeatOffenders.jsx
src/pages/moderator/ReportDetails.jsx
src/pages/moderator/ReportDetails copy.jsx
src/pages/moderator/SkillReview.jsx
src/pages/support/SupportLogs.jsx
src/pages/support/TicketChat.jsx
src/pages/support/Tickets.jsx
```

Mechanism:

- Shared `SkillCreditAlert` accepts the familiar `Alert.alert(title, message, buttons, options)` calling pattern. Most source sites change their `Alert` import only.
- `src/App.jsx` mounts the provider above navigation so screens can display it.
- Titles, descriptions, buttons, and actions are **center aligned**; backdrop is dimmed, accent is green `#047857`, destructive actions are styled red.
- Existing Cancel/Confirm/Edit/Delete/Approve/Reject callbacks stay attached to their original actions; original Supabase and PayMongo operations are not rewritten.
- Supports default OK, supplied button arrays, `cancelable` behavior and `onDismiss`; native fallback if the provider is not initialized.
- Critical test cases: Community post/comment options, Sessions mark done, deletion, Support ticket resolution, Moderator approvals/disputes, Payments alerts, Android back/outside-tap behavior, and dialogs chained one after another.

**Caution:** A JS-rendered modal cannot be assumed 100% identical to Android native alerts in accessibility, z-order or dismiss timing. Device testing is required. The duplicate `ReportDetails copy.jsx` appears to be an inactive duplicate and should be cleaned up only after confirming it is unused.

## 7. Latest patch: Optimistic UI for Heart/Like and Bookmark

**Patch:** `skillcredit-optimistic-ui-patch.zip`  
**Base:** centered-dialogs patch (not the untouched original or earlier skeleton ZIP).  
**Only 2 affected files:**

```text
src/pages/user/Community.jsx
src/pages/user/UserDashboard.jsx
```

### Community Heart/Like

- Heart fill/color and local like count update **immediately** on tap, before the Supabase request resolves.
- Existing like/unlike insert/delete operations and like notification/activity behavior remain in place.
- If the request fails, restore the previous heart state/count and show an error dialog.
- An in-flight guard prevents duplicate rapid tap operations against the same pending action.
- Feed refresh should not erase a pending optimistic like state.

### Dashboard Bookmark

- Previous immediate save/unsave UI behavior remains.
- Added rollback on failed write and a guard against repeated taps while pending.
- Realtime/background refresh should not erase the pending bookmark feedback.

**Not changed by this patch:** Payment logic, database schema, shared alert provider, navigation, other screens. **Do not blindly replace these two files with versions from the older centered-dialog or skeleton patches; optimistic UI should be applied last.**

**Scope limitation:** This does **not** mean every button in the app now uses optimistic UI. Sensitive operations—payments, credit transfers, session completion or moderation decisions—must not be optimistically treated as final server success.

## 8. Critical merge rules for a friend's cloned repository / coding AI

1. **Determine the clone's actual baseline**: inspect its `src` files, `app.json`, `eas.json`, and Git status. Do not assume it is the original or latest snapshot.
2. **Back up or commit** the current branch before making changes; use a feature branch when possible.
3. Treat `skillcredit-mobile-fixed(1).zip` as the last provided **full-project** snapshot; centered dialogs and optimistic UI were delivered separately afterwards.
4. **Apply only missing changes**, not every ZIP wholesale. The files most likely to conflict are `src/App.jsx`, `Community.jsx`, `Sessions.jsx`, `Messages.jsx`, `Payments.jsx`, and `UserDashboard.jsx` because multiple patches touch them.
5. Ensure `src/components/ScreenSkeleton.jsx` exists before using screens that import it.
6. Ensure `src/components/SkillCreditAlert.jsx` and its root provider are present if using the centered-dialog imports. A screen that imports the shared Alert without the provider may fall back to native alerts.
7. For `Community.jsx` and `UserDashboard.jsx`, prefer the **latest optimistic patch** if and only if the project already includes the centered-dialog baseline; otherwise merge the optimistic logic into the existing versions.
8. Preserve **current** EAS `projectId`, `android.package`, `scheme`, version configuration, app name, assets, signing setup, and `.env`; do not replace with defaults from older ZIPs.
9. Keep `src/pages/user/Payments.jsx` payment/business logic intact. The payment skeleton and centered-dialog import are UI-layer adjustments only. Await the newer Web payment implementation for a separate reviewed merge.
10. **Never push secrets.** `.env` files may be present in privately supplied ZIP snapshots: exclude them from Git commits and shared public bundles; remove `node_modules/`, `.expo/`, caches and build outputs from commits.
11. Preserve role-based routing (`User`, `Mod`, `Admin`, `Support`) and nested User tab names (`Dashboard`, `Community`, `Sessions`, `Messages`, `Leaderboard`); don't reintroduce `Moderator` or root-level `Browse` navigation mistakes.
12. Keep existing Supabase RLS/access checks, booking/payment invariants, auth handling and audit writes. A UI patch must not silently change business behavior.
13. When a Web project arrives, do a **feature-by-feature parity audit** and convert browser-specific APIs into Expo/React Native equivalents. Do not paste Web HTML/JSX, `window.location`, browser storage or Web PayMongo checkout code directly into native pages.

### Merge priority at file level

| Target | Preferred source / handling |
|---|---|
| `src/App.jsx` | Final full snapshot + **dialog provider change** from centered patch; retain working deep link/EAS/navigation. |
| `src/pages/user/Community.jsx` | Latest **optimistic** patch (which incorporates centered alerts) if compatible; compare against any local newer edits. |
| `src/pages/user/UserDashboard.jsx` | Latest **optimistic** patch if compatible; preserve other dashboard code. |
| `src/pages/user/Payments.jsx` | Preserve working PayMongo logic; integrate **payment skeleton** and **centered alert import** only; don't overwrite a newer payment implementation. |
| `src/pages/user/Sessions.jsx`, `Messages.jsx`, `Settings.jsx` | Ensure skeleton update and centered-dialog imports both remain. |
| `src/pages/user/Notifications.jsx` | Preserve realtime fixes and record-specific navigation. |
| `src/components/ScreenSkeleton.jsx` | Keep new shared skeleton component. |
| `src/components/SkillCreditAlert.jsx` | Keep new shared dialog component and provider wiring. |
| `app.json`, `eas.json`, `assets/` | Preserve current EAS-linked project values and official branding; change only deliberately. |

## 9. Validation checklist (for AI assistant and human tester)

**Repository and code:**

- [ ] Current source and patch versions compared; no accidental rollback of newer features.
- [ ] No missing/incorrect React Native imports or duplicate conflicting exports.
- [ ] Shared dialogs provider wraps screens as intended.
- [ ] Babel/Expo JSX syntax and relative imports resolve.
- [ ] No accidental edits to PayMongo calculation, checkout, credit verification, or notification creation.
- [ ] No secrets committed or copied into public materials.

**Auth / navigation / role behavior:**

- [ ] Login for User, Moderator, Admin, Support lands in correct navigator.
- [ ] Tab navigation and shared role switches work without unhandled NAVIGATE warnings.
- [ ] Gmail password-reset link opens installed APK and reaches Reset Password screen.
- [ ] Invalid/expired recovery links and sign-out return to correct destinations.

**Realtime:**

- [ ] Notifications appear without manual refresh while app is open; read state persists.
- [ ] Record-specific notifications navigate to intended record when link/ID is present.
- [ ] Messages, sessions, listings, profile and moderator changes refresh appropriately.
- [ ] Subscriptions unsubscribe on screen unmount and don't multiply on repeat navigation.
- [ ] Foreground/resume or focus refresh handles missed events.

**Skeleton and interaction:**

- [ ] Initial Sessions, Messages, Community, Leaderboard, Settings and Payments skeletons render without flicker or crashes.
- [ ] Dashboard/other existing skeletons still work.
- [ ] Every critical centered alert action maps to correct callback.
- [ ] Heart taps show immediate state/count, rapid taps don't duplicate writes, failed requests roll back.
- [ ] Bookmark taps show immediate state, failed requests roll back.

**Release:**

- [ ] EAS Preview environment has `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` (names only in public logs).
- [ ] EAS scheme, package, project ID and keystore are maintained.
- [ ] App branding uses **SkillCredit** and intended logo; adaptive icon is checked on actual launcher.
- [ ] Rebuilt APK installed and key flows tested on a real device.

### Local test / build commands

```powershell
npm install
npx expo start -c
# Verify public environment variable names are configured in EAS Preview:
npx eas-cli@latest env:list --environment preview
# After testing:
npx eas-cli@latest build --platform android --profile preview --clear-cache
```

For installed APK updates, keep the same package ID and signing identity and manage Android `versionCode` appropriately. Changes to native settings/icons/scheme require rebuilding; edits to JavaScript in a regular installed APK likewise require a new build unless a compatible OTA/EAS Update workflow is explicitly configured.

## 10. Known limitations / unimplemented plans

- **App-wide persistent caching** using TanStack Query / SQLite / AsyncStorage was **discussed and explicitly deferred**. Do not claim it is implemented.
- A complete database query optimization / measured end-to-end performance improvement was **not implemented**; current skeleton improvements primarily improve perceived responsiveness.
- Not all buttons use optimistic UI; the latest patch targets **Community Heart/Like** and **Dashboard Bookmark** only.
- The newest **Web PayMongo / Payments implementation has not yet been supplied**; Web → Mobile payment parity is pending.
- Some notifications can only open category screens if historical notification rows do not contain the target record's ID.
- Supabase Realtime coverage depends on DB publication configuration, RLS, connected state, and each screen's listeners.
- Static syntax checks were reported for earlier patches, but that is **not** equivalent to verified performance, E2E testing, or proof that all combined patches work on an APK. Test the assembled project after merging.

## 11. Instructions to another AI coding assistant

> You are continuing the **SkillCredit Mobile** Expo/React Native project. First inspect the checked-out files and current Git history. Read this handoff, then compare current files with the user's latest ZIP and any relevant patch ZIPs. Preserve working Supabase business rules, roles, navigation, recovery handling, PayMongo logic, and environment/build configuration. Do not blindly apply older ZIPs. The last supplied full project snapshot is `skillcredit-mobile-fixed(1).zip`. The centered-dialog patch was created afterward, and the two-file optimistic Heart/Bookmark patch afterward still. Apply missing changes in dependency order and merge overlapping files. Keep green `#047857` branding, centered dialogs, skeleton loading, realtime refresh and optimistic feedback. Test syntax/imports, navigation, important callbacks, and Android bundling before declaring success. Identify assumptions and unverified functionality explicitly. When the SkillCredit Web project is provided later, compare features and carefully adapt relevant new functionality to native Expo rather than replacing working mobile logic.

---

**Document integrity:** This handoff is based on ZIP/file comparisons and the included patch notes available in the conversation as of **November 6, 2026**. It documents intended and observed code changes, not a blanket claim of successful runtime testing of the final combined patch set.
