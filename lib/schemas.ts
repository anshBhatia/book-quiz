import { z } from "zod";

export const BookCandidate = z.object({
  id: z.string(),
  title: z.string(),
  authors: z.array(z.string()),
  publishedDate: z.string().optional(),
  thumbnail: z.string().url().optional(),
  description: z.string().optional(),
});
export type BookCandidate = z.infer<typeof BookCandidate>;

export const BookStructure = z.object({
  events: z
    .array(z.string())
    .min(5)
    .max(12)
    .describe("Key plot events in chronological order"),
  decisions: z
    .array(
      z.object({
        who: z.string(),
        what: z.string(),
        why: z.string(),
      }),
    )
    .min(3)
    .max(8)
    .describe("Important character decisions with reasoning"),
  themes: z
    .array(z.string())
    .min(2)
    .max(6)
    .describe("Core themes of the book"),
  relationships: z
    .array(
      z.object({
        cause: z.string(),
        effect: z.string(),
      }),
    )
    .min(3)
    .max(8)
    .describe("Cause-effect relationships in the story"),
  characters: z
    .array(
      z.object({
        name: z.string(),
        role: z.string(),
      }),
    )
    .min(2)
    .max(10),
});
export type BookStructure = z.infer<typeof BookStructure>;

export const QuizQuestion = z.object({
  id: z.string(),
  category: z.enum(["event", "decision", "theme", "cause_effect"]),
  prompt: z.string(),
  options: z.array(z.string()).length(4),
  correctIndex: z.number().int().min(0).max(3),
  explanation: z.string(),
});
export type QuizQuestion = z.infer<typeof QuizQuestion>;

export const Quiz = z.object({
  bookId: z.string(),
  bookTitle: z.string(),
  authors: z.array(z.string()),
  questions: z.array(QuizQuestion).min(8).max(12),
  generatedAt: z.string(),
});
export type Quiz = z.infer<typeof Quiz>;
