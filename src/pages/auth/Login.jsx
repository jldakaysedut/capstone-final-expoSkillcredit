import { useState, useRef } from 'react';
import {
  View, Text, Pressable, ScrollView, TextInput, Alert, ActivityIndicator, Keyboard,
  KeyboardAvoidingView, Platform, StyleSheet,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Eye, EyeOff } from 'lucide-react-native';
import supabase from '../../supabaseClient';

// Compact X-style layout: open white screen, filled inputs, one primary pill button
const T = {
  text: '#0f1419', sub: '#536471', line: '#eff3f4', border: '#cfd9de', field: '#eff3f4',
  brand: '#047857', danger: '#e11d48',
};

// replace the current stack so the back button never returns to a login screen
const goTo = (navigation, name) => navigation.reset({ index: 0, routes: [{ name }] });

export default function Login() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const passwordRef = useRef(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [focus, setFocus] = useState('');

  const handleLogin = async () => {
    setErrorMsg('');
    // same as the web form: both fields required, email must look like an email
    if (!email.trim() || !password) return setErrorMsg('Please enter your email and password.');
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setErrorMsg('Please enter a valid email address.');

    Keyboard.dismiss();
    setLoading(true);

    try {
      // 1. Authenticate user
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (authError) throw authError;

      // 2. Fetch role, is_banned, deleted status, and has_set_interests
      const { data: profile, error: profileError } = await supabase
        .from('user_profiles')
        .select('role, is_banned, is_deleted, is_active, has_set_interests')
        .eq('id', authData.user.id)
        .single();

      if (profileError) throw profileError;

      // BOUNCER CHECK
      if (profile.is_banned) {
        await supabase.auth.signOut();
        throw new Error('Your account has been permanently banned due to severe policy violations.');
      }

      // AUTO-REACTIVATION
      if (profile.is_deleted || profile.is_active === false) {
        const { error: reactivateError } = await supabase
          .from('user_profiles')
          .update({ is_deleted: false, is_active: true })
          .eq('id', authData.user.id);

        if (reactivateError) throw reactivateError;
        // the web alert() blocks until dismissed, so wait for OK here too
        await new Promise((resolve) => Alert.alert('Welcome back!', 'Your account has been successfully reactivated.', [{ text: 'OK', onPress: resolve }], { onDismiss: resolve }));
      }

      // 3. Routing Logic
      if (profile.role === 'Admin') {
        await supabase.from('admin_logs').insert([{
          admin_id: authData.user.id,
          action_type: 'SYSTEM_LOGIN',
          details: 'Logged into the system as Admin.',
        }]);
        goTo(navigation, 'Admin');

      } else if (profile.role === 'Support') {
        await supabase.from('support_logs').insert([{
          support_id: authData.user.id,
          action_type: 'SYSTEM_LOGIN',
          details: 'Logged into the Support workspace.',
        }]);
        goTo(navigation, 'Support');

      } else if (profile.role === 'Moderator') {
        await supabase.from('mod_logs').insert([{
          moderator_id: authData.user.id,
          action_type: 'SYSTEM_LOGIN',
          details: 'Logged into the Moderator workspace.',
        }]);
        goTo(navigation, 'Mod');

      } else {
        // ONBOARDING CHECK: normal user detour
        if (!profile.has_set_interests) goTo(navigation, 'SetupInterests');
        else goTo(navigation, 'User');
      }

    } catch (error) {
      setErrorMsg(error.message);
    } finally {
      setLoading(false);
    }
  };

  const canSubmit = !!email.trim() && !!password && !loading;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: '#fff' }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {navigation.canGoBack() && (
        <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={[s.back, { top: insets.top + 8 }]}>
          <ArrowLeft size={22} color={T.text} />
        </Pressable>
      )}
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.content, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}
      >
        <View style={s.head}>
          <Text style={s.title}>Welcome back</Text>
          <Text style={s.sub}>Log in to continue your learning journey.</Text>
        </View>

        {!!errorMsg && (
          <View style={s.error}>
            <Text style={s.errorText}>{errorMsg}</Text>
          </View>
        )}

        <View style={s.field}>
          <Text style={s.label}>Email address</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            onFocus={() => setFocus('email')}
            onBlur={() => setFocus('')}
            placeholder="you@example.com"
            placeholderTextColor="#8b98a5"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            textContentType="emailAddress"
            returnKeyType="next"
            onSubmitEditing={() => passwordRef.current?.focus()}
            style={[s.input, focus === 'email' && s.inputFocus]}
          />
        </View>

        <View style={s.field}>
          <View style={s.labelRow}>
            <Text style={s.label}>Password</Text>
            <Pressable onPress={() => navigation.navigate('ForgotPassword')} hitSlop={8}>
              <Text style={s.link}>Forgot password?</Text>
            </Pressable>
          </View>
          <View style={[s.inputWrap, focus === 'pw' && s.inputFocus]}>
            <TextInput
              ref={passwordRef}
              value={password}
              onChangeText={setPassword}
              onFocus={() => setFocus('pw')}
              onBlur={() => setFocus('')}
              placeholder="••••••••"
              placeholderTextColor="#8b98a5"
              secureTextEntry={!showPw}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="password"
              textContentType="password"
              returnKeyType="go"
              onSubmitEditing={handleLogin}
              style={s.inputFlex}
            />
            <Pressable onPress={() => setShowPw((v) => !v)} hitSlop={10}>
              {showPw ? <EyeOff size={20} color={T.sub} strokeWidth={1.8} /> : <Eye size={20} color={T.sub} strokeWidth={1.8} />}
            </Pressable>
          </View>
        </View>

        <Pressable onPress={handleLogin} disabled={!canSubmit} style={({ pressed }) => [s.button, !canSubmit && { opacity: 0.5 }, pressed && { backgroundColor: '#065f46' }]}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.buttonText}>Log in</Text>}
        </Pressable>

        <View style={s.footer}>
          <Text style={s.footerText}>Don't have an account yet? </Text>
          <Pressable onPress={() => navigation.navigate('Register')} hitSlop={8}>
            <Text style={s.link}>Sign up now</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  content: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 20 },
  back: { position: 'absolute', left: 16, zIndex: 10, width: 36, height: 36, alignItems: 'flex-start', justifyContent: 'center' },
  head: { marginBottom: 28 },
  title: { fontSize: 26, fontWeight: '700', color: T.text, letterSpacing: -0.5 },
  sub: { fontSize: 15, lineHeight: 21, color: T.sub, marginTop: 6 },

  error: { backgroundColor: '#fff1f2', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 18 },
  errorText: { fontSize: 14, lineHeight: 20, fontWeight: '500', color: T.danger },

  field: { marginBottom: 18 },
  label: { fontSize: 13, fontWeight: '600', color: T.sub },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  input: { height: 50, borderRadius: 12, backgroundColor: T.field, paddingHorizontal: 14, fontSize: 16, color: T.text, marginTop: 8, borderWidth: 1.5, borderColor: 'transparent' },
  inputWrap: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 50, borderRadius: 12, backgroundColor: T.field, paddingHorizontal: 14, marginTop: 8, borderWidth: 1.5, borderColor: 'transparent' },
  inputFlex: { flex: 1, height: 50, fontSize: 16, color: T.text },
  inputFocus: { borderColor: T.brand, backgroundColor: '#fff' },

  button: { height: 48, borderRadius: 24, backgroundColor: T.brand, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  buttonText: { fontSize: 16, fontWeight: '700', color: '#fff' },

  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 28 },
  footerText: { fontSize: 14, color: T.sub },
  link: { fontSize: 14, fontWeight: '600', color: T.brand },
});