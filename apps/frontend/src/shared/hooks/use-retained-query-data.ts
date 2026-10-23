"use client";
import { useState } from "react";
import { hashKey, type QueryKey, type UseQueryResult } from "@tanstack/react-query";

// Masked view data preserves same-identity form hosts when the private cache is cleared.
// Authorization stays with the live query and boundary; terminal invalidation unmounts it.
export function useRetainedQueryData<T>(query: UseQueryResult<T>, key: QueryKey) {
  const hash = hashKey(key);
  const [snapshot, setSnapshot] = useState({ hash, data: query.data });
  if (snapshot.hash !== hash || (query.data !== undefined && query.data !== snapshot.data))
    setSnapshot({ hash, data: query.data });
  return query.data === undefined && snapshot.hash === hash ? snapshot.data : query.data;
}
