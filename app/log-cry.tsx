import { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { EMOTIONS } from '../lib/emotions';
import { saveCry } from '../lib/storage';

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

export default function LogCryScreen() {
  const router = useRouter();
  const { lat, lng } = useLocalSearchParams<{ lat: string; lng: string }>();

  const [emotion, setEmotion] = useState<string | null>(null);
  const [intensity, setIntensity] = useState(3);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!emotion || !lat || !lng) return;
    setSaving(true);
    await saveCry({
      id: generateId(),
      createdAt: new Date().toISOString(),
      latitude: parseFloat(lat),
      longitude: parseFloat(lng),
      emotion,
      intensity,
      note: note.trim() || undefined,
    });
    setSaving(false);
    router.back();
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.closeBtn}>
            <Text style={styles.closeTxt}>✕</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Log a Cry</Text>
          <View style={{ width: 36 }} />
        </View>

        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {/* Emotion picker */}
          <Text style={styles.sectionLabel}>How did it feel?</Text>
          <View style={styles.emotionGrid}>
            {EMOTIONS.map(e => {
              const selected = emotion === e.id;
              return (
                <TouchableOpacity
                  key={e.id}
                  style={[
                    styles.emotionChip,
                    { borderColor: e.color },
                    selected && { backgroundColor: e.color + '33' },
                  ]}
                  onPress={() => setEmotion(e.id)}
                  activeOpacity={0.75}
                >
                  <Text style={styles.emotionEmoji}>{e.emoji}</Text>
                  <Text style={[styles.emotionLabel, selected && { color: e.color }]}>
                    {e.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Intensity */}
          <Text style={styles.sectionLabel}>Intensity</Text>
          <View style={styles.intensityRow}>
            {[1, 2, 3, 4, 5].map(n => (
              <TouchableOpacity key={n} onPress={() => setIntensity(n)} style={styles.dropBtn}>
                <Text style={[styles.drop, { opacity: n <= intensity ? 1 : 0.25 }]}>💧</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Note */}
          <Text style={styles.sectionLabel}>Note <Text style={styles.optional}>(optional)</Text></Text>
          <TextInput
            style={styles.noteInput}
            value={note}
            onChangeText={setNote}
            placeholder="What happened…"
            placeholderTextColor="#4a5568"
            multiline
            maxLength={500}
            textAlignVertical="top"
          />
        </ScrollView>

        {/* Save button */}
        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.saveBtn, !emotion && styles.saveBtnDisabled]}
            onPress={handleSave}
            disabled={!emotion || saving}
            activeOpacity={0.85}
          >
            {saving
              ? <ActivityIndicator color="#0d1117" />
              : <Text style={styles.saveTxt}>Save cry</Text>
            }
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d1117' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1f2937',
  },
  closeBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  closeTxt: { color: '#6fe0e6', fontSize: 18 },
  title: { color: '#e2e8f0', fontSize: 18, fontWeight: '700', letterSpacing: 0.5 },
  body: { padding: 20, paddingBottom: 8 },
  sectionLabel: {
    color: '#94a3b8',
    fontSize: 12,
    fontFamily: 'monospace',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 12,
    marginTop: 24,
  },
  optional: { color: '#4a5568', textTransform: 'none' },
  emotionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  emotionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#1f2937',
  },
  emotionEmoji: { fontSize: 16 },
  emotionLabel: { color: '#94a3b8', fontSize: 13, fontWeight: '500' },
  intensityRow: {
    flexDirection: 'row',
    gap: 8,
  },
  dropBtn: { padding: 4 },
  drop: { fontSize: 28 },
  noteInput: {
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#1f2937',
    borderRadius: 12,
    padding: 14,
    color: '#e2e8f0',
    fontSize: 15,
    minHeight: 100,
    fontFamily: 'monospace',
  },
  footer: {
    padding: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#1f2937',
  },
  saveBtn: {
    backgroundColor: '#6fe0e6',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.4 },
  saveTxt: { color: '#0d1117', fontSize: 16, fontWeight: '700' },
});
