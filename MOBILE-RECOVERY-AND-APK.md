# SkillCredit mobile: password recovery and APK build

## Password recovery flow

The mobile Forgot Password screen sends the Supabase recovery email with this redirect:

`skillcredit://reset-password`

The app scheme is declared in `app.json`. `src/App.jsx` listens for the incoming Android/iOS URL, reads the Supabase recovery tokens (or PKCE code), establishes the recovery session, and opens the native `ResetPassword` screen. The password is updated with `supabase.auth.updateUser({ password })`.

### Required Supabase Dashboard setup

1. Open **Authentication → URL Configuration**.
2. Add this exact value under **Redirect URLs**:
   `skillcredit://reset-password`
3. In **Authentication → Email Templates → Reset Password**, make sure the email action uses Supabase's confirmation URL (`{{ .ConfirmationURL }}`) rather than a hard-coded web reset page URL. Supabase uses the `redirectTo` value sent by the app after the confirmation step.
4. Keep the project's existing web redirect URL allow-listed too, so the website's own Forgot Password flow continues to work.

If the redirect URL is not allow-listed, Supabase may fall back to the configured Site URL and the link may open the web site instead of the app.

## Build an installable Android APK with EAS

The `preview` EAS profile in `eas.json` is configured to output an APK:

```bash
npx eas-cli@latest build --platform android --profile preview
```

The generated `app.json` currently uses `com.anonymous.skillcreditmobile` as the Android application ID so an APK build has an explicit package name. Before publishing to Google Play, replace it with a unique reverse-domain ID that you control. EAS may also ask you to create/link an EAS project and configure Android signing credentials.

After changing `scheme` or native app configuration, build a new APK and install that APK on the phone. A normal JavaScript refresh or an old APK will not register the new `skillcredit://` scheme.

## Important notes

- The web project was not edited by this mobile patch.
- The existing `.env` values are retained for this project's local setup; do not publish or commit that file. `.gitignore` now ignores `.env`.
- The password reset request audit insert is still attempted against `password_reset_requests` with `{ email, status: 'link_sent' }`. If that table or its insert policy is missing in Supabase, the email flow can still succeed, but the audit insert will log an error in the app console.
- Test the full flow on a built APK with the app installed: request reset → open Gmail on that same phone → tap the reset link → confirm SkillCredit opens → set the new password → sign in with the new password.
