import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import {
  getLibraryForUser,
  getOrCreateLibraryForUser,
} from "./lib/library";

const libraryValidator = v.object({
  _id: v.id("libraries"),
  _creationTime: v.number(),
  userId: v.optional(v.id("users")),
  ownerKey: v.optional(v.string()),
  createdAt: v.number(),
});

const userValidator = v.object({
  _id: v.id("users"),
  email: v.union(v.string(), v.null()),
  name: v.union(v.string(), v.null()),
});

export const me = query({
  args: {},
  returns: v.union(userValidator, v.null()),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    if (!user) return null;
    return {
      _id: user._id,
      email: user.email ?? null,
      name: user.name ?? null,
    };
  },
});

export const getOrCreate = mutation({
  args: {},
  returns: libraryValidator,
  handler: async (ctx) => {
    return await getOrCreateLibraryForUser(ctx);
  },
});

export const get = query({
  args: {},
  returns: v.union(libraryValidator, v.null()),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    return await getLibraryForUser(ctx, userId);
  },
});
