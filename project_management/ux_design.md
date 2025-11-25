# Shelf Showdown UI/UX Design

This document outlines the user interface and experience for the Shelf Showdown application, based on the user stories. The app prioritizes quick, bite-sized ranking sessions for users with a few minutes to spare.

## App Flow Overview

1. **Initial Load:** Check if local database exists
   - If database exists → Go to Comparison Screen
   - If no database → Go to Setup Screen

2. **Main Navigation:** Tab-based interface with:
   - Compare (default/main tab)
   - Rankings
   - Add Book
   - Settings

## 1. Setup Screen (First-Time Users)

### UI Description

- Clean, welcoming page with app logo "Shelf Showdown" at the top.
- Prominent "Connect with Google" button to authenticate and access Google Sheets.
- Brief explanation: "Connect your Google Sheet to import your book list and start ranking."
- Progress indicator showing setup steps.

### Interactable Elements

- **Connect with Google Button:**
    - **Action:** Initiates Google OAuth flow and requests Sheets API permissions.
    - **Success Outcome:** Authenticates user, reads book data from specified Google Sheet, creates local database, and redirects to Comparison screen.
    - **Failure Outcome:** Shows error message with retry option.

## 2. Comparison Screen (Main Interface)

### UI Description

- Header with app logo and tab navigation: Compare | Rankings | Add Book | Settings
- Main content: Two book cards displayed side by side.
- Each card shows: title, author, genre, times read, and ranking score (if available).
- Progress indicator: "Comparison X of Y" or "Keep going!" for ongoing sessions.
- Action buttons below cards: "Prefer Left", "Prefer Right", "Skip", "Undo".

### Interactable Elements

- **Book Cards:**
    - **Action:** Clicking a card records preference for that book.
    - **Outcome:** Saves comparison, updates rankings, loads next pair.

- **Prefer Left/Right Buttons:**
    - **Action:** Records preference for the corresponding book.
    - **Outcome:** Advances to next comparison pair.

- **Skip Button:**
    - **Action:** Marks current pair as undecided.
    - **Outcome:** Moves to next pair without recording preference.

- **Undo Button:**
    - **Action:** Reverses the last comparison.
    - **Outcome:** Returns to previous pair for re-evaluation.

- **Tab Navigation:**
    - **Action:** Switches between main app functions.
    - **Outcome:** Changes main content area to selected tab.

## 3. Rankings Tab

### UI Description

- Displays current book rankings in a scrollable list.
- Each book shows: rank, title, author, score, times read.
- Sort and filter options at the top.
- Export button for downloading rankings.

### Interactable Elements

- **Sort Dropdown:**
    - Options: By Rank, By Title, By Author, By Score, By Times Read.
    - **Action:** Reorders the list.
    - **Outcome:** Updates displayed order.

- **Filter Input:**
    - **Action:** Filters books by title, author, or genre.
    - **Outcome:** Shows only matching books.

- **Export Button:**
    - **Action:** Downloads rankings as CSV.
    - **Outcome:** Initiates file download.

## 4. Add Book Tab

### UI Description

- Simple form for adding new books directly in the app.
- Fields: Title, Author, Genre, Times Read, Date Read.
- Submit and Cancel buttons.

### Interactable Elements

- **Add Book Form:**
    - **Submit Action:** Validates and adds book to database.
    - **Success Outcome:** Book added, form cleared, success message shown.
    - **Failure Outcome:** Error message for validation issues.

## 5. Settings Tab

### UI Description

- Basic settings and database management options.
- Options for data management and app preferences.

### Interactable Elements

- **Purge Database Button:**
    - **Action:** Shows confirmation dialog for deleting all data.
    - **Outcome:** Clears local database and redirects to Setup screen.

- **Reconnect Google Sheets Button:**
    - **Action:** Re-initiates Google authentication.
    - **Outcome:** Updates connection to Google Sheets.

- **Logout Button:**
    - **Action:** Signs out user.
    - **Outcome:** Clears authentication and redirects to Setup screen.
