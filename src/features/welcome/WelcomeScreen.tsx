import { useAuthStore } from '@/state/authStore';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const TOTAL_SLIDES = 3;

// ─── Slide type system ────────────────────────────────────────────────────────

type BaseSlide = {
  title: string;
  subtitle: string;
  nextLabel: string;
  hideSkip?: boolean;
};

type SingleSlide = BaseSlide & {
  layout: 'single';
  image: number;
};

type SplitSlide = BaseSlide & {
  layout: 'split';
  splitImages: Array<{ source: number; label: string }>;
};

type Slide = SingleSlide | SplitSlide;

// ─── Slide data ───────────────────────────────────────────────────────────────

const slides: Slide[] = [
  {
    layout: 'single',
    image: require('@/assets/images/Asset 1 Car.png'),
    title: 'Booking for Smart Rides',
    subtitle: 'Book your ride instantly — fast, simple, safe, and reliable transport',
    nextLabel: 'Next  →',
  },
  {
    layout: 'split',
    splitImages: [
      { source: require('@/assets/images/Asset 1 Car.png'), label: 'Taxi' },
      { source: require('@/assets/images/Asset 2 Bike.png'), label: 'Motorbike' },
    ],
    title: 'Choose Your Ride',
    subtitle: 'Pick from cars, motorbikes, or tricycles — whatever fits your trip',
    nextLabel: 'Next',
  },
  {
    layout: 'single',
    image: require('@/assets/images/Asset 3 Truck.png'),
    title: 'Send It Your Way',
    subtitle: 'Fast, reliable delivery for your packages, anytime you need it',
    nextLabel: 'Get Started',
    hideSkip: true,
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

export function WelcomeScreen() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const completeOnboarding = useAuthStore((state) => state.completeOnboarding);

  const handleFinish = async () => {
    await completeOnboarding();
    router.replace('/auth');
  };

  const handleNext = () => {
    if (currentIndex < TOTAL_SLIDES - 1) {
      setCurrentIndex((i) => i + 1);
    } else {
      handleFinish();
    }
  };

  const slide = slides[Math.min(currentIndex, slides.length - 1)];

  return (
    <View style={styles.container}>
      {/* Image section — single or split layout */}
      {slide.layout === 'single' ? (
        <View style={styles.imageSection}>
          <Image source={slide.image} style={styles.singleImage} resizeMode="contain" />
        </View>
      ) : (
        <View style={styles.imageSection}>
          {slide.splitImages.map(({ source, label }, i) => (
            <View
              key={i}
              style={[
                styles.splitPanel,
                i < slide.splitImages.length - 1 && styles.splitPanelBorder,
              ]}
            >
              <Image source={source} style={styles.splitImage} resizeMode="contain" />
              <View style={styles.labelBadge}>
                <Text style={styles.labelText}>{label}</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Bottom card */}
      <View style={[styles.card, { paddingBottom: Math.max(insets.bottom, 32) }]}>
        <Text style={styles.title}>{slide.title}</Text>
        <Text style={styles.subtitle}>{slide.subtitle}</Text>

        <View style={styles.spacer} />

        <View style={styles.dotsRow}>
          {Array.from({ length: TOTAL_SLIDES }).map((_, i) => (
            <View
              key={i}
              style={[styles.dot, i === currentIndex ? styles.dotActive : styles.dotInactive]}
            />
          ))}
        </View>

        {/* Buttons: skip+next (slides 1–2) or full-width CTA (slide 3) */}
        {slide.hideSkip ? (
          <TouchableOpacity style={styles.nextBtnFull} onPress={handleNext} activeOpacity={0.85}>
            <Text style={styles.nextText}>{slide.nextLabel}</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.buttonsRow}>
            <TouchableOpacity onPress={handleFinish} style={styles.skipBtn} activeOpacity={0.7}>
              <Text style={styles.skipText}>Skip</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.nextBtn} onPress={handleNext} activeOpacity={0.85}>
              <Text style={styles.nextText}>{slide.nextLabel}</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#E7F1F9',
  },

  // ── Image section ──
  imageSection: {
    flex: 58,
    backgroundColor: '#E7F1F9',
  },

  // Single-layout image
  singleImage: {
    width: '100%',
    height: '100%',
  },

  // Split-layout panels
  splitPanel: {
    flex: 1,
    backgroundColor: '#E7F1F9',
  },
  splitPanelBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#D0D8E4',
  },
  splitImage: {
    width: '100%',
    height: '100%',
  },

  // Label badge (absolute bottom-left of each split panel)
  labelBadge: {
    position: 'absolute',
    bottom: 14,
    left: 14,
    backgroundColor: '#FFFFFF',
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  labelText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#26344F',
  },

  // ── Card ──
  card: {
    flex: 42,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 28,
    paddingTop: 32,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#26344F',
    marginBottom: 12,
    lineHeight: 30,
  },
  subtitle: {
    fontSize: 15,
    color: '#7B8387',
    lineHeight: 22,
  },
  spacer: {
    flex: 1,
  },

  // ── Pagination dots ──
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 24,
  },
  dot: {
    height: 8,
    borderRadius: 4,
  },
  dotActive: {
    width: 24,
    backgroundColor: '#FE5035',
  },
  dotInactive: {
    width: 8,
    backgroundColor: '#D1D5DB',
  },

  // ── Buttons ──
  buttonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  skipBtn: {
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  skipText: {
    fontSize: 16,
    color: '#26344F',
    fontWeight: '500',
  },
  // Pill button (slides 1–2, right-aligned)
  nextBtn: {
    backgroundColor: '#FE5035',
    paddingVertical: 17,
    paddingHorizontal: 44,
    borderRadius: 32,
  },
  // Full-width CTA button (slide 3)
  nextBtnFull: {
    backgroundColor: '#FE5035',
    paddingVertical: 18,
    borderRadius: 32,
    alignItems: 'center',
  },
  nextText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
});
