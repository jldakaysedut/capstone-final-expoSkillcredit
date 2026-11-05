import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  View, Text, Pressable, ScrollView, Modal, RefreshControl, Animated, AppState, StyleSheet,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AlertTriangle, Bell, CalendarDays, CheckCheck, Globe, MessageCircle, Rocket, Scale, ShieldAlert,
  ShieldCheck, Star, Ticket, X, Shield, Coins, PlayCircle,
} from 'lucide-react-native';
import supabase from '../../supabaseClient';

// Compact X-style layout: hairline rows, 13px labels, 15px message text, bottom sheet for notices
const T = {
  text: '#0f1419', sub: '#536471', line: '#eff3f4', border: '#cfd9de', field: '#eff3f4',
  brand: '#047857', soft: '#ecfdf5', strip: '#f7f9f9', danger: '#e11d48',
};

// colour families (foreground / soft background / border) used by the type labels and the notice sheet
const TONES = {
  amber:   { fg: '#b45309', bg: '#fffbeb', bd: '#fde68a' },
  rose:    { fg: '#be123c', bg: '#fff1f2', bd: '#fecdd3' },
  red:     { fg: '#b91c1c', bg: '#fef2f2', bd: '#fecaca' },
  blue:    { fg: '#1d4ed8', bg: '#eff6ff', bd: '#bfdbfe' },
  indigo:  { fg: '#4338ca', bg: '#eef2ff', bd: '#c7d2fe' },
  emerald: { fg: '#047857', bg: '#ecfdf5', bd: '#a7f3d0' },
  teal:    { fg: '#0f766e', bg: '#f0fdfa', bd: '#99f6e4' },
  sky:     { fg: '#0369a1', bg: '#f0f9ff', bd: '#bae6fd' },
  purple:  { fg: '#7e22ce', bg: '#faf5ff', bd: '#e9d5ff' },
  gray:    { fg: '#374151', bg: '#f9fafb', bd: '#e5e7eb' },
};

const TYPE_META = {
  // ── Moderation & Safety ──
  account_warning:     { tone: 'amber',   icon: AlertTriangle, label: 'Conduct Warning', category: 'Moderation' },
  account_penalized:   { tone: 'rose',    icon: ShieldAlert,   label: 'Account Action',  category: 'Moderation' },
  report_updated:      { tone: 'blue',    icon: ShieldCheck,   label: 'Report Update',   category: 'Moderation' },
  report:              { tone: 'red',     icon: ShieldAlert,   label: 'Report Notice',   category: 'Moderation' },

  // ── System Admin Notices ──
  admin_role_notice:   { tone: 'indigo',  icon: Shield,        label: 'Role Update',     category: 'System' },
  admin_credit_notice: { tone: 'amber',   icon: Coins,         label: 'Balance Update',  category: 'System' },

  // ── Escrow Disputes & Sessions ──
  dispute_resolved:    { tone: 'emerald', icon: Scale,         label: 'Dispute Settled', category: 'Disputes' },
  dispute:             { tone: 'amber',   icon: Scale,         label: 'Dispute Alert',   category: 'Disputes' },
  session_disputed:    { tone: 'rose',    icon: AlertTriangle, label: 'Dispute Notice',  category: 'Disputes' },
  session_expired:     { tone: 'amber',   icon: AlertTriangle, label: 'Session Expired', category: 'Booking' },

  // ── Customer Support ──
  support_reply:       { tone: 'teal',    icon: MessageCircle, label: 'Support Desk',    category: 'Support' },
  ticket_updated:      { tone: 'teal',    icon: Ticket,        label: 'Ticket Update',   category: 'Support' },

  // ── Platform Engagements ──
  booking:             { tone: 'sky',     icon: CalendarDays,  label: 'Booking',         category: 'Booking' },
  session:             { tone: 'sky',     icon: CalendarDays,  label: 'Session',         category: 'Booking' },
  review:              { tone: 'amber',   icon: Star,          label: 'Review',          category: 'Review' },
  message:             { tone: 'emerald', icon: MessageCircle, label: 'Message',         category: 'Message' },
  community:           { tone: 'indigo',  icon: Globe,         label: 'Community',       category: 'Community' },
  community_like:      { tone: 'indigo',  icon: Globe,         label: 'Community',       category: 'Community' },
  community_comment:   { tone: 'indigo',  icon: Globe,         label: 'Community',       category: 'Community' },
  community_reply:     { tone: 'indigo',  icon: Globe,         label: 'Community Reply', category: 'Community' },
  system:              { tone: 'purple',  icon: Rocket,        label: 'System',          category: 'System' },
  system_alert:        { tone: 'amber',   icon: Coins,         label: 'Balance Update',  category: 'System' },

  // ── Session updates (mapped to the "Booking" category) ──
  booking_accepted:    { tone: 'indigo',  icon: CalendarDays,  label: 'Schedule Set',    category: 'Booking' },
  session_started:     { tone: 'sky',     icon: PlayCircle,    label: 'Started',         category: 'Booking' },
  session_update:      { tone: 'blue',    icon: CheckCheck,    label: 'Session Update',  category: 'Booking' },
  session_completed:   { tone: 'emerald', icon: CheckCheck,    label: 'Completed',       category: 'Booking' },
  session_cancelled:   { tone: 'gray',    icon: X,             label: 'Cancelled',       category: 'Booking' },
  new_rating:          { tone: 'amber',   icon: Star,          label: 'New Rating',      category: 'Review' },
};

const TYPE_TABS = ['All', 'Moderation', 'Disputes', 'Support', 'Booking', 'Message', 'Community', 'System'];
const GROUP_ORDER = ['Today', 'This Week', 'This Month', 'Earlier'];

// the notice sheet: what each notice type looks like (same cases as the web modal)
const NOTICE_DEFAULT = { Icon: AlertTriangle, tone: 'amber', badge: 'Formal Warning', title: 'Trust & Safety Notice', notesLabel: 'Moderator Investigation Notes & Rationale', NotesIcon: ShieldCheck, notesTone: 'emerald' };
const NOTICE_STYLES = {
  account_penalized:   { ...NOTICE_DEFAULT, Icon: ShieldAlert, tone: 'rose', badge: 'Disciplinary Penalty' },
  admin_role_notice:   { Icon: Shield, tone: 'indigo', badge: 'System Role Update', title: 'System Admin Notice', notesLabel: 'Administrator Remarks', NotesIcon: Shield, notesTone: 'indigo' },
  system:              { Icon: Shield, tone: 'indigo', badge: 'System Role Update', title: 'System Admin Notice', notesLabel: 'Administrator Remarks', NotesIcon: Shield, notesTone: 'indigo' },
  admin_credit_notice: { Icon: Coins, tone: 'amber', badge: 'Wallet Adjustment', title: 'System Admin Notice', notesLabel: 'Administrator Remarks', NotesIcon: Coins, notesTone: 'amber' },
  system_alert:        { Icon: Coins, tone: 'amber', badge: 'Wallet Adjustment', title: 'System Admin Notice', notesLabel: 'Administrator Remarks', NotesIcon: Coins, notesTone: 'amber' },
  report_updated:      { Icon: ShieldCheck, tone: 'blue', badge: 'Report Update', title: 'Trust & Safety Notice', notesLabel: 'Resolution Status', NotesIcon: ShieldCheck, notesTone: 'blue' },
  report:              { Icon: ShieldCheck, tone: 'blue', badge: 'Report Update', title: 'Trust & Safety Notice', notesLabel: 'Resolution Status', NotesIcon: ShieldCheck, notesTone: 'blue' },
  dispute_resolved:    { Icon: Scale, tone: 'emerald', badge: 'Escrow Verdict', title: 'Dispute Resolution Notice', notesLabel: 'Verdict Notes', NotesIcon: Scale, notesTone: 'emerald' },
};

// web "/messages?ticket=..&session=..&user=..&message=.." becomes route params
const buildMessageParams = (message) => {
  const params = {};
  if (message?.ticket_id) params.ticket = message.ticket_id;
  else if (message?.session_id) params.session = message.session_id;
  else if (message?.sender_id) params.user = message.sender_id;
  if (message?.id) params.message = message.id;
  return params;
};

const findLatestIncomingMessage = async (userId) => {
  if (!userId) return null;
  const columns = 'id, sender_id, receiver_id, session_id, ticket_id, created_at';
  const candidates = [];

  const { data: directMessage } = await supabase
    .from('messages')
    .select(columns)
    .eq('receiver_id', userId)
    .neq('sender_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (directMessage) candidates.push(directMessage);

  const { data: participantSessions } = await supabase
    .from('sessions')
    .select('id')
    .or(`student_id.eq.${userId},instructor_id.eq.${userId}`);
  const sessionIds = (participantSessions || []).map((session) => session.id).filter(Boolean);
  if (sessionIds.length) {
    const { data: sessionMessage } = await supabase
      .from('messages')
      .select(columns)
      .in('session_id', sessionIds)
      .neq('sender_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (sessionMessage) candidates.push(sessionMessage);
  }

  const { data: userTickets } = await supabase
    .from('support_tickets')
    .select('id')
    .eq('user_id', userId);
  const ticketIds = (userTickets || []).map((ticket) => ticket.id).filter(Boolean);
  if (ticketIds.length) {
    const { data: ticketMessage } = await supabase
      .from('messages')
      .select(columns)
      .in('ticket_id', ticketIds)
      .neq('sender_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (ticketMessage) candidates.push(ticketMessage);
  }

  return candidates.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0] || null;
};

// The bottom tabs live inside the 'User' navigator (see UserLayout), while this page is a root screen,
// so a tab has to be opened through 'User'. Everything else (SkillDetails, Profile, ...) is a root screen.
const TAB_SCREENS = ['Dashboard', 'Community', 'Sessions', 'Messages', 'Leaderboard'];
const goTo = (navigation, name, params) => {
  const target = name === 'Browse' ? 'Dashboard' : name; // the home tab is registered as Dashboard
  if (TAB_SCREENS.includes(target)) return navigation.navigate('User', { screen: target, params });
  return navigation.navigate(target, params);
};

const isInternalLink = (value) => typeof value === 'string' && value.startsWith('/') && !value.startsWith('//');

// open a web-style link ("/sessions?session=123", "/skill/9") on the mobile navigator
const LINK_ROUTES = {
  sessions: 'Sessions', messages: 'Messages', community: 'Community', profile: 'Profile',
  dashboard: 'Dashboard', 'my-listings': 'MyListings', 'create-skill': 'CreateSkill', leaderboard: 'Leaderboard',
};
const openLink = (navigation, url) => {
  const [pathPart, queryPart = ''] = String(url).split('#')[0].split('?');
  const query = {};
  queryPart.split('&').filter(Boolean).forEach((kv) => {
    const [k, v = ''] = kv.split('=');
    query[decodeURIComponent(k)] = decodeURIComponent(v);
  });
  const [root, arg] = pathPart.split('/').filter(Boolean);
  if (root === 'skill' && arg) return goTo(navigation, 'SkillDetails', { id: arg, ...query });
  if (root === 'user' && arg) return goTo(navigation, 'PublicProfile', { id: arg });
  if (LINK_ROUTES[root]) return goTo(navigation, LINK_ROUTES[root], query);
  return goTo(navigation, 'Dashboard');
};

function resolveMeta(type) {
  const normalized = type?.toLowerCase() || 'system';
  return TYPE_META[normalized] || TYPE_META.system;
}

function getCategory(type) {
  return resolveMeta(type).category;
}

function getGroup(createdAt) {
  const now = new Date();
  const diff = (now - new Date(createdAt)) / 86400000;
  if (diff < 1) return 'Today';
  if (diff < 7) return 'This Week';
  if (diff < 30) return 'This Month';
  return 'Earlier';
}

function timeAgo(createdAt) {
  const diff = (Date.now() - new Date(createdAt)) / 1000;
  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// ─── HELPER: EXTRACT MOD/ADMIN REMARKS ─────────────────────────────
function extractModeratorDetails(rawContent) {
  if (!rawContent) {
    return {
      summary: 'Action taken on your account regarding a system update.',
      remarks: 'No specific notes provided.',
    };
  }

  if (/moderator note:|investigation notes:|remarks:|admin note:/i.test(rawContent)) {
    const parts = rawContent.split(/moderator note:|investigation notes:|remarks:|admin note:/i);
    return {
      summary: parts[0].trim(),
      remarks: parts[1]?.trim() || rawContent,
    };
  }

  if (rawContent.includes('\n\n')) {
    const parts = rawContent.split('\n\n');
    return {
      summary: parts[0].trim(),
      remarks: parts.slice(1).join('\n\n').trim(),
    };
  }

  return {
    summary: rawContent.includes('resolved') || rawContent.includes('dispute') ? 'Escrow Resolution Notice' : 'System Notice',
    remarks: rawContent,
  };
}

function Skeleton({ style }) {
  const o = useRef(new Animated.Value(0.55)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(o, { toValue: 1, duration: 750, useNativeDriver: true }),
      Animated.timing(o, { toValue: 0.55, duration: 750, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [o]);
  return <Animated.View style={[{ backgroundColor: T.line, borderRadius: 6, opacity: o }, style]} />;
}

const NotificationsSkeleton = () => (
  <View style={{ flex: 1, backgroundColor: '#fff' }}>
    <View style={{ height: 44, justifyContent: 'center', paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: T.line }}>
      <Skeleton style={{ height: 14, width: 200 }} />
    </View>
    {[0, 1, 2, 3, 4].map((i) => (
      <View key={i} style={s.row}>
        <Skeleton style={{ width: 40, height: 40, borderRadius: 20 }} />
        <View style={{ flex: 1, gap: 8 }}>
          <Skeleton style={{ height: 12, width: '35%' }} />
          <Skeleton style={{ height: 14, width: '90%' }} />
          <Skeleton style={{ height: 14, width: '60%' }} />
        </View>
      </View>
    ))}
  </View>
);

// ─── MAIN COMPONENT ────────────────────────────────────────────────────────
export default function Notifications() {
  const navigation = useNavigation();
  const route = useRoute();
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [typeTab, setTypeTab] = useState(route.params?.tab || 'All');

  // sheet for Moderator & Admin action inspection
  const [activeNotice, setActiveNotice] = useState(null);

  useEffect(() => {
    if (route.params?.tab) {
      setTypeTab(route.params.tab);
    }
  }, [route.params?.tab]);

  const loadNotifications = useCallback(async (userId) => {
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    setNotifications(data || []);
  }, []);

  useEffect(() => {
    let disposed = false;
    let channel = null;
    const channelSuffix = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    const init = async () => {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (disposed) return;
      if (!user) { goTo(navigation, 'Login'); return; }
      setCurrentUserId(user.id);

      const { data } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (disposed) return;

      setNotifications(data || []);
      setLoading(false);

      channel = supabase.channel(`notifs_page_${user.id}_${channelSuffix}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
          (payload) => {
            if (payload.eventType === 'INSERT') {
              setNotifications((prev) => prev.some((item) => item.id === payload.new.id)
                ? prev
                : [payload.new, ...prev]);
            }
            if (payload.eventType === 'UPDATE') {
              setNotifications((prev) => prev.map((n) => n.id === payload.new.id ? payload.new : n));
            }
          },
        )
        .subscribe();
    };

    init().catch((error) => {
      console.error('Notifications initialization failed:', error);
      if (!disposed) setLoading(false);
    });

    return () => {
      disposed = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [navigation]);

  // phones go to the background: catch up when the app comes back
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => { if (st === 'active' && currentUserId) loadNotifications(currentUserId); });
    return () => sub.remove();
  }, [currentUserId, loadNotifications]);

  const onRefresh = async () => {
    if (!currentUserId) return;
    setRefreshing(true);
    await loadNotifications(currentUserId);
    setRefreshing(false);
  };

  // ─── SMART REDIRECTION LOGIC ───
  const handleClick = async (notif) => {
    if (!notif.is_read) {
      setNotifications((prev) => prev.map((n) => n.id === notif.id ? { ...n, is_read: true } : n));
      // wrapped in Promise.resolve so a failed update is caught whichever supabase-js version is installed
      Promise.resolve(supabase.from('notifications').update({ is_read: true }).eq('id', notif.id)).catch((err) => console.error('Mark read failed:', err));
    }

    const type = notif.type?.toLowerCase() || '';

    try {
      // ── SHEET TRIGGER FOR ALL REPORTS AND DISPUTES ──
      const modalNoticeTypes = ['account_warning', 'account_penalized', 'admin_role_notice', 'admin_credit_notice', 'report_updated', 'report', 'dispute_resolved', 'system', 'system_alert'];
      if (modalNoticeTypes.includes(type)) {
        setActiveNotice(notif);
        return;
      }

      if (type === 'message') {
        if (isInternalLink(notif.link_url)) {
          openLink(navigation, notif.link_url);
        } else {
          const latestMsg = await findLatestIncomingMessage(currentUserId);
          goTo(navigation, 'Messages', latestMsg ? buildMessageParams(latestMsg) : undefined);
        }
        return;
      }
      if (['community', 'community_like', 'community_comment', 'community_reply'].includes(type)) {
        if (isInternalLink(notif.link_url)) openLink(navigation, notif.link_url);
        else goTo(navigation, 'Community');
        return;
      }

      if (type === 'support_reply' || type === 'ticket_updated') {
        const { data: ticket } = await supabase
          .from('support_tickets')
          .select('id')
          .eq('user_id', currentUserId)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (ticket) {
          goTo(navigation, 'Messages', { ticket: ticket.id });
        } else {
          goTo(navigation, 'Messages');
        }
      }
      else if (type === 'session_disputed' || type === 'dispute') {
        goTo(navigation, 'Sessions', { tab: 'Disputed' });
      }
      else if (type === 'session_expired') {
        goTo(navigation, 'Sessions', { tab: 'Pending' });
      }
      // the newer types (session_started, booking_accepted, ...) skip these branches and fall to the
      // else below, which uses the exact link_url so the target page can auto-highlight
      else if (type === 'booking' || type === 'session') {
        goTo(navigation, 'Sessions');
      }
      else if (type === 'review') {
        goTo(navigation, 'Profile');
      }
      else {
        if (isInternalLink(notif.link_url)) openLink(navigation, notif.link_url);
        else goTo(navigation, 'Dashboard');
      }
    } catch (error) {
      console.error('Error during notification routing:', error);
      if (isInternalLink(notif.link_url)) openLink(navigation, notif.link_url);
      else goTo(navigation, 'Dashboard');
    }
  };

  const handleMarkAllRead = async () => {
    const unreadIds = notifications.filter((n) => !n.is_read).map((n) => n.id);
    if (!unreadIds.length) return;
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    await supabase.from('notifications').update({ is_read: true }).in('id', unreadIds);
  };

  const filtered = useMemo(() => {
    if (typeTab === 'All') return notifications;
    return notifications.filter((n) => getCategory(n.type) === typeTab);
  }, [notifications, typeTab]);

  const grouped = useMemo(() => {
    const g = GROUP_ORDER.reduce((acc, k) => ({ ...acc, [k]: [] }), {});
    filtered.forEach((n) => {
      const key = getGroup(n.created_at);
      if (g[key]) g[key].push(n);
    });
    return g;
  }, [filtered]);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const tabCounts = useMemo(() => {
    return TYPE_TABS.reduce((acc, tab) => {
      acc[tab] = tab === 'All'
        ? notifications.length
        : notifications.filter((n) => getCategory(n.type) === tab).length;
      return acc;
    }, {});
  }, [notifications]);

  if (loading) {
    return <NotificationsSkeleton />;
  }

  // ─── NOTICE SHEET CONTENT ───
  const parsedNotice = activeNotice ? extractModeratorDetails(activeNotice.content) : null;
  const notice = activeNotice ? (NOTICE_STYLES[activeNotice.type] || NOTICE_DEFAULT) : NOTICE_DEFAULT;
  const noticeTone = TONES[notice.tone];
  const notesTone = TONES[notice.notesTone];
  const NoticeIcon = notice.Icon;
  const NotesIcon = notice.NotesIcon;

  // dynamic button label for session vs community links
  const getButtonLabel = (url) => {
    if (url && url.includes('session')) return 'View session record';
    return 'View reported content';
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <ScrollView
        stickyHeaderIndices={[1]}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 140 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={T.brand} colors={[T.brand]} />}
      >
        {/* 0 · unread + mark all read */}
        <View style={s.summary}>
          <Text style={s.summaryText}>
            {unreadCount > 0 ? <><Text style={s.summaryNum}>{unreadCount}</Text> unread</> : 'All caught up'}
          </Text>
          {unreadCount > 0 && (
            <Pressable onPress={handleMarkAllRead} hitSlop={8} style={s.markAll}>
              <CheckCheck size={16} color={T.brand} strokeWidth={2} />
              <Text style={s.markAllText}>Mark all read</Text>
            </Pressable>
          )}
        </View>

        {/* 1 · sticky category tabs */}
        <View style={s.top}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tabsRow}>
            {TYPE_TABS.map((tab) => {
              const on = typeTab === tab;
              return (
                <Pressable key={tab} onPress={() => setTypeTab(tab)} style={s.tab}>
                  <View style={s.tabInner}>
                    <Text style={[s.tabText, on && s.tabTextOn]}>{tab}</Text>
                    <Text style={[s.tabCount, on && { color: T.text }]}>{tabCounts[tab] || 0}</Text>
                  </View>
                  <View style={[s.tabBar, on && { backgroundColor: T.brand }]} />
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {/* 2 · feed */}
        {filtered.length === 0 ? (
          <View style={s.empty}>
            <Bell size={40} color={T.border} strokeWidth={1.5} />
            <Text style={s.emptyTitle}>All caught up</Text>
            <Text style={s.emptySub}>No notifications under this category.</Text>
          </View>
        ) : (
          GROUP_ORDER.filter((g) => grouped[g]?.length > 0).map((group) => (
            <View key={group}>
              <View style={s.groupHead}>
                <Text style={s.groupTitle}>{group}</Text>
                <Text style={s.groupCount}>{grouped[group].length}</Text>
              </View>

              {grouped[group].map((notif) => {
                const meta = resolveMeta(notif.type);
                const tone = TONES[meta.tone];
                const NotificationIcon = meta.icon;
                const isUnread = !notif.is_read;
                const isHighPriority = notif.type === 'account_warning' || notif.type === 'account_penalized';
                const accent = isHighPriority ? '#f43f5e' : T.brand;

                return (
                  <Pressable
                    key={notif.id}
                    onPress={() => handleClick(notif)}
                    style={({ pressed }) => [
                      s.row,
                      { borderLeftWidth: 3, borderLeftColor: isUnread ? accent : 'transparent', paddingLeft: 13 },
                      pressed && { backgroundColor: T.strip },
                    ]}
                  >
                    <View style={[s.iconBubble, { backgroundColor: tone.bg }]}>
                      <NotificationIcon size={20} color={tone.fg} strokeWidth={1.8} />
                    </View>

                    <View style={{ flex: 1 }}>
                      <View style={s.rowHead}>
                        <Text style={[s.label, { color: tone.fg }]} numberOfLines={1}>{meta.label}</Text>
                        {isUnread && <View style={[s.unreadDot, { backgroundColor: accent }]} />}
                        <View style={{ flex: 1 }} />
                        <Text style={s.time}>{timeAgo(notif.created_at)}</Text>
                      </View>
                      <Text style={[s.content, isUnread ? s.contentUnread : s.contentRead]}>{notif.content}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ))
        )}
      </ScrollView>

      {/* ══ MODERATOR / ADMIN ACTION & NOTES SHEET ══ */}
      <Modal visible={!!activeNotice && !!parsedNotice} transparent animationType="slide" onRequestClose={() => setActiveNotice(null)} statusBarTranslucent>
        <View style={{ flex: 1, justifyContent: 'flex-end' }}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setActiveNotice(null)}><View style={s.overlay} /></Pressable>
          {activeNotice && parsedNotice && (
            <View style={[s.sheet, { paddingBottom: insets.bottom + 16 }]}>
              <View style={s.grabber} />

              <View style={s.sheetHeader}>
                <View style={[s.sheetIcon, { backgroundColor: noticeTone.bg }]}>
                  <NoticeIcon size={22} color={noticeTone.fg} strokeWidth={1.8} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={[s.badge, { backgroundColor: noticeTone.bg, borderColor: noticeTone.bd }]}>
                    <Text style={[s.badgeText, { color: noticeTone.fg }]}>{notice.badge}</Text>
                  </View>
                  <Text style={s.sheetTitle} numberOfLines={2}>{notice.title}</Text>
                </View>
                <Pressable onPress={() => setActiveNotice(null)} hitSlop={10} style={s.closeBtn}><X size={18} color={T.text} /></Pressable>
              </View>

              <ScrollView style={{ maxHeight: 440 }} contentContainerStyle={{ padding: 16 }}>
                <Text style={s.sectionLabel}>Notice summary</Text>
                <View style={s.summaryBox}>
                  <Text style={s.boxText}>{parsedNotice.summary}</Text>
                </View>

                <View style={s.notesLabelRow}>
                  <NotesIcon size={15} color={notesTone.fg} strokeWidth={1.8} />
                  <Text style={[s.sectionLabel, { marginBottom: 0, color: T.text }]}>{notice.notesLabel}</Text>
                </View>
                <View style={[s.notesBox, { backgroundColor: notesTone.bg, borderColor: notesTone.bd }]}>
                  <Text style={[s.boxText, { color: notesTone.fg }]}>"{parsedNotice.remarks}"</Text>
                </View>

                <View style={s.metaRow}>
                  <Text style={s.metaText}>Date: {new Date(activeNotice.created_at).toLocaleDateString()}</Text>
                  <Text style={s.metaText}>Ref: #{String(activeNotice.id).split('-')[0]}</Text>
                </View>

                <View style={s.policy}>
                  <Bell size={15} color={T.sub} strokeWidth={1.8} style={{ marginTop: 1 }} />
                  <Text style={s.policyText}>
                    SkillCredit strictly adheres to platform rules. System modifications are tracked and recorded for security purposes.
                  </Text>
                </View>
              </ScrollView>

              <View style={s.sheetBtns}>
                {activeNotice.link_url && activeNotice.link_url !== '/notifications' ? (
                  <Pressable
                    onPress={() => {
                      const link = activeNotice.link_url;
                      setActiveNotice(null);
                      setTimeout(() => openLink(navigation, link), 250);
                    }}
                    style={s.btnOutline}
                  >
                    <Text style={s.btnOutlineText}>{getButtonLabel(activeNotice.link_url)}</Text>
                  </Pressable>
                ) : activeNotice.content.includes('removed by the moderation team') ? (
                  <View style={[s.btnOutline, { backgroundColor: T.strip }]}>
                    <Text style={[s.btnOutlineText, { color: T.sub }]}>Content deleted by moderators</Text>
                  </View>
                ) : null}

                <Pressable onPress={() => setActiveNotice(null)} style={s.btnDark}>
                  <Text style={s.btnDarkText}>I acknowledge and understand</Text>
                </Pressable>
              </View>
            </View>
          )}
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  // summary
  summary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, height: 48, backgroundColor: '#fff' },
  summaryText: { fontSize: 14, color: T.sub },
  summaryNum: { fontSize: 14, fontWeight: '700', color: T.text },
  markAll: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  markAllText: { fontSize: 14, fontWeight: '600', color: T.brand },

  // sticky tabs (column container; the tab row is a ScrollView inside)
  top: { backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: T.line, borderBottomWidth: 1, borderBottomColor: T.line },
  tabsRow: { paddingHorizontal: 16, gap: 24 },
  tab: { height: 44, justifyContent: 'center' },
  tabInner: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tabText: { fontSize: 15, fontWeight: '600', color: T.sub },
  tabTextOn: { fontWeight: '700', color: T.text },
  tabCount: { fontSize: 13, color: T.sub },
  tabBar: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 3, borderRadius: 2, backgroundColor: 'transparent' },

  // groups + rows
  groupHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, height: 34, backgroundColor: T.strip, borderBottomWidth: 1, borderBottomColor: T.line },
  groupTitle: { fontSize: 13, fontWeight: '700', color: T.sub },
  groupCount: { fontSize: 13, color: T.sub },
  row: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: T.line, backgroundColor: '#fff' },
  iconBubble: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  label: { flexShrink: 1, fontSize: 13, fontWeight: '700' },
  unreadDot: { width: 8, height: 8, borderRadius: 4 },
  time: { fontSize: 13, color: T.sub },
  content: { fontSize: 15, lineHeight: 21, marginTop: 2 },
  contentUnread: { fontWeight: '600', color: T.text },
  contentRead: { fontWeight: '400', color: T.sub },

  // empty
  empty: { alignItems: 'center', paddingVertical: 80, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: T.text, marginTop: 12 },
  emptySub: { fontSize: 14, color: T.sub, marginTop: 4, textAlign: 'center' },

  // notice sheet
  overlay: { flex: 1, backgroundColor: 'rgba(15,20,25,0.5)' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  grabber: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: T.border, marginTop: 8 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: T.line },
  sheetIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, borderWidth: 1 },
  badgeText: { fontSize: 12, fontWeight: '700' },
  sheetTitle: { fontSize: 17, fontWeight: '700', color: T.text, letterSpacing: -0.2, marginTop: 4 },
  closeBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  sectionLabel: { fontSize: 13, fontWeight: '600', color: T.sub, marginBottom: 8 },
  summaryBox: { backgroundColor: T.strip, borderWidth: 1, borderColor: T.line, borderRadius: 12, padding: 14 },
  boxText: { fontSize: 14, lineHeight: 21, fontWeight: '500', color: T.text },
  notesLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 16, marginBottom: 8 },
  notesBox: { borderWidth: 1, borderRadius: 12, padding: 14 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12, paddingHorizontal: 2 },
  metaText: { fontSize: 12, color: T.sub },
  policy: { flexDirection: 'row', gap: 8, marginTop: 16, padding: 12, borderRadius: 12, backgroundColor: T.strip },
  policyText: { flex: 1, fontSize: 13, lineHeight: 19, color: T.sub },
  sheetBtns: { gap: 8, paddingHorizontal: 16, paddingTop: 4 },
  btnOutline: { height: 46, borderRadius: 23, borderWidth: 1, borderColor: T.border, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  btnOutlineText: { fontSize: 15, fontWeight: '700', color: T.text },
  btnDark: { height: 46, borderRadius: 23, backgroundColor: T.text, alignItems: 'center', justifyContent: 'center' },
  btnDarkText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});