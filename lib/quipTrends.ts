import { supabase } from '@/lib/supabase';

export type QuipTrendTopic = {
  id: string;
  countryCode: 'US' | 'UK';
  topic: string;
  approxTraffic: string | null;
  publishedAt: string;
  expiresAt: string;
  newsItems: QuipTrendNewsItem[];
};

export type QuipTrendNewsItem = {
  id: string;
  headline: string;
  snippet: string | null;
  sourceName: string;
  articleUrl: string;
};

export async function loadQuipTrendTopics(): Promise<QuipTrendTopic[]> {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('quip_trend_topics')
    .select('id, country_code, topic, approx_traffic, published_at, expires_at')
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
  const topics = [...latestTopicByKey.values()];

  const newsResult = await supabase
    .from('quip_trend_news_items')
    .select('id, trend_topic_id, headline, snippet, source_name, article_url, position')
    .in('trend_topic_id', topics.map((topic) => topic.id))
    .order('position', { ascending: true });
  if (newsResult.error) throw newsResult.error;

  const newsByTopic = new Map<string, QuipTrendNewsItem[]>();
  for (const item of newsResult.data ?? []) {
    const items = newsByTopic.get(item.trend_topic_id) ?? [];
    items.push({
      id: item.id,
      headline: item.headline,
      snippet: item.snippet,
      sourceName: item.source_name,
      articleUrl: item.article_url,
    });
    newsByTopic.set(item.trend_topic_id, items);
  }

  return topics.map((row) => ({
    id: row.id,
    countryCode: row.country_code as QuipTrendTopic['countryCode'],
    topic: row.topic,
    approxTraffic: row.approx_traffic,
    publishedAt: row.published_at,
    expiresAt: row.expires_at,
    newsItems: newsByTopic.get(row.id) ?? [],
  }));
}