/**
 * Re-exports from the AI Suggestions Engine.
 * The full implementation lives in src/services/ai-suggestions/.
 * This file maintains backward compatibility with existing imports.
 */

export { generateSuggestions } from "@/services/ai-suggestions/suggestion-engine";
export type { Suggestion as AISuggestion } from "@/services/ai-suggestions/suggestion-types";
