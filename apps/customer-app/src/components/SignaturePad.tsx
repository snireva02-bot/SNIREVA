import { forwardRef, useImperativeHandle, useRef } from 'react';
import { Platform, View } from 'react-native';
import SignatureScreen, { type SignatureViewRef } from 'react-native-signature-canvas';
import { colors, radius } from '@/lib/theme';
import { Text } from './ui';

export interface SignaturePadHandle { read: () => void; clear: () => void }

const webStyle = `.m-signature-pad { box-shadow: none; border: none; margin: 0; }
  .m-signature-pad--body { border: none; }
  .m-signature-pad--footer { display: none; }
  body, html { background: #ffffff; }`;

/** Drawn signature (WebView canvas). onSigned receives a PNG data URL. */
export const SignaturePad = forwardRef<SignaturePadHandle, {
  onSigned: (dataUrl: string) => void; onEmpty: () => void; onBegin?: () => void; onEnd?: () => void;
}>(function SignaturePad({ onSigned, onEmpty, onBegin, onEnd }, ref) {
  const inner = useRef<SignatureViewRef>(null);
  useImperativeHandle(ref, () => ({
    read: () => inner.current?.readSignature(),
    clear: () => inner.current?.clearSignature(),
  }));

  if (Platform.OS === 'web') {
    return (
      <View style={{ height: 180, borderRadius: radius, borderWidth: 1, borderColor: colors.lineStrong, alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <Text variant="small" style={{ textAlign: 'center' }}>Signing works in the Android app.</Text>
      </View>
    );
  }
  return (
    <View style={{ height: 180, borderRadius: radius, borderWidth: 1, borderColor: colors.lineStrong, overflow: 'hidden', backgroundColor: '#fff' }}
      accessibilityLabel="Signature area. Draw your signature with your finger.">
      <SignatureScreen ref={inner} onOK={onSigned} onEmpty={onEmpty} onBegin={onBegin} onEnd={onEnd} webStyle={webStyle}
        backgroundColor="#ffffff" penColor={colors.ink} imageType="image/png" trimWhitespace autoClear={false} />
    </View>
  );
});
