import { supabase } from '@/lib/supabase';

export async function extractScreenshotTopic(imageBase64: string, mimeType: string) {
  if (!supabase) throw new Error('Connect Supabase to read a screenshot.');

  const { data, error } = await supabase.functions.invoke('screenshot-topic-reader', {
    body: { image: imageBase64, mimeType },
  });

  if (error) throw new Error(error.message || 'Could not read the screenshot.');
  if (typeof data?.text !== 'string' || !data.text) throw new Error('No readable post was found in that screenshot.');
  return data.text;
}
