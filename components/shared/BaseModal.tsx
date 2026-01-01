import React, { useEffect, useState } from 'react';
import {
  Animated,
  Dimensions,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
  ViewStyle,
} from 'react-native';
import { useSafeAreaInsets, EdgeInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme';
import { useModalAnimation, SCREEN_HEIGHT } from '@/hooks/useModalAnimation';
import { usePanResponder } from '@/hooks/usePanResponder';
import { createTheme } from '@/theme/themes';

type ThemeType = ReturnType<typeof createTheme>;

export interface BaseModalProps {
  /** Whether the modal is visible */
  visible: boolean;
  /** Callback when modal should close */
  onClose: () => void;
  /** Modal content */
  children: React.ReactNode;
  /** Height as percentage of screen (0-1), default 0.9 */
  height?: number;
  /** Backdrop opacity (0-1), default 0.5 */
  backdropDarkness?: number;
  /** Show the drag handle at top, default true */
  showHandle?: boolean;
  /** Custom handle container style */
  handleContainerStyle?: ViewStyle;
  /** Test ID for the modal */
  testID?: string;
  /** Enable keyboard avoiding behavior, default false */
  avoidKeyboard?: boolean;
  /** Force modal to fill specified height instead of sizing to content, default false */
  fillHeight?: boolean;
}

/**
 * BaseModal - A reusable bottom sheet modal with swipe-to-dismiss.
 *
 * Provides consistent animation and gesture behavior across all modals.
 *
 * @example
 * ```tsx
 * <BaseModal visible={isOpen} onClose={handleClose}>
 *   <Text>Modal content here</Text>
 * </BaseModal>
 * ```
 */
export function BaseModal({
  visible,
  onClose,
  children,
  height = 0.9,
  backdropDarkness = 0.5,
  showHandle = true,
  handleContainerStyle,
  testID,
  avoidKeyboard = false,
  fillHeight = false,
}: BaseModalProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  const { slideAnim, backdropAnim, closeModal, snapBack } = useModalAnimation({
    visible,
    onCloseComplete: onClose,
  });

  const { panHandlers } = usePanResponder({
    slideAnim,
    onDismiss: closeModal,
    onSnapBack: snapBack,
  });

  // Track keyboard height for keyboard avoiding behavior
  useEffect(() => {
    if (!avoidKeyboard) return;

    const showListener = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => setKeyboardHeight(e.endCoordinates.height)
    );
    const hideListener = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setKeyboardHeight(0)
    );

    return () => {
      showListener.remove();
      hideListener.remove();
    };
  }, [avoidKeyboard]);

  const styles = createStyles(theme, insets, height, backdropDarkness, fillHeight);

  // Calculate bottom offset and max height when keyboard is visible
  const keyboardVisible = avoidKeyboard && keyboardHeight > 0;
  // Lift the modal fully above the keyboard
  const bottomOffset = keyboardVisible ? keyboardHeight : 0;

  // Reduce max height when keyboard is visible so content fits above keyboard
  const adjustedMaxHeight = keyboardVisible
    ? SCREEN_HEIGHT - keyboardHeight - insets.top - 20 // 20px padding from top
    : SCREEN_HEIGHT * height;

  const modalContent = (
    <Animated.View
      style={[
        styles.modalContent,
        {
          transform: [{ translateY: slideAnim }],
        },
        // Only apply keyboard adjustments when keyboard is actually visible
        keyboardVisible && {
          bottom: bottomOffset,
          maxHeight: adjustedMaxHeight,
        },
      ]}
      {...panHandlers}
    >
      {/* Handle bar */}
      {showHandle && (
        <TouchableOpacity
          style={[styles.handleContainer, handleContainerStyle]}
          onPress={onClose}
          activeOpacity={0.8}
        >
          <View style={styles.handle} />
        </TouchableOpacity>
      )}

      {/* Modal content */}
      {children}
    </Animated.View>
  );

  return (
    <Modal
      transparent
      visible={visible}
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
      testID={testID}
    >
      <View style={styles.container}>
        {/* Animated backdrop */}
        <Animated.View
          style={[
            styles.backdrop,
            { opacity: backdropAnim },
          ]}
        >
          <TouchableWithoutFeedback onPress={onClose}>
            <View style={StyleSheet.absoluteFillObject} />
          </TouchableWithoutFeedback>
        </Animated.View>

        {/* Animated content */}
        {modalContent}
      </View>
    </Modal>
  );
}

const createStyles = (
  theme: ThemeType,
  insets: EdgeInsets,
  height: number,
  backdropDarkness: number,
  fillHeight: boolean
) =>
  StyleSheet.create({
    container: {
      flex: 1,
    },
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: `rgba(0, 0, 0, ${backdropDarkness})`,
    },
    modalContent: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: theme.colors.background,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      ...(fillHeight ? { height: SCREEN_HEIGHT * height } : {}),
      maxHeight: SCREEN_HEIGHT * height,
      paddingBottom: insets.bottom,
    },
    handleContainer: {
      alignItems: 'center',
      paddingVertical: 8,
    },
    handle: {
      width: 40,
      height: 4,
      backgroundColor: theme.colors.surface5,
      borderRadius: 2,
    },
  });

export default BaseModal;
