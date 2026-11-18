import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, DeviceEventEmitter, Keyboard, KeyboardAvoidingView, Platform,
  Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Eye, EyeOff, LockKeyhole } from 'lucide-react-native';
import supabase from '../../supabaseClient';
import PasswordStrengthMeter, { MIN_PASSWORD_LENGTH } from '../../components/PasswordStrengthMeter';

const T = {
  text: '#0f1419', sub: '#536471', field: '#eff3f4', brand: '#047857', danger: '#e11d48',
};

export default function ResetPassword() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const confirmPasswordRef = useRef(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [hasRecoverySession, setHasRecoverySession] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let active = true;
    const verifySession = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        if (active) setHasRecoverySession(!!data.session);
      } catch (error) {
        if (active) setErrorMsg(error?.message || 'This password reset link could not be verified.');
      } finally {
        if (active) setCheckingSession(false);
      }
    };
    verifySession();
    return () => { active = false; };
  }, []);

  const backToLogin = async () => {
    try {
      const { data } = await supabase.auth.getSession();
      if (data.session) await supabase.auth.signOut();
    } catch (error) {
      console.warn('Could not close the recovery session:', error?.message || error);
    }
    DeviceEventEmitter.emit('password_recovery_complete');
    navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
  };

  const handleSubmit = async () => {
    setErrorMsg('');
    if (!password || !confirmPassword) return setErrorMsg('Please fill in both password fields.');
    if (password.length < MIN_PASSWORD_LENGTH) return setErrorMsg(`Your password must be at least ${MIN_PASSWORD_LENGTH} characters long.`);
    if (password !== confirmPassword) return setErrorMsg('Passwords do not match.');
    if (!hasRecoverySession) return setErrorMsg('Your reset link has expired. Please request a new one.');

    Keyboard.dismiss();
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setSuccess(true);
      setPassword('');
      setConfirmPassword('');
      // End the one-time recovery session before returning to the login screen.
      try {
        await supabase.auth.signOut();
      } catch (signOutError) {
        console.warn('Password was updated, but recovery-session sign-out failed:', signOutError?.message || signOutError);
      }
      DeviceEventEmitter.emit('password_recovery_complete');
      setTimeout(() => {
        navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
      }, 1800);
    } catch (error) {
      setErrorMsg(error?.message || 'Unable to update your password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Pressable onPress={backToLogin} hitSlop={10} style={[s.back, { top: insets.top + 8 }]}>
        <ArrowLeft size={22} color={T.text} />
      </Pressable>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[s.content, { paddingTop: insets.top + 64, paddingBottom: insets.bottom + 28 }]}>
        <View style={s.iconCircle}><LockKeyhole size={25} color={T.brand} /></View>
        <Text style={s.title}>{success ? 'Password updated' : 'Create a new password'}</Text>
        <Text style={s.subtitle}>
          {success
            ? 'Your SkillCredit password has been changed successfully. You can now log in using your new password.'
            : 'Choose a new password for your SkillCredit account.'}
        </Text>

        {checkingSession ? (
          <ActivityIndicator color={T.brand} style={{ marginVertical: 24 }} />
        ) : success ? (
          <View style={s.successBox}><Text style={s.successText}>Taking you back to log in…</Text></View>
        ) : !hasRecoverySession ? (
          <>
            <View style={s.errorBox}><Text style={s.errorText}>{errorMsg || 'This reset link is invalid or has expired. Please request a new password reset email.'}</Text></View>
            <Pressable onPress={() => navigation.reset({ index: 0, routes: [{ name: 'ForgotPassword' }] })} style={s.button}>
              <Text style={s.buttonText}>Request a new link</Text>
            </Pressable>
          </>
        ) : (
          <>
            {!!errorMsg && <View style={s.errorBox}><Text style={s.errorText}>{errorMsg}</Text></View>}
            <Text style={s.label}>New password</Text>
            <View style={s.inputWrap}>
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="At least 8 characters"
                placeholderTextColor="#8b98a5"
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="new-password"
                textContentType="newPassword"
                returnKeyType="next"
                onSubmitEditing={() => confirmPasswordRef.current?.focus()}
                style={s.inputFlex}
              />
              <Pressable onPress={() => setShowPassword((value) => !value)} hitSlop={10}>
                {showPassword ? <EyeOff size={20} color={T.sub} /> : <Eye size={20} color={T.sub} />}
              </Pressable>
            </View>
            <PasswordStrengthMeter password={password} />

            <Text style={[s.label, { marginTop: 18 }]}>Confirm new password</Text>
            <View style={s.inputWrap}>
              <TextInput
                ref={confirmPasswordRef}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="Re-enter your new password"
                placeholderTextColor="#8b98a5"
                secureTextEntry={!showConfirm}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="new-password"
                textContentType="newPassword"
                returnKeyType="done"
                onSubmitEditing={handleSubmit}
                style={s.inputFlex}
              />
              <Pressable onPress={() => setShowConfirm((value) => !value)} hitSlop={10}>
                {showConfirm ? <EyeOff size={20} color={T.sub} /> : <Eye size={20} color={T.sub} />}
              </Pressable>
            </View>

            <Pressable onPress={handleSubmit} disabled={loading || password.length < MIN_PASSWORD_LENGTH || !confirmPassword} style={({ pressed }) => [s.button, (loading || password.length < MIN_PASSWORD_LENGTH || !confirmPassword) && s.disabled, pressed && !loading && s.pressed]}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.buttonText}>Update password</Text>}
            </Pressable>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },
  content: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 22 },
  back: { position: 'absolute', left: 16, zIndex: 10, width: 40, height: 40, alignItems: 'flex-start', justifyContent: 'center' },
  iconCircle: { width: 54, height: 54, borderRadius: 18, backgroundColor: '#ecfdf5', alignItems: 'center', justifyContent: 'center', marginBottom: 22 },
  title: { fontSize: 27, lineHeight: 34, fontWeight: '800', letterSpacing: -0.6, color: T.text },
  subtitle: { fontSize: 15, lineHeight: 22, color: T.sub, marginTop: 8, marginBottom: 28 },
  label: { fontSize: 13, fontWeight: '600', color: T.sub, marginBottom: 8 },
  inputWrap: { height: 50, borderRadius: 12, backgroundColor: T.field, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  inputFlex: { flex: 1, height: 50, color: T.text, fontSize: 16 },
  button: { height: 49, borderRadius: 25, backgroundColor: T.brand, alignItems: 'center', justifyContent: 'center', marginTop: 22 },
  buttonText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  disabled: { opacity: 0.5 },
  pressed: { backgroundColor: '#065f46' },
  errorBox: { backgroundColor: '#fff1f2', borderRadius: 12, padding: 12, marginBottom: 16 },
  errorText: { fontSize: 14, lineHeight: 20, color: T.danger },
  successBox: { backgroundColor: '#ecfdf5', borderRadius: 12, padding: 14 },
  successText: { fontSize: 14, lineHeight: 20, color: '#065f46' },
});
