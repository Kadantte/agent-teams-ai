import { supportedLocales } from "~/data/i18n";
import { useLocaleStore } from "~/stores/locale";

export const useLocation = () => {
  const nuxtApp = useNuxtApp();
  const i18n = nuxtApp.$i18n;
  const localeStore = useLocaleStore();
  const cookie = useCookie("i18n_redirected", { default: () => "" });

  const getBrowserLocale = () => {
    if (!process.client) return "en";
    const browserLocale = navigator.language || "en";
    const normalized = browserLocale.split("-")[0].toLowerCase();
    const supported = supportedLocales.map((item) => item.code);
    return supported.includes(normalized) ? normalized : "en";
  };

  const initLocale = () => {
    if (cookie.value) {
      localeStore.setLocale(cookie.value, false);
      if (i18n?.setLocale) {
        i18n.setLocale(cookie.value);
      } else if (i18n?.locale?.value) {
        i18n.locale.value = cookie.value;
      }
      return;
    }
    const detected = getBrowserLocale();
    localeStore.setLocale(detected, false);
    if (i18n?.setLocale) {
      i18n.setLocale(detected);
    } else if (i18n?.locale?.value) {
      i18n.locale.value = detected;
    }
    cookie.value = detected;
  };

  return { initLocale, getBrowserLocale };
};
