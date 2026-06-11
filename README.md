# Accessibility AI Assistant (Expo)

Premium accessibility-focused React Native prototype for visually impaired users.

## Features in this demo

- Onboarding voice introduction on launch.
- Live camera background on all screens.
- Global gestures:
  - Double tap: repeats last assistant message.
  - Long press: enters listening mode.
  - Swipe left/right: changes active module and navigates.
  - Swipe down: toggles short responses.
- Voice feedback (`expo-speech`) and haptic feedback (`expo-haptics`) for every gesture.
- Seven interactive module screens with realistic mocked AI outputs.
- Animated microphone, glowing hold-to-speak button, and fade transitions.

## Tech stack

- React Native + Expo
- Expo Router
- TypeScript
- expo-camera
- expo-speech
- react-native-gesture-handler
- react-native-reanimated
- expo-haptics
- expo-linear-gradient

## Install and run

```bash
npm install
npx expo start
```

## Test on iPhone (Expo Go)

1. Install **Expo Go** from the App Store.
2. Connect iPhone and Mac to the same Wi-Fi network.
3. Run:

```bash
npx expo start
```

4. Scan the QR code from Terminal with iPhone camera (or from Expo Go scanner).
5. Grant camera and microphone permissions on first launch.

## Gesture test plan

- On onboarding screen, wait for intro speech.
- Double tap anywhere: hear repeat confirmation + previous message.
- Long press anywhere (or hold button): hear "Listening." and animated waves.
- Swipe left/right: moves to next/previous module with spoken module activation.
- Swipe down: toggles concise responses and announces mode change.
