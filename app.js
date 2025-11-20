// Main application entry point
console.log('Shelf Showdown app loaded');

import { initGapi, authenticate, isAuthenticated, signOut, restoreToken } from './modules/auth.js';

// Basic app structure
const app = {
    init: async function() {
        console.log('Initializing app...');
        try {
            await initGapi();
            console.log('GAPI initialized');
            const restored = await restoreToken();
            if (restored) {
                console.log('Token restored from storage');
            } else {
                console.log('No stored token or expired');
            }
        } catch (error) {
            console.error('Initialization error:', error);
        }
        // TODO: Initialize modules and routing
        this.setupTestFunctions();
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
        console.log('Test functions available: window.testAuth.authenticate(), window.testAuth.checkAuth(), window.testAuth.signOut()');
    }
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    app.init();
});