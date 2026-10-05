"use client";

import { useInfiniteQuery, type QueryKey } from "@tanstack/react-query";
import { useEffect, useRef, useState, type RefObject } from "react";
import { api, qs } from "./api";
import type { Paginated } from "./types";

type Params = Record<string, string | number | boolean | undefined | null | string[]>;

/** Page number from DRF's `next` URL (null when there is no next page). */
function nextPage(next: string | null): number | undefined {
  if (!next) return undefined;
  const n = new URL(next, "http://x").searchParams.get("page");
  return n ? Number(n) : undefined;
}

/**
 * Infinite list over any DRF paginated endpoint.
 * Each call has its own key, so every list (e.g. each board column) pages on its own.
 */
export function useInfiniteList<T>(key: QueryKey, path: string, params: Params, pageSize = 20) {
  const query = useInfiniteQuery({
    queryKey: [...key, params, pageSize],
    initialPageParam: 1,
    queryFn: ({ pageParam }) => api<Paginated<T>>(`${path}${qs({ ...params, page: pageParam, page_size: pageSize })}`),
    getNextPageParam: (last) => nextPage(last.next),
    refetchInterval: 60000,
  });
  const items = query.data?.pages.flatMap((p) => p.results) ?? [];
  const count = query.data?.pages[0]?.count ?? 0;
  return { ...query, items, count };
}

/**
 * Invisible marker placed at the end of a scrollable list. When it scrolls into
 * view inside `root` (the list's own scroll box), the next page is fetched.
 */
export function LoadMore({
  root,
  hasMore,
  loading,
  onLoad,
}: {
  root: RefObject<HTMLElement | null>;
  hasMore: boolean;
  loading: boolean;
  onLoad: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const cb = useRef(onLoad);
  cb.current = onLoad;

  useEffect(() => {
    const el = ref.current;
    if (!el || !hasMore || loading) return;
    const io = new IntersectionObserver(
      (entries) => entries[0]?.isIntersecting && cb.current(),
      { root: root.current, rootMargin: "200px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [root, hasMore, loading]);

  if (!hasMore && !loading) return null;
  return (
    <div ref={ref} className="flex justify-center py-3 text-xs text-slate-400">
      {loading ? "Loading more…" : ""}
    </div>
  );
}

/** Value that updates `delay` ms after the input stops changing (for search boxes). */
export function useDebounced<T>(value: T, delay = 350) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}
