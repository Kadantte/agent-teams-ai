<script setup lang="ts">
import robotLeadLounge from "~/assets/images/footer/robot-lead-lounge-v1.webp";

const { t, locale } = useI18n();
const { repoUrl } = useGithubRepo();
const { baseURL } = useRuntimeConfig().app;
const year = new Date().getFullYear();
const docsHref = computed(() => {
  const base = baseURL.replace(/\/?$/, '/');
  return `${base}${locale.value === 'ru' ? 'docs/ru/' : 'docs/'}`;
});
</script>

<template>
  <footer class="app-footer">
    <div class="app-footer__robot-stage">
      <span class="app-footer__robot-bubble">
        <svg
          class="app-footer__robot-bubble-shape"
          viewBox="0 0 92 62"
          aria-hidden="true"
          focusable="false"
        >
          <path
            class="app-footer__robot-bubble-fill"
            d="M18 5H58C73 5 84 14 84 27C84 40 73 47 59 47H52L61 58L39 47H18C9 47 4 38 4 26C4 14 9 5 18 5Z"
          />
        </svg>
        <span class="app-footer__robot-bubble-text">{{ t('footer.robotBubble') }}</span>
      </span>
      <img
        class="app-footer__robot"
        :src="robotLeadLounge"
        alt=""
        loading="lazy"
        decoding="async"
        draggable="false"
      >
    </div>
    <v-container class="app-footer__inner">
      <span class="app-footer__copy"
        >{{ t('footer.copyright', { year }) }} · {{ t('footer.tagline') }}</span
      >
      <div class="app-footer__links">
        <a class="app-footer__link" href="https://github.com/777genius" target="_blank">Author</a>
        <span class="app-footer__divider" />
        <a class="app-footer__link" :href="repoUrl" target="_blank">GitHub</a>
        <span class="app-footer__divider" />
        <a class="app-footer__link" :href="docsHref">{{ t('footer.links.docs') }}</a>
      </div>
    </v-container>
  </footer>
</template>

<style scoped>
.app-footer {
  position: relative;
  border-top: 1px solid var(--at-c-border);
  padding: 20px 0;
  isolation: isolate;
}

.app-footer__robot-stage {
  position: absolute;
  right: clamp(24px, 7vw, 112px);
  bottom: calc(100% - 5px);
  z-index: 2;
  width: clamp(178px, 16vw, 236px);
  pointer-events: none;
  user-select: none;
  transform: translateY(3px) rotate(-1deg);
  transform-origin: 54% bottom;
  filter:
    drop-shadow(0 14px 18px rgba(0, 0, 0, 0.52))
    drop-shadow(0 0 14px rgba(130, 255, 0, 0.2));
}

.app-footer__robot {
  display: block;
  width: 100%;
  height: auto;
}

.app-footer__robot-bubble {
  position: absolute;
  top: -28px;
  left: -18px;
  z-index: 3;
  display: block;
  width: 72px;
  height: 49px;
  color: #07111d;
  font-family: var(--at-font-mono);
  font-size: 0.62rem;
  font-weight: 900;
  line-height: 1;
  letter-spacing: 0;
  white-space: nowrap;
  text-shadow: 1px 1px 0 rgba(255, 255, 255, 0.62);
  transform: rotate(-2deg);
  transform-origin: 72% 74%;
  filter:
    drop-shadow(0 3px 0 rgba(0, 0, 0, 0.18))
    drop-shadow(0 0 9px rgba(255, 215, 0, 0.14));
}

.app-footer__robot-bubble-shape {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
}

.app-footer__robot-bubble-fill {
  fill: #fff09a;
  stroke: #050816;
  stroke-width: 4.6;
  stroke-linejoin: round;
  stroke-linecap: round;
}

.app-footer__robot-bubble-text {
  position: absolute;
  top: 11px;
  left: 0;
  z-index: 3;
  width: 54px;
  text-align: center;
}

.app-footer__inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.app-footer__copy {
  font-size: 13px;
  opacity: 0.5;
  font-family: var(--at-font-mono);
}

.app-footer__links {
  display: flex;
  align-items: center;
  gap: 12px;
}

.app-footer__link {
  color: var(--at-c-cyan);
  text-decoration: none;
  font-size: 13px;
  opacity: 0.7;
  transition: opacity 0.2s ease;
  font-family: var(--at-font-mono);
}

.app-footer__link:hover {
  opacity: 1;
}

.app-footer__divider {
  width: 1px;
  height: 14px;
  background: var(--at-c-border-strong);
}

.v-theme--light .app-footer {
  border-top-color: var(--at-c-border);
}

.v-theme--light .app-footer__copy {
  opacity: 0.72;
}

.v-theme--light .app-footer__link {
  color: #007c8b;
  opacity: 1;
}

.v-theme--light .app-footer__link:hover {
  color: #005c66;
}

.v-theme--light .app-footer__divider {
  background: rgba(0, 128, 144, 0.26);
}

@media (max-width: 600px) {
  .app-footer__robot-stage {
    display: none;
  }

  .app-footer__inner {
    flex-direction: column;
    gap: 10px;
    text-align: center;
  }
}
</style>
