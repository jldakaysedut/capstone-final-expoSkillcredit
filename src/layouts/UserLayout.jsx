import { Alert } from '../components/SkillCreditAlert';
import { useState, useEffect, useRef, useMemo } from 'react';
import {
  Modal, Animated, PanResponder, AppState, DeviceEventEmitter, Platform, useWindowDimensions, StyleSheet, StatusBar
} from 'react-native';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { AlertTriangle, ArrowRight, Bell, BellRing, Moon, Sun, CalendarDays, CheckCheck, ChevronRight, Coins, Compass, CreditCard, Globe, GripVertical, ImagePlus, LayoutList, LifeBuoy, LogOut, MessageCircle, MessageSquare, Paperclip, PlayCircle, Scale, Settings, Shield, ShieldAlert, ShieldCheck, Star, Trophy, User, X } from '../components/premium/PremiumThemeIcons';
import supabase from '../supabaseClient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useUserTheme } from '../components/premium/PremiumTheme';
import { View, Text, Image, Pressable, ScrollView, TextInput, KeyboardAvoidingView, ActivityIndicator, useThemeStyle } from '../components/premium/PremiumThemePrimitives';
import { prefersReducedMotion } from '../components/premium/PremiumVisual';

// the five bottom tabs (were the desktop nav links) -- adjust these paths to where your pages live
import UserDashboard from '../pages/user/UserDashboard';
import Community from '../pages/user/Community';
import Sessions from '../pages/user/Sessions';
import Messages from '../pages/user/Messages';
import Leaderboard from '../pages/user/Leaderboard';

// ────────────────────────────────────────────────────────────────
// USER LAYOUT: app shell. Top bar + bottom tabs + notification/profile sheets,
// live toast, and the draggable Support button. X-style, same tokens as the pages.
// ────────────────────────────────────────────────────────────────

const T = {
  text: '#0f1419', sub: '#536471', line: '#eff3f4', border: '#cfd9de', field: '#eff3f4',
  brand: '#047857', soft: '#ecfdf5', strip: '#f7f9f9', danger: '#e11d48',
};

const TONES = {
  amber:   { fg: '#b45309', bg: '#fffbeb', bd: '#fde68a' },
  rose:    { fg: '#be123c', bg: '#fff1f2', bd: '#fecdd3' },
  blue:    { fg: '#1d4ed8', bg: '#eff6ff', bd: '#bfdbfe' },
  indigo:  { fg: '#4338ca', bg: '#eef2ff', bd: '#c7d2fe' },
  emerald: { fg: '#047857', bg: '#ecfdf5', bd: '#a7f3d0' },
  teal:    { fg: '#0f766e', bg: '#f0fdfa', bd: '#99f6e4' },
  sky:     { fg: '#0369a1', bg: '#f0f9ff', bd: '#bae6fd' },
  gray:    { fg: '#374151', bg: '#f9fafb', bd: '#e5e7eb' },
};

const IMAGES = ['images'];
const uid = () => `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

const getNotificationMeta = (type) => {
  switch (type) {
    case 'account_warning':     return { Icon: AlertTriangle, tone: 'amber',   badge: 'Warning' };
    case 'account_penalized':   return { Icon: ShieldAlert,   tone: 'rose',    badge: 'Account Notice' };
    case 'admin_role_notice':   return { Icon: Shield,        tone: 'indigo',  badge: 'Role Update' };
    case 'admin_credit_notice': return { Icon: Coins,         tone: 'amber',   badge: 'Credit Update' };
    case 'dispute_resolved':    return { Icon: Scale,         tone: 'emerald', badge: 'Dispute Settled' };
    case 'session_disputed':
    case 'dispute':
    case 'session_expired':     return { Icon: AlertTriangle, tone: 'rose',    badge: 'Session Notice' };
    case 'message':             return { Icon: MessageCircle, tone: 'emerald', badge: 'Message' };
    case 'community':
    case 'community_like':
    case 'community_comment':
    case 'community_reply':     return { Icon: Globe,         tone: 'indigo',  badge: 'Community' };
    case 'report_updated':      return { Icon: ShieldCheck,   tone: 'blue',    badge: 'Report Update' };
    case 'support_reply':
    case 'ticket_updated':      return { Icon: MessageSquare, tone: 'teal',    badge: 'Support Desk' };

    // ── SESSION UPDATES ──
    case 'booking_accepted':    return { Icon: CalendarDays,  tone: 'indigo',  badge: 'Schedule Confirmed' };
    case 'session_started':     return { Icon: PlayCircle,    tone: 'sky',     badge: 'Session Started' };
    case 'session_update':
    case 'session_completed':   return { Icon: CheckCheck,    tone: 'emerald', badge: type === 'session_completed' ? 'Completed' : 'Session Update' };
    case 'session_cancelled':   return { Icon: AlertTriangle, tone: 'gray',    badge: 'Cancelled' };
    case 'session_reminder_1h': return { Icon: CalendarDays,  tone: 'emerald', badge: 'Session Reminder' };
    case 'daily_reward':        return { Icon: Coins,         tone: 'amber',   badge: 'Daily Reward' };
    case 'new_rating':          return { Icon: Star,          tone: 'amber',   badge: 'New Rating' };

    default:                    return { Icon: BellRing,      tone: 'gray',    badge: 'Notice' };
  }
};

// profile menu: web paths became route names
const PROFILE_LINKS = [
  { route: 'Profile',       label: 'View Profile',  Icon: User,       color: '#0ea5e9' },
  { route: 'Notifications', label: 'Notifications', Icon: Bell,       color: '#f59e0b', badge: true },
  { route: 'MyListings',    label: 'My Listings',   Icon: LayoutList, color: '#6366f1' },
  { route: 'Payments',   label: 'Wallet',       Icon: CreditCard, color: '#10b981' },
  { route: 'Settings',   label: 'Settings',     Icon: Settings,   color: '#8b5cf6' },
];

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

const isInternalLink = (value) => typeof value === 'string' && value.startsWith('/') && !value.startsWith('//');

// open a web-style link ("/sessions?session=123", "/skill/9") on the mobile navigator
const LINK_ROUTES = {
  dashboard: 'Dashboard', community: 'Community', sessions: 'Sessions', messages: 'Messages', leaderboard: 'Leaderboard',
  profile: 'Profile', 'my-listings': 'MyListings', payments: 'Payments', settings: 'Settings',
  notifications: 'Notifications', 'create-skill': 'CreateSkill',
};
const USER_TAB_ROUTES = ['Dashboard', 'Community', 'Sessions', 'Messages', 'Leaderboard'];
const navigateFromUserLayout = (navigation, name, params) => {
  const target = name === 'Browse' ? 'Dashboard' : name;
  if (USER_TAB_ROUTES.includes(target)) {
    return navigation.navigate('User', { screen: target, params });
  }
  return navigation.navigate(target, params);
};
const openLink = (navigation, url) => {
  const [pathPart, queryPart = ''] = String(url).split('?');
  const query = {};
  queryPart.split('&').filter(Boolean).forEach((kv) => {
    const [k, v = ''] = kv.split('=');
    query[decodeURIComponent(k)] = decodeURIComponent(v);
  });
  const [root, arg] = pathPart.split('/').filter(Boolean);
  if (root === 'skill' && arg) return navigation.navigate('SkillDetails', { id: arg, ...query });
  if (root === 'user' && arg) return navigation.navigate('PublicProfile', { id: arg });
  if (LINK_ROUTES[root]) return navigateFromUserLayout(navigation, LINK_ROUTES[root], query);
  return navigation.navigate('Notifications');
};

// ── small UI pieces ──
const Avatar = ({ uri, name, size }) => (
  <View style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden', backgroundColor: '#d1fae5', alignItems: 'center', justifyContent: 'center' }}>
    {uri ? <Image source={{ uri }} style={{ width: '100%', height: '100%' }} />
      : <Text style={{ fontWeight: '700', color: '#065f46', fontSize: size * 0.42 }}>{name?.charAt(0)?.toUpperCase() || '?'}</Text>}
  </View>
);

function Sheet({ visible, onClose, title, subtitle, right, children }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView style={{ flex: 1, justifyContent: 'flex-end' }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose}><View style={s.overlay} /></Pressable>
        <View style={[s.sheet, { paddingBottom: insets.bottom + 12 }]}>
          <View style={s.grabber} />
          {!!title && (
            <View style={s.sheetHeader}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={s.sheetTitle}>{title}</Text>
                  {right}
                </View>
                {!!subtitle && <Text style={s.sheetSub}>{subtitle}</Text>}
              </View>
              <Pressable onPress={onClose} hitSlop={10} style={s.closeBtn}><X size={18} color={T.text} /></Pressable>
            </View>
          )}
          {children}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ────────────────────── SUPPORT: draggable button + ticket form
const SUBJECTS = ['General Inquiry', 'Billing / Credits Issue', 'Report a Bug', 'Account Recovery', 'Other'];
const BTN_W = 48;
const BTN_H = 48;

const FloatingHelpButton = ({ bottomOffset }) => {
  const themedFab = useThemeStyle(s.fab);
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [isOpen, setIsOpen] = useState(false);
  const [subject, setSubject] = useState('General Inquiry');
  const [message, setMessage] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // drag: offset from the default bottom-right spot, clamped to the screen
  const pan = useRef(new Animated.ValueXY()).current;
  const last = useRef({ x: 0, y: 0 });
  const moved = useRef(false);
  const bounds = useRef({});
  bounds.current = {
    minX: -(width - BTN_W - 32), maxX: 0,
    minY: -(height - bottomOffset - BTN_H - insets.top - 64), maxY: bottomOffset - 8,
  };
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: () => { moved.current = false; pan.setOffset(last.current); pan.setValue({ x: 0, y: 0 }); },
    onPanResponderMove: (_, g) => {
      if (Math.abs(g.dx) > 4 || Math.abs(g.dy) > 4) moved.current = true;
      const b = bounds.current;
      pan.setValue({ x: clamp(last.current.x + g.dx, b.minX, b.maxX) - last.current.x, y: clamp(last.current.y + g.dy, b.minY, b.maxY) - last.current.y });
    },
    onPanResponderRelease: (_, g) => {
      const b = bounds.current;
      last.current = { x: clamp(last.current.x + g.dx, b.minX, b.maxX), y: clamp(last.current.y + g.dy, b.minY, b.maxY) };
      pan.setOffset(last.current);
      pan.setValue({ x: 0, y: 0 });
      if (!moved.current) setIsOpen(true);   // a tap, not a drag
    },
  }), [pan]);

  const acceptFile = (file) => {
    if (file.size && file.size > 5 * 1024 * 1024) {
      Alert.alert('File too large', 'File too large. Maximum size is 5MB.');
      return;
    }
    setSelectedFile(file);
  };
  const pickImage = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: IMAGES, quality: 0.8 });
    if (r.canceled) return;
    const a = r.assets[0];
    acceptFile({ uri: a.uri, name: a.fileName || `screenshot_${Date.now()}.jpg`, size: a.fileSize, mimeType: a.mimeType || 'image/jpeg', isImage: true });
  };
  const pickPdf = async () => {
    const r = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true });
    if (r.canceled) return;
    const a = r.assets[0];
    acceptFile({ uri: a.uri, name: a.name, size: a.size, mimeType: a.mimeType || 'application/pdf', isImage: false });
  };
  const chooseFile = () => Alert.alert('Add attachment', 'Screenshot or PDF (up to 5 MB)', [
    { text: 'Photo library', onPress: pickImage },
    { text: 'PDF file', onPress: pickPdf },
    { text: 'Cancel', style: 'cancel' },
  ]);

  const handleClose = () => {
    if (!isSubmitting) {
      setIsOpen(false);
      setSelectedFile(null);
    }
  };

  const handleSubmit = async () => {
    if (!message.trim() && !selectedFile) return;
    setIsSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not logged in');

      const { data: ticket, error: ticketError } = await supabase
        .from('support_tickets')
        .insert([{ user_id: user.id, subject, message }])
        .select()
        .single();
      if (ticketError) throw ticketError;

      let uploadedFileUrl = null;
      let fileType = null;

      if (selectedFile) {
        const fileExt = selectedFile.name.split('.').pop();
        const fileName = `${uid()}.${fileExt}`;
        const filePath = `${user.id}/${fileName}`;
        const buf = await (await fetch(selectedFile.uri)).arrayBuffer();
        if (!buf || buf.byteLength === 0) throw new Error('Could not read the selected file.');
        const { error: uploadError } = await supabase.storage.from('chat-attachments').upload(filePath, buf, { contentType: selectedFile.mimeType });
        if (uploadError) throw uploadError;
        const { data: { publicUrl } } = supabase.storage.from('chat-attachments').getPublicUrl(filePath);
        uploadedFileUrl = publicUrl;
        fileType = selectedFile.mimeType;
      }

      const { error: msgError } = await supabase.from('messages').insert([{
        ticket_id: ticket.id,
        sender_id: user.id,
        content: message,
        file_url: uploadedFileUrl,
        file_type: fileType,
        is_deleted: false,
      }]);
      if (msgError) throw msgError;

      Alert.alert('Ticket submitted', 'Ticket submitted successfully! Support will respond shortly.');
      setIsOpen(false);
      setMessage('');
      setSubject('General Inquiry');
      setSelectedFile(null);
    } catch (error) {
      console.error(error);
      Alert.alert('Not sent', error?.message ? `Failed to submit ticket. ${error.message}` : 'Failed to submit ticket. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const canSubmit = !isSubmitting && (!!message.trim() || !!selectedFile);

  return (
    <>
      <Animated.View
        {...responder.panHandlers}
        style={[themedFab, { bottom: bottomOffset, transform: pan.getTranslateTransform() }]}
        accessibilityLabel="Drag support button to move, or tap to contact support"
      >
        <LifeBuoy size={24} color={T.brand} strokeWidth={1.8} />
      </Animated.View>

      <Sheet visible={isOpen} onClose={handleClose} title="Contact support" subtitle="Tell us what happened and we'll get back to you.">
        <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 460 }} contentContainerStyle={{ padding: 16 }}>
          <Text style={s.fieldLabel}>What do you need help with?</Text>
          <View style={s.chipWrap}>
            {SUBJECTS.map((x) => (
              <Pressable key={x} onPress={() => setSubject(x)} style={[s.chip, subject === x && s.chipOn]}>
                <Text style={[s.chipText, subject === x && { color: '#fff' }]}>{x}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={[s.fieldLabel, { marginTop: 18 }]}>Message <Text style={s.fieldHint}>(optional if attaching a file)</Text></Text>
          <TextInput
            value={message}
            onChangeText={setMessage}
            multiline
            placeholder="Describe the issue and any steps that led to it…"
            placeholderTextColor="#8b98a5"
            style={s.textarea}
          />

          <View style={[s.fieldRow, { marginTop: 18 }]}>
            <Text style={s.fieldLabel}>Screenshot or file <Text style={s.fieldHint}>(optional)</Text></Text>
            <Text style={s.fieldHint}>Up to 5 MB</Text>
          </View>
          {selectedFile ? (
            <View style={s.fileCard}>
              {selectedFile.isImage
                ? <Image source={{ uri: selectedFile.uri }} style={s.filePreview} resizeMode="contain" />
                : (
                  <View style={s.docRow}>
                    <View style={s.docIcon}><Paperclip size={18} color={T.brand} strokeWidth={1.8} /></View>
                    <Text style={s.docLabel}>Document attached</Text>
                  </View>
                )}
              <View style={s.fileMeta}>
                <View style={{ flex: 1 }}>
                  <Text style={s.fileName} numberOfLines={1}>{selectedFile.name}</Text>
                  {!!selectedFile.size && <Text style={s.fileSize}>{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</Text>}
                </View>
                <Pressable onPress={chooseFile} hitSlop={8}><Text style={s.replace}>Replace</Text></Pressable>
                <Pressable onPress={() => setSelectedFile(null)} hitSlop={10} style={{ padding: 4 }}><X size={18} color={T.sub} /></Pressable>
              </View>
            </View>
          ) : (
            <Pressable onPress={chooseFile} style={s.dropzone}>
              <ImagePlus size={22} color={T.sub} strokeWidth={1.8} />
              <Text style={s.dropTitle}>Add a screenshot or PDF</Text>
              <Text style={s.fieldHint}>PNG, JPG, WEBP, or PDF</Text>
            </Pressable>
          )}
        </ScrollView>

        <View style={s.formBtns}>
          <Pressable onPress={handleClose} disabled={isSubmitting} style={[s.btn, s.btnSoft]}><Text style={[s.btnText, { color: T.text }]}>Cancel</Text></Pressable>
          <Pressable onPress={handleSubmit} disabled={!canSubmit} style={[s.btn, !canSubmit && { opacity: 0.5 }]}>
            {isSubmitting ? <ActivityIndicator color="#fff" /> : (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={s.btnText}>Submit ticket</Text>
                <ArrowRight size={16} color="#fff" strokeWidth={2} />
              </View>
            )}
          </Pressable>
        </View>
      </Sheet>
    </>
  );
};

// ────────────────────── TOP BAR (replaces the web navbar)
function TopBar({ profile, unreadCount, onBrand, onProfile, onCredits }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[s.topBar, { paddingTop: insets.top }]}>
      <View style={s.topRow}>
        {/* logo: swap the text for <Image source={require('../../assets/logo.png')} /> if you have one */}
        <Pressable onPress={onBrand} hitSlop={8} style={s.leftGroup} accessibilityLabel="Go to Browse">
          <Text style={s.brand} numberOfLines={1}>SkillCredit</Text>
        </Pressable>

        <View style={s.rightGroup}>
          <Pressable onPress={onCredits} style={s.credits} accessibilityLabel="View wallet">
            <Coins size={14} color="#f59e0b" strokeWidth={2} />
            <Text style={s.creditsText} numberOfLines={1}>{profile.credits_balance || 0} CR</Text>
          </Pressable>
          <Pressable onPress={onProfile} hitSlop={6} accessibilityLabel="Open profile menu">
            <Avatar uri={profile.avatar_url} name={profile.full_name} size={32} />
            {unreadCount > 0 && <View style={s.avatarDot} />}
          </Pressable>
        </View>
      </View>
    </View>
  );
}

// ────────────────────── MAIN LAYOUT
const Tab = createBottomTabNavigator();

// Native focus transition for the five existing tab routes. Screen components
// retain their same props, routes and state; no unmounts or navigation rewrites.
const withTabEntrance = (Screen) => {
  function AnimatedTabScreen(props) {
    const focused = useIsFocused();
    const fade = useRef(new Animated.Value(1)).current;
    const slide = useRef(new Animated.Value(0)).current;
    useEffect(() => {
      if (!focused) return undefined;
      let alive = true;
      let animation;
      const start = (reduced) => {
        if (!alive) return;
        if (reduced) { fade.setValue(1); slide.setValue(0); return; }
        fade.setValue(Platform.OS === 'android' ? 0.88 : 0.82); slide.setValue(Platform.OS === 'android' ? 4 : 7);
        animation = Animated.parallel([
          Animated.timing(fade, { toValue: 1, duration: Platform.OS === 'android' ? 145 : 190, useNativeDriver: true }),
          Animated.timing(slide, { toValue: 0, duration: Platform.OS === 'android' ? 145 : 190, useNativeDriver: true }),
        ]);
        animation.start();
      };
      prefersReducedMotion().then(start).catch(() => start(false));
      return () => { alive = false; animation?.stop(); fade.setValue(1); slide.setValue(0); };
    }, [focused, fade, slide]);
    return <Animated.View style={{ flex: 1, opacity: fade, transform: [{ translateY: slide }] }}>
      <Screen {...props} />
    </Animated.View>;
  }
  AnimatedTabScreen.displayName = `AnimatedTab${Screen.displayName || Screen.name || 'Screen'}`;
  return AnimatedTabScreen;
};
const AnimatedDashboard = withTabEntrance(UserDashboard);
const AnimatedCommunity = withTabEntrance(Community);
const AnimatedSessions = withTabEntrance(Sessions);
const AnimatedMessages = withTabEntrance(Messages);
const AnimatedLeaderboard = withTabEntrance(Leaderboard);

export default function UserLayout() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { isDark, toggleDark } = useUserTheme();

  const [profile, setProfile] = useState({ id: '', full_name: '', credits_balance: 0, avatar_url: '', is_banned: false });
  const [notifications, setNotifications] = useState([]);
  const [toastNotification, setToastNotification] = useState(null);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('Dashboard');
  const toastTimerRef = useRef(null);
  const toastAnim = useRef(new Animated.Value(-90)).current;
  const notificationIdsRef = useRef(new Set());
  const unreadCount = notifications.filter((item) => !item.is_read).length;

  const resetToLogin = () => navigation.reset({ index: 0, routes: [{ name: 'Login' }] });

  useEffect(() => {
    let disposed = false;
    let profileChannel = null;
    let notifsChannel = null;
    let currentUserId = null;
    let creditSub = null;
    let appSub = null;
    let reminderInterval = null;
    let checkingReminders = false;
    const channelSuffix = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    const publishNotification = (notification, showToast = true) => {
      if (!notification?.id) return;
      const isNewToThisLayout = !notificationIdsRef.current.has(notification.id);
      notificationIdsRef.current.add(notification.id);
      setNotifications((prev) => [notification, ...prev.filter((item) => item.id !== notification.id)].slice(0, 8));

      if (showToast && isNewToThisLayout) {
        setToastNotification(notification);
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
        toastTimerRef.current = setTimeout(() => setToastNotification(null), 7000);
      }
    };

    const fetchProfile = async (uid_) => {
      const { data: p } = await supabase
        .from('user_profiles')
        .select('id, full_name, credits_balance, avatar_url, is_banned')
        .eq('id', uid_)
        .single();

      if (p && !disposed) {
        if (p.is_banned) {
          await supabase.auth.signOut();
          resetToLogin();
          return;
        }
        setProfile(p);
      }
    };

    const fetchNotifications = async (uid_) => {
      const { data: n, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', uid_)
        .order('created_at', { ascending: false })
        .limit(8);
      if (error) {
        console.error('Could not load notifications:', error);
        return;
      }
      if (n && !disposed) {
        notificationIdsRef.current = new Set(n.map((item) => item.id));
        setNotifications(n);
      }
    };

    // App-foreground 1-hour reminders. Same schedule and dedupe as Web:
    // no push credentials, cron, extra tables, or native notification permissions.
    const checkReminders = async (uid) => {
      if (!uid || disposed || checkingReminders || AppState.currentState !== 'active') return;
      checkingReminders = true;
      try {
        const { data, error } = await supabase.from('sessions')
          .select('id, student_id, instructor_id, scheduled_date, scheduled_time, status, skill:skills(title)')
          .eq('status', 'upcoming')
          .or(`student_id.eq.${uid},instructor_id.eq.${uid}`);
        if (error) throw error;
        for (const session of (data || [])) {
          if (disposed) break;
          const date = String(session.scheduled_date || '');
          const time = String(session.scheduled_time || '');
          if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}/.test(time)) continue;
          const starts = Date.parse(`${date}T${time.slice(0, 5)}:00+08:00`);
          const minutes = (starts - Date.now()) / 60000;
          if (!Number.isFinite(minutes) || minutes <= 0 || minutes > 60) continue;
          const link = `/sessions?session=${session.id}`;
          const cacheKey = `skillcredit:reminder1h:${uid}:${session.id}:${date}:${time.slice(0, 5)}`;
          if (await AsyncStorage.getItem(cacheKey)) continue;
          const { data: existing, error: lookupError } = await supabase.from('notifications')
            .select('id').eq('user_id', uid)
            .eq('type', 'session_reminder_1h').eq('link_url', link).limit(1);
          if (lookupError) { console.warn('Reminder lookup failed:', lookupError); continue; }
          if (existing?.length) { await AsyncStorage.setItem(cacheKey, 'seen'); continue; }
          const title = session.skill?.title || 'your scheduled skill';
          const { error: noticeError } = await supabase.from('notifications').insert({
            user_id: uid, type: 'session_reminder_1h',
            content: `Your session for "${title}" starts in about 1 hour. Be ready!`,
            link_url: link,
          });
          if (!noticeError) await AsyncStorage.setItem(cacheKey, 'sent');
          else console.warn('Reminder could not be saved:', noticeError);
        }
      } catch (err) { console.warn('Session reminder check failed:', err); }
      finally { checkingReminders = false; }
    };

    const handleLocalUpdate = () => { if (currentUserId) fetchProfile(currentUserId); };

    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (disposed) return;
      if (!user) { resetToLogin(); return; }
      currentUserId = user.id;
      void checkReminders(user.id);
      reminderInterval = setInterval(() => { void checkReminders(user.id); }, 60_000);

      await fetchProfile(user.id);
      await fetchNotifications(user.id);
      if (disposed) return;

      // the app emits this after credits change (replaces window 'credit_updated')
      creditSub = DeviceEventEmitter.addListener('credit_updated', handleLocalUpdate);

      // phones go to the background: catch up when the app comes back
      appSub = AppState.addEventListener('change', (st) => {
        if (st === 'active' && currentUserId) { fetchProfile(currentUserId); fetchNotifications(currentUserId); void checkReminders(currentUserId); }
      });

      profileChannel = supabase.channel(`profile_rt_${user.id}_${channelSuffix}`)
        .on('postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'user_profiles', filter: `id=eq.${user.id}` },
          (payload) => {
            if (payload.new?.is_banned === true) {
              supabase.auth.signOut().then(() => { resetToLogin(); });
              return;
            }
            if (payload.new?.credits_balance !== undefined) {
              setProfile((prev) => ({ ...prev, credits_balance: payload.new.credits_balance }));
            }
          })
        .subscribe();

      notifsChannel = supabase.channel(`notifs_rt_${user.id}_${channelSuffix}`)
        .on('postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
          (payload) => {
            if (payload.new) publishNotification(payload.new, false);
          })
        .on('postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
          (payload) => {
            if (payload.new) {
              setNotifications((prev) => prev.map((item) => item.id === payload.new.id ? payload.new : item));
            }
          })
        .subscribe((status, error) => {
          if (status !== 'SUBSCRIBED') console.warn('Notifications Realtime status:', status, error || '');
        });
    };

    init().catch((error) => console.error('UserLayout initialization failed:', error));
    return () => {
      disposed = true;
      if (creditSub) creditSub.remove();
      if (reminderInterval) clearInterval(reminderInterval);
      if (appSub) appSub.remove();
      if (profileChannel) supabase.removeChannel(profileChannel);
      if (notifsChannel) supabase.removeChannel(notifsChannel);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, [navigation]);

  // slide the toast in whenever a new one appears
  useEffect(() => {
    if (toastNotification) {
      toastAnim.setValue(-90);
      Animated.timing(toastAnim, { toValue: 0, duration: 220, useNativeDriver: true }).start();
    }
  }, [toastNotification, toastAnim]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    resetToLogin();
  };

  const handleNotificationClick = async (notif) => {
    if (!notif.is_read) {
      setNotifications((prev) => prev.map((n) => n.id === notif.id ? { ...n, is_read: true } : n));
      try {
        const { error } = await supabase.from('notifications').update({ is_read: true }).eq('id', notif.id);
        if (error) console.error('Could not mark notification read:', error);
      } catch (error) {
        console.error('Could not mark notification read:', error);
      }
    }
    const type = notif.type?.toLowerCase();

    // links like /sessions?session=123 are used as-is, so the target page can highlight the right item
    if (isInternalLink(notif.link_url)) {
      openLink(navigation, notif.link_url);
      return;
    }

    const systemTypes = ['account_warning', 'account_penalized', 'report_updated', 'admin_role_notice', 'admin_credit_notice'];
    if (systemTypes.includes(type)) {
      navigation.navigate('Notifications', { tab: type.startsWith('admin') ? 'System' : 'Moderation' });
      return;
    }

    if (type === 'session_disputed' || type === 'dispute') {
      navigation.navigate('User', { screen: 'Sessions', params: { tab: 'Disputed' } });
      return;
    }

    if (type === 'session_expired') {
      navigation.navigate('User', { screen: 'Sessions', params: { tab: 'Pending' } });
      return;
    }

    if (type === 'dispute_resolved') {
      navigation.navigate('User', { screen: 'Sessions' });
      return;
    }

    if (type === 'message') {
      const latestMsg = await findLatestIncomingMessage(profile.id || notif.user_id);
      navigation.navigate('User', { screen: 'Messages', params: latestMsg ? buildMessageParams(latestMsg) : undefined });
      return;
    }

    if (type === 'community' || type === 'community_like' || type === 'community_comment' || type === 'community_reply') {
      navigation.navigate('User', { screen: 'Community' });
      return;
    }

    if (type === 'support_reply' || type === 'ticket_updated') {
      const { data: ticket } = await supabase
        .from('support_tickets')
        .select('id')
        .eq('user_id', profile.id || notif.user_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (ticket) {
        navigation.navigate('User', { screen: 'Messages', params: { ticket: ticket.id } });
      } else {
        navigation.navigate('User', { screen: 'Messages' });
      }
      return;
    }

    navigation.navigate('Notifications');
  };

  // let a sheet finish closing before pushing a screen (avoids a flicker on iOS)
  const closeThen = (close, fn) => { close(false); setTimeout(fn, 260); };

  const themedToast = useThemeStyle(s.toast);
  const toastMeta = toastNotification ? getNotificationMeta(toastNotification.type) : null;
  const ToastIcon = toastMeta?.Icon;
  const toastTone = toastMeta ? TONES[toastMeta.tone] : null;
  const tabBarHeight = 56 + insets.bottom;

  const tabIcon = (Icon) => ({ color, focused }) => <Icon size={24} color={color} strokeWidth={focused ? 2.3 : 1.8} />;

  return (
    <View style={{ flex: 1, backgroundColor: isDark ? '#0c151b' : '#fff' }}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={isDark ? '#0c151b' : '#fff'} />
      <Tab.Navigator
        initialRouteName="Dashboard"
        screenListeners={({ route }) => ({ focus: () => setActiveTab(route.name) })}
        screenOptions={{
          header: () => (
            <TopBar
              profile={profile}
              unreadCount={unreadCount}
              onBrand={() => navigation.navigate('User', { screen: 'Dashboard' })}
              onProfile={() => setIsProfileOpen(true)}
              onCredits={() => navigation.navigate('Payments')}
            />
          ),
          tabBarActiveTintColor: isDark ? '#34d399' : T.brand,
          tabBarInactiveTintColor: isDark ? '#94a3b8' : T.sub,
          tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
          tabBarStyle: { backgroundColor: isDark ? '#162329' : '#fff', borderTopColor: isDark ? '#2b4249' : T.line, borderTopWidth: 1, elevation: 0 },
        }}
      >
        <Tab.Screen name="Dashboard"   component={AnimatedDashboard} options={{ title: 'Browse',      tabBarIcon: tabIcon(Compass) }} />
        <Tab.Screen name="Community"   component={AnimatedCommunity}     options={{ title: 'Community',   tabBarIcon: tabIcon(Globe) }} />
        <Tab.Screen name="Sessions"    component={AnimatedSessions}      options={{ title: 'Sessions',    tabBarIcon: tabIcon(CalendarDays) }} />
        <Tab.Screen name="Messages"    component={AnimatedMessages}      options={{ title: 'Messages',    tabBarIcon: tabIcon(MessageCircle) }} />
        <Tab.Screen name="Leaderboard" component={AnimatedLeaderboard}   options={{ title: 'Leaderboard', tabBarIcon: tabIcon(Trophy) }} />
      </Tab.Navigator>

      {/* floating help: only on the Dashboard (Browse) tab */}
      {activeTab === 'Dashboard' && <FloatingHelpButton bottomOffset={tabBarHeight + 16} />}

      {/* ══ LIVE TOAST: new messages and community activity. Tapping it opens the same target as the bell item. */}
      {toastNotification && toastMeta && ToastIcon && (
        <Animated.View style={[s.toastWrap, { top: insets.top + 56, transform: [{ translateY: toastAnim }] }]} pointerEvents="box-none">
          <View style={themedToast}>
            <View style={[s.iconBubble, { backgroundColor: toastTone.bg }]}>
              <ToastIcon size={20} color={toastTone.fg} strokeWidth={1.8} />
            </View>
            <Pressable onPress={() => handleNotificationClick(toastNotification)} style={{ flex: 1 }}>
              <Text style={s.toastLabel}>New notification</Text>
              <Text style={s.toastText} numberOfLines={2}>{toastNotification.content}</Text>
              <Text style={s.toastOpen}>Open notification</Text>
            </Pressable>
            <Pressable
              accessibilityLabel="Dismiss notification"
              hitSlop={10}
              onPress={() => {
                if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
                setToastNotification(null);
              }}
            >
              <X size={18} color={T.sub} />
            </Pressable>
          </View>
        </Animated.View>
      )}

      {/* ══ PROFILE MENU SHEET (was the profile dropdown) */}
      <Sheet visible={isProfileOpen} onClose={() => setIsProfileOpen(false)}>
        <View style={s.menuHead}>
          <Avatar uri={profile.avatar_url} name={profile.full_name} size={44} />
          <View style={{ flex: 1 }}>
            <Text style={s.menuName} numberOfLines={1}>{profile.full_name || 'You'}</Text>
          </View>
          <Pressable onPress={() => setIsProfileOpen(false)} hitSlop={10} style={s.closeBtn}><X size={18} color={T.text} /></Pressable>
        </View>

        {PROFILE_LINKS.map(({ route, label, Icon, color, badge }) => (
          <Pressable key={route} onPress={() => closeThen(setIsProfileOpen, () => navigation.navigate(route))} style={({ pressed }) => [s.menuRow, pressed && { backgroundColor: T.strip }]}>
            <View style={[s.menuIcon, { backgroundColor: color + '1A' }]}><Icon size={19} color={color} strokeWidth={1.9} /></View>
            <Text style={s.menuLabel}>{label}</Text>
            {badge && unreadCount > 0 && <View style={s.countPill}><Text style={s.countPillText}>{unreadCount}</Text></View>}
            <ChevronRight size={18} color={T.border} />
          </Pressable>
        ))}

        {/* Same regular-user-only local dark preference as Web; no account update. */}
        <Pressable onPress={toggleDark} accessibilityRole="switch" accessibilityState={{ checked: isDark }}
          style={({ pressed }) => [s.menuRow, pressed && { backgroundColor: isDark ? '#243940' : T.strip }]}>
          <View style={[s.menuIcon, { backgroundColor: isDark ? '#123f36' : '#ecfdf5' }]}>
            {isDark ? <Moon size={19} color="#34d399" /> : <Sun size={19} color="#047857" />}
          </View>
          <Text style={s.menuLabel}>Dark Mode</Text>
          <View style={[s.themeTrack, { backgroundColor: isDark ? '#047857' : '#cbd5e1' }]}>
            <View style={[s.themeThumb, isDark && { alignSelf: 'flex-end' }]} />
          </View>
        </Pressable>

        <Pressable onPress={() => { setIsProfileOpen(false); handleLogout(); }} style={({ pressed }) => [s.menuRow, { borderBottomWidth: 0 }, pressed && { backgroundColor: '#fff1f2' }]}>
          <View style={[s.menuIcon, { backgroundColor: T.danger + '1A' }]}><LogOut size={19} color={T.danger} strokeWidth={1.9} /></View>
          <Text style={[s.menuLabel, { color: T.danger }]}>Sign out</Text>
        </Pressable>
      </Sheet>
    </View>
  );
}

const s = StyleSheet.create({
  // top bar
  topBar: { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: T.line },
  topRow: { height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, gap: 8 },
  leftGroup: { flexShrink: 1 },
  rightGroup: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0 },
  brand: { flexShrink: 1, fontSize: 17, fontWeight: '700', color: '#064e3b', letterSpacing: -0.3 },
  credits: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 30, paddingHorizontal: 10, borderRadius: 15, backgroundColor: '#fffbeb', borderWidth: 1, borderColor: '#fde68a' },
  creditsText: { fontSize: 13, fontWeight: '700', color: '#b45309' },
  avatarDot: { position: 'absolute', top: -2, right: -2, width: 11, height: 11, borderRadius: 6, backgroundColor: '#f43f5e', borderWidth: 2, borderColor: '#fff' },

  // sheets
  overlay: { flex: 1, backgroundColor: 'rgba(15,20,25,0.5)' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  grabber: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: T.border, marginTop: 8 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: T.line },
  sheetTitle: { fontSize: 17, fontWeight: '700', color: T.text, letterSpacing: -0.2 },
  sheetSub: { fontSize: 13, color: T.sub, marginTop: 2 },
  closeBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  countPill: { minWidth: 20, height: 20, paddingHorizontal: 6, borderRadius: 10, backgroundColor: '#f43f5e', alignItems: 'center', justifyContent: 'center' },
  countPillText: { fontSize: 12, fontWeight: '700', color: '#fff' },

  iconBubble: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },

  // profile menu
  themeTrack: { width: 38, height: 22, borderRadius: 12, padding: 3, justifyContent: 'center' },
  themeThumb: { width: 16, height: 16, borderRadius: 8, backgroundColor: '#fff', alignSelf: 'flex-start' },
  menuHead: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: T.line },
  menuName: { fontSize: 16, fontWeight: '700', color: T.text },
  menuSub: { fontSize: 13, color: T.sub, marginTop: 1 },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: 14, height: 52, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: T.line },
  menuLabel: { flex: 1, fontSize: 15, fontWeight: '600', color: T.text },
  menuIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },

  // toast
  toastWrap: { position: 'absolute', left: 12, right: 12, zIndex: 100 },
  toast: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: T.border, padding: 12, ...Platform.select({ ios: { shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 16, shadowOffset: { width: 0, height: 6 } }, android: { elevation: 8 } }) },
  toastLabel: { fontSize: 12, fontWeight: '600', color: T.sub },
  toastText: { fontSize: 14, lineHeight: 20, fontWeight: '600', color: T.text, marginTop: 2 },
  toastOpen: { fontSize: 13, fontWeight: '600', color: T.brand, marginTop: 4 },

  // floating support button
  fab: { position: 'absolute', right: 16, width: BTN_W, height: BTN_H, alignItems: 'center', justifyContent: 'center', borderRadius: BTN_H / 2, backgroundColor: '#fff', borderWidth: 1, borderColor: '#d1fae5', ...Platform.select({ ios: { shadowColor: '#0f172a', shadowOpacity: 0.14, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } }, android: { elevation: 6 } }) },
  fabIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: T.soft, alignItems: 'center', justifyContent: 'center' },
  fabText: { flex: 1, fontSize: 14, fontWeight: '700', color: '#064e3b' },

  // support form
  fieldLabel: { fontSize: 13, fontWeight: '600', color: T.sub, marginBottom: 8 },
  fieldHint: { fontSize: 12, fontWeight: '400', color: '#8b98a5' },
  fieldRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { height: 34, paddingHorizontal: 14, borderRadius: 17, backgroundColor: T.field, justifyContent: 'center' },
  chipOn: { backgroundColor: T.text },
  chipText: { fontSize: 13, fontWeight: '600', color: T.text },
  textarea: { minHeight: 110, borderRadius: 12, backgroundColor: T.field, padding: 12, fontSize: 15, lineHeight: 21, color: T.text, textAlignVertical: 'top' },
  dropzone: { alignItems: 'center', gap: 4, paddingVertical: 22, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: T.border, backgroundColor: T.strip },
  dropTitle: { fontSize: 14, fontWeight: '700', color: T.text, marginTop: 4 },
  fileCard: { borderRadius: 12, borderWidth: 1, borderColor: T.line, backgroundColor: T.strip, overflow: 'hidden' },
  filePreview: { height: 160, width: '100%', backgroundColor: T.field },
  docRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, backgroundColor: T.soft },
  docIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  docLabel: { fontSize: 14, fontWeight: '600', color: T.text },
  fileMeta: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 },
  fileName: { fontSize: 14, fontWeight: '600', color: T.text },
  fileSize: { fontSize: 12, color: T.sub, marginTop: 1 },
  replace: { fontSize: 13, fontWeight: '700', color: T.brand },
  formBtns: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: T.line },
  btn: { flex: 1, height: 46, borderRadius: 23, backgroundColor: T.brand, alignItems: 'center', justifyContent: 'center' },
  btnSoft: { backgroundColor: T.field },
  btnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});