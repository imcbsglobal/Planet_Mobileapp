import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated } from 'react-native';

export default function EyeLoader() {
  const pupilAnim1 = useRef(new Animated.Value(0)).current;
  const pupilAnim2 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animateEyes = () => {
      Animated.loop(
        Animated.sequence([
          // Position 1: top-left (35%, 35%)
          Animated.timing(pupilAnim1, {
            toValue: 0,
            duration: 330,
            useNativeDriver: true,
          }),
          Animated.delay(90),
          
          // Position 2: top-right (65%, 35%)
          Animated.timing(pupilAnim1, {
            toValue: 1,
            duration: 660,
            useNativeDriver: true,
          }),
          Animated.delay(60),
          
          // Position 3: bottom-right (65%, 65%)
          Animated.timing(pupilAnim1, {
            toValue: 2,
            duration: 750,
            useNativeDriver: true,
          }),
          Animated.delay(60),
          
          // Position 4: bottom-left (35%, 65%)
          Animated.timing(pupilAnim1, {
            toValue: 3,
            duration: 750,
            useNativeDriver: true,
          }),
          Animated.delay(60),
          
          // Back to Position 1
          Animated.timing(pupilAnim1, {
            toValue: 4,
            duration: 660,
            useNativeDriver: true,
          }),
          Animated.delay(360),
        ])
      ).start();

      // Second eye with same animation
      Animated.loop(
        Animated.sequence([
          Animated.timing(pupilAnim2, {
            toValue: 0,
            duration: 330,
            useNativeDriver: true,
          }),
          Animated.delay(90),
          Animated.timing(pupilAnim2, {
            toValue: 1,
            duration: 660,
            useNativeDriver: true,
          }),
          Animated.delay(60),
          Animated.timing(pupilAnim2, {
            toValue: 2,
            duration: 750,
            useNativeDriver: true,
          }),
          Animated.delay(60),
          Animated.timing(pupilAnim2, {
            toValue: 3,
            duration: 750,
            useNativeDriver: true,
          }),
          Animated.delay(60),
          Animated.timing(pupilAnim2, {
            toValue: 4,
            duration: 660,
            useNativeDriver: true,
          }),
          Animated.delay(360),
        ])
      ).start();
    };

    animateEyes();
  }, []);

  const getPupilPosition = (animValue: Animated.Value) => {
    const translateX = animValue.interpolate({
      inputRange: [0, 1, 2, 3, 4],
      outputRange: [-3, 3, 3, -3, -3],
    });

    const translateY = animValue.interpolate({
      inputRange: [0, 1, 2, 3, 4],
      outputRange: [-3, -3, 3, 3, -3],
    });

    return { translateX, translateY };
  };

  return (
    <View style={styles.container}>
      {/* Eye 1 */}
      <View style={styles.eye}>
        <Animated.View
          style={[
            styles.pupil,
            {
              transform: [
                { translateX: getPupilPosition(pupilAnim1).translateX },
                { translateY: getPupilPosition(pupilAnim1).translateY },
              ],
            },
          ]}
        />
      </View>

      {/* Eye 2 */}
      <View style={styles.eye}>
        <Animated.View
          style={[
            styles.pupil,
            {
              transform: [
                { translateX: getPupilPosition(pupilAnim2).translateX },
                { translateY: getPupilPosition(pupilAnim2).translateY },
              ],
            },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eye: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FEF8E7',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#F5C451',
  },
  pupil: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#1C1B17',
  },
});
