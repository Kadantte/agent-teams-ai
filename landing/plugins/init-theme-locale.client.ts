export default defineNuxtPlugin({
  name: "init-theme-locale",
  dependsOn: ["vuetify"],
  setup(nuxtApp) {
    const { initTheme } = useBrowserTheme();
    const { initLocale } = useLocation();

    initTheme();

    nuxtApp.hook("app:mounted", () => {
      initTheme();
      initLocale();
    });
  }
});
