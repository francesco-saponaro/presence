import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  BottomSheetModal,
  BottomSheetScrollView,
  BottomSheetTextInput,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import Toast from "react-native-toast-message";
import {
  deleteContact,
  regenerateThemes,
  updateContact,
} from "@/lib/contactsSync";
import { useContactsStore, type Contact } from "@/store/contacts";
import { PillButton } from "./PillButton";

export interface ContactEditorSheetRef {
  open: (contact: Contact) => void;
  close: () => void;
}

interface Props {
  /** Total contact count in the store — used to disable Delete when this is the last one. */
  totalContacts: number;
}

interface FormState {
  id: string;
  /** Original snapshot at open time — used to detect what changed on Save. */
  initial: {
    name: string;
    howKnown: string;
    caresAbout: string;
    appreciate: string;
    wantToSay: string;
  };
  name: string;
  q1: string;
  q2: string;
  q3: string;
  q4: string;
  saving: boolean;
  regenerating: boolean;
}

const EMPTY: FormState = {
  id: "",
  initial: { name: "", howKnown: "", caresAbout: "", appreciate: "", wantToSay: "" },
  name: "",
  q1: "",
  q2: "",
  q3: "",
  q4: "",
  saving: false,
  regenerating: false,
};

function toFormState(c: Contact): FormState {
  return {
    id: c.id,
    initial: {
      name: c.name,
      howKnown: c.howKnown ?? "",
      caresAbout: c.caresAbout ?? "",
      appreciate: c.appreciate ?? "",
      wantToSay: c.wantToSay ?? "",
    },
    name: c.name,
    q1: c.howKnown ?? "",
    q2: c.caresAbout ?? "",
    q3: c.appreciate ?? "",
    q4: c.wantToSay ?? "",
    saving: false,
    regenerating: false,
  };
}

export const ContactEditorSheet = forwardRef<ContactEditorSheetRef, Props>(
  ({ totalContacts }, ref) => {
    const { t } = useTranslation();
    const insets = useSafeAreaInsets();
    const modalRef = useRef<BottomSheetModal>(null);
    const [form, setForm] = useState<FormState>(EMPTY);

    // Subscribe to live contact for the theme count badge so it updates after
    // a successful regenerate without needing to re-open the sheet.
    const liveContact = useContactsStore((s) =>
      s.contacts.find((c) => c.id === form.id),
    );
    const themeCount = liveContact?.themes.length ?? 0;

    useImperativeHandle(ref, () => ({
      open: (contact) => {
        setForm(toFormState(contact));
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

    const busy = form.saving || form.regenerating;

    function nameValid() {
      return form.name.trim().length > 0;
    }
    function q1Valid() {
      return form.q1.trim().length > 0;
    }
    function q2Valid() {
      return form.q2.trim().length > 0;
    }

    function answersChanged(): boolean {
      const a = form.initial;
      return (
        form.q1.trim() !== a.howKnown.trim() ||
        form.q2.trim() !== a.caresAbout.trim() ||
        form.q3.trim() !== a.appreciate.trim() ||
        form.q4.trim() !== a.wantToSay.trim()
      );
    }

    function nameChanged(): boolean {
      return form.name.trim() !== form.initial.name.trim();
    }

    async function handleSave() {
      if (!nameValid()) {
        Toast.show({
          type: "error",
          text1: t("profile.contactEditor.nameRequired"),
          visibilityTime: 2500,
        });
        return;
      }
      if (!q1Valid() || !q2Valid()) {
        Toast.show({
          type: "error",
          text1: t("profile.contactEditor.requiredFieldsMissing"),
          visibilityTime: 2500,
        });
        return;
      }

      const willRegenerate = answersChanged();
      const willUpdate = nameChanged() || willRegenerate;

      if (!willUpdate) {
        // Nothing changed — just close.
        modalRef.current?.dismiss();
        return;
      }

      setForm((f) => ({ ...f, saving: true }));
      try {
        await updateContact(form.id, {
          name: form.name,
          howKnown: form.q1,
          caresAbout: form.q2,
          appreciate: form.q3 || null,
          wantToSay: form.q4 || null,
        });

        if (willRegenerate) {
          setForm((f) => ({ ...f, saving: false, regenerating: true }));
          try {
            await regenerateThemes(form.id);
          } catch (err) {
            console.warn("[ContactEditorSheet] regenerate failed:", err);
            Toast.show({
              type: "error",
              text1: t("profile.contactEditor.regenerateError"),
              visibilityTime: 3500,
            });
            // Still close — the contact answers were saved.
          }
        }

        Toast.show({
          type: "success",
          text1: t("profile.contactEditor.savedSuccess", { name: form.name.trim() }),
          visibilityTime: 2500,
        });
        modalRef.current?.dismiss();
      } catch (err) {
        console.warn("[ContactEditorSheet] update failed:", err);
        Toast.show({
          type: "error",
          text1: t("common.error"),
          visibilityTime: 2500,
        });
      } finally {
        setForm((f) => ({ ...f, saving: false, regenerating: false }));
      }
    }

    async function handleRegenerateOnly() {
      if (!q1Valid() || !q2Valid()) {
        Toast.show({
          type: "error",
          text1: t("profile.contactEditor.requiredFieldsMissing"),
          visibilityTime: 2500,
        });
        return;
      }
      // If the user edited answers but hasn't saved them yet, persist first
      // so regenerate uses the latest text.
      if (answersChanged() || nameChanged()) {
        setForm((f) => ({ ...f, saving: true }));
        try {
          await updateContact(form.id, {
            name: form.name,
            howKnown: form.q1,
            caresAbout: form.q2,
            appreciate: form.q3 || null,
            wantToSay: form.q4 || null,
          });
        } finally {
          setForm((f) => ({ ...f, saving: false }));
        }
      }

      setForm((f) => ({ ...f, regenerating: true }));
      try {
        await regenerateThemes(form.id);
        Toast.show({
          type: "success",
          text1: t("profile.contactEditor.regenerateSuccess"),
          visibilityTime: 2500,
        });
      } catch (err) {
        console.warn("[ContactEditorSheet] regenerate failed:", err);
        Toast.show({
          type: "error",
          text1: t("profile.contactEditor.regenerateError"),
          visibilityTime: 3500,
        });
      } finally {
        setForm((f) => ({ ...f, regenerating: false }));
      }
    }

    function handleDelete() {
      if (totalContacts <= 1) {
        Toast.show({
          type: "info",
          text1: t("profile.contactEditor.minOneTitle"),
          text2: t("profile.contactEditor.minOneBody"),
          visibilityTime: 3500,
        });
        return;
      }
      Alert.alert(
        t("profile.contactEditor.deleteConfirmTitle", { name: form.name.trim() }),
        t("profile.contactEditor.deleteConfirmBody"),
        [
          { text: t("common.back"), style: "cancel" },
          {
            text: t("profile.contactEditor.deleteConfirmAction"),
            style: "destructive",
            onPress: () => {
              deleteContact(form.id);
              modalRef.current?.dismiss();
            },
          },
        ],
      );
    }

    return (
      <BottomSheetModal
        ref={modalRef}
        snapPoints={["92%"]}
        enablePanDownToClose={!busy}
        keyboardBehavior="extend"
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
          {/* Header */}
          <View className="flex-row items-center mb-3">
            <TouchableOpacity
              onPress={() => modalRef.current?.dismiss()}
              hitSlop={8}
              activeOpacity={0.6}
              disabled={busy}
            >
              <Ionicons name="close" size={22} color="#705E46" />
            </TouchableOpacity>
            <View className="flex-1 items-center">
              <Text className="font-serif-display text-lg text-text-dark">
                {t("profile.contactEditor.title")}
              </Text>
            </View>
            <TouchableOpacity
              onPress={handleDelete}
              hitSlop={8}
              activeOpacity={0.6}
              disabled={busy}
            >
              <Ionicons name="trash-outline" size={20} color="#705E46" />
            </TouchableOpacity>
          </View>

          {/* Scrollable form */}
          <BottomSheetScrollView
            style={{ flex: 1 }}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: 16 }}
          >
            {/* Avatar + name pill */}
            <View className="items-center mb-5">
              <View
                className="w-16 h-16 rounded-full items-center justify-center mb-2"
                style={{ backgroundColor: "rgba(214,181,136,0.25)" }}
              >
                <Text className="font-sans-bold text-2xl text-brown-dark">
                  {(form.name || "?")[0]?.toUpperCase()}
                </Text>
              </View>
              <Text className="font-sans-body text-xs text-greige text-center max-w-xs">
                {t("profile.contactEditor.subtitle")}
              </Text>
            </View>

            {/* Name field */}
            <FieldLabel label={t("profile.contactEditor.nameLabel")} required />
            <BottomSheetTextInput
              value={form.name}
              onChangeText={(v) => setForm((f) => ({ ...f, name: v }))}
              placeholder={t("onboarding.step6contacts.placeholder")}
              placeholderTextColor="#C6C0B9"
              editable={!busy}
              style={inputStyle(false)}
            />

            {/* Q1 */}
            <FieldLabel
              label={t("onboarding.step6contacts.q1Label", { name: form.name || "…" })}
              required
            />
            <BottomSheetTextInput
              value={form.q1}
              onChangeText={(v) => setForm((f) => ({ ...f, q1: v }))}
              placeholder={t("onboarding.step6contacts.q1Placeholder")}
              placeholderTextColor="#C6C0B9"
              multiline
              textAlignVertical="top"
              editable={!busy}
              style={inputStyle(true)}
            />

            {/* Q2 */}
            <FieldLabel
              label={t("onboarding.step6contacts.q2Label", { name: form.name || "…" })}
              required
            />
            <BottomSheetTextInput
              value={form.q2}
              onChangeText={(v) => setForm((f) => ({ ...f, q2: v }))}
              placeholder={t("onboarding.step6contacts.q2Placeholder")}
              placeholderTextColor="#C6C0B9"
              multiline
              textAlignVertical="top"
              editable={!busy}
              style={inputStyle(true)}
            />

            {/* Q3 */}
            <FieldLabel
              label={t("onboarding.step6contacts.q3Label", { name: form.name || "…" })}
            />
            <BottomSheetTextInput
              value={form.q3}
              onChangeText={(v) => setForm((f) => ({ ...f, q3: v }))}
              placeholder={t("onboarding.step6contacts.q3Placeholder")}
              placeholderTextColor="#C6C0B9"
              multiline
              textAlignVertical="top"
              editable={!busy}
              style={inputStyle(true)}
            />

            {/* Q4 */}
            <FieldLabel
              label={t("onboarding.step6contacts.q4Label", { name: form.name || "…" })}
            />
            <BottomSheetTextInput
              value={form.q4}
              onChangeText={(v) => setForm((f) => ({ ...f, q4: v }))}
              placeholder={t("onboarding.step6contacts.q4Placeholder")}
              placeholderTextColor="#C6C0B9"
              multiline
              textAlignVertical="top"
              editable={!busy}
              style={inputStyle(true)}
            />

            {/* Theme status + manual refresh */}
            <View
              className="mt-2 mb-1 px-4 py-3 rounded-2xl flex-row items-center"
              style={{ backgroundColor: "rgba(214,181,136,0.15)" }}
            >
              <Ionicons name="sparkles" size={16} color="#422701" />
              <Text className="flex-1 font-sans-medium text-sm text-brown-dark ml-2">
                {themeCount > 0
                  ? t("profile.contactEditor.themesStatusReady", { count: themeCount })
                  : t("profile.contactEditor.themesStatusEmpty")}
              </Text>
              <TouchableOpacity
                onPress={handleRegenerateOnly}
                disabled={busy}
                activeOpacity={0.7}
                hitSlop={6}
              >
                <Text
                  className={`font-sans-medium text-sm underline ${busy ? "text-greige" : "text-brown-mid"}`}
                >
                  {form.regenerating
                    ? t("profile.contactEditor.regenerating")
                    : t("profile.contactEditor.regenerateCta")}
                </Text>
              </TouchableOpacity>
            </View>
            <Text className="font-sans-body text-[11px] text-greige mt-1 mb-2 px-1">
              {t("profile.contactEditor.regenerateHint")}
            </Text>
          </BottomSheetScrollView>

          {/* Footer */}
          <View className="pt-3">
            {busy ? (
              <View className="flex-row items-center justify-center py-4 gap-2">
                <ActivityIndicator color="#705E46" />
                <Text className="font-sans-medium text-sm text-brown-mid">
                  {form.regenerating
                    ? t("profile.contactEditor.regenerating")
                    : t("profile.contactEditor.saving")}
                </Text>
              </View>
            ) : (
              <PillButton
                label={t("profile.contactEditor.save")}
                variant="primary"
                onPress={handleSave}
              />
            )}
          </View>
        </BottomSheetView>
      </BottomSheetModal>
    );
  },
);

ContactEditorSheet.displayName = "ContactEditorSheet";

// ── Local helpers ───────────────────────────────────────────────────────────

function FieldLabel({ label, required }: { label: string; required?: boolean }) {
  const { t } = useTranslation();
  return (
    <View className="flex-row items-baseline mt-4 mb-2">
      <Text className="font-sans-medium text-sm text-text-dark flex-1">{label}</Text>
      <Text
        className={`font-sans-medium text-[10px] tracking-widest uppercase ml-2 ${required ? "text-brown-dark" : "text-greige"}`}
      >
        {required
          ? t("onboarding.step6contacts.required")
          : t("onboarding.step6contacts.optional")}
      </Text>
    </View>
  );
}

function inputStyle(multiline: boolean) {
  return {
    backgroundColor: "#FAF7F2",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#C6C0B9",
    paddingHorizontal: 14,
    paddingVertical: multiline ? 12 : 10,
    fontFamily: "DMSans-Regular",
    fontSize: 15,
    lineHeight: 22,
    color: "#2A1800",
    minHeight: multiline ? 80 : undefined,
    maxHeight: multiline ? 140 : undefined,
  } as const;
}
