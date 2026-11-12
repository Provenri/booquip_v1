import { supabase } from '@/lib/supabase';

export type SocialPlatform = 'linkedin' | 'x';

export async function generateSocialDraft(bookId: string, platform: SocialPlatform) {
  if (!supabase) throw new Error('Connect Supabase to draft a social post.');

  const { data, error } = await supabase.functions.invoke('social-ghostwriter', {
    body: { bookId, platform },
  });

  if (error) throw new Error(error.message || 'Could not draft a social post.');
  if (typeof data?.draft !== 'string') throw new Error('The social draft response was empty.');
  return data.draft;
}