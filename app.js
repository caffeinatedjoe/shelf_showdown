// Main application entry point
console.log('Shelf Showdown app loaded');

import { authenticate, isAuthenticated, signOut, restoreToken } from './modules/auth.js';
import { initSheetsAPI, getSpreadsheetMetadata, readSheetData, appendSheetData, parseSheetDataToBooks, importBooksToDB } from './modules/sheets.js';
import { initDB, getAllBooks, updateBook, deleteBook, insertTestData, exportDatabaseToConsole, exportForSpreadsheet } from './modules/db.js';
import { testEloCalculations, simulateRanking, checkDataIntegrity, benchmarkPerformance, initializeBookRatings, INITIAL_RATING, K_FACTOR } from './modules/ranking.js';
import { Comparison, storeComparison, getComparisonsByBookIds, getComparisonHistory, getComparisonStats, processAllComparisons } from './modules/comparisons.js';
import { calculateCurrentRanking, getLatestRanking, getAllRankingsHistory, updateCurrentRanking } from './modules/rankings.js';
import { syncToSheets, getSyncStatus, processSyncQueue } from './modules/sheets.js';

// Basic app structure
const app = {
    init: async function() {
        console.log('Initializing app...');
        document.getElementById('auth-status').textContent = 'Checking authentication...';

        // Initialize offline detection
        this.setupOfflineDetection();

        // Initialize database
        try {
            await initDB();
            console.log('Database initialized');
        } catch (error) {
            console.error('Database initialization error:', error);
        }

        try {
            const restored = await restoreToken();
            if (restored) {
                console.log('Token restored from storage');
                // Initialize Sheets API if authenticated and online
                if (navigator.onLine) {
                    try {
                        await initSheetsAPI();
                        console.log('Sheets API initialized');
                    } catch (sheetsError) {
                        console.error('Sheets API initialization error:', sheetsError);
                    }
                } else {
                    console.log('Skipping Sheets API initialization - offline');
                }
            } else {
                console.log('No stored token or expired');
            }
        } catch (error) {
            console.error('Initialization error:', error);
        }

        // TODO: Initialize modules and routing
        this.setupTestFunctions();
        await this.updateAuthUI();
        this.setupEventListeners();
    },

    setupTestFunctions: function() {
        // Expose test functions to window for console testing
        window.testAuth = {
            authenticate: async () => {
                try {
                    const token = await authenticate();
                    console.log('Authentication successful, token:', token.substring(0, 20) + '...');
                } catch (error) {
                    console.error('Authentication failed:', error);
                }
            },
            checkAuth: async () => {
                const auth = await isAuthenticated();
                console.log('Is authenticated:', auth);
            },
            signOut: async () => {
                await signOut();
                console.log('Signed out');
            }
        };

        window.testDB = {
            viewBooks: async () => {
                try {
                    const books = await getAllBooks();
                    console.log(`Database contains ${books.length} books:`, books);
                    return books;
                } catch (error) {
                    console.error('Error viewing database:', error);
                }
            },
            exportToConsole: async () => {
                try {
                    const exportData = await exportDatabaseToConsole();
                    return exportData;
                } catch (error) {
                    console.error('Error exporting database:', error);
                }
            },
            insertTestData: async () => {
                try {
                    const results = await insertTestData();
                    console.log('Test data inserted:', results);
                    return results;
                } catch (error) {
                    console.error('Error inserting test data:', error);
                }
            },
            clearBooks: async () => {
                try {
                    const books = await getAllBooks();
                    console.log(`Clearing ${books.length} books from database...`);
                    for (const book of books) {
                        await deleteBook(book.id);
                    }
                    console.log('Database cleared');
                } catch (error) {
                    console.error('Error clearing database:', error);
                }
            }
        };

        window.testRanking = {
            testEloCalculations: () => {
                console.log('Running Elo calculation tests...');
                testEloCalculations();
            },
            simulateRanking: (numBooks = 10, numComparisons = 100) => {
                console.log(`Simulating ranking with ${numBooks} books and ${numComparisons} comparisons...`);
                const ranking = simulateRanking(numBooks, numComparisons);
                return ranking;
            },
            checkDataIntegrity: (books) => {
                if (!books) {
                    console.log('No books provided, fetching from database...');
                    return getAllBooks().then(fetchedBooks => {
                        console.log(`Checking integrity of ${fetchedBooks.length} books from database...`);
                        return checkDataIntegrity(fetchedBooks);
                    });
                }
                console.log(`Checking integrity of ${books.length} provided books...`);
                return checkDataIntegrity(books);
            },
            benchmarkPerformance: (numBooks = 1000, numComparisons = 10000) => {
                console.log(`Benchmarking with ${numBooks} books and ${numComparisons} comparisons...`);
                const result = benchmarkPerformance(numBooks, numComparisons);
                return result;
            },
            constants: {
                INITIAL_RATING,
                K_FACTOR
            }
        };

        console.log('Test functions available:');
        console.log('- window.testAuth.authenticate(), window.testAuth.checkAuth(), window.testAuth.signOut()');
        console.log('- window.testDB.viewBooks(), window.testDB.exportToConsole(), window.testDB.insertTestData(), window.testDB.clearBooks()');
        console.log('- window.testRanking.testEloCalculations(), window.testRanking.simulateRanking(numBooks, numComparisons)');
        console.log('- window.testRanking.checkDataIntegrity(books?), window.testRanking.benchmarkPerformance(numBooks, numComparisons)');
        console.log('- window.testRanking.constants (shows INITIAL_RATING and K_FACTOR)');
    },

    updateAuthUI: async function() {
        const authenticated = await isAuthenticated();
        const loginBtn = document.getElementById('login-btn');
        const logoutBtn = document.getElementById('logout-btn');
        const statusDiv = document.getElementById('auth-status');
        const sheetsSection = document.getElementById('sheets-section');

        if (authenticated) {
            loginBtn.style.display = 'none';
            logoutBtn.style.display = 'inline';
            statusDiv.textContent = 'Authenticated';
            sheetsSection.style.display = 'block';
        } else {
            loginBtn.style.display = 'inline';
            logoutBtn.style.display = 'none';
            statusDiv.textContent = 'Not authenticated';
            sheetsSection.style.display = 'none';
        }
    },

    setupOfflineDetection: function() {
        // Update UI based on current online status
        this.updateOnlineStatus();

        // Listen for online/offline events
        window.addEventListener('online', () => {
            console.log('Network connection restored');
            this.updateOnlineStatus();
            // Try to initialize Sheets API if authenticated
            this.tryInitSheetsAPI();
        });

        window.addEventListener('offline', () => {
            console.log('Network connection lost');
            this.updateOnlineStatus();
        });
    },

    updateOnlineStatus: function() {
        const sheetsSection = document.getElementById('sheets-section');
        const statusDiv = document.getElementById('sheets-status');

        if (!navigator.onLine) {
            // Add offline indicator
            if (!document.getElementById('offline-indicator')) {
                const indicator = document.createElement('div');
                indicator.id = 'offline-indicator';
                indicator.style.cssText = `
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    background: #ff6b6b;
                    color: white;
                    text-align: center;
                    padding: 8px;
                    font-weight: bold;
                    z-index: 1000;
                `;
                indicator.textContent = '⚠️ You are currently offline. Some features may not work.';
                document.body.insertBefore(indicator, document.body.firstChild);
            }

            // Disable Sheets functionality
            if (sheetsSection) {
                sheetsSection.style.opacity = '0.5';
                sheetsSection.style.pointerEvents = 'none';
            }

            if (statusDiv) {
                statusDiv.textContent = 'Offline - Google Sheets features disabled';
                statusDiv.style.color = 'orange';
            }
        } else {
            // Remove offline indicator
            const indicator = document.getElementById('offline-indicator');
            if (indicator) {
                indicator.remove();
            }

            // Re-enable Sheets functionality
            if (sheetsSection) {
                sheetsSection.style.opacity = '1';
                sheetsSection.style.pointerEvents = 'auto';
            }

            console.log('Back online - Google Sheets features re-enabled');
        }
    },

    tryInitSheetsAPI: async function() {
        try {
            const isAuth = await isAuthenticated();
            if (isAuth && navigator.onLine) {
                await initSheetsAPI();
                console.log('Sheets API initialized after coming back online');
                await this.updateAuthUI();
            }
        } catch (error) {
            console.error('Failed to initialize Sheets API after reconnecting:', error);
        }
    },

    setupEventListeners: function() {
        document.getElementById('login-btn').addEventListener('click', async () => {
            if (!navigator.onLine) {
                alert('Cannot authenticate while offline. Please check your internet connection.');
                return;
            }

            try {
                await authenticate();
                // Initialize Sheets API after authentication
                try {
                    await initSheetsAPI();
                    console.log('Sheets API initialized after login');
                } catch (sheetsError) {
                    console.error('Sheets API initialization error:', sheetsError);
                }
                await this.updateAuthUI();
            } catch (error) {
                console.error('Login failed:', error);
                alert('Login failed: ' + error.message);
            }
        });

        document.getElementById('logout-btn').addEventListener('click', async () => {
            await signOut();
            await this.updateAuthUI();
        });

        document.getElementById('test-connection-btn').addEventListener('click', async () => {
            const spreadsheetId = document.getElementById('spreadsheet-id').value.trim();
            const statusDiv = document.getElementById('sheets-status');

            if (!spreadsheetId) {
                statusDiv.textContent = 'Please enter a spreadsheet ID';
                statusDiv.style.color = 'red';
                return;
            }

            statusDiv.textContent = 'Testing connection...';
            statusDiv.style.color = 'black';

            try {
                const metadata = await getSpreadsheetMetadata(spreadsheetId);
                statusDiv.textContent = `Success! Connected to "${metadata.properties.title}" with ${metadata.sheets.length} sheet(s)`;
                statusDiv.style.color = 'green';
                console.log('Spreadsheet metadata:', metadata);
            } catch (error) {
                console.error('Connection test failed:', error);
                statusDiv.textContent = `Connection failed: ${error.message}`;
                statusDiv.style.color = 'red';
            }
        });

        document.getElementById('load-data-btn').addEventListener('click', async () => {
            const spreadsheetId = document.getElementById('spreadsheet-id').value.trim();
            const statusDiv = document.getElementById('sheets-status');
            const dataDisplay = document.getElementById('sheet-data-display');

            if (!spreadsheetId) {
                statusDiv.textContent = 'Please enter a spreadsheet ID';
                statusDiv.style.color = 'red';
                return;
            }

            statusDiv.textContent = 'Loading sheet data...';
            statusDiv.style.color = 'black';
            dataDisplay.textContent = '';

            try {
                const data = await readSheetData(spreadsheetId);
                statusDiv.textContent = `Data loaded successfully! ${data.length} rows found.`;
                statusDiv.style.color = 'green';

                // Display the data in a readable format
                if (data.length === 0) {
                    dataDisplay.textContent = 'No data found in the sheet.';
                } else {
                    let displayText = `Sheet contains ${data.length} rows:\n\n`;
                    data.forEach((row, index) => {
                        displayText += `Row ${index + 1}: ${JSON.stringify(row)}\n`;
                    });
                    dataDisplay.textContent = displayText;
                }

                console.log('Sheet data loaded:', data);
            } catch (error) {
                console.error('Data loading failed:', error);
                statusDiv.textContent = `Data loading failed: ${error.message}`;
                statusDiv.style.color = 'red';
                dataDisplay.textContent = '';
            }
        });

        document.getElementById('parse-books-btn').addEventListener('click', async () => {
            const spreadsheetId = document.getElementById('spreadsheet-id').value.trim();
            const statusDiv = document.getElementById('sheets-status');
            const dataDisplay = document.getElementById('sheet-data-display');

            if (!spreadsheetId) {
                statusDiv.textContent = 'Please enter a spreadsheet ID';
                statusDiv.style.color = 'red';
                return;
            }

            statusDiv.textContent = 'Parsing books from sheet data...';
            statusDiv.style.color = 'black';
            dataDisplay.textContent = '';

            try {
                const sheetData = await readSheetData(spreadsheetId);
                const books = await parseSheetDataToBooks(sheetData);

                statusDiv.textContent = `Successfully parsed ${books.length} books from sheet data.`;
                statusDiv.style.color = 'green';

                // Display the parsed books
                if (books.length === 0) {
                    dataDisplay.textContent = 'No valid books found in the sheet.';
                } else {
                    let displayText = `Parsed ${books.length} books:\n\n`;
                    books.forEach((book, index) => {
                        displayText += `Book ${index + 1}: ${JSON.stringify(book, null, 2)}\n\n`;
                    });
                    dataDisplay.textContent = displayText;
                }

                console.log('Parsed books:', books);
            } catch (error) {
                console.error('Book parsing failed:', error);
                statusDiv.textContent = `Book parsing failed: ${error.message}`;
                statusDiv.style.color = 'red';
                dataDisplay.textContent = '';
            }
        });

        document.getElementById('view-db-btn').addEventListener('click', async () => {
            const statusDiv = document.getElementById('sheets-status');
            const dataDisplay = document.getElementById('sheet-data-display');

            statusDiv.textContent = 'Loading database contents...';
            statusDiv.style.color = 'black';
            dataDisplay.textContent = '';

            try {
                const books = await getAllBooks();
                statusDiv.textContent = `Database contains ${books.length} books`;
                statusDiv.style.color = 'blue';

                if (books.length === 0) {
                    dataDisplay.textContent = 'No books in database.';
                } else {
                    dataDisplay.textContent = `Database Contents (${books.length} books):\n\n`;
                    books.forEach((book, index) => {
                        dataDisplay.textContent += `${index + 1}. "${book.title}" by ${book.author}\n`;
                        dataDisplay.textContent += `   ID: ${book.id}\n`;
                        dataDisplay.textContent += `   Read dates: ${book.datesRead.join(', ') || 'None'}\n\n`;
                    });
                }

                console.log('Current database contents:', books);
            } catch (error) {
                console.error('Error loading database:', error);
                statusDiv.textContent = `Database error: ${error.message}`;
                statusDiv.style.color = 'red';
                dataDisplay.textContent = '';
            }
        });

        document.getElementById('insert-test-data-btn').addEventListener('click', async () => {
            const statusDiv = document.getElementById('sheets-status');
            const dataDisplay = document.getElementById('sheet-data-display');

            statusDiv.textContent = 'Inserting test data...';
            statusDiv.style.color = 'black';
            dataDisplay.textContent = '';

            try {
                const results = await insertTestData();
                statusDiv.textContent = `Test data inserted! ${results.inserted} books added, ${results.skipped} skipped.`;
                statusDiv.style.color = 'green';

                // Show the inserted data
                const books = await getAllBooks();
                dataDisplay.textContent = `Test data inserted successfully!\n\nDatabase now contains ${books.length} books:\n\n`;
                books.slice(-5).forEach(book => { // Show last 5 books (the test data)
                    dataDisplay.textContent += `• "${book.title}" by ${book.author} (${book.datesRead.length} reads)\n`;
                });

                console.log('Test data insertion completed:', results);
            } catch (error) {
                console.error('Test data insertion failed:', error);
                statusDiv.textContent = `Test data insertion failed: ${error.message}`;
                statusDiv.style.color = 'red';
                dataDisplay.textContent = '';
            }
        });

        document.getElementById('import-books-btn').addEventListener('click', async () => {
            const spreadsheetId = document.getElementById('spreadsheet-id').value.trim();
            const statusDiv = document.getElementById('sheets-status');
            const dataDisplay = document.getElementById('sheet-data-display');

            if (!spreadsheetId) {
                statusDiv.textContent = 'Please enter a spreadsheet ID';
                statusDiv.style.color = 'red';
                return;
            }

            statusDiv.textContent = 'Importing books to database...';
            statusDiv.style.color = 'black';
            dataDisplay.textContent = '';

            try {
                // First read and parse the sheet data
                const sheetData = await readSheetData(spreadsheetId);
                const books = await parseSheetDataToBooks(sheetData);

                if (books.length === 0) {
                    statusDiv.textContent = 'No books found to import';
                    statusDiv.style.color = 'orange';
                    return;
                }

                // Import books to IndexedDB
                const importResults = await importBooksToDB(books);

                statusDiv.textContent = `Import completed! ${importResults.success} books processed (${importResults.added} added, ${importResults.updated} updated)`;
                statusDiv.style.color = 'green';

                // Display import summary
                dataDisplay.textContent = `Import Summary:
- Total books processed: ${importResults.total}
- New books added: ${importResults.added}
- Existing books updated: ${importResults.updated}
- Errors: ${importResults.errors}

Books in database after import:`;

                // Show current database contents
                const allBooks = await getAllBooks();
                dataDisplay.textContent += `\n\nTotal books in DB: ${allBooks.length}`;
                allBooks.slice(0, 5).forEach(book => {
                    dataDisplay.textContent += `\n- ${book.title} by ${book.author} (${book.datesRead.length} reads)`;
                });
                if (allBooks.length > 5) {
                    dataDisplay.textContent += `\n... and ${allBooks.length - 5} more`;
                }

                console.log('Import completed successfully:', importResults);
            } catch (error) {
                console.error('Import failed:', error);
                statusDiv.textContent = `Import failed: ${error.message}`;
                statusDiv.style.color = 'red';
                dataDisplay.textContent = '';
            }
        });

        document.getElementById('append-test-data-btn').addEventListener('click', async () => {
            const spreadsheetId = document.getElementById('spreadsheet-id').value.trim();
            const statusDiv = document.getElementById('sheets-status');

            if (!spreadsheetId) {
                statusDiv.textContent = 'Please enter a spreadsheet ID';
                statusDiv.style.color = 'red';
                return;
            }

            statusDiv.textContent = 'Appending test data...';
            statusDiv.style.color = 'black';

            try {
                // Generate a timestamp for unique test data
                const timestamp = new Date().toLocaleString();
                const testData = [
                    [`Test Entry ${Date.now()}`, timestamp, 'Write Test']
                ];

                const response = await appendSheetData(spreadsheetId, 'Sheet1', testData);
                statusDiv.textContent = `Test data appended successfully! Updated range: ${response.updates.updatedRange}`;
                statusDiv.style.color = 'green';
                console.log('Append response:', response);

                // Optionally reload the data to show the new entry
                setTimeout(async () => {
                    try {
                        const updatedData = await readSheetData(spreadsheetId);
                        const dataDisplay = document.getElementById('sheet-data-display');
                        if (updatedData.length > 0) {
                            let displayText = `Sheet contains ${updatedData.length} rows (after append):\n\n`;
                            updatedData.forEach((row, index) => {
                                displayText += `Row ${index + 1}: ${JSON.stringify(row)}\n`;
                            });
                            dataDisplay.textContent = displayText;
                        }
                    } catch (reloadError) {
                        console.error('Error reloading data:', reloadError);
                    }
                }, 1000);

            } catch (error) {
                console.error('Append test failed:', error);
                statusDiv.textContent = `Append failed: ${error.message}`;
                statusDiv.style.color = 'red';
            }
        });

        // Debug zone event listeners
        document.getElementById('run-elo-tests-btn').addEventListener('click', async () => {
            const statusDiv = document.getElementById('debug-status');
            const outputDiv = document.getElementById('debug-output');

            statusDiv.textContent = 'Running Elo calculation tests...';
            statusDiv.style.color = 'black';
            outputDiv.textContent = '';

            // Capture console output
            const originalLog = console.log;
            const originalError = console.error;
            let capturedOutput = '';

            console.log = (...args) => {
                capturedOutput += args.join(' ') + '\n';
                originalLog(...args);
            };
            console.error = (...args) => {
                capturedOutput += 'ERROR: ' + args.join(' ') + '\n';
                originalError(...args);
            };

            try {
                testEloCalculations();
                statusDiv.textContent = 'Elo tests completed successfully!';
                statusDiv.style.color = 'green';
                outputDiv.textContent = capturedOutput;
            } catch (error) {
                statusDiv.textContent = `Elo tests failed: ${error.message}`;
                statusDiv.style.color = 'red';
                outputDiv.textContent = capturedOutput + '\nERROR: ' + error.message;
            } finally {
                // Restore console
                console.log = originalLog;
                console.error = originalError;
            }
        });

        document.getElementById('run-simulation-btn').addEventListener('click', async () => {
            const statusDiv = document.getElementById('debug-status');
            const outputDiv = document.getElementById('debug-output');

            statusDiv.textContent = 'Running ranking simulation...';
            statusDiv.style.color = 'black';
            outputDiv.textContent = '';

            const originalLog = console.log;
            let capturedOutput = '';

            console.log = (...args) => {
                capturedOutput += args.join(' ') + '\n';
                originalLog(...args);
            };

            try {
                const ranking = simulateRanking(10, 50);
                statusDiv.textContent = 'Ranking simulation completed!';
                statusDiv.style.color = 'green';
                outputDiv.textContent = capturedOutput;
            } catch (error) {
                statusDiv.textContent = `Simulation failed: ${error.message}`;
                statusDiv.style.color = 'red';
                outputDiv.textContent = capturedOutput + '\nERROR: ' + error.message;
            } finally {
                console.log = originalLog;
            }
        });

        document.getElementById('run-benchmark-btn').addEventListener('click', async () => {
            const statusDiv = document.getElementById('debug-status');
            const outputDiv = document.getElementById('debug-output');

            statusDiv.textContent = 'Running performance benchmark...';
            statusDiv.style.color = 'black';
            outputDiv.textContent = '';

            const originalLog = console.log;
            let capturedOutput = '';

            console.log = (...args) => {
                capturedOutput += args.join(' ') + '\n';
                originalLog(...args);
            };

            try {
                const result = benchmarkPerformance(500, 2500); // Smaller numbers for UI responsiveness
                statusDiv.textContent = 'Benchmark completed!';
                statusDiv.style.color = 'green';
                outputDiv.textContent = capturedOutput;
            } catch (error) {
                statusDiv.textContent = `Benchmark failed: ${error.message}`;
                statusDiv.style.color = 'red';
                outputDiv.textContent = capturedOutput + '\nERROR: ' + error.message;
            } finally {
                console.log = originalLog;
            }
        });

        document.getElementById('check-integrity-btn').addEventListener('click', async () => {
            const statusDiv = document.getElementById('debug-status');
            const outputDiv = document.getElementById('debug-output');

            statusDiv.textContent = 'Checking data integrity...';
            statusDiv.style.color = 'black';
            outputDiv.textContent = '';

            const originalLog = console.log;
            const originalWarn = console.warn;
            let capturedOutput = '';

            console.log = (...args) => {
                capturedOutput += args.join(' ') + '\n';
                originalLog(...args);
            };
            console.warn = (...args) => {
                capturedOutput += 'WARNING: ' + args.join(' ') + '\n';
                originalWarn(...args);
            };

            try {
                const books = await getAllBooks();
                const results = checkDataIntegrity(books);
                const hasIssues = results.invalidRatings > 0;
                statusDiv.textContent = `Integrity check completed! ${results.booksWithRatings} rated, ${results.booksWithoutRatings} unrated, ${results.invalidRatings} invalid.`;
                statusDiv.style.color = hasIssues ? 'orange' : 'green';
                outputDiv.textContent = capturedOutput;
            } catch (error) {
                statusDiv.textContent = `Integrity check failed: ${error.message}`;
                statusDiv.style.color = 'red';
                outputDiv.textContent = capturedOutput + '\nERROR: ' + error.message;
            } finally {
                console.log = originalLog;
                console.warn = originalWarn;
            }
        });

        document.getElementById('init-ratings-btn').addEventListener('click', async () => {
            const statusDiv = document.getElementById('debug-status');
            const outputDiv = document.getElementById('debug-output');

            statusDiv.textContent = 'Initializing book ratings...';
            statusDiv.style.color = 'black';
            outputDiv.textContent = '';

            try {
                const books = await getAllBooks();
                const booksNeedingRatings = books.filter(book => book.rating === undefined || book.rating === null);
                const initializedBooks = initializeBookRatings(books);

                let updated = 0;
                for (const book of initializedBooks) {
                    if (booksNeedingRatings.some(b => b.id === book.id)) {
                        await updateBook(book);
                        updated++;
                    }
                }

                statusDiv.textContent = `Ratings initialized! ${updated} books updated with initial rating of ${INITIAL_RATING}.`;
                statusDiv.style.color = 'green';
                outputDiv.textContent = `Initialized ratings for ${updated} books.\nAll books now have Elo ratings starting at ${INITIAL_RATING}.`;
            } catch (error) {
                statusDiv.textContent = `Rating initialization failed: ${error.message}`;
                statusDiv.style.color = 'red';
                outputDiv.textContent = `ERROR: ${error.message}`;
            }
        });

        // Comparison System Tests
        document.getElementById('create-test-comparison-btn').addEventListener('click', async () => {
            const statusDiv = document.getElementById('debug-status');
            const outputDiv = document.getElementById('debug-output');

            statusDiv.textContent = 'Creating test comparison...';
            statusDiv.style.color = 'black';
            outputDiv.textContent = '';

            try {
                const books = await getAllBooks();
                if (books.length < 2) {
                    throw new Error('Need at least 2 books to create a comparison. Please import or add books first.');
                }

                // Pick two random books
                const bookA = books[Math.floor(Math.random() * books.length)];
                let bookB = books[Math.floor(Math.random() * books.length)];
                while (bookB.id === bookA.id) {
                    bookB = books[Math.floor(Math.random() * books.length)];
                }

                // Create comparison (random winner)
                const winner = Math.random() < 0.5 ? bookA : bookB;
                const comparison = new Comparison(bookA.id, bookB.id, winner.id);

                // Store comparison
                const comparisonId = await storeComparison(comparison);

                statusDiv.textContent = 'Test comparison created successfully!';
                statusDiv.style.color = 'green';
                outputDiv.textContent = `✅ Created comparison (ID: ${comparisonId}):
- "${bookA.title}" by ${bookA.author} vs "${bookB.title}" by ${bookB.author}
- Winner: "${winner.title}" by ${winner.author}
- Timestamp: ${new Date(comparison.timestamp).toLocaleString()}`;

            } catch (error) {
                statusDiv.textContent = `Failed to create test comparison: ${error.message}`;
                statusDiv.style.color = 'red';
                outputDiv.textContent = `ERROR: ${error.message}`;
            }
        });

        document.getElementById('view-comparison-history-btn').addEventListener('click', async () => {
            const statusDiv = document.getElementById('debug-status');
            const outputDiv = document.getElementById('debug-output');

            statusDiv.textContent = 'Loading comparison history...';
            statusDiv.style.color = 'black';
            outputDiv.textContent = '';

            try {
                const books = await getAllBooks();
                if (books.length === 0) {
                    throw new Error('No books found. Please import books first.');
                }

                // Get history for the first book (as an example)
                const history = await getComparisonHistory(books[0].id, 10);

                statusDiv.textContent = `Found ${history.length} comparisons for "${books[0].title}"`;
                statusDiv.style.color = 'blue';

                if (history.length === 0) {
                    outputDiv.textContent = `No comparisons found for "${books[0].title}". Create some test comparisons first.`;
                    return;
                }

                let output = `📚 Comparison History for "${books[0].title}" by ${books[0].author}:\n\n`;

                for (let i = 0; i < history.length; i++) {
                    const comp = history[i];
                    const opponentBook = books.find(b => b.id === (comp.bookA === books[0].id ? comp.bookB : comp.bookA));
                    const winnerBook = books.find(b => b.id === comp.winner);
                    const result = comp.winner === books[0].id ? 'WON' : 'LOST';

                    output += `${i + 1}. vs "${opponentBook.title}" by ${opponentBook.author}\n`;
                    output += `   Result: ${result} (${new Date(comp.timestamp).toLocaleString()})\n\n`;
                }

                outputDiv.textContent = output;

            } catch (error) {
                statusDiv.textContent = `Failed to load comparison history: ${error.message}`;
                statusDiv.style.color = 'red';
                outputDiv.textContent = `ERROR: ${error.message}`;
            }
        });

        document.getElementById('process-comparisons-btn').addEventListener('click', async () => {
            const statusDiv = document.getElementById('debug-status');
            const outputDiv = document.getElementById('debug-output');

            statusDiv.textContent = 'Processing comparisons and updating ratings...';
            statusDiv.style.color = 'black';
            outputDiv.textContent = '';

            try {
                const results = await processAllComparisons();

                statusDiv.textContent = 'Comparisons processed successfully!';
                statusDiv.style.color = 'green';

                outputDiv.textContent = `🎯 Comparison Processing Results:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Comparisons Processed: ${results.processedComparisons || 0}
Books Updated: ${results.updatedBooks || 0}
Total Books: ${results.totalBooks || 0}
Message: ${results.message || 'Processing completed'}`;

            } catch (error) {
                statusDiv.textContent = `Failed to process comparisons: ${error.message}`;
                statusDiv.style.color = 'red';
                outputDiv.textContent = `ERROR: ${error.message}`;
            }
        });

        document.getElementById('get-comparison-stats-btn').addEventListener('click', async () => {
            const statusDiv = document.getElementById('debug-status');
            const outputDiv = document.getElementById('debug-output');

            statusDiv.textContent = 'Calculating comparison statistics...';
            statusDiv.style.color = 'black';
            outputDiv.textContent = '';

            try {
                const stats = await getComparisonStats();

                statusDiv.textContent = 'Comparison statistics calculated!';
                statusDiv.style.color = 'green';

                outputDiv.textContent = `📊 Comparison Statistics:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Total Comparisons: ${stats.totalComparisons}
Unique Book Pairs: ${stats.uniqueBookPairs}
Books Compared: ${stats.booksCompared}
Most Active Book: ${stats.mostActiveBook ? `Book ID ${stats.mostActiveBook} (${stats.mostActiveBookComparisons} comparisons)` : 'None'}`;

            } catch (error) {
                statusDiv.textContent = `Failed to get comparison stats: ${error.message}`;
                statusDiv.style.color = 'red';
                outputDiv.textContent = `ERROR: ${error.message}`;
            }
        });

        // Ranking System Tests
        document.getElementById('calculate-ranking-btn').addEventListener('click', async () => {
            const statusDiv = document.getElementById('debug-status');
            const outputDiv = document.getElementById('debug-output');

            statusDiv.textContent = 'Calculating and storing current ranking...';
            statusDiv.style.color = 'black';
            outputDiv.textContent = '';

            try {
                const ranking = await updateCurrentRanking({ source: 'debug_ui' });

                statusDiv.textContent = 'Ranking calculated and stored successfully!';
                statusDiv.style.color = 'green';

                const stats = ranking.getStats();
                outputDiv.textContent = `🏆 Current Ranking Calculated:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Total Books Ranked: ${stats.totalBooks}
Rating Range: ${stats.lowestRating} - ${stats.highestRating}
Average Rating: ${stats.averageRating}
Timestamp: ${new Date(ranking.timestamp).toLocaleString()}

Top 5 Books:
${ranking.getTopBooks(5).map((book, index) =>
    `${index + 1}. "${book.title}" by ${book.author} (Rating: ${book.rating})`
).join('\n')}`;

            } catch (error) {
                statusDiv.textContent = `Failed to calculate ranking: ${error.message}`;
                statusDiv.style.color = 'red';
                outputDiv.textContent = `ERROR: ${error.message}`;
            }
        });

        document.getElementById('view-latest-ranking-btn').addEventListener('click', async () => {
            const statusDiv = document.getElementById('debug-status');
            const outputDiv = document.getElementById('debug-output');

            statusDiv.textContent = 'Loading latest ranking...';
            statusDiv.style.color = 'black';
            outputDiv.textContent = '';

            try {
                const ranking = await getLatestRanking();

                if (!ranking) {
                    statusDiv.textContent = 'No rankings found. Calculate a ranking first.';
                    statusDiv.style.color = 'orange';
                    outputDiv.textContent = 'No ranking snapshots found. Click "Calculate & Store Ranking" first.';
                    return;
                }

                statusDiv.textContent = 'Latest ranking loaded!';
                statusDiv.style.color = 'green';

                const stats = ranking.getStats();
                outputDiv.textContent = `🏆 Latest Ranking Snapshot:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Created: ${new Date(ranking.timestamp).toLocaleString()}
Total Books: ${stats.totalBooks}
Rating Range: ${stats.lowestRating} - ${stats.highestRating}
Average Rating: ${stats.averageRating}

Top 10 Books:
${ranking.getTopBooks(10).map((book, index) =>
    `${index + 1}. "${book.title}" by ${book.author} (Rating: ${book.rating})`
).join('\n')}`;

            } catch (error) {
                statusDiv.textContent = `Failed to load latest ranking: ${error.message}`;
                statusDiv.style.color = 'red';
                outputDiv.textContent = `ERROR: ${error.message}`;
            }
        });

        document.getElementById('view-ranking-history-btn').addEventListener('click', async () => {
            const statusDiv = document.getElementById('debug-status');
            const outputDiv = document.getElementById('debug-output');

            statusDiv.textContent = 'Loading ranking history...';
            statusDiv.style.color = 'black';
            outputDiv.textContent = '';

            try {
                const rankings = await getAllRankingsHistory(5); // Last 5 rankings

                if (rankings.length === 0) {
                    statusDiv.textContent = 'No ranking history found.';
                    statusDiv.style.color = 'orange';
                    outputDiv.textContent = 'No ranking snapshots found. Create some rankings first.';
                    return;
                }

                statusDiv.textContent = `Found ${rankings.length} ranking snapshots!`;
                statusDiv.style.color = 'green';

                let output = `📈 Ranking History (Last ${rankings.length} snapshots):\n`;
                output += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';

                rankings.forEach((ranking, index) => {
                    const stats = ranking.getStats();
                    output += `Snapshot ${index + 1}: ${new Date(ranking.timestamp).toLocaleString()}\n`;
                    output += `Books: ${stats.totalBooks}, Avg Rating: ${stats.averageRating}\n`;
                    output += `Top Book: "${ranking.rankedBooks[0].title}" (${ranking.rankedBooks[0].rating})\n\n`;
                });

                outputDiv.textContent = output;

            } catch (error) {
                statusDiv.textContent = `Failed to load ranking history: ${error.message}`;
                statusDiv.style.color = 'red';
                outputDiv.textContent = `ERROR: ${error.message}`;
            }
        });

        // Google Sheets Sync Tests
        document.getElementById('export-spreadsheet-btn').addEventListener('click', async () => {
            const statusDiv = document.getElementById('debug-status');
            const outputDiv = document.getElementById('debug-output');

            statusDiv.textContent = 'Exporting spreadsheet data...';
            statusDiv.style.color = 'black';
            outputDiv.textContent = '';

            try {
                const exportData = await exportForSpreadsheet();

                statusDiv.textContent = 'Spreadsheet data exported successfully!';
                statusDiv.style.color = 'green';

                // Format the data for display
                const stats = exportData.summary;
                let output = `📊 Spreadsheet Export Summary:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Total Books: ${stats.totalBooks}
Rated Books: ${stats.ratedBooks}
Unrated Books: ${stats.unratedBooks}
Total Comparisons: ${stats.totalComparisons}

📈 Rating Statistics:
Highest Rating: ${stats.highestRating}
Lowest Rating: ${stats.lowestRating}
Average Rating: ${stats.averageRating}
Most Compared Book: ${stats.mostComparedBook[0]} (${stats.mostComparedBook[1]} comparisons)

📋 Spreadsheet Data (Copy to Google Sheets):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;

                // Format the spreadsheet rows as tab-separated values for easy copying
                exportData.spreadsheetData.forEach((row, index) => {
                    if (index === 0) {
                        output += row.join('\t') + '\n'; // Headers
                        output += '─'.repeat(80) + '\n'; // Separator
                    } else {
                        output += row.join('\t') + '\n';
                    }
                });

                output += `\n💡 Copy the data above and paste into Google Sheets (use "Paste special" > "Paste values only")`;

                outputDiv.textContent = output;

            } catch (error) {
                statusDiv.textContent = `Failed to export spreadsheet data: ${error.message}`;
                statusDiv.style.color = 'red';
                outputDiv.textContent = `ERROR: ${error.message}`;
            }
        });

        document.getElementById('sync-to-sheets-btn').addEventListener('click', async () => {
            const statusDiv = document.getElementById('debug-status');
            const outputDiv = document.getElementById('debug-output');
            const spreadsheetId = document.getElementById('spreadsheet-id').value.trim();

            if (!spreadsheetId) {
                statusDiv.textContent = 'Please enter a spreadsheet ID first!';
                statusDiv.style.color = 'red';
                return;
            }

            statusDiv.textContent = 'Syncing to Google Sheets...';
            statusDiv.style.color = 'black';
            outputDiv.textContent = '';

            try {
                const results = await syncToSheets(spreadsheetId, false);

                statusDiv.textContent = 'Sync completed!';
                statusDiv.style.color = 'green';

                outputDiv.textContent = `📊 Sync Results:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
New Books Added: ${results.newBooksAdded || 0}
Books Updated: ${results.booksUpdated || 0}
Errors: ${results.errors || 0}
Message: ${results.message || 'Sync completed successfully'}`;

            } catch (error) {
                statusDiv.textContent = `Sync failed: ${error.message}`;
                statusDiv.style.color = 'red';
                outputDiv.textContent = `ERROR: ${error.message}`;
            }
        });

        document.getElementById('view-sync-status-btn').addEventListener('click', async () => {
            const statusDiv = document.getElementById('debug-status');
            const outputDiv = document.getElementById('debug-output');

            statusDiv.textContent = 'Checking sync status...';
            statusDiv.style.color = 'black';
            outputDiv.textContent = '';

            try {
                const status = getSyncStatus();

                statusDiv.textContent = 'Sync status retrieved!';
                statusDiv.style.color = 'blue';

                outputDiv.textContent = `🔄 Sync Queue Status:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Queued Operations: ${status.queuedOperations}
Currently Processing: ${status.isProcessing ? 'Yes' : 'No'}

${status.operations.length > 0 ?
    'Queued Operations:\n' + status.operations.map((op, index) =>
        `${index + 1}. ${op.type} (${new Date(op.timestamp).toLocaleString()}, ${op.retries} retries)`
    ).join('\n')
    : 'No operations currently queued.'}`;

            } catch (error) {
                statusDiv.textContent = `Failed to get sync status: ${error.message}`;
                statusDiv.style.color = 'red';
                outputDiv.textContent = `ERROR: ${error.message}`;
            }
        });

        document.getElementById('process-sync-queue-btn').addEventListener('click', async () => {
            const statusDiv = document.getElementById('debug-status');
            const outputDiv = document.getElementById('debug-output');

            statusDiv.textContent = 'Processing sync queue...';
            statusDiv.style.color = 'black';
            outputDiv.textContent = '';

            try {
                await processSyncQueue();
                statusDiv.textContent = 'Sync queue processed!';
                statusDiv.style.color = 'green';
                outputDiv.textContent = '✅ Sync queue processing completed. Check sync status for results.';

            } catch (error) {
                statusDiv.textContent = `Failed to process sync queue: ${error.message}`;
                statusDiv.style.color = 'red';
                outputDiv.textContent = `ERROR: ${error.message}`;
            }
        });

        document.getElementById('force-sync-to-sheets-btn').addEventListener('click', async () => {
            const statusDiv = document.getElementById('debug-status');
            const outputDiv = document.getElementById('debug-output');
            const spreadsheetId = document.getElementById('spreadsheet-id').value.trim();

            if (!spreadsheetId) {
                statusDiv.textContent = 'Please enter a spreadsheet ID first!';
                statusDiv.style.color = 'red';
                return;
            }

            const confirmed = confirm('This will COMPLETELY OVERWRITE your Google Sheet with current local data. All existing sheet data will be lost. Continue?');
            if (!confirmed) {
                statusDiv.textContent = 'Force sync cancelled';
                return;
            }

            statusDiv.textContent = 'Force syncing all data to Google Sheets...';
            statusDiv.style.color = 'black';
            outputDiv.textContent = '';

            try {
                const results = await syncToSheets(spreadsheetId, true);

                statusDiv.textContent = 'Force sync completed!';
                statusDiv.style.color = 'green';

                outputDiv.textContent = `🔄 Force Sync Results:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Books Force Synced: ${results.forceSynced || 0}
Message: ${results.message || 'Force sync completed successfully'}

⚠️  WARNING: This COMPLETELY OVERWROTE your Google Sheet!
💡 Your sheet now contains all current ranking data with Elo ratings.`;

            } catch (error) {
                statusDiv.textContent = `Force sync failed: ${error.message}`;
                statusDiv.style.color = 'red';
                outputDiv.textContent = `ERROR: ${error.message}`;
            }
        });

        document.getElementById('clear-debug-btn').addEventListener('click', () => {
            document.getElementById('debug-status').textContent = '';
            document.getElementById('debug-output').textContent = '';
        });
    }
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    app.init();
});