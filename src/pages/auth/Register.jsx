import { useState, useRef } from 'react';
import {
  View, Text, Pressable, ScrollView, TextInput, ActivityIndicator, Keyboard,
  KeyboardAvoidingView, Platform, StyleSheet,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Eye, EyeOff, Rocket } from 'lucide-react-native';
import supabase from '../../supabaseClient';

// Compact X-style layout: open white screen, filled inputs, one primary pill button
const T = {
  text: '#0f1419', sub: '#536471', line: '#eff3f4', border: '#cfd9de', field: '#eff3f4',
  brand: '#047857', danger: '#e11d48',
};

// defined outside the screen so typing never remounts the input
const Input = ({ label, inputRef, focused, onFocus, onBlur, right, ...props }) => (
  <View style={s.field}>
    <Text style={s.label}>{label}</Text>
    <View style={[s.inputWrap, focused && s.inputFocus]}>
      <TextInput
        ref={inputRef}
        placeholderTextColor="#8b98a5"
        onFocus={onFocus}
        onBlur={onBlur}
        {...props}
        style={s.inputFlex}
      />
      {right}
    </View>
  </View>
);

export default function Register() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const emailRef = useRef(null);
  const passwordRef = useRef(null);
  const confirmRef = useRef(null);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [focus, setFocus] = useState('');

  const handleRegister = async () => {
    setErrorMsg('');
    // same as the web form: every field required, email must look like an email
    if (!fullName.trim() || !email.trim() || !password || !confirmPassword) return setErrorMsg('Please fill in all fields.');
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setErrorMsg('Please enter a valid email address.');

    if (password !== confirmPassword) {
      return setErrorMsg('Passwords do not match');
    }

    Keyboard.dismiss();
    setLoading(true);

    try {
      // 1. Create user in Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      });

      if (authError) throw authError;

      // 2. Save profile and give 20 credits in user_profiles table
      if (authData?.user) {
        const { error: profileError } = await supabase
          .from('user_profiles')
          .insert([
            {
              id: authData.user.id,
              full_name: fullName.trim(),
              email: email.trim(),
              credits_balance: 20,
              has_set_interests: false,
            },
          ]);

        if (profileError) throw profileError;
      }

      // 3. Redirect to SetupInterests instead of Dashboard for first-timers
      navigation.reset({ index: 0, routes: [{ name: 'SetupInterests' }] });

    } catch (error) {
      setErrorMsg(error.message);
    } finally {
      setLoading(false);
    }
  };

  const canSubmit = !!fullName.trim() && !!email.trim() && !!password && !!confirmPassword && !loading;
  const eye = (
    <Pressable onPress={() => setShowPw((v) => !v)} hitSlop={10}>
      {showPw ? <EyeOff size={20} color={T.sub} strokeWidth={1.8} /> : <Eye size={20} color={T.sub} strokeWidth={1.8} />}
    </Pressable>
  );

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
          <Text style={s.title}>Create an account</Text>
          <Text style={s.sub}>Join the community and start learning today.</Text>
        </View>

        {!!errorMsg && (
          <View style={s.error}>
            <Text style={s.errorText}>{errorMsg}</Text>
          </View>
        )}

        <Input
          label="Full name"
          value={fullName}
          onChangeText={setFullName}
          placeholder="e.g. John Lhoyde Dakay"
          autoCapitalize="words"
          autoComplete="name"
          textContentType="name"
          returnKeyType="next"
          onSubmitEditing={() => emailRef.current?.focus()}
          focused={focus === 'name'}
          onFocus={() => setFocus('name')}
          onBlur={() => setFocus('')}
        />

        <Input
          label="Email address"
          inputRef={emailRef}
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType="emailAddress"
          returnKeyType="next"
          onSubmitEditing={() => passwordRef.current?.focus()}
          focused={focus === 'email'}
          onFocus={() => setFocus('email')}
          onBlur={() => setFocus('')}
        />

        <Input
          label="Password"
          inputRef={passwordRef}
          value={password}
          onChangeText={setPassword}
          placeholder="••••••••"
          secureTextEntry={!showPw}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="next"
          onSubmitEditing={() => confirmRef.current?.focus()}
          focused={focus === 'pw'}
          onFocus={() => setFocus('pw')}
          onBlur={() => setFocus('')}
          right={eye}
        />

        <Input
          label="Confirm password"
          inputRef={confirmRef}
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          placeholder="••••••••"
          secureTextEntry={!showPw}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="go"
          onSubmitEditing={handleRegister}
          focused={focus === 'confirm'}
          onFocus={() => setFocus('confirm')}
          onBlur={() => setFocus('')}
        />

        <Pressable onPress={handleRegister} disabled={!canSubmit} style={({ pressed }) => [s.button, !canSubmit && { opacity: 0.5 }, pressed && { backgroundColor: '#065f46' }]}>
          {loading ? <ActivityIndicator color="#fff" /> : (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Rocket size={18} color="#fff" strokeWidth={1.8} />
              <Text style={s.buttonText}>Sign up and get 20 credits</Text>
            </View>
          )}
        </Pressable>

        <View style={s.footer}>
          <Text style={s.footerText}>Already have an account? </Text>
          <Pressable onPress={() => navigation.navigate('Login')} hitSlop={8}>
            <Text style={s.link}>Log in here</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  content: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 20 },
  back: { position: 'absolute', left: 16, zIndex: 10, width: 36, height: 36, alignItems: 'flex-start', justifyContent: 'center' },
  head: { marginBottom: 24 },
  title: { fontSize: 26, fontWeight: '700', color: T.text, letterSpacing: -0.5 },
  sub: { fontSize: 15, lineHeight: 21, color: T.sub, marginTop: 6 },

  error: { backgroundColor: '#fff1f2', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 16 },
  errorText: { fontSize: 14, lineHeight: 20, fontWeight: '500', color: T.danger },

  field: { marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '600', color: T.sub },
  inputWrap: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 50, borderRadius: 12, backgroundColor: T.field, paddingHorizontal: 14, marginTop: 8, borderWidth: 1.5, borderColor: 'transparent' },
  inputFlex: { flex: 1, height: 50, fontSize: 16, color: T.text },
  inputFocus: { borderColor: T.brand, backgroundColor: '#fff' },

  button: { height: 48, borderRadius: 24, backgroundColor: T.brand, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  buttonText: { fontSize: 16, fontWeight: '700', color: '#fff' },

  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 24 },
  footerText: { fontSize: 14, color: T.sub },
  link: { fontSize: 14, fontWeight: '600', color: T.brand },
});