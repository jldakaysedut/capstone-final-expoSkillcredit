import { Reveal, PressScale } from '../../components/premium/PremiumVisual';
import { useUserTheme } from '../../components/premium/PremiumTheme';
import { Alert } from '../../components/SkillCreditAlert';
// ═══════════════════════════════════════════════════════════════
//  MOBILE APP (Expo React Native) — src/pages/user/Messages.jsx
//  Same data + logic as the web V12 (live updates, quick-action banner, message
//  notifications, booking request card), restyled with the compact X-style
//  typography used in UserDashboard.
// ═══════════════════════════════════════════════════════════════
import { Fragment, useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import {
  Modal, Linking, AppState, Animated, BackHandler, Platform, DeviceEventEmitter, StyleSheet
} from 'react-native';
import { ActivityIndicator, View, Text, Image, Pressable, ScrollView, TextInput, KeyboardAvoidingView } from '../../components/premium/PremiumThemePrimitives';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { ArrowLeft, BellOff, CalendarDays, FileText, Heart, ImagePlus, Lock, MessageSquare, MoreVertical, Search, Send, Shield, Star, X, Sparkles, ChevronRight } from '../../components/premium/PremiumThemeIcons';
import supabase from '../../supabaseClient';
import UserScreenSkeleton from '../../components/premium/UserScreenSkeleton';
import SkiroMascot from '../../components/SkiroMascot';

// compact X-style tokens (same as UserDashboard)
const T = {
  text: '#0f1419', sub: '#536471', line: '#eff3f4', border: '#cfd9de', field: '#eff3f4',
  brand: '#047857', soft: '#ecfdf5',
};

// ─── reply encoding (same format as the web, so web + mobile chats stay compatible)
const REPLY_PREFIX = '__REPLY__:';
const REPLY_SUFFIX = '::__\n';

function encodeReply(replyingTo) {
  const snippet = (replyingTo.content || '').replace(/^__REPLY__:[\s\S]*?::__\n/, '').slice(0, 80);
  return `${REPLY_PREFIX}${JSON.stringify({ id: replyingTo.id, snippet, name: replyingTo.senderName })}${REPLY_SUFFIX}`;
}
function parseReply(content) {
  if (!content || !content.startsWith(REPLY_PREFIX)) return null;
  try {
    const end = content.indexOf(REPLY_SUFFIX);
    if (end === -1) return null;
    return JSON.parse(content.slice(REPLY_PREFIX.length, end));
  } catch { return null; }
}
function stripReplyPrefix(content) {
  if (!content) return content;
  const end = content.indexOf(REPLY_SUFFIX);
  if (end === -1) return content;
  return content.slice(end + REPLY_SUFFIX.length);
}

// ─── booking request card payload (same format as the web)
const BOOKING_PREFIX = '__BOOKING_REQUEST__::';
function parseBookingRequest(content) {
  if (!content || !content.startsWith(BOOKING_PREFIX)) return null;
  try { return JSON.parse(content.slice(BOOKING_PREFIX.length)); } catch { return null; }
}
// one-line preview for the chat list (never show raw JSON)
const previewText = (content, fileUrl) => {
  if (parseBookingRequest(content)) return 'Booking request';
  return (stripReplyPrefix(content || '') || '').trim() || (fileUrl ? 'Sent an attachment' : '');
};

const uid = () => `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

// base64 -> bytes (React Native can't upload a File/Blob reliably, so we send raw bytes)
const B64_LOOKUP = (() => {
  const t = new Uint8Array(256).fill(255);
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  for (let i = 0; i < chars.length; i++) t[chars.charCodeAt(i)] = i;
  return t;
})();
const base64ToArrayBuffer = (b64) => {
  let len = b64.length;
  while (len > 0 && b64[len - 1] === '=') len--;
  const out = new Uint8Array(Math.floor((len * 3) / 4));
  let p = 0, buf = 0, bits = 0;
  for (let i = 0; i < len; i++) {
    const v = B64_LOOKUP[b64.charCodeAt(i)];
    if (v === 255) continue;
    buf = (buf << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[p++] = (buf >> bits) & 255;
      buf &= (1 << bits) - 1;
    }
  }
  return out.buffer.slice(0, p);
};
const IMAGE_EXT = { 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };
const isClosedStatus = (st) => ['completed', 'resolved', 'cancelled'].includes(st);
const isExpiredSchedule = (dateStr, timeStr) => {
  if (!dateStr || !timeStr) return false;
  const timestamp = Date.parse(`${dateStr}T${String(timeStr).slice(0, 5)}:00+08:00`);
  return Number.isFinite(timestamp) && Date.now() > timestamp;
};
const timeOf = (d) => new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

const TABS = ['All', 'Upcoming', 'Active', 'Teachers', 'Students', 'Support', 'Closed'];
const TAB_FILTERS = {
  All:      () => true,
  Upcoming: (c) => c.type === 'session' && ['upcoming', 'confirmed'].includes(c.sessionStatus), // scheduled, not started yet
  Active:   (c) => c.sessionStatus === 'active',
  Teachers: (c) => c.role === 'Teacher',
  Students: (c) => c.role === 'Student',
  Support:  (c) => c.role === 'Support',
  Closed:   (c) => isClosedStatus(c.sessionStatus),
};

const confirmAsync = (title, message, confirmText = 'Confirm', destructive = false) =>
  new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: confirmText, style: destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) });
  });

// ── tappable links inside text
const LinkText = ({ text, isMe }) => {
  if (!text) return null;
  return (
    <Text style={{ fontSize: 15, lineHeight: 21, color: isMe ? '#fff' : T.text }}>
      {text.split(/(https?:\/\/[^\s]+)/g).map((part, i) =>
        /^https?:\/\//.test(part)
          ? <Text key={i} onPress={() => Linking.openURL(part)} style={{ textDecorationLine: 'underline', fontWeight: '600', color: isMe ? '#d1fae5' : T.brand }}>{part}</Text>
          : <Text key={i}>{part}</Text>)}
    </Text>
  );
};

const Avatar = ({ contact, size = 48 }) => {
  if (contact?.avatar) {
    return <Image source={{ uri: contact.avatar }} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: T.field }} />;
  }
  const support = contact?.role === 'Support';
  return (
    <View style={{
      width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center',
      backgroundColor: support ? T.text : '#d1fae5',
    }}>
      {support
        ? <Shield size={size * 0.45} color="#fff" />
        : <Text style={{ fontWeight: '700', fontSize: size * 0.4, color: '#065f46' }}>{contact?.name?.charAt(0) || '?'}</Text>}
    </View>
  );
};

// ── centered line + label between messages (new day / more than 1 hour of silence)
const ChatDivider = ({ label }) => (
  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 14, marginBottom: 12 }}>
    <View style={{ flex: 1, height: 1, backgroundColor: '#e4e9ec' }} />
    <Text style={{ fontSize: 12, fontWeight: '700', color: '#a3acb3' }}>{label}</Text>
    <View style={{ flex: 1, height: 1, backgroundColor: '#e4e9ec' }} />
  </View>
);

function TypingDots() {
  const dots = useRef([0, 1, 2].map(() => new Animated.Value(0))).current;
  useEffect(() => {
    const loops = dots.map((v, i) => Animated.loop(Animated.sequence([
      Animated.delay(i * 150),
      Animated.timing(v, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.timing(v, { toValue: 0, duration: 300, useNativeDriver: true }),
      Animated.delay(450 - i * 150),
    ])));
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, []);
  return (
    <View style={s.typing}>
      {dots.map((v, i) => (
        <Animated.View key={i} style={[s.typingDot, {
          opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }),
          transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, -4] }) }],
        }]} />
      ))}
    </View>
  );
}

export default function Messages() {
  const { isDark } = useUserTheme();
  const navigation = useNavigation();
  const route = useRoute();
  const insets = useSafeAreaInsets();

  const scrollRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const chatChannelRef = useRef(null);
  const contactsRef = useRef([]);
  const selectedIdRef = useRef(null);
  const msgYs = useRef({});
  const focusedRef = useRef(null);
  const userIdRef = useRef(null);

  const [currentUserId, setCurrentUserId] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [selectedContact, setSelectedContact] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loadingContacts, setLoadingContacts] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('All');
  const [uploadingFile, setUploadingFile] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null); // { uri, name, mimeType, isImage }
  const [isSubmittingRating, setIsSubmittingRating] = useState(false);
  const [isContactTyping, setIsContactTyping] = useState(false);
  const [mutedContacts, setMutedContacts] = useState({});
  const [replyingTo, setReplyingTo] = useState(null);
  const [isProcessingDone, setIsProcessingDone] = useState(false);
  const [liveMeta, setLiveMeta] = useState({}); // { [contactId]: { preview, at, unread } }
  const [viewerImage, setViewerImage] = useState(null);
  const [focusMessageId, setFocusMessageId] = useState(null);
  const [highlightMsgId, setHighlightMsgId] = useState(null);

  contactsRef.current = contacts;
  selectedIdRef.current = selectedContact?.id || null;

  // deep link params: navigate('Messages', { session | ticket, message })
  const pTarget = route.params?.session || route.params?.session_id || route.params?.ticket
    || route.params?.ticket_id || route.params?.ticketId || route.params?.id || null;
  const pMessage = route.params?.message || null;

  // ── list view: show the SkillCredit top bar (logo, notifications, account) from UserLayout
  //    chat view: hide the top bar and the tab bar (the chat has its own header)
  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: !selectedContact,
      // Return to the same themed tab bar as UserLayout when leaving a chat.
      // `undefined` previously overrode that style with React Navigation's
      // default white tab bar, especially visible on the Messages list.
      tabBarStyle: selectedContact ? { display: 'none' } : {
        backgroundColor: isDark ? '#162329' : '#fff',
        borderTopColor: isDark ? '#2b4249' : T.line,
        borderTopWidth: 1,
        elevation: 0,
      },
    });
  }, [selectedContact, navigation, isDark]);

  // hide the floating Support button while chatting
  useEffect(() => {
    DeviceEventEmitter.emit('chat_open', !!selectedContact);
    return () => DeviceEventEmitter.emit('chat_open', false);
  }, [selectedContact]);

  // Android back button: chat -> list
  useFocusEffect(useCallback(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (selectedIdRef.current) { setSelectedContact(null); return true; }
      return false;
    });
    return () => sub.remove();
  }, []));

  // ─── contacts (sessions + support tickets)
  const fetchContacts = async (userId) => {
    const { data: sessionData, error: sessionError } = await supabase.from('sessions')
      .select(`id, status, created_at, scheduled_date, scheduled_time, skill:skills(title,category), student_id, instructor_id, instructor_completed, student_completed,
        student:user_profiles!student_id(id,full_name,avatar_url),
        instructor:user_profiles!instructor_id(id,full_name,avatar_url)`)
      .or(`student_id.eq.${userId},instructor_id.eq.${userId}`)
      .order('created_at', { ascending: false });

    const { data: ticketData, error: ticketError } = await supabase.from('support_tickets')
      .select('id, subject, status, created_at, rating')
      .eq('user_id', userId).order('created_at', { ascending: false });

    // a failed refresh (network blip after the app was backgrounded) must NOT empty the list
    if (sessionError || ticketError) {
      console.error('Could not refresh chats:', sessionError || ticketError);
      return contactsRef.current;
    }

    const combined = [];
    (sessionData || []).forEach((session) => {
      const isInstructor = session.instructor_id === userId;
      const otherUser = isInstructor ? session.student : session.instructor;
      combined.push({
        id: session.id, type: 'session', userId: otherUser?.id,
        name: otherUser?.full_name || 'Unknown', avatar: otherUser?.avatar_url,
        role: isInstructor ? 'Student' : 'Teacher',
        skillCategory: session.skill?.category || 'Uncategorized',
        sessionStatus: session.status,
        scheduledDate: session.scheduled_date,
        scheduledTime: session.scheduled_time,
        sortDate: session.created_at || new Date().toISOString(),
        instructorCompleted: session.instructor_completed,
        studentCompleted: session.student_completed,
        isInstructor,
      });
    });
    (ticketData || []).forEach((ticket) => {
      combined.push({
        id: ticket.id, type: 'ticket', userId: 'support', name: 'Support Team', avatar: null, role: 'Support',
        skillCategory: `Ticket: ${ticket.subject}`, sessionStatus: ticket.status, sortDate: ticket.created_at, rating: ticket.rating,
      });
    });
    combined.sort((a, b) => new Date(b.sortDate) - new Date(a.sortDate));

    setContacts(combined);
    // keep the open chat in sync (status / completed flags / rating)
    setSelectedContact((prev) => (prev ? (combined.find((c) => c.id === prev.id) ?? prev) : prev));
    return combined;
  };

  // ─── init + GLOBAL live listeners
  useEffect(() => {
    let disposed = false;
    let channel = null;
    const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const init = async () => {
      setLoadingContacts(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || disposed) return;
      setCurrentUserId(user.id);
      userIdRef.current = user.id;
      await fetchContacts(user.id);
      if (disposed) return;
      setLoadingContacts(false);

      channel = supabase.channel(`messages_live_${user.id}_${suffix}`)
        // any booking / status change involving me -> refresh list + open chat banner
        .on('postgres_changes', { event: '*', schema: 'public', table: 'sessions' }, (payload) => {
          const row = payload.new?.id ? payload.new : payload.old;
          const mine = row && (row.student_id === user.id || row.instructor_id === user.id);
          if (mine || payload.eventType === 'DELETE') fetchContacts(user.id);
        })
        // my support tickets (new / resolved / rated)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'support_tickets', filter: `user_id=eq.${user.id}` },
          () => fetchContacts(user.id))
        // any new message: mark other chats unread + show preview
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
          const msg = payload.new;
          const contactId = msg?.session_id || msg?.ticket_id;
          if (!contactId || msg.sender_id === user.id) return;
          if (!contactsRef.current.some((c) => c.id === contactId)) { fetchContacts(user.id); return; }
          const text = previewText(msg.content, msg.file_url);
          setLiveMeta((prev) => ({
            ...prev,
            [contactId]: { preview: text, at: msg.created_at, unread: selectedIdRef.current !== contactId },
          }));
        })
        .subscribe();
    };
    init().catch((e) => console.error('Messages init failed:', e));

    return () => { disposed = true; if (channel) supabase.removeChannel(channel); };
  }, []);

  // ─── EXTRA listener (added): its own channel just for new messages, so the chat list
  //     still gets "move to top + bold" even if the big channel above has a problem.
  //     The status log shows in the Expo terminal: SUBSCRIBED = working.
  useEffect(() => {
    if (!currentUserId) return;
    const listCh = supabase.channel(`msglist_${currentUserId}_${Date.now()}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        const msg = payload.new;
        const contactId = msg?.session_id || msg?.ticket_id;
        if (!contactId || msg.sender_id === currentUserId) return;
        const bump = () => setLiveMeta((prev) => ({
          ...prev,
          [contactId]: { preview: previewText(msg.content, msg.file_url), at: msg.created_at, unread: selectedIdRef.current !== contactId },
        }));
        if (contactsRef.current.some((c) => c.id === contactId)) bump();
        else fetchContacts(currentUserId).then(bump);
      })
      .subscribe((status, err) => { console.log('[messages list realtime]', status, err?.message || ''); });
    return () => { supabase.removeChannel(listCh); };
  }, [currentUserId]);

  // ─── EXTRA (added): load the LAST message of every chat when the list opens, so the list
  //     shows "You: ..." / the other person's message, moves to the top, and unread chats
  //     are bold even if the message came while this screen was not open.
  //     Unread = last message is from the other person AND its "message" notification is still unread.
  const contactIdsKey = contacts.map((c) => c.id).join(',');
  useEffect(() => {
    if (!currentUserId || !contactIdsKey) return;
    let cancelled = false;

    const loadLastMessages = async () => {
      try {
        const list = contactsRef.current;
        const sessionIds = list.filter((c) => c.type === 'session').map((c) => c.id);
        const ticketIds = list.filter((c) => c.type === 'ticket').map((c) => c.id);
        const cols = 'session_id, ticket_id, sender_id, content, file_url, created_at';
        const [sRes, tRes, nRes] = await Promise.all([
          sessionIds.length
            ? supabase.from('messages').select(cols).in('session_id', sessionIds).order('created_at', { ascending: false }).limit(500)
            : { data: [] },
          ticketIds.length
            ? supabase.from('messages').select(cols).in('ticket_id', ticketIds).order('created_at', { ascending: false }).limit(500)
            : { data: [] },
          supabase.from('notifications').select('link_url').eq('user_id', currentUserId).eq('type', 'message').eq('is_read', false),
        ]);
        if (cancelled) return;

        // newest message per chat (rows are already newest-first)
        const latest = {};
        [...(sRes.data || []), ...(tRes.data || [])].forEach((m) => {
          const id = m.session_id || m.ticket_id;
          if (id && (!latest[id] || new Date(m.created_at) > new Date(latest[id].created_at))) latest[id] = m;
        });

        // chats that still have an unread message notification
        const unreadIds = new Set();
        (nRes.data || []).forEach((n) => {
          const hit = /(?:session|ticket)=([^&]+)/.exec(n.link_url || '');
          if (hit) unreadIds.add(hit[1]);
        });

        setLiveMeta((prev) => {
          const next = { ...prev };
          Object.keys(latest).forEach((id) => {
            const m = latest[id];
            if (next[id] && new Date(next[id].at) >= new Date(m.created_at)) return; // live info is newer
            const mine = m.sender_id === currentUserId;
            next[id] = {
              preview: `${mine ? 'You: ' : ''}${previewText(m.content, m.file_url)}`,
              at: m.created_at,
              unread: !mine && unreadIds.has(id) && selectedIdRef.current !== id,
            };
          });
          return next;
        });
      } catch (e) { console.log('Could not load last messages:', e?.message || e); }
    };

    loadLastMessages();
    const sub = AppState.addEventListener('change', (state) => { if (state === 'active') loadLastMessages(); });
    return () => { cancelled = true; sub.remove(); };
  }, [currentUserId, contactIdsKey]);

  // ─── EXTRA (added): opening a chat = its message notifications are read (so it stops being bold later)
  useEffect(() => {
    if (!currentUserId || !selectedContact) return;
    const chatId = selectedContact.id;
    const markRead = () => supabase.from('notifications').update({ is_read: true })
      .eq('user_id', currentUserId).eq('type', 'message').like('link_url', `%=${chatId}%`)
      .then(() => {}, () => {});
    markRead();
    return markRead; // also when leaving the chat (messages that came while it was open)
  }, [currentUserId, selectedContact?.id]);

  // ─── open the chat from a notification / Sessions "Chat" button
  useEffect(() => {
    if (!pTarget || loadingContacts) return;
    const found = contacts.find((c) => c.id === pTarget);
    if (!found) return; // contact list will refresh live, effect runs again
    setSelectedContact(found);
    setFocusMessageId(pMessage);
    setLiveMeta((prev) => (prev[found.id] ? { ...prev, [found.id]: { ...prev[found.id], unread: false } } : prev));
    navigation.setParams({
      session: undefined, session_id: undefined, ticket: undefined, ticket_id: undefined,
      ticketId: undefined, id: undefined, message: undefined, user: undefined,
    });
  }, [pTarget, pMessage, loadingContacts, contacts]);

  const openContact = (c) => {
    setSelectedContact(c);
    setFocusMessageId(null);
    setLiveMeta((prev) => (prev[c.id] ? { ...prev, [c.id]: { ...prev[c.id], unread: false } } : prev));
  };

  // ─── messages for the open chat + its live room
  const fetchMessages = async (contact) => {
    const column = contact.type === 'ticket' ? 'ticket_id' : 'session_id';
    const { data, error } = await supabase.from('messages').select('*').eq(column, contact.id).order('created_at', { ascending: true });
    if (!error) setMessages(data || []);
  };

  useEffect(() => {
    if (!currentUserId || !selectedContact) return;
    const contact = selectedContact;
    setReplyingTo(null); setMessages([]); setIsContactTyping(false);
    setLoadingMessages(true);
    fetchMessages(contact).finally(() => setLoadingMessages(false));

    const dbCol = contact.type === 'ticket' ? 'ticket_id' : 'session_id';
    const channel = supabase.channel(`room_${contact.type}_${contact.id}_${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `${dbCol}=eq.${contact.id}` },
        (payload) => {
          const newMsg = payload.new;
          if (payload.eventType === 'INSERT') setMessages((prev) => (prev.some((m) => m.id === newMsg.id) ? prev : [...prev, newMsg]));
          else if (payload.eventType === 'UPDATE') setMessages((prev) => prev.map((m) => (m.id === newMsg.id ? newMsg : m)));
          else if (payload.eventType === 'DELETE') setMessages((prev) => prev.filter((m) => m.id !== payload.old.id));
          setIsContactTyping(false);
        })
      .on('broadcast', { event: 'typing' }, (payload) => {
        if (payload.payload.userId !== currentUserId) setIsContactTyping(payload.payload.isTyping);
      })
      .subscribe();
    chatChannelRef.current = channel;

    return () => { supabase.removeChannel(channel); chatChannelRef.current = null; clearTimeout(typingTimeoutRef.current); };
  }, [currentUserId, selectedContact?.id, selectedContact?.type]);

  // ─── re-sync when the app comes back to the foreground (socket may have slept)
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active' || !userIdRef.current) return;
      fetchContacts(userIdRef.current);
      const open = contactsRef.current.find((c) => c.id === selectedIdRef.current);
      if (open) fetchMessages(open);
    });
    return () => sub.remove();
  }, []);

  // ─── jump to a specific message (from a notification)
  useEffect(() => {
    if (!focusMessageId || !selectedContact || loadingMessages) return;
    const key = `${selectedContact.id}:${focusMessageId}`;
    if (focusedRef.current === key) return;
    if (msgYs.current[focusMessageId] === undefined) return;
    focusedRef.current = key;
    setHighlightMsgId(focusMessageId);
    setTimeout(() => scrollRef.current?.scrollTo({ y: Math.max(0, msgYs.current[focusMessageId] - 120), animated: true }), 200);
    setTimeout(() => setHighlightMsgId(null), 1800);
  }, [focusMessageId, selectedContact, loadingMessages, messages]);

  const scrollToMessage = (msgId) => {
    const y = msgYs.current[msgId];
    if (y === undefined) return;
    scrollRef.current?.scrollTo({ y: Math.max(0, y - 120), animated: true });
    setHighlightMsgId(msgId);
    setTimeout(() => setHighlightMsgId(null), 1500);
  };

  // ─── typing + sending
  const handleTyping = (text) => {
    setNewMessage(text);
    const ch = chatChannelRef.current;
    if (ch) {
      ch.send({ type: 'broadcast', event: 'typing', payload: { isTyping: true, userId: currentUserId } });
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        ch.send({ type: 'broadcast', event: 'typing', payload: { isTyping: false, userId: currentUserId } });
      }, 2000);
    }
  };

  const pickPhoto = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8, base64: true });
    if (res.canceled) return;
    const a = res.assets[0];
    if (a.fileSize && a.fileSize > 5 * 1024 * 1024) { Alert.alert('File size exceeds 5MB limit.'); return; }
    setSelectedFile({ uri: a.uri, name: a.fileName || `photo_${uid()}.jpg`, mimeType: a.mimeType || 'image/jpeg', isImage: true, base64: a.base64 });
  };
  const pickDocument = async () => {
    const res = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
      copyToCacheDirectory: true,
    });
    if (res.canceled) return;
    const a = res.assets[0];
    if (a.size && a.size > 5 * 1024 * 1024) { Alert.alert('File size exceeds 5MB limit.'); return; }
    setSelectedFile({ uri: a.uri, name: a.name, mimeType: a.mimeType || 'application/octet-stream', isImage: false });
  };
  const openAttach = () => Alert.alert('Attach', undefined, [
    { text: 'Photo', onPress: pickPhoto },
    { text: 'File (PDF / Word)', onPress: pickDocument },
    { text: 'Cancel', style: 'cancel' },
  ]);

  const executeMessageSend = async (contentString) => {
    if (!selectedContact || !currentUserId) return;
    if (isClosedStatus(selectedContact.sessionStatus)) { Alert.alert('This conversation is closed/resolved.'); return; }
    setUploadingFile(true);
    chatChannelRef.current?.send({ type: 'broadcast', event: 'typing', payload: { isTyping: false, userId: currentUserId } });
    clearTimeout(typingTimeoutRef.current);

    const isReplyToMessage = Boolean(replyingTo && !replyingTo.quickLike);
    const finalContent = isReplyToMessage ? encodeReply(replyingTo) + contentString : contentString;
    setReplyingTo(null);

    let uploadedFileUrl = null;
    let fileType = null;
    try {
      if (selectedFile) {
        const photoMime = (selectedFile.mimeType || '').toLowerCase();
        const contentType = selectedFile.isImage ? (IMAGE_EXT[photoMime] ? photoMime : 'image/jpeg') : selectedFile.mimeType;
        const ext = selectedFile.isImage
          ? (IMAGE_EXT[photoMime] || 'jpg')
          : (selectedFile.name.split('.').pop() || 'bin').toLowerCase();
        const filePath = `${currentUserId}/${uid()}.${ext}`;
        let buffer;
        if (selectedFile.base64) buffer = base64ToArrayBuffer(selectedFile.base64);
        else { const res = await fetch(selectedFile.uri); buffer = await res.arrayBuffer(); }
        if (!buffer || buffer.byteLength === 0) throw new Error('The file came out empty');
        const { error: uploadError } = await supabase.storage.from('chat-attachments').upload(filePath, buffer, { contentType });
        if (uploadError) throw uploadError;
        uploadedFileUrl = supabase.storage.from('chat-attachments').getPublicUrl(filePath).data.publicUrl;
        fileType = contentType;
      }
      setNewMessage(''); setSelectedFile(null);

      const msgPayload = { sender_id: currentUserId, content: finalContent, file_url: uploadedFileUrl, file_type: fileType, is_deleted: false };
      if (selectedContact.type === 'ticket') msgPayload.ticket_id = selectedContact.id;
      else { msgPayload.session_id = selectedContact.id; msgPayload.receiver_id = selectedContact.userId; }

      const tempId = Date.now().toString();
      setMessages((prev) => [...prev, { ...msgPayload, id: tempId, created_at: new Date().toISOString() }]);
      const { data, error } = await supabase.from('messages').insert([msgPayload]).select().single();
      if (error) {
        Alert.alert('Failed to send message.');
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
      } else if (data) {
        // the live event may already have added the real row -> avoid a duplicate
        setMessages((prev) => (prev.some((m) => m.id === data.id)
          ? prev.filter((m) => m.id !== tempId)
          : prev.map((m) => (m.id === tempId ? data : m))));

        // move this chat to the top of the Messages list (like Messenger) + update its preview
        setLiveMeta((prev) => ({
          ...prev,
          [selectedContact.id]: {
            preview: `You: ${previewText(finalContent, uploadedFileUrl)}`,
            at: data.created_at || new Date().toISOString(),
            unread: false,
          },
        }));

        if (selectedContact.type === 'session' && selectedContact.userId && selectedContact.userId !== currentUserId) {
          const { data: actor } = await supabase.from('user_profiles').select('full_name').eq('id', currentUserId).maybeSingle();
          const actorName = actor?.full_name || 'Someone';
          const preview = stripReplyPrefix(finalContent || '').trim().replace(/\s+/g, ' ');
          const excerpt = preview
            ? `: “${preview.slice(0, 90)}${preview.length > 90 ? '…' : ''}”`
            : uploadedFileUrl ? ': Sent an attachment' : '';
          const { error: notificationError } = await supabase.from('notifications').insert({
            user_id: selectedContact.userId,
            type: 'message',
            content: `${actorName} ${isReplyToMessage ? 'replied to your message' : 'sent you a message'}${excerpt}`,
            link_url: `/messages?session=${data.session_id}&message=${data.id}`,
            is_read: false,
          });
          if (notificationError) console.error('Could not create message notification:', notificationError);
        }
      }
    } catch (e) {
      console.error('Attachment / send failed:', e);
      Alert.alert('Failed to upload attachment.', e?.message || undefined);
    }
    finally { setUploadingFile(false); }
  };

  const handleSend = () => {
    if (!newMessage.trim() && !selectedFile) return;
    executeMessageSend(newMessage.trim());
  };
  const handleQuickLike = () => executeMessageSend('💚');

  const handleDeleteMessage = async (messageId) => {
    if (!(await confirmAsync('Delete message', 'Delete this message?', 'Delete', true))) return;
    setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, is_deleted: true, content: 'This message was deleted', file_url: null } : m)));
    const { error: updateError } = await supabase.from('messages')
      .update({ is_deleted: true, content: 'This message was deleted', file_url: null })
      .eq('id', messageId).eq('sender_id', currentUserId);
    if (updateError) {
      await supabase.from('messages').delete().eq('id', messageId).eq('sender_id', currentUserId);
      await fetchMessages(selectedContact);
    }
  };

  const openMessageMenu = (msg) => {
    if (msg.is_deleted) return;
    const isMe = msg.sender_id === currentUserId;
    const senderName = isMe ? 'You' : selectedContact?.name || 'Them';
    const buttons = [{ text: 'Reply', onPress: () => setReplyingTo({ id: msg.id, content: msg.content, senderName }) }];
    if (isMe) buttons.push({ text: 'Delete', style: 'destructive', onPress: () => handleDeleteMessage(msg.id) });
    buttons.push({ text: 'Cancel', style: 'cancel' });
    Alert.alert('Message', undefined, buttons);
  };

  // ─── ticket rating
  const handleRateTicket = async (stars) => {
    if (isSubmittingRating || !selectedContact || selectedContact.type !== 'ticket') return;
    setIsSubmittingRating(true);
    const { error } = await supabase.from('support_tickets').update({ rating: stars }).eq('id', selectedContact.id);
    if (!error) {
      setSelectedContact((prev) => ({ ...prev, rating: stars }));
      setContacts((prev) => prev.map((c) => (c.id === selectedContact.id ? { ...c, rating: stars } : c)));
    } else Alert.alert('Failed to submit rating.');
    setIsSubmittingRating(false);
  };

  // ─── quick session actions (banner)
  const quickUpdateStatus = async (newStatus) => {
    if (!selectedContact || selectedContact.type !== 'session') return;
    const { data: session, error: sessionError } = await supabase.from('sessions')
      .select(`*, instructor:user_profiles!instructor_id(id,full_name), student:user_profiles!student_id(id,full_name)`)
      .eq('id', selectedContact.id).single();
    if (sessionError || !session) {
      Alert.alert('Cannot verify the current session. Refresh and try again.');
      return;
    }
    if (newStatus === 'upcoming' &&
        (!['pending', 'reschedule_proposed'].includes(session.status) ||
          isExpiredSchedule(session.scheduled_date, session.scheduled_time))) {
      Alert.alert('Schedule expired or changed. Open Manage to review refund options.');
      await fetchContacts(currentUserId);
      return;
    }

    const { error } = await supabase.from('sessions').update({ status: newStatus })
      .eq('id', selectedContact.id).eq('status', session.status);
    if (!error) {
      if (newStatus === 'upcoming' && session) {
        const isInstructorAction = session.instructor_id === currentUserId;
        const targetUserId = isInstructorAction ? session.student_id : session.instructor_id;
        const actorName = isInstructorAction ? session.instructor?.full_name || 'The teacher' : session.student?.full_name || 'The learner';
        await supabase.from('notifications').insert([{
          user_id: targetUserId, type: 'booking_accepted',
          content: `${actorName} has confirmed the schedule for the session. It is now upcoming!`,
          link_url: `/sessions?session=${session.id}`,
        }]);
      }
    } else Alert.alert('Failed to update status.');
  };

  const handleQuickMarkDone = async () => {
    setIsProcessingDone(true);
    const { data: session, error } = await supabase.from('sessions')
      .select(`*, instructor:user_profiles!instructor_id(id,full_name), student:user_profiles!student_id(id,full_name)`)
      .eq('id', selectedContact.id).single();
    if (error || !session) { setIsProcessingDone(false); return; }

    const isInstructor = session.instructor_id === currentUserId;
    const myCompletedLocal = isInstructor ? session.instructor_completed : session.student_completed;
    const otherCompletedLocal = isInstructor ? session.student_completed : session.instructor_completed;

    if (myCompletedLocal) {
      Alert.alert('You have already marked this as done! Waiting for your partner.');
      setIsProcessingDone(false);
      return;
    }

    try {
      if (!(await confirmAsync('Mark as done', 'Mark session as done?'))) return;
      const { data: outcome, error: completionError } = await supabase.rpc('confirm_session_completion', {
        p_session_id: session.id,
      });
      if (completionError) throw completionError;
      if (!outcome || !['waiting', 'completed'].includes(outcome.state)) {
        throw new Error('Unexpected completion response. Refresh the session before retrying.');
      }

      if (outcome.state === 'completed' && outcome.awarded === true) {
        DeviceEventEmitter.emit('credit_updated');
        const { error: noticeError } = await supabase.from('notifications').insert([
          {
            user_id: session.student_id, type: 'session_completed',
            content: `Your session with ${session.instructor?.full_name || 'the teacher'} is officially completed!`,
            link_url: `/sessions?session=${session.id}`,
          },
          {
            user_id: session.instructor_id, type: 'session_completed',
            content: `Your session with ${session.student?.full_name || 'the learner'} is officially completed! ${session.credit_amount} CR added.`,
            link_url: `/sessions?session=${session.id}`,
          },
        ]);
        if (noticeError) console.error('Completion notification failed (credits already awarded):', noticeError);
      } else if (outcome.state === 'waiting' && outcome.new_confirmation === true) {
        const targetUserId = isInstructor ? session.student_id : session.instructor_id;
        const actorName = isInstructor ? session.instructor?.full_name || 'The teacher' : session.student?.full_name || 'The learner';
        const { error: noticeError } = await supabase.from('notifications').insert([{
          user_id: targetUserId, type: 'session_update',
          content: `${actorName} has marked the session as done. Please confirm to finalize the completion.`,
          link_url: `/sessions?session=${session.id}`,
        }]);
        if (noticeError) console.error('Session confirmation notification failed:', noticeError);
        Alert.alert('Marked as done! Waiting for partner confirmation.');
      }
      const { data: updated, error: refreshError } = await supabase.from('sessions')
        .select('status,student_completed,instructor_completed')
        .eq('id', session.id).maybeSingle();
      if (refreshError) console.error('Could not refresh session flags:', refreshError);
      if (updated) {
        const synced = {
          sessionStatus: updated.status,
          studentCompleted: updated.student_completed,
          instructorCompleted: updated.instructor_completed,
        };
        setSelectedContact(previous => previous?.id === session.id ? { ...previous, ...synced } : previous);
        setContacts(previous => previous.map(contact => contact.id === session.id ? { ...contact, ...synced } : contact));
      }
    } catch (err) {
      console.error('Chat quick completion failed:', err);
      Alert.alert('Error', err?.message || 'Could not mark this session as done.');
    } finally {
      setIsProcessingDone(false);
    }
  };

  // ─── ⋯ menu (replaces the web's right info panel)
  const openChatMenu = () => {
    if (!selectedContact) return;
    const muted = mutedContacts[selectedContact.id];
    const buttons = [];
    if (selectedContact.userId !== 'support') {
      buttons.push({ text: 'Visit profile', onPress: () => navigation.navigate('PublicProfile', { id: selectedContact.userId }) });
    }
    buttons.push({ text: muted ? 'Unmute' : 'Mute', onPress: () => setMutedContacts((p) => ({ ...p, [selectedContact.id]: !p[selectedContact.id] })) });
    buttons.push({ text: 'Cancel', style: 'cancel' });
    Alert.alert(selectedContact.name,
      `${selectedContact.skillCategory} · ${selectedContact.sessionStatus} · ${messages.length} messages`, buttons);
  };

  // ─── derived
  const filteredContacts = contacts
    .filter((c) => {
      const q = searchQuery.toLowerCase();
      return (c.name.toLowerCase().includes(q) || c.skillCategory.toLowerCase().includes(q)) && (TAB_FILTERS[activeTab]?.(c) ?? true);
    })
    .sort((a, b) => new Date(liveMeta[b.id]?.at || b.sortDate) - new Date(liveMeta[a.id]?.at || a.sortDate));

  if (loadingContacts) return <UserScreenSkeleton type="chat" />;

  // ═══════════════ LIST VIEW (the UserLayout top bar sits above it, so no extra top padding)
  if (!selectedContact) {
    return (
      <View style={{ flex: 1, backgroundColor: '#fff' }}>
        <Reveal delay={90}><View style={s.listTop}>
          <View style={s.searchBox}>
            <Search size={18} color={T.sub} />
            <TextInput value={searchQuery} onChangeText={setSearchQuery} placeholder="Search chats"
              placeholderTextColor={T.sub} style={{ flex: 1, fontSize: 15, color: T.text, paddingVertical: 0 }} />
            {!!searchQuery && <Pressable onPress={() => setSearchQuery('')} hitSlop={8}><X size={17} color={T.sub} /></Pressable>}
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingTop: 12 }}>
            {TABS.map((tab) => (
              <Pressable key={tab} onPress={() => setActiveTab(tab)} style={[s.chip, activeTab === tab && s.chipOn]}>
                <Text style={[s.chipText, activeTab === tab && { color: '#fff' }]}>{tab}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View></Reveal>

        <ScrollView contentContainerStyle={{ paddingBottom: 140 }}>
          {/* Skiro AI has its own secure Edge Function and saved conversation history. */}
          <Pressable onPress={() => navigation.navigate('SkiroAI')}
            style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: T.line, backgroundColor: '#f0fdf4' }}>
            <View style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}>
              <SkiroMascot size={46} mood="idle" />
            </View>
            <View style={{ flex: 1, paddingHorizontal: 12 }}>
              <Text style={{ fontSize: 16, fontWeight: '800', color: T.text }}>Skiro AI</Text>
              <Text style={{ fontSize: 12, color: T.sub, marginTop: 3 }}>Ask about skills, sessions, your wallet and more</Text>
            </View>
            <ChevronRight size={20} color={T.brand} />
          </Pressable>
          {filteredContacts.length === 0 ? (
            <View style={s.empty}>
              <MessageSquare size={40} color={T.border} />
              <Text style={s.emptyTitle}>No chats yet</Text>
              <Text style={s.emptySub}>Book a session to start chatting.</Text>
            </View>
          ) : filteredContacts.map((c) => {
            const closed = isClosedStatus(c.sessionStatus);
            const meta = liveMeta[c.id];
            const unread = !!meta?.unread;
            return (
              <Pressable key={c.id} onPress={() => openContact(c)} style={({ pressed }) => [s.row, pressed && { backgroundColor: '#f7f9f9' }]}>
                <View>
                  <Avatar contact={c} size={48} />
                  {!closed && <View style={s.onlineDot} />}
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={[s.rowName, closed && { color: T.sub }, unread && { fontWeight: '800', color: T.text }]} numberOfLines={1}>{c.name}</Text>
                    {mutedContacts[c.id] && <BellOff size={13} color={T.sub} />}
                  </View>
                  <Text style={[s.rowSub, unread && { color: T.text, fontWeight: '800' }]} numberOfLines={1}>
                    {meta?.preview || c.skillCategory}
                  </Text>
                </View>
                {unread ? <View style={s.unreadDot} /> : closed ? <Lock size={15} color={T.sub} /> : null}
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    );
  }

  // ═══════════════ CHAT VIEW
  const isClosed = isClosedStatus(selectedContact.sessionStatus);
  const isMuted = mutedContacts[selectedContact.id];
  const myCompleted = selectedContact.isInstructor ? selectedContact.instructorCompleted : selectedContact.studentCompleted;
  const otherCompleted = selectedContact.isInstructor ? selectedContact.studentCompleted : selectedContact.instructorCompleted;
  const st = selectedContact.sessionStatus;
  const scheduleExpired = isExpiredSchedule(selectedContact.scheduledDate, selectedContact.scheduledTime);
  const showBanner = selectedContact.type === 'session'
    && (['pending', 'reschedule_proposed'].includes(st) || (st === 'active' && (myCompleted || otherCompleted)));
  const bannerActive = st === 'active';

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: '#fff' }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      {/* chat header (person, not a page title) */}
      <View style={[s.chatHead, { paddingTop: insets.top + 6 }]}>
        <Pressable onPress={() => setSelectedContact(null)} hitSlop={10} style={{ padding: 4 }}><ArrowLeft size={22} color={T.text} /></Pressable>
        <Pressable
          onPress={() => selectedContact.userId !== 'support' && navigation.navigate('PublicProfile', { id: selectedContact.userId })}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
          <View>
            <Avatar contact={selectedContact} size={36} />
            {!isClosed && <View style={[s.onlineDot, { width: 11, height: 11 }]} />}
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={s.chatName} numberOfLines={1}>{selectedContact.name}</Text>
              {isMuted && <BellOff size={13} color={T.sub} />}
            </View>
            <Text style={[s.chatStatus, !isClosed && { color: T.brand }]}>{isClosed ? 'Closed' : 'Active now'}</Text>
          </View>
        </Pressable>
        <Pressable onPress={openChatMenu} hitSlop={10} style={{ padding: 6 }}><MoreVertical size={20} color={T.text} /></Pressable>
      </View>

      {/* session action banner (one primary action) */}
      {showBanner && (
        <View style={[s.banner, bannerActive ? { backgroundColor: '#f0f9ff' } : { backgroundColor: '#eef2ff' }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <CalendarDays size={16} color={bannerActive ? '#0369a1' : '#4338ca'} />
            <Text style={{ flex: 1, fontSize: 13, lineHeight: 18, color: bannerActive ? '#075985' : '#3730a3', fontWeight: '500' }}>
              {['pending', 'reschedule_proposed'].includes(st) && scheduleExpired && '⏰ Schedule expired. Open Manage for refund options.'}
              {!scheduleExpired && st === 'pending' && selectedContact.role === 'Teacher' && "⏳ Waiting for the teacher's confirmation."}
              {!scheduleExpired && st === 'pending' && selectedContact.role === 'Student' && '📅 Booking request. Confirm the schedule?'}
              {!scheduleExpired && st === 'reschedule_proposed' && selectedContact.role === 'Teacher' && '📅 The teacher proposed a new time.'}
              {!scheduleExpired && st === 'reschedule_proposed' && selectedContact.role === 'Student' && "⏳ Waiting for the learner's confirmation on the new time."}
              {st === 'active' && otherCompleted && !myCompleted && `✨ ${selectedContact.name} marked this as done. Confirm to finish.`}
              {st === 'active' && myCompleted && `⏳ Waiting for ${selectedContact.name} to confirm.`}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
            {st === 'pending' && !scheduleExpired && selectedContact.role === 'Student' && (
              <Pressable onPress={() => quickUpdateStatus('upcoming')} style={[s.bannerBtn, { backgroundColor: '#4338ca' }]}>
                <Text style={s.bannerBtnText}>Confirm schedule</Text>
              </Pressable>
            )}
            {st === 'reschedule_proposed' && !scheduleExpired && selectedContact.role === 'Teacher' && (
              <Pressable onPress={() => quickUpdateStatus('upcoming')} style={[s.bannerBtn, { backgroundColor: '#4338ca' }]}>
                <Text style={s.bannerBtnText}>Accept schedule</Text>
              </Pressable>
            )}
            {st === 'active' && otherCompleted && !myCompleted && (
              <Pressable onPress={handleQuickMarkDone} disabled={isProcessingDone} style={[s.bannerBtn, { backgroundColor: '#0284c7' }, isProcessingDone && { opacity: 0.5 }]}>
                <Text style={s.bannerBtnText}>{isProcessingDone ? 'Processing…' : 'Confirm done'}</Text>
              </Pressable>
            )}
            <Pressable onPress={() => navigation.navigate('Sessions', { session: selectedContact.id })}
              style={[s.bannerBtn, { backgroundColor: '#fff', borderWidth: 1, borderColor: bannerActive ? '#bae6fd' : '#c7d2fe' }]}>
              <Text style={[s.bannerBtnText, { color: bannerActive ? '#0369a1' : '#4338ca' }]}>Manage</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* messages */}
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 14, paddingBottom: 8, flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => { if (!focusMessageId) scrollRef.current?.scrollToEnd({ animated: true }); }}
      >
        {loadingMessages ? (
          <UserScreenSkeleton type="thread" embedded />
        ) : messages.length === 0 ? (
          <View style={{ margin: 'auto', alignItems: 'center', paddingVertical: 60 }}>
            <Avatar contact={selectedContact} size={64} />
            <Text style={{ fontSize: 17, fontWeight: '700', color: T.text, marginTop: 12, letterSpacing: -0.2 }}>{selectedContact.name}</Text>
            <Text style={{ fontSize: 13, color: T.sub, marginTop: 2 }}>{selectedContact.skillCategory}</Text>
            <Text style={{ fontSize: 14, color: T.sub, marginTop: 12 }}>Say hello 👋</Text>
          </View>
        ) : messages.map((msg, i) => {
          const isMe = msg.sender_id === currentUserId;
          const reply = !msg.is_deleted ? parseReply(msg.content) : null;
          const bookingData = !msg.is_deleted ? parseBookingRequest(msg.content) : null;
          const bodyText = reply ? stripReplyPrefix(msg.content) : msg.content;
          const hasText = bodyText && bodyText.trim().length > 0 && !bookingData;
          const isImage = msg.file_url && (msg.file_type === 'image' || msg.file_type?.startsWith('image/'));
          const isFile = msg.file_url && !isImage;
          const next = messages[i + 1];
          const showTime = !next || next.sender_id !== msg.sender_id || new Date(next.created_at) - new Date(msg.created_at) > 5 * 60 * 1000;
          const highlighted = highlightMsgId === msg.id;

          // divider above this message: new day -> date, over 1 hour since the last message -> time
          const prevMsg = messages[i - 1];
          const thisDate = new Date(msg.created_at);
          let dividerLabel = null;
          if (!prevMsg || thisDate.toDateString() !== new Date(prevMsg.created_at).toDateString()) {
            dividerLabel = thisDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
          } else if (thisDate - new Date(prevMsg.created_at) > 60 * 60 * 1000) {
            dividerLabel = timeOf(msg.created_at);
          }

          return (
            <Fragment key={msg.id}>
            {dividerLabel && <ChatDivider label={dividerLabel} />}
            <Pressable
              onLayout={(e) => { msgYs.current[msg.id] = e.nativeEvent.layout.y; }}
              onLongPress={() => openMessageMenu(msg)}
              delayLongPress={350}
              style={[s.msgWrap, { alignItems: isMe ? 'flex-end' : 'flex-start' }, highlighted && s.msgHighlight]}
            >
              <View style={{ maxWidth: '80%', alignItems: isMe ? 'flex-end' : 'flex-start', gap: 4 }}>
                {reply && (
                  <Pressable onPress={() => scrollToMessage(reply.id)} style={s.quote}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: T.brand }} numberOfLines={1}>{reply.name}</Text>
                    <Text style={{ fontSize: 13, color: T.sub }} numberOfLines={1}>{reply.snippet || 'Image'}</Text>
                  </Pressable>
                )}

                {isImage && !msg.is_deleted && (
                  <Pressable onPress={() => setViewerImage(msg.file_url)}>
                    <Image source={{ uri: msg.file_url }} style={s.chatImage} resizeMode="cover"
                      onError={(e) => console.warn('Chat image failed to load:', msg.file_url, e.nativeEvent?.error)} />
                  </Pressable>
                )}

                {isFile && !msg.is_deleted && (
                  <Pressable onPress={() => Linking.openURL(msg.file_url)}
                    style={[s.fileBubble, isMe ? { backgroundColor: T.brand } : { backgroundColor: T.field }]}>
                    <FileText size={17} color={isMe ? '#fff' : T.text} />
                    <Text style={{ fontSize: 14, fontWeight: '600', color: isMe ? '#fff' : T.text }}>View attachment</Text>
                  </Pressable>
                )}

                {/* booking request card, then the learner's own note as a normal bubble */}
                {!!bookingData && (
                  <>
                    <View style={[s.bookCard, isMe ? s.bookCardMe : s.bookCardOther]}>
                      <View style={[s.bookHead, { backgroundColor: isMe ? '#f59e0b' : T.text }]}>
                        <CalendarDays size={14} color="#fff" />
                        <Text style={s.bookHeadText}>Booking request</Text>
                      </View>
                      <View style={{ padding: 12, gap: 10 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                          {bookingData.image
                            ? <Image source={{ uri: bookingData.image }} style={s.bookThumb} />
                            : <View style={[s.bookThumb, { backgroundColor: '#fef3c7', alignItems: 'center', justifyContent: 'center' }]}><CalendarDays size={22} color="#f59e0b" /></View>}
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 14, fontWeight: '700', color: T.text }} numberOfLines={1}>{bookingData.title}</Text>
                            <Text style={{ fontSize: 13, color: T.sub, marginTop: 1 }} numberOfLines={1}>
                              {new Date(bookingData.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} · {bookingData.time}
                            </Text>
                            <Text style={{ fontSize: 13, fontWeight: '700', color: T.brand, marginTop: 1 }}>{bookingData.cost} CR</Text>
                          </View>
                        </View>
                        <Pressable onPress={() => navigation.navigate('SkillDetails', { id: bookingData.skill_id })}
                          style={[s.bookBtn, { backgroundColor: isMe ? '#f59e0b' : T.text }]}>
                          <Text style={{ fontSize: 13, fontWeight: '700', color: '#fff' }}>View details</Text>
                        </Pressable>
                      </View>
                    </View>
                    {!!bookingData.userMsg && (
                      <View style={[s.bubble, isMe ? s.bubbleMe : s.bubbleOther]}>
                        <LinkText text={bookingData.userMsg} isMe={isMe} />
                      </View>
                    )}
                  </>
                )}

                {(hasText || msg.is_deleted) && (
                  <View style={[s.bubble, msg.is_deleted ? s.bubbleDeleted : isMe ? s.bubbleMe : s.bubbleOther]}>
                    {msg.is_deleted
                      ? <Text style={{ fontSize: 14, fontStyle: 'italic', color: T.sub }}>This message was deleted</Text>
                      : <LinkText text={bodyText} isMe={isMe} />}
                  </View>
                )}

                {showTime && <Text style={s.time}>{timeOf(msg.created_at)}</Text>}
              </View>
            </Pressable>
            </Fragment>
          );
        })}

        {isContactTyping && <TypingDots />}
      </ScrollView>

      {/* footer */}
      {isClosed ? (
        <View style={[s.closedBar, { paddingBottom: insets.bottom + 14 }]}>
          {selectedContact.type === 'ticket' && selectedContact.sessionStatus === 'resolved' ? (
            selectedContact.rating ? (
              <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: T.sub, marginBottom: 6 }}>Issue resolved · Your rating</Text>
                <View style={{ flexDirection: 'row', gap: 4 }}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <Star key={n} size={24} color={n <= selectedContact.rating ? '#fbbf24' : T.border} fill={n <= selectedContact.rating ? '#fbbf24' : 'none'} />
                  ))}
                </View>
              </View>
            ) : (
              <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: T.text, marginBottom: 8 }}>How was your support experience?</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <Pressable key={n} disabled={isSubmittingRating} onPress={() => handleRateTicket(n)} hitSlop={4}>
                      <Star size={32} color={T.border} fill="#f7f9f9" />
                    </Pressable>
                  ))}
                </View>
              </View>
            )
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Lock size={15} color={T.sub} />
              <Text style={{ fontSize: 14, fontWeight: '600', color: T.sub }}>This conversation is closed</Text>
            </View>
          )}
        </View>
      ) : (
        <View style={[s.inputWrap, { paddingBottom: insets.bottom + 8 }]}>
          {replyingTo && (
            <View style={s.replyBar}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: T.brand }}>Replying to {replyingTo.senderName}</Text>
                <Text style={{ fontSize: 13, color: T.sub }} numberOfLines={1}>
                  {(replyingTo.content || '').replace(/^__REPLY__:[\s\S]*?::__\n/, '').slice(0, 80) || 'Image'}
                </Text>
              </View>
              <Pressable onPress={() => setReplyingTo(null)} hitSlop={10}><X size={18} color={T.sub} /></Pressable>
            </View>
          )}

          {selectedFile && (
            <View style={s.fileChip}>
              {selectedFile.isImage
                ? <Image source={{ uri: selectedFile.uri }} style={{ width: 40, height: 40, borderRadius: 10 }} />
                : <View style={s.fileIcon}><FileText size={19} color={T.brand} /></View>}
              <Text style={{ flex: 1, fontSize: 13, fontWeight: '600', color: T.text }} numberOfLines={1}>{selectedFile.name}</Text>
              <Pressable onPress={() => setSelectedFile(null)} hitSlop={10}><X size={18} color={T.sub} /></Pressable>
            </View>
          )}

          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6 }}>
            <Pressable onPress={openAttach} style={s.iconBtn} hitSlop={4}><ImagePlus size={22} color={T.brand} /></Pressable>
            <TextInput
              value={newMessage}
              onChangeText={handleTyping}
              placeholder={replyingTo ? `Reply to ${replyingTo.senderName}…` : 'Aa'}
              placeholderTextColor={T.sub}
              multiline
              style={s.input}
            />
            {newMessage.trim() || selectedFile ? (
              <PressScale onPress={handleSend} disabled={uploadingFile} style={[s.sendBtn, uploadingFile && { opacity: 0.5 }]}>
                {uploadingFile ? <ActivityIndicator color="#fff" size="small" /> : <Send size={18} color="#fff" />}
              </PressScale>
            ) : (
              <Pressable onPress={handleQuickLike} style={s.iconBtn} hitSlop={4}>
                <Heart size={24} color={T.brand} fill="#10b981" />
              </Pressable>
            )}
          </View>
        </View>
      )}

      {/* image viewer */}
      <Modal visible={!!viewerImage} transparent animationType="fade" onRequestClose={() => setViewerImage(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center' }}>
          <Pressable onPress={() => setViewerImage(null)} style={[s.viewerClose, { top: insets.top + 10 }]} hitSlop={10}>
            <X size={22} color="#fff" />
          </Pressable>
          {!!viewerImage && <Image source={{ uri: viewerImage }} style={{ width: '100%', height: '80%' }} resizeMode="contain" />}
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  // list
  listTop: { paddingHorizontal: 16, borderBottomWidth: 1, backgroundColor: '#F6FBF8', paddingTop: 16, paddingBottom: 15, borderBottomColor: '#DFEDE5'},
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#DAEAE0', borderRadius: 17, height: 47},
  chip: { justifyContent: 'center', paddingHorizontal: 14, height: 34, borderRadius: 15, backgroundColor: '#E9F4ED'},
  chipOn: { backgroundColor: T.text },
  chipText: { fontSize: 13, fontWeight: '600', color: T.text },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#E7F0EB', paddingVertical: 15, backgroundColor: '#FFFFFF'},
  rowName: { fontSize: 15, color: T.text, flexShrink: 1 , fontWeight: '800', letterSpacing: -0.2},
  rowSub: { fontSize: 13, color: T.sub, marginTop: 2 },
  onlineDot: { position: 'absolute', right: 0, bottom: 0, width: 12, height: 12, borderRadius: 6, backgroundColor: '#10b981', borderWidth: 2, borderColor: '#fff' },
  unreadDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: T.brand },
  empty: { alignItems: 'center', paddingVertical: 72, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: T.text, marginTop: 12 },
  emptySub: { fontSize: 14, color: T.sub, marginTop: 4, textAlign: 'center' },

  // chat header + banner
  chatHead: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, borderBottomWidth: 1, backgroundColor: '#F7FBF9', borderBottomColor: '#DCECE3', paddingBottom: 13},
  chatName: { fontSize: 15, fontWeight: '700', color: T.text, flexShrink: 1 },
  chatStatus: { fontSize: 13, color: T.sub },
  banner: { paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, backgroundColor: '#F3FAF5', borderBottomColor: '#DCEFE3'},
  bannerBtn: { paddingHorizontal: 14, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  bannerBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },

  // messages
  msgWrap: { width: '100%', marginBottom: 4, borderRadius: 16 },
  msgHighlight: { backgroundColor: T.soft },
  bubble: { borderRadius: 19, paddingVertical: 11, paddingHorizontal: 15},
  bubbleMe: { backgroundColor: T.brand, borderBottomRightRadius: 4 },
  bubbleOther: { borderBottomLeftRadius: 4 , backgroundColor: '#EFF6F2'},
  bubbleDeleted: { backgroundColor: '#f7f9f9' },
  time: { fontSize: 12, color: T.sub, marginHorizontal: 6, marginBottom: 6 },
  quote: { borderLeftWidth: 3, borderLeftColor: T.brand, backgroundColor: T.field, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7, maxWidth: '100%' },
  chatImage: { width: 220, height: 220, borderRadius: 14, backgroundColor: T.field },
  fileBubble: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 11, borderRadius: 18 },
  typing: { flexDirection: 'row', gap: 5, alignSelf: 'flex-start', backgroundColor: T.field, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 13, marginTop: 4 },
  typingDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: T.sub },

  // booking request card
  bookCard: { width: 250, overflow: 'hidden', borderWidth: 1 , borderRadius: 19, borderColor: '#D9ECE2'},
  bookCardMe: { backgroundColor: '#fffbeb', borderColor: '#fde68a' },
  bookCardOther: { backgroundColor: '#fff', borderColor: T.line },
  bookHead: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 30 },
  bookHeadText: { fontSize: 12, fontWeight: '700', color: '#fff' },
  bookThumb: { width: 48, height: 48, borderRadius: 10, backgroundColor: T.field },
  bookBtn: { height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },

  // input
  inputWrap: { paddingHorizontal: 12, paddingTop: 8, borderTopWidth: 1, borderTopColor: T.line, backgroundColor: '#fff' },
  input: { flex: 1, minHeight: 42, maxHeight: 120, backgroundColor: T.field, borderRadius: 21, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 10, fontSize: 15, color: T.text },
  iconBtn: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  sendBtn: { backgroundColor: T.brand, alignItems: 'center', justifyContent: 'center', marginBottom: 1 , borderRadius: 16, height: 43, width: 43},
  replyBar: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: T.soft, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9, marginBottom: 8 },
  fileChip: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#f7f9f9', borderWidth: 1, borderColor: T.line, borderRadius: 12, padding: 8, marginBottom: 8 },
  fileIcon: { width: 40, height: 40, borderRadius: 10, backgroundColor: T.soft, alignItems: 'center', justifyContent: 'center' },
  closedBar: { alignItems: 'center', justifyContent: 'center', paddingTop: 16, borderTopWidth: 1, borderTopColor: T.line, backgroundColor: '#fff' },
  viewerClose: { position: 'absolute', right: 16, zIndex: 5, width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
});