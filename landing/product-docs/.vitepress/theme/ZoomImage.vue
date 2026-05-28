<script setup lang="ts">
import { withBase } from "vitepress";

defineProps<{
  src: string;
  alt: string;
  caption?: string;
}>();
</script>

<template>
  <figure class="zoom-image">
    <div class="zoom-image__scroller" role="region" :aria-label="alt" tabindex="0">
      <img class="docs-zoom-image" :src="withBase(src)" :alt="alt" loading="lazy" decoding="async">
    </div>
    <figcaption v-if="caption">{{ caption }}</figcaption>
  </figure>
</template>

<style scoped>
.zoom-image {
  margin: 24px 0;
}

.zoom-image__scroller {
  overflow-x: auto;
  border-radius: var(--at-radius-xl);
  border: var(--at-glass-border);
  background: var(--at-c-dark-1);
  box-shadow: var(--at-shadow-card);
  scrollbar-width: thin;
  scrollbar-color: color-mix(in srgb, var(--at-c-cyan) 56%, transparent) transparent;
}

.zoom-image__scroller:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 3px;
}

.zoom-image img {
  display: block;
  width: 100%;
  cursor: zoom-in;
}

.zoom-image figcaption {
  margin-top: 8px;
  color: var(--at-c-text-muted);
  font-size: 13px;
  line-height: 1.5;
  text-align: center;
}

@media (max-width: 640px) {
  .zoom-image {
    margin: 22px -16px;
  }

  .zoom-image__scroller {
    border-right: 0;
    border-left: 0;
    border-radius: 0;
    overscroll-behavior-x: contain;
    scroll-snap-type: x proximity;
  }

  .zoom-image img {
    width: 860px;
    max-width: none;
    scroll-snap-align: start;
  }

  .zoom-image figcaption {
    padding: 0 16px;
  }
}

@media (max-width: 360px) {
  .zoom-image img {
    width: 800px;
  }
}
</style>
