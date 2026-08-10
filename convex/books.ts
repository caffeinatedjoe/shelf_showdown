import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import {
  getLibraryForUser,
  getOrCreateLibraryForUser,
  requireLibraryForUser,
} from "./lib/library";

const INITIAL_RATING = 1500;

const bookValidator = v.object({
  _id: v.id("books"),
  _creationTime: v.number(),
  libraryId: v.id("libraries"),
  title: v.string(),
  author: v.string(),
  rating: v.number(),
  comparisons: v.number(),
  timesRead: v.number(),
  finishedAts: v.optional(v.array(v.number())),
  createdAt: v.number(),
});

/**
 * Merge finish timestamps, keeping one entry per calendar day.
 */
function mergeFinishedAts(
  existing: number[] | undefined,
  incoming: number[] | undefined
): number[] | undefined {
  const all = [...(existing ?? []), ...(incoming ?? [])];
  if (all.length === 0) return existing;
  const byDay = new Map<string, number>();
  for (const ts of all) {
    if (!Number.isFinite(ts)) continue;
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) continue;
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    if (!byDay.has(key)) byDay.set(key, ts);
  }
  const merged = [...byDay.values()].sort((a, b) => a - b);
  return merged.length > 0 ? merged : existing;
}

export const list = query({
  args: {},
  returns: v.array(bookValidator),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const library = await getLibraryForUser(ctx, userId);
    if (!library) return [];
    return await ctx.db
      .query("books")
      .withIndex("by_library", (q) => q.eq("libraryId", library._id))
      .collect();
  },
});

export const add = mutation({
  args: {
    title: v.string(),
    author: v.string(),
  },
  returns: bookValidator,
  handler: async (ctx, args) => {
    const library = await getOrCreateLibraryForUser(ctx);
    const title = args.title.trim();
    const author = args.author.trim();
    if (!title || !author) {
      throw new Error("Title and author are required");
    }

    const existing = await ctx.db
      .query("books")
      .withIndex("by_library", (q) => q.eq("libraryId", library._id))
      .collect();
    const duplicate = existing.some(
      (b) =>
        b.title.toLowerCase() === title.toLowerCase() &&
        b.author.toLowerCase() === author.toLowerCase()
    );
    if (duplicate) {
      throw new Error("That book is already in your library");
    }

    const now = Date.now();
    const id = await ctx.db.insert("books", {
      libraryId: library._id,
      title,
      author,
      rating: INITIAL_RATING,
      comparisons: 0,
      timesRead: 1,
      finishedAts: [now],
      createdAt: now,
    });
    const book = await ctx.db.get(id);
    if (!book) throw new Error("Failed to add book");
    return book;
  },
});

export const importMany = mutation({
  args: {
    books: v.array(
      v.object({
        title: v.string(),
        author: v.string(),
        timesRead: v.optional(v.number()),
        finishedAts: v.optional(v.array(v.number())),
      })
    ),
  },
  returns: v.object({ added: v.number(), updated: v.number() }),
  handler: async (ctx, args) => {
    const library = await getOrCreateLibraryForUser(ctx);
    const existing = await ctx.db
      .query("books")
      .withIndex("by_library", (q) => q.eq("libraryId", library._id))
      .collect();
    const byKey = new Map(
      existing.map((b) => [
        `${b.title.toLowerCase()}|${b.author.toLowerCase()}`,
        b,
      ])
    );

    let added = 0;
    let updated = 0;
    for (const row of args.books) {
      const title = row.title.trim();
      const author = row.author.trim();
      if (!title || !author) continue;
      const key = `${title.toLowerCase()}|${author.toLowerCase()}`;
      const incomingFinished = (row.finishedAts ?? []).filter((ts) =>
        Number.isFinite(ts)
      );
      const timesRead = Math.max(
        1,
        Math.floor(row.timesRead ?? 1),
        incomingFinished.length
      );
      const current = byKey.get(key);
      if (current) {
        const finishedAts = mergeFinishedAts(
          current.finishedAts,
          incomingFinished
        );
        const nextTimesRead = Math.max(
          current.timesRead,
          timesRead,
          finishedAts?.length ?? 0
        );
        const timesChanged = nextTimesRead > current.timesRead;
        const prevDates = current.finishedAts ?? [];
        const datesChanged =
          (finishedAts?.length ?? 0) !== prevDates.length ||
          (finishedAts ?? []).some((ts, i) => ts !== prevDates[i]);
        if (timesChanged || datesChanged) {
          await ctx.db.patch(current._id, {
            timesRead: nextTimesRead,
            ...(finishedAts ? { finishedAts } : {}),
          });
          current.timesRead = nextTimesRead;
          current.finishedAts = finishedAts;
          updated++;
        }
        continue;
      }
      const now = Date.now();
      const finishedAts =
        mergeFinishedAts(undefined, incomingFinished) ?? undefined;
      const id = await ctx.db.insert("books", {
        libraryId: library._id,
        title,
        author,
        rating: INITIAL_RATING,
        comparisons: 0,
        timesRead,
        ...(finishedAts ? { finishedAts } : {}),
        createdAt: now,
      });
      byKey.set(key, {
        _id: id,
        _creationTime: 0,
        libraryId: library._id,
        title,
        author,
        rating: INITIAL_RATING,
        comparisons: 0,
        timesRead,
        finishedAts,
        createdAt: now,
      });
      added++;
    }
    return { added, updated };
  },
});

export const remove = mutation({
  args: {
    bookId: v.id("books"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const library = await requireLibraryForUser(ctx);
    const book = await ctx.db.get(args.bookId);
    if (!book || book.libraryId !== library._id) {
      throw new Error("Book not found");
    }

    const comparisons = await ctx.db
      .query("comparisons")
      .withIndex("by_library", (q) => q.eq("libraryId", library._id))
      .collect();
    for (const comparison of comparisons) {
      if (
        comparison.bookAId === args.bookId ||
        comparison.bookBId === args.bookId
      ) {
        await ctx.db.delete(comparison._id);
      }
    }

    await ctx.db.delete(args.bookId);
    return null;
  },
});

export const clearAll = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const library = await requireLibraryForUser(ctx);
    const books = await ctx.db
      .query("books")
      .withIndex("by_library", (q) => q.eq("libraryId", library._id))
      .collect();
    const comparisons = await ctx.db
      .query("comparisons")
      .withIndex("by_library", (q) => q.eq("libraryId", library._id))
      .collect();

    for (const comparison of comparisons) {
      await ctx.db.delete(comparison._id);
    }
    for (const book of books) {
      await ctx.db.delete(book._id);
    }
    return null;
  },
});

/** Assign position-based ratings after handful placement / merge. */
export const setRatings = mutation({
  args: {
    updates: v.array(
      v.object({
        bookId: v.id("books"),
        rating: v.number(),
      })
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const library = await requireLibraryForUser(ctx);
    for (const update of args.updates) {
      const book = await ctx.db.get(update.bookId);
      if (!book || book.libraryId !== library._id) {
        throw new Error("Book not found");
      }
      await ctx.db.patch(update.bookId, { rating: update.rating });
    }
    return null;
  },
});
