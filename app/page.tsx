"use client";

import { useReducer, useState, useEffect, useRef, type Dispatch, type FormEvent } from "react";
import { sendGAEvent } from "@next/third-parties/google";
import type { BookCandidate, Quiz } from "@/lib/schemas";

type State = {
  screen: "search" | "loading" | "quiz" | "done";
  query: string;
  candidates: BookCandidate[];
  selectedBook?: BookCandidate;
  quiz?: Quiz;
  currentIndex: number;
  selectedIndex?: number;
  score: number;
  searchLoading: boolean;
  error?: string;
};

type Action =
  | { type: "set_query"; query: string }
  | { type: "search_start" }
  | { type: "search_success"; candidates: BookCandidate[] }
  | { type: "search_error"; error: string }
  | { type: "quiz_start"; book: BookCandidate }
  | { type: "quiz_success"; quiz: Quiz }
  | { type: "quiz_ready" }
  | { type: "quiz_error"; error: string }
  | { type: "choose_option"; index: number }
  | { type: "next_question" }
  | { type: "reset" };

const initialState: State = {
  screen: "search",
  query: "",
  candidates: [],
  currentIndex: 0,
  score: 0,
  searchLoading: false,
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "set_query":
      return { ...state, query: action.query, error: undefined };
    case "search_start":
      return { ...state, searchLoading: true, candidates: [], error: undefined };
    case "search_success":
      return { ...state, searchLoading: false, candidates: action.candidates };
    case "search_error":
      return { ...state, searchLoading: false, error: action.error };
    case "quiz_start":
      return {
        ...state,
        screen: "loading",
        selectedBook: action.book,
        quiz: undefined,
        selectedIndex: undefined,
        currentIndex: 0,
        score: 0,
        error: undefined,
      };
    case "quiz_success":
      return { ...state, quiz: action.quiz };
    case "quiz_ready":
      return { ...state, screen: "quiz" };
    case "quiz_error":
      return { ...state, screen: "search", error: action.error };
    case "choose_option": {
      if (state.selectedIndex !== undefined || !state.quiz) {
        return state;
      }

      const question = state.quiz.questions[state.currentIndex];
      const isCorrect = action.index === question.correctIndex;

      return {
        ...state,
        selectedIndex: action.index,
        score: isCorrect ? state.score + 1 : state.score,
      };
    }
    case "next_question": {
      if (!state.quiz) {
        return state;
      }

      const nextIndex = state.currentIndex + 1;

      if (nextIndex >= state.quiz.questions.length) {
        return { ...state, screen: "done", selectedIndex: undefined };
      }

      return { ...state, currentIndex: nextIndex, selectedIndex: undefined };
    }
    case "reset":
      return initialState;
    default:
      return state;
  }
}

const TEST_BOOK: BookCandidate = {
  id: "__test__",
  title: "The Loading State Test",
  authors: ["Test Author"],
  publishedDate: "2024",
};

const TEST_QUIZ: Quiz = {
  bookId: "__test__",
  bookTitle: "The Loading State Test",
  authors: ["Test Author"],
  generatedAt: new Date().toISOString(),
  questions: Array.from({ length: 10 }, (_, i) => ({
    id: `q${i + 1}`,
    category: "event" as const,
    prompt: `This is placeholder question ${i + 1}. Which of these is the correct answer?`,
    options: ["Distractor one", "The correct answer", "Distractor two", "Distractor three"],
    correctIndex: 1,
    explanation: `Explanation for question ${i + 1}. This is just a test quiz to preview the UI.`,
  })),
};

export default function Home() {
  const [state, dispatch] = useReducer(reducer, initialState);

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = state.query.trim();

    if (query.length < 2) {
      dispatch({ type: "search_error", error: "Enter at least two characters." });
      return;
    }

    if (query.toLowerCase() === "lets test it") {
      dispatch({ type: "search_success", candidates: [TEST_BOOK] });
      return;
    }

    sendGAEvent("event", "book_searched", { query });
    dispatch({ type: "search_start" });

    try {
      const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
      const data = (await response.json()) as { candidates?: BookCandidate[]; error?: string };

      if (!response.ok) {
        throw new Error(data.error ?? "Search failed.");
      }

      dispatch({ type: "search_success", candidates: data.candidates ?? [] });
    } catch {
      dispatch({ type: "search_error", error: "Could not search books. Try again." });
    }
  }

  async function createQuiz(book: BookCandidate) {
    sendGAEvent("event", "book_selected", { book_title: book.title, author: book.authors[0] ?? "Unknown" });
    dispatch({ type: "quiz_start", book });
    sendGAEvent("event", "quiz_started", { book_title: book.title });

    if (book.id === "__test__") {
      setTimeout(() => dispatch({ type: "quiz_success", quiz: TEST_QUIZ }), 12000);
      return;
    }

    try {
      const response = await fetch("/api/quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookId: book.id,
          bookTitle: book.title,
          authors: book.authors,
        }),
      });
      const data = (await response.json()) as { quiz?: Quiz; cached?: boolean; error?: string };

      if (!response.ok || !data.quiz) {
        throw new Error(data.error ?? "Quiz generation failed.");
      }

      sendGAEvent("event", "quiz_generated", { book_title: book.title, was_cached: data.cached ?? false });
      dispatch({ type: "quiz_success", quiz: data.quiz });
    } catch (err) {
      const errorReason = err instanceof Error ? err.message : "unknown";
      sendGAEvent("event", "generation_failed", { book_title: book.title, error_reason: errorReason });
      dispatch({ type: "quiz_error", error: "We could not generate a quiz for that book." });
    }
  }

  return (
    <main className="min-h-dvh">
      {state.screen === "quiz" && state.quiz && (
        <div className="fixed inset-x-0 top-0 z-50 h-1 bg-[var(--line)]">
          <div
            className="h-full bg-[var(--foreground)]"
            style={{
              width: `${((state.currentIndex + 1) / state.quiz.questions.length) * 100}%`,
              transition: "width 300ms ease-out",
            }}
          />
        </div>
      )}
      <div className="px-5 py-8 sm:px-8">
      <div className="mx-auto flex min-h-[calc(100dvh-4rem)] w-full max-w-xl flex-col">
        {state.screen === "search" && (
          <SearchScreen state={state} onSearch={handleSearch} onSelectBook={createQuiz} dispatch={dispatch} />
        )}

        {state.screen === "loading" && state.selectedBook && (
          <LoadingScreen
            book={state.selectedBook}
            isComplete={state.quiz !== undefined}
            onComplete={() => dispatch({ type: "quiz_ready" })}
          />
        )}

        {state.screen === "quiz" && state.quiz && (
          <QuizScreen state={state} onChoose={(index) => dispatch({ type: "choose_option", index })} onNext={() => dispatch({ type: "next_question" })} />
        )}

        {state.screen === "done" && state.quiz && (
          <DoneScreen
            quiz={state.quiz}
            score={state.score}
            onReset={() => dispatch({ type: "reset" })}
            onRetry={() => state.selectedBook && createQuiz(state.selectedBook)}
          />
        )}
      </div>
      <p className="mt-4 text-center text-sm text-[var(--muted)]">
        Made with ♥ by{" "}
        <a href="https://x.com/anshpng" target="_blank" rel="noopener noreferrer" className="underline hover:text-[var(--foreground)] transition-colors">
          ansh.png
        </a>
      </p>
      </div>
    </main>
  );
}

function SearchScreen({
  state,
  onSearch,
  onSelectBook,
  dispatch,
}: {
  state: State;
  onSearch: (event: FormEvent<HTMLFormElement>) => void;
  onSelectBook: (book: BookCandidate) => void;
  dispatch: Dispatch<Action>;
}) {
  return (
    <section className="flex flex-1 flex-col justify-center pb-8">
      <div className="mb-8">
        <p className="mb-3 text-sm font-medium uppercase tracking-[0.12em] text-[var(--muted)]">Book Quiz</p>
        <h1 className="font-display text-5xl leading-[0.95] text-[var(--foreground)] sm:text-6xl">
          Enter a book to check your knowledge.
        </h1>
      </div>

      <form onSubmit={onSearch} className="space-y-3">
        <input
          value={state.query}
          onChange={(event) => dispatch({ type: "set_query", query: event.target.value })}
          placeholder="The Great Gatsby"
          className="h-14 w-full rounded-md border border-[var(--line)] bg-[var(--panel)] px-4 text-base text-[var(--foreground)] outline-none transition focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent-weak)]"
        />
        <button
          type="submit"
          disabled={state.searchLoading}
          className="h-12 w-full rounded-md bg-[var(--foreground)] px-4 text-sm font-semibold text-[var(--background)] transition hover:bg-black disabled:opacity-60"
        >
          {state.searchLoading ? "Searching..." : "Find book"}
        </button>
      </form>

      {state.error && <p className="mt-4 text-sm text-[var(--danger)]">{state.error}</p>}

      {state.candidates.length > 0 && (
        <div className="mt-7 space-y-3">
          {state.candidates.map((book) => (
            <button
              key={book.id}
              type="button"
              onClick={() => onSelectBook(book)}
              className="grid w-full grid-cols-[56px_1fr] gap-4 rounded-md border border-[var(--line)] bg-[var(--panel)] p-3 text-left transition hover:border-[var(--accent)]"
            >
              <BookCover book={book} />
              <span className="min-w-0 self-center">
                <span className="block truncate text-base font-semibold text-[var(--foreground)]">{book.title}</span>
                <span className="mt-1 block truncate text-sm text-[var(--muted)]">
                  {book.authors.join(", ") || "Unknown author"}
                  {book.publishedDate ? ` · ${book.publishedDate.slice(0, 4)}` : ""}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function LoadingScreen({
  book,
  isComplete,
  onComplete,
}: {
  book: BookCandidate;
  isComplete: boolean;
  onComplete: () => void;
}) {
  const [progress, setProgress] = useState(0);
  const [overlayExiting, setOverlayExiting] = useState(false);
  const [labelVisible, setLabelVisible] = useState(true);
  const [label, setLabel] = useState("Reading the book…");
  const completingRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  // Crawl 0 → 88% over ~8s
  useEffect(() => {
    let current = 0;
    const id = setInterval(() => {
      if (completingRef.current) {
        clearInterval(id);
        return;
      }
      current += 1;
      if (current >= 88) {
        clearInterval(id);
        setProgress(88);
      } else {
        setProgress(current);
      }
    }, 90);
    return () => clearInterval(id);
  }, []);

  // When quiz arrives: rush to 100%, pause, then fade out
  useEffect(() => {
    if (!isComplete) return;
    completingRef.current = true;
    setProgress(100);
    let t2: ReturnType<typeof setTimeout> | undefined;
    const t1 = setTimeout(() => {
      setOverlayExiting(true);
      t2 = setTimeout(() => onCompleteRef.current(), 400);
    }, 900);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [isComplete]);

  // Cross-fade label only when the stage boundary changes (not on every progress tick)
  const stage = progress >= 100 ? 3 : progress >= 70 ? 2 : progress >= 30 ? 1 : 0;
  const prevStageRef = useRef(0);
  useEffect(() => {
    if (stage === prevStageRef.current) return;
    prevStageRef.current = stage;
    setLabelVisible(false);
    const id = setTimeout(() => {
      setLabel(["Reading the book…", "Understanding key ideas…", "Creating your quiz…", "Ready!"][stage]);
      setLabelVisible(true);
    }, 200);
    return () => clearTimeout(id);
  }, [stage]);

  return (
    <section className="flex flex-1 flex-col justify-center">
      <p className="mb-3 text-sm font-medium uppercase tracking-[0.12em] text-[var(--muted)]">Generating your quiz</p>
      <h2 className="font-display text-5xl leading-none">{book.title}</h2>
      <p className="mt-3 text-base text-[var(--muted)]">{book.authors.join(", ") || "Unknown author"}</p>

      {/* Skeleton — dimmed */}
      <div className="mt-8 space-y-3 opacity-40">
        <div className="h-4 w-5/6 rounded bg-[var(--line)]" />
        <div className="h-4 w-2/3 rounded bg-[var(--line)]" />
        <div className="mt-6 h-12 rounded-md bg-[var(--line)]" />
        <div className="h-12 rounded-md bg-[var(--line)]" />
      </div>

      {/* Progress bar + status — below skeleton, fades out when ready */}
      <div
        className="mt-8 flex flex-col items-center"
        style={{ opacity: overlayExiting ? 0 : 1, transition: "opacity 400ms ease" }}
      >
        <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-[var(--line)]">
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-[var(--foreground)]"
            style={{
              width: `${progress}%`,
              transition:
                progress === 0 ? "none" :
                progress >= 100 ? "width 500ms cubic-bezier(0.4,0,0.2,1)" :
                "width 200ms linear",
            }}
          />
        </div>
        <p
          className="mt-3 text-sm text-[var(--muted)]"
          style={{
            opacity: labelVisible ? 1 : 0,
            transform: labelVisible ? "translateY(0)" : "translateY(-6px)",
            transition: "opacity 200ms ease, transform 200ms ease",
          }}
        >
          {label}
        </p>
      </div>
    </section>
  );
}

function QuizScreen({ state, onChoose, onNext }: { state: State; onChoose: (index: number) => void; onNext: () => void }) {
  const quiz = state.quiz!;
  const question = quiz.questions[state.currentIndex];
  const answered = state.selectedIndex !== undefined;
  const isLastQuestion = state.currentIndex + 1 === quiz.questions.length;

  function handleNext() {
    if (isLastQuestion) {
      const total = quiz.questions.length;
      sendGAEvent("event", "quiz_completed", {
        book_title: quiz.bookTitle,
        score: state.score,
        total,
        percentage: Math.round((state.score / total) * 100),
      });
    }
    onNext();
  }

  return (
    <section className="flex flex-1 flex-col py-3">
      <div className="mb-8 flex items-center justify-between text-sm text-[var(--muted)]">
        <span>{quiz.bookTitle}</span>
        <span>
          {state.currentIndex + 1}/{quiz.questions.length}
        </span>
      </div>

      <h2 className="text-[28px] font-[550] leading-tight text-[var(--foreground)]">{question.prompt}</h2>

      <div className="mt-7 space-y-3">
        {question.options.map((option, index) => {
          const isSelected = state.selectedIndex === index;
          const isCorrect = question.correctIndex === index;
          const showCorrect = answered && isCorrect;
          const showIncorrect = answered && isSelected && !isCorrect;

          return (
            <button
              key={option}
              type="button"
              onClick={() => onChoose(index)}
              disabled={answered}
              className={[
                "w-full rounded-md border p-4 text-left text-base leading-snug transition",
                showCorrect
                  ? "border-green-300 bg-green-50 text-[var(--foreground)]"
                  : showIncorrect
                  ? "border-orange-300 bg-orange-50 text-[var(--foreground)]"
                  : answered
                  ? "border-[var(--line)] bg-[var(--panel)] opacity-50"
                  : "border-[var(--line)] bg-[var(--panel)] hover:border-[var(--accent)]",
              ].join(" ")}
            >
              {option}
            </button>
          );
        })}
      </div>

      {answered && (
        <div className={[
          "mt-6 rounded-md border p-4",
          state.selectedIndex === question.correctIndex
            ? "border-green-200 bg-green-50"
            : "border-orange-200 bg-orange-50",
        ].join(" ")}>
          <p className="text-sm font-semibold text-[var(--foreground)]">
            {state.selectedIndex === question.correctIndex ? "Correct" : "Not quite"}
          </p>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{question.explanation}</p>
          <button
            type="button"
            onClick={handleNext}
            className="mt-5 h-12 w-full rounded-md bg-[var(--foreground)] px-4 text-sm font-semibold text-[var(--background)] transition hover:bg-black"
          >
            {isLastQuestion ? "See score" : "Next"}
          </button>
        </div>
      )}
    </section>
  );
}

function scoreMessage(score: number, total: number): string {
  if (score === total) return "Perfect score. You really got this one.";
  const ratio = score / total;
  if (ratio >= 0.8) return "Nice. You've retained most of it. Just a couple to clean up.";
  if (ratio >= 0.6) return "Solid understanding. A few gaps left worth tightening.";
  if (ratio >= 0.3) return "You've got the basics, but some key ideas slipped.";
  if (score === 0) return "Looks like a lot didn't stick yet. Good time to revisit and lock it in.";
  return "A lot slipped this time. Worth a quick revisit while it's fresh.";
}

function DoneScreen({ quiz, score, onReset, onRetry }: { quiz: Quiz; score: number; onReset: () => void; onRetry: () => void }) {
  const total = quiz.questions.length;
  const percentage = Math.round((score / total) * 100);

  function handleRetry() {
    sendGAEvent("event", "again_clicked", {
      book_title: quiz.bookTitle,
      previous_score: score,
      previous_total: total,
      previous_percentage: percentage,
    });
    onRetry();
  }

  function handleReset() {
    sendGAEvent("event", "quiz_another_book_clicked", {
      book_title: quiz.bookTitle,
      score,
      percentage,
    });
    onReset();
  }

  return (
    <section className="flex flex-1 flex-col justify-center">
      <p className="mb-3 text-sm font-medium uppercase tracking-[0.12em] text-[var(--muted)]">{quiz.bookTitle}</p>
      <h2 className="font-display text-6xl leading-none">
        {score}/{total}
      </h2>
      <p className="mt-4 text-base leading-7 text-[var(--muted)]">
        {scoreMessage(score, total)}
      </p>
      <div className="mt-8 flex gap-3">
        <button
          type="button"
          onClick={handleRetry}
          className="h-12 flex-1 rounded-md border border-[var(--line)] bg-[var(--panel)] px-4 text-sm font-semibold text-[var(--foreground)] transition hover:border-[var(--accent)]"
        >
          Try again
        </button>
        <button
          type="button"
          onClick={handleReset}
          className="h-12 flex-1 rounded-md bg-[var(--foreground)] px-4 text-sm font-semibold text-[var(--background)] transition hover:bg-black"
        >
          Quiz another book
        </button>
      </div>
      <p className="mt-6 text-sm text-[var(--muted)]">
        Got some feedback?{" "}
        <a href="mailto:anshbhatia20@gmail.com?subject=Book Quiz Feedback" className="underline hover:text-[var(--foreground)] transition-colors">
          Send it here
        </a>
      </p>
    </section>
  );
}

function BookCover({ book }: { book: BookCandidate }) {
  if (!book.thumbnail) {
    return <span className="h-20 w-14 rounded bg-[var(--line)]" />;
  }

  return <img src={book.thumbnail} alt="" className="h-20 w-14 rounded object-cover" />;
}
