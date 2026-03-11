import { RFValue } from 'react-native-responsive-fontsize';
import { STANDARD_HEIGHT } from '@utils';

export const getFontSize = (size: number) => RFValue(size, STANDARD_HEIGHT);

// WhatsApp-like consistent font sizes
export const FontSizes = {
  // Extra small - timestamps, badges
  size_10: getFontSize(10),
  // Small - secondary text, captions
  size_11: getFontSize(11),
  size_12: getFontSize(12),
  // Body text - messages, descriptions
  size_13: getFontSize(13),
  size_14: getFontSize(14),
  // Medium - chat names, section headers
  size_15: getFontSize(15),
  size_16: getFontSize(16),
  size_17: getFontSize(17),
  // Large - screen titles
  size_18: getFontSize(18),
  size_20: getFontSize(20),
  size_22: getFontSize(22),
  size_24: getFontSize(24),
  size_26: getFontSize(26),
  size_28: getFontSize(28),
  size_30: getFontSize(30),
  size_32: getFontSize(32),
  size_34: getFontSize(34),
  size_36: getFontSize(36),
  size_38: getFontSize(38),
  size_40: getFontSize(40),
};

// Standardized text styles for WhatsApp-like consistency
export const TextStyles = {
  // Screen titles
  screenTitle: {
    fontSize: FontSizes.size_20,
    fontWeight: 600 as const,
  },
  // Chat/contact name in list
  listTitle: {
    fontSize: FontSizes.size_16,
    fontWeight: 500 as const,
  },
  // Message preview, secondary info
  listSubtitle: {
    fontSize: FontSizes.size_14,
    fontWeight: 400 as const,
  },
  // Timestamps
  timestamp: {
    fontSize: FontSizes.size_12,
    fontWeight: 400 as const,
  },
  // Tab labels, buttons
  button: {
    fontSize: FontSizes.size_14,
    fontWeight: 500 as const,
  },
  // Badge count
  badge: {
    fontSize: FontSizes.size_11,
    fontWeight: 600 as const,
  },
  // Body text
  body: {
    fontSize: FontSizes.size_15,
    fontWeight: 400 as const,
  },
};

export enum FontWeights {
  thin = 100,
  extraLight = 200,
  light = 300,
  regular = 400,
  medium = 500,
  semibold = 600,
  bold = 700,
  extraBold = 800,
  black = 900,
}
