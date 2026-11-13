import { supabase } from '@/lib/supabase';

export type QuipTrendTopic = {
  id: string;
  countryCode: 'US' | 'UK';
  topic: string;
  summary: string | null;
  approxTraffic: string | null;
  publishedAt: string;
  expiresAt: string;
};

export async function loadQuipTrendTopics(): Promise<QuipTrendTopic[]> {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('quip_trend_topics')
    .select('id, country_code, topic, summary, approx_traffic, published_at, expires_at')
    .gt('expires_at', new Date().toISOString())
    .order('published_at', { ascending: false })
    .limit(100);

  if (error) throw error;
  const cachedTopics = data ?? [];
  if (cachedTopics.length === 0) return [];

  const latestTopicByKey = new Map<string, (typeof cachedTopics)[number]>();
  for (const topic of cachedTopics) {
    const key = `${topic.country_code}:${topic.topic.trim().toLocaleLowerCase()}`;
    if (!latestTopicByKey.has(key)) latestTopicByKey.set(key, topic);
  }

  return [...latestTopicByKey.values()].map((row) => ({
    id: row.id,
    countryCode: row.country_code as QuipTrendTopic['countryCode'],
    topic: row.topic,
    summary: row.summary,
    approxTraffic: row.approx_traffic,
    publishedAt: row.published_at,
    expiresAt: row.expires_at,
  }));
}