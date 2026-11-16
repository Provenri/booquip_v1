export type BookAction = 'tbr' | 'read' | 'freeze' | 'next';

export function getSwipeAction(x: number, y: number, velocityX: number, velocityY: number, canGoNext: boolean): BookAction | undefined {
  'worklet';
  if (Math.abs(x) <= Math.abs(y)) return undefined;
  const isFlick = Math.abs(x) >= 15 && Math.abs(velocityX) >= 500 &&
    Math.abs(velocityX) > Math.abs(velocityY) && Math.sign(x) === Math.sign(velocityX);
  if (Math.abs(x) < 45 && !isFlick) return undefined;
  return x > 0 ? 'tbr' : canGoNext ? 'next' : undefined;
}

export function getShelfSwipeAction(x: number, y: number, velocityX: number, velocityY: number): 'quip' | 'return' | undefined {
  'worklet';
  const action = getSwipeAction(x, y, velocityX, velocityY, true);
  return action === 'tbr' ? 'quip' : action === 'next' ? 'return' : undefined;
}
