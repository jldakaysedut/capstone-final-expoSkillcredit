// ═══════════════════════════════════════════════════════════════
//  MOBILE APP (Expo React Native) — src/layouts/ModLayout.jsx
//  Redesigned to follow UserLayout: one slim top bar (brand, pending, account pill),
//  a bottom tab bar for the 6 work queues, and the account bottom sheet (same as SupportLayout).
//  Data + rules are UNCHANGED: session check, the 3 pending counts
//  (disputes / reports / approvals), the SYSTEM_LOGOUT audit log, "switch to user app".
//
//  Register it in App.jsx as the root-stack screen 'Moderator'. Detail pages
//  (SkillReview, DisputeDetails, ReportDetails) are root-stack screens, like Profile.
// ═══════════════════════════════════════════════════════════════
import { useState, useEffect } from 'react';
import {
  View, Text, Image, Pressable, Modal, ActivityIndicator, AppState, Platform, StyleSheet,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AlertOctagon, ArrowUpRight, ChevronDown, ChevronRight, ClipboardList, FileText, Flag, LayoutDashboard, LogOut, Scale, ShieldCheck,
} from 'lucide-react-native';
import supabase from '../supabaseClient';
import ModDashboard from '../pages/moderator/ModDashboard';
import SkillApprovals from '../pages/moderator/SkillApprovals';
import Disputes from '../pages/moderator/Disputes';
import UserReports from '../pages/moderator/UserReports';
import RepeatOffenders from '../pages/moderator/RepeatOffenders';
import ModLogs from '../pages/moderator/ModLogs';

const Tab = createBottomTabNavigator();

const T = {
  text: '#0f1419', sub: '#536471', line: '#eff3f4', border: '#cfd9de', field: '#eff3f4',
  brand: '#047857', soft: '#ecfdf5', danger: '#e11d48',
};

// same 6 queues as the web nav. `name` = the screen name other pages navigate to
// (and the short label under the tab icon). `label` = the full name for screen readers.
const NAV = [
  { name: 'Overview',  label: 'Overview',          Icon: LayoutDashboard, screen: ModDashboard },
  { name: 'Approvals', label: 'Skill approvals',   Icon: ClipboardList,   screen: SkillApprovals, badge: 'approvals' },
  { name: 'Disputes',  label: 'Disputes & escrow', Icon: Scale,           screen: Disputes,       badge: 'disputes' },
  { name: 'Reports',   label: 'User reports',      Icon: Flag,            screen: UserReports,    badge: 'reports' },
  { name: 'Offenders', label: 'Repeat offenders',  Icon: AlertOctagon,    screen: RepeatOffenders },
  { name: 'Logs',      label: 'Audit logs',        Icon: FileText,        screen: ModLogs },
];

const Avatar = ({ profile, size }) => {
  const initials = profile?.full_name?.trim()?.split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase() || 'M';
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden', backgroundColor: T.brand, alignItems: 'center', justifyContent: 'center' }}>
      {profile?.avatar_url
        ? <Image source={{ uri: profile.avatar_url }} style={{ width: size, height: size }} />
        : <Text style={{ color: '#fff', fontWeight: '700', fontSize: size * 0.4 }}>{initials}</Text>}
    </View>
  );
};

// ────────────────── TOP BAR (same shape as the user app's top bar)
function ModTopBar({ profile, totalPending, onProfile }) {
  const insets = useSafeAreaInsets();
  const firstName = profile?.full_name?.split(' ')[0] || 'You';
  const hasPending = totalPending > 0;

  return (
    <View style={[s.topBar, { paddingTop: insets.top + 8 }]}>
      <View style={s.logoRow}>
        <Image source={require('../assets/logo.png')} style={s.logo} resizeMode="contain" />
        <View>
          <Text style={s.brand} numberOfLines={1}><Text style={s.brandSkill}>Skill</Text><Text style={s.brandCredit}>Credit</Text></Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <ShieldCheck size={12} color={T.brand} />
            <Text style={s.caption}>Moderation</Text>
          </View>
        </View>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        

        <Pressable onPress={onProfile} style={s.pill} accessibilityLabel="Account menu">
          <Avatar profile={profile} size={28} />
          <Text style={s.pillName} numberOfLines={1}>{firstName}</Text>
          <ChevronDown size={14} color="#9ca3af" />
        </Pressable>
      </View>
    </View>
  );
}

export default function ModLayout() {
  const nav = useNavigation();
  const insets = useSafeAreaInsets();
  const [profile, setProfile] = useState(null);
  const [pendingDisputes, setPendingDisputes] = useState(0);
  const [pendingReports, setPendingReports] = useState(0);
  const [pendingApprovals, setPendingApprovals] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // ─── same queries as the web
  const fetchModeratorSession = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return; // signed out: App.jsx sends you back to Login

      const { data: userProfile } = await supabase
        .from('user_profiles')
        .select('id, full_name, role, avatar_url')
        .eq('id', user.id)
        .single();
      setProfile(userProfile);

      const { count: disputesCount } = await supabase
        .from('reports')
        .select('*', { count: 'exact', head: true })
        .eq('reference_type', 'session')
        .eq('status', 'pending');

      const { count: reportsCount } = await supabase
        .from('reports')
        .select('*', { count: 'exact', head: true })
        .neq('reference_type', 'session')
        .eq('status', 'pending');

      const { count: approvalsCount } = await supabase
        .from('skills')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending');

      setPendingDisputes(disputesCount || 0);
      setPendingReports(reportsCount || 0);
      setPendingApprovals(approvalsCount || 0);
    } catch (err) {
      console.error('Moderator layout auth error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchModeratorSession(); }, []);

  // web refetches on every route change -> here: every time a tab is focused,
  // and when the app comes back to the foreground
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => { if (state === 'active') fetchModeratorSession(); });
    return () => sub.remove();
  }, []);

  const handleSignOut = async () => {
    setIsMenuOpen(false);
    if (profile?.id) {
      try {
        await supabase.from('mod_logs').insert([{
          moderator_id: profile.id,
          action_type: 'SYSTEM_LOGOUT',
          details: 'Logged out of the Moderator workspace.',
        }]);
      } catch (err) {
        console.error('Failed to log logout', err);
      }
    }
    await supabase.auth.signOut(); // App.jsx sends you back to Login automatically
  };

  const totalPending = pendingApprovals + pendingDisputes + pendingReports;
  const badges = { approvals: pendingApprovals, disputes: pendingDisputes, reports: pendingReports };
  const roleLabel = profile?.role || 'Staff';

  if (loading) {
    return (
      <View style={s.loadingScreen}>
        <View style={s.loadingIcon}><ShieldCheck size={24} color={T.brand} /></View>
        <Text style={s.loadingTitle}>Opening moderator workspace</Text>
        <Text style={s.small}>Verifying your session…</Text>
        <ActivityIndicator color={T.brand} style={{ marginTop: 16 }} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#faf9f6' }}>
      <Tab.Navigator
        screenListeners={{ focus: () => fetchModeratorSession() }}
        screenOptions={{
          header: () => (
            <ModTopBar profile={profile} totalPending={totalPending} onProfile={() => setIsMenuOpen(true)} />
          ),
          tabBarActiveTintColor: T.brand,
          tabBarInactiveTintColor: '#9ca3af',
          tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
          tabBarAllowFontScaling: false,
          tabBarItemStyle: { paddingHorizontal: 0 },
          tabBarBadgeStyle: { backgroundColor: '#f59e0b', color: '#fff', fontSize: 11, fontWeight: '700', minWidth: 18, height: 18, lineHeight: 17 },
        }}
      >
        {NAV.map(({ name, label, Icon, screen, badge }) => {
          const count = badge ? badges[badge] : 0;
          return (
            <Tab.Screen
              key={name}
              name={name}
              component={screen}
              options={{
                tabBarIcon: ({ color, size }) => <Icon color={color} size={size} strokeWidth={1.9} />,
                tabBarBadge: count > 0 ? count : undefined,
                tabBarAccessibilityLabel: count > 0 ? `${label}, ${count} pending` : label,
              }}
            />
          );
        })}
      </Tab.Navigator>

      {/* ── ACCOUNT (bottom sheet, same design as SupportLayout) */}
      <Modal visible={isMenuOpen} transparent animationType="slide" onRequestClose={() => setIsMenuOpen(false)}>
        <View style={{ flex: 1 }}>
          <Pressable style={s.overlay} onPress={() => setIsMenuOpen(false)} />
          <View style={[s.sheet, { paddingBottom: insets.bottom + 12 }]}>
            <View style={s.grabber} />
            <View style={s.sheetHead}>
              <Avatar profile={profile} size={52} />
              <View style={{ flex: 1 }}>
                <Text style={s.sheetName} numberOfLines={1}>{profile?.full_name || 'Moderator'}</Text>
                <Text style={[s.small, { textTransform: 'capitalize' }]}>{roleLabel}</Text>
              </View>
            </View>

            <Pressable style={s.menuRow} onPress={() => { setIsMenuOpen(false); nav.navigate('User'); }}>
              <View style={[s.menuIcon, { backgroundColor: '#6366f11A' }]}><ArrowUpRight size={19} color="#6366f1" strokeWidth={1.9} /></View>
              <Text style={s.menuLabel}>Switch to user app</Text>
              <ChevronRight size={18} color={T.border} />
            </Pressable>

            <Pressable style={s.menuRow} onPress={handleSignOut}>
              <View style={[s.menuIcon, { backgroundColor: T.danger + '1A' }]}><LogOut size={19} color={T.danger} strokeWidth={1.9} /></View>
              <Text style={[s.menuLabel, { color: T.danger }]}>Sign out</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  small: { fontSize: 13, color: T.sub },

  // loading
  loadingScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', paddingHorizontal: 32 },
  loadingIcon: { width: 52, height: 52, borderRadius: 16, backgroundColor: T.soft, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  loadingTitle: { fontSize: 17, fontWeight: '700', color: T.text, letterSpacing: -0.2, marginBottom: 4 },

  // top bar (matches UserLayout)
  topBar: {
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb',
    paddingHorizontal: 16, paddingBottom: 10, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'space-between',
  },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  logo: { width: 32, height: 32 },
  brand: { fontSize: 19, fontWeight: '900', fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif', letterSpacing: -0.3 },
  brandSkill: { color: '#2d6a4f' },
  brandCredit: { color: '#111111' },
  caption: { fontSize: 12, fontWeight: '700', color: T.brand },
  pending: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 20, paddingHorizontal: 10, height: 36 },
  pendingOn: { backgroundColor: '#fffbeb', borderColor: '#fde68a' },
  pendingOff: { backgroundColor: T.soft, borderColor: '#a7f3d0' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  pendingText: { fontSize: 13, fontWeight: '700' },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: '#e5e7eb',
    borderRadius: 20, paddingLeft: 4, paddingRight: 10, paddingVertical: 4, backgroundColor: '#fff',
  },
  pillName: { maxWidth: 70, fontSize: 13, fontWeight: '600', color: '#1f2937' },

  // account sheet (same as SupportLayout)
  overlay: { flex: 1, backgroundColor: 'rgba(15,20,25,0.5)' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 8 },
  grabber: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: T.border, marginBottom: 6 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: T.line },
  sheetName: { fontSize: 17, fontWeight: '700', color: T.text, letterSpacing: -0.2 },
  menuRow: { height: 56, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: T.line },
  menuIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  menuLabel: { flex: 1, fontSize: 15, fontWeight: '600', color: T.text },
});