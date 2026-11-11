import * as Linking from 'expo-linking';
import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';

function getEmailRedirectTo() {
  return Platform.OS === 'web'
    ? typeof window !== 'undefined' ? window.location.origin : undefined
    : Linking.createURL('/');
}

async function assertCurrentUser(expectedUserId: string) {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const user = data.session?.user;
  if (!user) throw new Error('Your guest shelf is still connecting. Wait for sync to finish and try again.');
  if (user.id !== expectedUserId) throw new Error('Your shelf session changed. Reload the app before continuing.');
}

export async function linkCurrentUserEmail(email: string, expectedUserId: string) {
  if (!supabase) throw new Error('Supabase is not configured.');
  await assertCurrentUser(expectedUserId);

  const emailRedirectTo = getEmailRedirectTo();
  const { error } = await supabase.auth.updateUser(
    { email: email.trim() },
    emailRedirectTo ? { emailRedirectTo } : undefined,
  );
  if (error) throw error;
}

export async function resendCurrentUserEmailChange(email: string, expectedUserId: string) {
  await assertCurrentUser(expectedUserId);
  const emailRedirectTo = getEmailRedirectTo();
  const { error } = await supabase!.auth.resend({
    type: 'email_change',
    email,
    options: emailRedirectTo ? { emailRedirectTo } : undefined,
  });
  if (error) throw error;
}

export async function signInWithEmail(email: string) {
  if (!supabase) throw new Error('Supabase is not configured.');
  const emailRedirectTo = getEmailRedirectTo();
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim(),
    options: {
      shouldCreateUser: false,
      ...(emailRedirectTo ? { emailRedirectTo } : {}),
    },
  });
  if (error) throw error;
}
