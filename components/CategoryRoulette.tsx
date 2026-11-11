import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, G, Path, Text as SvgText } from 'react-native-svg';
import { SUBCATEGORIES, type SubcategoryId } from '@/lib/books';
import { getStopLanding, ROULETTE_SEGMENT_ANGLE } from '@/lib/roulette';

type CategoryRouletteProps = {
  remainingCounts: Record<SubcategoryId, number>;
  selectedId: SubcategoryId | null;
  disabled?: boolean;
  onSelect: (subcategoryId: SubcategoryId) => void;
};

const SIZE = 310;
const CENTER = SIZE / 2;
const RADIUS = 143;
const SEGMENT_ANGLE = ROULETTE_SEGMENT_ANGLE;
type WheelState = 'idle' | 'spinning' | 'stopping';

function pointAt(angle: number, radius: number) {
  const radians = (angle * Math.PI) / 180;
  return {
    x: CENTER + Math.cos(radians) * radius,
    y: CENTER + Math.sin(radians) * radius,
  };
}

function segmentPath(index: number) {
  const centerAngle = index * SEGMENT_ANGLE - 90;
  const start = pointAt(centerAngle - SEGMENT_ANGLE / 2, RADIUS);
  const end = pointAt(centerAngle + SEGMENT_ANGLE / 2, RADIUS);
  return `M ${CENTER} ${CENTER} L ${start.x} ${start.y} A ${RADIUS} ${RADIUS} 0 0 1 ${end.x} ${end.y} Z`;
}

export default function CategoryRoulette({
  remainingCounts,
  selectedId,
  disabled = false,
  onSelect,
}: CategoryRouletteProps) {
  const { width } = useWindowDimensions();
  const isWide = width >= 1000;
  const wheelScale = Math.min(1, Math.max(0.78, (width - 48) / SIZE));
  const wheelSize = SIZE * wheelScale;
  const rotation = useRef(new Animated.Value(0)).current;
  const normalizedRotation = useRef(0);
  const spinAnimation = useRef<Animated.CompositeAnimation | null>(null);
  const [wheelState, setWheelState] = useState<WheelState>('idle');
  const [reduceMotion, setReduceMotion] = useState(false);
  const isSpinning = wheelState !== 'idle';
  const canPressCenter = !disabled && wheelState !== 'stopping';
  const selectedCategory = SUBCATEGORIES.find((category) => category.id === selectedId);

  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (active) setReduceMotion(enabled);
    }).catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      active = false;
      subscription.remove();
      spinAnimation.current?.stop();
    };
  }, []);

  const startSpin = () => {
    if (disabled || wheelState !== 'idle') return;

    if (reduceMotion) {
      const result = SUBCATEGORIES[Math.floor(Math.random() * SUBCATEGORIES.length)];
      const resultIndex = SUBCATEGORIES.findIndex((category) => category.id === result.id);
      const targetRotation = (360 - resultIndex * SEGMENT_ANGLE) % 360;
      normalizedRotation.current = targetRotation;
      rotation.setValue(targetRotation);
      onSelect(result.id);
      return;
    }

    const startRotation = normalizedRotation.current;
    rotation.setValue(startRotation);
    setWheelState('spinning');
    const animation = Animated.loop(Animated.timing(rotation, {
      toValue: startRotation + 360,
      duration: 1500,
      easing: Easing.linear,
      useNativeDriver: Platform.OS !== 'web',
    }));
    spinAnimation.current = animation;
    animation.start();
  };

  const stopSpin = () => {
    if (wheelState !== 'spinning') return;
    setWheelState('stopping');
    spinAnimation.current?.stop();
    spinAnimation.current = null;

    rotation.stopAnimation((currentRotation) => {
      const startRotation = currentRotation ?? normalizedRotation.current;
      const landing = getStopLanding(startRotation);
      if (!landing) {
        setWheelState('idle');
        return;
      }

      const coastDistance = landing.rotation - startRotation;
      const spinSpeedDegreesPerSecond = (360 / 1500) * 1000;
      const deceleration = Animated.timing(rotation, {
        toValue: landing.rotation,
        duration: Math.max(450, (2 * coastDistance / spinSpeedDegreesPerSecond) * 1000),
        easing: Easing.out(Easing.quad),
        useNativeDriver: Platform.OS !== 'web',
      });
      spinAnimation.current = deceleration;
      deceleration.start(({ finished }) => {
        spinAnimation.current = null;
        if (finished) {
          normalizedRotation.current = landing.rotation % 360;
          rotation.setValue(normalizedRotation.current);
          onSelect(SUBCATEGORIES[landing.index].id);
        }
        setWheelState('idle');
      });
    });
  };

  const handleCenterPress = () => {
    if (wheelState === 'spinning') {
      stopSpin();
      return;
    }
    startSpin();
  };

  return (
    <View style={[styles.panel, !isWide && styles.panelCompact]}>
      <View style={[styles.wheelColumn, { width: wheelSize }]}>
        <View style={{ width: wheelSize, height: wheelSize }}>
          <View style={[styles.wheelWrap, { left: (wheelSize - SIZE) / 2, top: (wheelSize - SIZE) / 2, transform: [{ scale: wheelScale }] }]}>
          <View style={styles.pointer} />
          <Animated.View style={{ transform: [{ rotate: rotation.interpolate({ inputRange: [0, 360], outputRange: ['0deg', '360deg'], extrapolate: 'extend' }) }] }}>
            <Svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
              {SUBCATEGORIES.map((category, index) => {
                const isSelected = selectedId === category.id;
                const labelPosition = pointAt(index * SEGMENT_ANGLE - 90, 102);
                return (
                  <G key={category.id}>
                    <Path
                      d={segmentPath(index)}
                      fill={category.color}
                      fillOpacity={1}
                      stroke={isSelected ? '#fffdf8' : '#f7f5ef'}
                      strokeWidth={isSelected ? 4 : 2}
                    />
                    <SvgText
                      x={labelPosition.x}
                      y={labelPosition.y + 4}
                      fill="#fffdf8"
                      fontSize="12"
                      fontWeight="700"
                      textAnchor="middle"
                      opacity={0.92}
                    >
                      {String(index + 1).padStart(2, '0')}
                    </SvgText>
                  </G>
                );
              })}
              <Circle cx={CENTER} cy={CENTER} r={RADIUS + 1} fill="none" stroke="#fffdf8" strokeWidth="3" />
            </Svg>
          </Animated.View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={wheelState === 'spinning' ? 'Stop the roulette' : wheelState === 'stopping' ? 'Roulette slowing down' : 'Spin the roulette'}
            accessibilityHint={wheelState === 'spinning' ? 'Stops the wheel and deals a book from the category under the pointer' : 'Starts the wheel; press again to stop'}
            disabled={!canPressCenter}
            onPress={handleCenterPress}
            style={({ pressed }) => [styles.spinButton, !canPressCenter && styles.spinButtonDisabled, pressed && styles.spinButtonPressed]}
          >
            <Text style={styles.spinKicker}>{wheelState === 'spinning' ? 'TAP TO' : wheelState === 'stopping' ? 'CHOOSING' : 'BOOQUIP'}</Text>
            <Text style={styles.spinLabel}>{wheelState === 'spinning' ? 'STOP' : wheelState === 'stopping' ? '…' : 'SPIN'}</Text>
            <Text style={styles.spinFoot}>{wheelState === 'idle' ? 'THE WHEEL' : 'A GOOD READ'}</Text>
          </Pressable>
          </View>
        </View>
        <Text style={styles.wheelCaption}>8 SHELVES · {Object.values(remainingCounts).reduce((total, count) => total + count, 0)} BOOKS LEFT</Text>
      </View>

      <View style={[styles.categoryColumn, !isWide && styles.categoryColumnCompact]}>
        <Text style={styles.listEyebrow}>THE EIGHT SHELVES</Text>
        <Text style={styles.listTitle}>The wheel lands here.</Text>
        <View style={styles.categoryGrid}>
          {SUBCATEGORIES.map((category, index) => {
            const isSelected = selectedId === category.id;
            return (
              <View
                key={category.id}
                accessible
                accessibilityLabel={`${category.label}, ${category.pillar}, ${remainingCounts[category.id]} books remaining${isSelected ? ', last landing' : ''}`}
                style={[
                  styles.categoryItem,
                  isSelected && styles.categoryItemSelected,
                ]}
              >
                <View style={[styles.categoryNumber, { backgroundColor: category.color }]}>
                  <Text style={styles.categoryNumberText}>{String(index + 1).padStart(2, '0')}</Text>
                </View>
                <View style={styles.categoryCopy}>
                  <Text style={styles.categoryName}>{category.label}</Text>
                  <Text style={styles.categoryPillar}>{category.pillar.toUpperCase()}</Text>
                </View>
                <Text style={styles.categoryCount}>{remainingCounts[category.id]}</Text>
                {isSelected && <View style={[styles.selectedMark, { backgroundColor: category.color }]} />}
              </View>
            );
          })}
        </View>
        {selectedId && (
          <View style={styles.resultLine} accessibilityLiveRegion="polite">
            <Text style={styles.resultKicker}>THE WHEEL LANDED ON</Text>
            <Text style={styles.resultName}>{selectedCategory?.label}</Text>
            <Text style={styles.resultDescription}>{selectedCategory?.description}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 34, width: '100%', maxWidth: 860, alignSelf: 'center', paddingVertical: 20, paddingHorizontal: 10, borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#dde2da', backgroundColor: '#f8f8f4' },
  panelCompact: { flexDirection: 'column', gap: 20 },
  wheelColumn: { alignItems: 'center', flexShrink: 0 },
  wheelWrap: { position: 'absolute', width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' },
  pointer: { position: 'absolute', zIndex: 2, top: -1, width: 0, height: 0, borderLeftWidth: 10, borderRightWidth: 10, borderTopWidth: 19, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: '#283b34' },
  spinButton: { position: 'absolute', width: 92, height: 92, borderRadius: 46, backgroundColor: '#f6f7f1', borderWidth: 1, borderColor: '#d8ded5', alignItems: 'center', justifyContent: 'center', shadowColor: '#1e302d', shadowOpacity: 0.15, shadowRadius: 9, shadowOffset: { width: 0, height: 3 }, elevation: 3 },
  spinButtonDisabled: { opacity: 0.78 },
  spinButtonPressed: { transform: [{ scale: 0.96 }] },
  spinKicker: { color: '#728077', fontSize: 7, fontWeight: '700', letterSpacing: 1 },
  spinLabel: { color: '#263b33', fontSize: 21, lineHeight: 25, fontWeight: '800', letterSpacing: 0 },
  spinFoot: { color: '#97a199', fontSize: 6, fontWeight: '700', letterSpacing: 0.85 },
  wheelCaption: { color: '#7d8b81', fontSize: 8, fontWeight: '700', letterSpacing: 1.1, marginTop: 10 },
  categoryColumn: { flex: 1, minWidth: 265, maxWidth: 390 },
  categoryColumnCompact: { width: '100%', minWidth: 0 },
  listEyebrow: { color: '#728278', fontSize: 9, fontWeight: '700', letterSpacing: 1.2 },
  listTitle: { color: '#26372f', fontSize: 19, lineHeight: 25, fontWeight: '600', marginTop: 6, marginBottom: 13 },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  categoryItem: { width: '48%', minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 7, paddingVertical: 7, borderWidth: 1, borderColor: '#e1e5de', borderRadius: 4, backgroundColor: '#fbfcf8' },
  categoryItemSelected: { borderColor: '#587f6b', backgroundColor: '#e7f0e9' },
  categoryNumber: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  categoryNumberText: { color: '#fff', fontSize: 8, fontWeight: '800' },
  categoryCopy: { flex: 1, minWidth: 0 },
  categoryName: { color: '#35433b', fontSize: 9, lineHeight: 12, fontWeight: '700' },
  categoryPillar: { color: '#8a958c', fontSize: 6, fontWeight: '700', letterSpacing: 0.65, marginTop: 2 },
  categoryCount: { color: '#7f8d83', fontSize: 9, fontWeight: '700', fontVariant: ['tabular-nums'] },
  selectedMark: { width: 5, height: 5, borderRadius: 3 },
  resultLine: { marginTop: 12, borderLeftWidth: 2, borderLeftColor: '#d97452', paddingLeft: 9 },
  resultKicker: { color: '#879188', fontSize: 7, fontWeight: '700', letterSpacing: 0.9 },
  resultName: { color: '#324238', fontSize: 12, fontWeight: '700', marginTop: 2 },
  resultDescription: { color: '#69776e', fontSize: 11, lineHeight: 16, marginTop: 3 },
});
