import type { JsonObject, JsonValue } from "@/lib/product/types";

export function toJsonObject(value: unknown): JsonObject {
  const converted = toJsonValue(value);
  if (!converted || Array.isArray(converted) || typeof converted !== "object") {
    throw new Error("Product persistence payload must be a JSON object.");
  }
  return converted;
}

function toJsonValue(value: unknown): JsonValue | undefined {
  if (
    value === undefined ||
    typeof value === "function" ||
    typeof value === "symbol"
  ) {
    return undefined;
  }
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (Array.isArray(value)) {
    return value
      .map(toJsonValue)
      .filter((item): item is JsonValue => item !== undefined);
  }
  if (typeof value !== "object") return undefined;
  const result: JsonObject = {};
  for (const [key, item] of Object.entries(value)) {
    const converted = toJsonValue(item);
    if (converted !== undefined) result[key] = converted;
  }
  return result;
}
