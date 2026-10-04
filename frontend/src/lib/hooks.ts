"use client";

import { useQuery } from "@tanstack/react-query";
import { api, qs } from "./api";
import type { Category, IssueCard, Me, Paginated, UserBrief } from "./types";

export function useCategories() {
  return useQuery({
    queryKey: ["categories"],
    queryFn: () => api<Category[]>("/api/categories/"),
    staleTime: 5 * 60_000,
  });
}

export function useUserSearch(search: string, userType?: string) {
  return useQuery({
    queryKey: ["users", search, userType],
    queryFn: () => api<Paginated<UserBrief>>(`/api/auth/users/${qs({ search, user_type: userType, page_size: 20 })}`),
    staleTime: 60_000,
  });
}

/** Mirrors apps/issues/permissions.py can_edit() for cards on the board
 *  (the detail endpoint returns the authoritative flags). */
export function canEditCard(user: Me, card: IssueCard) {
  if (user.can_manage_issues) return true;
  if (card.assignees.some((a) => a.id === user.id)) return true;
  return Boolean(user.is_cosa && user.owned_category && user.owned_category.id === card.category.id);
}
