# GEMINI.md

## Project Overview

This project is a web-based e-book reader designed for `.txt` files. It's built with vanilla HTML, CSS, and JavaScript, focusing on simplicity and core reading functionalities. The application allows users to open local text files, which are then parsed into paragraphs and paginated for easy reading.

A key feature is the text-to-speech (TTS) capability, which uses the browser's built-in Web Speech API to read the book aloud. The reader saves the user's progress, including the last read page and paragraph, using a combination of IndexedDB and `localStorage`. This ensures that users can resume their reading session exactly where they left off.

The application also includes a book list feature, allowing users to manage multiple books, and a search function to find specific content within a book. The interface is responsive, providing a good user experience on both desktop and mobile devices.

## Building and Running

This is a static web application with no build process. To run the project, you need to serve the files using a local web server.

**Running the application:**

1.  Make sure you have Node.js installed.
2.  If you don't have a local server installed, you can use `http-server`:
    ```bash
    npm install -g http-server
    ```
3.  Start the server in the project's root directory:
    ```bash
    http-server -c-1
    ```
4.  Open your browser and navigate to the local address provided by the server (e.g., `http://localhost:8080`).

**Testing specific features:**

The project includes two test files:

*   `test-paragraphs.html`: For testing the text-to-paragraph splitting logic.
*   `test-voice-loading.html`: For testing the voice loading and TTS functionality.

You can access these files directly through your local server (e.g., `http://localhost:8080/test-voice-loading.html`).

## Development Conventions

*   **Code Style:** The project uses vanilla JavaScript with a focus on clear, modular functions. The code is organized into three main files:
    *   `main.js`: Handles application initialization, UI event listeners, and user interactions.
    *   `reader.js`: Contains the core logic for text processing, pagination, search, and the text-to-speech feature.
    *   `db.js`: Manages all database operations with IndexedDB.
*   **Search:** The search functionality is implemented in `reader.js` and `main.js`. The `searchInBook` function in `reader.js` filters the paragraphs of the current book based on a search query. The results are displayed in a responsive overlay, and clicking on a result navigates the user to the corresponding page and highlights the paragraph.
*   **Database:** IndexedDB is used to store the book content and progress. The `db.js` file provides a simple API for creating, reading, updating, and deleting books.
*   **State Management:** The application's state, such as the current book, page, and speaking status, is managed through global variables. `localStorage` is used to store metadata, like the ID of the last opened book.
*   **Error Handling:** The application includes basic error handling, especially for the Web Speech API, with user-friendly alerts for common issues (e.g., voice loading failures).
*   **Compatibility:** The code includes specific workarounds for issues with the Web Speech API on certain browsers, such as the Android Edge browser, as documented in `README-VOICE-FIX.md`.
