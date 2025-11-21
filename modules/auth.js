// modules/auth.js
// Handles Google OAuth authentication for accessing Google Sheets API

import { CONFIG } from '../config.js';

// IndexedDB setup for token storage
let db;

function initAuthDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('ShelfShowdownAuth', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('tokens')) {
        db.createObjectStore('tokens', { keyPath: 'id' });
      }
    };
  });
}

function storeToken(token) {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Auth DB not initialized'));
      return;
    }
    const transaction = db.transaction(['tokens'], 'readwrite');
    const store = transaction.objectStore('tokens');
    const request = store.put({ id: 'google_token', token: token, timestamp: Date.now() });
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

function getStoredToken() {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Auth DB not initialized'));
      return;
    }
    const transaction = db.transaction(['tokens'], 'readonly');
    const store = transaction.objectStore('tokens');
    const request = store.get('google_token');
    request.onsuccess = () => {
      const result = request.result;
      if (result && Date.now() - result.timestamp < 3600000) { // 1 hour expiry
        resolve(result.token);
      } else {
        resolve(null); // Expired or not found
      }
    };
    request.onerror = () => reject(request.error);
  });
}

function clearStoredToken() {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Auth DB not initialized'));
      return;
    }
    const transaction = db.transaction(['tokens'], 'readwrite');
    const store = transaction.objectStore('tokens');
    const request = store.delete('google_token');
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}


// Authenticate user and get access token
async function authenticate() {
  if (!db) {
    await initAuthDB();
  }

  return new Promise((resolve, reject) => {
    if (!window.google || !window.google.accounts || !window.google.accounts.oauth2) {
      reject(new Error('Google Identity Services not loaded'));
      return;
    }

    const tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: CONFIG.GOOGLE_CLIENT_ID,
      scope: 'https://www.googleapis.com/auth/spreadsheets.readonly https://www.googleapis.com/auth/spreadsheets',
      callback: async (response) => {
        if (response.error) {
          reject(new Error(`Auth error: ${response.error}`));
        } else {
          // Token obtained successfully
          try {
            await storeToken(response.access_token);
            resolve(response.access_token);
          } catch (error) {
            reject(error);
          }
        }
      }
    });

    tokenClient.requestAccessToken();
  });
}

// Check if user is authenticated (has valid token)
async function isAuthenticated() {
  if (!db) {
    await initAuthDB();
  }
  try {
    const token = await getStoredToken();
    return token !== null;
  } catch {
    return false;
  }
}

// Sign out user
async function signOut() {
  if (!db) {
    await initAuthDB();
  }
  try {
    await clearStoredToken();
  } catch (error) {
    console.error('Error clearing stored token:', error);
  }
}

// Restore token from storage
async function restoreToken() {
  if (!db) {
    await initAuthDB();
  }
  try {
    const token = await getStoredToken();
    return token !== null;
  } catch (error) {
    console.error('Error restoring token:', error);
    return false;
  }
}

export { authenticate, isAuthenticated, signOut, restoreToken };