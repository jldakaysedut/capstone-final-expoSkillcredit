import { useState } from 'react';
import {
  ActivityIndicator, Keyboard, KeyboardAvoidingView, Platform, Pressable,
  ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, CheckCircle2, Mail } from 'lucide-react-native';
import supabase from '../../supabaseClient';

const T = {
  text: '#0f1419', sub: '#536471', field: '#eff3f4', brand: '#047857', danger: '#e11d48',
};

// Must match the scheme configured in app.json and the Supabase Redirect URL allow-list.
const PASSWORD_RESET_REDIRECT = 'skillcredit://reset-password';

export default function ForgotPassword() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [sent, setSent] = useState(false);

  const handleSubmit = async () => {
    const cleanEmail = email.trim();
    setErrorMsg('');
    if (!cleanEmail) return setErrorMsg('Please enter your email address.');
    if (!/^\S+@\S+\.\S+$/.test(cleanEmail)) return setErrorMsg('Please enter a valid email address.');

    Keyboard.dismiss();
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo: PASSWORD_RESET_REDIRECT,
      });
      if (error) throw error;

      // Keep the existing reset-request audit record used by the web flow.
      const { error: auditError } = await supabase
        .from('password_reset_requests')
        .insert([{ email: cleanEmail, status: 'link_sent' }]);
      if (auditError) console.error('Password reset request log error:', auditError.message);

      setSent(true);
    } catch (error) {
      setErrorMsg(error?.message || 'Unable to send the password reset email. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Pressable onPress={() => navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Login')} hitSlop={10} style={[s.back, { top: insets.top + 8 }]}>
        <ArrowLeft size={22} color={T.text} />
      </Pressable>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[s.content, { paddingTop: insets.top + 64, paddingBottom: insets.bottom + 28 }]}>
        <View style={s.iconCircle}><Mail size={25} color={T.brand} /></View>
        <Text style={s.title}>{sent ? 'Check your email' : 'Forgot password?'}</Text>
        <Text style={s.subtitle}>
          {sent
            ? `We sent a password reset link to ${email.trim()}. Open that email on your phone and tap the link to return to the SkillCredit app.`
            : 'Enter the Gmail address connected to your SkillCredit account. We will send you a secure link to reset your password.'}
        </Text>

        {sent ? (
          <View style={s.successBox}>
            <CheckCircle2 size={20} color={T.brand} />
            <Text style={s.successText}>The reset link will open the SkillCredit app when it is installed on this device.</Text>
          </View>
        ) : (
          <>
            {!!errorMsg && <View style={s.errorBox}><Text style={s.errorText}>{errorMsg}</Text></View>}
            <Text style={s.label}>Email address</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="you@gmail.com"
              placeholderTextColor="#8b98a5"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              textContentType="emailAddress"
              returnKeyType="send"
              onSubmitEditing={handleSubmit}
              style={s.input}
            />
            <Pressable onPress={handleSubmit} disabled={loading || !email.trim()} style={({ pressed }) => [s.button, (loading || !email.trim()) && s.disabled, pressed && !loading && s.pressed]}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.buttonText}>Send reset link</Text>}
            </Pressable>
          </>
        )}

        <Pressable onPress={() => navigation.navigate('Login')} style={s.footer}>
          <Text style={s.link}>Back to log in</Text>
        </Pressable>
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
  input: { height: 50, borderRadius: 12, backgroundColor: T.field, paddingHorizontal: 14, fontSize: 16, color: T.text, borderWidth: 1.5, borderColor: 'transparent' },
  button: { height: 49, borderRadius: 25, backgroundColor: T.brand, alignItems: 'center', justifyContent: 'center', marginTop: 18 },
  buttonText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  disabled: { opacity: 0.5 },
  pressed: { backgroundColor: '#065f46' },
  errorBox: { backgroundColor: '#fff1f2', borderRadius: 12, padding: 12, marginBottom: 16 },
  errorText: { fontSize: 14, lineHeight: 20, color: T.danger },
  successBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: '#ecfdf5', borderRadius: 12, padding: 14 },
  successText: { flex: 1, fontSize: 14, lineHeight: 20, color: '#065f46' },
  footer: { alignItems: 'center', marginTop: 28, paddingVertical: 10 },
  link: { fontSize: 14, fontWeight: '700', color: T.brand },
});
