import { supabase } from '@/lib/supabase';

export async function generateTrendReply(trendText: string, trendTopicId: string | null, bookIds: string[]) {
  if (!supabase) throw new Error('Connect Supabase to draft a trend reply.');

  const { data, error } = await supabase.functions.invoke('trend-interceptor', {
    body: {
      trendText,
      ...(trendTopicId ? { trendTopicId } : {}),
      ...(bookIds.length > 0 ? { bookIds } : {}),
    },
  });

  if (error) throw new Error(error.message || 'Could not draft a trend reply.');
  if (typeof data?.reply !== 'string') throw new Error('The trend reply response was empty.');
  return data.reply;
}