import { useEffect, useState } from 'react';
import { Mail, X } from 'lucide-react-native';
import { Modal, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Pressable from '@/components/MotionPressable';
import { isSupabaseConfigured } from '@/lib/supabase';
import { colors, radii, spacing, type } from '@/constants/theme';

type AccountSheetProps = {
  visible: boolean;
  email: string | null;
  pendingEmail: string | null;
  isAnonymous: boolean;
  sessionReady: boolean;
  syncError: string;
  onClose: () => void;
  onLinkEmail: (email: string) => Promise<void>;
  onResendEmail: (email: string) => Promise<void>;
  onSignIn: (email: string) => Promise<void>;
  onSignOut: () => Promise<void>;
  onDeleteAccount: () => Promise<void>;
  onRetry: () => void;
};

function getEmailErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && /email rate limit exceeded|rate limit/i.test(error.message)) {
    return 'Supabase is temporarily limiting email delivery. Wait before requesting another link. If this keeps happening, check your Supabase Auth and email-provider sending limits.';
  }
  return error instanceof Error ? error.message : fallback;
}

export default function AccountSheet({ visible, email, pendingEmail, isAnonymous, sessionReady, syncError, onClose, onLinkEmail, onResendEmail, onSignIn, onSignOut, onDeleteAccount, onRetry }: AccountSheetProps) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isCompact = width < 700;
  const [address, setAddress] = useState('');
  const [authMode, setAuthMode] = useState<'link' | 'signin'>('link');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [signInSentTo, setSignInSentTo] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [confirmingSignOut, setConfirmingSignOut] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setAddress(pendingEmail ?? '');
    setAuthMode('link');
    setSentTo(pendingEmail);
    setSignInSentTo(null);
    setErrorMessage('');
    setConfirmingSignOut(false);
    setConfirmingDelete(false);
    setDeleteConfirmation('');
  }, [visible, email, pendingEmail]);

  const currentPendingEmail = pendingEmail ?? sentTo;
  const normalizedAddress = address.trim();
  const addressHasChanged = Boolean(
    normalizedAddress &&
    currentPendingEmail &&
    normalizedAddress.toLowerCase() !== currentPendingEmail.toLowerCase(),
  );

  const submit = async () => {
    const normalizedEmail = address.trim();
    if (!normalizedEmail || isSubmitting || (currentPendingEmail && normalizedEmail.toLowerCase() === currentPendingEmail.toLowerCase())) return;
    setIsSubmitting(true);
    setErrorMessage('');
    try {
      await onLinkEmail(normalizedEmail);
      setSentTo(normalizedEmail);
    } catch (error) {
      setErrorMessage(getEmailErrorMessage(error, 'Could not send the confirmation email.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const resend = async () => {
    if (!currentPendingEmail || isResending) return;
    setIsResending(true);
    setErrorMessage('');
    try {
      await onResendEmail(currentPendingEmail);
      setSentTo(currentPendingEmail);
    } catch (error) {
      setErrorMessage(getEmailErrorMessage(error, 'Could not resend the confirmation email.'));
    } finally {
      setIsResending(false);
    }
  };

  const signIn = async () => {
    const normalizedEmail = address.trim();
    if (!normalizedEmail || isSigningIn) return;
    setIsSigningIn(true);
    setErrorMessage('');
    try {
      await onSignIn(normalizedEmail);
      setSignInSentTo(normalizedEmail);
    } catch (error) {
      setErrorMessage(getEmailErrorMessage(error, 'Could not send the sign-in link.'));
    } finally {
      setIsSigningIn(false);
    }
  };

  const signOut = async () => {
    if (isSigningOut) return;
    setIsSigningOut(true);
    setErrorMessage('');
    try {
      await onSignOut();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not sign out.');
    } finally {
      setIsSigningOut(false);
    }
  };

  const deleteAccount = async () => {
    if (deleteConfirmation !== 'DELETE' || isDeleting) return;
    setIsDeleting(true);
    setErrorMessage('');
    try {
      await onDeleteAccount();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not delete the account.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType={isCompact ? 'slide' : 'fade'} onRequestClose={onClose}>
      <View style={[styles.overlay, isCompact && styles.overlayMobile]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close account panel" onPress={onClose} style={styles.backdrop} />
        <View accessibilityViewIsModal style={[styles.sheet, isCompact && styles.sheetMobile, isCompact && { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
          <View style={styles.header}>
            <View style={styles.headerIcon}><Mail color={colors.brand} size={18} /></View>
            <Pressable accessibilityRole="button" accessibilityLabel="Close account panel" disabled={isDeleting} onPress={onClose} style={styles.closeButton}>
              <X color={colors.secondary} size={18} />
            </Pressable>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
          {!sessionReady ? (
            <>
              <Text style={styles.eyebrow}>GUEST SESSION</Text>
              <Text style={styles.title}>Shelf not connected</Text>
              <Text style={styles.description}>
                {syncError || (isSupabaseConfigured ? 'A guest session could not be created.' : 'Supabase is not configured for this app.')}
              </Text>
              <Text style={styles.footnote}>Check that Anonymous Sign-Ins are enabled in Supabase Authentication settings, then retry.</Text>
              <Pressable accessibilityRole="button" onPress={onRetry} style={styles.submitButton}>
                <Text style={styles.submitLabel}>RETRY CONNECTION</Text>
              </Pressable>
            </>
          ) : isAnonymous ? authMode === 'signin' ? (
            <>
              <Text style={styles.eyebrow}>WELCOME BACK</Text>
              <Text style={styles.title}>Sign in to your shelf</Text>
              <Text style={styles.description}>Enter the email linked to your shelf. We’ll send you a secure sign-in link.</Text>
              <TextInput
                accessibilityLabel="Email address"
                autoCapitalize="none"
                autoComplete="email"
                autoCorrect={false}
                keyboardType="email-address"
                onChangeText={(value) => { setAddress(value); setSignInSentTo(null); }}
                onSubmitEditing={signIn}
                placeholder="you@example.com"
                placeholderTextColor={colors.quiet}
                returnKeyType="send"
                style={styles.input}
                textContentType="emailAddress"
                value={address}
              />
              {signInSentTo ? (
                <View style={styles.notice}>
                  <Text style={styles.noticeTitle}>Check your email</Text>
                  <Text style={styles.noticeBody}>A sign-in link was sent to {signInSentTo}. Open it to return to your saved shelf.</Text>
                </View>
              ) : null}
              <Pressable
                accessibilityRole="button"
                disabled={!normalizedAddress || isSigningIn}
                onPress={signIn}
                style={({ pressed }) => [styles.submitButton, (!normalizedAddress || isSigningIn) && styles.submitDisabled, pressed && styles.submitPressed]}
              >
                <Text style={styles.submitLabel}>{isSigningIn ? 'SENDING…' : 'SEND SIGN-IN LINK'}</Text>
              </Pressable>
              {errorMessage ? <Text accessibilityRole="alert" style={styles.error}>{errorMessage}</Text> : null}
              <Pressable accessibilityRole="button" onPress={() => { setAuthMode('link'); setErrorMessage(''); setSignInSentTo(null); }} style={styles.modeSwitch}>
                <Text style={styles.modeSwitchLabel}>Need a new account? Link an email</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.eyebrow}>KEEP YOUR SHELF</Text>
              <Text style={styles.title}>Link an email</Text>
              <Text style={styles.description}>We’ll attach your sign-in to this guest account. Your saved books and reading history stay on the same shelf.</Text>
              <TextInput
                accessibilityLabel="Email address"
                autoCapitalize="none"
                autoComplete="email"
                autoCorrect={false}
                keyboardType="email-address"
                onChangeText={setAddress}
                onSubmitEditing={submit}
                placeholder="you@example.com"
                placeholderTextColor={colors.quiet}
                returnKeyType="send"
                style={styles.input}
                textContentType="emailAddress"
                value={address}
              />
              {sentTo || pendingEmail ? (
                <View style={styles.notice}>
                  <Text style={styles.noticeTitle}>Check your email</Text>
                  <Text style={styles.noticeBody}>A confirmation link was sent to {sentTo ?? pendingEmail}. Open it to finish linking this shelf.</Text>
                  {!addressHasChanged && (
                    <Pressable accessibilityRole="button" disabled={isResending} onPress={resend} style={styles.resendButton}>
                      <Text style={styles.resendLabel}>{isResending ? 'SENDING…' : `RESEND TO ${currentPendingEmail}`}</Text>
                    </Pressable>
                  )}
                </View>
              ) : null}
              {(!currentPendingEmail || addressHasChanged) && (
                <Pressable
                  accessibilityRole="button"
                  disabled={!normalizedAddress || isSubmitting}
                  onPress={submit}
                  style={({ pressed }) => [styles.submitButton, (!normalizedAddress || isSubmitting) && styles.submitDisabled, pressed && styles.submitPressed]}
                >
                  <Text style={styles.submitLabel}>{isSubmitting ? 'SENDING…' : currentPendingEmail ? 'SEND TO NEW ADDRESS' : 'SEND CONFIRMATION LINK'}</Text>
                </Pressable>
              )}
              {errorMessage ? <Text accessibilityRole="alert" style={styles.error}>{errorMessage}</Text> : null}
              <Text style={styles.footnote}>You’ll confirm the address before it’s linked.</Text>
              <Pressable accessibilityRole="button" onPress={() => { setAuthMode('signin'); setErrorMessage(''); setAddress(''); }} style={styles.modeSwitch}>
                <Text style={styles.modeSwitchLabel}>Already have an account? Sign in</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.eyebrow}>YOUR ACCOUNT</Text>
              <Text style={styles.title}>Shelf linked</Text>
              <Text style={styles.description}>{email || 'Your email is linked to this shelf.'}</Text>
              {!confirmingSignOut && !confirmingDelete ? (
                <>
                  <Text style={styles.footnote}>Your books and reading history are saved to this account.</Text>
                  <Pressable accessibilityRole="button" onPress={() => setConfirmingSignOut(true)} style={styles.signOutButton}>
                    <Text style={styles.signOutLabel}>SIGN OUT</Text>
                  </Pressable>
                  <Pressable accessibilityRole="button" onPress={() => { setConfirmingDelete(true); setErrorMessage(''); }} style={styles.deleteAccountButton}>
                    <Text style={styles.deleteAccountLabel}>DELETE ACCOUNT AND DATA</Text>
                  </Pressable>
                </>
              ) : confirmingSignOut ? (
                <>
                  <View style={styles.signOutNotice}>
                    <Text style={styles.noticeTitle}>Sign out on this device?</Text>
                    <Text style={styles.noticeBody}>Your linked shelf stays saved. This device will start a new guest shelf, and you can sign back in to restore this one.</Text>
                  </View>
                  <View style={styles.signOutActions}>
                    <Pressable accessibilityRole="button" disabled={isSigningOut} onPress={() => setConfirmingSignOut(false)} style={styles.cancelButton}>
                      <Text style={styles.cancelLabel}>CANCEL</Text>
                    </Pressable>
                    <Pressable accessibilityRole="button" disabled={isSigningOut} onPress={signOut} style={[styles.confirmSignOutButton, isSigningOut && styles.submitDisabled]}>
                      <Text style={styles.confirmSignOutLabel}>{isSigningOut ? 'SIGNING OUT…' : 'SIGN OUT'}</Text>
                    </Pressable>
                  </View>
                </>
              ) : (
                <>
                  <View style={styles.deleteNotice}>
                    <Text style={styles.deleteNoticeTitle}>Permanently delete this account?</Text>
                    <Text style={styles.deleteNoticeBody}>Your account, saved books, reading history, and snoozes will be deleted and cannot be recovered. Type DELETE to confirm.</Text>
                  </View>
                  <TextInput
                    accessibilityLabel="Type DELETE to confirm account deletion"
                    autoCapitalize="characters"
                    autoCorrect={false}
                    editable={!isDeleting}
                    onChangeText={setDeleteConfirmation}
                    placeholder="DELETE"
                    placeholderTextColor={colors.quiet}
                    style={styles.input}
                    value={deleteConfirmation}
                  />
                  <View style={styles.signOutActions}>
                    <Pressable accessibilityRole="button" disabled={isDeleting} onPress={() => { setConfirmingDelete(false); setDeleteConfirmation(''); }} style={styles.cancelButton}>
                      <Text style={styles.cancelLabel}>CANCEL</Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ disabled: deleteConfirmation !== 'DELETE' || isDeleting }}
                      disabled={deleteConfirmation !== 'DELETE' || isDeleting}
                      onPress={deleteAccount}
                      style={[styles.deleteConfirmButton, (deleteConfirmation !== 'DELETE' || isDeleting) && styles.submitDisabled]}
                    >
                      <Text style={styles.confirmSignOutLabel}>{isDeleting ? 'DELETING…' : 'DELETE PERMANENTLY'}</Text>
                    </Pressable>
                  </View>
                </>
              )}
              {errorMessage ? <Text accessibilityRole="alert" style={styles.error}>{errorMessage}</Text> : null}
            </>
          )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20, backgroundColor: 'rgba(24, 39, 33, 0.42)' },
  overlayMobile: { justifyContent: 'flex-end', paddingHorizontal: 0 },
  backdrop: { ...StyleSheet.absoluteFillObject },
  sheet: { width: '100%', maxWidth: 430, maxHeight: '90%', borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: spacing.xl, shadowColor: colors.shadow, shadowOpacity: 0.18, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 8 },
  sheetMobile: { maxWidth: '100%', maxHeight: '92%', marginTop: 'auto', padding: spacing.lg, borderBottomLeftRadius: 0, borderBottomRightRadius: 0, borderTopLeftRadius: radii.sheet, borderTopRightRadius: radii.sheet },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  headerIcon: { width: 42, height: 42, borderRadius: radii.md, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center' },
  closeButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 21, backgroundColor: colors.surfaceMuted },
  content: { paddingBottom: 18 },
  eyebrow: { color: colors.secondary, fontSize: 9, fontWeight: '700', letterSpacing: 1.2 },
  title: { color: colors.ink, fontSize: type.title, lineHeight: 34, fontWeight: '700', marginTop: 6 },
  description: { color: colors.secondary, fontSize: type.body, lineHeight: 21, marginTop: 8 },
  input: { height: 52, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radii.md, paddingHorizontal: spacing.sm, marginTop: 18, color: colors.ink, backgroundColor: colors.white, fontSize: 15 },
  submitButton: { minHeight: 50, borderRadius: 15, marginTop: 10, backgroundColor: colors.brandStrong, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.sm },
  submitDisabled: { opacity: 0.48 },
  submitPressed: { backgroundColor: colors.brandDeep },
  submitLabel: { color: colors.white, fontSize: type.caption, fontWeight: '700' },
  notice: { marginTop: 13, padding: spacing.sm, borderRadius: radii.md, backgroundColor: colors.brandPale },
  noticeTitle: { color: colors.brandDeep, fontSize: 12, fontWeight: '700' },
  noticeBody: { color: colors.brandMuted, fontSize: 12, lineHeight: 18, marginTop: 4 },
  resendButton: { alignSelf: 'flex-start', marginTop: 9, paddingVertical: 5 },
  resendLabel: { color: colors.brandStrong, fontSize: 9, fontWeight: '800', letterSpacing: 0.6 },
  error: { color: colors.danger, fontSize: 12, lineHeight: 18, marginTop: 10 },
  footnote: { color: colors.muted, fontSize: 10, lineHeight: 15, marginTop: 13 },
  modeSwitch: { alignSelf: 'flex-start', marginTop: 16, paddingVertical: 5 },
  modeSwitchLabel: { color: colors.brandStrong, fontSize: 13, fontWeight: '700' },
  signOutButton: { alignSelf: 'flex-start', marginTop: 18, paddingVertical: 8, paddingHorizontal: 2 },
  signOutLabel: { color: colors.dangerDeep, fontSize: 9, fontWeight: '800', letterSpacing: 0.7 },
  deleteAccountButton: { alignSelf: 'flex-start', marginTop: 8, paddingVertical: 8, paddingHorizontal: 2 },
  deleteAccountLabel: { color: colors.dangerDeep, fontSize: 9, fontWeight: '800', letterSpacing: 0.7 },
  signOutNotice: { marginTop: 18, padding: 13, borderRadius: 4, backgroundColor: colors.dangerSoft },
  signOutActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 12 },
  cancelButton: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 13 },
  cancelLabel: { color: colors.secondary, fontSize: 9, fontWeight: '800', letterSpacing: 0.6 },
  confirmSignOutButton: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 4, backgroundColor: colors.dangerDeep },
  confirmSignOutLabel: { color: colors.white, fontSize: 9, fontWeight: '800', letterSpacing: 0.6 },
  deleteNotice: { marginTop: 18, padding: 13, borderRadius: 4, backgroundColor: colors.dangerSoft },
  deleteNoticeTitle: { color: colors.dangerDeep, fontSize: 12, fontWeight: '700' },
  deleteNoticeBody: { color: colors.dangerMuted, fontSize: 12, lineHeight: 18, marginTop: 4 },
  deleteConfirmButton: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 4, backgroundColor: colors.danger },
});
