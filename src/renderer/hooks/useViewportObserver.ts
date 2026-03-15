import { useCallback, useEffect, useRef } from 'react';

import type { RefObject } from 'react';

/** Data attribute name used to store arbitrary string data on observed elements. */
const DATA_ATTR = 'data-viewport-value';

interface UseViewportObserverOptions {
  /**
   * Scrollable ancestor element used as IntersectionObserver root.
   * Required for elements inside Dialog portals where the default
   * document viewport root would not detect intersections correctly.
   */
  rootRef?: RefObject<HTMLElement | null>;
  /** Visibility ratio threshold (0..1). Default: 0.1 (10% visible). */
  threshold?: number;
  /**
   * Called when the set of visible elements changes.
   * Receives the data-viewport-value strings of all currently intersecting elements.
   */
  onVisibleChange: (visibleValues: string[]) => void;
}

/**
 * Generic reusable hook for detecting which elements are visible in a
 * scrollable container using IntersectionObserver.
 *
 * Usage:
 * 1. Call the hook with a root ref and a callback.
 * 2. Attach `registerElement(value)` as a ref callback on each element.
 *    `value` is an arbitrary string stored in a data attribute for identification.
 * 3. The callback fires with the list of currently visible values whenever
 *    the intersection state changes.
 *
 * The hook manages a single IntersectionObserver instance and handles
 * element registration/deregistration automatically.
 */
export function useViewportObserver({
  rootRef,
  threshold = 0.1,
  onVisibleChange,
}: UseViewportObserverOptions): {
  /** Ref callback factory. Attach the returned ref to an observed element. */
  registerElement: (value: string) => (el: HTMLElement | null) => void;
} {
  const onVisibleChangeRef = useRef(onVisibleChange);
  onVisibleChangeRef.current = onVisibleChange;

  const observerRef = useRef<IntersectionObserver | null>(null);
  const visibleValuesRef = useRef<Set<string>>(new Set());
  const elementsByValue = useRef<Map<string, HTMLElement>>(new Map());

  // Create / recreate observer when root or threshold changes.
  useEffect(() => {
    const root = rootRef?.current ?? null;

    const observer = new IntersectionObserver(
      (entries) => {
        let changed = false;
        for (const entry of entries) {
          const value = entry.target.getAttribute(DATA_ATTR);
          if (!value) continue;

          if (entry.isIntersecting) {
            if (!visibleValuesRef.current.has(value)) {
              visibleValuesRef.current.add(value);
              changed = true;
            }
          } else {
            if (visibleValuesRef.current.has(value)) {
              visibleValuesRef.current.delete(value);
              changed = true;
            }
          }
        }
        if (changed) {
          onVisibleChangeRef.current(Array.from(visibleValuesRef.current));
        }
      },
      { root, threshold }
    );

    // Re-observe elements that were registered before observer was created
    // (or after root changed).
    for (const [value, el] of elementsByValue.current) {
      el.setAttribute(DATA_ATTR, value);
      observer.observe(el);
    }

    observerRef.current = observer;

    return () => {
      observer.disconnect();
      observerRef.current = null;
      visibleValuesRef.current.clear();
    };
  }, [rootRef, threshold]);

  const registerElement = useCallback((value: string) => {
    return (el: HTMLElement | null) => {
      // Cleanup previous element for this value
      const prev = elementsByValue.current.get(value);
      if (prev) {
        observerRef.current?.unobserve(prev);
        elementsByValue.current.delete(value);
        visibleValuesRef.current.delete(value);
      }

      // Register new element
      if (el) {
        el.setAttribute(DATA_ATTR, value);
        elementsByValue.current.set(value, el);
        observerRef.current?.observe(el);
      }
    };
  }, []);

  return { registerElement };
}
