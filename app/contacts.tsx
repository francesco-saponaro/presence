import { useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import Toast from "react-native-toast-message";
import { useContactsStore, type Contact } from "@/store/contacts";
import {
  ContactQuestionsSheet,
  type ContactQuestionsSheetRef,
} from "@/components/ui/ContactQuestionsSheet";
import {
  ContactEditorSheet,
  type ContactEditorSheetRef,
} from "@/components/ui/ContactEditorSheet";

export default function ContactsScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const contacts = useContactsStore((s) => s.contacts);

  const [inputValue, setInputValue] = useState("");
  const addSheetRef = useRef<ContactQuestionsSheetRef>(null);
  const editSheetRef = useRef<ContactEditorSheetRef>(null);

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
    addSheetRef.current?.open(name, { showPreview: false });
    setInputValue("");
  }

  function handleEdit(contact: Contact) {
    editSheetRef.current?.open(contact);
  }

  return (
    <SafeAreaView className="flex-1 bg-milk dark:bg-espresso">
      {/* Header */}
      <View className="px-6 pt-4 pb-2 flex-row items-center gap-3">
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.6} hitSlop={8}>
          <Ionicons name="chevron-back" size={22} color="#705E46" />
        </TouchableOpacity>
        <Text className="font-serif-display text-2xl text-text-dark dark:text-text-light flex-1">
          {t("profile.contactsPageTitle")}
        </Text>
      </View>

      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, paddingBottom: 24 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Intro copy */}
          <Text className="font-sans-body text-sm text-brown-mid dark:text-greige px-6 pt-2 pb-4 leading-relaxed">
            {t("profile.contactsPageIntro")}
          </Text>

          {/* Add row */}
          <View className="px-6 flex-row gap-3 mb-5">
            <TextInput
              value={inputValue}
              onChangeText={setInputValue}
              placeholder={t("onboarding.step6contacts.placeholder")}
              placeholderTextColor="#C6C0B9"
              returnKeyType="done"
              onSubmitEditing={handleAdd}
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

          {/* Empty state */}
          {contacts.length === 0 && (
            <View className="mx-6 mt-8 items-center">
              <View
                className="w-14 h-14 rounded-full items-center justify-center mb-3"
                style={{ backgroundColor: "rgba(214,181,136,0.2)" }}
              >
                <Ionicons name="people-outline" size={26} color="#705E46" />
              </View>
              <Text className="font-sans-body text-sm text-brown-mid dark:text-greige text-center px-6 leading-relaxed">
                {t("profile.contactsPageEmpty")}
              </Text>
            </View>
          )}

          {/* List */}
          <View className="px-6 gap-3">
            {contacts.map((contact) => {
              const themeCount = contact.themes.length;
              const themesReady = themeCount > 0;
              return (
                <TouchableOpacity
                  key={contact.id}
                  onPress={() => handleEdit(contact)}
                  activeOpacity={0.7}
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
                    className="w-10 h-10 rounded-full items-center justify-center mr-3"
                    style={{ backgroundColor: "rgba(214,181,136,0.25)" }}
                  >
                    <Text className="font-sans-bold text-base text-brown-dark dark:text-tan">
                      {contact.name[0]?.toUpperCase()}
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
                  <Ionicons name="chevron-forward" size={20} color="#C6C0B9" />
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Sheets */}
      <ContactQuestionsSheet ref={addSheetRef} />
      <ContactEditorSheet ref={editSheetRef} totalContacts={contacts.length} />
    </SafeAreaView>
  );
}
