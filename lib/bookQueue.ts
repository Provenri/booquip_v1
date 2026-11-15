export function findNextBook<T extends { id: string }>(books: readonly T[], currentId: string): T | undefined {
  if (books.length === 0 || (books.length === 1 && books[0].id === currentId)) return undefined;
  const index = books.findIndex((book) => book.id === currentId);
  return books[(index + 1) % books.length];
}
