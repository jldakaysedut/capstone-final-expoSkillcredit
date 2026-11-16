import { Alert } from '../../components/SkillCreditAlert';
// ═══════════════════════════════════════════════════════════════
//  MOBILE APP (Expo React Native) — src/pages/auth/SetupInterests.jsx
//  Mobile version (same data + logic as the web SetupInterests),
//  styled like Dashboard / Community (compact X-style typography).
//  Replace the WHOLE content of your current SetupInterests.jsx with this.
//  Needs:  npx expo install @react-native-async-storage/async-storage
// ═══════════════════════════════════════════════════════════════
import { useState, useEffect } from 'react';
import {
  StyleSheet
} from 'react-native';
import { View, Text, Pressable, ScrollView } from '../../components/premium/PremiumThemePrimitives';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ChefHat, Leaf, Hammer, Dumbbell, Scissors, Wrench, BookOpen, PenLine, MessageCircle, Music2, Palette, Film, Briefcase, PiggyBank, Monitor, Code2, Sparkles, Check } from '../../components/premium/PremiumThemeIcons';
import supabase from '../../supabaseClient';
import { Reveal, PressScale, SoftPulse } from '../../components/premium/PremiumVisual';

// Route names used by this screen (the web used '/login' and '/dashboard'). Change them here if yours differ.
const ROUTES = { login: 'Login', home: 'User' };

const CATEGORIES = [
  { name: 'Coding & Programming',         icon: Code2,         color: '#65a30d' },
  { name: 'Website & App Design',          icon: Monitor,       color: '#0ea5e9' },
  { name: 'Business, Entrepreneurship & Marketing',  icon: Briefcase,     color: '#475569' },
  { name: 'Finance, Investing & Trading',    icon: PiggyBank,     color: '#059669' },
  { name: 'Writing & Editing',     icon: PenLine,       color: '#14b8a6' },
  { name: 'Graphic Design & Digital Art',  icon: Palette,       color: '#f43f5e' },
  { name: 'Video, Animation & AI Content Creation',     icon: Film,          color: '#f59e0b' },
  { name: 'Languages & Public Speaking',  icon: MessageCircle, color: '#06b6d4' },
  { name: 'School Subjects & Tutoring',     icon: BookOpen,      color: '#6366f1' },
  { name: 'Fitness & Sports',      icon: Dumbbell,      color: '#ef4444' },
  { name: 'Cooking & Baking',      icon: ChefHat,       color: '#f97316' },
  { name: 'Music & Singing', icon: Music2,        color: '#d946ef' },
  { name: 'Beauty & Personal Care',     icon: Scissors,      color: '#ec4899' },
  { name: 'Home Repair & DIY',            icon: Hammer,        color: '#ca8a04' },
  { name: 'Gardening & Plant Care',   icon: Leaf,          color: '#22c55e' },
  { name: 'Computer, Phone & Electronics Help',  icon: Wrench,        color: '#3b82f6' },
];

export default function SetupInterests() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [user, setUser] = useState(null);
  const [progress, setProgress] = useState(0);

  const goHome = () => navigation.reset({ index: 0, routes: [{ name: ROUTES.home }] });

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) navigation.reset({ index: 0, routes: [{ name: ROUTES.login }] });
      else setUser(user);
    };
    checkAuth();
  }, [navigation]);

  useEffect(() => {
    if (isSaving) {
      const startTime = Date.now();
      const duration = 4000;
      const interval = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const newProgress = Math.min((elapsed / duration) * 100, 100);
        setProgress(newProgress);
        if (newProgress >= 100) clearInterval(interval);
      }, 50);
      return () => clearInterval(interval);
    }
  }, [isSaving]);

  const toggleCategory = (name) => {
    setSelected((prev) => (prev.includes(name) ? prev.filter((c) => c !== name) : [...prev, name]));
  };

  const handleSave = async () => {
    if (selected.length === 0 || !user) return;
    setIsSaving(true);

    try {
      // 1. Get the current data first
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('has_set_interests')
        .eq('id', user.id)
        .single();

      // Already set before (maybe just a refresh): go straight to the dashboard
      if (profile?.has_set_interests) {
        goHome();
        return;
      }

      // 2. Interests setup must never write wallet credits. Signup's existing
      // one-time 20 CR bonus is handled by registration/server-side rules.
      const { error } = await supabase
        .from('user_profiles')
        .update({
          interests: selected,
          has_set_interests: true,
        })
        .eq('id', user.id);

      if (error) throw error;

      // 3. Check if the notification already exists (avoid doubles).
      //    NOTE: the web called .ilike('%20 CR starting bonus%') with no column, which is invalid; fixed here.
      const { data: existingNotif } = await supabase
        .from('notifications')
        .select('id')
        .eq('user_id', user.id)
        .eq('type', 'system')
        .ilike('content', '%20 CR starting bonus%')
        .limit(1);

      if (!existingNotif || existingNotif.length === 0) {
        await supabase
          .from('notifications')
          .insert([{
            user_id: user.id,
            type: 'system',
            content: '🎉 Welcome to SkillCredit! You received a 20 CR starting bonus. Use it to book your first session!',
            link_url: '/dashboard',
            is_read: false,
          }]);
      }

      // 4. Trigger for the welcome bonus popup (read by UserDashboard)
      await AsyncStorage.setItem('showWelcomeBonus', 'true');

      await new Promise((resolve) => setTimeout(resolve, 4000));

      goHome();
    } catch (error) {
      console.error(error);
      Alert.alert('Failed to save interests. Please try again.');
      setIsSaving(false);
    }
  };

  // ── saving screen
  if (isSaving) {
    return (
      <View style={s.savingWrap}>
        <SoftPulse style={s.savingIcon}><Sparkles size={34} color="#047857" /></SoftPulse>
        <Text style={s.savingTag}>SkillCredit setup</Text>
        <Text style={s.savingTitle}>Preparing your dashboard…</Text>
        <Text style={s.savingSub}>Curating skills and building recommendations based on your selected interests.</Text>

        <View style={s.progressBlock}>
          <View style={s.progressLabels}>
            <Text style={s.progressLabel}>Loading resources</Text>
            <Text style={s.progressPct}>{Math.round(progress)}%</Text>
          </View>
          <View style={s.track}><View style={[s.fill, { width: `${progress}%` }]} /></View>
        </View>
      </View>
    );
  }

  return (
    <View style={s.screen}>
      <ScrollView contentContainerStyle={{ paddingBottom: 28 }} showsVerticalScrollIndicator={false}>
        <Reveal>
          <View style={[s.header, { paddingTop: insets.top + 30 }]}>
            <View pointerEvents="none" style={s.heroOrbLarge} />
            <View pointerEvents="none" style={s.heroOrbSmall} />
            <View style={s.headIcon}><Sparkles size={23} color="#d1fae5" /></View>
            <Text style={s.eyebrow}>PERSONALIZE YOUR JOURNEY</Text>
            <Text style={s.title}>What are you interested in?</Text>
            <Text style={s.sub}>
              Pick a few topics you'd like to learn or teach. We'll use this to personalize your SkillCredit dashboard.
            </Text>
          </View>
        </Reveal>

        <Reveal delay={90}>
          <View style={s.chipsHeader}>
            <Text style={s.chipsHeading}>Explore your interests</Text>
            <Text style={s.chipsHint}>Select what excites you</Text>
          </View>
          <View style={s.chips}>
          {CATEGORIES.map((cat) => {
            const on = selected.includes(cat.name);
            const Icon = cat.icon;
            return (
              <PressScale key={cat.name} onPress={() => toggleCategory(cat.name)} style={[s.chip, on && s.chipOn]}>
                <Icon size={17} color={on ? '#047857' : cat.color} />
                <Text style={[s.chipText, on && s.chipTextOn]}>{cat.name}</Text>
                {on && <Check size={16} color="#047857" />}
              </PressScale>
            );
          })}
          </View>
        </Reveal>
      </ScrollView>

      {/* bottom bar */}
      <View style={[s.bar, { paddingBottom: insets.bottom + 12 }]}>
        <Text style={s.barText}>
          {selected.length === 0 ? 'Select at least 1 topic' : `${selected.length} ${selected.length === 1 ? 'topic' : 'topics'} selected`}
        </Text>
        <PressScale
          onPress={handleSave}
          disabled={selected.length === 0 || isSaving}
          style={[s.btn, selected.length === 0 && { opacity: 0.4 }]}
        >
          <Text style={s.btnText}>Continue</Text>
        </PressScale>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  // premium onboarding hero (presentation only)
  screen: { flex: 1, backgroundColor: '#f4f8f6' },
  header: { backgroundColor: '#064e3b', paddingHorizontal: 24, paddingBottom: 36, borderBottomLeftRadius: 30, borderBottomRightRadius: 30, overflow: 'hidden' },
  heroOrbLarge: { position: 'absolute', right: -70, top: -30, height: 230, width: 230, borderRadius: 115, backgroundColor: 'rgba(110,231,183,0.11)' },
  heroOrbSmall: { position: 'absolute', right: 16, bottom: -45, height: 135, width: 135, borderRadius: 68, borderWidth: 2, borderColor: 'rgba(209,250,229,0.12)' },
  headIcon: { width: 52, height: 52, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.14)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  eyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 2.1, color: '#a7f3d0', marginBottom: 10 },
  title: { fontSize: 29, lineHeight: 35, fontWeight: '800', color: '#ffffff', letterSpacing: -0.8, maxWidth: 310 },
  sub: { fontSize: 14, color: '#d1fae5', lineHeight: 22, marginTop: 10, maxWidth: 340 },

  // elevated selection cards
  chipsHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 26, paddingBottom: 14, gap: 8 },
  chipsHeading: { color: '#103d30', fontSize: 17, fontWeight: '800', letterSpacing: -0.35 },
  chipsHint: { fontSize: 11, color: '#698478', fontWeight: '500' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingHorizontal: 20 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 46, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 16, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e1eae5', shadowColor: '#064e3b', shadowOpacity: 0.045, shadowOffset: { width: 0, height: 3 }, shadowRadius: 8, elevation: 1 },
  chipOn: { backgroundColor: '#e4f8ec', borderColor: '#34a874', shadowOpacity: 0.08 },
  chipText: { fontSize: 13, fontWeight: '700', color: '#234639' },
  chipTextOn: { color: '#065f46' },

  // anchored CTA
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: 20, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#e2eae5', backgroundColor: '#ffffff', elevation: 7, shadowColor: '#064e3b', shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: -4 } },
  barText: { flex: 1, fontSize: 13, color: '#526d60', fontWeight: '600' },
  btn: { height: 48, paddingHorizontal: 29, borderRadius: 16, backgroundColor: '#047857', alignItems: 'center', justifyContent: 'center', shadowColor: '#047857', shadowOpacity: 0.18, shadowRadius: 9, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
  btnText: { fontSize: 15, fontWeight: '800', color: '#fff' },

  // saving screen
  savingWrap: { flex: 1, backgroundColor: '#f4f8f6', alignItems: 'center', justifyContent: 'center', padding: 28 },
  savingIcon: { width: 76, height: 76, borderRadius: 25, backgroundColor: '#d1fae5', alignItems: 'center', justifyContent: 'center', marginBottom: 22, shadowColor: '#047857', shadowOpacity: 0.15, shadowRadius: 16, elevation: 6 },
  savingTag: { fontSize: 13, fontWeight: '600', color: '#047857' },
  savingTitle: { fontSize: 20, fontWeight: '700', color: '#0f1419', letterSpacing: -0.2, marginTop: 4 },
  savingSub: { fontSize: 14, color: '#536471', lineHeight: 20, textAlign: 'center', marginTop: 8, maxWidth: 280 },
  progressBlock: { alignSelf: 'stretch', maxWidth: 280, marginTop: 36 },
  progressLabels: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  progressLabel: { fontSize: 13, color: '#536471' },
  progressPct: { fontSize: 13, fontWeight: '700', color: '#047857' },
  track: { height: 8, borderRadius: 4, backgroundColor: '#deece4', overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4, backgroundColor: '#10b981' },
});