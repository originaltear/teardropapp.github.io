/**
 * Visibility settings.
 *
 * Split out of the Settings tab because the number of these kept growing and
 * they were competing for attention with vibration and theme colours. They are
 * the settings people actually care about getting right, so they get a page
 * where each one can say what it does.
 */
import { useCallback, useState } from 'react';
import { View, Text, ScrollView, Modal, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useTheme } from '../lib/themes';
import { useAuth } from '../lib/auth';
import {
  getProfileSettings, updateProfileSettings, getBlockedUsers,
  ProfileSettings, BlockedUser,
} from '../lib/social';
import {
  SubScreen, SectionLabel, SettingsGroup, SettingsRow, ToggleRow,
} from '../components/SettingsRows';
import { UiIcon } from '../components/UiIcon';

const VISIBILITY_LABELS: Record<ProfileSettings['profile_visibility'], string> = {
  everyone:  '🌍  Everyone',
  followers: '👥  Friends only (mutual follows)',
  only_me:   '🔒  Only me',
};

const VISIBILITY_HINTS: Record<ProfileSettings['profile_visibility'], string> = {
  everyone:  'Anyone can open your profile and see your cries.',
  followers: 'Only people you follow who also follow you back.',
  only_me:   'Nobody else can open your profile.',
};

export default function VisibilitySettingsScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const { theme: { accent } } = useTheme();

  const [visibility, setVisibility] = useState<ProfileSettings['profile_visibility']>('everyone');
  const [allowComments, setAllowComments] = useState(true);
  const [showReactions, setShowReactions] = useState(true);
  const [showFollowLists, setShowFollowLists] = useState(true);
  const [blockedCount, setBlockedCount] = useState(0);
  const [picking, setPicking] = useState(false);

  useFocusEffect(useCallback(() => {
    if (!session) return;
    (async () => {
      const [settings, blocked] = await Promise.all([
        getProfileSettings(),
        getBlockedUsers(),
      ]);
      if (settings) {
        setVisibility(settings.profile_visibility);
        setAllowComments(settings.allow_comments);
        setShowReactions(settings.show_reactions);
        setShowFollowLists(settings.show_follow_lists);
      }
      setBlockedCount(blocked.length);
    })();
  }, [session]));

  // Saved as they are touched — a Save button on a screen of switches is a way
  // to lose someone's privacy choice to a forgotten tap.
  async function pick(v: ProfileSettings['profile_visibility']) {
    setVisibility(v);
    setPicking(false);
    await updateProfileSettings({ profile_visibility: v });
  }

  return (
    <SubScreen title="Visibility">
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <SectionLabel text="Your profile" />
        <SettingsGroup>
          <SettingsRow
            label="Who can see my profile"
            value={VISIBILITY_LABELS[visibility]}
            onPress={() => setPicking(true)}
          />
          <ToggleRow
            label="Show my followers and following"
            hint="Others can open the lists. Counts stay visible either way."
            value={showFollowLists}
            onChange={v => { setShowFollowLists(v); updateProfileSettings({ show_follow_lists: v }); }}
          />
        </SettingsGroup>

        <SectionLabel text="Your cries" />
        <SettingsGroup>
          <ToggleRow
            label="Allow comments"
            hint="Turning this off hides the comment box on all your cries."
            value={allowComments}
            onChange={v => { setAllowComments(v); updateProfileSettings({ allow_comments: v }); }}
          />
          <ToggleRow
            label="Show who reacted"
            hint="Others can see who liked or hugged. Counts stay visible either way."
            value={showReactions}
            onChange={v => { setShowReactions(v); updateProfileSettings({ show_reactions: v }); }}
          />
        </SettingsGroup>

        <SectionLabel text="People" />
        <SettingsGroup>
          <SettingsRow
            label="Close Friends"
            value="Manage list ›"
            onPress={() => router.push('/close-friends')}
          />
          <SettingsRow
            label="Blocked users"
            value={blockedCount > 0 ? `${blockedCount} blocked` : 'None'}
            onPress={() => router.push('/blocked-users')}
          />
        </SettingsGroup>

        <Text style={s.footnote}>
          Blocking is immediate and needs no reason. A blocked person disappears from your
          feed and the map, and cannot see or reach you.
        </Text>
      </ScrollView>

      <Modal visible={picking} transparent animationType="fade" onRequestClose={() => setPicking(false)}>
        <TouchableOpacity style={s.backdrop} activeOpacity={1} onPress={() => setPicking(false)}>
          <View style={s.picker}>
            <Text style={s.pickerTitle}>Who can see my profile</Text>
            {(Object.keys(VISIBILITY_LABELS) as ProfileSettings['profile_visibility'][]).map(v => (
              <TouchableOpacity key={v} style={s.pickerRow} onPress={() => pick(v)} activeOpacity={0.7}>
                <View style={{ flex: 1 }}>
                  <Text style={s.pickerLabel}>{VISIBILITY_LABELS[v]}</Text>
                  <Text style={s.pickerHint}>{VISIBILITY_HINTS[v]}</Text>
                </View>
                {visibility === v && <UiIcon name="check" size={18} color={accent} />}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </SubScreen>
  );
}

const s = StyleSheet.create({
  footnote: {
    color: '#4a5568', fontSize: 13, lineHeight: 18,
    paddingHorizontal: 20, paddingTop: 18,
  },
  backdrop: { flex: 1, backgroundColor: '#000000cc', justifyContent: 'center', padding: 24 },
  picker: { backgroundColor: '#111827', borderRadius: 16, paddingVertical: 8 },
  pickerTitle: {
    color: '#4a5568', fontSize: 11, fontFamily: 'monospace',
    letterSpacing: 1, textTransform: 'uppercase',
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8,
  },
  pickerRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 12, gap: 12,
  },
  pickerLabel: { color: '#e2e8f0', fontSize: 15 },
  pickerHint: { color: '#4a5568', fontSize: 13, marginTop: 3 },
  pickerCheck: { fontSize: 17 },
});
