import React, { memo } from "react";
import { View } from "react-native";
import Svg, { Defs, LinearGradient, Path, Stop } from "react-native-svg";

const VIEWBOX_SIZE = 100;
const DEFAULT_SIZE = 56;
const DEFAULT_ROTATION = 0;

export interface NavigationArrowProps {
  /** Width and height of the icon in pixels. Defaults to 56. */
  size?: number;
  /** Rotation in degrees, intended to be driven by the driver's GPS heading. Defaults to 0 (north). */
  rotation?: number;
  /** Color variant. Defaults to 'default' (yellow/orange). */
  variant?: 'default' | 'white';
}

function NavigationArrowBase({
  size = DEFAULT_SIZE,
  rotation = DEFAULT_ROTATION,
  variant = 'default',
}: NavigationArrowProps) {
  const isWhite = variant === 'white';
  
  return (
    <View style={{ transform: [{ rotate: `${rotation}deg` }] }}>
      <Svg width={size} height={size} viewBox={`0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}`}>
        <Defs>
          <LinearGradient id="navArrowMain" x1="0%" y1="0%" x2="0%" y2="100%">
            <Stop offset="0%" stopColor={isWhite ? "#FFFFFF" : "#FFD54F"} />
            <Stop offset="100%" stopColor={isWhite ? "#F3F4F6" : "#FFB300"} />
          </LinearGradient>
          <LinearGradient id="navArrowSecondary" x1="0%" y1="0%" x2="0%" y2="100%">
            <Stop offset="0%" stopColor={isWhite ? "#E5E7EB" : "#FFC107"} />
            <Stop offset="100%" stopColor={isWhite ? "#D1D5DB" : "#E69500"} />
          </LinearGradient>
        </Defs>

        {/* Left (lit) face of the beveled arrow */}
        <Path
          d="M50 6 L22 88 Q22 90 24 89 L50 74 Z"
          fill="url(#navArrowMain)"
          strokeLinejoin="round"
        />

        {/* Right (shaded) face of the beveled arrow */}
        <Path
          d="M50 6 L78 88 Q78 90 76 89 L50 74 Z"
          fill="url(#navArrowSecondary)"
          strokeLinejoin="round"
        />

        {/* Glossy highlight sliver along the leading left edge */}
        <Path
          d="M50 12 L30 78 Q29 80 31 78.5 L50 30 Z"
          fill={isWhite ? "#FFFFFF" : "#FFF3C4"}
          opacity={isWhite ? 0.8 : 0.55}
        />
      </Svg>
    </View>
  );
}

const NavigationArrow = memo(NavigationArrowBase);
NavigationArrow.displayName = "NavigationArrow";

export default NavigationArrow;
