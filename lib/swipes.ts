import { supabase } from '@/lib/supabase';

export type SwipeState = 'tbr' | 'read' | 'frozen';

export type StoredSwipe = {
  book_id: string;
  state: SwipeState;
  freeze_until: string | null;
};

export async function getOrCreateAnonymousUser() {
  if (!supabase) return null;

  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (data.session?.user) return data.session.user;

  const result = await supabase.auth.signInAnonymously();
  if (result.error) throw result.error;
  if (!result.data.user) throw new Error('Supabase did not return an anonymous user.');
  return result.data.user;
}

export async function loadUserSwipes(userId: string): Promise<StoredSwipe[]> {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('user_swipes')
    .select('book_id, state, freeze_until')
    .eq('user_id', userId)
    .returns<StoredSwipe[]>();

  if (error) throw error;
  return data ?? [];
}

export async function saveUserSwipe(
  userId: string,
  bookId: string,
  state: SwipeState,
  freezeUntil: string | null = null,
) {
  if (!supabase) return;

  const { error } = await supabase.from('user_swipes').upsert(
    {
      user_id: userId,
      book_id: bookId,
      state,
      freeze_until: freezeUntil,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,book_id' },
  );

  if (error) throw error;
}

export async function deleteUserSwipe(userId: string, bookId: string) {
  if (!supabase) return;

  const { error } = await supabase
    .from('user_swipes')
    .delete()
    .eq('user_id', userId)
    .eq('book_id', bookId);

  if (error) throw error;
}