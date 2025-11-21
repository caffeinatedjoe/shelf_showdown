// Main application entry point
console.log('Shelf Showdown app loaded');

import { authenticate, isAuthenticated, signOut, restoreToken } from './modules/auth.js';
import { initSheetsAPI, getSpreadsheetMetadata, readSheetData, appendSheetData, parseSheetDataToBooks, importBooksToDB } from './modules/sheets.js';
import { initDB, getAllBooks, deleteBook, insertTestData, exportDatabaseToConsole } from './modules/db.js';

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

        console.log('Test functions available:');
        console.log('- window.testAuth.authenticate(), window.testAuth.checkAuth(), window.testAuth.signOut()');
        console.log('- window.testDB.viewBooks(), window.testDB.exportToConsole(), window.testDB.insertTestData(), window.testDB.clearBooks()');
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
    }
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    app.init();
});