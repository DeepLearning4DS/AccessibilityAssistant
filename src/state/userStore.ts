import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type SupportedLanguage = "en-US" | "fr-FR" | "ar-SA";

export type UserProfile = {
  language: SupportedLanguage | null;
  firstName: string | null;
  lastName: string | null;
  age: number | null;
};

type UserState = {
  profile: UserProfile;
  isOnboarded: boolean;
  hydrated: boolean;
  setLanguage: (language: SupportedLanguage) => void;
  setFirstName: (firstName: string) => void;
  setLastName: (lastName: string) => void;
  setAge: (age: number) => void;
  setProfile: (profile: Partial<UserProfile>) => void;
  completeOnboarding: () => void;
  resetProfile: () => void;
};

const emptyProfile: UserProfile = {
  language: null,
  firstName: null,
  lastName: null,
  age: null,
};

export const useUserStore = create<UserState>()(
  persist(
    (set) => ({
      profile: emptyProfile,
      isOnboarded: false,
      hydrated: false,
      setLanguage: (language) =>
        set((state) => ({ profile: { ...state.profile, language } })),
      setFirstName: (firstName) =>
        set((state) => ({ profile: { ...state.profile, firstName } })),
      setLastName: (lastName) =>
        set((state) => ({ profile: { ...state.profile, lastName } })),
      setAge: (age) => set((state) => ({ profile: { ...state.profile, age } })),
      setProfile: (partial) =>
        set((state) => ({ profile: { ...state.profile, ...partial } })),
      completeOnboarding: () => set({ isOnboarded: true }),
      resetProfile: () => set({ profile: emptyProfile, isOnboarded: false }),
    }),
    {
      name: "@accessibility-assistant/user-profile-v1",
      storage: createJSONStorage(() => AsyncStorage),
      // Ne pas persister isOnboarded : à chaque cold start on repasse par le sign-in.
      partialize: (state) => ({
        profile: state.profile,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.hydrated = true;
          state.isOnboarded = false;
        }
      },
    },
  ),
);
