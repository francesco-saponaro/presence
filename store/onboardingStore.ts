import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { storage } from "@/lib/storage";

// Steps 1-7 map to the 7 onboarding screens.
// currentStep tracks the furthest step reached so the user
// can resume if they background the app mid-onboarding.
interface OnboardingState {
  isOnboardingComplete: boolean;
  currentStep: number; // 1–7
  surveyAnswer: string | null; // step 1 answer
  _hasHydrated: boolean;
  setCurrentStep: (step: number) => void;
  setSurveyAnswer: (answer: string) => void;
  completeOnboarding: () => void;
  resetOnboarding: () => void;
  setHasHydrated: (val: boolean) => void;
}

export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set) => ({
      isOnboardingComplete: false,
      currentStep: 1,
      surveyAnswer: null,
      _hasHydrated: false,
      setCurrentStep: (step) => set({ currentStep: step }),
      setSurveyAnswer: (answer) => set({ surveyAnswer: answer }),
      completeOnboarding: () => set({ isOnboardingComplete: true, currentStep: 7 }),
      resetOnboarding: () =>
        set({ isOnboardingComplete: false, currentStep: 1, surveyAnswer: null }),
      setHasHydrated: (val) => set({ _hasHydrated: val }),
    }),
    {
      name: "presence-onboarding",
      storage: createJSONStorage(() => storage),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);
