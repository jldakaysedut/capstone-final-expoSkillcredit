// ═══════════════════════════════════════════════════════════════
//  MOBILE APP (Expo React Native), src/layouts/AdminLayout.jsx
//  Replace the WHOLE content of your current AdminLayout.jsx with this.
//  Needs: nothing new (react-navigation + lucide are already installed).
//
//  Redesigned to match ModLayout: logo + "SkillCredit" with a caption under it,
//  account pill on the right, 5 bottom tabs, and the account menu as the same bottom
//  sheet used in SupportLayout. The role check, the admin_logs entries and the navigation
//  are UNCHANGED.
// ═══════════════════════════════════════════════════════════════
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, Text, View, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AlertOctagon, ArrowLeftRight, ChevronDown, ChevronRight, ClipboardList, Globe, LayoutDashboard, LogOut, ShieldAlert, Users,
} from 'lucide-react-native';
import supabase from '../supabaseClient';

import AdminDashboard from '../pages/admin/AdminDashboard';
import UserManagement from '../pages/admin/UserManagement';
import Escalations from '../pages/admin/Escalations';
import PlatformViewer from '../pages/admin/PlatformViewer';
import AdminLogs from '../pages/admin/AdminLogs';

// ────────────────────────────────────────────────────────────────
// ADMIN LAYOUT (mobile): slim top bar + bottom tabs
// Web: top bar + tab row. Mobile: the tab row becomes the bottom tab bar.
// ────────────────────────────────────────────────────────────────

const T = { text: '#0f1419', sub: '#536471', line: '#eff3f4', border: '#cfd9de', green: '#047857', danger: '#e11d48' };
const Tab = createBottomTabNavigator();

const TABS = [
  { name: 'Overview',    component: AdminDashboard, Icon: LayoutDashboard },
  { name: 'Users',       component: UserManagement, Icon: Users },
  { name: 'Escalations', component: Escalations,    Icon: AlertOctagon },
  { name: 'Platform',    component: PlatformViewer, Icon: Globe },
  { name: 'Logs',        component: AdminLogs,      Icon: ClipboardList },
];

// ── top bar: same shape as the moderator / user app
function TopBar({ onAccount }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[s.topBar, { paddingTop: insets.top + 8 }]}>
      <View style={s.logoRow}>
        <Image source={require('../assets/logo.png')} style={s.logo} resizeMode="contain" />
        <View>
          <Text style={s.brand}>SkillCredit</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <ShieldAlert size={12} color={T.green} />
            <Text style={s.caption}>Admin console</Text>
          </View>
        </View>
      </View>

      <Pressable onPress={onAccount} style={s.pill} hitSlop={6} accessibilityLabel="Account menu">
        <View style={s.pillDot}><ShieldAlert size={15} color="#fff" /></View>
        <Text style={s.pillName}>Admin</Text>
        <ChevronDown size={14} color="#9ca3af" />
      </Pressable>
    </View>
  );
}

export default function AdminLayout() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const [isAuthorized, setIsAuthorized] = useState(null);
  const [adminId, setAdminId] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);

  // same role check as the web (Admin or Moderator may open this console)
  useEffect(() => {
    let isMounted = true;
    const checkRole = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { if (isMounted) setIsAuthorized(false); return; }
        const { data } = await supabase.from('user_profiles').select('role').eq('id', user.id).single();
        if (!isMounted) return;
        if (data && (data.role === 'Admin' || data.role === 'Moderator')) {
          setIsAuthorized(true);
          setAdminId(user.id);
        } else {
          setIsAuthorized(false);
        }
      } catch (error) {
        console.error('Unable to verify admin access:', error);
        if (isMounted) setIsAuthorized(false);
      }
    };
    checkRole();
    return () => { isMounted = false; };
  }, []);

  const logSystemAction = async (actionType, details) => {
    if (!adminId) return;
    await supabase.from('admin_logs').insert({ admin_id: adminId, action_type: actionType, details });
  };

  const handleLogout = async () => {
    setMenuOpen(false);
    await logSystemAction('SYSTEM_LOGOUT', 'Admin securely terminated the session.');
    await supabase.auth.signOut(); // App.jsx sends you back to Login automatically
  };

  const switchToUser = async () => {
    setMenuOpen(false);
    await logSystemAction('SWITCH_ROLE', 'Admin switched to User Dashboard view.');
    navigation.navigate('User'); // press Back (or swipe back) to return to the console
  };

  // ── verifying
  if (isAuthorized === null) {
    return (
      <View style={s.center}>
        <View style={s.verifyIcon}><ShieldAlert size={22} color="#047857" /></View>
        <Text style={s.itemName}>Securing connection</Text>
        <Text style={[s.detail, { marginTop: 2 }]}>Verifying admin access…</Text>
        <ActivityIndicator style={{ marginTop: 16 }} color={T.green} />
      </View>
    );
  }

  // ── not allowed (the web redirects to "/")
  if (isAuthorized === false) {
    return (
      <View style={s.center}>
        <View style={[s.verifyIcon, { backgroundColor: '#fff1f2' }]}><ShieldAlert size={22} color="#e11d48" /></View>
        <Text style={s.itemName}>No access</Text>
        <Text style={[s.detail, { marginTop: 2, textAlign: 'center' }]}>This area is for administrators only.</Text>
        <Pressable onPress={() => supabase.auth.signOut()} style={s.outBtn}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: T.text }}>Sign out</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#faf9f6' }}>
      <Tab.Navigator
        screenOptions={{
          header: () => <TopBar onAccount={() => setMenuOpen(true)} />,
          tabBarActiveTintColor: T.green,
          tabBarInactiveTintColor: '#9ca3af',
          tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
          tabBarAllowFontScaling: false,
          tabBarItemStyle: { paddingHorizontal: 0 },
          tabBarStyle: { borderTopColor: T.line },
        }}
      >
        {TABS.map(({ name, component, Icon }) => (
          <Tab.Screen
            key={name}
            name={name}
            component={component}
            options={{ tabBarIcon: ({ color, size }) => <Icon color={color} size={size} strokeWidth={1.9} /> }}
          />
        ))}
      </Tab.Navigator>

      {/* account menu (bottom sheet, same design as SupportLayout) */}
      <Modal visible={menuOpen} transparent animationType="slide" onRequestClose={() => setMenuOpen(false)}>
        <View style={{ flex: 1 }}>
          <Pressable style={s.overlay} onPress={() => setMenuOpen(false)} />
          <View style={[s.sheet, { paddingBottom: insets.bottom + 12 }]}>
            <View style={s.grabber} />
            <View style={s.sheetHead}>
              <View style={s.bigDot}><ShieldAlert size={24} color="#fff" /></View>
              <View style={{ flex: 1 }}>
                <Text style={s.sheetName} numberOfLines={1}>Admin Console</Text>
                <Text style={s.detail}>Superuser access</Text>
              </View>
            </View>

            <Pressable onPress={switchToUser} style={s.menuRow}>
              <View style={[s.menuIcon, { backgroundColor: '#6366f11A' }]}><ArrowLeftRight size={19} color="#6366f1" strokeWidth={1.9} /></View>
              <Text style={s.menuLabel}>Switch to user mode</Text>
              <ChevronRight size={18} color={T.border} />
            </Pressable>

            <Pressable onPress={handleLogout} style={s.menuRow}>
              <View style={[s.menuIcon, { backgroundColor: T.danger + '1A' }]}><LogOut size={19} color={T.danger} strokeWidth={1.9} /></View>
              <Text style={[s.menuLabel, { color: T.danger }]}>Terminate session</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  // top bar (matches ModLayout / UserLayout)
  topBar: {
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb',
    paddingHorizontal: 16, paddingBottom: 10, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'space-between',
  },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  logo: { width: 32, height: 32 },
  brand: { fontSize: 19, fontWeight: '700', color: '#064e3b', letterSpacing: -0.3 },
  caption: { fontSize: 12, fontWeight: '700', color: T.green },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: '#e5e7eb',
    borderRadius: 20, paddingLeft: 4, paddingRight: 10, paddingVertical: 4, backgroundColor: '#fff',
  },
  pillDot: { width: 28, height: 28, borderRadius: 14, backgroundColor: T.green, alignItems: 'center', justifyContent: 'center' },
  pillName: { fontSize: 13, fontWeight: '600', color: '#1f2937' },

  // states
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', paddingHorizontal: 32 },
  verifyIcon: { width: 52, height: 52, borderRadius: 14, backgroundColor: '#ecfdf5', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  outBtn: { marginTop: 18, height: 46, paddingHorizontal: 28, borderRadius: 23, borderWidth: 1, borderColor: '#cfd9de', alignItems: 'center', justifyContent: 'center' },

  // text
  itemName: { fontSize: 15, fontWeight: '600', color: T.text },
  detail: { fontSize: 13, color: T.sub, lineHeight: 18 },

  // account sheet (same as SupportLayout)
  overlay: { flex: 1, backgroundColor: 'rgba(15,20,25,0.5)' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 8 },
  grabber: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: T.border, marginBottom: 6 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: T.line },
  sheetName: { fontSize: 17, fontWeight: '700', color: T.text, letterSpacing: -0.2 },
  bigDot: { width: 52, height: 52, borderRadius: 26, backgroundColor: T.green, alignItems: 'center', justifyContent: 'center' },
  menuRow: { height: 56, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: T.line },
  menuIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  menuLabel: { flex: 1, fontSize: 15, fontWeight: '600', color: T.text },
});