import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { requireUserId } from "./auth";

export async function getLibraryForUser(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">
): Promise<Doc<"libraries"> | null> {
  return await ctx.db
    .query("libraries")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();
}

export async function requireLibraryForUser(
  ctx: QueryCtx | MutationCtx
): Promise<Doc<"libraries">> {
  const userId = await requireUserId(ctx);
  const library = await getLibraryForUser(ctx, userId);
  if (!library) {
    throw new Error("Library not found");
  }
  return library;
}

export async function getOrCreateLibraryForUser(
  ctx: MutationCtx
): Promise<Doc<"libraries">> {
  const userId = await requireUserId(ctx);
  const existing = await getLibraryForUser(ctx, userId);
  if (existing) return existing;

  const id = await ctx.db.insert("libraries", {
    userId,
    createdAt: Date.now(),
  });
  const created = await ctx.db.get(id);
  if (!created) throw new Error("Failed to create library");
  return created;
}

export async function assertBookInLibrary(
  ctx: QueryCtx | MutationCtx,
  libraryId: Id<"libraries">,
  bookId: Id<"books">
): Promise<Doc<"books">> {
  const book = await ctx.db.get(bookId);
  if (!book || book.libraryId !== libraryId) {
    throw new Error("Book not found");
  }
  return book;
}
