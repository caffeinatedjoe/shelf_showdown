import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  ...authTables,

  libraries: defineTable({
    // Authenticated owner (required for new libraries).
    userId: v.optional(v.id("users")),
    // Legacy guest key from pre-auth storage; unused by new code.
    ownerKey: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_owner_key", ["ownerKey"]),

  books: defineTable({
    libraryId: v.id("libraries"),
    title: v.string(),
    author: v.string(),
    rating: v.number(),
    comparisons: v.number(),
    timesRead: v.number(),
    // Finish timestamps (ms) from reading-log imports; used for monthly read stats.
    finishedAts: v.optional(v.array(v.number())),
    createdAt: v.number(),
  })
    .index("by_library", ["libraryId"])
    .index("by_library_and_title", ["libraryId", "title"]),

  comparisons: defineTable({
    libraryId: v.id("libraries"),
    bookAId: v.id("books"),
    bookBId: v.id("books"),
    winnerId: v.id("books"),
    ratingA: v.number(),
    ratingB: v.number(),
    timestamp: v.number(),
  })
    .index("by_library", ["libraryId"])
    .index("by_library_and_timestamp", ["libraryId", "timestamp"]),
});
