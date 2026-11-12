import type { SocialPlatform } from '@/lib/socialGhostwriter';
import { supabase } from '@/lib/supabase';

export type TrendBookScope = 'single' | 'all';

export async function generateTrendReply(
  scope: TrendBookScope,
  bookId: string | null,
  platform: SocialPlatform,
  trendText: string,
) {
  if (!supabase) throw new Error('Connect Supabase to draft a trend reply.');

  const { data, error } = await supabase.functions.invoke('trend-interceptor', {
    body: { scope, ...(scope === 'single' && bookId ? { bookId } : {}), platform, trendText },
  });

  if (error) throw new Error(error.message || 'Could not draft a trend reply.');
  if (typeof data?.reply !== 'string') throw new Error('The trend reply response was empty.');
  return data.reply;
}