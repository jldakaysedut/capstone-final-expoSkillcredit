import UserScreenSkeleton from '../../components/premium/UserScreenSkeleton';
// ═══════════════════════════════════════════════════════════════
//  MOBILE APP (Expo React Native) — src/pages/user/SkillDetails.jsx
//  Same data + booking rules as the web. Compact X-style typography
//  (matches Community / Messages): hairline sections, 15px body, 13px details,
//  and ONE sticky action bar at the bottom instead of the web sidebar.
//  Navigate here with: navigation.navigate('SkillDetails', { id })
// ═══════════════════════════════════════════════════════════════
import { useState, useEffect, useLayoutEffect, useCallback } from 'react';
import {
  Modal, Linking, RefreshControl, AppState, Platform, DeviceEventEmitter, StyleSheet
} from 'react-native';
import { ActivityIndicator, View, Text, Image, Pressable, ScrollView, TextInput, KeyboardAvoidingView } from '../../components/premium/PremiumThemePrimitives';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { ArrowLeft, CheckCircle2, ChevronRight, Clock, ExternalLink, Mail, Search, Star, X } from '../../components/premium/PremiumThemeIcons';
import supabase from '../../supabaseClient';
import { Reveal, PressScale } from '../../components/premium/PremiumVisual';

const T = {
  text: '#0f1419', sub: '#536471', line: '#eff3f4', border: '#cfd9de', field: '#eff3f4',
  brand: '#047857', soft: '#ecfdf5', danger: '#e11d48', strip: '#f7f9f9',
};

// ── date / time helpers
const pad = (n) => String(n).padStart(2, '0');
const toDateStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const toTimeStr = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const cap = (str = '') => str.charAt(0).toUpperCase() + str.slice(1);

function PickerField({ label, mode, value, onChange, minimumDate }) {
  const [showIOS, setShowIOS] = useState(false);
  const current = (() => {
    const base = new Date();
    if (!value) return base;
    if (mode === 'date') {
      const [y, m, d] = value.split('-').map(Number);
      return new Date(y, m - 1, d);
    }
    const [h, min] = value.split(':').map(Number);
    base.setHours(h, min, 0, 0);
    return base;
  })();
  const display = !value
    ? (mode === 'date' ? 'Select date' : 'Select time')
    : mode === 'date'
      ? current.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : current.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const apply = (d) => onChange(mode === 'date' ? toDateStr(d) : toTimeStr(d));
  const open = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: current, mode, minimumDate, is24Hour: false,
        onChange: (e, d) => { if (e.type === 'set' && d) apply(d); },
      });
    } else setShowIOS((v) => !v);
  };
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={s.fieldLabel}>{label}</Text>
      <Pressable onPress={open} style={s.pickInput}>
        <Text style={{ fontSize: 15, color: value ? T.text : T.sub }}>{display}</Text>
      </Pressable>
      {Platform.OS === 'ios' && showIOS && (
        <View>
          <DateTimePicker value={current} mode={mode} display="spinner" minimumDate={minimumDate} onChange={(e, d) => d && apply(d)} />
          <Pressable onPress={() => setShowIOS(false)} style={{ alignSelf: 'flex-end', padding: 6 }}>
            <Text style={{ color: T.brand, fontWeight: '700', fontSize: 15 }}>Done</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const Avatar = ({ src, name, size = 44 }) => (
  <View style={{
    width: size, height: size, borderRadius: size / 2, overflow: 'hidden', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#d1fae5',
  }}>
    {src
      ? <Image source={{ uri: src }} style={{ width: size, height: size }} />
      : <Text style={{ fontWeight: '700', color: '#065f46', fontSize: size * 0.4 }}>{name?.charAt(0)?.toUpperCase() || '?'}</Text>}
  </View>
);

// long text collapses to 6 lines with "See more"
function LongText({ title, text }) {
  const [open, setOpen] = useState(false);
  if (!text?.trim()) return null;
  const long = text.length > 320;
  return (
    <View style={s.block}>
      <Text style={s.sectionTitle}>{title}</Text>
      <Text style={s.bodyText} numberOfLines={long && !open ? 6 : undefined}>{text}</Text>
      {long && (
        <Pressable onPress={() => setOpen((v) => !v)} hitSlop={8}>
          <Text style={s.seeMore}>{open ? 'Show less' : 'See more'}</Text>
        </Pressable>
      )}
    </View>
  );
}

export default function SkillDetails() {
  const navigation = useNavigation();
  const route = useRoute();
  const insets = useSafeAreaInsets();
  const id = route.params?.id;

  const [skill, setSkill] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [currentUserCredits, setCurrentUserCredits] = useState(0);
  const [bookingRestrictedUntil, setBookingRestrictedUntil] = useState(null);
  const [existingSession, setExistingSession] = useState(null);
  const [showAllReviews, setShowAllReviews] = useState(false);

  const [showModal, setShowModal] = useState(false);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [bookingSuccess, setBookingSuccess] = useState(false);
  const [bookedSessionId, setBookedSessionId] = useState(null);
  const [bookingError, setBookingError] = useState('');
  const [preferredDate, setPreferredDate] = useState('');
  const [preferredTime, setPreferredTime] = useState('');
  const [bookingMessage, setBookingMessage] = useState('');

  const todayDateString = toDateStr(new Date());

  // this screen draws its own back bar
  useLayoutEffect(() => { navigation.setOptions({ headerShown: false }); }, [navigation]);

  // ─── same queries as the web
  const load = useCallback(async ({ initial = false } = {}) => {
    if (!id) { setLoading(false); return; }
    if (initial) setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setCurrentUserId(user.id);
        const { data: profileData } = await supabase.from('user_profiles')
          .select('credits_balance, booking_restricted_until').eq('id', user.id).single();
        if (profileData) {
          setCurrentUserCredits(profileData.credits_balance);
          setBookingRestrictedUntil(profileData.booking_restricted_until);
        }
        const { data: sessionData } = await supabase.from('sessions').select('status, id')
          .eq('skill_id', id).eq('student_id', user.id)
          .in('status', ['pending', 'active', 'upcoming', 'confirmed']).limit(1);
        setExistingSession(sessionData && sessionData.length > 0 ? sessionData[0] : null);
      }

      const { data: skillData, error: skillError } = await supabase
        .from('skills')
        .select(`*, user_profiles!instructor_id(id,full_name,avatar_url,bio,role,created_at,availability_schedule,contact_info,booking_restricted_until), reviews(rating, feedback, created_at, student:user_profiles!student_id(full_name, avatar_url), q1_clarity, q2_patience, q3_relevance, q4_professionalism)`)
        .eq('id', id)
        .single();

      if (!skillError && skillData) {
        const reviews = skillData.reviews || [];
        let totalOverallSum = 0;
        reviews.forEach((rev) => {
          totalOverallSum += (Number(rev.rating || 0) + Number(rev.q1_clarity || 0) + Number(rev.q2_patience || 0) + Number(rev.q3_relevance || 0) + Number(rev.q4_professionalism || 0)) / 5;
        });
        setSkill({
          ...skillData,
          avgRating: reviews.length > 0 ? parseFloat((totalOverallSum / reviews.length).toFixed(1)) : 0,
          totalReviews: reviews.length,
          reviewsList: [...reviews].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)),
        });
      }
    } catch (e) { console.error('SkillDetails load failed:', e); }
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => { load({ initial: true }); }, [load]);

  // re-sync when the app returns to the foreground, or when credits change elsewhere
  useEffect(() => {
    const appSub = AppState.addEventListener('change', (state) => { if (state === 'active') load(); });
    const creditSub = DeviceEventEmitter.addListener('credit_updated', () => load());
    return () => { appSub.remove(); creditSub.remove(); };
  }, [load]);

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const goBack = () => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('User', { screen: 'Dashboard' }));
  const goSessions = (sessionId) => navigation.navigate('User', { screen: 'Sessions', params: sessionId ? { session: sessionId } : undefined });
  const goProfile = (uid) => uid && navigation.navigate('PublicProfile', { id: uid });
  const openLink = (url) => {
    const full = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    Linking.openURL(full).catch(() => {});
  };

  // ─── booking (same rules as the web)
  const handleConfirmBooking = async () => {
    if (!preferredDate || !preferredTime) { setBookingError('Please select a preferred date and time.'); return; }
    if (!bookingMessage.trim()) { setBookingError('Please provide a message for the instructor.'); return; }
    if (preferredDate < todayDateString) { setBookingError('You cannot book a session for a past date.'); return; }

    const [year, month, day] = preferredDate.split('-').map(Number);
    const [hours, minutes] = preferredTime.split(':').map(Number);
    const bookingDateTimeMs = new Date(year, month - 1, day, hours, minutes).getTime();
    if (bookingDateTimeMs < Date.now() + 60 * 60 * 1000) {
      setBookingError('Pick a time at least 1 hour from now so the instructor can accept.');
      return;
    }

    setBookingLoading(true); setBookingError('');

    const { data: freshProfile, error: freshError } = await supabase.from('user_profiles').select('credits_balance').eq('id', currentUserId).single();
    if (freshError || !freshProfile) { setBookingError('Could not verify your credit balance.'); setBookingLoading(false); return; }

    const latestBalance = freshProfile.credits_balance;
    if (latestBalance < skill.credit_cost) {
      setBookingError(`Not enough credits. You have ${latestBalance} CR, this session costs ${skill.credit_cost} CR.`);
      setCurrentUserCredits(latestBalance); setBookingLoading(false); return;
    }

    try {
      // Server checks availability/price, atomically debits the learner and creates
      // the booking. Never write credits_balance from this screen after success.
      const { data: bookedRows, error: bookingError } = await supabase.rpc(
        'skillcredit_secure_book_session', {
          p_skill_id: skill.id,
          p_scheduled_date: preferredDate,
          p_scheduled_time: preferredTime,
          p_message: bookingMessage.trim(),
        }
      );
      if (bookingError) throw bookingError;
      const booked = Array.isArray(bookedRows) ? bookedRows[0] : bookedRows;
      if (!booked?.session_id || !Number.isInteger(booked?.remaining_credits)) {
        throw new Error('Booking response could not be verified. Check Sessions before trying again to prevent duplicate bookings.');
      }
      const newSession = { id: booked.session_id };
      const newBalance = booked.remaining_credits;
      const bookedCost = booked.credit_amount;
      // The financial transaction is finished at this point. Chat/notification
      // failures must not turn it into an apparent failed booking.
      DeviceEventEmitter.emit('credit_updated');
      setCurrentUserCredits(newBalance);
      setExistingSession({ id: newSession.id, status: 'pending' });
      setBookedSessionId(newSession.id);
      setBookingSuccess(true);

      const bookingSysContent = `__BOOKING_REQUEST__::${JSON.stringify({
        skill_id: skill.id,
        title: skill.title,
        image: skill.cover_image_url || null,
        cost: bookedCost,
        date: preferredDate,
        time: preferredTime,
        userMsg: bookingMessage.trim(),
      })}`;

      // Non-financial side effects: report their failures, but never retry the
      // successful booking RPC because of a failed message or notification.
      try {
        const { error: msgError } = await supabase.from('messages').insert([{
          session_id: newSession.id,
          sender_id: currentUserId,
          receiver_id: skill.instructor_id,
          content: bookingSysContent,
          is_deleted: false,
        }]);
        if (msgError) console.warn('Failed to save initial booking message:', msgError);
      } catch (msgError) { console.warn('Failed to save initial booking message:', msgError); }

      try {
        const { error: notificationError } = await supabase.from('notifications').insert([{
          user_id: skill.instructor_id,
          type: 'booking',
          content: `New booking request for "${skill.title}" worth ${bookedCost} CR.`,
          link_url: `/sessions?session=${newSession.id}`,
        }]);
        if (notificationError) console.warn('Failed to save booking notification:', notificationError);
      } catch (noticeError) { console.warn('Failed to save booking notification:', noticeError); }
    } catch (error) {
      console.error(error);
      setBookingError(error?.message || 'Booking could not be completed. Check Sessions before trying again.');
    } finally { setBookingLoading(false); }
  };

  const closeBookingModal = () => {
    if (bookingLoading) return;
    setShowModal(false);
    setBookingError('');
    if (bookingSuccess) {
      setBookingSuccess(false); setPreferredDate(''); setPreferredTime(''); setBookingMessage('');
    }
  };

  const BackBar = (
    <View style={[s.header, { paddingTop: insets.top + 6 }]}>
      <Pressable onPress={goBack} style={s.headBtn} hitSlop={8} accessibilityLabel="Back">
        <ArrowLeft size={22} color={T.text} />
      </Pressable>
      <Text style={s.headTitle}>Skill</Text>
    </View>
  );

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#fff' }}>
        {BackBar}
        <UserScreenSkeleton type="skillDetails" />
      </View>
    );
  }

  if (!skill) {
    return (
      <View style={{ flex: 1, backgroundColor: '#fff' }}>
        {BackBar}
        <View style={s.center}>
          <Search size={44} color={T.border} />
          <Text style={s.emptyTitle}>Skill not found</Text>
          <Text style={s.emptySub}>This listing may have been removed.</Text>
          <Pressable onPress={goBack} style={s.fillBtn}><Text style={s.fillBtnText}>Go back</Text></Pressable>
        </View>
      </View>
    );
  }

  // ─── derived
  const isMyListing = skill.instructor_id === currentUserId;
  const profileObj = Array.isArray(skill.user_profiles) ? skill.user_profiles[0] : skill.user_profiles;
  const instructorName = profileObj?.full_name || 'Unknown instructor';
  const instructorAvatar = profileObj?.avatar_url || null;
  const instructorBio = profileObj?.bio || '';
  const instructorAvail = profileObj?.availability_schedule || '';
  const instructorContact = profileObj?.contact_info || '';
  const instructorId = profileObj?.id || skill.instructor_id;
  const hasEnoughCredits = currentUserCredits >= skill.credit_cost;

  const now = new Date();
  const instructorRestrictedUntil = profileObj?.booking_restricted_until ? new Date(profileObj.booking_restricted_until) : null;
  const isInstructorRestricted = instructorRestrictedUntil && instructorRestrictedUntil > now;
  const learnerRestrictedUntil = bookingRestrictedUntil ? new Date(bookingRestrictedUntil) : null;
  const isLearnerRestricted = learnerRestrictedUntil && learnerRestrictedUntil > now;

  const meta = [skill.category, skill.format, skill.duration].filter(Boolean).join(' · ');
  const reviews = skill.reviewsList || [];
  const shownReviews = showAllReviews ? reviews : reviews.slice(0, 5);

  // ONE action in the sticky bar, with a one-line reason next to the price
  let cta;
  let note = { text: `Your balance: ${currentUserCredits} CR`, danger: false };
  if (isMyListing) {
    cta = { label: 'Edit listing', tone: 'soft', onPress: () => navigation.navigate('EditSkill', { id: skill.id }) };
    note = { text: 'This is your listing', danger: false };
  } else if (existingSession) {
    cta = { label: 'View booking', tone: 'primary', onPress: () => goSessions(existingSession.id) };
    note = { text: `Booking status: ${cap(existingSession.status)}`, danger: false };
  } else if (isInstructorRestricted) {
    cta = { label: 'Unavailable', tone: 'off', disabled: true };
    note = { text: "This instructor can't take new bookings right now.", danger: true };
  } else if (isLearnerRestricted) {
    cta = { label: 'Restricted', tone: 'off', disabled: true };
    note = { text: "Your account can't book sessions for now.", danger: true };
  } else {
    cta = { label: 'Book session', tone: 'primary', onPress: () => setShowModal(true) };
    if (!hasEnoughCredits) note = { text: `Not enough credits · you have ${currentUserCredits} CR`, danger: true };
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#f4f8f6' }}>
      {BackBar}

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 100 + insets.bottom }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={T.brand} colors={[T.brand]} />}
      >
        <Reveal>
          {!!skill.cover_image_url && (
            <View style={s.coverFrame}>
              <Image source={{ uri: skill.cover_image_url }} style={s.cover} resizeMode="cover" />
            </View>
          )}

        {/* title + one meta line + rating */}
        <View style={[s.block, s.heroInfo]}>
          <Text style={s.title}>{skill.title}</Text>
          {!!meta && <Text style={s.metaLine}>{meta}</Text>}
          <View style={s.ratingRow}>
            {skill.totalReviews > 0 ? (
              <>
                <Star size={14} color="#fbbf24" fill="#fbbf24" />
                <Text style={s.ratingNum}>{skill.avgRating}</Text>
                <Text style={s.metaLine}>({skill.totalReviews} {skill.totalReviews === 1 ? 'review' : 'reviews'})</Text>
              </>
            ) : (
              <Text style={s.newTag}>New</Text>
            )}
          </View>
        </View>
        </Reveal>

        {/* instructor */}
        <View style={s.block}>
          <Pressable onPress={() => goProfile(instructorId)} style={s.instructorRow}>
            <Avatar src={instructorAvatar} name={instructorName} size={44} />
            <View style={{ flex: 1 }}>
              <Text style={s.name} numberOfLines={1}>{instructorName}</Text>
              <Text style={s.metaLine} numberOfLines={2}>{instructorBio || 'Platform instructor'}</Text>
            </View>
            <ChevronRight size={18} color={T.border} />
          </Pressable>

          {!!instructorAvail && (
            <View style={s.infoRow}>
              <Clock size={16} color={T.sub} />
              <Text style={s.infoText}>{instructorAvail}</Text>
            </View>
          )}
          {!!instructorContact && (
            <View style={s.infoRow}>
              <Mail size={16} color={T.sub} />
              <Text style={s.infoText} selectable>{instructorContact}</Text>
            </View>
          )}
        </View>

        {!!skill.portfolio_url && (
          <Pressable onPress={() => openLink(skill.portfolio_url)} style={[s.block, s.linkRow]}>
            <ExternalLink size={18} color={T.brand} />
            <Text style={s.linkText}>Portfolio / demo</Text>
            <ChevronRight size={18} color={T.border} />
          </Pressable>
        )}

        <LongText title="About this session" text={skill.description} />
        <LongText title="What you will walk away with" text={skill.outcomes} />

        {/* reviews */}
        {reviews.length > 0 && (
          <View style={[s.block, { borderBottomWidth: 0 }]}>
            <Text style={s.sectionTitle}>Reviews ({skill.totalReviews})</Text>
            {shownReviews.map((review, idx) => {
              const student = Array.isArray(review.student) ? review.student[0] : review.student;
              const reviewerName = student?.full_name || 'Anonymous student';
              return (
                <View key={idx} style={[s.reviewRow, idx > 0 && { borderTopWidth: 1, borderTopColor: T.line }]}>
                  <Avatar src={student?.avatar_url} name={reviewerName} size={32} />
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={[s.name, { flexShrink: 1 }]} numberOfLines={1}>{reviewerName}</Text>
                      <Text style={s.metaLine}>{new Date(review.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</Text>
                      <View style={{ marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                        <Star size={13} color="#fbbf24" fill="#fbbf24" />
                        <Text style={s.ratingNum}>{review.rating}</Text>
                      </View>
                    </View>
                    {!!review.feedback && <Text style={[s.bodyText, { marginTop: 2 }]}>{review.feedback}</Text>}
                  </View>
                </View>
              );
            })}
            {reviews.length > 5 && (
              <Pressable onPress={() => setShowAllReviews((v) => !v)} hitSlop={8}>
                <Text style={[s.seeMore, { marginTop: 10 }]}>{showAllReviews ? 'Show fewer' : `See all ${reviews.length} reviews`}</Text>
              </Pressable>
            )}
          </View>
        )}
      </ScrollView>

      {/* ── STICKY ACTION BAR */}
      <View style={[s.bar, { paddingBottom: insets.bottom + 10 }]}>
        <View style={{ flex: 1 }}>
          <Text style={s.barPrice}>{skill.credit_cost} CR</Text>
          <Text style={[s.barNote, note.danger && { color: T.danger }]} numberOfLines={2}>{note.text}</Text>
        </View>
        <PressScale
          onPress={cta.onPress}
          disabled={cta.disabled}
          style={[s.cta, cta.tone === 'primary' && { backgroundColor: T.brand }, cta.tone === 'soft' && { backgroundColor: T.field }, cta.tone === 'off' && { backgroundColor: T.field, opacity: 0.7 }]}
        >
          <Text style={[s.ctaText, cta.tone !== 'primary' && { color: cta.tone === 'off' ? T.sub : T.text }]}>{cta.label}</Text>
        </PressScale>
      </View>

      {/* ── BOOKING SHEET */}
      <Modal visible={showModal} transparent animationType="slide" onRequestClose={closeBookingModal}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <Pressable style={s.overlay} onPress={closeBookingModal} />
          <View style={[s.sheet, { paddingBottom: insets.bottom + 12 }]}>
            <View style={s.grabber} />

            {!bookingSuccess ? (
              <>
                <View style={s.sheetHeader}>
                  <Text style={s.sheetTitle}>Book a session</Text>
                  <Pressable onPress={closeBookingModal} hitSlop={10}><X size={22} color={T.sub} /></Pressable>
                </View>

                <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16 }}>
                  <View style={s.summary}>
                    <Text style={[s.name, { flex: 1 }]} numberOfLines={1}>{skill.title}</Text>
                    <Text style={[s.name, { color: T.brand }]}>{skill.credit_cost} CR</Text>
                  </View>

                  <PickerField label="Preferred date" mode="date" value={preferredDate} onChange={setPreferredDate} minimumDate={new Date()} />
                  <PickerField label="Preferred time" mode="time" value={preferredTime} onChange={setPreferredTime} />

                  <Text style={s.fieldLabel}>Message to the instructor</Text>
                  <TextInput
                    value={bookingMessage}
                    onChangeText={setBookingMessage}
                    placeholder="Share your goals or preferred schedule…"
                    placeholderTextColor={T.sub}
                    multiline
                    textAlignVertical="top"
                    style={s.textarea}
                  />

                  {!!bookingError && <Text style={s.error}>{bookingError}</Text>}

                  <View style={s.balanceRow}>
                    {hasEnoughCredits ? <CheckCircle2 size={16} color={T.brand} /> : <X size={16} color={T.danger} />}
                    <Text style={[s.balanceText, { color: hasEnoughCredits ? T.brand : T.danger }]}>
                      {hasEnoughCredits ? 'Enough credits' : 'Not enough credits'}
                    </Text>
                    <Text style={[s.balanceText, { marginLeft: 'auto', color: T.sub }]}>{currentUserCredits} / {skill.credit_cost} CR</Text>
                  </View>
                  <Text style={[s.metaLine, { marginTop: 6 }]}>Credits are deducted now and held in escrow until the session is done.</Text>

                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
                    <Pressable onPress={closeBookingModal} disabled={bookingLoading} style={[s.btn, s.btnGhost]}>
                      <Text style={[s.btnText, { color: T.text }]}>Cancel</Text>
                    </Pressable>
                    <Pressable
                      onPress={handleConfirmBooking}
                      disabled={bookingLoading || !hasEnoughCredits}
                      style={[s.btn, { backgroundColor: T.brand, flex: 1.6 }, (bookingLoading || !hasEnoughCredits) && { opacity: 0.5 }]}
                    >
                      {bookingLoading ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Confirm and pay</Text>}
                    </Pressable>
                  </View>
                </ScrollView>
              </>
            ) : (
              <View style={{ alignItems: 'center', padding: 24, paddingTop: 20 }}>
                <View style={s.successIcon}><CheckCircle2 size={30} color={T.brand} /></View>
                <Text style={s.successTitle}>You're all set</Text>
                <Text style={[s.emptySub, { marginTop: 4 }]}>The instructor will confirm your session soon.</Text>

                <View style={s.summary}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.metaLine}>Credits deducted</Text>
                    <Text style={[s.name, { color: T.brand }]}>{skill.credit_cost} CR</Text>
                  </View>
                  <Text style={s.escrowTag}>Held in escrow</Text>
                </View>

                <Pressable
                  onPress={() => { const sid = bookedSessionId; closeBookingModal(); goSessions(sid); }}
                  style={[s.btn, { backgroundColor: T.brand, alignSelf: 'stretch', marginTop: 16 }]}
                >
                  <Text style={s.btnText}>Manage bookings</Text>
                </Pressable>
              </View>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },

  // header
  header: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: T.line, backgroundColor: '#fff' },
  headBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headTitle: { fontSize: 17, fontWeight: '700', color: T.text, letterSpacing: -0.2 },

  // rounded hero + editorial content cards
  coverFrame: { marginHorizontal: 14, marginTop: 14, borderRadius: 24, overflow: 'hidden', backgroundColor: '#d1fae5', borderWidth: 1, borderColor: '#dbece2' },
  cover: { width: '100%', height: 220, backgroundColor: '#e2f3e9' },
  block: { paddingHorizontal: 17, paddingVertical: 18, marginHorizontal: 14, marginTop: 12, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2ece5', borderRadius: 20 },
  heroInfo: { marginTop: 12, borderColor: '#d9ebe0', shadowColor: '#064e3b', shadowOpacity: 0.05, shadowRadius: 8, elevation: 1 },
  title: { fontSize: 23, fontWeight: '800', color: '#153d2e', lineHeight: 29, letterSpacing: -0.6 },
  metaLine: { fontSize: 13, color: '#647c70', lineHeight: 18 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8 },
  ratingNum: { fontSize: 13, fontWeight: '700', color: T.text },
  newTag: { fontSize: 13, fontWeight: '700', color: T.brand },
  name: { fontSize: 15, fontWeight: '700', color: T.text },
  sectionTitle: { fontSize: 17, fontWeight: '800', color: '#153d2e', letterSpacing: -0.35, marginBottom: 9 },
  bodyText: { fontSize: 15, lineHeight: 23, color: '#304d40' },
  seeMore: { fontSize: 14, fontWeight: '600', color: T.brand, marginTop: 6 },
  instructorRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  infoText: { flex: 1, fontSize: 13, color: T.text },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  linkText: { flex: 1, fontSize: 15, fontWeight: '600', color: T.brand },
  reviewRow: { flexDirection: 'row', gap: 12, paddingVertical: 12 },

  // sticky bar
  bar: {
    position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingTop: 13, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#e1ebe4', elevation: 10, shadowColor: '#064e3b', shadowOpacity: 0.10, shadowRadius: 16, shadowOffset: { width: 0, height: -5 },
  },
  barPrice: { fontSize: 20, fontWeight: '800', color: '#153d2e', letterSpacing: -0.45 },
  barNote: { fontSize: 13, color: T.sub, marginTop: 1 },
  cta: { height: 48, minWidth: 130, paddingHorizontal: 22, borderRadius: 16, alignItems: 'center', justifyContent: 'center', shadowColor: '#047857', shadowOpacity: 0.12, shadowRadius: 7, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  ctaText: { fontSize: 15, fontWeight: '700', color: '#fff' },

  // empty
  emptyTitle: { fontSize: 17, fontWeight: '700', color: T.text, marginTop: 12 },
  emptySub: { fontSize: 14, color: T.sub, marginTop: 4, textAlign: 'center' },
  fillBtn: { height: 44, paddingHorizontal: 26, borderRadius: 22, backgroundColor: T.brand, alignItems: 'center', justifyContent: 'center', marginTop: 16 },
  fillBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },

  // sheet
  overlay: { flex: 1, backgroundColor: 'rgba(15,20,25,0.5)' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '92%' },
  grabber: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: T.border, marginTop: 8 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: T.line },
  sheetTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: T.text, letterSpacing: -0.2 },
  summary: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: T.strip, borderWidth: 1, borderColor: T.line, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 16, alignSelf: 'stretch' },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: T.sub, marginBottom: 8 },
  pickInput: { height: 44, borderRadius: 12, backgroundColor: T.field, paddingHorizontal: 14, justifyContent: 'center' },
  textarea: { height: 96, backgroundColor: T.field, borderRadius: 12, padding: 14, fontSize: 15, color: T.text },
  error: { fontSize: 13, fontWeight: '600', color: T.danger, marginTop: 12 },
  balanceRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 16 },
  balanceText: { fontSize: 13, fontWeight: '600' },
  btn: { flex: 1, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  btnGhost: { borderWidth: 1, borderColor: T.border, backgroundColor: '#fff' },
  btnText: { fontSize: 15, fontWeight: '700', color: '#fff' },

  // success
  successIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: T.soft, alignItems: 'center', justifyContent: 'center' },
  successTitle: { fontSize: 20, fontWeight: '700', color: T.text, letterSpacing: -0.3, marginTop: 12 },
  escrowTag: { fontSize: 13, fontWeight: '600', color: T.brand, backgroundColor: T.soft, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, overflow: 'hidden' },
});