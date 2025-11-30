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
        console.log("✅ Gutenberg Download Detected");
        
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
    
    // Get title from cache using the referrer URL
    const cachedData = downloadItem.referrer ? titleCache[downloadItem.referrer] : null;
    const rawTitle = cachedData ? cachedData.title : null;
    
    if (rawTitle) {
        const baseFilename = cleanFilename(rawTitle);
        const extension = downloadItem.filename.split('.').pop();
        const newFilename = `${baseFilename}.${extension}`;
        
        console.log(`✅ Renaming file from ${downloadItem.filename} to ${newFilename}`);

        suggest({
            filename: newFilename,
            conflictAction: 'uniquify'
        });

        // Clean up the cached title
        if (downloadItem.referrer) {
            delete titleCache[downloadItem.referrer];
        }
    } else {
        console.warn("Title not available for renaming. Using default filename.");
        suggest(); 
    }
    
    return true; 
});