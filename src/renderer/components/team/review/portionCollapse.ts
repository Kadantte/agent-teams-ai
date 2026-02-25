import { updateOriginalDoc } from '@codemirror/merge';
import { type Extension, RangeSetBuilder, StateEffect, StateField } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView, WidgetType } from '@codemirror/view';

import { getChunks } from './CodeMirrorDiffUtils';

import type { ChangeDesc, EditorState, Transaction } from '@codemirror/state';

// ─── Configuration ───

interface PortionCollapseConfig {
  margin?: number;
  minSize?: number;
  portionSize?: number;
}

// ─── State Effects ───

export const expandPortion = StateEffect.define<{ pos: number; count: number }>({
  map: (value, mapping: ChangeDesc) => ({
    pos: mapping.mapPos(value.pos),
    count: value.count,
  }),
});

export const expandAllAtPos = StateEffect.define<number>({
  map: (pos, mapping: ChangeDesc) => mapping.mapPos(pos),
});

// ─── Widget ───

class PortionCollapseWidget extends WidgetType {
  constructor(
    readonly lineCount: number,
    readonly portionSize: number
  ) {
    super();
  }

  toDOM(view: EditorView): HTMLElement {
    const container = document.createElement('div');
    container.className = 'cm-portion-collapse';

    const text = document.createElement('span');
    text.className = 'cm-portion-collapse-text';
    text.textContent = `\u00B7\u00B7\u00B7 ${this.lineCount} unchanged line${this.lineCount !== 1 ? 's' : ''} \u00B7\u00B7\u00B7`;
    container.appendChild(text);

    const actions = document.createElement('div');
    actions.className = 'cm-portion-collapse-actions';

    if (this.lineCount > this.portionSize) {
      const expandBtn = document.createElement('button');
      expandBtn.className = 'cm-portion-expand-btn';
      expandBtn.textContent = `Expand ${this.portionSize}`;
      expandBtn.title = `Show next ${this.portionSize} lines`;
      expandBtn.onmousedown = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const pos = view.posAtDOM(container);
        view.dispatch({
          effects: expandPortion.of({ pos, count: this.portionSize }),
        });
      };
      actions.appendChild(expandBtn);
    }

    const expandAllBtn = document.createElement('button');
    expandAllBtn.className = 'cm-portion-expand-all-btn';
    expandAllBtn.textContent = 'Expand All';
    expandAllBtn.title = `Show all ${this.lineCount} unchanged lines`;
    expandAllBtn.onmousedown = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const pos = view.posAtDOM(container);
      view.dispatch({
        effects: expandAllAtPos.of(pos),
      });
    };
    actions.appendChild(expandAllBtn);

    container.appendChild(actions);
    return container;
  }

  eq(other: PortionCollapseWidget): boolean {
    return this.lineCount === other.lineCount && this.portionSize === other.portionSize;
  }

  // eslint-disable-next-line @typescript-eslint/class-literal-property-style -- WidgetType defines estimatedHeight as getter, cannot override with property
  get estimatedHeight(): number {
    return 28;
  }

  ignoreEvent(event: Event): boolean {
    return event instanceof MouseEvent;
  }
}

// ─── Helpers ───

function buildPortionRanges(
  state: EditorState,
  margin: number,
  minSize: number,
  portionSize: number
): DecorationSet {
  const result = getChunks(state);
  const doc = state.doc;

  if (!result) return Decoration.none;

  const chunks = result.chunks;
  const builder = new RangeSetBuilder<Decoration>();

  let prevLine = 1;

  for (let i = 0; ; i++) {
    const chunk = i < chunks.length ? chunks[i] : null;
    const collapseFrom = i ? prevLine + margin : 1;
    const collapseTo = chunk ? doc.lineAt(chunk.fromB).number - 1 - margin : doc.lines;
    const lines = collapseTo - collapseFrom + 1;

    if (lines >= minSize) {
      const from = doc.line(collapseFrom).from;
      const to = doc.line(collapseTo).to;
      const widget = new PortionCollapseWidget(lines, portionSize);

      builder.add(from, to, Decoration.replace({ widget, block: true }));
    }

    if (!chunk) break;

    prevLine = doc.lineAt(Math.min(doc.length, chunk.toB)).number;
  }

  return builder.finish();
}

function handleExpandPortion(
  decorations: DecorationSet,
  value: { pos: number; count: number },
  state: EditorState,
  minSize: number,
  portionSize: number
): DecorationSet {
  const { pos, count } = value;
  const doc = state.doc;

  let targetFrom = -1;
  let targetTo = -1;

  decorations.between(0, doc.length, (from, to) => {
    if (from <= pos && pos <= to) {
      targetFrom = from;
      targetTo = to;
      return false;
    }
  });

  if (targetFrom < 0) return decorations;

  const fromLine = doc.lineAt(targetFrom).number;
  const toLine = doc.lineAt(targetTo).number;
  const newFromLine = fromLine + count;
  const remainingLines = toLine - newFromLine + 1;

  if (remainingLines < minSize) {
    return decorations.update({
      filter: (from) => from !== targetFrom,
    });
  }

  const newFrom = doc.line(newFromLine).from;
  const widget = new PortionCollapseWidget(remainingLines, portionSize);

  return decorations.update({
    filter: (from) => from !== targetFrom,
    add: [Decoration.replace({ widget, block: true }).range(newFrom, targetTo)],
  });
}

function handleExpandAll(decorations: DecorationSet, pos: number): DecorationSet {
  return decorations.update({
    filter: (from, to) => !(from <= pos && pos <= to),
  });
}

// ─── Theme ───

const portionCollapseTheme = EditorView.theme({
  '.cm-portion-collapse': {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '4px 12px',
    backgroundColor: 'var(--color-surface-raised)',
    borderTop: '1px solid var(--color-border)',
    borderBottom: '1px solid var(--color-border)',
    minHeight: '28px',
    cursor: 'default',
    userSelect: 'none',
  },

  '.cm-portion-collapse-text': {
    fontSize: '12px',
    color: 'var(--color-text-muted)',
    letterSpacing: '0.5px',
  },

  '.cm-portion-collapse-actions': {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },

  '.cm-portion-expand-btn': {
    padding: '2px 10px',
    fontSize: '11px',
    fontWeight: '500',
    lineHeight: '18px',
    color: 'var(--color-text-secondary)',
    backgroundColor: 'transparent',
    border: '1px solid var(--color-border)',
    borderRadius: '4px',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    '&:hover': {
      color: 'var(--color-text)',
      backgroundColor: 'rgba(255, 255, 255, 0.06)',
      borderColor: 'var(--color-border-emphasis)',
    },
    '&:active': {
      backgroundColor: 'rgba(255, 255, 255, 0.1)',
    },
  },

  '.cm-portion-expand-all-btn': {
    padding: '2px 10px',
    fontSize: '11px',
    fontWeight: '500',
    lineHeight: '18px',
    color: 'var(--color-text-muted)',
    backgroundColor: 'transparent',
    border: '1px solid transparent',
    borderRadius: '4px',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    '&:hover': {
      color: 'var(--color-text-secondary)',
      backgroundColor: 'rgba(255, 255, 255, 0.04)',
      borderColor: 'var(--color-border)',
    },
    '&:active': {
      backgroundColor: 'rgba(255, 255, 255, 0.08)',
    },
  },
});

// ─── Extension ───

export function portionCollapseExtension(config?: PortionCollapseConfig): Extension {
  const margin = config?.margin ?? 3;
  const minSize = config?.minSize ?? 4;
  const portionSize = config?.portionSize ?? 100;

  const field = StateField.define<DecorationSet>({
    create(state: EditorState): DecorationSet {
      return buildPortionRanges(state, margin, minSize, portionSize);
    },

    update(deco: DecorationSet, tr: Transaction): DecorationSet {
      // 1. Expand effects
      let result = deco;
      let hasExpandEffect = false;
      for (const effect of tr.effects) {
        if (effect.is(expandPortion)) {
          hasExpandEffect = true;
          result = handleExpandPortion(result, effect.value, tr.state, minSize, portionSize);
        }
        if (effect.is(expandAllAtPos)) {
          hasExpandEffect = true;
          result = handleExpandAll(result, effect.value);
        }
      }
      if (hasExpandEffect) return result;

      // 2. Accept chunk (updateOriginalDoc) → full rebuild
      if (tr.effects.some((e) => e.is(updateOriginalDoc))) {
        return buildPortionRanges(tr.state, margin, minSize, portionSize);
      }

      // 3. Document changed (reject, user edit) → full rebuild
      if (tr.docChanged) {
        return buildPortionRanges(tr.state, margin, minSize, portionSize);
      }

      // 4. Lazy init
      if (deco === Decoration.none) {
        const chunks = getChunks(tr.state);
        if (chunks) {
          return buildPortionRanges(tr.state, margin, minSize, portionSize);
        }
      }

      return deco;
    },

    provide(f) {
      return EditorView.decorations.from(f);
    },
  });

  return [field, portionCollapseTheme];
}
