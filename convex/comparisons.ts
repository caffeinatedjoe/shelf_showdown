import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import {
  assertBookInLibrary,
  getLibraryForUser,
  requireLibraryForUser,
} from "./lib/library";

const comparisonValidator = v.object({
  _id: v.id("comparisons"),
  _creationTime: v.number(),
  libraryId: v.id("libraries"),
  bookAId: v.id("books"),
  bookBId: v.id("books"),
  winnerId: v.id("books"),
  ratingA: v.number(),
  ratingB: v.number(),
  timestamp: v.number(),
});

export const list = query({
  args: {},
  returns: v.array(comparisonValidator),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const library = await getLibraryForUser(ctx, userId);
    if (!library) return [];
    return await ctx.db
      .query("comparisons")
      .withIndex("by_library_and_timestamp", (q) =>
        q.eq("libraryId", library._id)
      )
      .collect();
  },
});

/**
 * Record a binary-insertion matchup. Optionally apply position ratings in the
 * same transaction when a book is placed (avoids partial failure across calls).
 */
export const record = mutation({
  args: {
    winnerId: v.id("books"),
    loserId: v.id("books"),
    ratingUpdates: v.optional(
      v.array(
        v.object({
          bookId: v.id("books"),
          rating: v.number(),
        })
      )
    ),
  },
  returns: comparisonValidator,
  handler: async (ctx, args) => {
    const library = await requireLibraryForUser(ctx);
    if (args.winnerId === args.loserId) {
      throw new Error("Winner and loser must differ");
    }

    const winner = await assertBookInLibrary(
      ctx,
      library._id,
      args.winnerId
    );
    const loser = await assertBookInLibrary(ctx, library._id, args.loserId);

    const beforeA = winner.rating;
    const beforeB = loser.rating;

    await ctx.db.patch(winner._id, {
      comparisons: winner.comparisons + 1,
    });
    await ctx.db.patch(loser._id, {
      comparisons: loser.comparisons + 1,
    });

    if (args.ratingUpdates) {
      for (const update of args.ratingUpdates) {
        const book = await assertBookInLibrary(
          ctx,
          library._id,
          update.bookId
        );
        if (book.rating !== update.rating) {
          await ctx.db.patch(book._id, { rating: update.rating });
        }
      }
    }

    const id = await ctx.db.insert("comparisons", {
      libraryId: library._id,
      bookAId: winner._id,
      bookBId: loser._id,
      winnerId: winner._id,
      ratingA: beforeA,
      ratingB: beforeB,
      timestamp: Date.now(),
    });
    const comparison = await ctx.db.get(id);
    if (!comparison) throw new Error("Failed to record comparison");
    return comparison;
  },
});

export const undoLast = mutation({
  args: {},
  returns: v.union(comparisonValidator, v.null()),
  handler: async (ctx) => {
    const library = await requireLibraryForUser(ctx);
    const comparisons = await ctx.db
      .query("comparisons")
      .withIndex("by_library_and_timestamp", (q) =>
        q.eq("libraryId", library._id)
      )
      .order("desc")
      .take(1);

    const last = comparisons[0];
    if (!last) return null;

    const winner = await ctx.db.get(last.winnerId);
    const loserId =
      last.winnerId === last.bookAId ? last.bookBId : last.bookAId;
    const loser = await ctx.db.get(loserId);

    if (winner && winner.libraryId === library._id) {
      await ctx.db.patch(winner._id, {
        comparisons: Math.max(0, winner.comparisons - 1),
      });
    }
    if (loser && loser.libraryId === library._id) {
      await ctx.db.patch(loser._id, {
        comparisons: Math.max(0, loser.comparisons - 1),
      });
    }

    await ctx.db.delete(last._id);
    return last;
  },
});

/**
 * Record a handful ranking: adjacent pair history, comparison counts, and
 * Bradley-Terry / Elo rating updates in one transaction.
 */
export const recordHandful = mutation({
  args: {
    orderedIds: v.array(v.id("books")),
    ratingUpdates: v.array(
      v.object({
        bookId: v.id("books"),
        rating: v.number(),
      })
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const library = await requireLibraryForUser(ctx);
    if (args.orderedIds.length < 2) {
      throw new Error("Need at least two books in a handful");
    }

    const unique = new Set(args.orderedIds.map(String));
    if (unique.size !== args.orderedIds.length) {
      throw new Error("Handful contains duplicate books");
    }

    /** @type {Map<string, { rating: number, comparisons: number }>} */
    const before = new Map();
    for (const bookId of args.orderedIds) {
      const book = await assertBookInLibrary(ctx, library._id, bookId);
      before.set(bookId, {
        rating: book.rating,
        comparisons: book.comparisons,
      });
    }

    const bump = args.orderedIds.length - 1;
    const now = Date.now();

    // Adjacent pairs for history (best → worst).
    for (let i = 0; i < args.orderedIds.length - 1; i++) {
      const winnerId = args.orderedIds[i];
      const loserId = args.orderedIds[i + 1];
      const winnerBefore = before.get(winnerId);
      const loserBefore = before.get(loserId);
      if (!winnerBefore || !loserBefore) continue;
      await ctx.db.insert("comparisons", {
        libraryId: library._id,
        bookAId: winnerId,
        bookBId: loserId,
        winnerId,
        ratingA: winnerBefore.rating,
        ratingB: loserBefore.rating,
        timestamp: now + i,
      });
    }

    for (const bookId of args.orderedIds) {
      const prev = before.get(bookId);
      if (!prev) continue;
      await ctx.db.patch(bookId, {
        comparisons: prev.comparisons + bump,
      });
    }

    for (const update of args.ratingUpdates) {
      const book = await assertBookInLibrary(ctx, library._id, update.bookId);
      if (book.rating !== update.rating) {
        await ctx.db.patch(book._id, { rating: update.rating });
      }
    }

    return null;
  },
});
