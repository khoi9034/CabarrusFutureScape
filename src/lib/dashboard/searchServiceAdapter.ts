import { getCommandRegistry } from "@/lib/dashboard/commandRegistry";
import { getDashboardRoleById } from "@/lib/dashboard/roleRegistry";
import { searchCommandItems } from "@/lib/dashboard/searchMatcher";
import type { DashboardRoleId } from "@/types/userRoles";
import type { CommandCategory, SearchResult } from "@/types/search";

export interface DashboardSearchRequest {
  activeRoleId?: DashboardRoleId;
  categories?: CommandCategory[];
  limit?: number;
  query: string;
}

export interface DashboardSearchServiceAdapter {
  searchCommands: (request: DashboardSearchRequest) => SearchResult[];
  searchLayers: (request: DashboardSearchRequest) => SearchResult[];
  searchParcels: (request: DashboardSearchRequest) => SearchResult[];
  searchPlaces: (request: DashboardSearchRequest) => SearchResult[];
}

// Phase 1 search stays local to mock data. This adapter is the future boundary
// for service-backed parcel, geocoder, layer, and command search without
// coupling the command palette to ArcGIS services or backend APIs.
export const mockDashboardSearchServiceAdapter: DashboardSearchServiceAdapter = {
  searchCommands: (request) =>
    searchCommandItems(getRoleAwareCommandRegistry(request), request.query, {
      categories: request.categories,
      limit: request.limit,
    }),
  searchLayers: (request) =>
    searchCommandItems(getCommandRegistry(), request.query, {
      categories: ["layer"],
      limit: request.limit,
    }),
  searchParcels: (request) =>
    searchCommandItems(getCommandRegistry(), request.query, {
      categories: ["parcel"],
      limit: request.limit,
    }),
  searchPlaces: () => [],
};

function getRoleAwareCommandRegistry(request: DashboardSearchRequest) {
  const items = getCommandRegistry();

  if (request.query.trim() || !request.activeRoleId) {
    return items;
  }

  const role = getDashboardRoleById(request.activeRoleId);
  const suggestionTokens = role.commandSuggestions
    .map(normalizeSearchText)
    .filter(Boolean)
    .map((suggestion) => suggestion.split(" ").filter(Boolean));

  if (!suggestionTokens.length) {
    return items;
  }

  const suggestedItems = items.filter((item) =>
    suggestionTokens.some((tokens) => tokensMatchItem(tokens, item)),
  );
  const suggestedIds = new Set(suggestedItems.map((item) => item.id));
  const remainingItems = items.filter((item) => !suggestedIds.has(item.id));

  return [...suggestedItems, ...remainingItems];
}

function tokensMatchItem(
  tokens: string[],
  item: ReturnType<typeof getCommandRegistry>[number],
) {
  const itemText = normalizeSearchText(
    [
      item.title,
      item.subtitle,
      item.category,
      item.keywords.join(" "),
      item.meta?.badge ?? "",
    ].join(" "),
  );

  return tokens.every((token) => itemText.includes(token));
}

function normalizeSearchText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\w\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
