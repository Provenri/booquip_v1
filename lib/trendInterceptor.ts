import { supabase } from '@/lib/supabase';

export async function generateTrendReply(trendText: string, trendTopicId: string | null, bookIds: string[]) {
  if (!supabase) throw new Error('Connect Supabase to draft a trend reply.');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const { data, error } = await supabase.functions.invoke('trend-interceptor', {
      body: {
        trendText,
        ...(trendTopicId ? { trendTopicId } : {}),
        ...(bookIds.length > 0 ? { bookIds } : {}),
      },
      signal: controller.signal,
    });

    if (error) {
      throw new Error(error.message || 'Could not draft a trend reply.');
    }
    if (typeof data?.reply !== 'string') throw new Error('The trend reply response was empty.');
    return data.reply;
  } catch (error) {
    if (controller.signal.aborted) throw new Error('Reply generation timed out. Check your connection and try again.');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}