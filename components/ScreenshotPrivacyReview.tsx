import { useState } from 'react';
import { Image } from 'expo-image';
import { Modal, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import Pressable from '@/components/MotionPressable';
import { colors, radii, spacing, type } from '@/constants/theme';

type ScreenshotPrivacyReviewProps = {
  imageUri: string;
  onCancel: () => void;
  onConfirm: () => void;
};

export default function ScreenshotPrivacyReview({ imageUri, onCancel, onConfirm }: ScreenshotPrivacyReviewProps) {
  const [previewReady, setPreviewReady] = useState(false);
  const [previewFailed, setPreviewFailed] = useState(false);
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View accessibilityViewIsModal style={styles.sheet}>
          <Text accessibilityRole="header" style={styles.title}>Review before sending</Text>
          <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
            <Text style={styles.body}>
              This image will be sent to OpenAI via Supabase to extract text. Check the entire image for names, handles, notifications, private messages, or other sensitive details.
            </Text>
            <Image
              accessibilityLabel="Screenshot selected for review before AI processing"
              source={{ uri: imageUri }}
              cachePolicy="none"
              contentFit="contain"
              onLoad={() => setPreviewReady(true)}
              onError={() => { setPreviewReady(false); setPreviewFailed(true); }}
              style={styles.preview}
            />
            {previewFailed ? <Text accessibilityRole="alert" style={styles.error}>Could not display this image. Cancel and choose another. Nothing has been sent.</Text> : null}
            <Text style={styles.body}>
              {Platform.OS === 'web'
                ? 'To crop or redact it, cancel, edit the image on your device, then choose the edited copy.'
                : 'To crop it, cancel and use Choose & crop. On iOS, the crop is square. To hide names or other details, redact the image in your device editor and choose the edited copy.'}
            </Text>
            <Text style={styles.warning}>Cropping does not guarantee anonymization. Nothing is automatically redacted. Only send an image you are allowed to share.</Text>
          </ScrollView>
          <View style={styles.actions}>
            <Pressable accessibilityRole="button" onPress={onCancel} style={styles.cancel}>
              <Text style={styles.cancelLabel}>Cancel</Text>
            </Pressable>
            <Pressable accessibilityRole="button" disabled={!previewReady || previewFailed} onPress={onConfirm} style={[styles.confirm, (!previewReady || previewFailed) && styles.disabled]}>
              <Text style={styles.confirmLabel}>Send to OpenAI</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.md, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: { width: '100%', maxWidth: 520, maxHeight: '90%', padding: spacing.md, borderRadius: radii.sheet, backgroundColor: colors.surface },
  title: { color: colors.inkStrong, fontSize: type.subtitle, fontWeight: '700', marginBottom: spacing.sm },
  scroll: { flexShrink: 1 },
  content: { gap: spacing.sm },
  body: { color: colors.body, fontSize: type.bodySmall, lineHeight: 20 },
  preview: { width: '100%', height: 280, backgroundColor: colors.surfaceWarm, borderRadius: radii.md },
  warning: { color: colors.body, fontSize: type.caption, lineHeight: 18, fontWeight: '600' },
  error: { color: colors.danger, fontSize: type.bodySmall, lineHeight: 20 },
  disabled: { opacity: 0.5 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: spacing.sm, paddingTop: spacing.md },
  cancel: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.md, borderRadius: radii.md, backgroundColor: colors.brandPale },
  cancelLabel: { color: colors.brandDeep, fontSize: type.bodySmall, fontWeight: '600' },
  confirm: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.md, borderRadius: radii.md, backgroundColor: colors.brandStrong },
  confirmLabel: { color: colors.brandContrast, fontSize: type.bodySmall, fontWeight: '700' },
});
