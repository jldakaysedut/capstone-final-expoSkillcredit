import { useState } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { colors } from '../theme';

export default function Field({ label, right, ...props }) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ marginBottom: 16 }}>
      <View style={s.row}>
        <Text style={s.label}>{label}</Text>
        {right}
      </View>
      <TextInput
        {...props}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholderTextColor="#9ca3af"
        style={[s.input, focused && s.focused]}
      />
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  label: { fontSize: 14, fontWeight: '700', color: '#374151' },
  input: {
    borderWidth: 1, borderColor: '#d1d5db', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 13, fontSize: 15,
    backgroundColor: '#f9fafb', color: '#111',
  },
  focused: { borderColor: colors.green, backgroundColor: '#fff' },
});