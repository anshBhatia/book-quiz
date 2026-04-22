import type { Quiz } from "@/lib/schemas";

declare global {
  // eslint-disable-next-line no-var
  var __bookQuizCache: Map<string, Quiz> | undefined;
}

export const quizCache = globalThis.__bookQuizCache ?? new Map<string, Quiz>();

if (process.env.NODE_ENV !== "production") {
  globalThis.__bookQuizCache = quizCache;
}
