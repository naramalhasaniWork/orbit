"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { buildSearch, readParams, type ParamUpdates } from "@/lib/url-state";

/**
 * View state kept in the query string so reload and share restore it.
 * Setting a key to null (or its default) removes it. Writes use replace so filters
 * don't flood browser history; unrelated params such as `project` are preserved.
 * Pass a module-level `defaults` constant so the values stay referentially stable.
 */
export function useUrlParams<D extends Record<string, string>>(defaults: D) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();

  const values = useMemo(() => readParams(search, defaults), [search, defaults]);

  const setParams = useCallback(
    (updates: ParamUpdates<D>) => {
      // Read the live URL so back-to-back updates in one tick don't clobber each other.
      const current = typeof window !== "undefined" ? window.location.search : search;
      const next = buildSearch(current, updates, defaults);
      router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
    },
    [router, pathname, search, defaults]
  );

  return [values, setParams] as const;
}
