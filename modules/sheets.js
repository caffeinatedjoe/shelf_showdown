// modules/sheets.js
// Handles Google Sheets API interactions

import { CONFIG } from '../config.js';
import { addBook, getAllBooks, updateBook, exportForSpreadsheet } from './db.js';

/**
 * Checks if the user is online.
 * @returns {boolean} True if online, false if offline.
 */
function isOnline() {
    return navigator.onLine;
}

/**
 * Retries an async operation with exponential backoff.
 * @param {Function} operation - The async operation to retry.
 * @param {number} maxRetries - Maximum number of retries.
 * @param {number} baseDelay - Base delay in milliseconds.
 * @returns {Promise} Result of the operation.
 */
async function retryWithBackoff(operation, maxRetries = 3, baseDelay = 1000) {
    let lastError;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await operation();
        } catch (error) {
            lastError = error;

            if (attempt === maxRetries) {
                break;
            }

            // Check for specific error types that shouldn't be retried
            if (error.status === 401 || error.status === 403) {
                // Authentication/authorization errors - don't retry
                throw error;
            }

            if (!isOnline()) {
                throw new Error('Network is offline. Please check your internet connection.');
            }

            // Exponential backoff with jitter
            const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 1000;
            console.warn(`Operation failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${Math.round(delay)}ms:`, error.message);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    throw lastError;
}

/**
 * Initializes the Google Sheets API client with error handling.
 * @returns {Promise<void>} A promise that resolves when the API is initialized.
 */
export async function initSheetsAPI() {
    if (!isOnline()) {
        throw new Error('Cannot initialize Google Sheets API: No internet connection');
    }

    return new Promise((resolve, reject) => {
        if (!window.gapi) {
            reject(new Error('Google API client library not loaded. Check your internet connection and try refreshing the page.'));
            return;
        }

        window.gapi.load('client', async () => {
            try {
                await retryWithBackoff(async () => {
                    await window.gapi.client.init({
                        apiKey: CONFIG.GOOGLE_API_KEY,
                        discoveryDocs: ['https://sheets.googleapis.com/$discovery/rest?version=v4'],
                    });
                });
                console.log('Google Sheets API initialized successfully');
                resolve();
            } catch (error) {
                console.error('Failed to initialize Google Sheets API after retries:', error);
                if (error.message.includes('API key')) {
                    reject(new Error('Invalid API key. Please check your GOOGLE_API_KEY in config.js'));
                } else if (error.message.includes('network') || error.message.includes('fetch')) {
                    reject(new Error('Network error initializing API. Please check your internet connection.'));
                } else {
                    reject(new Error(`API initialization failed: ${error.message}`));
                }
            }
        });
    });
}

/**
 * Gets metadata for a specified spreadsheet with error handling.
 * @param {string} spreadsheetId - The ID of the spreadsheet.
 * @returns {Promise<Object>} A promise that resolves to the spreadsheet metadata.
 */
export async function getSpreadsheetMetadata(spreadsheetId) {
    if (!isOnline()) {
        throw new Error('Cannot access spreadsheet: No internet connection');
    }

    if (!spreadsheetId || typeof spreadsheetId !== 'string') {
        throw new Error('Invalid spreadsheet ID provided');
    }

    try {
        const response = await retryWithBackoff(async () => {
            return await window.gapi.client.sheets.spreadsheets.get({
                spreadsheetId: spreadsheetId,
            });
        });

        console.log('Spreadsheet metadata retrieved successfully');
        return response.result;
    } catch (error) {
        console.error('Error getting spreadsheet metadata:', error);

        if (error.status === 404) {
            throw new Error(`Spreadsheet not found. Please check the ID: ${spreadsheetId}`);
        } else if (error.status === 403) {
            throw new Error('Access denied to spreadsheet. Please check sharing permissions.');
        } else if (error.status === 401) {
            throw new Error('Authentication expired. Please log out and log back in.');
        } else if (error.message.includes('network') || error.message.includes('fetch')) {
            throw new Error('Network error accessing spreadsheet. Please check your internet connection.');
        } else {
            throw new Error(`Failed to access spreadsheet: ${error.message}`);
        }
    }
}

/**
 * Reads all values from a specified sheet with error handling.
 * @param {string} spreadsheetId - The ID of the spreadsheet.
 * @param {string} sheetName - The name of the sheet to read from.
 * @returns {Promise<Array<Array<string>>>} A promise that resolves to a 2D array of values.
 */
export async function readSheetData(spreadsheetId, sheetName = 'Sheet1') {
    if (!isOnline()) {
        throw new Error('Cannot read sheet data: No internet connection');
    }

    if (!spreadsheetId || typeof spreadsheetId !== 'string') {
        throw new Error('Invalid spreadsheet ID provided');
    }

    if (!sheetName || typeof sheetName !== 'string') {
        throw new Error('Invalid sheet name provided');
    }

    try {
        const response = await retryWithBackoff(async () => {
            return await window.gapi.client.sheets.spreadsheets.values.get({
                spreadsheetId: spreadsheetId,
                range: sheetName,
            });
        });

        const values = response.result.values || [];
        console.log(`Successfully read ${values.length} rows from sheet "${sheetName}"`);
        return values;
    } catch (error) {
        console.error('Error reading sheet data:', error);

        if (error.status === 404) {
            throw new Error(`Sheet "${sheetName}" not found in spreadsheet. Please check the sheet name.`);
        } else if (error.status === 403) {
            throw new Error('Access denied to spreadsheet data. Please check sharing permissions.');
        } else if (error.status === 401) {
            throw new Error('Authentication expired. Please log out and log back in.');
        } else if (error.message.includes('network') || error.message.includes('fetch')) {
            throw new Error('Network error reading sheet data. Please check your internet connection.');
        } else {
            throw new Error(`Failed to read sheet data: ${error.message}`);
        }
    }
}

/**
 * Writes values to a specified range in the sheet.
 * @param {string} spreadsheetId - The ID of the spreadsheet.
 * @param {string} range - The range to write to (e.g., 'Sheet1!A1:B2').
 * @param {Array<Array<string>>} values - The values to write.
 * @returns {Promise<Object>} A promise that resolves to the write response.
 */
export async function writeSheetData(spreadsheetId, range, values) {
    try {
        const response = await window.gapi.client.sheets.spreadsheets.values.update({
            spreadsheetId: spreadsheetId,
            range: range,
            valueInputOption: 'RAW',
            resource: {
                values: values,
            },
        });
        console.log('Write response:', response.result);
        return response.result;
    } catch (error) {
        console.error('Error writing sheet data:', error);
        throw error;
    }
}

/**
 * Appends values to the end of a specified sheet with error handling.
 * @param {string} spreadsheetId - The ID of the spreadsheet.
 * @param {string} sheetName - The name of the sheet to append to.
 * @param {Array<Array<string>>} values - The values to append.
 * @returns {Promise<Object>} A promise that resolves to the append response.
 */
export async function appendSheetData(spreadsheetId, sheetName, values) {
    if (!isOnline()) {
        throw new Error('Cannot append data: No internet connection');
    }

    if (!spreadsheetId || typeof spreadsheetId !== 'string') {
        throw new Error('Invalid spreadsheet ID provided');
    }

    if (!sheetName || typeof sheetName !== 'string') {
        throw new Error('Invalid sheet name provided');
    }

    if (!Array.isArray(values) || values.length === 0) {
        throw new Error('Invalid data to append: must be non-empty array');
    }

    try {
        const response = await retryWithBackoff(async () => {
            return await window.gapi.client.sheets.spreadsheets.values.append({
                spreadsheetId: spreadsheetId,
                range: sheetName,
                valueInputOption: 'RAW',
                insertDataOption: 'INSERT_ROWS',
                resource: {
                    values: values,
                },
            });
        });

        console.log(`Successfully appended ${values.length} rows to sheet "${sheetName}"`);
        return response.result;
    } catch (error) {
        console.error('Error appending sheet data:', error);

        if (error.status === 404) {
            throw new Error(`Sheet "${sheetName}" not found in spreadsheet. Please check the sheet name.`);
        } else if (error.status === 403) {
            throw new Error('Access denied to modify spreadsheet. Please check write permissions.');
        } else if (error.status === 401) {
            throw new Error('Authentication expired. Please log out and log back in.');
        } else if (error.message.includes('network') || error.message.includes('fetch')) {
            throw new Error('Network error appending data. Please check your internet connection.');
        } else {
            throw new Error(`Failed to append data: ${error.message}`);
        }
    }
}

/**
 * Validates a book object to ensure required fields are present and valid.
 * @param {Object} book - The book object to validate.
 * @returns {Object} Validation result with isValid boolean and errors array.
 */
function validateBook(book) {
    const errors = [];

    // Check required fields
    if (!book.title || typeof book.title !== 'string' || book.title.trim().length === 0) {
        errors.push('Title is required and must be a non-empty string');
    }

    if (!book.author || typeof book.author !== 'string' || book.author.trim().length === 0) {
        errors.push('Author is required and must be a non-empty string');
    }

    // Check ID
    if (!book.id || typeof book.id !== 'number' || book.id <= 0) {
        errors.push('ID must be a positive number');
    }

    // Check datesRead array
    if (!Array.isArray(book.datesRead)) {
        errors.push('datesRead must be an array');
    } else {
        // Validate each date string
        book.datesRead.forEach((date, index) => {
            if (date && typeof date !== 'string') {
                errors.push(`datesRead[${index}] must be a string or null`);
            }
        });
    }

    // Optional fields validation
    if (book.genre && typeof book.genre !== 'string') {
        errors.push('Genre must be a string if provided');
    }

    if (book.rating !== undefined && (typeof book.rating !== 'number' || book.rating < 0 || book.rating > 10)) {
        errors.push('Rating must be a number between 0 and 10 if provided');
    }

    return {
        isValid: errors.length === 0,
        errors: errors
    };
}

/**
 * Sanitizes book data to ensure clean, consistent formatting.
 * @param {Object} book - The book object to sanitize.
 * @returns {Object} The sanitized book object.
 */
function sanitizeBook(book) {
    return {
        id: book.id,
        title: book.title.trim(),
        author: book.author.trim(),
        datesRead: book.datesRead.map(date => date ? date.trim() : null).filter(date => date), // Remove empty dates
        genre: book.genre ? book.genre.trim() : undefined,
        rating: typeof book.rating === 'number' ? Math.max(0, Math.min(10, book.rating)) : undefined, // Clamp to 0-10
    };
}

/**
 * Parses sheet data into Book objects.
 * Expects the first row to be headers: ["title", "author", "date read"]
 * Handles duplicate books by tracking multiple read dates.
 * @param {Array<Array<string>>} sheetData - The raw sheet data as 2D array.
 * @returns {Array<Object>} An array of Book objects with deduplication.
 */
export async function parseSheetDataToBooks(sheetData) {
    const booksMap = new Map(); // Use Map to track books by title+author key

    if (!sheetData || sheetData.length < 2) {
        console.warn('Sheet data is empty or has no data rows');
        return [];
    }

    // Get the next available ID by finding the highest existing ID
    let existingBooks = [];
    try {
        existingBooks = await getAllBooks();
    } catch (error) {
        console.warn('Could not get existing books for ID generation, starting from 1:', error);
    }
    const maxId = existingBooks.length > 0 ? Math.max(...existingBooks.map(book => book.id)) : 0;
    let nextId = maxId + 1;

    console.log(`Starting ID numbering from ${nextId} (max existing ID: ${maxId})`);

    // Skip the header row (index 0) and process data rows
    for (let i = 1; i < sheetData.length; i++) {
        const row = sheetData[i];
        if (row && row.length >= 2) {
            const title = row[0] ? row[0].trim() : '';
            const author = row[1] ? row[1].trim() : '';
            const dateRead = row[2] ? row[2].trim() : '';

            // Skip empty rows
            if (!title && !author) {
                console.warn(`Skipping empty row ${i + 1}`);
                continue;
            }

            // Create a unique key for the book
            const bookKey = `${title.toLowerCase()}|${author.toLowerCase()}`;

            if (booksMap.has(bookKey)) {
                // Book already exists, add this read date
                const existingBook = booksMap.get(bookKey);
                if (dateRead && !existingBook.datesRead.includes(dateRead)) {
                    existingBook.datesRead.push(dateRead);
                }
                console.log(`Added read date "${dateRead}" to existing book: ${title} by ${author}`);
            } else {
                // New book - create and validate
                const rawBook = {
                    id: nextId++,
                    title: title,
                    author: author,
                    datesRead: dateRead ? [dateRead] : [],
                };

                // Validate the book
                const validation = validateBook(rawBook);
                if (!validation.isValid) {
                    console.error(`❌ Book validation failed for "${title}" by ${author}:`, validation.errors);
                    continue; // Skip invalid books
                }

                // Sanitize the book
                const sanitizedBook = sanitizeBook(rawBook);
                booksMap.set(bookKey, sanitizedBook);
                console.log(`✅ Created valid book (ID: ${sanitizedBook.id}): ${sanitizedBook.title} by ${sanitizedBook.author}`);
            }
        } else {
            console.warn(`Skipping invalid row ${i + 1}:`, row);
        }
    }

    const books = Array.from(booksMap.values());
    console.log(`Parsed ${books.length} unique books from sheet data`);
    return books;
}

/**
 * Imports books into IndexedDB, handling duplicates by merging read dates.
 * @param {Array<Object>} books - Array of book objects to import.
 * @returns {Promise<Object>} Import results with counts of added/updated books.
 */
export async function importBooksToDB(books) {
    console.log('='.repeat(50));
    console.log('📚 SHELF SHOWDOWN - DATA IMPORT VERIFICATION');
    console.log('='.repeat(50));
    console.log(`⏰ Import started at: ${new Date().toISOString()}`);
    console.log(`📊 Books to import: ${books ? books.length : 0}`);

    if (!books || !Array.isArray(books) || books.length === 0) {
        console.error('❌ IMPORT FAILED: No books to import or invalid data type');
        console.error(`   Received type: ${typeof books}`);
        console.error(`   Is array: ${Array.isArray(books)}`);
        throw new Error(`No books to import or invalid data type. Received: ${typeof books}`);
    }

    console.log('✅ Input validation passed');
    console.log(`🚀 Starting import of ${books.length} books to IndexedDB`);
    console.log('');

    let added = 0;
    let updated = 0;
    let errors = 0;

    // Get existing books to check for duplicates
    console.log('🔍 Checking existing database...');
    const existingBooks = await getAllBooks();
    const existingBooksMap = new Map(existingBooks.map(book => [book.id, book]));
    console.log(`📚 Found ${existingBooks.length} existing books in database`);
    console.log('');

    console.log('🔄 Processing books...');
    for (let i = 0; i < books.length; i++) {
        const book = books[i];
        console.log(`   [${i + 1}/${books.length}] Processing: "${book.title}" by ${book.author} (ID: ${book.id})`);

        // Final validation before import
        const validation = validateBook(book);
        if (!validation.isValid) {
            console.error(`   ❌ VALIDATION FAILED: ${validation.errors.join(', ')}`);
            errors++;
            continue;
        }

        try {
            if (existingBooksMap.has(book.id)) {
                // Book exists - merge datesRead arrays
                const existingBook = existingBooksMap.get(book.id);
                const newDates = book.datesRead.filter(date => !existingBook.datesRead.includes(date));

                if (newDates.length > 0) {
                    existingBook.datesRead = [...existingBook.datesRead, ...newDates];
                    // Re-validate after merging
                    const mergeValidation = validateBook(existingBook);
                    if (!mergeValidation.isValid) {
                        console.error(`   ❌ MERGE VALIDATION FAILED: ${mergeValidation.errors.join(', ')}`);
                        errors++;
                        continue;
                    }
                    await updateBook(existingBook);
                    updated++;
                    console.log(`   ✅ UPDATED: Added ${newDates.length} new read dates: ${newDates.join(', ')}`);
                } else {
                    console.log(`   ⏭️  SKIPPED: Book already exists with all dates`);
                }
            } else {
                // New book - add it
                await addBook(book);
                added++;
                console.log(`   ➕ ADDED: New book with ${book.datesRead.length} read dates`);
            }
        } catch (error) {
            console.error(`   ❌ ERROR: Failed to import "${book.title}":`, error.message);
            errors++;
        }
    }
    console.log('');

    const results = {
        total: books.length,
        added: added,
        updated: updated,
        errors: errors,
        success: added + updated
    };

    console.log('📊 IMPORT SUMMARY:');
    console.log(`   Total books processed: ${results.total}`);
    console.log(`   ✅ Successfully imported: ${results.success}`);
    console.log(`   ➕ New books added: ${results.added}`);
    console.log(`   🔄 Existing books updated: ${results.updated}`);
    if (results.errors > 0) {
        console.log(`   ❌ Errors encountered: ${results.errors}`);
    }
    console.log(`⏰ Import completed at: ${new Date().toISOString()}`);
    console.log('='.repeat(50));

    return results;
}

// ===== GOOGLE SHEETS WRITE INTEGRATION =====

/**
 * Sync queue for offline changes
 */
class SyncQueue {
    constructor() {
        this.queue = [];
        this.isProcessing = false;
    }

    /**
     * Add an operation to the sync queue
     * @param {Object} operation - Operation to queue
     */
    add(operation) {
        this.queue.push({
            ...operation,
            id: Date.now() + Math.random(),
            timestamp: Date.now(),
            retries: 0
        });
        this.saveToStorage();
        console.log('Added operation to sync queue:', operation.type);
    }

    /**
     * Process the sync queue when online
     */
    async process() {
        if (this.isProcessing || this.queue.length === 0 || !isOnline()) {
            return;
        }

        this.isProcessing = true;
        console.log(`Processing ${this.queue.length} queued operations...`);

        const remainingOps = [];

        for (const operation of this.queue) {
            try {
                await this.executeOperation(operation);
                console.log(`✅ Processed queued operation: ${operation.type}`);
            } catch (error) {
                console.error(`❌ Failed to process queued operation ${operation.type}:`, error);

                operation.retries++;
                if (operation.retries < 3) {
                    remainingOps.push(operation);
                } else {
                    console.error(`❌ Operation ${operation.type} failed permanently after 3 retries`);
                }
            }
        }

        this.queue = remainingOps;
        this.saveToStorage();
        this.isProcessing = false;

        console.log(`Sync queue processing complete. ${this.queue.length} operations remaining.`);
    }

    /**
     * Execute a queued operation
     * @param {Object} operation - Operation to execute
     */
    async executeOperation(operation) {
        switch (operation.type) {
            case 'append_books':
                await appendBooksToSheets(operation.spreadsheetId, operation.books);
                break;
            case 'update_book_row':
                await updateBookInSheets(operation.spreadsheetId, operation.book, operation.rowIndex);
                break;
            default:
                throw new Error(`Unknown operation type: ${operation.type}`);
        }
    }

    /**
     * Save queue to localStorage
     */
    saveToStorage() {
        try {
            localStorage.setItem('sheetsSyncQueue', JSON.stringify(this.queue));
        } catch (error) {
            console.error('Failed to save sync queue to storage:', error);
        }
    }

    /**
     * Load queue from localStorage
     */
    loadFromStorage() {
        try {
            const stored = localStorage.getItem('sheetsSyncQueue');
            if (stored) {
                this.queue = JSON.parse(stored);
                console.log(`Loaded ${this.queue.length} operations from storage`);
            }
        } catch (error) {
            console.error('Failed to load sync queue from storage:', error);
        }
    }

    /**
     * Get queue status
     */
    getStatus() {
        return {
            queuedOperations: this.queue.length,
            isProcessing: this.isProcessing,
            operations: this.queue.map(op => ({
                type: op.type,
                timestamp: new Date(op.timestamp),
                retries: op.retries
            }))
        };
    }
}

// Global sync queue instance
const syncQueue = new SyncQueue();

// Initialize sync queue on module load
syncQueue.loadFromStorage();

// Process queue when coming online
window.addEventListener('online', () => {
    setTimeout(() => syncQueue.process(), 1000); // Delay to ensure API is ready
});

/**
 * Append new books to Google Sheets
 * @param {string} spreadsheetId - The spreadsheet ID
 * @param {Array<Object>} books - Array of book objects to append
 * @returns {Promise<Object>} Results of the append operation
 */
export async function appendBooksToSheets(spreadsheetId, books) {
    if (!isOnline()) {
        // Queue for later when online
        syncQueue.add({
            type: 'append_books',
            spreadsheetId,
            books
        });
        return { queued: true, message: 'Operation queued for when online' };
    }

    if (!books || !Array.isArray(books) || books.length === 0) {
        throw new Error('No books provided to append');
    }

    console.log(`Appending ${books.length} books to Google Sheets...`);

    // Convert books to sheet rows
    const rows = books.map(book => [
        book.title || '',
        book.author || '',
        book.datesRead && book.datesRead.length > 0 ? book.datesRead[0] : '',
        book.genre || '',
        typeof book.rating === 'number' ? book.rating.toString() : ''
    ]);

    try {
        const response = await appendSheetData(spreadsheetId, 'Sheet1', rows);

        // Update books with sheet row tracking
        const startRow = parseInt(response.updates.updatedRange.split('!')[1].split(':')[0].replace(/\D/g, ''));
        books.forEach((book, index) => {
            book.sheetRowIndex = startRow + index;
        });

        console.log(`Successfully appended ${books.length} books to sheets`);
        return {
            success: true,
            appended: books.length,
            updatedRange: response.updates.updatedRange
        };
    } catch (error) {
        console.error('Failed to append books to sheets:', error);

        // Queue for retry if it's a network error
        if (error.message.includes('network') || error.status >= 500) {
            syncQueue.add({
                type: 'append_books',
                spreadsheetId,
                books
            });
            return { queued: true, message: 'Operation queued for retry' };
        }

        throw error;
    }
}

/**
 * Update a book in Google Sheets
 * @param {string} spreadsheetId - The spreadsheet ID
 * @param {Object} book - Book object to update
 * @param {number} rowIndex - Row index in the sheet (1-based)
 * @returns {Promise<Object>} Results of the update operation
 */
export async function updateBookInSheets(spreadsheetId, book, rowIndex) {
    if (!isOnline()) {
        syncQueue.add({
            type: 'update_book_row',
            spreadsheetId,
            book,
            rowIndex
        });
        return { queued: true, message: 'Operation queued for when online' };
    }

    const row = [
        book.title || '',
        book.author || '',
        book.datesRead && book.datesRead.length > 0 ? book.datesRead[0] : '',
        book.genre || '',
        typeof book.rating === 'number' ? book.rating.toString() : ''
    ];

    const range = `Sheet1!A${rowIndex}:E${rowIndex}`;

    try {
        const response = await writeSheetData(spreadsheetId, range, [row]);
        console.log(`Updated book "${book.title}" in sheets at row ${rowIndex}`);
        return {
            success: true,
            updatedRange: response.updatedRange
        };
    } catch (error) {
        console.error(`Failed to update book "${book.title}" in sheets:`, error);

        // Queue for retry
        syncQueue.add({
            type: 'update_book_row',
            spreadsheetId,
            book,
            rowIndex
        });

        return { queued: true, message: 'Operation queued for retry' };
    }
}

/**
 * Sync local changes to Google Sheets
 * @param {string} spreadsheetId - The spreadsheet ID
 * @param {boolean} forceSync - If true, sync all books regardless of sync status
 * @returns {Promise<Object>} Sync results
 */
export async function syncToSheets(spreadsheetId, forceSync = false) {
    console.log('Starting sync to Google Sheets...');

    const books = await getAllBooks();

    let booksToSync;
    if (forceSync) {
        // Force sync all books
        booksToSync = books;
        console.log(`Force syncing all ${books.length} books to sheets...`);
    } else {
        // Only sync books that need it
        booksToSync = books.filter(book => book.needsSync || !book.sheetRowIndex);

        if (booksToSync.length === 0) {
            return { message: 'All books are already synced. Use force sync to overwrite all data.' };
        }

        console.log(`Syncing ${booksToSync.length} books that need updates...`);
    }

    // For force sync, we'll overwrite the entire sheet
    if (forceSync) {
        try {
            const exportData = await exportForSpreadsheet();
            const rows = exportData.spreadsheetData;

            // Clear the sheet first (write empty data to A1:Z1000 or something)
            await writeSheetData(spreadsheetId, 'Sheet1!A1:Z1000', []);

            // Write all data at once
            const response = await writeSheetData(spreadsheetId, 'Sheet1!A1', rows);

            console.log(`Force synced ${books.length} books to sheets`);
            return {
                success: true,
                forceSynced: books.length,
                message: `Successfully force synced all ${books.length} books to Google Sheets`
            };
        } catch (error) {
            console.error('Failed to force sync:', error);
            throw error;
        }
    }

    // Normal incremental sync
    // Separate new books from updates
    const newBooks = booksToSync.filter(book => !book.sheetRowIndex);
    const booksToUpdate = booksToSync.filter(book => book.sheetRowIndex);

    let results = {
        newBooksAdded: 0,
        booksUpdated: 0,
        errors: 0
    };

    // Add new books
    if (newBooks.length > 0) {
        try {
            const appendResult = await appendBooksToSheets(spreadsheetId, newBooks);
            if (appendResult.success) {
                results.newBooksAdded = newBooks.length;
                // Mark as synced
                for (const book of newBooks) {
                    book.needsSync = false;
                    await updateBook(book);
                }
            }
        } catch (error) {
            console.error('Failed to append new books:', error);
            results.errors++;
        }
    }

    // Update existing books
    for (const book of booksToUpdate) {
        try {
            await updateBookInSheets(spreadsheetId, book, book.sheetRowIndex);
            book.needsSync = false;
            await updateBook(book);
            results.booksUpdated++;
        } catch (error) {
            console.error(`Failed to update book "${book.title}":`, error);
            results.errors++;
        }
    }

    console.log('Sync completed:', results);
    return results;
}

/**
 * Get sync queue status
 * @returns {Object} Queue status
 */
export function getSyncStatus() {
    return syncQueue.getStatus();
}

/**
 * Force process sync queue
 * @returns {Promise<void>}
 */
export async function processSyncQueue() {
    await syncQueue.process();
}

/**
 * Resolve conflicts between local and remote data
 * @param {string} spreadsheetId - The spreadsheet ID
 * @param {Array<Object>} localBooks - Local book data
 * @param {Array<Array<string>>} remoteData - Remote sheet data
 * @returns {Promise<Object>} Conflict resolution results
 */
export async function resolveSyncConflicts(spreadsheetId, localBooks, remoteData) {
    console.log('Resolving sync conflicts...');

    const conflicts = [];
    const resolutions = [];

    // Create maps for efficient lookup
    const localMap = new Map(localBooks.map(book => [book.id, book]));
    const remoteMap = new Map();

    // Parse remote data (skip header)
    for (let i = 1; i < remoteData.length; i++) {
        const row = remoteData[i];
        if (row && row.length >= 2) {
            const title = row[0]?.trim() || '';
            const author = row[1]?.trim() || '';
            const key = `${title.toLowerCase()}|${author.toLowerCase()}`;

            remoteMap.set(key, {
                rowIndex: i + 1, // 1-based
                title,
                author,
                dateRead: row[2]?.trim() || '',
                genre: row[3]?.trim() || '',
                rating: row[4] ? parseFloat(row[4]) : undefined
            });
        }
    }

    // Find conflicts
    for (const [id, localBook] of localMap) {
        const key = `${localBook.title.toLowerCase()}|${localBook.author.toLowerCase()}`;
        const remoteBook = remoteMap.get(key);

        if (remoteBook) {
            // Check for conflicts
            const localRating = localBook.rating;
            const remoteRating = remoteBook.rating;

            if (localRating !== remoteRating &&
                !(isNaN(localRating) && isNaN(remoteRating))) {
                conflicts.push({
                    bookId: id,
                    local: { rating: localRating },
                    remote: { rating: remoteRating },
                    rowIndex: remoteBook.rowIndex
                });
            }
        }
    }

    // Auto-resolve conflicts (prefer local changes for now)
    for (const conflict of conflicts) {
        const localBook = localMap.get(conflict.bookId);
        try {
            await updateBookInSheets(spreadsheetId, localBook, conflict.rowIndex);
            resolutions.push({
                bookId: conflict.bookId,
                resolution: 'local_preferred',
                message: `Updated remote with local rating ${localBook.rating}`
            });
        } catch (error) {
            resolutions.push({
                bookId: conflict.bookId,
                resolution: 'failed',
                error: error.message
            });
        }
    }

    return {
        totalConflicts: conflicts.length,
        resolutions: resolutions
    };
}