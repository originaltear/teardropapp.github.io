/**
 * Notification settings.
 *
 * Split out of the Settings tab alongside visibility. There were five toggles
 * before and there are six now, and every new reaction type adds another.
 */
import { useCallback, useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useAuth } from '../lib/auth';
import { getProfileSettings, updateProfileSettings, ProfileSettings } from '../lib/social';
import { SubScreen, SectionLabel, SettingsGroup, ToggleRow } from '../components/SettingsRows';

const DEFAULTS: ProfileSettings['notification_preferences'] = {
  new_cries_from_following: true,
  new_likes: true,
  new_comments: true,
  new_followers: true,
  friend_requests: true,
};

export default function NotificationSettingsScreen() {
  const { session } = useAuth();
  const [prefs, setPrefs] = useState(DEFAULTS);

  useFocusEffect(useCallback(() => {
    if (!session) return;
    getProfileSettings().then(s => {
      if (s) setPrefs({ ...DEFAULTS, ...s.notification_preferences });
    });
  }, [session]));

  function toggle(key: keyof ProfileSettings['notification_preferences'], v: boolean) {
    const next = { ...prefs, [key]: v };
    setPrefs(next);
    updateProfileSettings({ notification_preferences: next });
  }

  return (
    <SubScreen title="Notifications">
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <SectionLabel text="On your cries" />
        <SettingsGroup>
          {/* new_likes covers hugs and comment likes as well — they are the
              same kind of small acknowledgement and nobody wants three
              switches for it. */}
          <ToggleRow
            label="Likes and hugs"
            hint="Also covers likes on your comments."
            value={prefs.new_likes}
            onChange={v => toggle('new_likes', v)}
          />
          <ToggleRow
            label="Comments and replies"
            value={prefs.new_comments}
            onChange={v => toggle('new_comments', v)}
          />
        </SettingsGroup>

        <SectionLabel text="People" />
        <SettingsGroup>
          <ToggleRow
            label="New followers"
            value={prefs.new_followers}
            onChange={v => toggle('new_followers', v)}
          />
          <ToggleRow
            label="Friend requests"
            value={prefs.friend_requests}
            onChange={v => toggle('friend_requests', v)}
          />
          <ToggleRow
            label="New cries from people I follow"
            value={prefs.new_cries_from_following}
            onChange={v => toggle('new_cries_from_following', v)}
          />
        </SettingsGroup>

        <Text style={s.footnote}>
          These control what Teardrop sends. Turning notifications off for the whole app
          is done in your phone's own settings.
        </Text>
      </ScrollView>
    </SubScreen>
  );
}

const s = StyleSheet.create({
  footnote: {
    color: '#4a5568', fontSize: 13, lineHeight: 18,
    paddingHorizontal: 20, paddingTop: 18,
  },
});
