/**
 * Social layer — friend requests, follows, search, likes, comments.
 * All calls require an active Supabase session.
 */
import { supabase } from './supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UserResult {
  id: string;
  username: string;
  display_name: string;
  avatar_uri: string | null;
  is_public: boolean;
  /** Relationship from the current user's perspective */
  relation: 'none' | 'following' | 'request_sent' | 'request_received' | 'self';
}

export interface FriendRequest {
  id: string;
  from_user_id: string;
  to_user_id: string;
  status: 'pending' | 'accepted' | 'rejected';
  created_at: string;
  from_profile?: { username: string; display_name: string; avatar_uri: string | null };
}

export interface SocialCry {
  id: string;
  user_id: string;
  created_at: string;
  latitude: number;
  longitude: number;
  emotion: string;
  intensity: number;
  note: string | null;
  photo_uri: string | null;
  audio_uri: string | null;
  country: string | null;
  visibility: 'everyone' | 'followers' | 'close_friends' | 'only_me';
  like_count: number;
  comment_count: number;
  liked_by_me: boolean;
  profile: { username: string; display_name: string; avatar_uri: string | null; selected_tears?: string[]; allow_comments?: boolean };
}

export interface BlockedUser {
  id: string;
  username: string;
  display_name: string;
  avatar_uri: string | null;
  blocked_at: string;
}

export interface CloseFriend {
  id: string;        // close_friends row id
  friend_id: string;
  username: string;
  display_name: string;
  avatar_uri: string | null;
}

export interface ProfileSettings {
  profile_visibility: 'everyone' | 'followers' | 'only_me';
  allow_comments: boolean;
  notification_preferences: {
    new_cries_from_following: boolean;
    new_likes: boolean;
    new_comments: boolean;
    new_followers: boolean;
    friend_requests: boolean;
  };
}

export interface Comment {
  id: string;
  user_id: string;
  cry_id: string;
  content: string;
  created_at: string;
  parent_comment_id: string | null;
  like_count: number;
  liked_by_me: boolean;
  profile: { username: string; display_name: string; avatar_uri: string | null };
}

export interface Notification {
  id: string;
  user_id: string;
  type: 'like' | 'comment' | 'reply' | 'friend_request' | 'follow';
  actor_id: string;
  cry_id: string | null;
  reference_id: string | null;
  read: boolean;
  created_at: string;
  actor: { username: string; display_name: string; avatar_uri: string | null };
  cry?: { emotion: string; intensity: number } | null;
  comment_content?: string | null;
}

// ─── Search ───────────────────────────────────────────────────────────────────

export async function searchUsers(query: string): Promise<UserResult[]> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return [];

  // Cap length (usernames are ≤20 chars) so we never send a pathological pattern.
  const q = query.toLowerCase().trim().replace(/^@/, '').slice(0, 30);
  if (!q) return [];

  // Escape LIKE wildcards so the input is matched literally. Without this a bare
  // "%" matches every user, and "_" (a valid username char) acts as a wildcard.
  const pattern = `%${q.replace(/[\\%_]/g, c => `\\${c}`)}%`;

  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_uri, is_public')
    .ilike('username', pattern)
    .neq('id', session.user.id)
    .limit(20);

  if (error || !data) return [];

  // Fetch follows, pending requests, and blocks in parallel
  const [followsRes, requestsRes, blocksRes] = await Promise.all([
    supabase.from('follows').select('following_id').eq('follower_id', session.user.id),
    supabase.from('friend_requests').select('to_user_id, from_user_id, status').or(
      `from_user_id.eq.${session.user.id},to_user_id.eq.${session.user.id}`
    ).eq('status', 'pending'),
    supabase.from('blocks').select('blocked_id').eq('blocker_id', session.user.id),
  ]);

  const followingIds = new Set((followsRes.data ?? []).map(f => f.following_id));
  const sentTo = new Set((requestsRes.data ?? [])
    .filter(r => r.from_user_id === session.user.id).map(r => r.to_user_id));
  const receivedFrom = new Set((requestsRes.data ?? [])
    .filter(r => r.to_user_id === session.user.id).map(r => r.from_user_id));
  const blockedIds = new Set((blocksRes.data ?? []).map(b => b.blocked_id));

  return data
    .filter(u => !blockedIds.has(u.id))
    .map(u => ({
      ...u,
      relation: followingIds.has(u.id)
        ? 'following'
        : sentTo.has(u.id)
          ? 'request_sent'
          : receivedFrom.has(u.id)
            ? 'request_received'
            : 'none',
    })) as UserResult[];
}

// ─── Follows ──────────────────────────────────────────────────────────────────

export async function followUser(targetId: string): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;
  await supabase.from('follows').insert({ follower_id: session.user.id, following_id: targetId });
}

export async function unfollowUser(targetId: string): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;
  await supabase.from('follows')
    .delete()
    .eq('follower_id', session.user.id)
    .eq('following_id', targetId);
}

// ─── Friend requests ──────────────────────────────────────────────────────────

export async function sendFriendRequest(toUserId: string): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;
  await supabase.from('friend_requests').insert({
    from_user_id: session.user.id,
    to_user_id: toUserId,
  });
}

export async function respondToFriendRequest(
  requestId: string,
  action: 'accepted' | 'rejected'
): Promise<void> {
  await supabase.from('friend_requests')
    .update({ status: action })
    .eq('id', requestId);

  // If accepted, create a mutual follow
  if (action === 'accepted') {
    const { data } = await supabase
      .from('friend_requests')
      .select('from_user_id, to_user_id')
      .eq('id', requestId)
      .single();
    if (data) {
      await Promise.all([
        supabase.from('follows').upsert({ follower_id: data.to_user_id, following_id: data.from_user_id }, { onConflict: 'follower_id,following_id', ignoreDuplicates: true }),
        supabase.from('follows').upsert({ follower_id: data.from_user_id, following_id: data.to_user_id }, { onConflict: 'follower_id,following_id', ignoreDuplicates: true }),
      ]);
    }
  }
}

export async function getPendingRequests(): Promise<FriendRequest[]> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return [];

  const { data } = await supabase
    .from('friend_requests')
    .select('*, from_profile:profiles!friend_requests_from_user_id_fkey(username, display_name, avatar_uri)')
    .eq('to_user_id', session.user.id)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  return (data ?? []) as FriendRequest[];
}

// ─── Shared helper: enrich raw cry rows with like/comment counts ──────────────

async function enrichCries(
  cries: any[],
  userId: string
): Promise<SocialCry[]> {
  if (cries.length === 0) return [];
  const cryIds = cries.map(c => c.id);
  const [likesRes, commentsRes] = await Promise.all([
    supabase.from('likes').select('cry_id, user_id').in('cry_id', cryIds),
    supabase.from('comments').select('cry_id').in('cry_id', cryIds),
  ]);
  const likeMap: Record<string, number> = {};
  const commentMap: Record<string, number> = {};
  const myLikedSet = new Set<string>();
  for (const l of likesRes.data ?? []) {
    likeMap[l.cry_id] = (likeMap[l.cry_id] ?? 0) + 1;
    if (l.user_id === userId) myLikedSet.add(l.cry_id);
  }
  for (const c of commentsRes.data ?? []) commentMap[c.cry_id] = (commentMap[c.cry_id] ?? 0) + 1;
  return cries.map(c => ({
    ...c,
    like_count: likeMap[c.id] ?? 0,
    comment_count: commentMap[c.id] ?? 0,
    liked_by_me: myLikedSet.has(c.id),
    profile: c.profile || { username: 'unknown', display_name: 'Unknown', avatar_uri: null },
  })) as SocialCry[];
}

const CRY_SELECT = `
  id, user_id, created_at, latitude, longitude, emotion,
  intensity, note, photo_uri, audio_uri, country, visibility,
  profile:profiles!cries_user_id_fkey(username, display_name, avatar_uri, is_public, selected_tears, allow_comments)
`;

// ─── Following feed ───────────────────────────────────────────────────────────

export async function getSocialFeed(): Promise<SocialCry[]> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return [];

  const [followData, blocksData] = await Promise.all([
    supabase.from('follows').select('following_id').eq('follower_id', session.user.id),
    supabase.from('blocks').select('blocked_id').eq('blocker_id', session.user.id),
  ]);

  const followingIds = (followData.data ?? []).map(f => f.following_id);
  const blockedIds = new Set((blocksData.data ?? []).map(b => b.blocked_id));
  // Only followed users — own cries shown separately in "Mine" tab
  const allIds = followingIds.filter(id => !blockedIds.has(id));
  if (allIds.length === 0) return [];

  const { data: cries, error } = await supabase
    .from('cries').select(CRY_SELECT)
    .in('user_id', allIds)
    .order('created_at', { ascending: false })
    .limit(60);

  if (error || !cries) return [];
  // RLS already enforces visibility + block rules — no client-side is_public filter needed
  return enrichCries(cries, session.user.id);
}

// ─── Global feed (public profiles) ───────────────────────────────────────────

export async function getGlobalFeed(): Promise<SocialCry[]> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return [];

  const { data: blocksData } = await supabase
    .from('blocks').select('blocked_id').eq('blocker_id', session.user.id);
  const blockedIds = new Set((blocksData ?? []).map(b => b.blocked_id));

  const { data: cries, error } = await supabase
    .from('cries').select(CRY_SELECT)
    .order('created_at', { ascending: false })
    .limit(60);

  if (error || !cries) return [];
  // Only public profiles; never show blocked users; own cries always visible
  const visible = cries.filter(c =>
    !blockedIds.has(c.user_id) &&
    ((c.profile as any)?.is_public !== false || c.user_id === session.user.id)
  );
  return enrichCries(visible, session.user.id);
}

// ─── Map cries by filter ──────────────────────────────────────────────────────

export type MapFilter = 'mine' | 'following' | 'global';

export async function getMapCries(filter: MapFilter): Promise<SocialCry[]> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return [];

  if (filter === 'mine') {
    const { data: cries } = await supabase
      .from('cries').select(CRY_SELECT)
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false });
    return enrichCries(cries ?? [], session.user.id);
  }

  if (filter === 'following') {
    const [followData, blocksData] = await Promise.all([
      supabase.from('follows').select('following_id').eq('follower_id', session.user.id),
      supabase.from('blocks').select('blocked_id').eq('blocker_id', session.user.id),
    ]);
    const blockedIds = new Set((blocksData.data ?? []).map(b => b.blocked_id));
    const followingIds = (followData.data ?? []).map(f => f.following_id).filter(id => !blockedIds.has(id));
    // Exclude own cries — use 'mine' filter for those
    if (followingIds.length === 0) return [];
    const { data: cries } = await supabase
      .from('cries').select(CRY_SELECT).in('user_id', followingIds)
      .order('created_at', { ascending: false });
    // RLS already enforces visibility + block rules
    return enrichCries(cries ?? [], session.user.id);
  }

  // global
  return getGlobalFeed();
}

// ─── Single cry + user's public cries ────────────────────────────────────────

export async function getCry(cryId: string): Promise<SocialCry | null> {
  const { data: { session } } = await supabase.auth.getSession();
  const { data, error } = await supabase
    .from('cries').select(CRY_SELECT).eq('id', cryId).single();
  if (error || !data) return null;
  const enriched = await enrichCries([data], session?.user.id ?? '');
  return enriched[0] ?? null;
}

export async function getUserCries(userId: string): Promise<SocialCry[]> {
  const { data: { session } } = await supabase.auth.getSession();
  const { data: cries, error } = await supabase
    .from('cries').select(CRY_SELECT)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(30);
  if (error || !cries) return [];
  return enrichCries(cries, session?.user.id ?? '');
}

// ─── Block / unblock ──────────────────────────────────────────────────────────

export async function blockUser(targetId: string): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;
  await Promise.all([
    supabase.from('blocks').upsert(
      { blocker_id: session.user.id, blocked_id: targetId },
      { onConflict: 'blocker_id,blocked_id', ignoreDuplicates: true }
    ),
    // Also unfollow them so their cries disappear immediately
    supabase.from('follows')
      .delete()
      .eq('follower_id', session.user.id)
      .eq('following_id', targetId),
  ]);
}

export async function unblockUser(targetId: string): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;
  await supabase.from('blocks')
    .delete()
    .eq('blocker_id', session.user.id)
    .eq('blocked_id', targetId);
}

// ─── Reports ──────────────────────────────────────────────────────────────────

/**
 * Report a cry or a user profile.
 * Returns 'ok' on success, 'duplicate' if already reported, 'error' otherwise.
 */
export async function reportContent(
  type: 'cry' | 'user',
  reportedId: string,
  reason: string,
): Promise<'ok' | 'duplicate' | 'error'> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return 'error';

  // Bound the free-text reason regardless of what the caller passes in.
  const safeReason = reason.trim().slice(0, 1000);
  if (!safeReason) return 'error';

  const { error } = await supabase.from('reports').insert({
    reporter_id: session.user.id,
    reported_type: type,
    reported_id: reportedId,
    reason: safeReason,
  });

  if (error?.code === '23505') return 'duplicate'; // unique constraint violation
  if (error) {
    console.warn('[reportContent] error:', error.message);
    return 'error';
  }
  return 'ok';
}

export async function isUserBlocked(targetId: string): Promise<boolean> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return false;
  const { data } = await supabase
    .from('blocks').select('id')
    .eq('blocker_id', session.user.id)
    .eq('blocked_id', targetId)
    .maybeSingle();
  return !!data;
}

// ─── Likes ────────────────────────────────────────────────────────────────────

export async function likeCry(cryId: string): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;
  const { error } = await supabase.from('likes').insert({ user_id: session.user.id, cry_id: cryId });
  // 23505 = unique_violation — user already liked this cry (idempotent, not an error)
  if (error && error.code !== '23505') {
    console.warn('[likeCry] error:', error.message);
    // Throw so optimistic UI can roll the heart back (e.g. offline)
    throw new Error(error.message);
  }
}

export async function unlikeCry(cryId: string): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;
  const { error } = await supabase.from('likes').delete()
    .eq('user_id', session.user.id)
    .eq('cry_id', cryId);
  if (error) {
    console.warn('[unlikeCry] error:', error.message);
    throw new Error(error.message);
  }
}

// ─── Comments ─────────────────────────────────────────────────────────────────

export async function getComments(cryId: string): Promise<Comment[]> {
  const { data: { session } } = await supabase.auth.getSession();
  const { data } = await supabase
    .from('comments')
    .select('*, profile:profiles!comments_user_id_fkey(username, display_name, avatar_uri)')
    .eq('cry_id', cryId)
    .order('created_at', { ascending: true });
  const comments = data ?? [];
  if (comments.length === 0) return [];

  // Attach like counts + whether the current user liked each comment
  const { data: likeRows } = await supabase
    .from('comment_likes')
    .select('comment_id, user_id')
    .in('comment_id', comments.map(c => c.id));
  const likeMap: Record<string, number> = {};
  const mine = new Set<string>();
  for (const l of likeRows ?? []) {
    likeMap[l.comment_id] = (likeMap[l.comment_id] ?? 0) + 1;
    if (l.user_id === session?.user.id) mine.add(l.comment_id);
  }
  return comments.map(c => ({
    ...c,
    like_count: likeMap[c.id] ?? 0,
    liked_by_me: mine.has(c.id),
  })) as Comment[];
}

export const MAX_COMMENT_LEN = 500;

export async function addComment(
  cryId: string,
  content: string,
  parentCommentId?: string,
): Promise<Comment | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;

  // Defense-in-depth: don't rely on the UI's maxLength — trim and bound here too.
  const safe = content.trim().slice(0, MAX_COMMENT_LEN);
  if (!safe) return null;

  // Check if the cry owner has comments enabled before inserting
  const { data: cryRow } = await supabase
    .from('cries')
    .select('user_id, profile:profiles!cries_user_id_fkey(allow_comments)')
    .eq('id', cryId)
    .single();

  const isOwner = cryRow?.user_id === session.user.id;
  const ownerAllowsComments = (cryRow?.profile as any)?.allow_comments;

  if (!isOwner && ownerAllowsComments === false) {
    const err = new Error('Comments are turned off for this cry.') as any;
    err.code = 'COMMENTS_DISABLED';
    throw err;
  }

  const { data } = await supabase
    .from('comments')
    .insert({
      user_id: session.user.id,
      cry_id: cryId,
      content: safe,
      parent_comment_id: parentCommentId ?? null,
    })
    .select('*, profile:profiles!comments_user_id_fkey(username, display_name, avatar_uri)')
    .single();
  if (!data) return null;
  return { ...data, like_count: 0, liked_by_me: false } as Comment;
}

// ─── Comment likes ────────────────────────────────────────────────────────────

export async function likeComment(commentId: string): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;
  const { error } = await supabase
    .from('comment_likes')
    .insert({ user_id: session.user.id, comment_id: commentId });
  // 23505 = already liked (idempotent, not an error)
  if (error && error.code !== '23505') throw new Error(error.message);
}

export async function unlikeComment(commentId: string): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;
  const { error } = await supabase
    .from('comment_likes')
    .delete()
    .eq('user_id', session.user.id)
    .eq('comment_id', commentId);
  if (error) throw new Error(error.message);
}

export async function deleteComment(commentId: string): Promise<void> {
  await supabase.from('comments').delete().eq('id', commentId);
}

// ─── Notifications ────────────────────────────────────────────────────────────

export async function getNotifications(): Promise<Notification[]> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return [];

  const { data } = await supabase
    .from('notifications')
    .select(`
      *,
      actor:profiles!notifications_actor_id_fkey(username, display_name, avatar_uri),
      cry:cries(emotion, intensity)
    `)
    .eq('user_id', session.user.id)
    .order('created_at', { ascending: false })
    .limit(50);

  if (!data) return [];

  // Fetch comment content for comment-type notifications
  const commentNotifIds = data
    .filter(n => (n.type === 'comment' || n.type === 'reply') && n.reference_id)
    .map(n => n.reference_id as string);

  let commentMap: Record<string, string> = {};
  if (commentNotifIds.length > 0) {
    const { data: comments } = await supabase
      .from('comments')
      .select('id, content')
      .in('id', commentNotifIds);
    commentMap = Object.fromEntries((comments ?? []).map(c => [c.id, c.content]));
  }

  return data.map(n => ({
    ...n,
    comment_content: (n.type === 'comment' || n.type === 'reply') && n.reference_id
      ? (commentMap[n.reference_id] ?? null)
      : null,
  })) as Notification[];
}

export async function markNotificationsRead(ids: string[]): Promise<void> {
  if (!ids.length) return;
  await supabase.from('notifications').update({ read: true }).in('id', ids);
}

// ─── Profile settings ─────────────────────────────────────────────────────────

export async function getProfileSettings(): Promise<ProfileSettings | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('profile_visibility, allow_comments, notification_preferences')
    .eq('id', session.user.id)
    .single();
  if (error || !data) return null;
  return {
    profile_visibility: (data.profile_visibility as ProfileSettings['profile_visibility']) ?? 'everyone',
    allow_comments: data.allow_comments ?? true,
    notification_preferences: {
      new_cries_from_following: true,
      new_likes: true,
      new_comments: true,
      new_followers: true,
      friend_requests: true,
      ...(data.notification_preferences ?? {}),
    },
  };
}

export async function updateProfileSettings(settings: Partial<ProfileSettings>): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;
  const update: Record<string, any> = {};
  if (settings.profile_visibility !== undefined) update.profile_visibility = settings.profile_visibility;
  if (settings.allow_comments !== undefined) update.allow_comments = settings.allow_comments;
  if (settings.notification_preferences !== undefined) update.notification_preferences = settings.notification_preferences;
  await supabase.from('profiles').update(update).eq('id', session.user.id);
}

// ─── Blocked users ────────────────────────────────────────────────────────────

export async function getBlockedUsers(): Promise<BlockedUser[]> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return [];
  const { data } = await supabase
    .from('blocks')
    .select('blocked_id, created_at, profile:profiles!blocks_blocked_id_fkey(id, username, display_name, avatar_uri)')
    .eq('blocker_id', session.user.id)
    .order('created_at', { ascending: false });
  if (!data) return [];
  return data.map((b: any) => ({
    id: b.profile?.id ?? b.blocked_id,
    username: b.profile?.username ?? '',
    display_name: b.profile?.display_name ?? '',
    avatar_uri: b.profile?.avatar_uri ?? null,
    blocked_at: b.created_at,
  }));
}

// ─── Close friends ────────────────────────────────────────────────────────────

export async function getCloseFriends(): Promise<CloseFriend[]> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return [];
  const { data } = await supabase
    .from('close_friends')
    .select('id, friend_id, profile:profiles!close_friends_friend_id_fkey(username, display_name, avatar_uri)')
    .eq('user_id', session.user.id)
    .order('created_at', { ascending: false });
  if (!data) return [];
  return data.map((r: any) => ({
    id: r.id,
    friend_id: r.friend_id,
    username: r.profile?.username ?? '',
    display_name: r.profile?.display_name ?? '',
    avatar_uri: r.profile?.avatar_uri ?? null,
  }));
}

export async function addCloseFriend(friendId: string): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;
  await supabase.from('close_friends').upsert(
    { user_id: session.user.id, friend_id: friendId },
    { onConflict: 'user_id,friend_id', ignoreDuplicates: true }
  );
}

export async function removeCloseFriend(friendId: string): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;
  await supabase.from('close_friends')
    .delete()
    .eq('user_id', session.user.id)
    .eq('friend_id', friendId);
}

export async function getUnreadCount(): Promise<number> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return 0;
  const { count } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', session.user.id)
    .eq('read', false);
  return count ?? 0;
}

// ─── Profile stats ────────────────────────────────────────────────────────────

export async function getProfileStats(userId: string): Promise<{
  cry_count: number;
  follower_count: number;
  following_count: number;
}> {
  const [criesRes, followersRes, followingRes] = await Promise.all([
    supabase.from('cries').select('*', { count: 'exact', head: true }).eq('user_id', userId),
    supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', userId),
    supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', userId),
  ]);
  return {
    cry_count: criesRes.count ?? 0,
    follower_count: followersRes.count ?? 0,
    following_count: followingRes.count ?? 0,
  };
}

export async function getFollowList(userId: string, type: 'followers' | 'following'): Promise<UserResult[]> {
  const { data: { session } } = await supabase.auth.getSession();

  let query;
  if (type === 'followers') {
    query = supabase
      .from('follows')
      .select('profile:profiles!follows_follower_id_fkey(id, username, display_name, avatar_uri, is_public)')
      .eq('following_id', userId);
  } else {
    query = supabase
      .from('follows')
      .select('profile:profiles!follows_following_id_fkey(id, username, display_name, avatar_uri, is_public)')
      .eq('follower_id', userId);
  }

  const { data } = await query;
  if (!data) return [];

  const profiles = data.map((r: any) => r.profile).filter(Boolean);

  if (!session) return profiles.map(p => ({ ...p, relation: 'none' as const }));

  const { data: myFollows } = await supabase
    .from('follows').select('following_id').eq('follower_id', session.user.id);
  const followingIds = new Set((myFollows ?? []).map(f => f.following_id));

  return profiles.map((p: any) => ({
    ...p,
    relation: p.id === session.user.id
      ? 'self'
      : followingIds.has(p.id) ? 'following' : 'none',
  })) as UserResult[];
}
