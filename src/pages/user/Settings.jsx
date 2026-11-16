import { Reveal, PressScale } from '../../components/premium/PremiumVisual';
import { Alert } from '../../components/SkillCreditAlert';
import { useState, useEffect } from 'react';
import {
  Modal, Keyboard, Platform, StyleSheet, Switch
} from 'react-native';
import { ActivityIndicator, View, Text, Pressable, ScrollView, TextInput, KeyboardAvoidingView } from '../../components/premium/PremiumThemePrimitives';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { User, ChevronRight, Eye, EyeOff, AlertTriangle, Trash2, CheckCircle2, Moon, Sun } from '../../components/premium/PremiumThemeIcons';
import supabase from '../../supabaseClient';
import UserScreenSkeleton from '../../components/premium/UserScreenSkeleton';
import { useUserTheme } from '../../components/premium/PremiumTheme';

const CONFIRM_WORD = 'deleteacc';

export default function Settings() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { isDark, toggleDark } = useUserTheme();
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // password
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState({ type: '', text: '' });

  // deletion
  const [isValidating, setIsValidating] = useState(false);
  const [validationMessage, setValidationMessage] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const [deleteInput, setDeleteInput] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) navigation.navigate('Login');
      else setCurrentUser(user);
      setLoading(false);
    })();
  }, [navigation]);

  const handlePasswordUpdate = async () => {
    setPasswordMessage({ type: '', text: '' });
    if (newPassword.length < 6) return setPasswordMessage({ type: 'error', text: 'Password must be at least 6 characters.' });
    if (newPassword !== confirmPassword) return setPasswordMessage({ type: 'error', text: 'Passwords do not match.' });

    Keyboard.dismiss();
    setIsUpdatingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) setPasswordMessage({ type: 'error', text: error.message });
    else {
      setPasswordMessage({ type: 'success', text: 'Password updated.' });
      setNewPassword(''); setConfirmPassword('');
    }
    setIsUpdatingPassword(false);
  };

  // same checks as the web, in the same order
  const handleInitiateDelete = async () => {
    setIsValidating(true);
    setValidationMessage('');
    try {
      const { data: sessions } = await supabase.from('sessions').select('id, status')
        .or(`student_id.eq.${currentUser.id},instructor_id.eq.${currentUser.id}`);
      const hasActiveSessions = sessions?.some((x) => ['pending', 'scheduled', 'accepted', 'ongoing'].includes(x.status?.toLowerCase()));

      const { data: reports } = await supabase.from('reports').select('id').eq('reported_user_id', currentUser.id).eq('status', 'pending');
      const { data: tickets } = await supabase.from('support_tickets').select('id').eq('user_id', currentUser.id).eq('status', 'open');

      if (hasActiveSessions) setValidationMessage('You cannot delete your account while you have active, pending, or scheduled sessions.');
      else if (reports?.length > 0) setValidationMessage('Your account cannot be deleted while a report against it is under moderator review.');
      else if (tickets?.length > 0) setValidationMessage('Resolve or close your open support tickets before deleting your account.');
      else setShowConfirm(true);
    } catch (e) {
      console.error('Validation error:', e);
      setValidationMessage('Could not verify your account status. Please try again later.');
    } finally { setIsValidating(false); }
  };

  const closeConfirm = () => { setShowConfirm(false); setDeleteInput(''); setValidationMessage(''); };

  const executeAccountDeletion = async () => {
    if (deleteInput !== CONFIRM_WORD || !currentUser) return;
    Keyboard.dismiss();
    setIsDeleting(true);
    try {
      const { error } = await supabase.from('user_profiles').update({
        is_deleted: true, is_active: false, community_restricted_until: null, booking_restricted_until: null,
      }).eq('id', currentUser.id);
      if (error) throw error;

      await supabase.auth.signOut();
      setShowConfirm(false);
      Alert.alert('Account deleted', 'Your account has been deleted.', [
        { text: 'OK', onPress: () => navigation.reset({ index: 0, routes: [{ name: 'Login' }] }) },
      ]);
    } catch (e) {
      console.error('Error deleting account:', e);
      Alert.alert('Could not delete account', 'Please contact support.');
      setIsDeleting(false);
    }
  };

  if (loading) return <UserScreenSkeleton type="settings" />;

  const canSubmitPw = !!newPassword && !isUpdatingPassword;

  return (
    <>
      <ScrollView style={{ flex: 1, backgroundColor: '#fff' }} contentContainerStyle={{ paddingBottom: 140 }} keyboardShouldPersistTaps="handled">

        {/* profile */}
        <Pressable onPress={() => navigation.navigate('Profile')} style={({ pressed }) => [s.linkRow, pressed && s.pressed]}>
          <View style={s.iconBubble}><User size={22} color="#047857" /></View>
          <View style={{ flex: 1 }}>
            <Text style={s.rowTitle}>Edit profile</Text>
            <Text style={s.rowSub}>Name, bio, photo, and contact</Text>
          </View>
          <ChevronRight size={20} color="#d1d5db" />
        </Pressable>

        {/* password */}
        <Reveal delay={90}><View style={s.group}>
          <Text style={s.groupTitle}>Change password</Text>

          <Text style={s.label}>New password</Text>
          <View style={s.inputWrap}>
            <TextInput value={newPassword} onChangeText={setNewPassword} secureTextEntry={!showPw} autoCapitalize="none" autoCorrect={false}
              placeholder="At least 6 characters" placeholderTextColor="#9ca3af" style={s.inputFlex} />
            <Pressable onPress={() => setShowPw((v) => !v)} hitSlop={10}>{showPw ? <EyeOff size={20} color="#6b7280" /> : <Eye size={20} color="#6b7280" />}</Pressable>
          </View>

          <Text style={[s.label, { marginTop: 14 }]}>Confirm new password</Text>
          <View style={s.inputWrap}>
            <TextInput value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry={!showPw} autoCapitalize="none" autoCorrect={false}
              placeholder="Re-enter password" placeholderTextColor="#9ca3af" style={s.inputFlex} />
          </View>

          {!!passwordMessage.text && (
            <View style={[s.msg, passwordMessage.type === 'error' ? s.msgErr : s.msgOk]}>
              {passwordMessage.type === 'success' && <CheckCircle2 size={18} color="#047857" />}
              <Text style={[s.msgTxt, { color: passwordMessage.type === 'error' ? '#e11d48' : '#047857' }]}>{passwordMessage.text}</Text>
            </View>
          )}

          <PressScale onPress={handlePasswordUpdate} disabled={!canSubmitPw} style={[s.btnSolid, !canSubmitPw && { opacity: 0.45 }]}>
            {isUpdatingPassword ? <ActivityIndicator color="#fff" /> : <Text style={s.btnSolidTxt}>Update password</Text>}
          </PressScale>
        </View></Reveal>

        {/* Local, regular-user-only appearance. Doesn't touch account/database settings. */}
        <Reveal delay={90}><View style={s.group}>
          <Text style={s.groupTitle}>Appearance</Text>
          <View style={s.themeRow}>
            <View style={s.themeIcon}>
              {isDark ? <Moon size={20} color="#34d399" /> : <Sun size={20} color="#047857" />}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.rowTitle}>Dark Mode</Text>
              <Text style={s.rowSub}>Use a darker look across regular user screens</Text>
            </View>
            <Switch value={isDark} onValueChange={toggleDark} trackColor={{ false: '#cbd5e1', true: '#047857' }}
              thumbColor="#fff" accessibilityLabel="Dark Mode" />
          </View>
        </View></Reveal>

        {/* danger */}
        <Reveal delay={90}><View style={s.group}>
          <Text style={[s.groupTitle, { color: '#be123c' }]}>Delete account</Text>
          <Text style={s.dangerBody}>
            Your profile, skills, and community posts will be hidden from the platform. Past sessions and transactions are kept for audit and security.
          </Text>

          {!!validationMessage && (
            <View style={s.warn}>
              <AlertTriangle size={18} color="#e11d48" style={{ marginTop: 2 }} />
              <Text style={s.warnTxt}>{validationMessage}</Text>
            </View>
          )}

          <Pressable onPress={handleInitiateDelete} disabled={isValidating} style={[s.btnDanger, isValidating && { opacity: 0.5 }]}>
            {isValidating ? <ActivityIndicator color="#e11d48" /> : <><Trash2 size={18} color="#e11d48" /><Text style={s.btnDangerTxt}>Delete my account</Text></>}
          </Pressable>
        </View></Reveal>
      </ScrollView>

      {/* confirm sheet */}
      <Modal visible={showConfirm} transparent animationType="slide" onRequestClose={() => !isDeleting && closeConfirm()} statusBarTranslucent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end' }}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => !isDeleting && closeConfirm()}><View style={s.backdrop} /></Pressable>
          <View style={[s.sheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={s.grab} />
            <Text style={s.sheetTitle}>Delete your account?</Text>
            <Text style={s.sheetBody}>You won't be able to recover this account.</Text>

            <Text style={[s.label, { marginTop: 16 }]}>Type <Text style={{ color: '#e11d48', fontWeight: '800' }}>{CONFIRM_WORD}</Text> to continue</Text>
            <TextInput value={deleteInput} onChangeText={setDeleteInput} autoCapitalize="none" autoCorrect={false} placeholder={CONFIRM_WORD}
              placeholderTextColor="#9ca3af" style={s.input} />

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
              <Pressable onPress={closeConfirm} disabled={isDeleting} style={[s.btn, { backgroundColor: '#f0f2f5' }]}><Text style={s.btnGhostTxt}>Cancel</Text></Pressable>
              <Pressable onPress={executeAccountDeletion} disabled={isDeleting || deleteInput !== CONFIRM_WORD}
                style={[s.btn, { backgroundColor: '#e11d48' }, (isDeleting || deleteInput !== CONFIRM_WORD) && { opacity: 0.4 }]}>
                {isDeleting ? <ActivityIndicator color="#fff" /> : <Text style={s.btnSolidTxt}>Delete forever</Text>}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  themeRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, paddingBottom: 22 },
  themeIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#ecfdf5' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  pressed: { backgroundColor: '#f3f4f6' },

  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 13, marginTop: 13, paddingVertical: 18, paddingHorizontal: 15, backgroundColor: '#F4FBF7', borderRadius: 20, borderWidth: 1, borderColor: '#DFEDE4'},
  iconBubble: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center' , borderRadius: 16, backgroundColor: '#D6F3E3'},
  rowTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  rowSub: { fontSize: 13, color: '#6b7280', marginTop: 2 },

  group: { marginHorizontal: 13, marginTop: 14, paddingHorizontal: 18, paddingTop: 19, paddingBottom: 7, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E3EEE7', borderTopWidth: 1, borderTopColor: '#E3EEE7', borderRadius: 20},
  groupTitle: { fontWeight: '800', marginBottom: 14 , fontSize: 19, letterSpacing: -0.4, color: '#123B2C'},
  label: { fontSize: 13, fontWeight: '700', color: '#6b7280', marginBottom: 6 },
  input: { paddingHorizontal: 14, height: 48, fontSize: 16, color: '#111827' , backgroundColor: '#F6FAF7', borderRadius: 15, borderWidth: 1, borderColor: '#E0EEE6'},
  inputWrap: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, height: 48 , backgroundColor: '#F6FAF7', borderRadius: 15, borderWidth: 1, borderColor: '#E0EEE6'},
  inputFlex: { flex: 1, fontSize: 16, color: '#111827', height: 48 },

  msg: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14, padding: 12, borderRadius: 12 },
  msgErr: { backgroundColor: '#fff1f2' },
  msgOk: { backgroundColor: '#ecfdf5' },
  msgTxt: { flex: 1, fontSize: 14, fontWeight: '600' },

  btnSolid: { marginTop: 18, marginBottom: 20, backgroundColor: '#047857', alignItems: 'center', justifyContent: 'center' , borderRadius: 16, height: 52, shadowColor:'#047857', shadowOpacity:0.11, shadowRadius:7, shadowOffset:{width:0,height:3}, elevation:2},
  btnSolidTxt: { fontSize: 16, fontWeight: '700', color: '#fff' },

  dangerBody: { fontSize: 14, lineHeight: 21, color: '#6b7280' },
  warn: { flexDirection: 'row', gap: 10, marginTop: 14, padding: 12, borderRadius: 12, backgroundColor: '#fff1f2' },
  warnTxt: { flex: 1, fontSize: 14, lineHeight: 20, color: '#be123c' },
  btnDanger: { marginTop: 16, marginBottom: 20, height: 50, borderRadius: 25, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff1f2' },
  btnDangerTxt: { fontSize: 16, fontWeight: '700', color: '#e11d48' },

  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: { backgroundColor: '#fff', paddingHorizontal: 16, paddingTop: 10 , borderTopLeftRadius: 28, borderTopRightRadius: 28},
  grab: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: '#d1d5db', marginBottom: 14 },
  sheetTitle: { fontSize: 20, fontWeight: '800', color: '#111827' },
  sheetBody: { fontSize: 15, color: '#6b7280', marginTop: 4 },
  btn: { flex: 1, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center' },
  btnGhostTxt: { fontSize: 16, fontWeight: '700', color: '#374151' },
});