// modules/comparisons.js
// Handles comparison logic and storage

import { addComparison, getComparison, getAllComparisons, getTransaction, getAllBooks, updateBook } from './db.js';
import { updateRatings } from './ranking.js';

/**
 * Comparison class representing a book comparison
 */
class Comparison {
    /**
     * Create a new comparison
     * @param {number} bookAId - ID of the first book
     * @param {number} bookBId - ID of the second book
     * @param {number} winnerId - ID of the winning book
     * @param {number} timestamp - Timestamp of comparison (optional, defaults to now)
     */
    constructor(bookAId, bookBId, winnerId, timestamp = null) {
        if (bookAId === bookBId) {
            throw new Error('Cannot compare a book with itself');
        }

        if (winnerId !== bookAId && winnerId !== bookBId) {
            throw new Error('Winner must be one of the compared books');
        }

        this.bookA = bookAId;
        this.bookB = bookBId;
        this.winner = winnerId;
        this.timestamp = timestamp || Date.now();

        // Ensure consistent ordering (smaller ID first)
        if (this.bookA > this.bookB) {
            [this.bookA, this.bookB] = [this.bookB, this.bookA];
        }
    }

    /**
     * Get the loser of the comparison
     * @returns {number} ID of the losing book
     */
    getLoser() {
        return this.winner === this.bookA ? this.bookB : this.bookA;
    }

    /**
     * Check if this comparison involves specific books
     * @param {number} bookId1 - First book ID
     * @param {number} bookId2 - Second book ID
     * @returns {boolean} True if comparison involves both books
     */
    involvesBooks(bookId1, bookId2) {
        const books = [this.bookA, this.bookB];
        return books.includes(bookId1) && books.includes(bookId2);
    }

    /**
     * Convert to plain object for storage
     * @returns {Object} Plain object representation
     */
    toObject() {
        return {
            bookA: this.bookA,
            bookB: this.bookB,
            winner: this.winner,
            timestamp: this.timestamp
        };
    }

    /**
     * Create Comparison instance from plain object
     * @param {Object} obj - Plain object with comparison data
     * @returns {Comparison} Comparison instance
     */
    static fromObject(obj) {
        return new Comparison(obj.bookA, obj.bookB, obj.winner, obj.timestamp);
    }
}

/**
 * Validate a comparison before storage
 * @param {Comparison} comparison - Comparison to validate
 * @returns {Object} Validation result
 */
function validateComparison(comparison) {
    const errors = [];

    if (!(comparison instanceof Comparison)) {
        errors.push('Must be a Comparison instance');
    }

    if (!comparison.bookA || !comparison.bookB || !comparison.winner) {
        errors.push('Missing required fields');
    }

    if (comparison.bookA === comparison.bookB) {
        errors.push('Cannot compare book with itself');
    }

    if (comparison.winner !== comparison.bookA && comparison.winner !== comparison.bookB) {
        errors.push('Winner must be one of the compared books');
    }

    return {
        isValid: errors.length === 0,
        errors: errors
    };
}

// Comparison storage and retrieval functions

/**
 * Store a comparison in the database
 * @param {Comparison} comparison - Comparison to store
 * @returns {Promise<number>} ID of the stored comparison
 */
async function storeComparison(comparison) {
    const validation = validateComparison(comparison);
    if (!validation.isValid) {
        throw new Error(`Invalid comparison: ${validation.errors.join(', ')}`);
    }

    // Check for duplicate
    const isDuplicate = await checkDuplicateComparison(comparison.bookA, comparison.bookB);
    if (isDuplicate) {
        throw new Error('This book pair has already been compared');
    }

    const comparisonData = comparison.toObject();
    return await addComparison(comparisonData);
}

/**
 * Get all comparisons involving specific book IDs
 * @param {number} bookId1 - First book ID
 * @param {number} bookId2 - Second book ID (optional)
 * @returns {Promise<Array<Comparison>>} Array of Comparison objects
 */
async function getComparisonsByBookIds(bookId1, bookId2 = null) {
    const allComparisons = await getAllComparisons();

    let filteredComparisons;
    if (bookId2 === null) {
        // Get all comparisons involving bookId1
        filteredComparisons = allComparisons.filter(comp =>
            comp.bookA === bookId1 || comp.bookB === bookId1
        );
    } else {
        // Get comparisons between specific book pair
        filteredComparisons = allComparisons.filter(comp =>
            (comp.bookA === bookId1 && comp.bookB === bookId2) ||
            (comp.bookA === bookId2 && comp.bookB === bookId1)
        );
    }

    return filteredComparisons.map(comp => Comparison.fromObject(comp));
}

/**
 * Check if a book pair has already been compared
 * @param {number} bookA - First book ID
 * @param {number} bookB - Second book ID
 * @returns {Promise<boolean>} True if pair has been compared
 */
async function checkDuplicateComparison(bookA, bookB) {
    // Ensure consistent ordering
    if (bookA > bookB) {
        [bookA, bookB] = [bookB, bookA];
    }

    const comparisons = await getComparisonsByBookIds(bookA, bookB);
    return comparisons.length > 0;
}

/**
 * Get comparison history for a book
 * @param {number} bookId - Book ID
 * @param {number} limit - Maximum number of comparisons to return (optional)
 * @returns {Promise<Array<Comparison>>} Array of comparisons sorted by timestamp (newest first)
 */
async function getComparisonHistory(bookId, limit = null) {
    const comparisons = await getComparisonsByBookIds(bookId);
    const sortedComparisons = comparisons.sort((a, b) => b.timestamp - a.timestamp);

    return limit ? sortedComparisons.slice(0, limit) : sortedComparisons;
}

/**
 * Get statistics about comparisons
 * @returns {Promise<Object>} Comparison statistics
 */
async function getComparisonStats() {
    const allComparisons = await getAllComparisons();

    const stats = {
        totalComparisons: allComparisons.length,
        uniqueBookPairs: new Set(),
        booksCompared: new Set(),
        mostActiveBook: null,
        comparisonFrequency: {}
    };

    allComparisons.forEach(comp => {
        // Track unique pairs
        const pairKey = `${Math.min(comp.bookA, comp.bookB)}-${Math.max(comp.bookA, comp.bookB)}`;
        stats.uniqueBookPairs.add(pairKey);

        // Track books involved
        stats.booksCompared.add(comp.bookA);
        stats.booksCompared.add(comp.bookB);

        // Track frequency per book
        stats.comparisonFrequency[comp.bookA] = (stats.comparisonFrequency[comp.bookA] || 0) + 1;
        stats.comparisonFrequency[comp.bookB] = (stats.comparisonFrequency[comp.bookB] || 0) + 1;
    });

    stats.uniqueBookPairs = stats.uniqueBookPairs.size;
    stats.booksCompared = stats.booksCompared.size;

    // Find most active book
    if (Object.keys(stats.comparisonFrequency).length > 0) {
        const mostActive = Object.entries(stats.comparisonFrequency)
            .reduce((max, [bookId, count]) => count > max.count ? { bookId, count } : max,
                   { bookId: null, count: 0 });
        stats.mostActiveBook = mostActive.bookId;
        stats.mostActiveBookComparisons = mostActive.count;
    }

    return stats;
}

// Comparison processing and rating updates

/**
 * Process all comparisons and update book ratings using Elo algorithm
 * @returns {Promise<Object>} Processing results
 */
async function processAllComparisons() {
    console.log('Processing all comparisons to update ratings...');

    // Get all books and create a lookup map
    const books = await getAllBooks();
    const booksMap = new Map(books.map(book => [book.id, book]));

    // Get all comparisons
    const allComparisons = await getAllComparisons();

    if (allComparisons.length === 0) {
        return { message: 'No comparisons to process' };
    }

    console.log(`Processing ${allComparisons.length} comparisons for ${booksMap.size} books...`);

    let processedComparisons = 0;
    let updatedBooks = 0;

    // Process each comparison
    for (const compData of allComparisons) {
        const comparison = Comparison.fromObject(compData);

        // Get the books involved
        const bookA = booksMap.get(comparison.bookA);
        const bookB = booksMap.get(comparison.bookB);

        if (!bookA || !bookB) {
            console.warn(`Books not found for comparison: ${comparison.bookA} vs ${comparison.bookB}`);
            continue;
        }

        // Ensure books have ratings (initialize if needed)
        if (typeof bookA.rating !== 'number') {
            bookA.rating = 1500; // Default rating
        }
        if (typeof bookB.rating !== 'number') {
            bookB.rating = 1500; // Default rating
        }

        // Determine outcome (1 for bookA win, 0 for bookB win)
        const outcome = comparison.winner === comparison.bookA ? 1 : 0;

        // Apply Elo rating update
        const result = updateRatings(bookA.rating, bookB.rating, outcome);

        // Update book ratings
        bookA.rating = result.ratingA;
        bookB.rating = result.ratingB;

        processedComparisons++;
    }

    // Save updated ratings back to database
    for (const book of booksMap.values()) {
        if (book.rating !== undefined) {
            await updateBook(book);
            updatedBooks++;
        }
    }

    console.log(`✅ Processed ${processedComparisons} comparisons, updated ${updatedBooks} books`);

    return {
        processedComparisons,
        updatedBooks,
        totalBooks: booksMap.size,
        message: `Successfully processed ${processedComparisons} comparisons and updated ${updatedBooks} book ratings`
    };
}

/**
 * Process pending comparisons and update ratings (alias for processAllComparisons)
 * @returns {Promise<Object>} Processing results
 */
async function updateRatingsFromComparisons() {
    return await processAllComparisons();
}

// Export the class and utilities
export {
    Comparison,
    validateComparison,
    storeComparison,
    getComparisonsByBookIds,
    checkDuplicateComparison,
    getComparisonHistory,
    getComparisonStats,
    processAllComparisons,
    updateRatingsFromComparisons
};