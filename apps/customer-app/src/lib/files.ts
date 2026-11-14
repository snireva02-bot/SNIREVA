import { Platform } from 'react-native';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { signedUrl } from './supabase';

/** Downloads a private PDF (agreement / receipt) and opens the share sheet. */
export async function openPdf(bucket: string, path: string, name: string) {
  const url = await signedUrl(bucket, path);
  if (!url) throw new Error('File is not ready yet. Try again in a minute.');
  if (Platform.OS === 'web') {
    window.open(url, '_blank');
    return;
  }
  const dir = new Directory(Paths.cache, 'pdf');
  if (!dir.exists) dir.create();
  const target = new File(dir, `${name}.pdf`);
  if (target.exists) target.delete();
  const file = await File.downloadFileAsync(url, target);
  await Sharing.shareAsync(file.uri, { mimeType: 'application/pdf', dialogTitle: name, UTI: 'com.adobe.pdf' });
}

export function dataUrlToBytes(dataUrl: string): Uint8Array {
  const b64 = dataUrl.split(',')[1] ?? dataUrl;
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
