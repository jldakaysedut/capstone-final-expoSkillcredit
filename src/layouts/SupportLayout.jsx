import { Alert } from '../components/SkillCreditAlert';
// ═══════════════════════════════════════════════════════════════
//  MOBILE APP (Expo React Native) — src/layouts/SupportLayout.jsx
//  Redesigned to match ModLayout / UserLayout: one slim top bar (logo + "SkillCredit",
//  "Support" caption, open-ticket pill, account pill) and a BOTTOM tab bar for the
//  3 workspace pages. The account menu keeps its bottom-sheet design
//  (Switch to user app / Sign out). Yellow support theme.
//  Data + rules are UNCHANGED: access check (Support / Admin only), the SYSTEM_LOGOUT
//  audit log (support_logs), "switch to user app", and the realtime open-ticket count
//  with a toast for every new ticket / customer reply.
//
//  Register it in App.jsx as the root-stack screen 'Support'. TicketChat is a root-stack
//  screen, like Profile.
// ═══════════════════════════════════════════════════════════════
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, Image, Pressable, Modal, ActivityIndicator, AppState, DeviceEventEmitter, StyleSheet,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowUpRight, ChevronDown, ChevronRight, FileText, Headphones, LayoutDashboard, LogOut, MessageSquare, Ticket, X,
} from 'lucide-react-native';
import supabase from '../supabaseClient';
import SupportDashboard from '../pages/support/SupportDashboard';
import Tickets from '../pages/support/Tickets';
import SupportLogs from '../pages/support/SupportLogs';

const Tab = createBottomTabNavigator();

const T = {
  text: '#0f1419', sub: '#536471', line: '#eff3f4', border: '#cfd9de', field: '#eff3f4', danger: '#e11d48',
};
// the support (yellow) accent from the web layout
const Y = { main: '#eab308', strong: '#a16207', text: '#854d0e', soft: '#fefce8', border: '#fef08a', avatar: '#facc15', amber: '#f59e0b' };

// ── the only places to edit if your route names differ (see App.jsx)
const ROUTES = {
  ticketChat: 'TicketChat', // root-stack screen that opens one ticket
  userApp: 'User',          // the web "/dashboard" (UserLayout)
};

const ALLOWED_ROLES = ['Support', 'Admin'];

// a ticket in one of these states no longer counts as "open"
const CLOSED_STATUSES = ['resolved', 'closed', 'completed', 'cancelled'];

// same 3 pages as the web nav. `name` = the screen name other pages navigate to.
const NAV = [
  { name: 'Overview', label: 'Overview',     Icon: LayoutDashboard, screen: SupportDashboard },
  { name: 'Tickets',  label: 'Ticket queue', Icon: Ticket,          screen: Tickets, badge: 'tickets' },
  { name: 'Logs',     label: 'Audit logs',   Icon: FileText,        screen: SupportLogs },
];

const TOAST_LOOK = {
  ticket: { Icon: Ticket,        color: Y.strong,  bg: Y.soft,    badge: 'New ticket' },
  reply:  { Icon: MessageSquare, color: '#047857', bg: '#ecfdf5', badge: 'Customer reply' },
};

// does this route exist anywhere above us? (so we never navigate to a screen that isn't there)
const routeExists = (nav, name) => {
  let n = nav;
  while (n) {
    const names = n.getState?.()?.routeNames;
    if (names?.includes(name)) return true;
    n = n.getParent?.();
  }
  return false;
};

const Avatar = ({ profile, size }) => {
  const initials = profile?.full_name?.trim()?.split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase() || 'S';
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden', backgroundColor: Y.avatar, alignItems: 'center', justifyContent: 'center' }}>
      {profile?.avatar_url
        ? <Image source={{ uri: profile.avatar_url }} style={{ width: size, height: size }} />
        : <Text style={{ color: '#111827', fontWeight: '700', fontSize: size * 0.38 }}>{initials}</Text>}
    </View>
  );
};

// ────────────────── TOP BAR (same shape as the moderator / user app)
function SupportTopBar({ profile, openTickets, onAccount }) {
  const insets = useSafeAreaInsets();
  const firstName = profile?.full_name?.split(' ')[0] || 'You';
  const hasOpen = openTickets > 0;

  return (
    <View style={[s.topBar, { paddingTop: insets.top + 8 }]}>
      <View style={s.logoRow}>
        <Image source={require('../assets/logo.png')} style={s.logo} resizeMode="contain" />
        <View>
          <Text style={s.brand}>SkillCredit</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Headphones size={12} color={Y.strong} />
            <Text style={s.caption}>Support</Text>
          </View>
        </View>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        

        <Pressable onPress={onAccount} style={s.pill} accessibilityLabel="Account menu">
          <Avatar profile={profile} size={28} />
          <Text style={s.pillName} numberOfLines={1}>{firstName}</Text>
          <ChevronDown size={14} color="#9ca3af" />
        </Pressable>
      </View>
    </View>
  );
}

export default function SupportLayout() {
  const nav = useNavigation();
  const insets = useSafeAreaInsets();
  const [profile, setProfile] = useState(null);
  const [openTickets, setOpenTickets] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [toast, setToast] = useState(null); // { kind, body, ticketId }

  const toastTimer = useRef(null);
  const openTicketRef = useRef(null); // TicketChat emits 'ticket_chat_open' with the ticket id while a chat is open
  const mounted = useRef(true);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('ticket_chat_open', (ticketId) => { openTicketRef.current = ticketId || null; });
    return () => sub.remove();
  }, []);

  // ─── open ticket count (the live queue)
  const fetchOpenTickets = useCallback(async () => {
    try {
      const { count, error } = await supabase
        .from('support_tickets')
        .select('id', { count: 'exact', head: true })
        .not('status', 'in', `(${CLOSED_STATUSES.join(',')})`);
      if (!error && count !== null && mounted.current) setOpenTickets(count);
    } catch (err) {
      console.error('Support ticket count error:', err);
    }
  }, []);

  // ─── access check (same rules as the web)
  useEffect(() => {
    mounted.current = true;
    const checkAccess = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!mounted.current) return;
      if (!user) return; // signed out: App.jsx sends you back to Login

      const { data: userProfile, error } = await supabase
        .from('user_profiles')
        .select('id, full_name, role, avatar_url')
        .eq('id', user.id)
        .single();
      if (!mounted.current) return;
      if (error || !userProfile) return; // App.jsx handles a missing profile like a signed-out user

      if (!ALLOWED_ROLES.includes(userProfile.role)) {
        Alert.alert('Access denied', 'You do not have permission to view this page.');
        nav.navigate(ROUTES.userApp);
        return;
      }

      setProfile(userProfile);
      setLoading(false);
    };
    checkAccess().catch((e) => console.error('Support access check failed:', e));
    return () => { mounted.current = false; };
  }, []);

  // ─── realtime (starts only after access is verified)
  const agentId = profile?.id;
  useEffect(() => {
    if (!agentId) return undefined;
    let recountTimer = null;
    const channels = [];
    const seenMessages = new Set();
    const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    const showToast = (t) => {
      setToast(t);
      if (toastTimer.current) clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => setToast(null), 5000);
    };
    // several ticket events can land together: recount once
    const scheduleRecount = () => {
      clearTimeout(recountTimer);
      recountTimer = setTimeout(() => {
        fetchOpenTickets();
        DeviceEventEmitter.emit('support_tickets_changed');
      }, 400);
    };

    fetchOpenTickets();

    // back from the background: sockets may have slept, so catch up
    const appSub = AppState.addEventListener('change', (state) => { if (state === 'active') scheduleRecount(); });

    // 1 · my profile (name / photo; losing the Support role sends you back to the user app)
    channels.push(
      supabase.channel(`support_profile_${agentId}_${suffix}`)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'user_profiles', filter: `id=eq.${agentId}` }, (payload) => {
          if (!payload.new) return;
          if (payload.new.role && !ALLOWED_ROLES.includes(payload.new.role)) {
            Alert.alert('Access denied', 'You do not have permission to view this page.');
            nav.navigate(ROUTES.userApp);
            return;
          }
          setProfile((prev) => ({ ...prev, ...payload.new }));
        })
        .subscribe(),
    );

    // 2 · tickets: count + new-ticket toast
    channels.push(
      supabase.channel(`support_tickets_${agentId}_${suffix}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'support_tickets' }, (payload) => {
          scheduleRecount();
          if (payload.eventType === 'INSERT' && payload.new && payload.new.user_id !== agentId) {
            showToast({ kind: 'ticket', body: payload.new.subject || 'A customer opened a ticket', ticketId: payload.new.id });
          }
        })
        .subscribe(),
    );

    // 3 · customer replies (RLS decides which messages this agent can see)
    channels.push(
      supabase.channel(`support_messages_${agentId}_${suffix}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, async (payload) => {
          const msg = payload.new;
          if (!msg?.ticket_id || msg.sender_id === agentId || msg.is_deleted) return;
          if (seenMessages.has(msg.id)) return;
          seenMessages.add(msg.id);

          DeviceEventEmitter.emit('support_ticket_message', msg); // open lists / chats can refresh themselves
          if (openTicketRef.current === msg.ticket_id) return;     // already reading this ticket

          const { data: t } = await supabase.from('support_tickets').select('user_id, subject, status').eq('id', msg.ticket_id).single();
          if (!t || t.user_id !== msg.sender_id) return;            // only the customer, not another agent
          if (CLOSED_STATUSES.includes(t.status)) return;
          if (mounted.current) showToast({ kind: 'reply', body: t.subject || 'New message on a ticket', ticketId: msg.ticket_id });
        })
        .subscribe(),
    );

    return () => {
      appSub.remove();
      clearTimeout(recountTimer);
      if (toastTimer.current) clearTimeout(toastTimer.current);
      channels.forEach((c) => supabase.removeChannel(c));
    };
  }, [agentId, fetchOpenTickets]);

  const handleSignOut = async () => {
    setIsMenuOpen(false);
    // 1. save to the logs first (same as the web)
    if (profile?.id) {
      try {
        await supabase.from('support_logs').insert([{
          support_id: profile.id,
          action_type: 'SYSTEM_LOGOUT',
          details: 'Logged out of the Support workspace.',
        }]);
      } catch (err) {
        console.error('Failed to log logout', err);
      }
    }
    // 2. end the session
    await supabase.auth.signOut(); // App.jsx sends you back to Login automatically
  };

  const handleToastPress = () => {
    const t = toast;
    setToast(null);
    if (t?.ticketId && routeExists(nav, ROUTES.ticketChat)) nav.navigate(ROUTES.ticketChat, { id: t.ticketId, ticketId: t.ticketId });
  };

  const badges = { tickets: openTickets };
  const roleLabel = profile?.role || 'Support';
  const look = toast ? TOAST_LOOK[toast.kind] : null;
  const ToastIcon = look?.Icon;

  if (loading) {
    return (
      <View style={s.loadingScreen}>
        <View style={s.loadingIcon}><Headphones size={24} color={Y.strong} /></View>
        <Text style={s.loadingTitle}>Opening support workspace</Text>
        <Text style={s.small}>Verifying support access…</Text>
        <ActivityIndicator color={Y.strong} style={{ marginTop: 16 }} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#faf9f6' }}>
      <Tab.Navigator
        // web refetches on every route change -> here: every time a tab is focused
        screenListeners={{ focus: () => fetchOpenTickets() }}
        screenOptions={{
          header: () => (
            <SupportTopBar profile={profile} openTickets={openTickets} onAccount={() => setIsMenuOpen(true)} />
          ),
          tabBarActiveTintColor: Y.strong,
          tabBarInactiveTintColor: '#9ca3af',
          tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
          tabBarAllowFontScaling: false,
          tabBarItemStyle: { paddingHorizontal: 0 },
          tabBarStyle: { borderTopColor: T.line },
          tabBarBadgeStyle: { backgroundColor: Y.main, color: '#111827', fontSize: 11, fontWeight: '700', minWidth: 18, height: 18, lineHeight: 17 },
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
                tabBarAccessibilityLabel: count > 0 ? `${label}, ${count} open` : label,
              }}
            />
          );
        })}
      </Tab.Navigator>

      {/* ── ACCOUNT (was the dropdown) */}
      <Modal visible={isMenuOpen} transparent animationType="slide" onRequestClose={() => setIsMenuOpen(false)}>
        <View style={{ flex: 1 }}>
          <Pressable style={s.overlay} onPress={() => setIsMenuOpen(false)} />
          <View style={[s.sheet, { paddingBottom: insets.bottom + 12 }]}>
            <View style={s.grabber} />
            <View style={s.sheetHead}>
              <Avatar profile={profile} size={52} />
              <View style={{ flex: 1 }}>
                <Text style={s.sheetName} numberOfLines={1}>{profile?.full_name || 'Support agent'}</Text>
                <Text style={[s.small, { textTransform: 'capitalize' }]}>{roleLabel}</Text>
              </View>
            </View>

            <Pressable style={s.menuRow} onPress={() => { setIsMenuOpen(false); nav.navigate(ROUTES.userApp); }}>
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

      {/* ── LIVE TOAST */}
      {toast && look && (
        <Pressable onPress={handleToastPress} style={[s.toast, { top: insets.top + 8 }]}>
          <View style={[s.toastIcon, { backgroundColor: look.bg }]}>
            <ToastIcon size={18} color={look.color} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: look.color }}>{look.badge}</Text>
            <Text style={{ fontSize: 14, fontWeight: '500', color: T.text, marginTop: 1, lineHeight: 19 }} numberOfLines={2}>{toast.body}</Text>
          </View>
          <Pressable onPress={() => setToast(null)} hitSlop={10}><X size={18} color={T.sub} /></Pressable>
        </Pressable>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  small: { fontSize: 13, color: T.sub },

  // loading
  loadingScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', paddingHorizontal: 32 },
  loadingIcon: { width: 52, height: 52, borderRadius: 16, backgroundColor: Y.soft, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  loadingTitle: { fontSize: 17, fontWeight: '700', color: T.text, letterSpacing: -0.2, marginBottom: 4 },

  // top bar (matches ModLayout / UserLayout)
  topBar: {
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb',
    paddingHorizontal: 16, paddingBottom: 10, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'space-between',
  },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  logo: { width: 32, height: 32 },
  brand: { fontSize: 19, fontWeight: '700', color: '#064e3b', letterSpacing: -0.3 },
  caption: { fontSize: 12, fontWeight: '700', color: Y.strong },
  pending: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 20, paddingHorizontal: 10, height: 36 },
  pendingOn: { backgroundColor: '#fffbeb', borderColor: '#fde68a' },
  pendingOff: { backgroundColor: '#ecfdf5', borderColor: '#a7f3d0' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  pendingText: { fontSize: 13, fontWeight: '700' },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: '#e5e7eb',
    borderRadius: 20, paddingLeft: 4, paddingRight: 10, paddingVertical: 4, backgroundColor: '#fff',
  },
  pillName: { maxWidth: 70, fontSize: 13, fontWeight: '600', color: '#1f2937' },

  // account sheet
  overlay: { flex: 1, backgroundColor: 'rgba(15,20,25,0.5)' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 8 },
  grabber: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: T.border, marginBottom: 6 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: T.line },
  sheetName: { fontSize: 17, fontWeight: '700', color: T.text, letterSpacing: -0.2 },
  menuRow: { height: 56, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: T.line },
  menuIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  menuLabel: { flex: 1, fontSize: 15, fontWeight: '600', color: T.text },

  // toast
  toast: {
    position: 'absolute', left: 12, right: 12, flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: T.line, padding: 12,
    shadowColor: '#0f1419', shadowOpacity: 0.14, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 8,
  },
  toastIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
});