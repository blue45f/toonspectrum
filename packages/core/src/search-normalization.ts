import type { Title } from "./types";

const EMPTY: readonly string[] = [];

type SearchText = {
  title: string;
  author: string;
  altTitles: string[];
  tags: string[];
  genres: string[];
  joinedTags: string;
  joinedGenres: string;
  synopsis: string;
};

type Entry = {
  title: string;
  author: string;
  artist: string | undefined;
  synopsis: string | undefined;
  altTitles: string[];
  tags: string[];
  genres: string[];
  text: SearchText;
};

// Weak keys release old snapshots instead of accumulating every historic catalog.
// Snapshot comparisons also invalidate in-place KMAS edits, not just new objects.
const cache = new WeakMap<Title, Entry>();

function norm(value: string): string {
  return value.toLowerCase().replace(/\s+/g, "");
}

function same(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

export function normalizedSearchText(title: Title): SearchText {
  const previous = cache.get(title);
  const altTitles = title.altTitles ?? EMPTY;
  if (
    previous && previous.title === title.title && previous.author === title.author
    && previous.artist === title.artist && previous.synopsis === title.synopsis
    && same(previous.altTitles, altTitles) && same(previous.tags, title.tags)
    && same(previous.genres, title.genres)
  ) return previous.text;

  const tags = title.tags.map(norm);
  const genres = title.genres.map(norm);
  const text: SearchText = {
    title: norm(title.title),
    author: norm(title.author + (title.artist ?? "")),
    altTitles: altTitles.map(norm),
    tags,
    genres,
    joinedTags: tags.join(""),
    joinedGenres: genres.join(""),
    synopsis: title.synopsis ? norm(title.synopsis) : "",
  };
  cache.set(title, {
    title: title.title, author: title.author, artist: title.artist,
    synopsis: title.synopsis, altTitles: [...altTitles], tags: [...title.tags],
    genres: [...title.genres], text,
  });
  return text;
}
