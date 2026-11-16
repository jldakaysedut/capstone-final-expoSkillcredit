import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert as NativeAlert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

// The existing call signature is preserved: Alert.alert(title, message, buttons, options).
// All business actions remain in the original screens and run only on button press.
let showCustomAlert = null;

export const Alert = {
  alert(title, message, buttons, options) {
    if (showCustomAlert) {
      showCustomAlert({ title, message, buttons, options });
    } else {
      // For startup errors that occur before the provider mounts.
      NativeAlert.alert(title, message, buttons, options);
    }
  },
};

export function SkillCreditAlertProvider({ children }) {
  const [dialog, setDialog] = useState(null);
  const active = useRef(null);
  const pending = useRef([]);

  const displayNext = useCallback(() => {
    const next = pending.current.shift() || null;
    active.current = next;
    setDialog(next);
  }, []);

  useEffect(() => {
    const enqueue = (request) => {
      if (!active.current) {
        active.current = request;
        setDialog(request);
      } else {
        pending.current.push(request);
      }
    };
    showCustomAlert = enqueue;
    return () => {
      if (showCustomAlert === enqueue) showCustomAlert = null;
      pending.current = [];
    };
  }, []);

  const close = useCallback((button, dismissed = false) => {
    const current = active.current;
    if (!current) return;
    // Clear the current alert before any callbacks can trigger a new one.
    active.current = null;
    setDialog(null);
    try {
      if (dismissed) {
        current.options?.onDismiss?.();
      } else {
        button?.onPress?.();
      }
    } finally {
      // After the native modal closes, allow the next queued alert to render.
      // Never discard an Alert.alert fired within the selected action.
      if (!active.current && pending.current.length) {
        displayNext();
      }
    }
  }, [displayNext]);

  const cancelable = dialog?.options?.cancelable === true;
  const closeOnBack = () => {
    if (cancelable) close(null, true);
  };
  const actions = dialog?.buttons?.length ? dialog.buttons : [{ text: 'OK' }];
  const longButtons = actions.length > 3 || actions.some((b) => (b?.text || '').length > 16);

  return (
    <>
      {children}
      <Modal
        transparent
        visible={!!dialog}
        animationType="fade"
        statusBarTranslucent
        onRequestClose={closeOnBack}
      >
        <View style={styles.overlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => cancelable && close(null, true)} />
          <View style={styles.panel} accessibilityRole="alert">
            <View style={styles.topMarker} />
            {!!dialog?.title && <Text style={styles.title}>{String(dialog.title)}</Text>}
            {dialog?.message != null && String(dialog.message).length > 0 && (
              <ScrollView style={styles.messageScroll} contentContainerStyle={styles.messageContainer} bounces={false}>
                <Text style={styles.message}>{String(dialog.message)}</Text>
              </ScrollView>
            )}
            <View style={[styles.actions, longButtons && styles.stackedActions]}>
              {actions.map((button, index) => {
                const style = button?.style;
                const isCancel = style === 'cancel';
                const isDestructive = style === 'destructive';
                const isPrimary = !isCancel && !isDestructive && (actions.length === 1 || index === actions.length - 1);
                return (
                  <Pressable
                    key={`${index}-${button?.text || 'OK'}`}
                    accessibilityRole="button"
                    onPress={() => close(button)}
                    style={({ pressed }) => [
                      styles.action,
                      longButtons && styles.stackedAction,
                      isPrimary && styles.primary,
                      isDestructive && styles.danger,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={[styles.actionText, isPrimary && styles.primaryText, isDestructive && styles.dangerText]} numberOfLines={longButtons ? 2 : 3}>
                      {button?.text || 'OK'}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    backgroundColor: 'rgba(15, 23, 42, 0.52)',
  },
  panel: {
    width: '100%',
    maxWidth: 390,
    maxHeight: '78%',
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 18,
    alignItems: 'center',
    elevation: 12,
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
  },
  topMarker: {
    width: 40,
    height: 4,
    borderRadius: 4,
    backgroundColor: '#10B981',
    marginBottom: 17,
  },
  title: {
    color: '#0F172A',
    fontSize: 19,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 26,
  },
  messageScroll: { flexGrow: 0, width: '100%', marginTop: 12, maxHeight: 260 },
  messageContainer: { alignItems: 'center' },
  message: {
    fontSize: 14,
    lineHeight: 21,
    color: '#475569',
    textAlign: 'center',
  },
  actions: { flexDirection: 'row', width: '100%', justifyContent: 'center', gap: 8, marginTop: 24 },
  stackedActions: { flexDirection: 'column', alignItems: 'stretch' },
  action: {
    flex: 1,
    minHeight: 43,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F5F9',
  },
  stackedAction: { flex: 0, width: '100%' },
  primary: { backgroundColor: '#047857' },
  danger: { backgroundColor: '#FFF1F2' },
  pressed: { opacity: 0.72 },
  actionText: { color: '#334155', fontSize: 13, fontWeight: '700', textAlign: 'center' },
  primaryText: { color: '#FFFFFF' },
  dangerText: { color: '#BE123C' },
});
