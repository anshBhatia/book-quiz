import { NextResponse } from "next/server";
import { z } from "zod";
import { Redis } from "@upstash/redis";
import { generateQuizForBook } from "@/lib/quiz-pipeline";
import { Quiz } from "@/lib/schemas";

export const maxDuration = 60;

const QuizRequest = z.object({
  bookId: z.string().min(1),
  bookTitle: z.string().min(1),
  authors: z.array(z.string()),
});

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = QuizRequest.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const { bookId, bookTitle, authors } = parsed.data;
  const cacheKey = `quiz:${bookId}`;

  // Check Redis cache first
  try {
    const cached = await redis.get<Quiz>(cacheKey);
    if (cached) {
      return NextResponse.json({ quiz: cached, cached: true });
    }
  } catch {
    // Cache miss or Redis error — fall through to generation
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "missing_gemini_api_key" }, { status: 500 });
  }

  try {
    const quiz = await generateQuizForBook({ bookId, bookTitle, authors }, apiKey);

    // Store in Redis — no TTL, books don't change
    try {
      await redis.set(cacheKey, quiz);
    } catch {
      // Cache write failure is non-fatal
    }

    return NextResponse.json({ quiz, cached: false });
  } catch (error) {
    console.error("Quiz generation failed", error);
    return NextResponse.json({ error: "generation_failed" }, { status: 500 });
  }
}
