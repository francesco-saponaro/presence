import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Keyboard,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  BottomSheetModal,
  BottomSheetTextInput,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import Toast from "react-native-toast-message";
import {
  capitaliseFirst,
  composeThemeWithName,
  createContact,
  deleteContact,
  regenerateThemes,
} from "@/lib/contactsSync";
import type { ContactTheme } from "@/store/contacts";
import { PillButton } from "./PillButton";

export interface ContactQuestionsSheetRef {
  /**
   * Open the sheet for a brand-new contact.
   * @param forName        The name the user typed on the contacts screen.
   * @param opts.showPreview  When true, after themes generate the sheet shows
   *                          a celebration preview (used for the very first
   *                          contact of the onboarding flow).
   * @param opts.strictThemeGen  When true, theme generation must succeed for
   *                             the contact to be saved. Failure shows a
   *                             prominent toast and offers Retry/Cancel —
   *                             Cancel deletes the partially-created contact
   *                             so the user can't advance past onboarding
   *                             with a theme-less contact. When false
   *                             (default, for profile add), the user can
   *                             "Save without prompts" and retry later.
   */
  open: (
    forName: string,
    opts?: { showPreview?: boolean; strictThemeGen?: boolean },
  ) => void;
  close: () => void;
}

interface Props {
  /** Fires after the sheet successfully creates the contact (with or without
   *  generated themes) and is about to dismiss. */
  onAdded?: (name: string, themesReady: boolean) => void;
}

type Step = "q1" | "q2" | "q3" | "q4" | "loading" | "preview" | "error";

interface SheetState {
  name: string;
  step: Step;
  showPreview: boolean;
  strictThemeGen: boolean;
  /** Set after createContact succeeds. Used so a retry skips re-creating the
   *  row, and so Cancel can delete it in strict mode. */
  pendingContactId: string | null;
  q1: string;
  q2: string;
  q3: string;
  q4: string;
  generatedThemes: ContactTheme[] | null;
}

const INITIAL: SheetState = {
  name: "",
  step: "q1",
  showPreview: false,
  strictThemeGen: false,
  pendingContactId: null,
  q1: "",
  q2: "",
  q3: "",
  q4: "",
  generatedThemes: null,
};

const TOTAL_STEPS = 4;

function stepNumber(step: Step): number {
  if (step === "q1") return 1;
  if (step === "q2") return 2;
  if (step === "q3") return 3;
  return 4;
}

export const ContactQuestionsSheet = forwardRef<ContactQuestionsSheetRef, Props>(
  ({ onAdded }, ref) => {
    const { t } = useTranslation();
    const insets = useSafeAreaInsets();
    const { height: screenHeight } = useWindowDimensions();
    // 12% top gap (was "88%" snap). With snapPoints=["100%"] + this inset,
    // the sheet fills (screen − 12%) — same visible size, hard top ceiling
    // so the keyboard can't shove the sheet upward.
    const sheetTopInset = Math.floor(screenHeight * 0.12);
    const modalRef = useRef<BottomSheetModal>(null);
    const [state, setState] = useState<SheetState>(INITIAL);

    // Bumped on each open() and submit() so in-flight theme-gen results that
    // resolve after the user dismissed or restarted are ignored.
    const submitIdRef = useRef(0);

    useImperativeHandle(ref, () => ({
      open: (name, opts) => {
        submitIdRef.current += 1;
        setState({
          ...INITIAL,
          name,
          showPreview: !!opts?.showPreview,
          strictThemeGen: !!opts?.strictThemeGen,
        });
        modalRef.current?.present();
      },
      close: () => modalRef.current?.dismiss(),
    }));

    const renderBackdrop = useCallback(
      (props: BottomSheetBackdropProps) => (
        <BottomSheetBackdrop
          {...props}
          appearsOnIndex={0}
          disappearsOnIndex={-1}
          opacity={0.45}
          pressBehavior="close"
        />
      ),
      [],
    );

    function setStep(step: Step) {
      setState((s) => ({ ...s, step }));
    }

    function next() {
      if (state.step === "q1") setStep("q2");
      else if (state.step === "q2") setStep("q3");
      else if (state.step === "q3") setStep("q4");
      else if (state.step === "q4") void submit();
    }

    function back() {
      if (state.step === "q1") {
        modalRef.current?.dismiss();
      } else if (state.step === "q2") setStep("q1");
      else if (state.step === "q3") setStep("q2");
      else if (state.step === "q4") setStep("q3");
      else if (state.step === "error") setStep("q4");
    }

    function skip() {
      if (state.step === "q3") {
        setState((s) => ({ ...s, q3: "", step: "q4" }));
      } else if (state.step === "q4") {
        setState((s) => ({ ...s, q4: "" }));
        // Defer to next tick so the state change flushes before submit reads
        // it back via the closure.
        setTimeout(() => void submit({ q4Override: "" }), 0);
      }
    }

    async function submit(opts?: { q4Override?: string }) {
      // Drop the keyboard before flipping to the loading screen — otherwise
      // the sheet stays sized for the open-keyboard layout and the centered
      // spinner ends up cramped against the top of the visible area.
      Keyboard.dismiss();
      const myId = ++submitIdRef.current;
      const snapshot = {
        name: state.name,
        q1: state.q1.trim(),
        q2: state.q2.trim(),
        q3: state.q3.trim() || null,
        q4: (opts?.q4Override ?? state.q4).trim() || null,
        showPreview: state.showPreview,
      };
      setStep("loading");

      try {
        // First submit creates the contact. Retries (state.pendingContactId
        // already set) skip creation and re-run generation on the same row.
        let contactId = state.pendingContactId;
        if (!contactId) {
          const contact = await createContact({
            name: snapshot.name,
            howKnown: snapshot.q1,
            caresAbout: snapshot.q2,
            appreciate: snapshot.q3,
            wantToSay: snapshot.q4,
          });
          if (submitIdRef.current !== myId) return;
          contactId = contact.id;
          setState((s) => ({ ...s, pendingContactId: contactId }));
        }

        const themes = await regenerateThemes(contactId);

        if (submitIdRef.current !== myId) return;

        if (snapshot.showPreview && themes.length > 0) {
          setState((s) => ({ ...s, step: "preview", generatedThemes: themes }));
        } else {
          finishAndClose(true);
        }
      } catch (err) {
        if (submitIdRef.current !== myId) return;
        console.warn("[ContactQuestionsSheet] theme generation failed:", err);
        // Prominent failure toast so the user can't miss it, in addition to
        // the in-sheet error UI.
        Toast.show({
          type: "prominent",
          text1: t("onboarding.step6contacts.errorTitle"),
          text2: t("onboarding.step6contacts.errorToastBody", { name: state.name }),
          visibilityTime: 5000,
          position: "top",
        });
        setStep("error");
      }
    }

    function finishAndClose(themesReady: boolean) {
      onAdded?.(state.name, themesReady);
      modalRef.current?.dismiss();
    }

    /** Strict-mode "Cancel" from the error step: delete the partially-created
     *  contact so the onboarding gate stays at zero contacts and the user
     *  can't advance with a theme-less row. */
    function handleStrictCancel() {
      submitIdRef.current += 1;
      if (state.pendingContactId) {
        deleteContact(state.pendingContactId).catch(() => {});
      }
      modalRef.current?.dismiss();
    }

    // ── Render helpers ────────────────────────────────────────────────────

    function renderHeader() {
      if (state.step === "loading" || state.step === "preview") return null;
      return (
        <View className="flex-row items-center mb-5">
          <TouchableOpacity onPress={back} hitSlop={8} activeOpacity={0.6}>
            <Ionicons
              name={state.step === "q1" ? "close" : "chevron-back"}
              size={22}
              color="#705E46"
            />
          </TouchableOpacity>
          <View className="flex-1" />
          {state.step !== "error" && (
            <Text className="font-sans-medium text-[11px] text-greige tracking-widest uppercase">
              {t("onboarding.step6contacts.sheetStepOf", {
                current: stepNumber(state.step),
                total: TOTAL_STEPS,
              })}
            </Text>
          )}
        </View>
      );
    }

    function renderQuestion(
      qKey: "q1" | "q2" | "q3" | "q4",
      required: boolean,
      label: string,
      hint: string,
      placeholder: string,
    ) {
      const value =
        qKey === "q1" ? state.q1 :
        qKey === "q2" ? state.q2 :
        qKey === "q3" ? state.q3 : state.q4;

      return (
        <View className="flex-1">
          <View className="flex-row items-start mb-3 gap-3">
            <Text className="font-serif-display text-2xl text-text-dark flex-1 leading-snug">
              {label}
            </Text>
            <View
              className={
                required
                  ? "px-2.5 py-1 rounded-full bg-brown-dark mt-1"
                  : "px-2.5 py-1 rounded-full border border-greige mt-1"
              }
            >
              <Text
                className={
                  required
                    ? "font-sans-medium text-[10px] tracking-widest uppercase text-white"
                    : "font-sans-medium text-[10px] tracking-widest uppercase text-brown-mid"
                }
              >
                {required
                  ? t("onboarding.step6contacts.required")
                  : t("onboarding.step6contacts.optional")}
              </Text>
            </View>
          </View>
          <Text className="font-sans-body text-sm text-brown-mid mb-4 leading-relaxed">
            {hint}
          </Text>
          <BottomSheetTextInput
            value={value}
            onChangeText={(v) =>
              setState((s) => ({ ...s, [qKey]: v } as SheetState))
            }
            placeholder={placeholder}
            placeholderTextColor="#C6C0B9"
            multiline
            textAlignVertical="top"
            style={{
              flex: 1,
              backgroundColor: "#FAF7F2",
              borderRadius: 16,
              borderWidth: 1,
              borderColor: "#C6C0B9",
              paddingHorizontal: 14,
              paddingVertical: 12,
              fontFamily: "DMSans-Regular",
              fontSize: 15,
              lineHeight: 22,
              color: "#2A1800",
              maxHeight: 180,
              minHeight: 80,
            }}
          />
        </View>
      );
    }

    function renderBody() {
      switch (state.step) {
        case "q1":
          return renderQuestion(
            "q1",
            true,
            t("onboarding.step6contacts.q1Label", { name: state.name }),
            t("onboarding.step6contacts.q1Hint"),
            t("onboarding.step6contacts.q1Placeholder"),
          );
        case "q2":
          return renderQuestion(
            "q2",
            true,
            t("onboarding.step6contacts.q2Label", { name: state.name }),
            t("onboarding.step6contacts.q2Hint"),
            t("onboarding.step6contacts.q2Placeholder"),
          );
        case "q3":
          return renderQuestion(
            "q3",
            false,
            t("onboarding.step6contacts.q3Label", { name: state.name }),
            t("onboarding.step6contacts.q3Hint"),
            t("onboarding.step6contacts.q3Placeholder"),
          );
        case "q4":
          return renderQuestion(
            "q4",
            false,
            t("onboarding.step6contacts.q4Label", { name: state.name }),
            t("onboarding.step6contacts.q4Hint"),
            t("onboarding.step6contacts.q4Placeholder"),
          );
        case "loading":
          return (
            <View className="flex-1 items-center justify-center px-6">
              {/* Concentric sparkles disc — softer than a bare spinner and
                  hints at "AI is writing" without being a generic loader. */}
              <View
                className="w-24 h-24 rounded-full items-center justify-center mb-8"
                style={{ backgroundColor: "rgba(214,181,136,0.18)" }}
              >
                <View
                  className="w-16 h-16 rounded-full items-center justify-center"
                  style={{ backgroundColor: "rgba(214,181,136,0.4)" }}
                >
                  <Ionicons name="sparkles" size={28} color="#422701" />
                </View>
              </View>
              <Text className="font-serif-display text-2xl text-text-dark text-center mb-3 leading-snug">
                {t("onboarding.step6contacts.generatingTitle", { name: state.name })}
              </Text>
              <Text className="font-sans-body text-sm text-brown-mid text-center mb-8 leading-relaxed">
                {t("onboarding.step6contacts.generatingBody")}
              </Text>
              <ActivityIndicator color="#705E46" />
            </View>
          );
        case "preview": {
          const firstTheme = state.generatedThemes?.[0];
          const themeLine = firstTheme
            ? capitaliseFirst(composeThemeWithName(firstTheme.themeText, state.name))
            : "";
          return (
            <View className="flex-1 items-center justify-center">
              <View className="w-16 h-16 rounded-full bg-tan/30 items-center justify-center mb-6">
                <Ionicons name="sparkles" size={28} color="#422701" />
              </View>
              <Text className="font-serif-display text-4xl text-text-dark text-center mb-3">
                {t("onboarding.step6contacts.previewTitle")}
              </Text>
              <Text className="font-sans-body text-sm text-brown-mid text-center mb-6 px-2">
                {t("onboarding.step6contacts.previewBody")}
              </Text>
              <View
                className="self-stretch rounded-2xl bg-milk border border-tan/50 px-5 py-5 mb-6"
                style={{
                  shadowColor: "#422701",
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.08,
                  shadowRadius: 14,
                  elevation: 2,
                }}
              >
                <Text className="font-serif-display text-xl text-text-dark text-center leading-snug">
                  &ldquo;{themeLine}&rdquo;
                </Text>
              </View>
              <Text className="font-sans-body text-xs text-greige text-center px-4">
                {t("onboarding.step6contacts.previewFooter")}
              </Text>
            </View>
          );
        }
        case "error":
          return (
            <View className="flex-1 items-center justify-center">
              <View className="w-14 h-14 rounded-full bg-greige/30 items-center justify-center mb-5">
                <Ionicons name="cloud-offline-outline" size={28} color="#705E46" />
              </View>
              <Text className="font-serif-display text-2xl text-text-dark text-center mb-3">
                {t("onboarding.step6contacts.errorTitle")}
              </Text>
              <Text className="font-sans-body text-sm text-brown-mid text-center px-6">
                {state.strictThemeGen
                  ? t("onboarding.step6contacts.errorBodyStrict", { name: state.name })
                  : t("onboarding.step6contacts.errorBody", { name: state.name })}
              </Text>
            </View>
          );
      }
    }

    function renderFooter() {
      switch (state.step) {
        case "q1":
          return (
            <PillButton
              label={t("common.continue")}
              variant="primary"
              disabled={!state.q1.trim()}
              onPress={next}
            />
          );
        case "q2":
          return (
            <PillButton
              label={t("common.continue")}
              variant="primary"
              disabled={!state.q2.trim()}
              onPress={next}
            />
          );
        case "q3":
          return (
            <View className="gap-2">
              <PillButton
                label={t("common.continue")}
                variant="primary"
                onPress={next}
              />
              <PillButton
                label={t("onboarding.step6contacts.skip")}
                variant="ghost"
                onPress={skip}
              />
            </View>
          );
        case "q4":
          return (
            <View className="gap-2">
              <PillButton
                label={t("common.continue")}
                variant="primary"
                onPress={next}
              />
              <PillButton
                label={t("onboarding.step6contacts.skip")}
                variant="ghost"
                onPress={skip}
              />
            </View>
          );
        case "loading":
          return null;
        case "preview":
          return (
            <PillButton
              label={t("onboarding.step6contacts.previewDone")}
              variant="primary"
              onPress={() => finishAndClose(true)}
            />
          );
        case "error":
          return (
            <View className="gap-2">
              <PillButton
                label={t("onboarding.step6contacts.errorRetry")}
                variant="primary"
                onPress={() => void submit()}
              />
              {state.strictThemeGen ? (
                <PillButton
                  label={t("onboarding.step6contacts.errorCancel")}
                  variant="ghost"
                  onPress={handleStrictCancel}
                />
              ) : (
                <PillButton
                  label={t("onboarding.step6contacts.errorSkip")}
                  variant="ghost"
                  onPress={() => finishAndClose(false)}
                />
              )}
            </View>
          );
      }
    }

    return (
      <BottomSheetModal
        ref={modalRef}
        snapPoints={["100%"]}
        topInset={sheetTopInset}
        enablePanDownToClose={state.step !== "loading"}
        enableOverDrag={false}
        enableContentPanningGesture={false}
        keyboardBlurBehavior="restore"
        android_keyboardInputMode="adjustResize"
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: "#EBE6DF" }}
        handleIndicatorStyle={{ backgroundColor: "#C6C0B9" }}
      >
        <BottomSheetView
          style={{
            flex: 1,
            paddingHorizontal: 24,
            paddingTop: 4,
            paddingBottom: Math.max(insets.bottom, 16) + 8,
          }}
        >
          {renderHeader()}
          <View style={{ flex: 1 }}>{renderBody()}</View>
          {renderFooter() && <View className="mt-4">{renderFooter()}</View>}
        </BottomSheetView>
      </BottomSheetModal>
    );
  },
);

ContactQuestionsSheet.displayName = "ContactQuestionsSheet";
