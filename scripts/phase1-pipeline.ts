import { readFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { BookStructure, Quiz, QuizQuestion, type BookStructure as BookStructureType } from "../lib/schemas.js";

const DEFAULT_MODEL = "gemini-2.5-flash";
const HARDCODED_BOOK = {
  bookId: "project-hail-mary-phase-1-spike",
  bookTitle: "Project Hail Mary",
  authors: ["Andy Weir"],
};

const QuizQuestionWithoutId = QuizQuestion.omit({ id: true });
const QuizOutput = z.object({
  questions: z.array(QuizQuestionWithoutId).length(12),
});

type GeneratedQuestion = z.infer<typeof QuizQuestionWithoutId>;

loadEnvLocal();

const MODEL = process.env.GEMINI_MODEL ?? DEFAULT_MODEL;

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY. Add it to .env.local or export it before running npm run phase1.");
  }

  console.log(`Fetching Wikipedia plot text for "${HARDCODED_BOOK.bookTitle}"...`);
  const rawPlotText = await fetchWikipediaPlotText(HARDCODED_BOOK.bookTitle);
  const cleanedPlotText = cleanPlotText(rawPlotText);
  console.log(`Plot text ready: ${cleanedPlotText.length.toLocaleString()} chars after cleaning.`);

  console.log("LLM call 1/2: extracting structured book understanding...");
  const structure = await withRetry(() => extractBookStructure(apiKey, cleanedPlotText), "extract structure");

  console.log("LLM call 2/2: generating reflective multiple-choice quiz...");
  const quiz = await withRetry(() => generateQuiz(apiKey, structure), "generate quiz");

  console.log(JSON.stringify(quiz, null, 2));
}

async function fetchWikipediaPlotText(title: string): Promise<string> {
  const params = new URLSearchParams({
    action: "parse",
    page: title,
    prop: "wikitext",
    format: "json",
    origin: "*",
  });

  const response = await fetch(`https://en.wikipedia.org/w/api.php?${params.toString()}`, {
    headers: {
      "User-Agent": "book-quiz-phase1/0.1 (local development)",
    },
  });

  if (!response.ok) {
    console.warn(`Wikipedia request failed with ${response.status}; continuing without plot text.`);
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
    console.warn("Wikipedia returned no wikitext; continuing without plot text.");
    return "";
  }

  return extractPlotSection(payload.parse.wikitext["*"]);
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

function cleanPlotText(raw: string): string {
  return raw
    .replace(/\[\[([^|\]]+\|)?([^\]]+)\]\]/g, "$2")
    .replace(/\{\{[^}]+\}\}/g, "")
    .replace(/<ref[^>]*>.*?<\/ref>/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 12000);
}

async function extractBookStructure(apiKey: string, cleanedPlotText: string): Promise<BookStructureType> {
  const prompt = `You are analyzing the book "${HARDCODED_BOOK.bookTitle}" by ${HARDCODED_BOOK.authors.join(", ")}.

Extract a structured understanding of the book. Be specific, not generic. Focus on meaningful moments, not filler. For decisions, focus on WHY the character chose what they did. For themes, state the actual thematic claim the book makes, not just a topic word.

Plot text (may be partial or empty - fall back to your own knowledge of this book if needed):

${cleanedPlotText || "(no plot text available - use your training knowledge)"}`;

  const output = await generateStructuredJson(apiKey, prompt, BookStructure, "book structure", 6000);
  return BookStructure.parse(output);
}

async function generateQuiz(apiKey: string, structure: BookStructureType): Promise<z.infer<typeof Quiz>> {
  const prompt = `Generate 12 multiple-choice questions about "${HARDCODED_BOOK.bookTitle}" for a reader who has finished the book and wants to reflect on and test their understanding.

Mix: 4 event-based, 3 decision-based, 3 theme-based, 2 cause-effect.

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
    bookId: HARDCODED_BOOK.bookId,
    bookTitle: HARDCODED_BOOK.bookTitle,
    authors: HARDCODED_BOOK.authors,
    questions: shuffledQuestions,
    generatedAt: new Date().toISOString(),
  });
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

async function generateStructuredJson<T>(
  apiKey: string,
  prompt: string,
  schema: z.ZodType<T>,
  label: string,
  maxOutputTokens: number,
): Promise<T> {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
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

function loadEnvLocal() {
  try {
    const env = readFileSync(join(process.cwd(), ".env.local"), "utf8");

    for (const line of env.split(/\r?\n/)) {
      const trimmed = line.trim();

      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }

      const equalsIndex = trimmed.indexOf("=");

      if (equalsIndex === -1) {
        continue;
      }

      const key = trimmed.slice(0, equalsIndex).trim();
      const value = trimmed
        .slice(equalsIndex + 1)
        .trim()
        .replace(/^['"]|['"]$/g, "");

      process.env[key] ??= value;
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
