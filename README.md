# Shelf Showdown

A modern, mobile-first web application for ranking your personal book collection through pairwise comparisons. Import books from Google Sheets, perform comparisons, and discover your true reading preferences with Elo-based scoring.

## Features

- **Google Sheets Integration**: Seamlessly sync your book data with Google Sheets for easy management
- **Pairwise Comparisons**: Compare books two at a time to build accurate rankings
- **Intelligent Pair Selection**: Automatic selection of comparison pairs for efficient sorting
- **Focused Ranking Mode**: Quickly place new books in your existing rankings
- **Reading Analytics**: Visualize your reading habits with timelines, genre breakdowns, and statistics
- **Offline Support**: Works offline with local data storage
- **Mobile-First Design**: Beautiful neumorphism UI optimized for mobile devices
- **Elo Rating System**: Proven ranking algorithm used in competitive sports

## Technology Stack

- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **Data Storage**: IndexedDB for local persistence
- **External API**: Google Sheets API for data synchronization
- **Styling**: Neumorphism design with CSS custom properties
- **Architecture**: Modular, client-side application

## Quick Start

1. **Clone the repository**
   ```bash
   git clone https://github.com/caffeinatedjoe/shelf_showdown.git
   cd shelf_showdown
   ```

2. **Open in browser**
   - Simply open `index.html` in your web browser
   - No build process or server required

3. **Set up Google Sheets** (optional for full functionality)
   - Create a Google Sheet with columns: Title, Author, Genre, Read Count, Read Dates
   - Share the sheet with your Google account
   - The app will guide you through OAuth authentication

## Usage

1. **Authenticate**: Connect your Google account to access Sheets data
2. **Import Books**: Load your book collection from Google Sheets
3. **Start Ranking**: Begin pairwise comparisons to rank your books
4. **View Results**: See your ranked list with scores and analytics
5. **Add New Books**: Add books in-app and sync back to Sheets

---

Built with ❤️ for book lovers who want to understand their reading preferences better.