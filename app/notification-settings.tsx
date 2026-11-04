/**
 * Notification settings.
 *
 * Split out of the Settings tab alongside visibility. There were five toggles
 * before and there are six now, and every new reaction type adds another.
 */
import { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, AppState, Linking } from 'react-native';
import { useFocusEffect } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { useAuth } from '../lib/auth';
import { useTheme } from '../lib/themes';
import { registerPushToken } from '../lib/notifications';
import { getProfileSettings, updateProfileSettings, ProfileSettings } from '../lib/social';
import { SubScreen, SectionLabel, SettingsGroup, ToggleRow } from '../components/SettingsRows';

const DEFAULTS: ProfileSettings['notification_preferences'] = {
  new_likes: true,
  new_comments: true,
  new_followers: true,
  friend_requests: true,
  friend_cries: true,
};

export default function NotificationSettingsScreen() {
  const { session } = useAuth();
  const { theme: { accent } } = useTheme();
  const [prefs, setPrefs] = useState(DEFAULTS);
  // The toggles below only decide what Teardrop sends. If the phone itself has
  // notifications off, none of it arrives, and the page used to say so only in
  // a footnote. After a reinstall that is easy to miss for weeks.
  const [phone, setPhone] = useState<{ granted: boolean; canAskAgain: boolean } | null>(null);

  const checkPhone = useCallback(async () => {
    const { status, canAskAgain } = await Notifications.getPermissionsAsync();
    const granted = status === 'granted';
    setPhone({ granted, canAskAgain });
    // Store the token straight away when it was just turned on in the phone's
    // settings, rather than waiting for the next launch.
    if (granted) registerPushToken({ ask: false });
  }, []);

  useFocusEffect(useCallback(() => {
    if (!session) return;
    getProfileSettings().then(s => {
      if (s) setPrefs({ ...DEFAULTS, ...s.notification_preferences });
    });
    checkPhone();
  }, [session, checkPhone]));

  // Coming back from the phone's settings doesn't refocus the screen.
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') checkPhone();
    });
    return () => sub.remove();
  }, [checkPhone]);

  async function turnOn() {
    if (phone?.canAskAgain) {
      await registerPushToken({ ask: true });
      checkPhone();
    } else {
      Linking.openSettings();
    }
  }

  const phoneOff = phone !== null && !phone.granted;

  function toggle(key: keyof ProfileSettings['notification_preferences'], v: boolean) {
    const next = { ...prefs, [key]: v };
    setPrefs(next);
    updateProfileSettings({ notification_preferences: next });
  }

  return (
    <SubScreen title="Notifications">
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {phoneOff && (
          <View style={s.offCard}>
            <Text style={s.offTitle}>Notifications are off on this phone</Text>
            <Text style={s.offBody}>
              Nothing below will reach you until they are turned on.
            </Text>
            <TouchableOpacity
              style={[s.offBtn, { backgroundColor: accent }]}
              onPress={turnOn}
              activeOpacity={0.85}
              accessibilityRole="button"
            >
              <Text style={s.offBtnTxt}>Turn on</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Still editable while the phone has them off: the choices are kept
            on the server and apply once they are back on. */}
        <View style={phoneOff && { opacity: 0.45 }}>
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

        <SectionLabel text="From people you follow" />
        <SettingsGroup>
          <ToggleRow
            label="Their cries"
            hint="When someone you follow logs a cry you can see. Mute one person from their profile."
            value={prefs.friend_cries}
            onChange={v => toggle('friend_cries', v)}
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
        </SettingsGroup>
        </View>

        {!phoneOff && (
          <Text style={s.footnote}>
            These control what Teardrop sends. Turning notifications off for the whole app
            is done in your phone's own settings.
          </Text>
        )}
      </ScrollView>
    </SubScreen>
  );
}

const s = StyleSheet.create({
  offCard: {
    marginHorizontal: 16, marginTop: 20, padding: 16, borderRadius: 14,
    backgroundColor: '#111827', borderWidth: 1, borderColor: '#1f2937',
  },
  offTitle: { color: '#e2e8f0', fontSize: 15, fontWeight: '700' },
  offBody: { color: '#94a3b8', fontSize: 13, lineHeight: 18, marginTop: 4 },
  offBtn: {
    alignSelf: 'flex-start', marginTop: 12, borderRadius: 12,
    paddingVertical: 9, paddingHorizontal: 20,
  },
  offBtnTxt: { color: '#0d1117', fontSize: 14, fontWeight: '700' },
  footnote: {
    color: '#4a5568', fontSize: 13, lineHeight: 18,
    paddingHorizontal: 20, paddingTop: 18,
  },
});
