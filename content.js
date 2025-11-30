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

// Send the title to the background script when the page loads
function sendTitleToBackground() {
    const title = getPageTitle();
    chrome.runtime.sendMessage({
        action: "storeTitle",
        pageUrl: window.location.href,
        title: title
    });
    console.log("Title sent to background script:", title);
}

// Send title when page loads
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', sendTitleToBackground);
} else {
    sendTitleToBackground();
}

// Also send title whenever a download link is clicked (as backup)
document.addEventListener('click', (e) => {
    const link = e.target.closest('a[href*=".epub"], a[href*=".pdf"], a[href*=".mobi"], a[href*=".txt"]');
    if (link) {
        console.log("Download link clicked, refreshing title cache");
        sendTitleToBackground();
    }
}, true);