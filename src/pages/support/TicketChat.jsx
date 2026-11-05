// ═══════════════════════════════════════════════════════════════
//  MOBILE APP (Expo React Native) — src/pages/support/TicketChat.jsx
//  Mobile version of the web TicketChat. Same data + rules:
//    • ticket (with requester + assigned agent), requester's ticket stats, live messages
//    • Claim ticket → assigned_to = me, status in_progress, TICKET_CLAIMED log
//    • Release to queue → assigned_to null, status open, TICKET_RELEASED log
//    • status change; "resolved" notifies the customer and writes a RESOLVE_TICKET log
//    • reply: message + support_reply notification (link /messages?ticket=<id>), quick replies
//    • only the assigned agent can reply / change status; resolved tickets are read-only
//    • follow the newest message, or show "New message · Jump to latest"
//    • live: new messages (INSERT) and ticket changes (UPDATE) for this ticket
//  Mobile differences: this screen is a root-stack screen, so the native header carries the back
//  button, the customer's name and the Details button; the side panel (customer profile + ticket
//  controls) became a "Details" bottom sheet; the quick-reply dropdown became a bottom sheet;
//  Enter adds a new line (use Send). The keyboard pushes the reply box up (it never covers it).
//  Opened with navigate('TicketChat', { id }) — `ticketId` works too.
//  Yellow support theme, compact X-style typography (as UserDashboard).
// ═══════════════════════════════════════════════════════════════
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  View, Text, Image, Pressable, ScrollView, TextInput, Modal, Alert, Linking, AppState, DeviceEventEmitter,
  ActivityIndicator, Keyboard, KeyboardAvoidingView, Platform, StyleSheet,
} from 'react-native';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { useHeaderHeight } from '@react-navigation/elements';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowDown, ArrowRight, Check, CheckCircle2, ChevronDown, Clock3, FileText, Headphones, Info, Lock, RotateCcw,
  Send, ShieldCheck, Sparkles, Ticket, UserRound, X,
} from 'lucide-react-native';
import supabase from '../../supabaseClient';

const T = {
  text: '#0f1419', sub: '#536471', line: '#eff3f4', border: '#cfd9de', field: '#eff3f4',
};
// the support (yellow) accent from the web page
const Y = { btn: '#facc15', btnPress: '#eab308', soft: '#fefce8', light: '#fef9c3', text: '#854d0e', border: '#fde047' };

// where a closed / missing ticket sends you back to (the Ticket queue lives inside 'Support')
const FALLBACK_ROUTE = 'Support';

const CANNED_REPLIES = {
  'Greetings & Acknowledgments': [
    'Hello, thank you for contacting Support. I have taken ownership of your ticket.',
    'Hi, I am currently reviewing your inquiry and will provide an update shortly.',
  ],
  'Investigation & Triage': [
    'I am currently looking into this issue. Please allow me a few moments.',
    'Could you please provide a screenshot or further details regarding the error?',
    'To assist you better, can you confirm the exact time this issue occurred?',
  ],
  'Resolution & Closing': [
    'We have applied a fix for your reported issue. Kindly verify on your end.',
    'Your request has been successfully processed.',
    'I am marking this ticket as resolved. Please feel free to open a new ticket if further assistance is required.',
  ],
};

const STATUS_LOOK = {
  open:        { label: 'Open',        bg: '#fffbeb', fg: '#92400e', dot: '#f59e0b' },
  in_progress: { label: 'In progress', bg: '#eff6ff', fg: '#1e40af', dot: '#3b82f6' },
  resolved:    { label: 'Resolved',    bg: '#ecfdf5', fg: '#065f46', dot: '#10b981' },
};

const fmtDateTime = (iso) => new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });

export default function TicketChat() {
  const navigation = useNavigation();
  const route = useRoute();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const ticketId = route.params?.ticketId ?? route.params?.id;

  const [currentUserId, setCurrentUserId] = useState(null);
  const [currentUserProfile, setCurrentUserProfile] = useState(null);
  const [ticket, setTicket] = useState(null);
  const [newMessage, setNewMessage] = useState('');
  const [chatMessages, setChatMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [userStats, setUserStats] = useState({ total: 0, resolved: 0, open: 0 });
  const [isSending, setIsSending] = useState(false);

  // lightbox viewer for customer screenshots
  const [previewImage, setPreviewImage] = useState(null);
  const [showDetails, setShowDetails] = useState(false);
  const [showCanned, setShowCanned] = useState(false);

  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const shouldFollowMessagesRef = useRef(true);
  const lastMessageIdRef = useRef(null);
  const mounted = useRef(true);
  const [hasNewMessages, setHasNewMessages] = useState(false);
  const [kbVisible, setKbVisible] = useState(false);

  // keep the newest message in view when the keyboard opens
  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvt, () => {
      setKbVisible(true);
      if (shouldFollowMessagesRef.current) setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 120);
    });
    const hideSub = Keyboard.addListener(hideEvt, () => setKbVisible(false));
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

  // tell SupportLayout which ticket is open (so it does not toast about it)
  useFocusEffect(useCallback(() => {
    DeviceEventEmitter.emit('ticket_chat_open', ticketId);
    return () => DeviceEventEmitter.emit('ticket_chat_open', null);
  }, [ticketId]));

  const leave = useCallback(() => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate(FALLBACK_ROUTE);
  }, [navigation]);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: ticket?.user?.full_name || 'Ticket',
      headerTitleStyle: { fontSize: 17, fontWeight: '700', color: T.text },
      headerShadowVisible: false,
      headerRight: ticket
        ? () => (
          <Pressable onPress={() => setShowDetails(true)} hitSlop={10} accessibilityLabel="Ticket details" style={s.headerBtn}>
            <Info size={22} color={T.text} />
          </Pressable>
        )
        : undefined,
    });
  }, [navigation, ticket?.user?.full_name, !!ticket]);

  const resolveAttachmentUrl = (pathOrUrl) => {
    if (!pathOrUrl) return null;
    if (typeof pathOrUrl === 'string' && (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://') || pathOrUrl.startsWith('data:'))) {
      return pathOrUrl;
    }
    const { data } = supabase.storage.from('chat-attachments').getPublicUrl(pathOrUrl);
    return data?.publicUrl || pathOrUrl;
  };

  const isImageFile = (url, fileType) => {
    if (fileType && fileType.startsWith('image/')) return true;
    if (!url) return false;
    return /\.(jpg|jpeg|png|webp|gif|svg)($|\?)/i.test(url);
  };

  // ─── same queries as the web
  const fetchLiveMessages = useCallback(async () => {
    const { data, error } = await supabase
      .from('messages')
      .select('*, sender:user_profiles!messages_sender_id_fkey(full_name, avatar_url)')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: true });

    if (!error && data && mounted.current) {
      setChatMessages(data);
    }
  }, [ticketId]);

  const fetchTicketDetails = useCallback(async () => {
    const { data: ticketData, error: ticketError } = await supabase
      .from('support_tickets')
      .select(`
        *, 
        user:user_profiles!support_tickets_user_id_fkey(id, full_name, avatar_url), 
        agent:user_profiles!support_tickets_assigned_to_fkey(id, full_name)
      `)
      .eq('id', ticketId)
      .single();

    if (ticketError || !ticketData) {
      console.error('DB ERROR FETCHING TICKET:', ticketError);
      leave();
      return;
    }

    if (!mounted.current) return;
    setTicket(ticketData);

    const { data: userTickets } = await supabase
      .from('support_tickets')
      .select('status')
      .eq('user_id', ticketData.user_id);

    if (userTickets && mounted.current) {
      setUserStats({
        total: userTickets.length,
        resolved: userTickets.filter((t) => t.status === 'resolved').length,
        open: userTickets.filter((t) => t.status === 'open' || t.status === 'in_progress').length,
      });
    }
  }, [ticketId, leave]);

  // ─── first load + live updates
  useEffect(() => {
    mounted.current = true;
    let msgChannel = null;
    let ticketChannel = null;
    const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    const init = async () => {
      setLoading(true);
      setTicket(null);
      setChatMessages([]);
      lastMessageIdRef.current = null;
      shouldFollowMessagesRef.current = true;
      setHasNewMessages(false);
      const { data: { user } } = await supabase.auth.getUser();
      if (!mounted.current) return;
      setCurrentUserId(user?.id);

      if (user) {
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('full_name')
          .eq('id', user.id)
          .single();
        if (mounted.current) setCurrentUserProfile(profile);
      }

      await fetchTicketDetails();
      await fetchLiveMessages();
      if (!mounted.current) return;
      setLoading(false);

      msgChannel = supabase.channel(`ticket_chat_${ticketId}_${suffix}`)
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `ticket_id=eq.${ticketId}`,
        }, () => {
          fetchLiveMessages();
        })
        .subscribe();

      ticketChannel = supabase.channel(`ticket_status_${ticketId}_${suffix}`)
        .on('postgres_changes', {
          event: 'UPDATE',
          schema: 'public',
          table: 'support_tickets',
          filter: `id=eq.${ticketId}`,
        }, () => {
          fetchTicketDetails();
        })
        .subscribe();
    };

    init().catch((e) => { console.error('Ticket chat init failed:', e); if (mounted.current) setLoading(false); });

    // back from the background: sockets may have slept, so catch up
    const appSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') { fetchTicketDetails(); fetchLiveMessages(); }
    });

    return () => {
      mounted.current = false;
      appSub.remove();
      if (msgChannel) supabase.removeChannel(msgChannel);
      if (ticketChannel) supabase.removeChannel(ticketChannel);
    };
  }, [ticketId, fetchTicketDetails, fetchLiveMessages]);

  // ─── follow the newest message, or offer "Jump to latest" (same behaviour as the web)
  useEffect(() => {
    const latestMessage = chatMessages[chatMessages.length - 1];
    if (!latestMessage || latestMessage.id === lastMessageIdRef.current) return;

    const isInitialLoad = lastMessageIdRef.current === null;
    lastMessageIdRef.current = latestMessage.id;

    if (isInitialLoad) {
      // twice: images can change the height a moment later
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 60);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 350);
      return;
    }

    if (shouldFollowMessagesRef.current) {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 60);
    } else {
      setHasNewMessages(true);
    }
  }, [chatMessages]);

  const handleConversationScroll = (e) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const isNearLatest = contentSize.height - contentOffset.y - layoutMeasurement.height < 120;
    shouldFollowMessagesRef.current = isNearLatest;
    if (isNearLatest) setHasNewMessages(false);
  };

  const jumpToLatest = () => {
    shouldFollowMessagesRef.current = true;
    setHasNewMessages(false);
    scrollRef.current?.scrollToEnd({ animated: true });
  };

  // ─── workflow actions (same as the web)
  const handleClaimTicket = async () => {
    const { error } = await supabase
      .from('support_tickets')
      .update({ assigned_to: currentUserId, status: 'in_progress' })
      .eq('id', ticket.id);

    if (!error) {
      // ─── RECORD ACTION TO SUPPORT_LOGS ───
      await supabase.from('support_logs').insert([{
        support_id: currentUserId,
        target_user_id: ticket.user_id,
        action_type: 'TICKET_CLAIMED',
        ticket_id: ticket.id,
        details: `Started investigating Ticket #${ticket.id.split('-')[0]} (Subject: ${ticket.subject}).`,
      }]);

      setTicket((prev) => ({
        ...prev,
        assigned_to: currentUserId,
        status: 'in_progress',
        agent: { id: currentUserId, full_name: currentUserProfile?.full_name || 'You' },
      }));
    }
  };

  const handleReleaseTicket = async () => {
    const { error } = await supabase
      .from('support_tickets')
      .update({ assigned_to: null, status: 'open' })
      .eq('id', ticket.id);

    if (!error) {
      // ─── RECORD ACTION TO SUPPORT_LOGS ───
      await supabase.from('support_logs').insert([{
        support_id: currentUserId,
        target_user_id: ticket.user_id,
        action_type: 'TICKET_RELEASED',
        ticket_id: ticket.id,
        details: `Released Ticket #${ticket.id.split('-')[0]} back to the open queue.`,
      }]);

      setTicket((prev) => ({ ...prev, assigned_to: null, status: 'open', agent: null }));
    }
  };

  const updateTicketStatus = async (newStatus) => {
    const { error } = await supabase
      .from('support_tickets')
      .update({ status: newStatus })
      .eq('id', ticket.id);

    if (!error) {
      setTicket((prev) => ({ ...prev, status: newStatus }));

      if (newStatus === 'resolved') {
        // Send Notification to User WITH EXACT LINK_URL
        await supabase.from('notifications').insert([{
          user_id: ticket.user_id,
          type: 'ticket_updated',
          content: `Your support ticket regarding "${ticket.subject}" has been marked as resolved.`,
          link_url: `/messages?ticket=${ticket.id}`,
        }]);

        // ─── RECORD ACTION TO SUPPORT_LOGS ───
        const { error: logErr } = await supabase.from('support_logs').insert([{
          support_id: currentUserId,
          target_user_id: ticket.user_id,
          action_type: 'RESOLVE_TICKET',
          ticket_id: ticket.id,
          details: 'Ticket successfully resolved and closed. Notes: Marked as resolved by assigned agent.',
        }]);

        if (logErr) console.warn('Failed to record action to support_logs:', logErr);
      }
    }
  };

  // a tap on a status row (the web used a <select>); resolving asks first because it closes the chat
  const handleStatusPick = (value) => {
    if (value === ticket.status) return;
    if (value === 'resolved') {
      Alert.alert('Mark as resolved?', 'This closes the conversation and notifies the customer.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Resolve', onPress: () => { updateTicketStatus('resolved'); setShowDetails(false); } },
      ]);
      return;
    }
    updateTicketStatus(value);
  };

  // Quick reply insertion (same text joining as the web)
  const handleCannedReplySelect = (chosenText) => {
    if (!chosenText) return;
    setNewMessage((prev) => (prev ? `${prev.trim()}\n${chosenText}` : chosenText));
    setShowCanned(false);
    setTimeout(() => inputRef.current?.focus(), 350);
  };

  const handleSendReply = async () => {
    if (!newMessage.trim() || !ticket || isSending) return;

    shouldFollowMessagesRef.current = true;
    setHasNewMessages(false);
    setIsSending(true);
    const msgContent = newMessage.trim();

    try {
      const { error } = await supabase
        .from('messages')
        .insert([{
          ticket_id: ticket.id,
          sender_id: currentUserId,
          receiver_id: ticket.user_id,
          content: msgContent,
        }]);

      if (error) throw error;

      // link_url sends the customer to the right ticket chat in the user app
      await supabase.from('notifications').insert([{
        user_id: ticket.user_id,
        type: 'support_reply',
        content: `Support replied to your ticket: "${ticket.subject}"`,
        link_url: `/messages?ticket=${ticket.id}`,
      }]);

      setNewMessage('');
      await fetchLiveMessages();
    } catch (err) {
      console.error('Failed to send message:', err);
      Alert.alert('Error sending message: ' + err.message);
    } finally {
      setIsSending(false);
    }
  };

  if (loading || !ticket) {
    return (
      <View style={s.loadWrap}>
        <View style={s.loadCard}>
          <ActivityIndicator color={Y.btnPress} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: T.text }}>Opening conversation</Text>
            <Text style={s.detail}>Loading ticket details…</Text>
          </View>
        </View>
      </View>
    );
  }

  const isResolved = ticket.status === 'resolved';
  const isUnassigned = !ticket.assigned_to;
  const isAssignedToMe = ticket.assigned_to === currentUserId;
  const isAssignedToOther = Boolean(ticket.assigned_to && ticket.assigned_to !== currentUserId);
  const status = STATUS_LOOK[ticket.status] || STATUS_LOOK.open;
  const statusLocked = !isAssignedToMe || isResolved;
  const statusOptions = [
    ...(ticket.status === 'open' ? [{ value: 'open', label: 'Open · Unassigned' }] : []),
    { value: 'in_progress', label: 'Investigating · In progress' },
    { value: 'resolved', label: 'Resolved · Closed' },
  ];

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#fff' }}
      behavior="padding"
      keyboardVerticalOffset={headerHeight}
    >
      {/* ── ticket info bar (the name + Details button live in the native header above) */}
      <View style={s.infoBar}>
        <View style={{ flex: 1 }}>
          <Text style={s.subject} numberOfLines={1}>{ticket.subject || 'Support request'}</Text>
          <Text style={s.detail} numberOfLines={1}>#{ticket.id.split('-')[0]} · {fmtDateTime(ticket.created_at)}</Text>
        </View>
        <View style={[s.statusPill, { backgroundColor: status.bg }]}>
          <View style={[s.statusDot, { backgroundColor: status.dot }]} />
          <Text style={[s.statusText, { color: status.fg }]}>{status.label}</Text>
        </View>
      </View>

      {/* ── conversation */}
      <View style={{ flex: 1 }}>
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1, backgroundColor: '#f7f9f9' }}
          contentContainerStyle={{ padding: 14, paddingBottom: 18, flexGrow: 1 }}
          onScroll={handleConversationScroll}
          scrollEventThrottle={64}
          keyboardShouldPersistTaps="handled"
        >
          <View style={{ alignItems: 'center', marginBottom: 16 }}>
            <View style={s.startedChip}>
              <Clock3 size={12} color={T.sub} />
              <Text style={s.detail}>
                Conversation started {new Date(ticket.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
              </Text>
            </View>
          </View>

          {chatMessages.length === 0 ? (
            <View style={s.empty}>
              <Headphones size={40} color={T.border} />
              <Text style={s.emptyTitle}>No messages yet</Text>
              <Text style={s.emptySub}>The conversation will appear here when the customer sends a message.</Text>
            </View>
          ) : (
            <View style={{ gap: 14 }}>
              {chatMessages.map((msg) => {
                const isAgentMessage = msg.sender_id !== ticket.user_id;
                const attachmentUrl = resolveAttachmentUrl(msg.file_url);
                const isImage = isImageFile(attachmentUrl, msg.file_type);
                const senderName = isAgentMessage
                  ? (msg.sender?.full_name || (msg.sender_id === currentUserId ? 'You' : 'Support agent'))
                  : (msg.sender?.full_name || ticket.user?.full_name || 'Customer');
                return (
                  <View key={msg.id} style={[s.msgRow, isAgentMessage && { flexDirection: 'row-reverse' }]}>
                    {isAgentMessage ? (
                      <View style={[s.msgAvatar, { backgroundColor: Y.btn }]}><ShieldCheck size={15} color="#111827" /></View>
                    ) : (
                      <View style={[s.msgAvatar, { backgroundColor: '#e5e7eb' }]}>
                        {ticket.user?.avatar_url
                          ? <Image source={{ uri: ticket.user.avatar_url }} style={{ width: 28, height: 28 }} />
                          : <Text style={{ fontSize: 11, fontWeight: '700', color: T.sub }}>{ticket.user?.full_name?.charAt(0) || 'U'}</Text>}
                      </View>
                    )}

                    <View style={{ flexShrink: 1, maxWidth: '82%', alignItems: isAgentMessage ? 'flex-end' : 'flex-start', gap: 4 }}>
                      <Text style={s.detail} numberOfLines={1}>
                        <Text style={{ fontWeight: '700', color: T.text }}>{senderName}</Text> · {isAgentMessage ? 'Support' : 'Requester'}
                      </Text>

                      <View style={[s.bubble, isAgentMessage ? s.bubbleAgent : s.bubbleCustomer]}>
                        {!!msg.content && <Text style={s.bubbleText}>{msg.content}</Text>}
                        {!!attachmentUrl && (
                          <View style={msg.content ? { marginTop: 10 } : null}>
                            {isImage ? (
                              <Pressable onPress={() => setPreviewImage(attachmentUrl)} accessibilityLabel="Preview image attachment">
                                <Image source={{ uri: attachmentUrl }} style={s.attachImage} resizeMode="cover" />
                              </Pressable>
                            ) : (
                              <Pressable onPress={() => Linking.openURL(attachmentUrl)} style={[s.fileBtn, isAgentMessage ? { backgroundColor: 'rgba(0,0,0,0.1)' } : { backgroundColor: T.field }]}>
                                <FileText size={16} color={T.text} />
                                <Text style={{ fontSize: 13, fontWeight: '600', color: T.text }}>View attached document</Text>
                                <ArrowRight size={14} color={T.text} />
                              </Pressable>
                            )}
                          </View>
                        )}
                      </View>

                      <Text style={s.time}>{fmtDateTime(msg.created_at)}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </ScrollView>

        {hasNewMessages && (
          <Pressable onPress={jumpToLatest} style={s.jumpBtn}>
            <ArrowDown size={14} color="#111827" />
            <Text style={s.jumpText}>New message · Jump to latest</Text>
          </Pressable>
        )}
      </View>

      {/* ── composer / state bar */}
      {isResolved ? (
        <View style={[s.stateBar, { backgroundColor: '#ecfdf5', borderTopColor: '#d1fae5', paddingBottom: insets.bottom + 12 }]}>
          <CheckCircle2 size={22} color="#047857" />
          <View style={{ flex: 1 }}>
            <Text style={[s.stateTitle, { color: '#064e3b' }]}>Ticket resolved</Text>
            <Text style={[s.detail, { color: '#047857' }]}>This conversation is closed and archived.</Text>
          </View>
        </View>
      ) : isUnassigned ? (
        <View style={[s.stateBlock, { backgroundColor: '#fffbeb', borderTopColor: '#fde68a', paddingBottom: insets.bottom + 12 }]}>
          <Text style={[s.stateTitle, { color: '#451a03' }]}>This ticket is waiting for an agent</Text>
          <Text style={[s.detail, { color: '#92400e', marginTop: 2 }]}>Claim it to take ownership and reply to the requester.</Text>
          <Pressable onPress={handleClaimTicket} style={({ pressed }) => [s.claimBtn, pressed && { backgroundColor: Y.btnPress }]}>
            <Headphones size={17} color="#111827" />
            <Text style={s.claimText}>Claim ticket</Text>
          </Pressable>
        </View>
      ) : isAssignedToOther ? (
        <View style={[s.stateBar, { backgroundColor: '#eff6ff', borderTopColor: '#dbeafe', paddingBottom: insets.bottom + 12 }]}>
          <Lock size={20} color="#1d4ed8" />
          <View style={{ flex: 1 }}>
            <Text style={[s.stateTitle, { color: '#172554' }]}>Handled by {ticket.agent?.full_name || 'another support agent'}</Text>
            <Text style={[s.detail, { color: '#1e40af' }]}>You can review the conversation, but only the assigned agent can reply.</Text>
          </View>
        </View>
      ) : (
        <View style={[s.composer, { paddingBottom: kbVisible ? 8 : insets.bottom + 8 }]}>
          <Pressable onPress={() => setShowCanned(true)} style={s.quickBtn}>
            <Sparkles size={14} color={Y.text} />
            <Text style={s.quickText}>Quick reply</Text>
            <ChevronDown size={14} color={Y.text} />
          </Pressable>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
            <TextInput
              ref={inputRef}
              value={newMessage}
              onChangeText={setNewMessage}
              placeholder="Write a thoughtful reply…"
              placeholderTextColor={T.sub}
              multiline
              textAlignVertical="top"
              style={s.input}
            />
            <Pressable
              onPress={handleSendReply}
              disabled={isSending || !newMessage.trim()}
              accessibilityLabel="Send reply"
              style={[s.sendBtn, (isSending || !newMessage.trim()) && { opacity: 0.4 }]}
            >
              {isSending ? <ActivityIndicator size="small" color="#111827" /> : <Send size={18} color="#111827" />}
            </Pressable>
          </View>
        </View>
      )}

      {/* ── DETAILS (was the side panel): customer profile + ticket controls */}
      <Modal visible={showDetails} transparent animationType="slide" onRequestClose={() => setShowDetails(false)}>
        <View style={{ flex: 1 }}>
          <Pressable style={s.overlay} onPress={() => setShowDetails(false)} />
          <View style={[s.sheet, { paddingBottom: insets.bottom + 12 }]}>
            <View style={s.grabber} />
            <View style={s.sheetHead}>
              <Text style={s.sheetTitle}>Ticket details</Text>
              <Pressable onPress={() => setShowDetails(false)} hitSlop={10}><X size={22} color={T.sub} /></Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: 8, gap: 18 }}>
              {/* customer profile */}
              <View>
                <View style={s.sectionLabelRow}><UserRound size={15} color={T.sub} /><Text style={s.sectionLabel}>Customer profile</Text></View>
                <View style={s.customerRow}>
                  <View style={[s.customerAvatar]}>
                    {ticket.user?.avatar_url
                      ? <Image source={{ uri: ticket.user.avatar_url }} style={{ width: 44, height: 44 }} />
                      : <Text style={{ fontSize: 16, fontWeight: '700', color: Y.text }}>{ticket.user?.full_name?.charAt(0) || 'U'}</Text>}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.subject} numberOfLines={1}>{ticket.user?.full_name || 'Unknown user'}</Text>
                    <Text style={s.detail}>Ticket requester</Text>
                  </View>
                </View>
                <View style={s.statsRow}>
                  <View style={s.stat}><Text style={s.statValue}>{userStats.total}</Text><Text style={s.statLabel}>Tickets</Text></View>
                  <View style={[s.stat, s.statBorder]}><Text style={[s.statValue, { color: '#047857' }]}>{userStats.resolved}</Text><Text style={s.statLabel}>Resolved</Text></View>
                  <View style={[s.stat, s.statBorder]}><Text style={[s.statValue, { color: '#b45309' }]}>{userStats.open}</Text><Text style={s.statLabel}>Active</Text></View>
                </View>
              </View>

              {/* ticket controls */}
              <View>
                <View style={s.sectionLabelRow}><ShieldCheck size={15} color={T.sub} /><Text style={s.sectionLabel}>Ticket controls</Text></View>
                <Text style={[s.detail, { marginBottom: 6 }]}>Current status</Text>
                <View style={[s.optionBox, statusLocked && { opacity: 0.55 }]}>
                  {statusOptions.map((opt, i) => {
                    const selected = ticket.status === opt.value;
                    return (
                      <Pressable
                        key={opt.value}
                        disabled={statusLocked}
                        onPress={() => handleStatusPick(opt.value)}
                        style={[s.optionRow, i > 0 && { borderTopWidth: 1, borderTopColor: T.line }]}
                      >
                        <Text style={[s.optionText, selected && { fontWeight: '700' }]}>{opt.label}</Text>
                        {selected && <Check size={18} color="#047857" />}
                      </Pressable>
                    );
                  })}
                </View>
                <Text style={[s.detail, { marginTop: 8 }]}>
                  {isAssignedToMe
                    ? 'Update status as you work through the request.'
                    : isAssignedToOther
                      ? `Assigned to ${ticket.agent?.full_name || 'another agent'}.`
                      : 'Claim this ticket before changing its status.'}
                </Text>

                {isAssignedToMe && !isResolved && (
                  <Pressable onPress={() => { handleReleaseTicket(); setShowDetails(false); }} style={s.releaseBtn}>
                    <RotateCcw size={15} color={T.text} />
                    <Text style={s.releaseText}>Release to queue</Text>
                  </Pressable>
                )}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── QUICK REPLIES (was the dropdown) */}
      <Modal visible={showCanned} transparent animationType="slide" onRequestClose={() => setShowCanned(false)}>
        <View style={{ flex: 1 }}>
          <Pressable style={s.overlay} onPress={() => setShowCanned(false)} />
          <View style={[s.sheet, { paddingBottom: insets.bottom + 12 }]}>
            <View style={s.grabber} />
            <View style={s.sheetHead}>
              <Text style={s.sheetTitle}>Quick replies</Text>
              <Pressable onPress={() => setShowCanned(false)} hitSlop={10}><X size={22} color={T.sub} /></Pressable>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 8 }}>
              {Object.entries(CANNED_REPLIES).map(([category, replies]) => (
                <View key={category}>
                  <Text style={s.cannedCategory}>{category}</Text>
                  {replies.map((reply, index) => (
                    <Pressable key={index} onPress={() => handleCannedReplySelect(reply)} style={({ pressed }) => [s.cannedRow, pressed && { backgroundColor: '#f7f9f9' }]}>
                      <Text style={s.cannedText}>{reply}</Text>
                    </Pressable>
                  ))}
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── IMAGE PREVIEW */}
      <Modal visible={!!previewImage} transparent animationType="fade" onRequestClose={() => setPreviewImage(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center' }}>
          <Pressable onPress={() => setPreviewImage(null)} style={[s.previewClose, { top: insets.top + 10 }]} hitSlop={10} accessibilityLabel="Close image preview">
            <X size={22} color="#fff" />
          </Pressable>
          {!!previewImage && <Image source={{ uri: previewImage }} style={{ width: '100%', height: '80%' }} resizeMode="contain" />}
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  detail: { fontSize: 13, color: T.sub },

  // loading
  loadWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', padding: 24 },
  loadCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: T.line, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, alignSelf: 'stretch' },

  // ticket info bar
  headerBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  infoBar: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: 1, borderTopColor: T.line, borderBottomWidth: 1, borderBottomColor: T.line, backgroundColor: '#fff' },
  subject: { fontSize: 15, fontWeight: '600', color: T.text, lineHeight: 20 },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 12, fontWeight: '600' },

  // conversation
  startedChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 14, backgroundColor: '#fff', borderWidth: 1, borderColor: T.line },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 40, paddingHorizontal: 24 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: T.text, marginTop: 12 },
  emptySub: { fontSize: 14, color: T.sub, marginTop: 4, textAlign: 'center' },
  msgRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  msgAvatar: { width: 28, height: 28, borderRadius: 14, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  bubble: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 18, maxWidth: '100%' },
  bubbleAgent: { backgroundColor: Y.btn, borderBottomRightRadius: 4 },
  bubbleCustomer: { backgroundColor: '#fff', borderWidth: 1, borderColor: T.line, borderBottomLeftRadius: 4 },
  bubbleText: { fontSize: 15, lineHeight: 21, color: T.text },
  attachImage: { width: 220, height: 220, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.05)' },
  fileBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10 },
  time: { fontSize: 12, color: T.sub, paddingHorizontal: 4 },
  jumpBtn: {
    position: 'absolute', bottom: 12, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6, height: 38, paddingHorizontal: 16, borderRadius: 19,
    backgroundColor: '#fff', borderWidth: 1, borderColor: Y.border,
    shadowColor: '#0f1419', shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 4,
  },
  jumpText: { fontSize: 13, fontWeight: '600', color: T.text },

  // composer + state bars
  composer: { paddingHorizontal: 12, paddingTop: 8, borderTopWidth: 1, borderTopColor: T.line, backgroundColor: '#fff', gap: 8 },
  quickBtn: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, height: 32, paddingHorizontal: 12, borderRadius: 16, backgroundColor: Y.soft, borderWidth: 1, borderColor: Y.border },
  quickText: { fontSize: 13, fontWeight: '600', color: Y.text },
  input: { flex: 1, minHeight: 42, maxHeight: 120, backgroundColor: T.field, borderRadius: 21, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 10, fontSize: 15, color: T.text },
  sendBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: Y.btn, alignItems: 'center', justifyContent: 'center' },
  stateBar: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1 },
  stateBlock: { paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1 },
  stateTitle: { fontSize: 14, fontWeight: '700' },
  claimBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 44, borderRadius: 22, backgroundColor: Y.btn, marginTop: 12 },
  claimText: { fontSize: 15, fontWeight: '700', color: '#111827' },

  // sheets
  overlay: { flex: 1, backgroundColor: 'rgba(15,20,25,0.5)' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 8, maxHeight: '88%' },
  grabber: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: T.border, marginBottom: 6 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: T.line },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: T.text, letterSpacing: -0.2 },
  sectionLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  sectionLabel: { fontSize: 13, fontWeight: '600', color: T.sub },
  customerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  customerAvatar: { width: 44, height: 44, borderRadius: 22, overflow: 'hidden', backgroundColor: Y.light, alignItems: 'center', justifyContent: 'center' },
  statsRow: { flexDirection: 'row', marginTop: 14, borderWidth: 1, borderColor: T.line, borderRadius: 12 },
  stat: { flex: 1, alignItems: 'center', paddingVertical: 12 },
  statBorder: { borderLeftWidth: 1, borderLeftColor: T.line },
  statValue: { fontSize: 19, fontWeight: '700', color: T.text },
  statLabel: { fontSize: 12, color: T.sub, marginTop: 2 },
  optionBox: { borderWidth: 1, borderColor: T.line, borderRadius: 12, overflow: 'hidden' },
  optionRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10 },
  optionText: { fontSize: 15, fontWeight: '500', color: T.text },
  releaseBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 44, borderRadius: 22, borderWidth: 1, borderColor: T.border, marginTop: 14 },
  releaseText: { fontSize: 14, fontWeight: '600', color: T.text },
  cannedCategory: { fontSize: 13, fontWeight: '600', color: T.sub, paddingHorizontal: 20, paddingTop: 14, paddingBottom: 6 },
  cannedRow: { paddingHorizontal: 20, paddingVertical: 12, borderTopWidth: 1, borderTopColor: T.line },
  cannedText: { fontSize: 15, color: T.text, lineHeight: 21 },
  previewClose: { position: 'absolute', right: 16, zIndex: 5, width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
});