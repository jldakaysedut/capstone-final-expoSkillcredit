// Presentation-only native components. Keep every native prop/ref/handler intact;
// adjust common light surface, foreground and border colors ONLY in dark mode.
// Staff/auth routes never import these and therefore retain their original UI.
import React, { forwardRef, useMemo } from 'react';
import {
  View as NativeView, Text as NativeText, Pressable as NativePressable,
  ScrollView as NativeScrollView, TextInput as NativeTextInput,
  FlatList as NativeFlatList, SectionList as NativeSectionList,
  KeyboardAvoidingView as NativeKeyboardAvoidingView, Image as NativeImage,
  ActivityIndicator as NativeActivityIndicator, StyleSheet,
} from 'react-native';
import { useUserTheme } from './PremiumTheme';

const LIGHT_SURFACES = new Map([
  ['#fff', '#162329'], ['#ffffff', '#162329'], ['#faf9f6', '#0c151b'],
  ['#f7f9f9', '#101b21'], ['#f0f2f5', '#142128'], ['#eff3f4', '#192a31'],
  ['#f8fafc', '#101a21'], ['#f3f4f6', '#1c2b33'], ['#f9fafb', '#142129'],
  ['#f2f6f4', '#182a31'], ['#f4f8f6', '#192c32'], ['#f6fbf8', '#16272c'],
  ['#f6faf7', '#17272d'], ['#f4fbf7', '#162b2a'], ['#f8fcf9', '#0f1b20'],
  ['#f8fbf9', '#102027'], ['#fbfdfb', '#102027'], ['#f5f7f4', '#122027'],
  ['#ecfdf5', '#12352d'], ['#d1fae5', '#154535'], ['#a7f3d0', '#20533c'],
  ['#e9eff0', '#273b42'], ['#e6eff0', '#273b42'], ['#e1ede6', '#203b32'],
  ['#e0ece5', '#203b32'], ['#dceee3', '#214438'], ['#ddede4', '#233e36'],
  ['#d0eddd', '#224536'], ['#e2efe6', '#224537'], ['#e3f0e7', '#254337'],
  ['#f1f7f3', '#162d27'], ['#f1f6f3', '#162d27'], ['#f7fcf9', '#142b25'],
  ['#f1f5f9', '#1b2a33'], ['#f6faf7', '#162b28'], ['#fafdfb', '#15272a'],
  // Colors used by the Dashboard chips/cards and Notifications sticky tabs.
  ['#fdfefd', '#162329'], ['#f5fbf7', '#15282a'], ['#eef7f1', '#182a31'],
  ['#f1f6f3', '#1b3034'], ['#f1f7f3', '#17362e'],
  ['#e7efe9', '#273e43'], ['#e5eee8', '#2b4249'], ['#e8f0ea', '#273d42'],
  ['#d6f3e3', '#194735'], ['#fffbeb', '#392c1a'], ['#fef3c7', '#41321c'],
  ['#fff1f2', '#3b2029'], ['#eff6ff', '#142d42'], ['#eef2ff', '#212843'],
  ['#f0fdfa', '#163a39'], ['#fdf2f8', '#3c2436'], ['#f1f5f9', '#1b2a33'],
]);
const DARK_TEXT = new Map([
  ['#0f1419', '#eaf3f5'], ['#111827', '#eaf3f5'], ['#1f2937', '#e1eaf0'],
  ['#123b2c', '#d2f4df'], ['#153d2e', '#b3efd0'], ['#064e3b', '#6ee7b7'],
  ['#047857', '#34d399'], ['#059669', '#34d399'], ['#065f46', '#6ee7b7'],
  ['#374151', '#cbd5e1'], ['#475569', '#bccbd8'], ['#536471', '#a5b7c5'],
  ['#64748b', '#9fb1c2'], ['#6b7280', '#a7b3c0'], ['#8b98a5', '#9caeba'],
  ['#9ca3af', '#a7b4c0'], ['#d1d5db', '#647888'], ['#cfd9de', '#6f8290'],
  ['#b45309', '#fbbf24'], ['#92400e', '#fdba74'], ['#be123c', '#fda4af'],
  ['#0a3e2c', '#86efac'], ['#0b573c', '#6ee7b7'], ['#153d2e', '#b3efd0'],
  ['#d97706', '#fbbf24'], ['#0369a1', '#7dd3fc'], ['#4338ca', '#a5b4fc'],
  ['#7e22ce', '#d8b4fe'], ['#9f1239', '#fda4af'],
  // Dark green body/title colors otherwise remain hard to read on dark cards.
  ['#143d2e', '#d2f4df'], ['#163b2d', '#d2f4df'],
  ['#315547', '#b9d5ca'], ['#096d50', '#6ee7b7'],
]);
const LIGHT_BORDER = new Set([
  '#fff', '#ffffff', '#eff3f4', '#cfd9de', '#e5e7eb', '#e2e8f0',
  '#d1d5db', '#dfe7e2', '#e3eee7', '#dfede4', '#e0eee6', '#e4e9ec',
  '#d6e6dd', '#cbd5e1', '#f0f2f5', '#a7f3d0', '#d1fae5', '#bbf7d0',
  '#b5e8d0', '#d0eddd', '#e0ece5', '#e2efe6', '#dceee3', '#e9eff0',
]);
const normalize = (color) => typeof color === 'string' ? color.toLowerCase().trim() : null;
const toRGB = (hex) => {
  if (!hex || !/^#[0-9a-f]{3}$|^#[0-9a-f]{6}$/i.test(hex)) return null;
  const v = hex.length === 4
    ? hex.slice(1).split('').map((x) => parseInt(x + x, 16))
    : [1, 3, 5].map((n) => parseInt(hex.slice(n, n + 2), 16));
  return v.map((x) => x / 255);
};
function darkenColor(key, value) {
  const color = normalize(value);
  if (!color) return value;
  if (color === 'white') return darkenColor(key, '#ffffff');
  if (key === 'shadowColor') return value;
  if (key === 'color' || key === 'tintColor' || key === 'placeholderTextColor' || key === 'textDecorationColor') {
    if (DARK_TEXT.has(color)) return DARK_TEXT.get(color);
    if (key === 'placeholderTextColor') return '#91a8b6';
    const rgb = toRGB(color);
    if (!rgb) return value;
    const max = Math.max(...rgb), min = Math.min(...rgb);
    if (max < 0.39 && rgb[1] > rgb[0] * 1.32 && rgb[1] > rgb[2] * 0.86) return '#6ee7b7';
    if (max < 0.39 && max - min < 0.22) return '#d9e5ec';
    if (max < 0.55 && rgb[2] > rgb[0] * 1.36) return '#93c5fd';
    // Keep white labels on primary action buttons white.
    return value;
  }
  if (key === 'backgroundColor') {
    if (LIGHT_SURFACES.has(color)) return LIGHT_SURFACES.get(color);
    if (/^rgba\(255\s*,\s*255\s*,\s*255\s*,\s*0\.9\d*\)$/.test(color)) return 'rgba(22,35,41,0.94)';
    const rgb = toRGB(color);
    if (!rgb) return value;
    const max = Math.max(...rgb), min = Math.min(...rgb);
    if (min > 0.91 && max - min < 0.11) return '#162329';
    // Soft pastel surfaces in Profile, Wallet, Sessions, Alerts and AI cards.
    // Don't darken vivid brand buttons or cover photography.
    if (min > 0.61 && max > 0.78) {
      if (rgb[1] > rgb[0] + 0.045 && rgb[1] >= rgb[2] - 0.015) return '#173a31';
      if (rgb[2] > rgb[1] + 0.05 && rgb[2] > rgb[0] + 0.025) return '#1b3045';
      if (rgb[0] > rgb[1] + 0.055 && rgb[0] > rgb[2] + 0.025) return '#3a2830';
      if (rgb[0] > rgb[2] + 0.055 && rgb[1] > rgb[2] + 0.04) return '#392f22';
      return '#1d2e35';
    }
    if (min > 0.78 && rgb[1] > rgb[0] && rgb[1] > rgb[2]) return '#163a30';
    if (min > 0.78 && rgb[0] > rgb[1] && rgb[1] > rgb[2]) return '#3a2e1b';
    if (min > 0.78 && rgb[0] > rgb[1] && rgb[2] > rgb[1]) return '#3a222e';
    if (min > 0.78) return '#202e37';
    return value;
  }
  if (key.toLowerCase().includes('border') && key.toLowerCase().includes('color')) {
    if (LIGHT_BORDER.has(color)) return '#2b4249';
    const rgb = toRGB(color);
    if (rgb && Math.min(...rgb) > 0.72) return '#2b4249';
  }
  return value;
}
export const darkIconColor = (value) => value == null ? '#d9e5ec' : darkenColor('color', value);
const COLOR_KEYS = new Set([
  'color', 'backgroundColor', 'borderColor', 'borderTopColor', 'borderBottomColor',
  'borderLeftColor', 'borderRightColor', 'borderStartColor', 'borderEndColor',
  'placeholderTextColor', 'textDecorationColor', 'tintColor', 'shadowColor',
]);
const styleCache = new WeakMap();
export function darkStyle(style) {
  if (style == null || style === false) return style;
  if (typeof style === 'function') return (state) => darkStyle(style(state));
  if (typeof style === 'object' && styleCache.has(style)) return styleCache.get(style);
  const flattened = StyleSheet.flatten(style);
  if (!flattened || typeof flattened !== 'object') return style;
  const mapped = {};
  for (const [key, value] of Object.entries(flattened)) {
    mapped[key] = COLOR_KEYS.has(key) ? darkenColor(key, value) : value;
  }
  if (typeof style === 'object') styleCache.set(style, mapped);
  return mapped;
}
export const useThemeStyle = (style) => {
  const { isDark } = useUserTheme();
  return useMemo(() => isDark ? darkStyle(style) : style, [isDark, style]);
};
const themed = (Component, label, extras = []) => {
  const Wrapped = forwardRef(function PremiumThemedNative({ style, ...props }, ref) {
    const { isDark } = useUserTheme();
    const nextProps = { ...props, ref, style: isDark ? darkStyle(style) : style };
    if (isDark && Component === NativeTextInput && props.placeholderTextColor) nextProps.placeholderTextColor = darkenColor('placeholderTextColor', props.placeholderTextColor);
    if (isDark) for (const key of extras) {
      if (props[key] != null) nextProps[key] = darkStyle(props[key]);
    }
    return <Component {...nextProps} />;
  });
  Wrapped.displayName = label;
  // Repeated list rows and labels skip needless renders when their native props
  // are unchanged; React context updates still repaint dark/light immediately.
  const MemoWrapped = React.memo(Wrapped);
  MemoWrapped.displayName = label;
  return MemoWrapped;
};
export const View = themed(NativeView, 'ThemedView');
export const Text = themed(NativeText, 'ThemedText');
export const Pressable = themed(NativePressable, 'ThemedPressable');
export const ScrollView = themed(NativeScrollView, 'ThemedScrollView', ['contentContainerStyle']);
export const TextInput = themed(NativeTextInput, 'ThemedTextInput');
export const FlatList = themed(NativeFlatList, 'ThemedFlatList', ['contentContainerStyle', 'columnWrapperStyle', 'ListHeaderComponentStyle', 'ListFooterComponentStyle']);
export const SectionList = themed(NativeSectionList, 'ThemedSectionList', ['contentContainerStyle']);
export const KeyboardAvoidingView = themed(NativeKeyboardAvoidingView, 'ThemedKeyboardAvoidingView');
export const Image = themed(NativeImage, 'ThemedImage');
export const ActivityIndicator = forwardRef(function ThemedActivityIndicator(props, ref) {
  const { isDark } = useUserTheme();
  return <NativeActivityIndicator {...props} ref={ref} color={isDark ? darkIconColor(props.color) : props.color} />;
});
