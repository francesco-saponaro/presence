import { useEffect, useRef, useState } from "react";
import {
  Alert,
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  Keyboard,
  Platform,
  useWindowDimensions,
  type LayoutChangeEvent,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import Toast from "react-native-toast-message";
import { useOnboardingStore } from "@/store/onboardingStore";
import { useContactsStore } from "@/store/contacts";
import { deleteContact } from "@/lib/contactsSync";
import {
  requestNotificationPermission,
  scheduleWarmupNotification,
} from "@/lib/notifications";
import { useRoutineStore } from "@/store/routine";
import { OnboardingProgress } from "@/components/ui/OnboardingProgress";
import { PillButton } from "@/components/ui/PillButton";
import {
  ContactQuestionsSheet,
  type ContactQuestionsSheetRef,
} from "@/components/ui/ContactQuestionsSheet";
import * as Notifications from "expo-notifications";

export default function Step6Contacts() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { height: screenHeight } = useWindowDimensions();
  const setCurrentStep = useOnboardingStore((s) => s.setCurrentStep);
  const contacts = useContactsStore((s) => s.contacts);

  const [inputValue, setInputValue] = useState("");
  const sheetRef = useRef<ContactQuestionsSheetRef>(null);

  // Manual keyboard handling. KeyboardAvoidingView creates an ugly empty
  // padding gap between the input and the keyboard (the padding *is* the
  // shrunken area — there's no content to paint there). Instead we:
  //   (1) track keyboard height via Keyboard events
  //   (2) extend the ScrollView contentContainer paddingBottom by that height
  //       so the ScrollView becomes scrollable past the natural content bottom
  //   (3) scrollTo a position that lifts the focused input above the keyboard
  //       with comfortable breathing room, while the contact list (below the
  //       input in DOM order) remains naturally visible in the lifted view
  // The Continue button is outside the ScrollView so it stays anchored and
  // simply hides behind the keyboard during typing.
  const scrollRef = useRef<ScrollView>(null);
  const inputRowYRef = useRef(0);
  const [kbHeight, setKbHeight] = useState(0);

  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow",
      (e) => setKbHeight(e.endCoordinates.height),
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide",
      () => setKbHeight(0),
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  function handleInputRowLayout(e: LayoutChangeEvent) {
    inputRowYRef.current = e.nativeEvent.layout.y;
  }

  function handleInputFocus() {
    // Defer a tick so the keyboard show event has fired (kbHeight populated)
    // and the contentContainer's expanded paddingBottom is in effect —
    // scrollTo gets clamped to the old content size otherwise.
    setTimeout(() => {
      // Target: input row sits ~MARGIN px above the keyboard top, not at the
      // top of the screen. Math:
      //   ScrollView starts at screen Y = insets.top + HEADER_HEIGHT
      //   Keyboard top at screen Y = screenHeight - kbHeight
      //   Visible scroll area above keyboard = keyboard_top - scrollview_top
      //   To put the input row's BOTTOM at (keyboard_top - MARGIN), the
      //   row's content offset must shift up by enough that:
      //     input_top_viewport_Y = visible_area_height - INPUT_HEIGHT - MARGIN
      //   i.e. scrollY = inputRowYRef.current - (visibleAreaHeight - INPUT_HEIGHT - MARGIN).
      const HEADER_HEIGHT = 40;
      const INPUT_HEIGHT = 50;
      const MARGIN = 24;
      const scrollViewTop = insets.top + HEADER_HEIGHT;
      const keyboardTop = screenHeight - kbHeight;
      const visibleAreaHeight = keyboardTop - scrollViewTop;
      const targetY = Math.max(
        0,
        inputRowYRef.current - visibleAreaHeight + INPUT_HEIGHT + MARGIN,
      );
      scrollRef.current?.scrollTo({ y: targetY, animated: true });
    }, 80);
  }

  function handleAdd() {
    const name = inputValue.trim();
    if (!name) return;
    if (contacts.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
      Toast.show({
        type: "info",
        text1: t("onboarding.step6contacts.duplicateName", { name }),
        visibilityTime: 2500,
      });
      return;
    }
    // Dismiss the name-input keyboard so it doesn't cover the questions sheet.
    Keyboard.dismiss();
    // First-contact-of-this-onboarding gets the celebratory theme preview.
    const showPreview = contacts.length === 0;
    // Onboarding can't be advanced with a theme-less contact: if theme
    // generation fails the partially-created row gets deleted on Cancel.
    sheetRef.current?.open(name, { showPreview, strictThemeGen: true });
    setInputValue("");
  }

  function handleRemove(id: string) {
    deleteContact(id);
  }

  function handleBack() {
    setCurrentStep(5);
    if (router.canGoBack()) router.back();
    else router.replace("/(onboarding)/step-4-goal");
  }

  function handleNext() {
    setCurrentStep(7);
    router.push("/(onboarding)/step-5-apps");
  }

  function handleContactAdded(name: string, themesReady: boolean) {
    // The preview screen replaces this celebration for the first contact —
    // only show the toast when the sheet closed without showing preview.
    if (!themesReady) {
      Toast.show({
        type: "info",
        text1: t("onboarding.step6contacts.contactAdded", { name }),
        text2: t("onboarding.step6contacts.themesMissing"),
        visibilityTime: 3500,
      });
      return;
    }
    // Avoid double-celebrating: if preview just showed, skip the toast.
    // For non-first contacts (no preview), show a small success toast.
    const isFirstContact = contacts.length <= 1; // contact was just added → length includes it
    if (!isFirstContact) {
      Toast.show({
        type: "success",
        text1: t("onboarding.step6contacts.contactAdded", { name }),
        visibilityTime: 2500,
      });
      return;
    }
    // First contact: this is the right moment to ask for notification permission —
    // we have someone to nudge them about. Pre-prompt with context so iOS doesn't
    // burn the one chance to show the system dialog on a cold "Allow notifications?"
    maybeAskForNotifications(name);
  }

  async function maybeAskForNotifications(contactName: string) {
    // Skip if already granted/denied at the OS level — iOS only shows the system
    // dialog when status is 'undetermined', so don't pre-prompt in other cases.
    const { status, canAskAgain } = await Notifications.getPermissionsAsync();
    if (status === "granted") return;
    if (!canAskAgain) return;

    Alert.alert(
      t("onboarding.step6contacts.notifPromptTitle"),
      t("onboarding.step6contacts.notifPromptBody", { name: contactName }),
      [
        { text: t("onboarding.step6contacts.notifPromptSkip"), style: "cancel" },
        {
          text: t("onboarding.step6contacts.notifPromptEnable"),
          onPress: async () => {
            const granted = await requestNotificationPermission();
            if (!granted) return;
            // If a routine is already set (user came back to add a contact, or
            // re-ordered the flow), re-schedule the warm-up so the body bakes
            // in the just-added contact via the rotation library.
            const { blockTimeUtc, frequency } = useRoutineStore.getState();
            if (blockTimeUtc && frequency) {
              scheduleWarmupNotification(blockTimeUtc, frequency).catch(() => {});
            }
          },
        },
      ],
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-milk dark:bg-espresso">
      <View className="px-6 pt-4 flex-row items-center gap-3">
        <TouchableOpacity onPress={handleBack} activeOpacity={0.6} hitSlop={8}>
          <Ionicons name="chevron-back" size={22} color="#705E46" />
        </TouchableOpacity>
        <View className="flex-1">
          <OnboardingProgress current={6} total={8} />
        </View>
      </View>

      {/* See the keyboard-handling block at the top of the component for the
          rationale. The ScrollView gets an extra `kbHeight` of paddingBottom
          while the keyboard is open so it can scroll past its natural content
          end, and handleInputFocus does the manual scrollTo that lifts the
          input above the keyboard. */}
      <View className="flex-1">
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={{ flexGrow: 1, paddingBottom: 24 + kbHeight }}
          scrollIndicatorInsets={{ bottom: kbHeight }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          {/* Header */}
          <View className="px-6 pt-6 pb-4">
            <Text className="font-sans-medium text-xs tracking-widest text-greige uppercase mb-2">
              {t("onboarding.step6contacts.label")}
            </Text>
            <Text className="font-serif-display text-3xl text-text-dark dark:text-text-light leading-snug mb-2">
              {t("onboarding.step6contacts.title")}
            </Text>
            <Text className="font-sans-body text-sm text-brown-mid dark:text-greige leading-relaxed">
              {t("onboarding.step6contacts.subtitle")}
            </Text>
          </View>

          {/* Primary info callout — screenshot validation */}
          <View className="mx-6 mb-3 bg-tan/15 dark:bg-tan/10 rounded-2xl px-4 py-3 border border-tan/40">
            <Text className="font-sans-body text-xs text-brown-dark dark:text-tan leading-relaxed">
              {t("onboarding.step6contacts.ocrNote")}
            </Text>
          </View>

          {/* Prominent name-match warning — the spelling rule is easy to miss
              and breaks verification when wrong, so it gets its own boxed-out
              callout with an icon and bolder text on both this screen and the
              profile /contacts page. */}
          <View
            className="mx-6 mb-4 rounded-2xl px-4 py-4 flex-row items-start"
            style={{ backgroundColor: "#422701" }}
          >
            <Ionicons name="information-circle" size={22} color="#FDFBF7" />
            <View className="flex-1 ml-3">
              <Text className="font-sans-bold text-sm text-text-light mb-1">
                {t("common.nameMatchWarningTitle")}
              </Text>
              <Text className="font-sans-medium text-sm text-text-light leading-relaxed">
                {t("common.nameMatchWarning")}
              </Text>
            </View>
          </View>

          {/* Secondary hint — can change later */}
          <View className="mx-6 mb-5 bg-surface-light dark:bg-surface-dark rounded-2xl px-4 py-3 border border-greige/40 dark:border-brown-mid/40">
            <Text className="font-sans-body text-xs text-brown-mid dark:text-greige leading-relaxed">
              {t("onboarding.step6contacts.changeLater")}
            </Text>
          </View>

          {/* General usage hint */}
          <Text className="font-sans-body text-xs text-greige dark:text-brown-mid text-center px-8 mb-4 leading-relaxed">
            {t("onboarding.step6contacts.hint")}
          </Text>

          {/* Input row — onLayout captures its Y position in the ScrollView
              content so handleInputFocus can scrollTo a target that places
              the input ~80px below the visible top when the keyboard opens. */}
          <View
            className="px-6 flex-row gap-3 mb-5"
            onLayout={handleInputRowLayout}
          >
            <TextInput
              value={inputValue}
              onChangeText={setInputValue}
              placeholder={t("onboarding.step6contacts.placeholder")}
              placeholderTextColor="#C6C0B9"
              returnKeyType="done"
              onSubmitEditing={handleAdd}
              onFocus={handleInputFocus}
              className="flex-1 bg-surface-light dark:bg-surface-dark font-sans-body text-sm text-text-dark dark:text-text-light rounded-2xl px-4 py-3 border border-greige dark:border-brown-mid"
            />
            <TouchableOpacity
              onPress={handleAdd}
              disabled={!inputValue.trim()}
              activeOpacity={0.8}
              className="rounded-2xl px-5 items-center justify-center"
              style={{ backgroundColor: !inputValue.trim() ? "#C6C0B9" : "#422701" }}
            >
              <Text className="font-sans-bold text-sm text-white">
                {t("onboarding.step6contacts.add")}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Contact list */}
          <View className="px-6 gap-3">
            {contacts.map((contact) => {
              const themeCount = contact.themes.length;
              const themesReady = themeCount > 0;
              return (
                <View
                  key={contact.id}
                  className="flex-row items-center bg-surface-light dark:bg-surface-dark rounded-2xl px-4 py-3 border border-greige/60 dark:border-brown-mid/60"
                  style={{
                    shadowColor: "#422701",
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.05,
                    shadowRadius: 6,
                    elevation: 2,
                  }}
                >
                  <View
                    className="w-9 h-9 rounded-full items-center justify-center mr-3"
                    style={{ backgroundColor: "rgba(214,181,136,0.25)" }}
                  >
                    <Text className="font-sans-bold text-sm text-brown-dark dark:text-tan">
                      {contact.name[0].toUpperCase()}
                    </Text>
                  </View>
                  <View className="flex-1">
                    <Text className="font-sans-medium text-base text-text-dark dark:text-text-light">
                      {contact.name}
                    </Text>
                    <View className="flex-row items-center mt-0.5">
                      <Ionicons
                        name={themesReady ? "sparkles" : "alert-circle-outline"}
                        size={12}
                        color={themesReady ? "#705E46" : "#C6C0B9"}
                      />
                      <Text
                        className={`font-sans-body text-xs ml-1 ${themesReady ? "text-brown-mid dark:text-greige" : "text-greige"}`}
                      >
                        {themesReady
                          ? t("onboarding.step6contacts.themesReady", { count: themeCount })
                          : t("onboarding.step6contacts.themesMissing")}
                      </Text>
                    </View>
                  </View>
                  <TouchableOpacity onPress={() => handleRemove(contact.id)} hitSlop={8} activeOpacity={0.7}>
                    <Ionicons name="close-circle" size={22} color="#C6C0B9" />
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        </ScrollView>
      </View>

      {/* CTA — sibling of the ScrollView wrapper, so it stays anchored at the
          bottom of the screen when the keyboard opens (hidden behind it
          during typing, visible again on dismiss). */}
      <View
        className="px-6 pt-4 border-t border-surface-light dark:border-surface-dark"
        style={{ paddingBottom: Math.max(insets.bottom, 24) }}
      >
        {contacts.length === 0 && (
          <Text className="font-sans-body text-xs text-greige text-center mb-3">
            {t("onboarding.step6contacts.empty")}
          </Text>
        )}
        <PillButton
          label={t("common.continue")}
          variant="primary"
          disabled={contacts.length === 0}
          onPress={handleNext}
        />
      </View>

      <ContactQuestionsSheet ref={sheetRef} onAdded={handleContactAdded} />
    </SafeAreaView>
  );
}
