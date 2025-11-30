// This script runs only on pages matching "www.gutenberg.org"

// Function to safely extract the desired title
function getPageTitle() {
    // 1. Try to get the <meta name="title">
    let title = document.querySelector('meta[name="title"]')?.content;
    
    if (title) {
        console.log("Found title from meta name='title'.");
        return title;
    }

    // 2. Try the backup: <meta property="og:title">
    title = document.querySelector('meta[property="og:title"]')?.content;

    if (title) {
        console.log("Found title from meta property='og:title'.");
        return title;
    }

    // 3. Last fallback: use the actual <title> tag content
    title = document.title;
    console.log("Using fallback title from <title> tag.");
    return title;
}

// Listener for messages coming from the background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "getMetadata") {
        const extractedTitle = getPageTitle();
        // Send the extracted title back to the background script
        sendResponse({ title: extractedTitle });
    }
    // Return true to indicate that we will send a response asynchronously
    return true; 
});