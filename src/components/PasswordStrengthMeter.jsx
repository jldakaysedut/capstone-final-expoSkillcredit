import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

// Visual guide only. Supabase Auth applies its own server-side password policy.
export const MIN_PASSWORD_LENGTH = 8;

export default function PasswordStrengthMeter({ password = '' }) {
  const lengthOK = password.length >= MIN_PASSWORD_LENGTH;
  const variety = [
    /[a-z]/.test(password),
    /[A-Z]/.test(password),
    /[0-9]/.test(password),
    /[^a-zA-Z0-9]/.test(password),
  ].filter(Boolean).length;

  const score = !password ? 0 : !lengthOK || variety <= 1 ? 1 : Math.min(variety, 4);
  const levels = [
    { label: 'No password', color: '#cbd5e1' },
    { label: 'Weak', color: '#dc2626' },
    { label: 'Fair', color: '#d97706' },
    { label: 'Good', color: '#2563eb' },
    { label: 'Strong', color: '#047857' },
  ];
  const active = levels[score];

  return (
    <View style={styles.container} accessibilityLabel={`Password strength: ${active.label}. ${lengthOK ? 'Minimum length met' : 'At least 8 characters required'}`}>
      <View style={styles.line}>
        <Text style={styles.title}>Password strength</Text>
        <Text style={[styles.level, { color: score ? active.color : '#64748b' }]}>{password ? active.label : '—'}</Text>
      </View>
      <View style={styles.bars} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {[1, 2, 3, 4].map((segment) => (
          <View
            key={segment}
            style={[styles.bar, { backgroundColor: score >= segment ? active.color : '#e2e8f0' }]}
          />
        ))}
      </View>
      <Text style={[styles.hint, lengthOK && styles.valid]}>
        {lengthOK ? '✓ Minimum 8 characters met' : 'At least 8 characters required'}
      </Text>
      {!!password && lengthOK && score < 4 && (
        <Text style={styles.tip}>Tip: Mix uppercase, lowercase, numbers and symbols.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: 2, marginBottom: 12 },
  line: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7 },
  title: { fontSize: 12, color: '#64748b', fontWeight: '600' },
  level: { fontSize: 12, fontWeight: '700' },
  bars: { flexDirection: 'row', gap: 5 },
  bar: { flex: 1, height: 5, borderRadius: 5 },
  hint: { fontSize: 12, color: '#64748b', marginTop: 7 },
  valid: { color: '#047857' },
  tip: { fontSize: 11, color: '#64748b', marginTop: 4 },
});
