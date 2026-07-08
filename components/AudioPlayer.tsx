/**
 * AudioPlayer — play/stop a voice-note URI. Shared by the map, feed and
 * my-cries detail views (previously copy-pasted in all three).
 */
import { TouchableOpacity, Text, StyleSheet, Alert } from 'react-native';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useTheme } from '../lib/themes';

export function AudioPlayer({ uri }: { uri: string }) {
  const { theme: { accent } } = useTheme();
  // useAudioPlayer manages the native player's lifecycle — it is released
  // automatically when this component unmounts (sheet closed mid-listen).
  const player = useAudioPlayer({ uri });
  const status = useAudioPlayerStatus(player);
  const playing = status.playing;

  async function toggle() {
    try {
      if (playing) {
        player.pause();
        await player.seekTo(0);
        return;
      }
      // Restart from the top when the previous playback ran to the end
      if (status.didJustFinish || (status.duration > 0 && status.currentTime >= status.duration)) {
        await player.seekTo(0);
      }
      player.play();
    } catch {
      Alert.alert('Error', 'Could not play audio.');
    }
  }

  return (
    <TouchableOpacity
      style={[styles.player, { borderColor: accent }]}
      onPress={toggle}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={playing ? 'Stop voice note' : 'Play voice note'}
    >
      <Text style={[styles.icon, { color: accent }]}>{playing ? '⏹' : '▶'}</Text>
      <Text style={[styles.label, { color: accent }]}>{playing ? 'Stop voice note' : 'Play voice note'}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  player: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#0d1117', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1,
  },
  icon: { fontSize: 18 },
  label: { fontSize: 14, fontWeight: '500' },
});
