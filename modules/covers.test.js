import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { COVER_FILES } from "./coverFiles.js";
import {
  authorKey,
  buildCoverEntries,
  compactInitials,
  COVER_DIR,
  coverFilenameFor,
  coverHref,
  coverHrefFor,
  normalizeCoverText,
  parseCoverFilename,
  stripLeadingArticle,
  titleKey,
} from "./covers.js";

const coversDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "covers");
const diskFiles = readdirSync(coversDir)
  .filter((name) => /\.jpe?g$/i.test(name))
  .sort((a, b) => a.localeCompare(b, "en"));

describe("cover text normalization", () => {
  it("lowercases, strips punctuation, and folds apostrophes", () => {
    assert.equal(normalizeCoverText("Can't Hurt Me"), "cant hurt me");
    assert.equal(normalizeCoverText("Ender's Game"), "enders game");
    assert.equal(normalizeCoverText("Red Team Blues!"), "red team blues");
  });

  it("strips leading articles", () => {
    assert.equal(stripLeadingArticle("The Martian"), "martian");
    assert.equal(stripLeadingArticle("A Game of Thrones"), "game of thrones");
    assert.equal(titleKey("An Absolutely Remarkable Thing"), "absolutely remarkable thing");
  });

  it("compacts author initials", () => {
    assert.equal(authorKey("George R. R. Martin"), "george rr martin");
    assert.equal(authorKey("George RR Martin"), "george rr martin");
    assert.equal(authorKey("J.K. Rowling"), "jk rowling");
    assert.equal(authorKey("JK Rowling"), "jk rowling");
    assert.equal(compactInitials("J. R. R. Tolkien"), "jrr tolkien");
  });
});

describe("cover filename parsing", () => {
  it("splits Title -- Author.jpg", () => {
    const parsed = parseCoverFilename("Recursion -- Blake Crouch.jpg");
    assert.ok(parsed);
    assert.equal(parsed.title, "Recursion");
    assert.equal(parsed.author, "Blake Crouch");
    assert.equal(parsed.titleKey, "recursion");
    assert.equal(parsed.authorKey, "blake crouch");
  });

  it("rejects names without the separator", () => {
    assert.equal(parseCoverFilename("Recursion.jpg"), null);
  });
});

describe("cover matching against real files", () => {
  it("keeps coverFiles.js in sync with covers/", () => {
    assert.deepEqual(COVER_FILES, diskFiles);
  });

  it("parses every committed JPEG", () => {
    for (const filename of COVER_FILES) {
      assert.ok(parseCoverFilename(filename), filename);
    }
  });

  it("matches each file back to itself", () => {
    const entries = buildCoverEntries();
    for (const entry of entries) {
      assert.equal(
        coverFilenameFor(entry.title, entry.author, entries),
        entry.filename,
        entry.filename
      );
    }
  });

  it("spot-checks Recursion, Red Team Blues, and Customerized Selling", () => {
    assert.equal(
      coverFilenameFor("Recursion", "Blake Crouch"),
      "Recursion -- Blake Crouch.jpg"
    );
    assert.equal(
      coverFilenameFor("recursion", "blake crouch"),
      "Recursion -- Blake Crouch.jpg"
    );
    assert.equal(
      coverFilenameFor("Red Team Blues", "Cory Doctorow"),
      "Red Team Blues -- Cory Doctorow.jpg"
    );
    assert.equal(
      coverFilenameFor("Customerized Selling", "Phil Kreindler"),
      "Customerized Selling -- Phil Kreindler.jpg"
    );
  });

  it("tolerates author initials and title case drift", () => {
    assert.equal(
      coverFilenameFor("A Feast for Crows", "George R. R. Martin"),
      "A feast for crows -- George RR Martin.jpg"
    );
    assert.equal(
      coverFilenameFor("The Martian", "Andy Weir"),
      "The Martian -- Andy Weir.jpg"
    );
    assert.equal(
      coverFilenameFor("A Wizard of Earthsea", "Ursula K. Le Guin"),
      "A Wizard of Earthsea -- Ursula Le Guin.jpg"
    );
    assert.equal(
      coverFilenameFor("Harry Potter and the Sorcerer's Stone", "J.K. Rowling"),
      "Harry Potter and the Sorcerer's Stone -- JK Rowling.jpg"
    );
  });

  it("prefers the unsuffixed Ender's Game file", () => {
    assert.equal(
      coverFilenameFor("Ender's Game", "Orson Scott Card"),
      "Ender's Game -- Orson Scott Card.jpg"
    );
  });

  it("matches a long title to its truncated filename", () => {
    assert.equal(
      coverFilenameFor(
        "The Innovators: How a Group of Hackers, Geniuses, and Geeks Created the Digital Revolution",
        "Walter Isaacson"
      ),
      "The Innovators How a Group of Hackers, Geniuses, and Geeks Created the -- Walter Isaacson.jpg"
    );
  });

  it("returns null when nothing matches", () => {
    assert.equal(coverFilenameFor("No Such Book", "Nobody"), null);
    assert.equal(coverHrefFor({ title: "No Such Book", author: "Nobody" }), null);
  });
});

describe("cover URLs", () => {
  it("uses a site-root-relative covers/ path and encodes the filename", () => {
    assert.equal(COVER_DIR, "covers");
    assert.equal(
      coverHref("Recursion -- Blake Crouch.jpg"),
      "covers/Recursion%20--%20Blake%20Crouch.jpg"
    );
    assert.equal(
      coverHref("Abaddon's Gate -- James Corey.jpg"),
      "covers/Abaddon's%20Gate%20--%20James%20Corey.jpg"
    );
    assert.equal(
      coverHrefFor({ title: "Recursion", author: "Blake Crouch" }),
      "covers/Recursion%20--%20Blake%20Crouch.jpg"
    );
  });
});
