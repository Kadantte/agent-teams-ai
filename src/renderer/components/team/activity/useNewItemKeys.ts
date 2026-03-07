import { useEffect, useMemo, useRef } from 'react';

interface UseNewItemKeysOptions {
  itemKeys: string[];
  paginationKey?: number;
  resetKey?: string;
}

/**
 * Tracks which currently visible items are newly mounted since the last committed render.
 * Pagination expansions are treated as non-animated so "Show more" does not replay enter motion.
 */
export function useNewItemKeys({
  itemKeys,
  paginationKey = 0,
  resetKey,
}: UseNewItemKeysOptions): Set<string> {
  const knownKeysRef = useRef<Set<string>>(new Set());
  const isInitializedRef = useRef(false);
  const prevPaginationKeyRef = useRef(paginationKey);

  useEffect(() => {
    knownKeysRef.current = new Set();
    isInitializedRef.current = false;
    prevPaginationKeyRef.current = paginationKey;
  }, [resetKey]);

  const isPaginationExpansion =
    isInitializedRef.current && paginationKey > prevPaginationKeyRef.current;

  const newItemKeys = useMemo(() => {
    if (!isInitializedRef.current || isPaginationExpansion) {
      return new Set<string>();
    }

    const next = new Set<string>();
    for (const key of itemKeys) {
      if (!knownKeysRef.current.has(key)) {
        next.add(key);
      }
    }
    return next;
  }, [isPaginationExpansion, itemKeys]);

  useEffect(() => {
    if (!isInitializedRef.current) {
      isInitializedRef.current = true;
    }
    for (const key of itemKeys) {
      knownKeysRef.current.add(key);
    }
    prevPaginationKeyRef.current = paginationKey;
  }, [itemKeys, paginationKey]);

  return newItemKeys;
}
