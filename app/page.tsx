"use client";

import { useReducer, type Dispatch, type FormEvent } from "react";
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
      return { ...state, screen: "quiz", quiz: action.quiz };
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

export default function Home() {
  const [state, dispatch] = useReducer(reducer, initialState);

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = state.query.trim();

    if (query.length < 2) {
      dispatch({ type: "search_error", error: "Enter at least two characters." });
      return;
    }

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
    dispatch({ type: "quiz_start", book });

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
      const data = (await response.json()) as { quiz?: Quiz; error?: string };

      if (!response.ok || !data.quiz) {
        throw new Error(data.error ?? "Quiz generation failed.");
      }

      dispatch({ type: "quiz_success", quiz: data.quiz });
    } catch {
      dispatch({ type: "quiz_error", error: "We could not generate a quiz for that book." });
    }
  }

  return (
    <main className="min-h-dvh px-5 py-8 sm:px-8">
      <div className="mx-auto flex min-h-[calc(100dvh-4rem)] w-full max-w-xl flex-col">
        {state.screen === "search" && (
          <SearchScreen state={state} onSearch={handleSearch} onSelectBook={createQuiz} dispatch={dispatch} />
        )}

        {state.screen === "loading" && state.selectedBook && <LoadingScreen book={state.selectedBook} />}

        {state.screen === "quiz" && state.quiz && (
          <QuizScreen state={state} onChoose={(index) => dispatch({ type: "choose_option", index })} onNext={() => dispatch({ type: "next_question" })} />
        )}

        {state.screen === "done" && state.quiz && (
          <DoneScreen quiz={state.quiz} score={state.score} onReset={() => dispatch({ type: "reset" })} />
        )}
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
          Hello Prerna,
          <br />
          enter a book to check your knowledge.
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

function LoadingScreen({ book }: { book: BookCandidate }) {
  return (
    <section className="flex flex-1 flex-col justify-center">
      <p className="mb-3 text-sm font-medium uppercase tracking-[0.12em] text-[var(--muted)]">Generating your quiz</p>
      <h2 className="font-display text-5xl leading-none">{book.title}</h2>
      <p className="mt-3 text-base text-[var(--muted)]">{book.authors.join(", ") || "Unknown author"}</p>
      <div className="mt-8 space-y-3">
        <div className="h-4 w-5/6 animate-pulse rounded bg-[var(--line)]" />
        <div className="h-4 w-2/3 animate-pulse rounded bg-[var(--line)]" />
        <div className="mt-6 h-12 animate-pulse rounded-md bg-[var(--line)]" />
        <div className="h-12 animate-pulse rounded-md bg-[var(--line)]" />
      </div>
    </section>
  );
}

function QuizScreen({ state, onChoose, onNext }: { state: State; onChoose: (index: number) => void; onNext: () => void }) {
  const quiz = state.quiz!;
  const question = quiz.questions[state.currentIndex];
  const answered = state.selectedIndex !== undefined;

  return (
    <section className="flex flex-1 flex-col py-3">
      <div className="mb-8 flex items-center justify-between text-sm text-[var(--muted)]">
        <span>{quiz.bookTitle}</span>
        <span>
          {state.currentIndex + 1}/{quiz.questions.length}
        </span>
      </div>

      <h2 className="font-display text-4xl leading-tight text-[var(--foreground)]">{question.prompt}</h2>

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
                "w-full rounded-md border bg-[var(--panel)] p-4 text-left text-base leading-snug transition",
                showCorrect ? "border-[var(--accent)] bg-[var(--accent-weak)]" : "",
                showIncorrect ? "border-[var(--danger)] bg-[var(--danger-weak)]" : "",
                !answered ? "border-[var(--line)] hover:border-[var(--accent)]" : "border-[var(--line)]",
              ].join(" ")}
            >
              {option}
            </button>
          );
        })}
      </div>

      {answered && (
        <div className="mt-6 rounded-md border border-[var(--line)] bg-[var(--panel)] p-4">
          <p className="text-sm font-semibold text-[var(--foreground)]">
            {state.selectedIndex === question.correctIndex ? "Correct" : "Not quite"}
          </p>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{question.explanation}</p>
          <button
            type="button"
            onClick={onNext}
            className="mt-5 h-12 w-full rounded-md bg-[var(--foreground)] px-4 text-sm font-semibold text-[var(--background)] transition hover:bg-black"
          >
            {state.currentIndex + 1 === quiz.questions.length ? "See score" : "Next"}
          </button>
        </div>
      )}
    </section>
  );
}

function DoneScreen({ quiz, score, onReset }: { quiz: Quiz; score: number; onReset: () => void }) {
  return (
    <section className="flex flex-1 flex-col justify-center">
      <p className="mb-3 text-sm font-medium uppercase tracking-[0.12em] text-[var(--muted)]">{quiz.bookTitle}</p>
      <h2 className="font-display text-6xl leading-none">
        {score}/{quiz.questions.length}
      </h2>
      <p className="mt-4 text-base leading-7 text-[var(--muted)]">
        You finished the quiz. The best missed answers are worth revisiting while the book is still fresh.
      </p>
      <button
        type="button"
        onClick={onReset}
        className="mt-8 h-12 w-full rounded-md bg-[var(--foreground)] px-4 text-sm font-semibold text-[var(--background)] transition hover:bg-black"
      >
        Quiz another book
      </button>
    </section>
  );
}

function BookCover({ book }: { book: BookCandidate }) {
  if (!book.thumbnail) {
    return <span className="h-20 w-14 rounded bg-[var(--line)]" />;
  }

  return <img src={book.thumbnail} alt="" className="h-20 w-14 rounded object-cover" />;
}
