<script setup lang="ts">
import { useData, withBase } from "vitepress";
import { computed } from "vue";

const props = withDefaults(defineProps<{ type?: "start" | "reference" }>(), {
  type: "start"
});

const { page } = useData();
const isRu = computed(() => page.value.relativePath.startsWith("ru/"));

const cards = computed(() => {
  if (isRu.value) {
    return props.type === "reference"
      ? [
          { icon: "◈", title: "Концепции", desc: "Команды, задачи, роли и уровни автономности.", link: "/ru/reference/concepts" },
          { icon: "⌁", title: "Рантаймы", desc: "Claude, Codex, OpenCode и multimodel-режим.", link: "/ru/reference/providers-runtimes" },
          { icon: "▦", title: "Архитектура", desc: "Feature layout, guardrails и границы runtime/provider.", link: "/ru/reference/contributor-architecture" },
          { icon: "⌘", title: "Локальные данные", desc: "Что хранится на машине и что уходит провайдерам.", link: "/ru/reference/privacy-local-data" },
          { icon: "?", title: "FAQ", desc: "Короткие ответы на частые вопросы.", link: "/ru/reference/faq" }
        ]
      : [
          { icon: "01", title: "Путь новичка", desc: "Понять весь первый запуск от проекта до approval.", link: "/ru/guide/beginner-workflow" },
          { icon: "02", title: "Быстрый старт", desc: "Поставить приложение и проверить базовый запуск.", link: "/ru/guide/quickstart" },
          { icon: "03", title: "Первая команда", desc: "Lead, builder, reviewer, роли, модели и Worktree.", link: "/ru/guide/create-first-team" },
          { icon: "04", title: "Запуск работы", desc: "Brief для lead, task board, comments и monitoring.", link: "/ru/guide/run-and-monitor-work" },
          { icon: "05", title: "Review и approval", desc: "Task detail, logs, diff и hunk-level decisions.", link: "/ru/guide/review-and-approve" },
          { icon: "06", title: "Рантаймы", desc: "Claude, Codex, OpenCode и multimodel setup.", link: "/ru/guide/runtime-setup" }
        ];
  }

  return props.type === "reference"
    ? [
        { icon: "◈", title: "Concepts", desc: "Teams, tasks, roles, and autonomy levels.", link: "/reference/concepts" },
        { icon: "⌁", title: "Runtimes", desc: "Claude, Codex, OpenCode, and multimodel mode.", link: "/reference/providers-runtimes" },
        { icon: "▦", title: "Architecture", desc: "Feature layout, guardrails, and runtime/provider boundaries.", link: "/reference/contributor-architecture" },
        { icon: "⌘", title: "Local data", desc: "What stays on disk and what providers receive.", link: "/reference/privacy-local-data" },
        { icon: "?", title: "FAQ", desc: "Short answers to common questions.", link: "/reference/faq" }
      ]
    : [
        { icon: "01", title: "Beginner workflow", desc: "Understand the first run from project to approval.", link: "/guide/beginner-workflow" },
        { icon: "02", title: "Quickstart", desc: "Install the app and validate the base launch.", link: "/guide/quickstart" },
        { icon: "03", title: "First team", desc: "Lead, builder, reviewer, roles, models, and Worktree.", link: "/guide/create-first-team" },
        { icon: "04", title: "Run work", desc: "Lead brief, task board, comments, and monitoring.", link: "/guide/run-and-monitor-work" },
        { icon: "05", title: "Review and approve", desc: "Task detail, logs, diff, and hunk-level decisions.", link: "/guide/review-and-approve" },
        { icon: "06", title: "Runtime setup", desc: "Claude, Codex, OpenCode, and multimodel setup.", link: "/guide/runtime-setup" }
      ];
});
</script>

<template>
  <div class="docs-card-grid">
    <a v-for="card in cards" :key="card.link" class="docs-card" :href="withBase(card.link)">
      <span class="docs-card__icon">{{ card.icon }}</span>
      <strong>{{ card.title }}</strong>
      <span>{{ card.desc }}</span>
      <span class="docs-card__arrow" aria-hidden="true">→</span>
    </a>
  </div>
</template>

<style scoped>
.docs-card-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  margin: 24px 0;
}

.docs-card {
  position: relative;
  overflow: hidden;
  display: grid;
  grid-template-columns: auto 1fr auto;
  grid-template-rows: auto auto;
  column-gap: 12px;
  row-gap: 4px;
  padding: 18px;
  border: var(--at-glass-border);
  border-radius: var(--at-radius-xl);
  background: var(--at-c-surface-soft);
  color: var(--at-c-text);
  text-decoration: none !important;
  box-shadow: var(--at-shadow-card);
  min-width: 0;
  transition:
    border-color var(--at-transition-base),
    background-color var(--at-transition-base),
    transform var(--at-transition-base),
    box-shadow var(--at-transition-base);
}

.docs-card:hover {
  border-color: var(--at-c-border-strong);
  background: var(--at-glass-bg-hover);
  transform: translateY(-3px);
  box-shadow: var(--at-shadow-cyan-md);
}

.docs-card__icon {
  grid-row: 1 / -1;
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: var(--at-radius-md);
  background: var(--at-gradient-panel);
  color: var(--at-c-cyan);
  font-family: var(--at-font-mono);
  font-size: 13px;
  border: 1px solid rgba(0, 240, 255, 0.14);
}

.docs-card strong {
  color: var(--at-c-text);
  font-size: 15px;
  line-height: 1.3;
  min-width: 0;
  overflow-wrap: anywhere;
}

.docs-card > span:nth-of-type(2) {
  color: var(--at-c-text-muted);
  font-size: 13px;
  line-height: 1.45;
  min-width: 0;
  overflow-wrap: anywhere;
}

.docs-card__arrow {
  grid-column: 3;
  align-self: end;
  color: var(--at-c-cyan);
  font-family: var(--at-font-mono);
  font-size: 16px;
  opacity: 0.55;
  transform: translateX(-4px);
  transition:
    opacity var(--at-transition-base),
    transform var(--at-transition-base);
}

.docs-card:hover .docs-card__arrow {
  opacity: 1;
  transform: translateX(0);
}

@media (max-width: 640px) {
  .docs-card-grid {
    grid-template-columns: 1fr;
  }

  .docs-card {
    grid-template-columns: auto 1fr;
    padding: 16px;
  }

  .docs-card__arrow {
    display: none;
  }
}
</style>
