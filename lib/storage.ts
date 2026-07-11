import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { uploadLocalFile } from './upload';
import { compressForUpload } from './image';

const LOCAL_KEY = 'teardrop_cries';

/**
 * Cry photos / voice notes live in this public-read bucket under
 * `{userId}/{cryId}/...`. Public read mirrors the avatars bucket: the file URL
 * is only ever handed out through the `cries` row, and RLS on that row already
 * enforces visibility/blocks. Authenticated users can only write inside their
 * own `{userId}/` folder.
 */
const MEDIA_BUCKET = 'cry-media';

export interface Cry {
  id: string;
  createdAt: string;
  latitude: number;
  longitude: number;
  emotion: string;
  intensity: number;
  note?: string;
  photoUri?: string;
  audioUri?: string;
  country?: string;
  visibility?: 'everyone' | 'followers' | 'close_friends' | 'only_me';
  tags?: string[];
}

export function generateCryId(): string {
  // RFC 4122 v4 UUID — required by Supabase uuid column type
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// ─── Local helpers ────────────────────────────────────────────────────────────
//
// Local AsyncStorage holds guest cries plus a pending queue of cries that
// haven't reached Supabase yet (offline saves, failed inserts). Once a cry is
// confirmed on the server it is removed locally, so the queue stays small.

async function localLoad(): Promise<Cry[]> {
  try {
    const raw = await AsyncStorage.getItem(LOCAL_KEY);
    return raw ? (JSON.parse(raw) as Cry[]) : [];
  } catch {
    console.warn('[localLoad] corrupt storage — resetting');
    await AsyncStorage.removeItem(LOCAL_KEY);
    return [];
  }
}

async function localSave(cries: Cry[]): Promise<void> {
  await AsyncStorage.setItem(LOCAL_KEY, JSON.stringify(cries));
}

async function localRemove(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const idSet = new Set(ids);
  const all = await localLoad();
  await localSave(all.filter(c => !idSet.has(c.id)));
}

// ─── Ensure a profiles row exists (belt-and-suspenders for signup trigger) ───

// Cached per user so the extra round-trip only happens once per app session.
let _profileEnsuredFor: string | null = null;

async function ensureProfile(userId: string, email?: string): Promise<void> {
  if (_profileEnsuredFor === userId) return;
  const { error } = await supabase
    .from('profiles')
    .upsert(
      { id: userId, display_name: email?.split('@')[0] ?? 'You' },
      { onConflict: 'id', ignoreDuplicates: true },
    );
  if (!error) _profileEnsuredFor = userId;
}

// ─── Media upload ─────────────────────────────────────────────────────────────

const isLocalUri = (uri?: string): uri is string =>
  !!uri && !/^https?:\/\//i.test(uri);

/**
 * Uploads a cry's photo/voice note to Storage and returns remote URLs.
 * Local `file://` paths only resolve on the device that recorded them — they
 * break for friends' feeds and after reinstall. On upload failure the local
 * URI is kept so the cry still works on this device; the sync pass retries.
 */
async function uploadCryMedia(
  cry: Cry,
  userId: string,
  nameSuffix = '',
): Promise<{ photoUri?: string; audioUri?: string }> {
  const out: { photoUri?: string; audioUri?: string } = {};

  if (isLocalUri(cry.photoUri)) {
    // Downscale before upload — full-resolution photos waste data on every
    // feed load; the app never renders them larger than a card.
    const compressed = await compressForUpload(cry.photoUri);
    const url = await uploadLocalFile(
      MEDIA_BUCKET, `${userId}/${cry.id}/photo${nameSuffix}.jpg`, compressed, 'image/jpeg',
    );
    if (url) out.photoUri = url;
  }

  if (isLocalUri(cry.audioUri)) {
    // expo-av HIGH_QUALITY records .m4a (AAC in an MP4 container) on Android
    const ext = cry.audioUri.split('.').pop()?.toLowerCase() ?? 'm4a';
    const contentType = ext === 'm4a' || ext === 'mp4' ? 'audio/mp4' : `audio/${ext}`;
    const url = await uploadLocalFile(
      MEDIA_BUCKET, `${userId}/${cry.id}/audio${nameSuffix}.${ext}`, cry.audioUri, contentType,
    );
    if (url) out.audioUri = url;
  }

  return out;
}

const CRY_COLUMNS =
  'id, created_at, latitude, longitude, emotion, intensity, note, photo_uri, audio_uri, country, visibility, tags';

function fromRow(r: any): Cry {
  return {
    id:         r.id,
    createdAt:  r.created_at,
    latitude:   r.latitude,
    longitude:  r.longitude,
    emotion:    r.emotion,
    intensity:  r.intensity,
    note:       r.note       ?? undefined,
    photoUri:   r.photo_uri  ?? undefined,
    audioUri:   r.audio_uri  ?? undefined,
    country:    r.country    ?? undefined,
    visibility: (r.visibility as Cry['visibility']) ?? 'everyone',
    tags:       r.tags?.length ? r.tags : undefined,
  };
}

function toRow(cry: Cry, userId: string) {
  return {
    id:         cry.id,
    user_id:    userId,
    created_at: cry.createdAt,
    latitude:   cry.latitude,
    longitude:  cry.longitude,
    emotion:    cry.emotion,
    intensity:  cry.intensity,
    note:       cry.note       ?? null,
    photo_uri:  cry.photoUri   ?? null,
    audio_uri:  cry.audioUri   ?? null,
    country:    cry.country    ?? null,
    visibility: cry.visibility ?? 'everyone',
    tags:       cry.tags       ?? [],
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function saveCry(cry: Cry): Promise<void> {
  // 1. Always persist locally first (guest-safe / offline-safe). If the server
  //    insert below succeeds the entry is removed again — see localLoad note.
  const all = await localLoad();
  await localSave([cry, ...all]);

  // 2. Try Supabase if logged in
  const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
  if (sessionErr || !sessionData?.session) return;      // guest or session error → local only
  const { session } = sessionData;

  // Belt-and-suspenders: make sure the profile row exists so the FK doesn't reject the insert
  await ensureProfile(session.user.id, session.user.email);

  // 3. Upload photo/voice note so they work for friends and across reinstalls
  const media = await uploadCryMedia(cry, session.user.id);
  const synced: Cry = { ...cry, ...media };

  const { error } = await supabase.from('cries').insert(toRow(synced, session.user.id));

  if (error) {
    // Stays in the pending queue — retried by syncLocalToSupabase on next launch
    console.error('[saveCry] Supabase insert failed:', error.message, error.code, error.details);
    return;
  }

  // 4. Server owns this cry now — drop it from the local pending queue.
  await localRemove([cry.id]);
}

export async function loadCries(): Promise<Cry[]> {
  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData?.session;

  if (session) {
    const { data, error } = await supabase
      .from('cries')
      .select(CRY_COLUMNS)
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false });

    if (!error && data) {
      const server: Cry[] = data.map(fromRow);

      // Merge in local cries the server doesn't have yet (offline saves waiting
      // for sync + legacy device-only entries) so nothing ever disappears.
      const local = await localLoad();
      const serverIds = new Set(server.map(c => c.id));
      const pending = local.filter(c => !serverIds.has(c.id));
      if (pending.length === 0) return server;
      return [...pending, ...server]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }
    if (error) {
      console.error('[loadCries] Supabase fetch failed:', error.message);
    }
  }

  // Guest or offline → local
  return localLoad();
}

// ─── Single-cry fetch (edit screen) ──────────────────────────────────────────

/**
 * Loads one of the user's own cries by id without downloading the whole
 * history. Pending/guest copies in local storage win — they may be newer
 * than the server row (offline edits waiting to sync).
 */
export async function getOwnCry(id: string): Promise<Cry | null> {
  const local = (await localLoad()).find(c => c.id === id);
  if (local) return local;

  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData?.session || !isValidUuid(id)) return null;

  const { data, error } = await supabase
    .from('cries')
    .select(CRY_COLUMNS)
    .eq('id', id)
    .eq('user_id', sessionData.session.user.id)
    .maybeSingle();
  if (error || !data) return null;
  return fromRow(data);
}

// ─── Update (edit) ────────────────────────────────────────────────────────────

/**
 * Persists edits to an existing cry. Coordinates, country and createdAt never
 * change — only emotion/intensity/note/tags/visibility/media do.
 * Throws when a logged-in server update fails so the edit screen can tell the
 * user instead of silently dropping their changes.
 */
export async function updateCry(cry: Cry): Promise<void> {
  // 1. Update the local copy if this cry is still in the guest/pending queue.
  const all = await localLoad();
  if (all.some(c => c.id === cry.id)) {
    await localSave(all.map(c => (c.id === cry.id ? cry : c)));
  }

  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData?.session) return;          // guest → local only
  if (!isValidUuid(cry.id)) return;           // legacy device-only entry
  const userId = sessionData.session.user.id;

  // 2. Upload any newly picked media under a fresh filename — reusing the old
  //    name would let image caches keep showing the replaced photo.
  const media = await uploadCryMedia(cry, userId, `_${Date.now()}`);
  const synced: Cry = { ...cry, ...media };

  const update: Record<string, any> = {
    emotion:    synced.emotion,
    intensity:  synced.intensity,
    note:       synced.note ?? null,
    visibility: synced.visibility ?? 'everyone',
    tags:       synced.tags ?? [],
  };
  // Only touch media columns when the value is server-usable: undefined means
  // "removed" (→ null), a remote URL means kept/replaced. A still-local URI
  // means the upload failed — leave the old server file in place.
  if (!isLocalUri(synced.photoUri)) update.photo_uri = synced.photoUri ?? null;
  if (!isLocalUri(synced.audioUri)) update.audio_uri = synced.audioUri ?? null;

  const { error } = await supabase
    .from('cries')
    .update(update)
    .eq('id', cry.id)
    .eq('user_id', userId);

  if (error) {
    console.warn('[updateCry] Supabase update failed:', error.message);
    throw new Error(error.message);
  }

  // 3. Best-effort: remove replaced/removed media files from Storage. Skipped
  //    when an upload failed (a local URI would make old files look stale).
  if (isLocalUri(synced.photoUri) || isLocalUri(synced.audioUri)) return;
  (async () => {
    try {
      const folder = `${userId}/${cry.id}`;
      const keep = [synced.photoUri, synced.audioUri].filter(Boolean) as string[];
      const { data: files } = await supabase.storage.from(MEDIA_BUCKET).list(folder);
      const stale = (files ?? []).filter(f => !keep.some(u => u.endsWith(`${folder}/${f.name}`)));
      if (stale.length) {
        await supabase.storage.from(MEDIA_BUCKET)
          .remove(stale.map(f => `${folder}/${f.name}`));
      }
    } catch { /* non-fatal */ }
  })();
}

// ─── Bulk visibility update ──────────────────────────────────────────────────

/**
 * Sets the visibility on many cries at once (My Cries bulk edit). One server
 * roundtrip regardless of how many are selected. Returns false when the
 * server update fails so the UI can tell the user instead of lying.
 */
export async function updateCriesVisibility(
  ids: string[],
  visibility: NonNullable<Cry['visibility']>,
): Promise<boolean> {
  if (ids.length === 0) return true;
  const idSet = new Set(ids);

  // Local copies first (guest cries + pending offline queue)
  const all = await localLoad();
  if (all.some(c => idSet.has(c.id))) {
    await localSave(all.map(c => (idSet.has(c.id) ? { ...c, visibility } : c)));
  }

  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData?.session) return true;           // guest → local only

  const serverIds = ids.filter(isValidUuid);
  if (serverIds.length === 0) return true;          // legacy device-only entries

  const { error } = await supabase
    .from('cries')
    .update({ visibility })
    .in('id', serverIds)
    .eq('user_id', sessionData.session.user.id);

  if (error) {
    console.warn('[updateCriesVisibility] failed:', error.message);
    return false;
  }
  return true;
}

// ─── UUID validation ──────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function isValidUuid(id: string): boolean { return UUID_RE.test(id); }

// ─── Delete ───────────────────────────────────────────────────────────────────

export async function deleteCry(id: string): Promise<void> {
  // Remove from local storage
  await localRemove([id]);

  // Remove from Supabase (only if logged in and UUID is valid)
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData?.session) return;
  if (!isValidUuid(id)) return;
  const userId = sessionData.session.user.id;

  const { error } = await supabase
    .from('cries')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);

  if (error) {
    console.warn('[deleteCry] Supabase delete failed:', error.message);
    return;
  }

  // Best-effort: clean up uploaded media so deleted cries don't leave
  // photos/audio behind in Storage. Fire-and-forget — never blocks the UI.
  (async () => {
    try {
      const folder = `${userId}/${id}`;
      const { data: files } = await supabase.storage.from(MEDIA_BUCKET).list(folder);
      if (files?.length) {
        await supabase.storage.from(MEDIA_BUCKET)
          .remove(files.map(f => `${folder}/${f.name}`));
      }
    } catch { /* non-fatal */ }
  })();
}

// ─── Sync local cries to Supabase (login + app start) ────────────────────────

export async function syncLocalToSupabase(userId: string, userEmail?: string): Promise<void> {
  const local = await localLoad();
  if (local.length === 0) return;

  await ensureProfile(userId, userEmail);

  // Skip cries with legacy non-UUID IDs — they were created before Phase 3
  const syncable = local.filter(c => isValidUuid(c.id));
  if (syncable.length === 0) return;

  // Upload any still-local media first so the rows we push reference URLs
  // that work on other devices. Sequential — the queue is normally tiny.
  const rows = [];
  for (const cry of syncable) {
    const media = await uploadCryMedia(cry, userId);
    rows.push(toRow({ ...cry, ...media }, userId));
  }

  const { error } = await supabase
    .from('cries')
    .upsert(rows, { onConflict: 'id', ignoreDuplicates: true });

  if (error) {
    console.warn('[syncLocalToSupabase] upsert failed:', error.message);
  } else {
    // Synced rows now live on the server — drop them from the local queue.
    await localRemove(syncable.map(c => c.id));
    console.log(`[syncLocalToSupabase] synced ${rows.length} cries (${local.length - syncable.length} legacy skipped)`);
  }
}
