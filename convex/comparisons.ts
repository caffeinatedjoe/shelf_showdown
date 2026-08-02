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
 * Record a binary-insertion matchup. Ratings are assigned on placement
 * (books:setRatings), so this only logs the pick and bumps comparison counts.
 */
export const record = mutation({
  args: {
    winnerId: v.id("books"),
    loserId: v.id("books"),
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
