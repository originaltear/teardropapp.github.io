/**
 * CryPhoto — a cry's photo thumbnail that opens a full-screen viewer on tap.
 *
 * Used by the map, feed and my-cries detail views. The full-screen layer is a
 * simple "contain" view with a tap-to-dismiss backdrop (no pinch-zoom, which
 * would need a gesture library).
 */
import { useState } from 'react';
import {
  View, Image, Modal, TouchableOpacity, Text,
  StyleSheet, StyleProp, ImageStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export function CryPhoto({ uri, style }: { uri: string; style?: StyleProp<ImageStyle> }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={() => setOpen(true)}
        accessibilityRole="imagebutton"
        accessibilityLabel="View photo full screen"
      >
        <Image source={{ uri }} style={[styles.thumb, style]} resizeMode="cover" />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setOpen(false)}>
        <View style={styles.backdrop}>
          {/* Image sits at the bottom; a transparent touch layer above it makes
              a tap anywhere dismiss the viewer. The close button is rendered
              last so it stays on top of the touch layer. */}
          <Image source={{ uri }} style={styles.full} resizeMode="contain" />
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setOpen(false)}
            accessibilityRole="button"
            accessibilityLabel="Close photo"
          />
          <SafeAreaView edges={['top']} style={styles.closeWrap} pointerEvents="box-none">
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={() => setOpen(false)}
              accessibilityRole="button"
              accessibilityLabel="Close photo"
            >
              <Text style={styles.closeTxt}>✕</Text>
            </TouchableOpacity>
          </SafeAreaView>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  thumb: { width: '100%', height: 180, borderRadius: 12, backgroundColor: '#0d1117' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.94)', justifyContent: 'center' },
  full: { width: '100%', height: '100%' },
  closeWrap: { position: 'absolute', top: 0, right: 0 },
  closeBtn: {
    margin: 12, width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(13,17,23,0.7)',
    alignItems: 'center', justifyContent: 'center',
  },
  closeTxt: { color: '#e8eef7', fontSize: 18, fontWeight: '600' },
});
