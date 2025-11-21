// modules/db.js
// Handles IndexedDB operations for books, comparisons, rankings, and sessions

const DB_NAME = 'ShelfShowdownDB';
const DB_VERSION = 2;
let db;

export function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onerror = () => {
            console.error('IndexedDB error:', request.error);
            reject(request.error);
        };
        request.onsuccess = () => {
            db = request.result;
            console.log('IndexedDB initialized');
            resolve(db);
        };
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            const oldVersion = event.oldVersion;
            console.log(`Upgrading IndexedDB from version ${oldVersion} to ${DB_VERSION}`);

            // Books store
            if (!db.objectStoreNames.contains('books')) {
                const booksStore = db.createObjectStore('books', { keyPath: 'id' });
                booksStore.createIndex('title', 'title', { unique: false });
                booksStore.createIndex('author', 'author', { unique: false });
                booksStore.createIndex('genre', 'genre', { unique: false });
                booksStore.createIndex('rating', 'rating', { unique: false });
            }

            // Comparisons store
            if (!db.objectStoreNames.contains('comparisons')) {
                const comparisonsStore = db.createObjectStore('comparisons', { keyPath: 'id', autoIncrement: true });
                comparisonsStore.createIndex('bookA', 'bookA', { unique: false });
                comparisonsStore.createIndex('bookB', 'bookB', { unique: false });
                comparisonsStore.createIndex('winner', 'winner', { unique: false });
            }

            // Rankings store - recreate with autoIncrement for versions < 2
            if (!db.objectStoreNames.contains('rankings') || oldVersion < 2) {
                if (db.objectStoreNames.contains('rankings')) {
                    db.deleteObjectStore('rankings');
                    console.log('Recreating rankings store with autoIncrement');
                }
                const rankingsStore = db.createObjectStore('rankings', { keyPath: 'id', autoIncrement: true });
                rankingsStore.createIndex('timestamp', 'timestamp', { unique: false });
            }

            // Sessions store
            if (!db.objectStoreNames.contains('sessions')) {
                db.createObjectStore('sessions', { keyPath: 'id' });
            }
        };
    });
}

// Utility function for transactions
export function getTransaction(storeName, mode = 'readonly') {
    if (!db) {
        throw new Error('Database not initialized');
    }
    return db.transaction([storeName], mode).objectStore(storeName);
}

// Books CRUD
export function addBook(book) {
    return new Promise((resolve, reject) => {
        try {
            const store = getTransaction('books', 'readwrite');
            const request = store.add(book);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        } catch (error) {
            reject(error);
        }
    });
}

export function getBook(id) {
    return new Promise((resolve, reject) => {
        try {
            const store = getTransaction('books');
            const request = store.get(id);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        } catch (error) {
            reject(error);
        }
    });
}

export function updateBook(book) {
    return new Promise((resolve, reject) => {
        try {
            const store = getTransaction('books', 'readwrite');
            const request = store.put(book);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        } catch (error) {
            reject(error);
        }
    });
}

export function deleteBook(id) {
    return new Promise((resolve, reject) => {
        try {
            const store = getTransaction('books', 'readwrite');
            const request = store.delete(id);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        } catch (error) {
            reject(error);
        }
    });
}

export function getAllBooks() {
    return new Promise((resolve, reject) => {
        try {
            const store = getTransaction('books');
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        } catch (error) {
            reject(error);
        }
    });
}

// Comparisons CRUD
export function addComparison(comparison) {
    return new Promise((resolve, reject) => {
        try {
            const store = getTransaction('comparisons', 'readwrite');
            const request = store.add(comparison);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        } catch (error) {
            reject(error);
        }
    });
}

export function getComparison(id) {
    return new Promise((resolve, reject) => {
        try {
            const store = getTransaction('comparisons');
            const request = store.get(id);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        } catch (error) {
            reject(error);
        }
    });
}

export function getAllComparisons() {
    return new Promise((resolve, reject) => {
        try {
            const store = getTransaction('comparisons');
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        } catch (error) {
            reject(error);
        }
    });
}

// Rankings CRUD
export function addRanking(ranking) {
    return new Promise((resolve, reject) => {
        try {
            const store = getTransaction('rankings', 'readwrite');
            const request = store.add(ranking);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        } catch (error) {
            reject(error);
        }
    });
}

export function getRanking(id) {
    return new Promise((resolve, reject) => {
        try {
            const store = getTransaction('rankings');
            const request = store.get(id);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        } catch (error) {
            reject(error);
        }
    });
}

export function updateRanking(ranking) {
    return new Promise((resolve, reject) => {
        try {
            const store = getTransaction('rankings', 'readwrite');
            const request = store.put(ranking);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        } catch (error) {
            reject(error);
        }
    });
}

export function getAllRankings() {
    return new Promise((resolve, reject) => {
        try {
            const store = getTransaction('rankings');
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        } catch (error) {
            reject(error);
        }
    });
}

// Sessions CRUD
export function addSession(session) {
    return new Promise((resolve, reject) => {
        try {
            const store = getTransaction('sessions', 'readwrite');
            const request = store.add(session);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        } catch (error) {
            reject(error);
        }
    });
}

export function getSession(id) {
    return new Promise((resolve, reject) => {
        try {
            const store = getTransaction('sessions');
            const request = store.get(id);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        } catch (error) {
            reject(error);
        }
    });
}

export function updateSession(session) {
    return new Promise((resolve, reject) => {
        try {
            const store = getTransaction('sessions', 'readwrite');
            const request = store.put(session);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        } catch (error) {
            reject(error);
        }
    });
}

export function deleteSession(id) {
    return new Promise((resolve, reject) => {
        try {
            const store = getTransaction('sessions', 'readwrite');
            const request = store.delete(id);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        } catch (error) {
            reject(error);
        }
    });
}

/**
 * Inserts sample test data for development purposes.
 * @returns {Promise<Object>} Results of the test data insertion.
 */
export async function insertTestData() {
    console.log('🧪 Inserting test data for development...');

    const testBooks = [
        {
            id: 1,
            title: "The Great Gatsby",
            author: "F. Scott Fitzgerald",
            datesRead: ["2023-01-15", "2024-06-20"],
            genre: "Fiction",
            rating: 8.5
        },
        {
            id: 2,
            title: "To Kill a Mockingbird",
            author: "Harper Lee",
            datesRead: ["2023-03-10"],
            genre: "Fiction",
            rating: 9.2
        },
        {
            id: 3,
            title: "1984",
            author: "George Orwell",
            datesRead: ["2023-05-22", "2024-01-08"],
            genre: "Dystopian",
            rating: 9.0
        },
        {
            id: 4,
            title: "Pride and Prejudice",
            author: "Jane Austen",
            datesRead: ["2023-07-14"],
            genre: "Romance",
            rating: 8.8
        },
        {
            id: 5,
            title: "The Catcher in the Rye",
            author: "J.D. Salinger",
            datesRead: ["2023-09-30", "2024-03-15"],
            genre: "Fiction",
            rating: 7.5
        }
    ];

    let inserted = 0;
    let skipped = 0;
    let errors = 0;

    for (const book of testBooks) {
        try {
            // Check if book already exists
            const existing = await getBook(book.id);
            if (existing) {
                console.log(`⏭️  Test book "${book.title}" already exists, skipping`);
                skipped++;
                continue;
            }

            await addBook(book);
            inserted++;
            console.log(`✅ Inserted test book: "${book.title}" by ${book.author}`);
        } catch (error) {
            console.error(`❌ Failed to insert test book "${book.title}":`, error);
            errors++;
        }
    }

    const results = {
        total: testBooks.length,
        inserted: inserted,
        skipped: skipped,
        errors: errors
    };

    console.log('🧪 Test data insertion completed:', results);
    return results;
}

/**
 * Exports all database contents to console for debugging.
 * @returns {Promise<Object>} Complete database export.
 */
export async function exportDatabaseToConsole() {
    console.log('='.repeat(60));
    console.log('📊 SHELF SHOWDOWN DATABASE EXPORT');
    console.log('='.repeat(60));
    console.log(`Export timestamp: ${new Date().toISOString()}`);
    console.log('');

    try {
        // Export books
        const books = await getAllBooks();
        console.log(`📚 BOOKS (${books.length} total):`);
        console.log('='.repeat(40));

        if (books.length === 0) {
            console.log('No books in database');
        } else {
            books.forEach((book, index) => {
                console.log(`${index + 1}. "${book.title}"`);
                console.log(`   Author: ${book.author}`);
                console.log(`   ID: ${book.id}`);
                console.log(`   Dates Read: ${book.datesRead.length > 0 ? book.datesRead.join(', ') : 'None'}`);
                if (book.genre) console.log(`   Genre: ${book.genre}`);
                if (book.rating !== undefined) console.log(`   Rating: ${book.rating}/10`);
                console.log('');
            });
        }

        // Summary statistics
        console.log('📈 SUMMARY STATISTICS:');
        console.log('='.repeat(40));
        console.log(`Total Books: ${books.length}`);

        if (books.length > 0) {
            const totalReads = books.reduce((sum, book) => sum + book.datesRead.length, 0);
            const avgReads = (totalReads / books.length).toFixed(1);
            const ratedBooks = books.filter(book => book.rating !== undefined).length;
            const avgRating = ratedBooks > 0 ?
                (books.reduce((sum, book) => sum + (book.rating || 0), 0) / ratedBooks).toFixed(1) : 'N/A';

            console.log(`Total Read Events: ${totalReads}`);
            console.log(`Average Reads per Book: ${avgReads}`);
            console.log(`Books with Ratings: ${ratedBooks}`);
            console.log(`Average Rating: ${avgRating}/10`);

            // Genre breakdown
            const genres = {};
            books.forEach(book => {
                if (book.genre) {
                    genres[book.genre] = (genres[book.genre] || 0) + 1;
                }
            });

            if (Object.keys(genres).length > 0) {
                console.log('\n📖 GENRE BREAKDOWN:');
                Object.entries(genres)
                    .sort(([,a], [,b]) => b - a)
                    .forEach(([genre, count]) => {
                        console.log(`   ${genre}: ${count} book${count !== 1 ? 's' : ''}`);
                    });
            }
        }

        console.log('');
        console.log('✅ Database export completed successfully');
        console.log('='.repeat(60));

        return {
            books: books,
            summary: {
                totalBooks: books.length,
                totalReads: books.reduce((sum, book) => sum + book.datesRead.length, 0),
                ratedBooks: books.filter(book => book.rating !== undefined).length,
                genres: Object.fromEntries(
                    Object.entries(
                        books.reduce((acc, book) => {
                            if (book.genre) acc[book.genre] = (acc[book.genre] || 0) + 1;
                            return acc;
                        }, {})
                    ).sort(([,a], [,b]) => b - a)
                )
            }
        };

    } catch (error) {
        console.error('❌ Database export failed:', error);
        console.log('='.repeat(60));
        throw error;
    }
}

/**
 * Exports database in spreadsheet-ready format with enhanced ranking data.
 * @returns {Promise<Object>} Spreadsheet-ready export data.
 */
export async function exportForSpreadsheet() {
    console.log('📊 Preparing spreadsheet export...');

    try {
        // Get all books and comparisons
        const [books, allComparisons] = await Promise.all([
            getAllBooks(),
            getAllComparisons()
        ]);

        // Calculate comparison counts for each book
        const comparisonCounts = {};
        books.forEach(book => {
            comparisonCounts[book.id] = 0;
        });

        allComparisons.forEach(comp => {
            if (comparisonCounts[comp.bookA] !== undefined) {
                comparisonCounts[comp.bookA]++;
            }
            if (comparisonCounts[comp.bookB] !== undefined) {
                comparisonCounts[comp.bookB]++;
            }
        });

        // Create spreadsheet rows
        const headers = [
            'Title',
            'Author',
            'Genre',
            'Dates Read',
            'Read Count',
            'Elo Rating',
            'Comparisons',
            'Rating Rank',
            'Book ID'
        ];

        // Sort books by rating (highest first) for ranking
        const sortedBooks = books
            .filter(book => typeof book.rating === 'number')
            .sort((a, b) => b.rating - a.rating);

        const ratedBookIds = new Set(sortedBooks.map(book => book.id));
        const unratedBooks = books.filter(book => !ratedBookIds.has(book.id));

        // Create rows for rated books (with ranking)
        const ratedRows = sortedBooks.map((book, index) => [
            book.title || '',
            book.author || '',
            book.genre || '',
            book.datesRead.join('; ') || '',
            book.datesRead.length,
            Math.round(book.rating),
            comparisonCounts[book.id] || 0,
            index + 1, // Ranking position
            book.id
        ]);

        // Create rows for unrated books
        const unratedRows = unratedBooks.map(book => [
            book.title || '',
            book.author || '',
            book.genre || '',
            book.datesRead.join('; ') || '',
            book.datesRead.length,
            'Unrated',
            comparisonCounts[book.id] || 0,
            'N/A',
            book.id
        ]);

        const allRows = [headers, ...ratedRows, ...unratedRows];

        // Summary statistics
        const stats = {
            totalBooks: books.length,
            ratedBooks: sortedBooks.length,
            unratedBooks: unratedBooks.length,
            totalComparisons: allComparisons.length,
            averageRating: sortedBooks.length > 0 ?
                Math.round(sortedBooks.reduce((sum, book) => sum + book.rating, 0) / sortedBooks.length) : 'N/A',
            highestRating: sortedBooks.length > 0 ? Math.round(sortedBooks[0].rating) : 'N/A',
            lowestRating: sortedBooks.length > 0 ? Math.round(sortedBooks[sortedBooks.length - 1].rating) : 'N/A',
            mostComparedBook: Object.entries(comparisonCounts)
                .sort(([,a], [,b]) => b - a)[0] || ['None', 0],
            exportTimestamp: new Date().toISOString()
        };

        console.log(`✅ Spreadsheet export ready: ${allRows.length - 1} books exported`);

        return {
            spreadsheetData: allRows,
            summary: stats,
            metadata: {
                exportedAt: stats.exportTimestamp,
                version: '1.0',
                description: 'Shelf Showdown ranking export with Elo ratings and comparison data'
            }
        };

    } catch (error) {
        console.error('❌ Spreadsheet export failed:', error);
        throw error;
    }
}