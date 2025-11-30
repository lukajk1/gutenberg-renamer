// The domain we are interested in monitoring
const TARGET_DOMAIN = "www.gutenberg.org";
const titleCache = {}; // Storage for titles by page URL

// --- UTILITY FUNCTION ---
function checkDomain(downloadUrl) {
    try {
        const urlObject = new URL(downloadUrl);
        const hostname = urlObject.hostname;
        return hostname === TARGET_DOMAIN || hostname.endsWith('.' + TARGET_DOMAIN);
    } catch (e) {
        console.error("Error processing URL:", downloadUrl, e);
        return false;
    }
}

// --- LISTEN FOR TITLE UPDATES FROM CONTENT SCRIPT ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "storeTitle" && request.pageUrl && request.title) {
        titleCache[request.pageUrl] = {
            title: request.title,
            timestamp: Date.now()
        };
        console.log(`Title cached for ${request.pageUrl}: ${request.title}`);
        
        // Clean up old entries (older than 5 minutes)
        const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
        for (const url in titleCache) {
            if (titleCache[url].timestamp < fiveMinutesAgo) {
                delete titleCache[url];
            }
        }
    }
});

// --- LISTEN FOR DOWNLOAD CREATION ---
chrome.downloads.onCreated.addListener((downloadItem) => {
    if (checkDomain(downloadItem.url)) {
        console.log("Gutenberg Download Detected");
        
        // Try to find the title from the referrer (the page that initiated the download)
        if (downloadItem.referrer && titleCache[downloadItem.referrer]) {
            console.log(`Found cached title for download ${downloadItem.id}`);
        }
    }
});

// ----------------------------------------------------------------------
// --- LISTEN FOR FILENAME DETERMINATION (TO APPLY RENAMING) ---

// The filename cleaning logic - formats as "Author - Title"
function cleanFilename(rawTitle) {
    if (!rawTitle) return "untitled_download";

    let filename = rawTitle.normalize('NFC').trim();
    
    // Look for " by " to split author and title
    const byIndex = filename.toLowerCase().indexOf(' by ');
    
    if (byIndex !== -1) {
        const title = filename.substring(0, byIndex).trim();
        const author = filename.substring(byIndex + 4).trim(); // +4 to skip " by "
        
        // Format as "Author - Title"
        filename = `${author} - ${title}`;
    }
    
    // Remove illegal filename characters but keep spaces
    const illegalCharsRegex = /[<>:"/\\|?*\u0000-\u001F]/g;
    filename = filename.replace(illegalCharsRegex, '');
    
    // Clean up any multiple spaces
    filename = filename.replace(/\s+/g, ' ').trim();

    return filename;
}

chrome.downloads.onDeterminingFilename.addListener((downloadItem, suggest) => {
    
    // Ensure this item is from the target domain
    if (!checkDomain(downloadItem.url)) {
        return false;
    }
    
    // DEBUG: Log all relevant information
    console.log("=== DOWNLOAD DEBUG INFO ===");
    console.log("Download URL:", downloadItem.url);
    console.log("Referrer:", downloadItem.referrer);
    console.log("Cached URLs:", Object.keys(titleCache));
    console.log("========================");
    
    // Try to find title from cache - check exact match first, then fuzzy match
    let rawTitle = null;
    
    if (downloadItem.referrer && titleCache[downloadItem.referrer]) {
        // Exact match found
        rawTitle = titleCache[downloadItem.referrer].title;
        console.log("Exact referrer match found");
    } else if (downloadItem.referrer) {
        // Try fuzzy matching - strip query params and fragments
        const cleanReferrer = downloadItem.referrer.split('?')[0].split('#')[0];
        
        for (const cachedUrl in titleCache) {
            const cleanCached = cachedUrl.split('?')[0].split('#')[0];
            if (cleanReferrer === cleanCached) {
                rawTitle = titleCache[cachedUrl].title;
                console.log("Fuzzy referrer match found");
                break;
            }
        }
    }
    
    // If still no match, try to find ANY cached title from gutenberg (last resort)
    if (!rawTitle && Object.keys(titleCache).length > 0) {
        const firstKey = Object.keys(titleCache)[0];
        rawTitle = titleCache[firstKey].title;
        console.log("Using most recent cached title as fallback");
    }
    
    if (rawTitle) {
        const baseFilename = cleanFilename(rawTitle);
        const extension = downloadItem.filename.split('.').pop();
        const newFilename = `${baseFilename}.${extension}`;
        
        console.log(`Renaming file from ${downloadItem.filename} to ${newFilename}`);

        suggest({
            filename: newFilename,
            conflictAction: 'uniquify'
        });

        // Don't delete the cache immediately - keep it for 30 seconds
        // in case the user downloads multiple formats from the same book
        setTimeout(() => {
            if (downloadItem.referrer && titleCache[downloadItem.referrer]) {
                delete titleCache[downloadItem.referrer];
                console.log("Cleaned up cached title after 30 seconds");
            }
        }, 30000);
    } else {
        console.warn("Title not available for renaming. Using default filename.");
        suggest(); 
    }
    
    return true; 
});