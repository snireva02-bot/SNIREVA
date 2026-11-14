import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { supabase } from './supabase';

export type PickSource = 'camera' | 'gallery';
const MAX_EDGE = 1600;

/** Opens camera or gallery, then resizes (max ~1600px) and compresses (0.7) the image. */
export async function pickImage(source: PickSource): Promise<string | null> {
  const perm = source === 'camera'
    ? await ImagePicker.requestCameraPermissionsAsync()
    : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) throw new Error(source === 'camera' ? 'Allow camera access in Settings to take a photo' : 'Allow photo access in Settings to choose a photo');

  const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1, allowsEditing: false, exif: false };
  const res = source === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
  if (res.canceled || !res.assets?.[0]) return null;
  const a = res.assets[0];
  return compressImage(a.uri, a.width, a.height);
}

export async function compressImage(uri: string, width?: number, height?: number): Promise<string> {
  const ctx = ImageManipulator.manipulate(uri);
  if (width && height && Math.max(width, height) > MAX_EDGE) {
    ctx.resize(width >= height ? { width: MAX_EDGE, height: null } : { width: null, height: MAX_EDGE });
  }
  const img = await ctx.renderAsync();
  const out = await img.saveAsync({ format: SaveFormat.JPEG, compress: 0.7 });
  return out.uri;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Uploads a local file to Storage, retrying on poor networks. Returns the storage path. */
export async function uploadFile(bucket: string, path: string, uri: string, contentType = 'image/jpeg', attempts = 3): Promise<string> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const body = await (await fetch(uri)).arrayBuffer();
      const { error } = await supabase.storage.from(bucket).upload(path, body, { contentType, upsert: true });
      if (error) throw new Error(error.message);
      return path;
    } catch (e) {
      lastErr = e;
      await sleep(800 * 2 ** i);
    }
  }
  throw lastErr instanceof Error ? new Error(`Upload failed: ${lastErr.message}. Check your connection and try again.`) : new Error('Upload failed');
}

export const fileName = (prefix: string) => `${prefix}-${Date.now()}.jpg`;
