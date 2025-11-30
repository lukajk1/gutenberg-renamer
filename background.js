// The domain we are interested in monitoring
const TARGET_DOMAIN = "www.gutenberg.org";
const lastTitles = {}; // Storage for titles fetched by downloadId

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

// --- STEP 1: LISTEN FOR DOWNLOAD CREATION (TO FETCH TITLE) ---
chrome.downloads.onCreated.addListener((downloadItem) => {
    
    // Check if the download URL is from the target domain
    if (checkDomain(downloadItem.url)) {
        
        // --- DEBUG STATEMENT ---
        console.log("✅ Gutenberg Download Detected. Requesting Title from Tab...");
        
        // Find the active tab associated with this download.
        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
            if (tabs.length === 0) return;
            
            const tabId = tabs[0].id;

            // Send a message to the Content Script in the active tab
            chrome.tabs.sendMessage(tabId, { action: "getMetadata" }, (response) => {
                if (chrome.runtime.lastError) {
                    console.error("Error communicating with content script: ", chrome.runtime.lastError.message);
                    return;
                }
                
                if (response && response.title) {
                    // Store the fetched title using downloadItem.id (not tabId!)
                    lastTitles[downloadItem.id] = response.title;
                    console.log(`Title stored for Download ${downloadItem.id}: ${response.title}`);
                }
            });
        });
    }
});

// ----------------------------------------------------------------------
// --- STEP 2: LISTEN FOR FILENAME DETERMINATION (TO APPLY RENAMING) ---

// The filename cleaning logic - now formats as "Author - Title"
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
    // If no "by" found, keep the original title as-is
    
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
        // If not from the target domain, let the browser handle the naming
        return false;
    }
    
    // Function to attempt renaming with retry logic
    const attemptRename = (retryCount = 0) => {
        const rawTitle = lastTitles[downloadItem.id];
        
        if (rawTitle) {
            const baseFilename = cleanFilename(rawTitle);
            // Get the file extension from the original suggested filename
            const extension = downloadItem.filename.split('.').pop();
            
            const newFilename = `${baseFilename}.${extension}`;
            
            console.log(`✅ Renaming file from ${downloadItem.filename} to ${newFilename}`);

            // Use the suggest callback to tell the browser the new name
            suggest({
                filename: newFilename,
                conflictAction: 'uniquify' // The browser automatically adds (1), (2), etc.
            });

            // Clean up the stored title immediately after use
            delete lastTitles[downloadItem.id];
            
        } else if (retryCount < 10) {
            // Title not ready yet, wait a bit and retry (max 10 times = ~1 second)
            console.log(`Waiting for title... retry ${retryCount + 1}`);
            setTimeout(() => attemptRename(retryCount + 1), 100);
        } else {
            console.warn("Title not available for renaming after retries. Using default filename.");
            suggest(); 
        }
    };
    
    // Start the rename attempt
    attemptRename();
    
    // Returning true indicates that suggest() will be called asynchronously
    return true; 
});