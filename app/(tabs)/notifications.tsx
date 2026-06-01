import { useCallback, useState } from 'react';
import {
  StyleSheet, View, Text, FlatList,
  TouchableOpacity, Image, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../lib/auth';
import {
  getNotifications, markNotificationsRead, followUser,
  Notification,
} from '../../lib/social';
import { supabase } from '../../lib/supabase';
import { clearBadge } from '../../lib/notifications';
import { useTheme } from '../../lib/themes';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  const d = new Date(iso), now = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / 1000);
  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function notifIcon(type: Notification['type']) {
  return { like: '💧', comment: '💬', friend_request: '👥', follow: '➕' }[type];
}

function notifText(n: Notification): string {
  const name = n.actor.display_name;
  switch (n.type) {
    case 'like':           return `${name} liked your cry`;
    case 'comment':        return `${name} commented on your cry`;
    case 'friend_request': return `${name} sent you a friend request`;
    case 'follow':         return `${name} started following you`;
  }
}

function Avatar({ uri, size = 40 }: { uri?: string | null; size?: number }) {
  if (uri) return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} />;
  return (
    <View style={[styles.avatarFallback, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={{ fontSize: size * 0.4 }}>💧</Text>
    </View>
  );
}

// ─── Notification row ─────────────────────────────────────────────────────────

function NotifRow({ notif, onPress, onFollowBack, followBackDone }: {
  notif: Notification;
  onPress: () => void;
  onFollowBack?: () => void;
  followBackDone?: boolean;
}) {
  const router = useRouter();
  const { theme: { accent } } = useTheme();
  const isFollow = notif.type === 'follow';
  const isFriendReq = notif.type === 'friend_request';

  return (
    <TouchableOpacity
      style={[styles.row, !notif.read && { backgroundColor: accent + '10' }]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      {/* Avatar — tappable to go to profile */}
      <TouchableOpacity onPress={() => router.push(`/user-profile?id=${notif.actor_id}`)} activeOpacity={0.8}>
        <View style={styles.iconBadge}>
          <Avatar uri={notif.actor.avatar_uri} size={42} />
          <View style={styles.typeIcon}>
            <Text style={{ fontSize: 12 }}>{notifIcon(notif.type)}</Text>
          </View>
        </View>
      </TouchableOpacity>

      <View style={styles.rowContent}>
        <Text style={styles.rowText}>{notifText(notif)}</Text>
        {notif.comment_content && (
          <Text style={styles.rowComment} numberOfLines={2}>"{notif.comment_content}"</Text>
        )}
        {!notif.comment_content && notif.cry && (
          <Text style={styles.rowSub}>
            {notif.cry.emotion} · {'💧'.repeat(notif.cry.intensity)}
          </Text>
        )}
        <Text style={styles.rowTime}>{formatDate(notif.created_at)}</Text>

        {/* Action buttons */}
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={styles.btnProfile}
            onPress={() => router.push(`/user-profile?id=${notif.actor_id}`)}
          >
            <Text style={styles.btnProfileTxt}>View Profile</Text>
          </TouchableOpacity>
          {(isFollow || isFriendReq) && onFollowBack && (
            <TouchableOpacity
              style={followBackDone ? styles.btnFollowing : [styles.btnFollowBack, { backgroundColor: accent }]}
              onPress={followBackDone ? undefined : onFollowBack}
            >
              <Text style={followBackDone ? styles.btnFollowingTxt : styles.btnFollowBackTxt}>
                {followBackDone ? 'Following' : 'Follow back'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {!notif.read && <View style={[styles.unreadDot, { backgroundColor: accent }]} />}
    </TouchableOpacity>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function NotificationsScreen() {
  const { session } = useAuth();
  const router = useRouter();
  const { theme: { accent } } = useTheme();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  // Track which actor IDs have been followed back
  const [followedBack, setFollowedBack] = useState<Set<string>>(new Set());

  useFocusEffect(useCallback(() => {
    if (!session) return;
    // Clear badge when user opens notifications
    clearBadge();
    setLoading(true);
    getNotifications().then(async data => {
      setNotifications(data);
      setLoading(false);

      // Pre-populate followedBack: check who we already follow among notif actors
      const actorIds = [...new Set(
        data.filter(n => n.type === 'follow' || n.type === 'friend_request').map(n => n.actor_id)
      )];
      if (actorIds.length > 0) {
        const { data: follows } = await supabase
          .from('follows')
          .select('following_id')
          .eq('follower_id', session.user.id)
          .in('following_id', actorIds);
        setFollowedBack(new Set((follows ?? []).map(f => f.following_id)));
      } else {
        setFollowedBack(new Set());
      }

      // Mark unread as read
      const unread = data.filter(n => !n.read).map(n => n.id);
      if (unread.length) {
        markNotificationsRead(unread);
        setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      }
    });
  }, [session]));

  async function handleFollowBack(actorId: string) {
    await followUser(actorId);
    setFollowedBack(prev => new Set([...prev, actorId]));
  }

  function handlePress(notif: Notification) {
    if (notif.type === 'friend_request') {
      router.push('/friends');
    } else if ((notif.type === 'like' || notif.type === 'comment') && notif.cry_id) {
      router.push(`/cry-detail?id=${notif.cry_id}`);
    }
  }

  if (!session) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Notifications</Text>
        </View>
        <View style={styles.empty}>
          <Text style={styles.emptyEmoji}>🔔</Text>
          <Text style={styles.emptyTitle}>Log in to see notifications</Text>
          <Text style={styles.emptySub}>Likes, comments and friend requests will appear here.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Notifications</Text>
      </View>

      {loading ? (
        <View style={styles.empty}>
          <ActivityIndicator size="large" color={accent} />
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={n => n.id}
          renderItem={({ item }) => (
            <NotifRow
              notif={item}
              onPress={() => handlePress(item)}
              onFollowBack={
                (item.type === 'follow' || item.type === 'friend_request')
                  ? () => handleFollowBack(item.actor_id)
                  : undefined
              }
              followBackDone={followedBack.has(item.actor_id)}
            />
          )}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          contentContainerStyle={notifications.length === 0 ? styles.emptyFlex : undefined}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>🔔</Text>
              <Text style={styles.emptyTitle}>No notifications yet</Text>
              <Text style={styles.emptySub}>Likes, comments and friend requests will appear here.</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d1117' },
  header: {
    paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: '#1f2937',
  },
  headerTitle: { color: '#e2e8f0', fontSize: 26, fontWeight: '700', letterSpacing: 0.5 },

  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, gap: 12 },
  rowUnread: { backgroundColor: '#6fe0e610' },
  iconBadge: { position: 'relative' },
  typeIcon: {
    position: 'absolute', bottom: -2, right: -2,
    backgroundColor: '#1f2937', borderRadius: 10,
    width: 20, height: 20, alignItems: 'center', justifyContent: 'center',
  },
  avatarFallback: { backgroundColor: '#1f2937', alignItems: 'center', justifyContent: 'center' },
  rowContent: { flex: 1, gap: 2 },
  rowText: { color: '#e2e8f0', fontSize: 14, lineHeight: 20 },
  rowComment: { color: '#64748b', fontSize: 13, fontStyle: 'italic', lineHeight: 18 },
  rowSub: { color: '#4a5568', fontSize: 12 },
  rowTime: { color: '#374151', fontSize: 11, fontFamily: 'monospace' },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#6fe0e6' },
  actionRow: { flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap' },
  btnProfile: {
    paddingHorizontal: 12, paddingVertical: 5,
    borderRadius: 16, borderWidth: 1, borderColor: '#1f2937',
  },
  btnProfileTxt: { color: '#94a3b8', fontSize: 12, fontWeight: '600' },
  btnFollowBack: {
    paddingHorizontal: 12, paddingVertical: 5,
    borderRadius: 16, backgroundColor: '#6fe0e6',
  },
  btnFollowBackTxt: { color: '#0d1117', fontSize: 12, fontWeight: '700' },
  btnFollowing: {
    paddingHorizontal: 12, paddingVertical: 5,
    borderRadius: 16, borderWidth: 1, borderColor: '#1f2937',
  },
  btnFollowingTxt: { color: '#4a5568', fontSize: 12 },

  sep: { height: 1, backgroundColor: '#1f2937', marginLeft: 70 },
  emptyFlex: { flexGrow: 1, justifyContent: 'center' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 40 },
  emptyEmoji: { fontSize: 48, opacity: 0.4 },
  emptyTitle: { color: '#4a5568', fontSize: 18, fontWeight: '600' },
  emptySub: { color: '#374151', fontSize: 13, textAlign: 'center', lineHeight: 20 },
});
