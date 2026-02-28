# Итерация 2: Editable CodeMirror + сохранение файлов

> Зависит от: [Итерация 1](iter-1-walking-skeleton.md)

## Цель

Переключить CodeMirror из read-only в редактируемый режим. Cmd+S для сохранения. Индикатор unsaved changes. Status bar.

## IPC каналы

| Канал | Описание |
|-------|----------|
| `editor:writeFile` | Запись файла (atomic write через tmp + rename) |

## Новые файлы

| # | Файл | Описание |
|---|------|----------|
| 1 | `src/main/utils/atomicWrite.ts` | Перемещение существующего `atomicWriteAsync()` из `src/main/services/team/atomicWrite.ts` (shared utility). **H2**: Blast radius — ~10 source файлов + ~4 тестовых файла (TeamTaskWriter, TeamDataService, TeamKanbanManager, TeamAgentToolsInstaller, и их тесты). Обновить все импорты |
| 2 | `src/renderer/components/team/editor/EditorTabBar.tsx` | Панель вкладок (один файл пока, подготовка к multi-tab) |
| 3 | `src/renderer/components/team/editor/EditorStatusBar.tsx` | Ln:Col, язык, отступы |
| 4 | `src/renderer/components/team/editor/EditorToolbar.tsx` | Save, Undo, Redo |
| 5 | `src/renderer/utils/editorBridge.ts` | Module-level singleton: Store ↔ CM6 refs bridge (R3). Компонент вызывает `register()` при mount, store actions используют `getContent()`/`destroy()` |

## Изменения в существующих файлах

| # | Файл | Изменение |
|---|------|-----------|
| 1 | `src/shared/types/editor.ts` | Типы для write request/response |
| 2 | `src/shared/types/api.ts` | `writeFile` в `EditorAPI` |
| 3 | `src/main/services/editor/ProjectFileService.ts` | Метод `writeFile()` с atomic write |
| 4 | `src/main/ipc/editor.ts` | Handler `editor:writeFile` |
| 5 | `src/preload/index.ts` | `editor.writeFile` |
| 6 | `src/preload/constants/ipcChannels.ts` | `EDITOR_WRITE_FILE` |
| 7 | `src/renderer/components/team/editor/ProjectEditorOverlay.tsx` | Интеграция TabBar, StatusBar |
| 8 | `src/renderer/components/team/editor/CodeMirrorEditor.tsx` | Убрать readOnly, EditorState pooling (Map<tabId, EditorState>), Cmd+S keymap |
| 9 | `src/renderer/store/slices/editorSlice.ts` | Расширить: +Группа 2 (tabs) + Группа 3 (dirty/save) |
| 10 | `src/renderer/index.css` | +8 editor CSS-переменных (--editor-tab-active-bg, --editor-tab-modified-dot и др.) |

## Security-требования

1. `writeFile`: `validateFilePath()` ДО записи. **+ SEC-14**: `isPathWithinRoot(normalizedPath, activeProjectRoot)` для блокировки `~/.claude` writes. `Buffer.byteLength(content, 'utf8') <= 2MB`. Atomic write. Запрет записи в `.git/`. `activeProjectRoot` из module-level state (SEC-9, SEC-12)
2. Файл удалён извне при save: ENOENT -> inline-ошибка "File was deleted. Create new? / Close tab" (не падать)

## Performance-требования

- НЕ хранить modified content в Zustand. Контент только в EditorState CM. В store: `editorModifiedFiles: Record<string, boolean>` (dirty flags — Record вместо Set, т.к. Zustand не отслеживает мутации Set)
- Dirty flag через debounced `EditorView.updateListener` (300ms)
- Гранулярные Zustand-селекторы: FileTreePanel не подписывается на tabs/content
- EditorState pooling: один EditorView, Map<tabId, EditorState> в useRef
- LRU eviction при > 30 states

## UX-требования

- Status bar: `[Ln 42, Col 15] | [TypeScript] | [UTF-8] | [Spaces: 2]`
- Unsaved changes при закрытии overlay: три кнопки ("Save All & Close" / "Discard & Close" / "Cancel")
- Dirty indicator (точка) на вкладке ПЕРЕД текстом
- `hasUnsavedChanges()` в slice

## Тестирование

| # | Что тестировать | Файл |
|---|----------------|------|
| 1 | `ProjectFileService.writeFile` -- запись с mock fs, reject для файлов вне проекта, atomic write | `test/main/services/editor/ProjectFileService.test.ts` (расширение) |
| 2 | `editorSlice` -- open/close файлы, dirty state, save | `test/renderer/store/editorSlice.test.ts` (расширение) |
| 3 | `atomicWrite` -- unit тесты | `test/main/utils/atomicWrite.test.ts` |
| 4 | EditorState pooling -- save/restore state при switch tab | — |
| 5 | Manual: открыть файл -> отредактировать -> Cmd+S -> dirty indicator сбрасывается | — |

## Критерии готовности

- [ ] Файл редактируется в CodeMirror (не read-only)
- [ ] Cmd+S сохраняет файл через atomic write
- [ ] Dirty indicator на вкладке
- [ ] Status bar показывает позицию курсора и язык
- [ ] При закрытии overlay с unsaved changes -- confirmation dialog
- [ ] Benchmark: 0 re-render FileTreePanel/TabBar при наборе текста

## Оценка

- **Надёжность решения: 7/10** -- atomic write и EditorState pooling добавляют сложность.
- **Уверенность: 8/10** -- паттерны известны, но dirty tracking через CM6 updateListener требует тестирования.
