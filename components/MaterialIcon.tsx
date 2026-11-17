import { Text } from 'react-native';
import { colors } from '@/constants/theme';

const iconCharacters = {
  book: '\ue666',
  explore: '\ue87a',
  edit: '\ue745',
  down: '\ue5cf',
  up: '\ue5ce',
  swap: '\ue8d4',
  quote: '\ue244',
  copy: '\ue14d',
  check: '\ue668',
  sparkle: '\ue65f',
  search: '\uef7a',
  swipeLeft: '\ueb59',
  bookmarkAdd: '\ue598',
  left: '\ue5cb',
  right: '\ue5cc',
  movie: '\ue404',
  snooze: '\ue046',
  checkCircle: '\uf0be',
  screen: '\ue30c',
  chart: '\ue26b',
  touch: '\ue913',
} as const;

export default function MaterialIcon({ name, size = 20, color = colors.brandDeep }: {
  name: keyof typeof iconCharacters;
  size?: number;
  color?: string;
}) {
  return <Text accessible={false} aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
    style={{ fontFamily: 'MaterialSymbolsOutlined_400Regular', fontSize: size, lineHeight: size + 2, color }}>{iconCharacters[name]}</Text>;
}
