/**
 * Community Guidelines
 *
 * Exists because App Store Guideline 1.2 requires apps with user-generated
 * content to have terms that state plainly that objectionable content and
 * abusive users are not tolerated, and to publish contact details. Kept in the
 * app rather than on the marketing site so it cannot break if the site does.
 *
 * Linked from Settings and shown at sign-up, where the account is created only
 * once the person has agreed.
 */
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '../lib/themes';

export const SUPPORT_EMAIL = 'hello.teardropapp@gmail.com';

export function openSupportEmail(subject = 'Teardrop support') {
  const url = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}`;
  Linking.openURL(url).catch(() =>
    Alert.alert('Could not open mail', `Please write to ${SUPPORT_EMAIL}`)
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={s.section}>
      <Text style={s.h2}>{title}</Text>
      {children}
    </View>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <Text style={s.p}>{children}</Text>;
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <View style={s.bulletRow}>
      <Text style={s.bulletDot}>•</Text>
      <Text style={s.bulletTxt}>{children}</Text>
    </View>
  );
}

export default function GuidelinesScreen() {
  const router = useRouter();
  const { theme: { accent } } = useTheme();

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} accessibilityRole="button" accessibilityLabel="Go back">
          <Text style={s.backTxt}>←</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>Community Guidelines</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <Text style={s.lede}>
          Teardrop is for the moments that got to you. That only works if it stays a safe
          place to be honest. These are the rules, and they are short on purpose.
        </Text>

        <Section title="There is no tolerance for abuse">
          <P>
            Content that is abusive, hateful, harassing, threatening, sexual, or that targets
            a person is not allowed here, and neither are the accounts that post it. This is
            not a warning system. Accounts that behave this way are removed.
          </P>
        </Section>

        <Section title="Specifically, do not post">
          <Bullet>Anything that harasses, threatens, bullies or targets another person</Bullet>
          <Bullet>Hate or slurs aimed at anyone, for any reason</Bullet>
          <Bullet>Sexual content, nudity, or anything involving a minor in any way</Bullet>
          <Bullet>Graphic violence or gore</Bullet>
          <Bullet>Encouragement of self-harm or suicide</Bullet>
          <Bullet>Someone else's private information, photos or identity</Bullet>
          <Bullet>Spam, scams, or advertising</Bullet>
        </Section>

        <Section title="Reporting something">
          <P>
            Every cry, comment and profile can be reported from inside the app. Open it, use
            the menu, and choose Report. You can add a description so we know what to look
            at, and you can block the person at the same time.
          </P>
          <P>
            Reports are reviewed and acted on within 24 hours. That means the content comes
            down and the account goes with it when the report is justified.
          </P>
        </Section>

        <Section title="Blocking someone">
          <P>
            Blocking is immediate and needs no reason. A blocked person disappears from your
            feed and from the map, and cannot see or reach you. You can undo it any time
            under Settings, Privacy, Blocked users.
          </P>
        </Section>

        <Section title="If you are having a hard time">
          <P>
            Teardrop is a journal, not a crisis service, and nobody here is a professional.
            If you are thinking about hurting yourself, please talk to someone who can help
            properly. In Denmark, Livslinien is on 70 201 201. Elsewhere, Find A Helpline
            lists free, confidential lines by country. If you are in danger right now, your
            local emergency number is the right call.
          </P>
          <TouchableOpacity
            onPress={() => Linking.openURL('https://findahelpline.com').catch(() => {})}
            activeOpacity={0.7}
            accessibilityRole="link"
          >
            <Text style={[s.link, { color: accent }]}>findahelpline.com</Text>
          </TouchableOpacity>
        </Section>

        <Section title="Contact">
          <P>
            You can reach a real person, and it is usually the person who built this.
          </P>
          <TouchableOpacity onPress={() => openSupportEmail('Teardrop')} activeOpacity={0.7}>
            <Text style={[s.link, { color: accent }]}>{SUPPORT_EMAIL}</Text>
          </TouchableOpacity>
        </Section>

        <Text style={s.footer}>
          Using Teardrop means agreeing to these guidelines.
        </Text>
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d1117' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#1f2937',
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  backTxt: { color: '#e2e8f0', fontSize: 20 },
  headerTitle: { color: '#e2e8f0', fontSize: 17, fontWeight: '700' },
  scroll: { paddingHorizontal: 20, paddingTop: 20 },
  lede: { color: '#94a3b8', fontSize: 15, lineHeight: 23, marginBottom: 28 },
  section: { marginBottom: 26 },
  h2: { color: '#e2e8f0', fontSize: 15, fontWeight: '700', marginBottom: 10 },
  p: { color: '#94a3b8', fontSize: 15, lineHeight: 22, marginBottom: 10 },
  bulletRow: { flexDirection: 'row', gap: 10, marginBottom: 7, paddingRight: 8 },
  bulletDot: { color: '#4a5568', fontSize: 15, lineHeight: 21 },
  bulletTxt: { color: '#94a3b8', fontSize: 15, lineHeight: 21, flex: 1 },
  link: { fontSize: 15, lineHeight: 22, textDecorationLine: 'underline' },
  footer: {
    color: '#4a5568', fontSize: 13, lineHeight: 20,
    borderTopWidth: 1, borderTopColor: '#1f2937', paddingTop: 18, marginTop: 6,
  },
});
