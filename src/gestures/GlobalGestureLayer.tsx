import React, { PropsWithChildren, useMemo } from "react";
import { usePathname, useRouter } from "expo-router";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { View } from "react-native";
import { runOnJS } from "react-native-reanimated";

import { MODULES } from "../constants/modules";
import { hapticsManager } from "../services/hapticsManager";
import { voiceManager } from "../services/voiceManager";
import { useAssistant } from "../state/AssistantContext";
import { useUserStore } from "../state/userStore";

export function GlobalGestureLayer({ children }: PropsWithChildren) {
  const router = useRouter();
  const pathname = usePathname();
  const isOnboarded = useUserStore((state) => state.isOnboarded);
  const { goNextModule, goPreviousModule, toggleShortResponses, setListening } =
    useAssistant();

  const isOnboardingActive = pathname === "/" || !isOnboarded;

  const announceAndNavigate = (index: number) => {
    const module = MODULES[index];
    hapticsManager.medium();
    router.replace(`/modules/${module.id}`);
  };

  const onSwipeLeft = () => {
    if (isOnboardingActive) return;
    announceAndNavigate(goNextModule());
  };

  const onSwipeRight = () => {
    if (isOnboardingActive) return;
    announceAndNavigate(goPreviousModule());
  };

  const onSwipeDown = () => {
    if (isOnboardingActive) return;
    hapticsManager.light();
    const shortEnabled = toggleShortResponses();
    voiceManager.speak(shortEnabled ? "Short responses enabled." : "Detailed responses enabled.");
  };

  const onLongPressStart = () => {
    if (isOnboardingActive) return;
    hapticsManager.success();
    setListening(true);
    voiceManager.speak("Listening.");
  };

  const onLongPressEnd = () => {
    if (isOnboardingActive) return;
    setListening(false);
  };

  const onDoubleTap = () => {
    if (isOnboardingActive) return;
    hapticsManager.light();
    voiceManager.repeatLastMessage("Repeating last message.");
  };

  const gesture = useMemo(() => {
    const pan = Gesture.Pan().onEnd((event) => {
      if (isOnboardingActive) return;
      const horizontal = Math.abs(event.translationX) > Math.abs(event.translationY);
      if (horizontal && event.translationX < -70) {
        runOnJS(onSwipeLeft)();
      } else if (horizontal && event.translationX > 70) {
        runOnJS(onSwipeRight)();
      } else if (!horizontal && event.translationY > 70) {
        runOnJS(onSwipeDown)();
      }
    });

    const doubleTap = Gesture.Tap().numberOfTaps(2).onEnd(() => {
      if (isOnboardingActive) return;
      runOnJS(onDoubleTap)();
    });

    const longPress = Gesture.LongPress()
      .minDuration(550)
      .onStart(() => {
        if (isOnboardingActive) return;
        runOnJS(onLongPressStart)();
      })
      .onFinalize(() => {
        if (isOnboardingActive) return;
        runOnJS(onLongPressEnd)();
      });

    return Gesture.Simultaneous(pan, doubleTap, longPress);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnboardingActive, pathname]);

  return (
    <GestureDetector gesture={gesture}>
      <View style={{ flex: 1 }}>{children}</View>
    </GestureDetector>
  );
}
