# Shelf Showdown Architecture

## Overview
Shelf Showdown is a client-side web application built with vanilla JavaScript, HTML, and CSS. It follows a modular architecture with separation of concerns, using IndexedDB for local data persistence and Google Sheets API for external synchronization.

## Data Types

### Book
```javascript
{
  id: string, // UUID
  title: string,
  author: string,
  genre: string,
  readCount: number,
  readDates: Date[], // Array of dates when read
  googleSheetsRowId: string, // For syncing with Sheets
  createdAt: Date,
  updatedAt: Date
}
```

### Comparison
```javascript
{
  id: string, // UUID
  bookAId: string,
  bookBId: string,
  winnerId: string, // ID of the preferred book
  scoreA: number, // Book A's score before comparison (for historical tracking)
  scoreB: number, // Book B's score before comparison (for historical tracking)
  timestamp: Date
}
```

### Ranking
```javascript
{
  bookId: string,
  score: number, // Elo score
  rank: number, // Computed rank
  lastUpdated: Date
}
```

### UserSession
```javascript
{
  googleAccessToken: string,
  googleRefreshToken: string,
  sheetsId: string, // Google Sheets document ID
  expiresAt: Date
}
```

## Data Storage

### IndexedDB Schema
- **books**: Object store for Book objects, indexed by id, title, author, genre.
- **comparisons**: Object store for Comparison objects, indexed by id, bookAId, bookBId, timestamp.
- **rankings**: Object store for Ranking objects, indexed by bookId.
- **sessions**: Object store for UserSession, single record.

### Google Sheets Integration
- Books stored in a Google Sheet with columns: Title, Author, Genre, Read Count, Read Dates (comma-separated), Row ID.
- Sync on app load (read from Sheets) and after adding books (write to Sheets).
- Uses Google API client library loaded via script tag.

## Application Modules

### Core Modules
- **db.js**: IndexedDB wrapper with CRUD operations.
- **sheets.js**: Google Sheets API integration functions.
- **auth.js**: OAuth authentication handling.
- **ranking.js**: Elo algorithm implementation and ranking calculations.
- **comparison.js**: Logic for selecting comparison pairs and managing comparison flow.

### UI Modules
- **ui.js**: Common UI utilities and neumorphism styling functions.
- **pages/**: Separate modules for each page (landing, books, compare, results).

## UI Architecture

### Mobile-First Design
- Responsive layout using CSS Grid and Flexbox.
- Neumorphism: Soft shadows and highlights using box-shadow properties.
- Touch-friendly interactions for mobile.

### Page Structure
- **index.html**: Single-page app with div containers for each view.
- **style.css**: Global styles with CSS custom properties for neumorphism colors.
- **app.js**: Main application logic, routing between views.

### Component Pattern
- Reusable UI components as functions returning HTML strings.
- Event delegation for dynamic elements.

## Algorithm Details

### Elo Rating System
- Initial score: 1200 for all books.
- K-factor: 32 for standard Elo.
- Update scores after each comparison: winner gains points, loser loses.

### Comparison Selection
- **Full Ranking Mode**: Select pairs with highest uncertainty (closest scores).
- **Focused Ranking Mode**: Binary search against sorted ranked list for new book placement.

### Ranking Calculation
- Sort books by Elo score descending.
- Assign ranks based on score order.
- **Historical Tracking**: With scores stored in comparisons, future features can reconstruct ranking changes over time for visualization (e.g., line plots of rank progression per book).

## Security Considerations
- OAuth tokens stored in IndexedDB (not secure, but client-side only).
- No sensitive data transmitted except to Google APIs.
- All logic client-side, no server trust issues.

## Performance
- Lazy loading of book data.
- Efficient IndexedDB queries with indexes.
- Minimal DOM updates using virtual scrolling for large lists if needed.

## Development Structure
```
shelf_showdown/
├── index.html
├── style.css
├── app.js
├── modules/
│   ├── db.js
│   ├── sheets.js
│   ├── auth.js
│   ├── ranking.js
│   ├── comparison.js
│   └── ui.js
├── pages/
│   ├── landing.js
│   ├── books.js
│   ├── compare.js
│   └── results.js
└── assets/
    └── (images, icons)