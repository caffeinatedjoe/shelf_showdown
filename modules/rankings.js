// modules/rankings.js
// Handles ranking snapshots and persistence

import { addRanking, getRanking, updateRanking, getAllRankings, getAllBooks } from './db.js';
import { calculateRanking } from './ranking.js';

/**
 * Ranking class representing a snapshot of book rankings
 */
class Ranking {
    /**
     * Create a new ranking snapshot
     * @param {Array} rankedBooks - Array of book objects sorted by rating (highest first)
     * @param {number} timestamp - Timestamp when ranking was calculated (optional, defaults to now)
     * @param {Object} metadata - Additional metadata about the ranking
     */
    constructor(rankedBooks, timestamp = null, metadata = {}) {
        this.rankedBooks = [...rankedBooks]; // Copy the array
        this.timestamp = timestamp || Date.now();
        this.metadata = { ...metadata };

        // Validate that books have ratings
        this.rankedBooks.forEach((book, index) => {
            if (typeof book.rating !== 'number') {
                throw new Error(`Book at position ${index} (${book.title}) has invalid rating: ${book.rating}`);
            }
        });
    }

    /**
     * Get the rank position of a specific book
     * @param {number} bookId - Book ID to find
     * @returns {number|null} Rank position (1-based) or null if not found
     */
    getBookRank(bookId) {
        const index = this.rankedBooks.findIndex(book => book.id === bookId);
        return index >= 0 ? index + 1 : null;
    }

    /**
     * Get a book by its rank position
     * @param {number} position - Rank position (1-based)
     * @returns {Object|null} Book object or null if position is invalid
     */
    getBookByRank(position) {
        const index = position - 1;
        return this.rankedBooks[index] || null;
    }

    /**
     * Get top N books from the ranking
     * @param {number} n - Number of top books to return
     * @returns {Array} Array of top N books
     */
    getTopBooks(n) {
        return this.rankedBooks.slice(0, n);
    }

    /**
     * Convert to plain object for storage
     * @returns {Object} Plain object representation
     */
    toObject() {
        return {
            rankedBooks: this.rankedBooks,
            timestamp: this.timestamp,
            metadata: this.metadata
        };
    }

    /**
     * Create Ranking instance from plain object
     * @param {Object} obj - Plain object with ranking data
     * @returns {Ranking} Ranking instance
     */
    static fromObject(obj) {
        return new Ranking(obj.rankedBooks, obj.timestamp, obj.metadata);
    }

    /**
     * Get ranking statistics
     * @returns {Object} Statistics about the ranking
     */
    getStats() {
        if (this.rankedBooks.length === 0) {
            return { totalBooks: 0 };
        }

        const ratings = this.rankedBooks.map(book => book.rating);
        const minRating = Math.min(...ratings);
        const maxRating = Math.max(...ratings);
        const avgRating = ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length;

        return {
            totalBooks: this.rankedBooks.length,
            highestRating: maxRating,
            lowestRating: minRating,
            averageRating: Math.round(avgRating * 100) / 100,
            ratingRange: maxRating - minRating
        };
    }
}

// Ranking storage and retrieval functions

/**
 * Store a ranking snapshot in the database
 * @param {Ranking} ranking - Ranking to store
 * @returns {Promise<number>} ID of the stored ranking
 */
async function storeRanking(ranking) {
    if (!(ranking instanceof Ranking)) {
        throw new Error('Must provide a Ranking instance');
    }

    const rankingData = ranking.toObject();
    return await addRanking(rankingData);
}

/**
 * Calculate current ranking from all books with ratings
 * @param {Object} metadata - Optional metadata to include
 * @returns {Promise<Ranking>} Current ranking snapshot
 */
async function calculateCurrentRanking(metadata = {}) {
    const books = await getAllBooks();

    // Filter books that have ratings
    const ratedBooks = books.filter(book => typeof book.rating === 'number' && !isNaN(book.rating));

    if (ratedBooks.length === 0) {
        throw new Error('No books with ratings found. Initialize book ratings first.');
    }

    // Sort books by rating (highest first) using the ranking algorithm
    const rankedBooks = calculateRanking(ratedBooks);

    // Add metadata about the calculation
    const calcMetadata = {
        ...metadata,
        totalBooks: books.length,
        ratedBooks: ratedBooks.length,
        unratedBooks: books.length - ratedBooks.length,
        calculationMethod: 'elo-rating-sort'
    };

    return new Ranking(rankedBooks, Date.now(), calcMetadata);
}

/**
 * Get the latest ranking snapshot
 * @returns {Promise<Ranking|null>} Latest ranking or null if none exists
 */
async function getLatestRanking() {
    const allRankings = await getAllRankings();

    if (allRankings.length === 0) {
        return null;
    }

    // Sort by timestamp (newest first) and get the first one
    const sortedRankings = allRankings.sort((a, b) => b.timestamp - a.timestamp);
    return Ranking.fromObject(sortedRankings[0]);
}

/**
 * Get ranking by ID
 * @param {number} id - Ranking ID
 * @returns {Promise<Ranking|null>} Ranking or null if not found
 */
async function getRankingById(id) {
    try {
        const rankingData = await getRanking(id);
        return rankingData ? Ranking.fromObject(rankingData) : null;
    } catch (error) {
        console.error('Error getting ranking by ID:', error);
        return null;
    }
}

/**
 * Get all ranking snapshots sorted by timestamp (newest first)
 * @param {number} limit - Maximum number of rankings to return (optional)
 * @returns {Promise<Array<Ranking>>} Array of ranking snapshots
 */
async function getAllRankingsHistory(limit = null) {
    const allRankings = await getAllRankings();
    const sortedRankings = allRankings
        .sort((a, b) => b.timestamp - a.timestamp)
        .map(data => Ranking.fromObject(data));

    return limit ? sortedRankings.slice(0, limit) : sortedRankings;
}

/**
 * Update the current ranking (recalculate and store)
 * @param {Object} metadata - Optional metadata to include
 * @returns {Promise<Ranking>} Updated ranking snapshot
 */
async function updateCurrentRanking(metadata = {}) {
    const currentRanking = await calculateCurrentRanking(metadata);
    await storeRanking(currentRanking);
    return currentRanking;
}

/**
 * Get ranking statistics over time
 * @returns {Promise<Object>} Ranking history statistics
 */
async function getRankingStats() {
    const allRankings = await getAllRankings();

    if (allRankings.length === 0) {
        return { totalRankings: 0 };
    }

    const rankings = allRankings.map(data => Ranking.fromObject(data));

    // Calculate trends
    const stats = {
        totalRankings: rankings.length,
        oldestRanking: new Date(Math.min(...rankings.map(r => r.timestamp))),
        newestRanking: new Date(Math.max(...rankings.map(r => r.timestamp))),
        rankingFrequency: {},
        bookMovement: {}
    };

    // Analyze ranking changes over time
    if (rankings.length > 1) {
        // Simple analysis: track how often rankings change
        const sortedByTime = rankings.sort((a, b) => a.timestamp - b.timestamp);

        for (let i = 1; i < sortedByTime.length; i++) {
            const prevRanking = sortedByTime[i - 1];
            const currRanking = sortedByTime[i];

            // Count position changes
            currRanking.rankedBooks.forEach((book, newPosition) => {
                const oldPosition = prevRanking.getBookRank(book.id);
                if (oldPosition !== null && oldPosition !== newPosition + 1) {
                    const movement = oldPosition - (newPosition + 1);
                    stats.bookMovement[book.id] = (stats.bookMovement[book.id] || 0) + movement;
                }
            });
        }
    }

    return stats;
}

// Export the class and functions
export {
    Ranking,
    storeRanking,
    calculateCurrentRanking,
    getLatestRanking,
    getRankingById,
    getAllRankingsHistory,
    updateCurrentRanking,
    getRankingStats
};