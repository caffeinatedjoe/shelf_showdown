// Ranking module for Elo-based book ranking system

// Constants
const INITIAL_RATING = 1500;
const K_FACTOR = 32;

// Elo rating calculation functions

/**
 * Calculate expected score for player A against player B
 * @param {number} ratingA - Rating of player A
 * @param {number} ratingB - Rating of player B
 * @returns {number} Expected score for A (between 0 and 1)
 */
function calculateExpectedScore(ratingA, ratingB) {
    return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

/**
 * Update ratings after a comparison
 * @param {number} ratingA - Current rating of book A
 * @param {number} ratingB - Current rating of book B
 * @param {number} outcome - 1 if A wins, 0 if B wins, 0.5 for draw
 * @returns {Object} New ratings {ratingA: newRatingA, ratingB: newRatingB}
 */
function updateRatings(ratingA, ratingB, outcome) {
    const expectedA = calculateExpectedScore(ratingA, ratingB);
    const expectedB = 1 - expectedA;

    const newRatingA = ratingA + K_FACTOR * (outcome - expectedA);
    const newRatingB = ratingB + K_FACTOR * ((1 - outcome) - expectedB);

    return {
        ratingA: Math.round(newRatingA),
        ratingB: Math.round(newRatingB)
    };
}

/**
 * Validate rating value
 * @param {number} rating - Rating to validate
 * @returns {boolean} True if valid
 */
function isValidRating(rating) {
    return typeof rating === 'number' && rating >= 0 && rating <= 4000 && !isNaN(rating);
}

/**
 * Calculate ranking from a list of books with ratings
 * @param {Array} books - Array of book objects with id, title, rating
 * @returns {Array} Sorted array of books by rating descending
 */
function calculateRanking(books) {
    return books.slice().sort((a, b) => b.rating - a.rating);
}

// Test and utility functions

/**
 * Test basic Elo calculations with known scenarios
 */
function testEloCalculations() {
    console.log('Testing Elo calculations...');

    // Test 1: Equal ratings, A wins
    let result = updateRatings(1500, 1500, 1);
    console.log('Equal ratings (1500 vs 1500), A wins:', result);
    // Expected: A gains 16, B loses 16

    // Test 2: Higher rated wins
    result = updateRatings(1600, 1400, 1);
    console.log('1600 vs 1400, higher wins:', result);

    // Test 3: Lower rated wins (upset)
    result = updateRatings(1400, 1600, 1);
    console.log('1400 vs 1600, lower wins:', result);

    // Test 4: Draw
    result = updateRatings(1500, 1500, 0.5);
    console.log('Equal ratings, draw:', result);

    console.log('Elo tests completed.');
}

/**
 * Simulate ranking evolution with random comparisons
 * @param {number} numBooks - Number of books to simulate
 * @param {number} numComparisons - Number of comparisons to perform
 */
function simulateRanking(numBooks = 10, numComparisons = 100) {
    console.log(`Simulating ranking with ${numBooks} books and ${numComparisons} comparisons...`);

    // Initialize books with initial ratings
    const books = [];
    for (let i = 0; i < numBooks; i++) {
        books.push({
            id: i,
            title: `Book ${i + 1}`,
            rating: INITIAL_RATING
        });
    }

    // Perform random comparisons
    for (let i = 0; i < numComparisons; i++) {
        const idxA = Math.floor(Math.random() * numBooks);
        let idxB = Math.floor(Math.random() * numBooks);
        while (idxB === idxA) {
            idxB = Math.floor(Math.random() * numBooks);
        }

        const outcome = Math.random() < 0.5 ? 1 : 0; // Random winner

        const result = updateRatings(books[idxA].rating, books[idxB].rating, outcome);

        books[idxA].rating = result.ratingA;
        books[idxB].rating = result.ratingB;
    }

    // Calculate and display ranking
    const ranking = calculateRanking(books);
    console.log('Final ranking:');
    ranking.forEach((book, index) => {
        console.log(`${index + 1}. ${book.title}: ${book.rating}`);
    });

    return ranking;
}

/**
 * Check data integrity of ratings
 * @param {Array} books - Array of book objects
 * @returns {Object} Integrity check results
 */
function checkDataIntegrity(books) {
    const results = {
        totalBooks: books.length,
        booksWithRatings: 0,
        booksWithoutRatings: 0,
        validRatings: 0,
        invalidRatings: 0,
        minRating: Infinity,
        maxRating: -Infinity,
        averageRating: 0
    };

    let sum = 0;
    books.forEach(book => {
        if (book.rating === undefined || book.rating === null) {
            // Book has no rating yet - this is normal for newly imported books
            results.booksWithoutRatings++;
        } else if (isValidRating(book.rating)) {
            results.booksWithRatings++;
            results.validRatings++;
            sum += book.rating;
            results.minRating = Math.min(results.minRating, book.rating);
            results.maxRating = Math.max(results.maxRating, book.rating);
        } else {
            results.booksWithRatings++;
            results.invalidRatings++;
            console.warn(`Invalid rating for book ${book.id} "${book.title}": ${book.rating}`);
        }
    });

    results.averageRating = results.validRatings > 0 ? sum / results.validRatings : 0;

    console.log('Data integrity check:');
    console.log(`- Total books: ${results.totalBooks}`);
    console.log(`- Books with ratings: ${results.booksWithRatings} (${results.validRatings} valid, ${results.invalidRatings} invalid)`);
    console.log(`- Books without ratings: ${results.booksWithoutRatings} (normal for newly imported books)`);
    if (results.validRatings > 0) {
        console.log(`- Rating range: ${results.minRating} - ${results.maxRating}`);
        console.log(`- Average rating: ${results.averageRating.toFixed(1)}`);
    }

    return results;
}

/**
 * Benchmark performance with large datasets
 * @param {number} numBooks - Number of books
 * @param {number} numComparisons - Number of comparisons
 */
function benchmarkPerformance(numBooks = 1000, numComparisons = 10000) {
    console.log(`Benchmarking with ${numBooks} books and ${numComparisons} comparisons...`);

    const startTime = performance.now();

    // Initialize books
    const books = [];
    for (let i = 0; i < numBooks; i++) {
        books.push({ id: i, rating: INITIAL_RATING });
    }

    // Perform comparisons
    for (let i = 0; i < numComparisons; i++) {
        const idxA = Math.floor(Math.random() * numBooks);
        let idxB = Math.floor(Math.random() * numBooks);
        while (idxB === idxA) {
            idxB = Math.floor(Math.random() * numBooks);
        }

        const outcome = Math.random() < 0.5 ? 1 : 0;
        const result = updateRatings(books[idxA].rating, books[idxB].rating, outcome);

        books[idxA].rating = result.ratingA;
        books[idxB].rating = result.ratingB;
    }

    // Calculate ranking
    const ranking = calculateRanking(books);

    const endTime = performance.now();
    const duration = endTime - startTime;

    console.log(`Benchmark completed in ${duration.toFixed(2)} ms`);
    console.log(`Processing rate: ${(numComparisons / duration * 1000).toFixed(0)} comparisons/sec`);

    return { duration, ranking };
}

/**
 * Initialize ratings for books that don't have them
 * @param {Array} books - Array of book objects
 * @returns {Array} Books with ratings initialized
 */
function initializeBookRatings(books) {
    return books.map(book => {
        if (book.rating === undefined || book.rating === null) {
            return { ...book, rating: INITIAL_RATING };
        }
        return book;
    });
}

// Export functions
export {
    INITIAL_RATING,
    K_FACTOR,
    calculateExpectedScore,
    updateRatings,
    isValidRating,
    calculateRanking,
    testEloCalculations,
    simulateRanking,
    checkDataIntegrity,
    benchmarkPerformance,
    initializeBookRatings
};