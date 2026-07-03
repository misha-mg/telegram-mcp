export function parseToolJson(result: unknown) {
  if (!result || typeof result !== "object" || !("content" in result)) {
    throw new Error("Expected a tool result with content.");
  }

  const content = (result as { content: unknown }).content;
  if (!Array.isArray(content)) {
    throw new Error("Expected array content.");
  }

  const first = content[0];
  if (!first || typeof first !== "object" || !("type" in first) || !("text" in first)) {
    throw new Error("Expected a text result.");
  }

  if (first.type !== "text" || typeof first.text !== "string") {
    throw new Error("Expected a text result.");
  }

  return JSON.parse(first.text);
}
