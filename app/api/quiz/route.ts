import { NextResponse } from "next/server";
import { z } from "zod";
import { quizCache } from "@/lib/quiz-cache";
import { generateQuizForBook } from "@/lib/quiz-pipeline";

export const maxDuration = 60;

const QuizRequest = z.object({
  bookId: z.string().min(1),
  bookTitle: z.string().min(1),
  authors: z.array(z.string()),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = QuizRequest.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const cached = quizCache.get(parsed.data.bookId);

  if (cached) {
    return NextResponse.json({ quiz: cached, cached: true });
  }

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return NextResponse.json({ error: "missing_gemini_api_key" }, { status: 500 });
  }

  try {
    const quiz = await generateQuizForBook(parsed.data, apiKey);
    quizCache.set(parsed.data.bookId, quiz);
    return NextResponse.json({ quiz, cached: false });
  } catch (error) {
    console.error("Quiz generation failed", error);
    return NextResponse.json({ error: "generation_failed" }, { status: 500 });
  }
}
