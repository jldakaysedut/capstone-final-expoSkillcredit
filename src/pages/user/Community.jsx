import { Reveal, PressScale } from '../../components/premium/PremiumVisual';
import { Alert } from '../../components/SkillCreditAlert';
// ═══════════════════════════════════════════════════════════════
//  MOBILE APP (Expo React Native) — src/pages/user/Community.jsx
//  Same data + logic as before, restyled with the compact X-style typography
//  (matches UserDashboard): timeline posts, hairline dividers, 15px names, 13px details.
// ═══════════════════════════════════════════════════════════════
import { useState, useEffect, useMemo, useRef } from 'react';
import {
  Modal, FlatList, RefreshControl, Platform, useWindowDimensions, StyleSheet
} from 'react-native';
import { ActivityIndicator, View, Text, TextInput, Image, Pressable, ScrollView, KeyboardAvoidingView } from '../../components/premium/PremiumThemePrimitives';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { ChevronDown, ChevronRight, Heart, ImagePlus, Inbox, MessageSquare, MoreHorizontal, Search, Send, SlidersHorizontal, X } from '../../components/premium/PremiumThemeIcons';
import supabase from '../../supabaseClient';
import UserScreenSkeleton from '../../components/premium/UserScreenSkeleton';

const MACRO_CATEGORIES = [
  'Tech, Coding & UI/UX', 'Creative, Arts & Media', 'Academics & Languages',
  'Business & Finance', 'Lifestyle, Health & Home', 'Hobbies & Practical Skills',
];
const POST_TYPES = ['General Q&A', 'Looking for a Mentor', 'Offering a Skill', 'Project Showcase', 'Pricing Advice'];
const REPORT_REASONS = ['Inappropriate Content / Spam', 'Harassment / Abuse', 'Misinformation', 'Other'];

// same link format as the web, so web + mobile notifications stay compatible
const buildCommunityActivityLink = (postId, commentId = null, activityId = null) => {
  let q = `post=${postId}`;
  if (commentId) q += `&comment=${commentId}`;
  if (activityId) q += `&activity=${activityId}`;
  return `/community?${q}#post-${postId}`;
};

const createCommunityActivityNotification = async ({ recipientId, actorId, type, content, linkUrl }) => {
  if (!recipientId || recipientId === actorId) return;
  const { error } = await supabase.from('notifications').insert({
    user_id: recipientId, type, content, link_url: linkUrl, is_read: false,
  });
  if (error) console.error('Could not create community notification:', error);
};

const confirmAsync = (title, message) =>
  new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Delete', style: 'destructive', onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) });
  });

const pickImages = async () => {
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'], allowsMultipleSelection: true, quality: 0.8, base64: true,
  });
  return res.canceled ? [] : res.assets;
};

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

let lastUploadError = '';
const MIME_EXT = { 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };

const uploadImage = async (userId, asset, index = 0) => {
  try {
    const mime = (asset.mimeType || '').toLowerCase();
    const ext = MIME_EXT[mime] || 'jpg';
    const contentType = MIME_EXT[mime] ? mime : 'image/jpeg';
    // safe generated name (the gallery's original name can contain spaces/symbols)
    const path = `${userId}/${Date.now()}_${index}_${Math.random().toString(36).slice(2, 8)}.${ext}`;

    let bytes;
    if (asset.base64) bytes = base64ToArrayBuffer(asset.base64);
    else { const res = await fetch(asset.uri); bytes = await res.arrayBuffer(); }
    if (!bytes || bytes.byteLength === 0) throw new Error('The photo came out empty');

    const { error } = await supabase.storage.from('community_media').upload(path, bytes, { contentType });
    if (error) throw error;
    return supabase.storage.from('community_media').getPublicUrl(path).data.publicUrl;
  } catch (error) {
    lastUploadError = error?.message || String(error);
    console.error('Upload failed:', error);
    return null;
  }
};

const timeShort = (createdAt) => {
  const diff = (Date.now() - new Date(createdAt)) / 1000;
  if (diff < 60) return 'now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d`;
  return new Date(createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

// compact X-style tokens (same as UserDashboard)
const T = {
  text: '#0f1419', sub: '#536471', line: '#eff3f4', border: '#cfd9de', field: '#eff3f4',
  brand: '#047857', soft: '#ecfdf5', danger: '#e11d48',
};

// ── Avatar
const Avatar = ({ src, name, size = 40 }) => (
  <View style={{
    width: size, height: size, borderRadius: size / 2, overflow: 'hidden', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#d1fae5',
  }}>
    {src
      ? <Image source={{ uri: src }} style={{ width: size, height: size }} />
      : <Text style={{ fontWeight: '700', color: '#065f46', fontSize: size * 0.4 }}>{name?.charAt(0) || '?'}</Text>}
  </View>
);

// ── Image collage (rounded, max 4 tiles)
function PostImageCollage({ mediaUrls = [], onOpen }) {
  if (!mediaUrls.length) return null;
  const total = mediaUrls.length;
  const shown = mediaUrls.slice(0, 4);
  const count = shown.length;

  const Tile = ({ i, style }) => (
    <Pressable onPress={() => onOpen(mediaUrls, i)} style={[{ backgroundColor: T.line, overflow: 'hidden' }, style]}>
      <Image source={{ uri: shown[i] }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
      {total > 4 && i === 3 && (
        <View style={s.moreOverlay}><Text style={{ color: '#fff', fontSize: 22, fontWeight: '700' }}>+{total - 4}</Text></View>
      )}
    </Pressable>
  );

  let body; let height = 220;
  if (count === 1) { body = <Tile i={0} style={{ flex: 1 }} />; height = 220; }
  else if (count === 2) { body = (<><Tile i={0} style={{ flex: 1 }} /><Tile i={1} style={{ flex: 1 }} /></>); height = 170; }
  else if (count === 3) {
    height = 200;
    body = (
      <>
        <Tile i={0} style={{ flex: 1 }} />
        <View style={{ flex: 1, gap: 2 }}><Tile i={1} style={{ flex: 1 }} /><Tile i={2} style={{ flex: 1 }} /></View>
      </>
    );
  } else {
    height = 200;
    body = (
      <>
        <View style={{ flex: 1, gap: 2 }}><Tile i={0} style={{ flex: 1 }} /><Tile i={2} style={{ flex: 1 }} /></View>
        <View style={{ flex: 1, gap: 2 }}><Tile i={1} style={{ flex: 1 }} /><Tile i={3} style={{ flex: 1 }} /></View>
      </>
    );
  }
  return <View style={[s.collage, { height }]}>{body}</View>;
}

// ── Full-screen gallery
function ImageGalleryModal({ images = [], initialIndex = 0, onClose }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [idx, setIdx] = useState(initialIndex);
  if (!images.length) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.95)' }}>
        <View style={[s.galleryTop, { paddingTop: insets.top + 8 }]}>
          <Text style={s.galleryCount}>{idx + 1} / {images.length}</Text>
          <Pressable onPress={onClose} style={s.galleryClose} hitSlop={8}><X size={22} color="#fff" /></Pressable>
        </View>
        <ScrollView
          horizontal pagingEnabled showsHorizontalScrollIndicator={false}
          contentOffset={{ x: initialIndex * width, y: 0 }}
          onMomentumScrollEnd={(e) => setIdx(Math.round(e.nativeEvent.contentOffset.x / width))}
          style={{ flex: 1 }}
        >
          {images.map((u, i) => (
            <View key={`${u}-${i}`} style={{ width, justifyContent: 'center' }}>
              <Image source={{ uri: u }} style={{ width, height: height * 0.75 }} resizeMode="contain" />
            </View>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

// ── Comment thread (replies are collapsed by default)
function CommentThread({
  comments, currentUserId, currentUserProfile, parentId = null, depth = 0, expandIds,
  highlightCommentId = null, postId, onAddReply, onUpdateComment, onDeleteComment, onProfileClick,
}) {
  const [replyingTo, setReplyingTo] = useState(null);
  const [replyText, setReplyText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [expanded, setExpanded] = useState(() => Object.fromEntries([...expandIds].map((id) => [id, true])));

  const roots = comments.filter((c) => (c.parent_comment_id ?? null) === parentId);
  if (!roots.length) return null;

  const submitReply = async (parent) => {
    if (!replyText.trim() || submitting) return;
    setSubmitting(true);
    await onAddReply(postId, parent.id, replyText.trim());
    setExpanded((p) => ({ ...p, [parent.id]: true }));
    setReplyText(''); setReplyingTo(null); setSubmitting(false);
  };

  const saveEdit = async (id) => {
    const content = editText.trim();
    if (!content || savingEdit) return;
    setSavingEdit(true);
    try {
      const saved = await onUpdateComment(id, content);
      if (saved) { setEditingId(null); setEditText(''); }
    } finally { setSavingEdit(false); }
  };

  const ownMenu = (c) => Alert.alert('Your comment', undefined, [
    { text: 'Edit', onPress: () => { setEditingId(c.id); setEditText(c.content ?? ''); } },
    { text: 'Delete', style: 'destructive', onPress: () => onDeleteComment(c.id) },
    { text: 'Cancel', style: 'cancel' },
  ]);

  return (
    <View style={depth > 0 ? s.nested : null}>
      {roots.map((c) => {
        const isMe = c.user_id === currentUserId;
        const authorName = (isMe ? currentUserProfile?.full_name : c.author?.full_name) || 'Member';
        const children = comments.filter((ch) => ch.parent_comment_id === c.id);
        const open = !!expanded[c.id];
        return (
          <View key={c.id} style={[s.commentWrap, highlightCommentId === c.id && s.commentHighlight]}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
              <Pressable onPress={() => onProfileClick(c.user_id)}>
                <Avatar src={isMe ? currentUserProfile?.avatar_url : c.author?.avatar_url}
                  name={authorName} size={depth > 0 ? 26 : 34} />
              </Pressable>

              <View style={{ flex: 1 }}>
                {editingId === c.id ? (
                  <View style={s.editBox}>
                    <TextInput autoFocus multiline value={editText} onChangeText={setEditText} style={s.editInput} textAlignVertical="top" />
                    <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 14, marginTop: 8, alignItems: 'center' }}>
                      <Pressable onPress={() => { setEditingId(null); setEditText(''); }} hitSlop={8}>
                        <Text style={{ color: T.sub, fontWeight: '600', fontSize: 14 }}>Cancel</Text>
                      </Pressable>
                      <Pressable onPress={() => saveEdit(c.id)} disabled={!editText.trim() || savingEdit}
                        style={[s.smallBtn, (!editText.trim() || savingEdit) && { opacity: 0.5 }]}>
                        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>{savingEdit ? 'Saving…' : 'Save'}</Text>
                      </Pressable>
                    </View>
                  </View>
                ) : (
                  <>
                    <View style={s.cHead}>
                      <Text onPress={() => onProfileClick(c.user_id)} style={s.cName} numberOfLines={1}>{authorName}</Text>
                      <Text style={s.cTime}>· {timeShort(c.created_at)}</Text>
                    </View>
                    <Text style={s.cText}>{c.content}</Text>
                  </>
                )}

                <View style={s.metaRow}>
                  <Pressable onPress={() => { setReplyingTo(replyingTo === c.id ? null : c.id); setReplyText(''); }} hitSlop={8}>
                    <Text style={s.metaBtn}>Reply</Text>
                  </Pressable>
                  {isMe && editingId !== c.id && (
                    <Pressable onPress={() => ownMenu(c)} hitSlop={10}><MoreHorizontal size={16} color={T.sub} /></Pressable>
                  )}
                </View>

                {replyingTo === c.id && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, width: '100%', marginTop: 8 }}>
                    <TextInput autoFocus value={replyText} onChangeText={setReplyText} onSubmitEditing={() => submitReply(c)}
                      placeholder={`Reply to ${c.author?.full_name?.split(' ')[0] || 'user'}…`} placeholderTextColor={T.sub} style={s.replyInput} />
                    <Pressable onPress={() => submitReply(c)} disabled={!replyText.trim() || submitting}
                      style={[s.sendBtn, (!replyText.trim() || submitting) && { opacity: 0.4 }]}>
                      <Send size={16} color="#fff" />
                    </Pressable>
                  </View>
                )}

                {children.length > 0 && (
                  <Pressable onPress={() => setExpanded((p) => ({ ...p, [c.id]: !p[c.id] }))}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 3, paddingVertical: 8 }} hitSlop={6}>
                    {open ? <ChevronDown size={15} color={T.brand} /> : <ChevronRight size={15} color={T.brand} />}
                    <Text style={{ color: T.brand, fontWeight: '600', fontSize: 13 }}>
                      {open ? 'Hide replies' : `View ${children.length} ${children.length > 1 ? 'replies' : 'reply'}`}
                    </Text>
                  </Pressable>
                )}
              </View>
            </View>

            {open && children.length > 0 && (
              <CommentThread
                comments={comments} currentUserId={currentUserId} currentUserProfile={currentUserProfile}
                parentId={c.id} depth={depth + 1} expandIds={expandIds} highlightCommentId={highlightCommentId} postId={postId}
                onAddReply={onAddReply} onUpdateComment={onUpdateComment} onDeleteComment={onDeleteComment} onProfileClick={onProfileClick}
              />
            )}
          </View>
        );
      })}
    </View>
  );
}

// ── Comments sheet
function CommentModal({
  post, onClose, currentUserId, currentUserProfile, onAddComment, onAddReply,
  onUpdateComment, onDeleteComment, newCommentValue, onCommentChange, focusCommentId = null, onProfileClick,
}) {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef(null);
  const prev = useRef({ postId: null, count: null });

  useEffect(() => {
    const count = post?.comments?.length ?? 0;
    if (prev.current.postId === post?.id && prev.current.count !== null && count > prev.current.count) {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 120);
    }
    prev.current = { postId: post?.id, count };
  }, [post?.id, post?.comments?.length]);

  // open the parents of a deep-linked comment
  const expandIds = useMemo(() => {
    const ids = new Set();
    if (!post || !focusCommentId) return ids;
    let cur = post.comments.find((c) => c.id === focusCommentId);
    while (cur?.parent_comment_id) {
      const parentId = cur.parent_comment_id;
      ids.add(parentId);
      cur = post.comments.find((c) => c.id === parentId);
    }
    return ids;
  }, [post, focusCommentId]);

  if (!post) return null;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <Pressable style={s.overlay} onPress={onClose} />
        <View style={[s.commentSheet, { paddingBottom: insets.bottom }]}>
          <View style={s.grabber} />
          <View style={s.sheetHeader}>
            <Text style={s.sheetTitle}>
              Comments{post.comments.length > 0 ? ` (${post.comments.length})` : ''}
            </Text>
            <Pressable onPress={onClose} hitSlop={10}><X size={20} color={T.sub} /></Pressable>
          </View>

          <ScrollView ref={scrollRef} style={{ flex: 1 }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 }}>
            {/* tiny post preview */}
            <Pressable onPress={() => onProfileClick(post.user_id)} style={s.preview}>
              <Avatar src={post.author?.avatar_url} name={post.author?.full_name} size={28} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: T.text }} numberOfLines={1}>{post.author?.full_name}</Text>
                <Text style={{ fontSize: 13, color: T.sub, marginTop: 1, lineHeight: 18 }} numberOfLines={2}>{post.content}</Text>
              </View>
            </Pressable>

            {post.comments.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                <MessageSquare size={36} color={T.border} />
                <Text style={s.emptyTitle}>No comments yet</Text>
                <Text style={s.emptySub}>Be the first to comment.</Text>
              </View>
            ) : (
              <CommentThread
                comments={post.comments} currentUserId={currentUserId} currentUserProfile={currentUserProfile}
                parentId={null} depth={0} expandIds={expandIds} highlightCommentId={focusCommentId} postId={post.id}
                onAddReply={onAddReply} onUpdateComment={onUpdateComment} onDeleteComment={onDeleteComment} onProfileClick={onProfileClick}
              />
            )}
          </ScrollView>

          <View style={s.inputBar}>
            <TextInput
              value={newCommentValue} onChangeText={(t) => onCommentChange(post.id, t)}
              placeholder="Write a comment…" placeholderTextColor={T.sub} style={s.commentInput}
              onSubmitEditing={() => onAddComment(post.id)}
            />
            <Pressable onPress={() => onAddComment(post.id)} disabled={!newCommentValue?.trim()}
              style={[s.sendBtn, !newCommentValue?.trim() && { opacity: 0.35 }]}>
              <Send size={16} color="#fff" />
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Create / Edit sheet (one sheet for both)
function ComposerSheet({
  mode, onClose, currentUserProfile, content, onContentChange,
  postType, setPostType, category, setCategory,
  existingMedia, onRemoveExisting, assets, onRemoveAsset, onAddImages,
  tagSuggestions, showSuggestions, onTagSelect, isSubmitting, onSubmit,
}) {
  const insets = useSafeAreaInsets();
  const [showOptions, setShowOptions] = useState(false);
  const isEdit = mode === 'edit';
  const canPost = !isSubmitting && (content.trim() || assets.length > 0 || existingMedia.length > 0);

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <Pressable style={s.overlay} onPress={onClose} />
        <View style={[s.createSheet, { paddingBottom: insets.bottom + 8 }]}>
          <View style={s.grabber} />
          <View style={s.sheetHeader}>
            <Pressable onPress={onClose} hitSlop={10}><X size={20} color={T.text} /></Pressable>
            <Text style={[s.sheetTitle, { textAlign: 'center' }]}>{isEdit ? 'Edit post' : 'Create post'}</Text>
            <Pressable onPress={onSubmit} disabled={!canPost} style={[s.postBtn, !canPost && { opacity: 0.4 }]}>
              {isSubmitting ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff' }}>{isEdit ? 'Save' : 'Post'}</Text>}
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <Avatar src={currentUserProfile?.avatar_url} name={currentUserProfile?.full_name} size={36} />
              <Text style={{ fontSize: 15, fontWeight: '700', color: T.text }}>{currentUserProfile?.full_name}</Text>
            </View>

            <TextInput
              autoFocus value={content} onChangeText={onContentChange}
              placeholder="What's on your mind?" placeholderTextColor={T.sub}
              multiline textAlignVertical="top" style={s.postInput}
            />

            {showSuggestions && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                {tagSuggestions.map((tag, i) => (
                  <Pressable key={i} onPress={() => onTagSelect(tag)} style={s.suggestChip}>
                    <Text style={{ color: T.brand, fontWeight: '600', fontSize: 13 }}>{tag}</Text>
                  </Pressable>
                ))}
              </View>
            )}

            {(existingMedia.length > 0 || assets.length > 0) && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                {existingMedia.map((src, i) => (
                  <View key={`saved-${src}-${i}`} style={s.thumb}>
                    <Image source={{ uri: src }} style={{ width: '100%', height: '100%' }} />
                    <Pressable onPress={() => onRemoveExisting(i)} style={s.thumbX} hitSlop={6}><X size={13} color={T.text} /></Pressable>
                  </View>
                ))}
                {assets.map((a, i) => (
                  <View key={`new-${a.uri}-${i}`} style={s.thumb}>
                    <Image source={{ uri: a.uri }} style={{ width: '100%', height: '100%' }} />
                    <Pressable onPress={() => onRemoveAsset(i)} style={s.thumbX} hitSlop={6}><X size={13} color={T.text} /></Pressable>
                  </View>
                ))}
              </View>
            )}

            <Pressable onPress={onAddImages} style={s.addPhotos}>
              <ImagePlus size={20} color={T.brand} />
              <Text style={{ fontSize: 15, fontWeight: '600', color: T.text }}>Add photos</Text>
            </Pressable>

            {/* type + topic stay hidden until needed (create only) */}
            {!isEdit && (
              <>
                <Pressable onPress={() => setShowOptions((v) => !v)} style={s.optionsRow}>
                  <Text style={{ flex: 1, fontSize: 13, color: T.sub }} numberOfLines={1}>{postType} · {category}</Text>
                  <ChevronDown size={17} color={T.sub} style={{ transform: [{ rotate: showOptions ? '180deg' : '0deg' }] }} />
                </Pressable>
                {showOptions && (
                  <View style={{ marginTop: 6 }}>
                    <Text style={s.fieldLabel}>Type</Text>
                    <View style={s.chipWrap}>
                      {POST_TYPES.map((t) => (
                        <Pressable key={t} onPress={() => setPostType(t)} style={[s.selChip, postType === t && s.selChipOn]}>
                          <Text style={[s.selChipText, postType === t && { color: '#fff' }]}>{t}</Text>
                        </Pressable>
                      ))}
                    </View>
                    <Text style={[s.fieldLabel, { marginTop: 14 }]}>Topic</Text>
                    <View style={s.chipWrap}>
                      {MACRO_CATEGORIES.map((c) => (
                        <Pressable key={c} onPress={() => setCategory(c)} style={[s.selChip, category === c && s.selChipOn]}>
                          <Text style={[s.selChipText, category === c && { color: '#fff' }]}>{c}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                )}
              </>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ────────────────── MAIN SCREEN
export default function Community() {
  const navigation = useNavigation();
  const route = useRoute();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef(null);
  const focusScrollAttemptsRef = useRef(0);
  const focusRetryTimerRef = useRef(null);

  const [currentUserId, setCurrentUserId] = useState(null);
  const [currentUserProfile, setCurrentUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [posts, setPosts] = useState([]);
  // Keep in-flight heart states visible even if a realtime/refresh request finishes.
  const pendingLikesRef = useRef(new Map());
  const [trendingTags, setTrendingTags] = useState([]);
  const [globalTags, setGlobalTags] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedPostType, setSelectedPostType] = useState('All');
  const [filterOpen, setFilterOpen] = useState(false);
  const [highlightedPostId, setHighlightedPostId] = useState(null);
  const deepLinkHandledRef = useRef(null);
  const [expandedPosts, setExpandedPosts] = useState({});

  // composer (create + edit share one sheet)
  const [composer, setComposer] = useState({ open: false, mode: 'create', postId: null });
  const [newPostContent, setNewPostContent] = useState('');
  const [newPostCategory, setNewPostCategory] = useState(MACRO_CATEGORIES[0]);
  const [newPostType, setNewPostType] = useState(POST_TYPES[0]);
  const [newPostAssets, setNewPostAssets] = useState([]);
  const [editContent, setEditContent] = useState('');
  const [editMedia, setEditMedia] = useState([]);
  const [editAssets, setEditAssets] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [tagSuggestions, setTagSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const [newComment, setNewComment] = useState({});
  const [commentModal, setCommentModal] = useState(null);
  const [imageGallery, setImageGallery] = useState(null);

  const [reportModal, setReportModal] = useState({ isOpen: false, referenceId: null, referenceType: '', reportedUserId: null });
  const [reportReason, setReportReason] = useState(REPORT_REASONS[0]);
  const [reportDetails, setReportDetails] = useState('');
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);
  const [submittedReports, setSubmittedReports] = useState([]);

  // deep link: navigate('User', { screen: 'Community', params: { post, comment } })
  const focusPostId = route.params?.post || null;
  const focusCommentId = route.params?.comment || null;

  useEffect(() => {
    if (!focusPostId) return;
    setSearchQuery(''); setSelectedCategory('All'); setSelectedPostType('All');
  }, [focusPostId]);

  const fetchUserReports = async (uid) => {
    const { data } = await supabase.from('reports').select('reference_id').eq('reporter_id', uid);
    if (data) setSubmittedReports(data.map((r) => r.reference_id));
  };

  const fetchPosts = async () => {
    const { data: postsData } = await supabase.from('community_posts')
      .select('*, author:user_profiles!community_posts_user_id_fkey(full_name, avatar_url, role)')
      .eq('is_active', true).order('created_at', { ascending: false });
    const { data: commentsData } = await supabase.from('community_comments')
      .select('*, author:user_profiles!community_comments_user_id_fkey(full_name, avatar_url)')
      .order('created_at', { ascending: true });
    const { data: likesData } = await supabase.from('community_post_likes').select('*');
    if (postsData) {
      // Group each comment/like once instead of re-scanning every row for
      // every post. The same Supabase queries, sorting and optimistic hearts remain.
      const commentsByPost = new Map();
      for (const comment of commentsData || []) {
        if (!commentsByPost.has(comment.post_id)) commentsByPost.set(comment.post_id, []);
        commentsByPost.get(comment.post_id).push(comment);
      }
      const likesByPost = new Map();
      for (const like of likesData || []) {
        if (!likesByPost.has(like.post_id)) likesByPost.set(like.post_id, []);
        likesByPost.get(like.post_id).push(like);
      }
      const enriched = postsData.map((p) => {
        const pending = pendingLikesRef.current.get(p.id);
        const serverLikes = likesByPost.get(p.id) || [];
        const likes = pending
          ? (pending.shouldBeLiked
            ? [...serverLikes.filter((l) => l.user_id !== pending.actorId), { id: `optimistic:${pending.actorId}`, post_id: p.id, user_id: pending.actorId }]
            : serverLikes.filter((l) => l.user_id !== pending.actorId))
          : serverLikes;
        return {
          ...p,
          comments: commentsByPost.get(p.id) || [],
          likes,
        };
      });
      setPosts(enriched);
      setCommentModal((prev) => (prev ? (enriched.find((p) => p.id === prev.id) ?? prev) : null));
      const tc = {};
      postsData.forEach((post) => post.content.split(/\s+/).forEach((w) => {
        if (w.match(/^#\w+$/)) {
          const k = w.toLowerCase();
          if (!tc[k]) tc[k] = { count: 0, original: w };
          tc[k].count++;
        }
      }));
      const sorted = Object.values(tc).sort((a, b) => b.count - a.count);
      setTrendingTags(sorted.slice(0, 8));
      setGlobalTags(sorted.map((t) => t.original));
    }
  };

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setCurrentUserId(user.id);
      const { data: p } = await supabase.from('user_profiles').select('*').eq('id', user.id).single();
      setCurrentUserProfile(p);
      await Promise.all([fetchPosts(), fetchUserReports(user.id)]);
      setLoading(false);
    };
    init();

    // Apply remote comment changes to just one post; avoid full-feed refetches.
    let realtimeActive = true;
    let likeTimer;
    const pendingPostIds = new Set();
    let syncAllLikes = false;
    const syncLiveComment = async (commentId) => {
      if (!commentId) return;
      const { data: comment } = await supabase.from('community_comments')
        .select('*, author:user_profiles!community_comments_user_id_fkey(full_name, avatar_url)')
        .eq('id', commentId).maybeSingle();
      if (!realtimeActive || !comment) return;
      const merge = (post) => {
        if (post.id !== comment.post_id) return post;
        const comments = [...post.comments.filter((c) => c.id !== comment.id), comment]
          .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        return { ...post, comments };
      };
      setPosts((prev) => prev.map(merge));
      setCommentModal((prev) => prev ? merge(prev) : prev);
    };
    const scheduleLikeSync = (postId) => {
      if (postId) pendingPostIds.add(postId);
      else syncAllLikes = true; // DELETE events can omit non-primary-key columns.
      clearTimeout(likeTimer);
      likeTimer = setTimeout(async () => {
        const ids = [...pendingPostIds];
        const all = syncAllLikes;
        pendingPostIds.clear();
        syncAllLikes = false;
        let query = supabase.from('community_post_likes').select('id, post_id, user_id');
        if (!all && ids.length) query = query.in('post_id', ids);
        const { data, error } = await query;
        if (!realtimeActive || error || !data) return;
        const grouped = new Map();
        data.forEach((like) => {
          if (!grouped.has(like.post_id)) grouped.set(like.post_id, []);
          grouped.get(like.post_id).push(like);
        });
        const touched = new Set(ids);
        const applyLikes = (post) => {
          if (!all && !touched.has(post.id)) return post;
          let likes = grouped.get(post.id) || [];
          // Do not override an in-flight optimistic heart on this device.
          const pending = pendingLikesRef.current.get(post.id);
          if (pending) {
            likes = likes.filter((l) => l.user_id !== pending.actorId);
            if (pending.shouldBeLiked) likes.push({ id: `optimistic:${pending.actorId}`, post_id: post.id, user_id: pending.actorId });
          }
          if (post.likes.length === likes.length && post.likes.every((l) => likes.some((v) => v.id === l.id))) return post;
          return { ...post, likes };
        };
        setPosts((prev) => prev.map(applyLikes));
        setCommentModal((prev) => prev ? applyLikes(prev) : prev);
      }, 300);
    };
    const channel = supabase.channel(`community_realtime_${Date.now()}`)
      // 1. new post (INSERT)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'community_posts' }, async (payload) => {
        if (payload.new && payload.new.is_active) {
          // get the full post with its author info
          const { data: newPost } = await supabase
            .from('community_posts')
            .select('*, author:user_profiles!community_posts_user_id_fkey(full_name, avatar_url, role)')
            .eq('id', payload.new.id)
            .single();
          if (newPost && realtimeActive) {
            setPosts((prev) => {
              // skip if it's already there (the author's own post)
              if (prev.some((p) => p.id === newPost.id)) return prev;
              return [{ ...newPost, comments: [], likes: [] }, ...prev];
            });
          }
        }
      })
      // Existing soft-delete behavior + live edits to another user's post.
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'community_posts' }, async (payload) => {
        if (!payload.new?.id) return;
        if (payload.new.is_active === false) {
          setPosts((prev) => prev.filter((post) => post.id !== payload.new.id));
          setCommentModal((prev) => (prev?.id === payload.new.id ? null : prev));
          return;
        }
        const { data: changedPost } = await supabase.from('community_posts')
          .select('*, author:user_profiles!community_posts_user_id_fkey(full_name, avatar_url, role)')
          .eq('id', payload.new.id).maybeSingle();
        if (!changedPost || !realtimeActive) return;
        setPosts((prev) => prev.map((post) => post.id === changedPost.id
          ? { ...post, ...changedPost } : post));
        setCommentModal((prev) => prev?.id === changedPost.id ? { ...prev, ...changedPost } : prev);
      })
      // 3. post deleted for good by a moderator (hard delete)
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'community_posts' }, (payload) => {
        setPosts((prev) => prev.filter((post) => post.id !== payload.old.id));
        setCommentModal((prev) => (prev?.id === payload.old.id ? null : prev));
      })
      // Live comments from other accounts, without reloading the entire photo feed.
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'community_comments' }, (payload) => syncLiveComment(payload.new?.id))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'community_comments' }, (payload) => syncLiveComment(payload.new?.id))
      // 4. deleted comments: change only the affected post/modal.
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'community_comments' }, (payload) => {
        const deletedId = payload.old?.id;
        if (!deletedId) return;
        setPosts((prev) => prev.map((post) => post.comments.some((c) => c.id === deletedId)
          ? { ...post, comments: post.comments.filter((c) => c.id !== deletedId) } : post));
        setCommentModal((prev) => prev?.comments.some((c) => c.id === deletedId)
          ? { ...prev, comments: prev.comments.filter((c) => c.id !== deletedId) } : prev);
      })
      // For DELETE, PostgreSQL may expose only the primary key (not post_id):
      // the fallback reconciles likes without reloading posts/images/comments.
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'community_post_likes' }, (payload) => scheduleLikeSync(payload.new?.post_id))
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'community_post_likes' }, (payload) => scheduleLikeSync(payload.old?.post_id))
      .subscribe();

    return () => {
      realtimeActive = false;
      clearTimeout(likeTimer);
      supabase.removeChannel(channel);
    };
  }, []);

  const onRefresh = async () => { setRefreshing(true); await fetchPosts(); setRefreshing(false); };

  // ─── restriction check (same rule as web)
  const checkRestriction = () => {
    if (currentUserProfile?.community_restricted_until) {
      const restrictionEnd = new Date(currentUserProfile.community_restricted_until);
      if (restrictionEnd > new Date()) {
        const timeOptions = { month: 'short', day: 'numeric', hour: 'numeric', minute: 'numeric' };
        Alert.alert('Action blocked',
          `Your account is temporarily restricted from posting or interacting until ${restrictionEnd.toLocaleString(undefined, timeOptions)} due to a Trust & Safety violation.`);
        return true;
      }
    }
    return false;
  };

  const goProfile = (userId) => { setCommentModal(null); navigation.navigate('PublicProfile', { id: userId }); };

  // ─── composer open/close
  const resetCreate = () => {
    setNewPostContent(''); setNewPostType(POST_TYPES[0]); setNewPostCategory(MACRO_CATEGORIES[0]);
    setNewPostAssets([]); setShowSuggestions(false);
  };
  const resetEdit = () => { setEditContent(''); setEditMedia([]); setEditAssets([]); };

  const openCreate = () => {
    if (checkRestriction()) return;
    resetCreate();
    setComposer({ open: true, mode: 'create', postId: null });
  };
  const openEdit = (post) => {
    setEditContent(post.content ?? '');
    setEditMedia(Array.isArray(post.media_urls) ? post.media_urls : []);
    setEditAssets([]);
    setComposer({ open: true, mode: 'edit', postId: post.id });
  };
  const closeComposer = () => {
    if (isSubmitting) return;
    if (composer.mode === 'create') resetCreate(); else resetEdit();
    setComposer({ open: false, mode: 'create', postId: null });
  };

  // ─── create post
  const handleContentChange = (text) => {
    if (composer.mode === 'edit') { setEditContent(text); return; }
    setNewPostContent(text);
    const match = text.match(/(#\w+)$/);
    if (match) {
      const filtered = globalTags.filter((t) => t.toLowerCase().includes(match[1].toLowerCase()));
      setTagSuggestions(filtered.slice(0, 5)); setShowSuggestions(filtered.length > 0);
    } else setShowSuggestions(false);
  };
  const handleTagSelect = (tag) => { setNewPostContent((prev) => prev.replace(/#\w+$/, `${tag} `)); setShowSuggestions(false); };

  const handleCreatePost = async () => {
    if (checkRestriction()) return;
    if (!newPostContent.trim() && newPostAssets.length === 0) return;
    setIsSubmitting(true);
    try {
      const uploadedUrls = [];
      for (const [i, asset] of newPostAssets.entries()) {
        const url = await uploadImage(currentUserProfile?.id, asset, i);
        if (!url) {
          Alert.alert('Photo upload failed', `${lastUploadError || 'Please try again.'}\n\nYour post was not published.`);
          return;
        }
        uploadedUrls.push(url);
      }
      await supabase.from('community_posts').insert([{
        user_id: currentUserProfile.id, content: newPostContent, category: newPostCategory,
        post_type: newPostType, media_urls: uploadedUrls, is_active: true,
      }]);
      resetCreate(); setComposer({ open: false, mode: 'create', postId: null });
      fetchPosts();
    } catch (err) { console.error(err); } finally { setIsSubmitting(false); }
  };

  // ─── edit post
  const handleUpdatePost = async (postId) => {
    if (checkRestriction()) return;
    if (!currentUserId || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const newImageUrls = [];
      for (const [index, asset] of editAssets.entries()) {
        const url = await uploadImage(currentUserId, asset, index);
        if (!url) { Alert.alert('Photo upload failed', lastUploadError || 'Please try again.'); return; }
        newImageUrls.push(url);
      }
      const nextMediaUrls = [...editMedia, ...newImageUrls];
      const { data, error } = await supabase.from('community_posts')
        .update({ content: editContent.trim(), media_urls: nextMediaUrls })
        .eq('id', postId).eq('user_id', currentUserId).select('id').maybeSingle();
      if (error || !data) {
        console.error('Failed to update post:', error);
        Alert.alert('Error', 'Could not update your post. Please try again.');
        return;
      }
      resetEdit(); setComposer({ open: false, mode: 'create', postId: null });
      await fetchPosts();
    } finally { setIsSubmitting(false); }
  };

  const addImages = async () => {
    // iPhone can't open the photo picker while a sheet is open: close it, pick, then reopen (text + photos are kept)
    const reopen = Platform.OS === 'ios' && composer.open;
    const prev = composer;
    if (reopen) { setComposer((c) => ({ ...c, open: false })); await new Promise((r) => setTimeout(r, 450)); }
    let assets = [];
    try { assets = await pickImages(); }
    finally { if (reopen) setComposer(prev); }
    if (!assets.length) return;
    if (composer.mode === 'edit') setEditAssets((p) => [...p, ...assets]);
    else setNewPostAssets((p) => [...p, ...assets]);
  };

  const handleDeletePost = async (id) => {
    if (!(await confirmAsync('Delete post', 'Delete this post?'))) return;
    await supabase.from('community_posts').update({ is_active: false }).eq('id', id);
    fetchPosts();
  };

  // ─── comments
  const handleAddComment = async (postId) => {
    if (checkRestriction()) return;
    const text = newComment[postId]?.trim();
    if (!text || !currentUserProfile?.id) return;
    const post = posts.find((item) => item.id === postId);
    const { data: insertedComment, error } = await supabase.from('community_comments')
      .insert([{ post_id: postId, user_id: currentUserProfile.id, content: text }]).select('id').single();
    if (error) { console.error('Could not post community comment:', error); return; }
    if (post?.user_id && post.user_id !== currentUserProfile.id) {
      await createCommunityActivityNotification({
        recipientId: post.user_id, actorId: currentUserProfile.id, type: 'community_comment',
        content: `${currentUserProfile.full_name || 'Someone'} commented on your community post.`,
        linkUrl: buildCommunityActivityLink(postId, insertedComment.id),
      });
    }
    setNewComment((prev) => ({ ...prev, [postId]: '' }));
    await fetchPosts();
  };

  const handleAddReply = async (postId, parentCommentId, text) => {
    if (checkRestriction()) return;
    if (!text?.trim() || !currentUserProfile?.id) return;
    const post = posts.find((item) => item.id === postId);
    const parentComment = post?.comments?.find((comment) => comment.id === parentCommentId);
    const { data: insertedComment, error } = await supabase.from('community_comments')
      .insert([{ post_id: postId, user_id: currentUserProfile.id, content: text.trim(), parent_comment_id: parentCommentId }])
      .select('id').single();
    if (error) { console.error('Could not post community reply:', error); return; }

    const recipients = new Set([parentComment?.user_id, post?.user_id].filter((id) => id && id !== currentUserProfile.id));
    for (const recipientId of recipients) {
      const repliedToCurrentUser = parentComment?.user_id === recipientId;
      await createCommunityActivityNotification({
        recipientId, actorId: currentUserProfile.id, type: 'community_reply',
        content: repliedToCurrentUser
          ? `${currentUserProfile.full_name || 'Someone'} replied to your comment on a community post.`
          : `${currentUserProfile.full_name || 'Someone'} replied to a comment on your community post.`,
        linkUrl: buildCommunityActivityLink(postId, insertedComment.id),
      });
    }
    await fetchPosts();
  };

  const handleUpdateComment = async (commentId, content) => {
    if (checkRestriction()) return false;
    if (!currentUserId || !content?.trim()) return false;
    const { data, error } = await supabase.from('community_comments')
      .update({ content: content.trim() }).eq('id', commentId).eq('user_id', currentUserId).select('id').maybeSingle();
    if (error || !data) {
      console.error('Failed to update comment:', error);
      Alert.alert('Error', 'Could not update your comment. Please try again.');
      return false;
    }
    await fetchPosts();
    return true;
  };

  const handleDeleteComment = async (commentId) => {
    if (!currentUserId || !(await confirmAsync('Delete comment', 'Delete your comment?'))) return;
    const { error } = await supabase.from('community_comments').delete().eq('id', commentId).eq('user_id', currentUserId);
    if (error) {
      console.error('Failed to delete comment:', error);
      Alert.alert('Error', 'Could not delete your comment. Please try again.');
      return;
    }
    await fetchPosts();
  };

  // ─── likes: update the heart immediately, then persist the same Supabase operation.
  const toggleLike = async (postId) => {
    if (checkRestriction()) return;
    const post = posts.find((item) => item.id === postId);
    const actorId = currentUserProfile?.id;
    if (!post || !actorId || pendingLikesRef.current.has(postId)) return;

    const previousLike = post.likes.find((like) => like.user_id === actorId);
    const shouldBeLiked = !previousLike;
    pendingLikesRef.current.set(postId, { actorId, shouldBeLiked });
    const updateOwnLike = (likes, liked, ownLike) => {
      const others = likes.filter((like) => like.user_id !== actorId);
      return liked ? [...others, ownLike] : others;
    };
    const optimisticLike = { id: `optimistic:${actorId}`, post_id: postId, user_id: actorId };
    setPosts((prev) => prev.map((item) => item.id === postId
      ? { ...item, likes: updateOwnLike(item.likes, shouldBeLiked, optimisticLike) } : item));
    setCommentModal((prev) => prev?.id === postId
      ? { ...prev, likes: updateOwnLike(prev.likes, shouldBeLiked, optimisticLike) } : prev);

    try {
      if (!shouldBeLiked) {
        const { error } = await supabase.from('community_post_likes').delete()
          .eq('post_id', postId).eq('user_id', actorId);
        if (error) throw error;
      } else {
        const { data: insertedLike, error } = await supabase.from('community_post_likes')
          .insert([{ post_id: postId, user_id: actorId }]).select('id').single();
        if (error) throw error;
        if (post.user_id !== actorId) {
          await createCommunityActivityNotification({
            recipientId: post.user_id, actorId, type: 'community_like',
            content: `${currentUserProfile.full_name || 'Someone'} liked your community post.`,
            linkUrl: buildCommunityActivityLink(postId, null, insertedLike.id),
          });
        }
      }
      // Keep the original post-refresh behavior to reconcile server-generated IDs/counts.
      await fetchPosts();
    } catch (error) {
      console.error(`Could not ${shouldBeLiked ? 'like' : 'unlike'} community post:`, error);
      // Roll back only this user's heart; don't discard other users' concurrent likes.
      setPosts((prev) => prev.map((item) => item.id === postId
        ? { ...item, likes: updateOwnLike(item.likes, !shouldBeLiked, previousLike) } : item));
      setCommentModal((prev) => prev?.id === postId
        ? { ...prev, likes: updateOwnLike(prev.likes, !shouldBeLiked, previousLike) } : prev);
      Alert.alert('Could not update like', 'Please try again.');
    } finally {
      pendingLikesRef.current.delete(postId);
    }
  };

  // ─── reports
  const closeReport = () => setReportModal({ isOpen: false, referenceId: null, referenceType: '', reportedUserId: null });
  const handleSubmitReport = async () => {
    if (!reportDetails.trim()) return;
    setIsSubmittingReport(true);
    try {
      await supabase.from('reports').insert([{
        reporter_id: currentUserId, reported_user_id: reportModal.reportedUserId, reason: reportReason,
        details: reportDetails, reference_type: reportModal.referenceType, reference_id: reportModal.referenceId,
      }]);
      Alert.alert('Report submitted.');
      setSubmittedReports((p) => [...p, reportModal.referenceId]);
      closeReport(); setReportDetails(''); setReportReason(REPORT_REASONS[0]);
    } catch { Alert.alert('Failed to submit report.'); }
    finally { setIsSubmittingReport(false); }
  };

  // ─── one ⋯ menu per post
  const openPostMenu = (post) => {
    if (post.user_id === currentUserId) {
      Alert.alert('Your post', undefined, [
        { text: 'Edit', onPress: () => openEdit(post) },
        { text: 'Delete', style: 'destructive', onPress: () => handleDeletePost(post.id) },
        { text: 'Cancel', style: 'cancel' },
      ]);
    } else {
      const hasReported = submittedReports.includes(post.id);
      Alert.alert('Post options', undefined, [
        {
          text: hasReported ? 'Already reported' : 'Report post',
          onPress: () => {
            if (hasReported) { Alert.alert('Already reported', 'Our moderators are reviewing it.'); return; }
            setReportModal({ isOpen: true, referenceId: post.id, referenceType: 'post', reportedUserId: post.user_id });
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  };

  // ─── filtering (same as web)
  const filteredPosts = useMemo(() => posts.filter((p) => {
    const matchesSearch = p.content.toLowerCase().includes(searchQuery.toLowerCase())
      || p.author?.full_name?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesPostType = selectedPostType === 'All'
      || (selectedPostType === 'My Post' ? p.user_id === currentUserId : p.post_type === selectedPostType);
    return matchesSearch && (selectedCategory === 'All' || p.category === selectedCategory) && matchesPostType;
  }), [posts, searchQuery, selectedCategory, selectedPostType, currentUserId]);

  // deep link: highlight post, open comments, scroll to it
  useEffect(() => {
    if (!focusPostId) { deepLinkHandledRef.current = null; setHighlightedPostId(null); return; }
    if (loading || !filteredPosts.some((post) => post.id === focusPostId)) return;
    const key = `${focusPostId}:${focusCommentId || ''}`;
    if (deepLinkHandledRef.current === key) return;
    const targetPost = posts.find((post) => post.id === focusPostId);
    if (!targetPost) return;

    deepLinkHandledRef.current = key;
    setHighlightedPostId(focusPostId);
    if (focusCommentId) setCommentModal(targetPost);

    const focusIndex = filteredPosts.findIndex((p) => p.id === focusPostId);
    focusScrollAttemptsRef.current = 0;
    const focusTimer = setTimeout(() => {
      if (focusIndex >= 0) scrollRef.current?.scrollToIndex({ index: focusIndex, viewPosition: 0.06, animated: true });
    }, 250);
    const highlightTimer = setTimeout(() => setHighlightedPostId(null), 3500);
    return () => {
      clearTimeout(focusTimer);
      clearTimeout(highlightTimer);
      if (focusRetryTimerRef.current) clearTimeout(focusRetryTimerRef.current);
    };
  }, [focusPostId, focusCommentId, filteredPosts, loading, posts]);

  const renderContentWithTags = (content) =>
    content.split(/(#\w+)/g).map((part, i) =>
      part.match(/^#\w+/)
        ? <Text key={i} onPress={() => setSearchQuery(part)} style={{ fontWeight: '600', color: '#047857' }}>{part}</Text>
        : <Text key={i}>{part}</Text>);

  if (loading) return <UserScreenSkeleton type="community" />;

  const hasFilters = !!searchQuery || selectedCategory !== 'All';
  const clearFilters = () => { setSearchQuery(''); setSelectedCategory('All'); setSelectedPostType('All'); };
  const isEditMode = composer.mode === 'edit';

  // Virtualized posts: mount only visible/nearby rows and their photo collages.
  // All original menus, hashtags, optimistic likes, comments and profile links remain.
  const renderPost = ({ item: post }) => {
    const isLiked = post.likes.some((like) => like.user_id === currentUserId);
    const isLong = (post.content?.length || 0) > 240 || (post.content?.split('\n').length || 0) > 5;
    const isOpen = !!expandedPosts[post.id];
    return (
      <View style={[s.post, highlightedPostId === post.id && s.postHighlight]}>

        <Pressable onPress={() => navigation.navigate('PublicProfile', { id: post.user_id })}>
          <Avatar src={post.author?.avatar_url} name={post.author?.full_name} size={40} />
        </Pressable>

        <View style={{ flex: 1 }}>
          <View style={s.postHead}>
            <Text onPress={() => navigation.navigate('PublicProfile', { id: post.user_id })}
              style={s.postName} numberOfLines={1}>
              {post.author?.full_name || 'Community member'}
            </Text>
            <Text style={s.postTime}>· {timeShort(post.created_at)}</Text>
            <Pressable onPress={() => openPostMenu(post)} style={s.moreBtn} hitSlop={8}>
              <MoreHorizontal size={18} color={T.sub} />
            </Pressable>
          </View>
          {!!post.post_type && <Text style={s.postType} numberOfLines={1}>{post.post_type}</Text>}

          {!!post.content && (
            <View style={{ marginTop: 4 }}>
              <Text style={s.postText} numberOfLines={isLong && !isOpen ? 5 : undefined}>
                {renderContentWithTags(post.content)}
              </Text>
              {isLong && (
                <Pressable onPress={() => setExpandedPosts((p) => ({ ...p, [post.id]: !p[post.id] }))} hitSlop={6}>
                  <Text style={s.seeMore}>{isOpen ? 'See less' : 'See more'}</Text>
                </Pressable>
              )}
            </View>
          )}

          {post.media_urls?.length > 0 && (
            <PostImageCollage mediaUrls={post.media_urls} onOpen={(imgs, i) => setImageGallery({ images: imgs, index: i })} />
          )}

          <View style={s.actions}>
            <Pressable onPress={() => toggleLike(post.id)} style={s.actionBtn} hitSlop={8}>
              <Heart size={18} color={isLiked ? T.danger : T.sub} fill={isLiked ? T.danger : 'none'} />
              {post.likes.length > 0 && (
                <Text style={[s.actionCount, isLiked && { color: T.danger }]}>{post.likes.length}</Text>
              )}
            </Pressable>
            <Pressable onPress={() => setCommentModal(post)} style={s.actionBtn} hitSlop={8}>
              <MessageSquare size={18} color={T.sub} />
              {post.comments.length > 0 && <Text style={s.actionCount}>{post.comments.length}</Text>}
            </Pressable>
          </View>
        </View>
      </View>
    );
  };

  // A post linked from a notification can be far beyond the initial window.
  // RN can't measure offscreen variable-height rows, so advance to its region
  // and retry a bounded number of times until scrollToIndex can resolve it.
  const handleScrollToIndexFailed = ({ index, averageItemLength }) => {
    if (focusScrollAttemptsRef.current >= 3) return;
    focusScrollAttemptsRef.current += 1;
    scrollRef.current?.scrollToOffset({
      offset: Math.max(0, index * (averageItemLength || 220)), animated: false,
    });
    if (focusRetryTimerRef.current) clearTimeout(focusRetryTimerRef.current);
    focusRetryTimerRef.current = setTimeout(() => {
      scrollRef.current?.scrollToIndex({ index, viewPosition: 0.06, animated: true });
    }, 200);
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <FlatList
        ref={scrollRef}
        data={filteredPosts}
        keyExtractor={(post) => post.id}
        renderItem={renderPost}
        initialNumToRender={5}
        maxToRenderPerBatch={5}
        windowSize={5}
        updateCellsBatchingPeriod={50}
        contentContainerStyle={{ paddingBottom: 140 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={T.brand} colors={[T.brand]} />}
        onScrollToIndexFailed={handleScrollToIndexFailed}
        ListHeaderComponent={
          <>
            {/* composer + filter + post-type chips */}
            <Reveal delay={90}><View style={s.topBlock}>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <PressScale onPress={openCreate} style={s.composerPill}>
                  <Text style={s.composerText} numberOfLines={1}>What's on your mind?</Text>
                  <ImagePlus size={18} color={T.brand} />
                </PressScale>
                <Pressable onPress={() => setFilterOpen(true)} style={[s.filterBtn, hasFilters && { backgroundColor: T.soft }]}>
                  <SlidersHorizontal size={20} color={hasFilters ? T.brand : T.text} />
                </Pressable>
              </View>

              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingTop: 12 }}>
                {['All', 'My Post', ...POST_TYPES].map((type) => (
                  <Pressable key={type} onPress={() => setSelectedPostType(type)}
                    style={[s.chip, selectedPostType === type && s.chipOn]}>
                    <Text style={[s.chipText, selectedPostType === type && { color: '#fff' }]}>{type}</Text>
                  </Pressable>
                ))}
              </ScrollView>

              {hasFilters && (
                <View style={s.activeRow}>
                  {!!searchQuery && (
                    <Pressable onPress={() => setSearchQuery('')} style={s.activeChip}>
                      <Text style={s.activeChipText} numberOfLines={1}>“{searchQuery}”</Text>
                      <X size={14} color="#065f46" />
                    </Pressable>
                  )}
                  {selectedCategory !== 'All' && (
                    <Pressable onPress={() => setSelectedCategory('All')} style={s.activeChip}>
                      <Text style={s.activeChipText} numberOfLines={1}>{selectedCategory}</Text>
                      <X size={14} color="#065f46" />
                    </Pressable>
                  )}
                </View>
              )}
            </View></Reveal>

            <View style={{ borderTopWidth: 1, borderTopColor: T.line }} />
          </>
        }
        ListEmptyComponent={
                <View style={s.empty}>
                  <Inbox size={40} color={T.border} />
                  <Text style={s.emptyTitle}>{posts.length ? 'No posts found' : 'No posts yet'}</Text>
                  <Text style={s.emptySub}>{posts.length ? 'Try a different filter.' : 'Be the first to share something.'}</Text>
                  <PressScale onPress={posts.length ? clearFilters : openCreate} style={s.fillBtn}>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>{posts.length ? 'Clear filters' : 'Create post'}</Text>
                  </PressScale>
                </View>
        }
      />

      {/* FILTER SHEET: search, topic, trending */}
      <Modal visible={filterOpen} transparent animationType="slide" onRequestClose={() => setFilterOpen(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <Pressable style={s.overlay} onPress={() => setFilterOpen(false)} />
          <View style={[s.filterSheet, { paddingBottom: insets.bottom + 12 }]}>
            <View style={s.grabber} />
            <View style={s.sheetHeader}>
              <Text style={s.sheetTitle}>Filter</Text>
              <Pressable onPress={() => setFilterOpen(false)} hitSlop={10}><X size={20} color={T.sub} /></Pressable>
            </View>
            <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
              <View style={s.searchBox}>
                <Search size={18} color={T.sub} />
                <TextInput value={searchQuery} onChangeText={setSearchQuery} placeholder="Search posts or people"
                  placeholderTextColor={T.sub} style={{ flex: 1, fontSize: 15, color: T.text, paddingVertical: 0 }} />
                {!!searchQuery && <Pressable onPress={() => setSearchQuery('')} hitSlop={8}><X size={16} color={T.sub} /></Pressable>}
              </View>

              <Text style={s.fieldLabel}>Topic</Text>
              <View style={s.chipWrap}>
                {['All', ...MACRO_CATEGORIES].map((c) => (
                  <Pressable key={c} onPress={() => setSelectedCategory(c)} style={[s.selChip, selectedCategory === c && s.selChipOn]}>
                    <Text style={[s.selChipText, selectedCategory === c && { color: '#fff' }]}>{c === 'All' ? 'All topics' : c}</Text>
                  </Pressable>
                ))}
              </View>

              {trendingTags.length > 0 && (
                <>
                  <Text style={[s.fieldLabel, { marginTop: 18 }]}>Trending</Text>
                  <View style={s.chipWrap}>
                    {trendingTags.map((tag, i) => {
                      const on = searchQuery === tag.original;
                      return (
                        <Pressable key={`${tag.original}-${i}`} onPress={() => setSearchQuery(on ? '' : tag.original)}
                          style={[s.selChip, on && { backgroundColor: T.soft }]}>
                          <Text style={[s.selChipText, on && { color: '#065f46' }]}>{tag.original}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </>
              )}

              <PressScale onPress={() => setFilterOpen(false)} style={[s.fillBtn, { marginTop: 22, alignSelf: 'stretch' }]}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>Show {filteredPosts.length} posts</Text>
              </PressScale>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* CREATE / EDIT */}
      {composer.open && (
        <ComposerSheet
          mode={composer.mode} onClose={closeComposer} currentUserProfile={currentUserProfile}
          content={isEditMode ? editContent : newPostContent} onContentChange={handleContentChange}
          postType={newPostType} setPostType={setNewPostType} category={newPostCategory} setCategory={setNewPostCategory}
          existingMedia={isEditMode ? editMedia : []} onRemoveExisting={(i) => setEditMedia((c) => c.filter((_, j) => j !== i))}
          assets={isEditMode ? editAssets : newPostAssets}
          onRemoveAsset={(i) => (isEditMode ? setEditAssets((c) => c.filter((_, j) => j !== i)) : setNewPostAssets((c) => c.filter((_, j) => j !== i)))}
          onAddImages={addImages}
          tagSuggestions={tagSuggestions} showSuggestions={!isEditMode && showSuggestions} onTagSelect={handleTagSelect}
          isSubmitting={isSubmitting}
          onSubmit={() => (isEditMode ? handleUpdatePost(composer.postId) : handleCreatePost())}
        />
      )}

      {/* COMMENTS */}
      {commentModal && (
        <CommentModal
          post={commentModal} onClose={() => setCommentModal(null)}
          currentUserId={currentUserId} currentUserProfile={currentUserProfile}
          onAddComment={handleAddComment} onAddReply={handleAddReply}
          onUpdateComment={handleUpdateComment} onDeleteComment={handleDeleteComment}
          newCommentValue={newComment[commentModal?.id] || ''} focusCommentId={focusCommentId}
          onCommentChange={(postId, val) => setNewComment((prev) => ({ ...prev, [postId]: val }))}
          onProfileClick={goProfile}
        />
      )}

      {/* FEED GALLERY */}
      {imageGallery && (
        <ImageGalleryModal images={imageGallery.images} initialIndex={imageGallery.index} onClose={() => setImageGallery(null)} />
      )}

      {/* REPORT */}
      <Modal visible={reportModal.isOpen} transparent animationType="slide" onRequestClose={closeReport}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <Pressable style={s.overlay} onPress={closeReport} />
          <View style={[s.reportSheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={s.grabber} />
            <Text style={[s.sheetTitle, { marginTop: 8, marginBottom: 14 }]}>Report this post</Text>
            <View style={s.chipWrap}>
              {REPORT_REASONS.map((r) => (
                <Pressable key={r} onPress={() => setReportReason(r)} style={[s.selChip, reportReason === r && s.selChipOn]}>
                  <Text style={[s.selChipText, reportReason === r && { color: '#fff' }]}>{r}</Text>
                </Pressable>
              ))}
            </View>
            <TextInput value={reportDetails} onChangeText={setReportDetails} placeholder="What happened?"
              placeholderTextColor={T.sub} multiline textAlignVertical="top" style={s.reportInput} />
            <Pressable onPress={handleSubmitReport} disabled={isSubmittingReport || !reportDetails.trim()}
              style={[s.reportSubmit, (isSubmittingReport || !reportDetails.trim()) && { opacity: 0.4 }]}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>{isSubmittingReport ? 'Submitting…' : 'Submit report'}</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  // top
  topBlock: { paddingHorizontal: 16, backgroundColor: '#F6FBF8', paddingTop: 17, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#D6EDE0'},
  composerPill: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16 , height: 49, borderRadius: 24, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#DAEDE3', shadowColor: '#064E3B', shadowOpacity: 0.07, shadowRadius: 9, shadowOffset: { width: 0, height: 3 }, elevation: 2},
  composerText: { flex: 1, fontSize: 15, color: T.sub },
  filterBtn: { alignItems: 'center', justifyContent: 'center' , width: 47, height: 47, borderRadius: 16, backgroundColor: '#E5F4EC', borderWidth: 1, borderColor: '#CDEBD9'},
  chip: { justifyContent: 'center', paddingHorizontal: 14, borderRadius: 16, backgroundColor: '#ECF4EF', height: 35},
  chipOn: { backgroundColor: T.text },
  chipText: { fontSize: 13, fontWeight: '600', color: T.text },
  activeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingTop: 12 },
  activeChip: { flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: '100%', backgroundColor: T.soft, borderRadius: 17, paddingHorizontal: 12, height: 32 },
  activeChipText: { fontSize: 13, fontWeight: '600', color: '#065f46', flexShrink: 1 },

  // posts (timeline rows: avatar left, content right)
  post: { flexDirection: 'row', gap: 12, borderBottomWidth: 1, backgroundColor: '#fff' , marginHorizontal: 11, marginTop: 10, paddingHorizontal: 13, paddingTop: 15, paddingBottom: 9, borderWidth: 1, borderColor: '#E1EDE6', borderBottomColor: '#E1EDE6', borderRadius: 20, shadowColor: '#123D2A', shadowOpacity: 0.035, shadowRadius: 8, shadowOffset: {width: 0, height: 2}, elevation: 1},
  postHighlight: { backgroundColor: T.soft },
  postHead: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  postName: { flexShrink: 1, fontSize: 15, fontWeight: '700', color: T.text , letterSpacing: -0.2},
  postTime: { fontSize: 13, color: T.sub },
  moreBtn: { marginLeft: 'auto', width: 28, height: 28, marginTop: -4, marginRight: -6, alignItems: 'center', justifyContent: 'center' },
  postType: { fontSize: 13, fontWeight: '600', color: T.brand, marginTop: 1 },
  postText: { fontSize: 15, color: T.text , lineHeight: 23},
  seeMore: { fontSize: 14, fontWeight: '600', color: T.brand, marginTop: 4 },
  collage: { flexDirection: 'row', gap: 2, borderRadius: 12, overflow: 'hidden', marginTop: 10, borderWidth: 1, borderColor: T.line },
  moreOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15,20,25,0.55)', alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 28, height: 38, marginTop: 4 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 32 },
  actionCount: { fontSize: 13, color: T.sub },

  // empty
  empty: { alignItems: 'center', paddingVertical: 56, paddingHorizontal: 24 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: T.text, marginTop: 12 },
  emptySub: { fontSize: 14, color: T.sub, marginTop: 4, textAlign: 'center' },
  fillBtn: { paddingHorizontal: 26, backgroundColor: T.brand, alignItems: 'center', justifyContent: 'center', marginTop: 16 , borderRadius: 15, height: 47},

  // sheets
  overlay: { flex: 1, backgroundColor: 'rgba(15,20,25,0.5)' },
  grabber: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: T.border, marginTop: 8 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: T.line },
  sheetTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: T.text, letterSpacing: -0.2 },
  createSheet: { backgroundColor: '#fff', maxHeight: '92%' , borderTopLeftRadius: 28, borderTopRightRadius: 28},
  commentSheet: { backgroundColor: '#fff', height: '88%' , borderTopLeftRadius: 28, borderTopRightRadius: 28},
  filterSheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '85%' },
  reportSheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 20 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: T.sub, marginBottom: 10 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  selChip: { justifyContent: 'center', paddingHorizontal: 14, height: 34, borderRadius: 17, backgroundColor: T.field },
  selChipOn: { backgroundColor: T.text },
  selChipText: { fontSize: 13, fontWeight: '600', color: T.text },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: T.field, borderRadius: 21, paddingHorizontal: 14, height: 42, marginBottom: 20 },

  // composer
  postInput: { minHeight: 130, fontSize: 17, lineHeight: 24, color: T.text },
  suggestChip: { backgroundColor: T.soft, borderRadius: 17, paddingHorizontal: 12, height: 32, justifyContent: 'center' },
  thumb: { width: 88, height: 88, borderRadius: 12, overflow: 'hidden', backgroundColor: T.field },
  thumbX: { position: 'absolute', right: 4, top: 4, width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.92)', alignItems: 'center', justifyContent: 'center' },
  addPhotos: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14, paddingVertical: 12, borderTopWidth: 1, borderTopColor: T.line },
  optionsRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, borderTopWidth: 1, borderTopColor: T.line },
  postBtn: { minWidth: 64, height: 34, paddingHorizontal: 16, borderRadius: 17, backgroundColor: T.brand, alignItems: 'center', justifyContent: 'center' },

  // comments
  preview: { flexDirection: 'row', gap: 10, paddingVertical: 12, marginBottom: 6, borderBottomWidth: 1, borderBottomColor: T.line },
  nested: { marginLeft: 12, paddingLeft: 10, borderLeftWidth: 1, borderLeftColor: T.line },
  commentWrap: { paddingVertical: 8, borderRadius: 12 },
  commentHighlight: { backgroundColor: T.soft },
  cHead: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  cName: { flexShrink: 1, fontSize: 14, fontWeight: '700', color: T.text },
  cTime: { fontSize: 13, color: T.sub },
  cText: { fontSize: 15, lineHeight: 21, color: T.text, marginTop: 1 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingTop: 6 },
  metaBtn: { fontSize: 13, fontWeight: '600', color: T.sub },
  replyInput: { flex: 1, backgroundColor: T.field, borderRadius: 19, paddingHorizontal: 14, height: 38, fontSize: 14, color: T.text },
  editBox: { width: '100%', borderWidth: 1, borderColor: T.border, borderRadius: 12, backgroundColor: '#fff', padding: 10 },
  editInput: { minHeight: 64, fontSize: 15, color: T.text },
  smallBtn: { backgroundColor: T.brand, borderRadius: 16, paddingHorizontal: 16, height: 32, alignItems: 'center', justifyContent: 'center' },
  sendBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: T.brand, alignItems: 'center', justifyContent: 'center' },
  inputBar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: 1, borderTopColor: T.line },
  commentInput: { flex: 1, backgroundColor: T.field, borderRadius: 21, paddingHorizontal: 16, height: 42, fontSize: 15, color: T.text },

  // gallery
  galleryTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 8 },
  galleryCount: { color: '#fff', fontSize: 14, fontWeight: '500', backgroundColor: 'rgba(255,255,255,0.12)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, overflow: 'hidden' },
  galleryClose: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },

  // report
  reportInput: { height: 96, backgroundColor: T.field, borderRadius: 12, padding: 14, fontSize: 15, color: T.text, marginTop: 16 },
  reportSubmit: { height: 44, borderRadius: 22, backgroundColor: T.danger, alignItems: 'center', justifyContent: 'center', marginTop: 16 },
});