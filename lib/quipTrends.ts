import { supabase } from '@/lib/supabase';

export type QuipTrendTopic = {
  id: string;
  countryCode: 'US' | 'UK';
  topic: string;
  publishedAt: string;
  expiresAt: string;
};

export async function loadQuipTrendTopics(): Promise<QuipTrendTopic[]> {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('quip_trend_topics')
    .select('id, country_code, topic, published_at, expires_at')
    .gt('expires_at', new Date().toISOString())
    .order('published_at', { ascending: false })
    .limit(100);

  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    countryCode: row.country_code as QuipTrendTopic['countryCode'],
    topic: row.topic,
    publishedAt: row.published_at,
    expiresAt: row.expires_at,
  }));
}