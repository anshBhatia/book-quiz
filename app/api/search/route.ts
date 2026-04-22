import { NextResponse } from "next/server";
import { BookCandidate } from "@/lib/schemas";

type GoogleBooksResponse = {
  items?: Array<{
    id?: string;
    volumeInfo?: {
      title?: string;
      authors?: string[];
      publishedDate?: string;
      imageLinks?: {
        thumbnail?: string;
        smallThumbnail?: string;
      };
      description?: string;
    };
  }>;
};

type OpenLibraryResponse = {
  docs?: Array<{
    key?: string;
    title?: string;
    author_name?: string[];
    first_publish_year?: number;
    cover_i?: number;
    cover_edition_key?: string;
    first_sentence?: string[] | string;
  }>;
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim() ?? "";

  if (query.length < 2) {
    return NextResponse.json({ error: "invalid_query" }, { status: 400 });
  }

  const params = new URLSearchParams({
    q: query,
    maxResults: "5",
  });
  const response = await fetch(`https://www.googleapis.com/books/v1/volumes?${params.toString()}`, {
    next: { revalidate: 3600 },
  });

  if (!response.ok) {
    const candidates = await searchOpenLibrary(query);
    return NextResponse.json({ candidates, source: "open_library" });
  }

  const data = (await response.json()) as GoogleBooksResponse;
  const candidates = (data.items ?? [])
    .map((item) => {
      const volume = item.volumeInfo ?? {};
      const thumbnail = normalizeThumbnail(volume.imageLinks?.thumbnail ?? volume.imageLinks?.smallThumbnail);

      return {
        id: item.id,
        title: volume.title,
        authors: volume.authors ?? [],
        publishedDate: volume.publishedDate,
        thumbnail,
        description: volume.description,
      };
    })
    .filter((candidate) => candidate.id && candidate.title)
    .map((candidate) => BookCandidate.safeParse(candidate))
    .filter((result) => result.success)
    .map((result) => result.data);

  return NextResponse.json({ candidates, source: "google_books" });
}

function normalizeThumbnail(thumbnail?: string) {
  if (!thumbnail) {
    return undefined;
  }

  return thumbnail.replace(/^http:\/\//, "https://");
}

async function searchOpenLibrary(query: string) {
  const params = new URLSearchParams({
    title: query,
    limit: "5",
  });
  const response = await fetch(`https://openlibrary.org/search.json?${params.toString()}`, {
    next: { revalidate: 3600 },
  });

  if (!response.ok) {
    return [];
  }

  const data = (await response.json()) as OpenLibraryResponse;

  return (data.docs ?? [])
    .map((doc) => {
      const stableId = doc.cover_edition_key ?? doc.key?.replace(/^\//, "");
      const firstSentence = Array.isArray(doc.first_sentence) ? doc.first_sentence[0] : doc.first_sentence;

      return {
        id: stableId ? `openlibrary:${stableId}` : undefined,
        title: doc.title,
        authors: doc.author_name ?? [],
        publishedDate: doc.first_publish_year ? String(doc.first_publish_year) : undefined,
        thumbnail: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg` : undefined,
        description: firstSentence,
      };
    })
    .filter((candidate) => candidate.id && candidate.title)
    .map((candidate) => BookCandidate.safeParse(candidate))
    .filter((result) => result.success)
    .map((result) => result.data);
}
