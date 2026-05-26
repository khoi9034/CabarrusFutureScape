import type { CommandCategory, CommandItem, SearchResult } from "@/types/search";

interface SearchCommandOptions {
  categories?: CommandCategory[];
  limit?: number;
}

const defaultLimit = 16;

export function searchCommandItems(
  items: CommandItem[],
  query: string,
  options: SearchCommandOptions = {},
): SearchResult[] {
  const normalizedQuery = normalizeSearchText(query);
  const categories = options.categories ? new Set(options.categories) : null;
  const searchableItems = items.filter(
    (item) => !item.disabled && (!categories || categories.has(item.category)),
  );

  if (!normalizedQuery) {
    return searchableItems
      .slice(0, options.limit ?? defaultLimit)
      .map((item, index) => ({
        ...item,
        matchedFields: [],
        matchScore: defaultLimit - index,
      }));
  }

  const queryTokens = normalizedQuery.split(" ").filter(Boolean);

  return searchableItems
    .map((item) => scoreCommandItem(item, normalizedQuery, queryTokens))
    .filter((result): result is SearchResult => Boolean(result))
    .sort((left, right) => {
      if (right.matchScore !== left.matchScore) {
        return right.matchScore - left.matchScore;
      }

      return left.title.localeCompare(right.title);
    })
    .slice(0, options.limit ?? defaultLimit);
}

function scoreCommandItem(
  item: CommandItem,
  normalizedQuery: string,
  queryTokens: string[],
) {
  const fields = [
    { name: "title", value: item.title, weight: 6 },
    { name: "subtitle", value: item.subtitle, weight: 3 },
    { name: "category", value: item.category, weight: 2 },
    { name: "keywords", value: item.keywords.join(" "), weight: 4 },
    { name: "badge", value: item.meta?.badge ?? "", weight: 2 },
  ];
  const combinedText = normalizeSearchText(
    fields.map((field) => field.value).join(" "),
  );

  if (!queryTokens.every((token) => combinedText.includes(token))) {
    return null;
  }

  const matchedFields = new Set<string>();
  const matchScore = fields.reduce((score, field) => {
    const normalizedValue = normalizeSearchText(field.value);
    const fieldScore = scoreField(normalizedValue, normalizedQuery, queryTokens);

    if (fieldScore > 0) {
      matchedFields.add(field.name);
    }

    return score + fieldScore * field.weight;
  }, 0);

  if (matchScore <= 0) {
    return null;
  }

  return {
    ...item,
    matchedFields: Array.from(matchedFields),
    matchScore,
  };
}

function scoreField(
  fieldValue: string,
  normalizedQuery: string,
  queryTokens: string[],
) {
  if (!fieldValue) {
    return 0;
  }

  if (fieldValue === normalizedQuery) {
    return 120;
  }

  if (fieldValue.startsWith(normalizedQuery)) {
    return 80;
  }

  if (fieldValue.includes(normalizedQuery)) {
    return 45;
  }

  return queryTokens.reduce((score, token) => {
    if (fieldValue.startsWith(token)) {
      return score + 20;
    }

    if (fieldValue.includes(token)) {
      return score + 10;
    }

    return score;
  }, 0);
}

function normalizeSearchText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\w\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
