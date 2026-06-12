/**
 * Shared Supabase Storage upload helper.
 *
 * Reads a local file:// URI via expo-file-system and uploads the raw bytes —
 * the fetch(uri).blob() path is unreliable for file:// URIs on React Native
 * and silently produced empty uploads (the original avatar bug).
 *
 * Used by lib/profile.ts (avatars) and lib/storage.ts (cry photos/voice notes).
 */
import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from './supabase';

/** Decode a base64 string into raw bytes without any extra dependency. */
function base64ToBytes(base64: string): Uint8Array {
  const binary = global.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Uploads a local file to a Storage bucket and returns its public URL.
 * Returns null on any failure (missing file, network error, timeout) — callers
 * decide whether to fall back to the local URI or abort.
 */
export async function uploadLocalFile(
  bucket: string,
  path: string,
  localUri: string,
  contentType: string,
  timeoutMs = 15000,
): Promise<string | null> {
  try {
    const base64 = await FileSystem.readAsStringAsync(localUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    if (!base64) throw new Error('read returned empty contents');

    const bytes = base64ToBytes(base64);
    if (bytes.length === 0) throw new Error('decoded file is empty');

    // Bound the upload so a dead network can never hang the caller forever.
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`upload timed out after ${timeoutMs}ms`)), timeoutMs),
    );
    const { error } = await Promise.race([
      supabase.storage.from(bucket).upload(path, bytes, { contentType, upsert: true }),
      timeout,
    ]);
    if (error) throw error;

    const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(path);
    return publicUrl;
  } catch (err) {
    console.warn(`[upload] ${bucket}/${path} failed:`, (err as Error)?.message ?? err);
    return null;
  }
}
