import { setTimeout as sleep } from "node:timers/promises";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { BookStructure, Quiz, QuizQuestion, type Quiz as QuizType } from "@/lib/schemas";

const DEFAULT_MODEL = "gemini-2.5-flash";
const QuizQuestionWithoutId = QuizQuestion.omit({ id: true });
const QuizOutput = z.object({
  questions: z.array(QuizQuestionWithoutId).length(10),
});

export type QuizBookInput = {
  bookId: string;
  bookTitle: string;
  authors: string[];
};

type GeneratedQuestion = z.infer<typeof QuizQuestionWithoutId>;

export async function generateQuizForBook(input: QuizBookInput, apiKey: string): Promise<QuizType> {
  const rawPlotText = await fetchWikipediaPlotText(input.bookTitle);
  const cleanedPlotText = cleanPlotText(rawPlotText);
  const structure = await withRetry(
    () => extractBookStructure(apiKey, input.bookTitle, input.authors, cleanedPlotText),
    "extract structure",
  );
  const quiz = await withRetry(() => generateQuiz(apiKey, input, structure), "generate quiz");

  return quiz;
}

export async function fetchWikipediaPlotText(title: string): Promise<string> {
  const params = new URLSearchParams({
    action: "parse",
    page: title,
    prop: "wikitext",
    format: "json",
    origin: "*",
  });

  const response = await fetch(`https://en.wikipedia.org/w/api.php?${params.toString()}`, {
    headers: {
      "User-Agent": "book-quiz/0.1 (local development)",
    },
  });

  if (!response.ok) {
    return "";
  }

  const payload = (await response.json()) as {
    error?: unknown;
    parse?: {
      wikitext?: {
        "*": string;
      };
    };
  };

  if (payload.error || !payload.parse?.wikitext?.["*"]) {
    return "";
  }

  return extractPlotSection(payload.parse.wikitext["*"]);
}

export function cleanPlotText(raw: string): string {
  return raw
    .replace(/\[\[([^|\]]+\|)?([^\]]+)\]\]/g, "$2")
    .replace(/\{\{[^}]+\}\}/g, "")
    .replace(/<ref[^>]*>.*?<\/ref>/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 12000);
}

function extractPlotSection(wikitext: string): string {
  const sectionHeading = /^==\s*(Plot|Plot summary|Synopsis)\s*==\s*$/gim;
  const match = sectionHeading.exec(wikitext);

  if (!match) {
    const firstHeadingIndex = wikitext.search(/^==[^=].*==\s*$/m);
    return firstHeadingIndex === -1 ? wikitext : wikitext.slice(0, firstHeadingIndex);
  }

  const start = match.index + match[0].length;
  const rest = wikitext.slice(start);
  const nextHeadingIndex = rest.search(/^==[^=].*==\s*$/m);
  return nextHeadingIndex === -1 ? rest : rest.slice(0, nextHeadingIndex);
}

async function extractBookStructure(
  apiKey: string,
  bookTitle: string,
  authors: string[],
  cleanedPlotText: string,
) {
  const prompt = `You are analyzing the book "${bookTitle}" by ${authors.join(", ") || "unknown author"}.

Extract a structured understanding of the book. Be specific, not generic. Focus on meaningful moments, not filler. For decisions, focus on WHY the character chose what they did. For themes, state the actual thematic claim the book makes, not just a topic word.

Plot text (may be partial or empty - fall back to your own knowledge of this book if needed):

${cleanedPlotText || "(no plot text available - use your training knowledge)"}`;

  return generateStructuredJson(apiKey, prompt, BookStructure, "book structure", 6000);
}

async function generateQuiz(
  apiKey: string,
  book: QuizBookInput,
  structure: z.infer<typeof BookStructure>,
): Promise<QuizType> {
  const prompt = `Generate 10 multiple-choice questions about "${book.bookTitle}" for a reader who has finished the book and wants to reflect on and test their understanding.

Mix: 3 event-based, 3 decision-based, 2 theme-based, 2 cause-effect.

Rules for every question:
- Test understanding, not trivia. Not "what color was X's shirt."
- Exactly 4 options, exactly 1 correct.
- Distractors must be plausible - a reader who half-remembers should find it hard. Avoid options that are obviously silly or obviously right.
- No "all of the above" / "none of the above."
- Avoid giveaway phrasing that makes the answer leak through the question.
- For decision questions, test the reasoning (WHY) not just the fact (WHAT).
- For theme questions, frame as interpretation - "Which best captures..." - and make options nuanced.
- Include a 1-2 sentence explanation for each answer.

Structured understanding of the book:
${JSON.stringify(structure, null, 2)}`;

  const { questions } = QuizOutput.parse(await generateStructuredJson(apiKey, prompt, QuizOutput, "quiz output", 8000));
  const shuffledQuestions = shuffle(questions).map((question, index) =>
    shuffleQuestionOptions(question, `q${index + 1}`),
  );

  return Quiz.parse({
    bookId: book.bookId,
    bookTitle: book.bookTitle,
    authors: book.authors,
    questions: shuffledQuestions,
    generatedAt: new Date().toISOString(),
  });
}

async function generateStructuredJson<T>(
  apiKey: string,
  prompt: string,
  schema: z.ZodType<T>,
  label: string,
  maxOutputTokens: number,
): Promise<T> {
  const model = process.env.GEMINI_MODEL ?? DEFAULT_MODEL;
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        maxOutputTokens,
        responseMimeType: "application/json",
        responseJsonSchema: zodToJsonSchema(schema),
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini ${label} request failed with ${response.status}: ${errorText}`);
  }

  const payload = (await response.json()) as {
    candidates?: Array<{
      content?: {
        parts?: Array<{
          text?: string;
        }>;
      };
      finishReason?: string;
    }>;
  };
  const finishReason = payload.candidates?.[0]?.finishReason ?? "unknown";
  const text = payload.candidates?.[0]?.content?.parts?.find((part) => typeof part.text === "string")?.text;

  if (!text) {
    throw new Error(`Gemini returned no text for ${label}. Finish reason: ${finishReason}`);
  }

  try {
    return schema.parse(JSON.parse(text));
  } catch (error) {
    console.error(`Gemini ${label} finish reason: ${finishReason}`);
    console.error(`Failed to parse Gemini ${label} JSON:`, text);
    throw error;
  }
}

function shuffleQuestionOptions(question: GeneratedQuestion, id: string) {
  const optionsWithCorrectness = question.options.map((option, index) => ({
    option,
    isCorrect: index === question.correctIndex,
  }));
  const shuffled = shuffle(optionsWithCorrectness);
  const correctIndex = shuffled.findIndex((option) => option.isCorrect);

  return {
    ...question,
    id,
    options: shuffled.map((option) => option.option),
    correctIndex,
  };
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  try {
    return await fn();
  } catch (firstError) {
    console.error(`Failed to ${label} on attempt 1. Retrying once...`, firstError);
    await sleep(1000);

    try {
      return await fn();
    } catch (secondError) {
      console.error(`Failed to ${label} on attempt 2.`, secondError);
      throw secondError;
    }
  }
}
