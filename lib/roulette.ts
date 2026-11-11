export const ROULETTE_SEGMENT_COUNT = 8;
export const ROULETTE_SEGMENT_ANGLE = 360 / ROULETTE_SEGMENT_COUNT;

export type RouletteLanding = {
  index: number;
  rotation: number;
};

const normalizeDegrees = (degrees: number) => ((degrees % 360) + 360) % 360;

export function getIndexAtPointer(rotation: number): number {
  const normalizedRotation = normalizeDegrees(rotation);
  const angleFromTop = normalizeDegrees(360 - normalizedRotation + ROULETTE_SEGMENT_ANGLE / 2);
  return Math.floor(angleFromTop / ROULETTE_SEGMENT_ANGLE) % ROULETTE_SEGMENT_COUNT;
}

export function getEligibleLanding(rotation: number, eligibleIndexes: number[]): RouletteLanding | null {
  if (eligibleIndexes.length === 0) return null;

  const firstIndex = getIndexAtPointer(rotation);
  let landingIndex = firstIndex;
  for (let offset = 0; offset < ROULETTE_SEGMENT_COUNT; offset += 1) {
    const candidate = (firstIndex - offset + ROULETTE_SEGMENT_COUNT) % ROULETTE_SEGMENT_COUNT;
    if (eligibleIndexes.includes(candidate)) {
      landingIndex = candidate;
      break;
    }
  }

  const desiredRotation = normalizeDegrees(-landingIndex * ROULETTE_SEGMENT_ANGLE);
  const alignment = normalizeDegrees(desiredRotation - normalizeDegrees(rotation));
  return { index: landingIndex, rotation: rotation + alignment };
}

export function getStopLanding(currentRotation: number): RouletteLanding {
  const extraTurns = 0.35 + Math.random() * 0.55;
  const coastRotation = currentRotation + extraTurns * 360;
  const allIndexes = Array.from({ length: ROULETTE_SEGMENT_COUNT }, (_, index) => index);
  return getEligibleLanding(coastRotation, allIndexes)!;
}
