/**
 * Image compression for uploads.
 *
 * Phone photos are often 3-4000px / several MB; the app never renders them
 * larger than a feed card, so uploading originals wastes the user's data and
 * makes feeds slow for everyone downstream. Downscale + re-encode as JPEG
 * before anything hits Storage. Best-effort: on any failure the original URI
 * is returned so a save is never blocked by compression.
 */

import { Image } from 'react-native';
import * as ImageManipulator from 'expo-image-manipulator';

function getSize(uri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) =>
    Image.getSize(uri, (width, height) => resolve({ width, height }), reject),
  );
}

/**
 * Returns a URI for a JPEG no larger than `maxDim` on its longest side.
 * Images already small enough are returned untouched (no re-encode).
 */
export async function compressForUpload(
  uri: string,
  maxDim = 1440,
  quality = 0.75,
): Promise<string> {
  try {
    const { width, height } = await getSize(uri);
    if (Math.max(width, height) <= maxDim) return uri;

    const resize = width >= height ? { width: maxDim } : { height: maxDim };
    const result = await ImageManipulator.manipulateAsync(uri, [{ resize }], {
      compress: quality,
      format: ImageManipulator.SaveFormat.JPEG,
    });
    return result.uri;
  } catch {
    return uri;
  }
}
