// Lorem Ipsum Background Script

(function() {
    "use strict";

    console.log("✨ LoremIpsum background script loaded");



    // Inject content script on navigation to quiz pages
    chrome.webNavigation.onCompleted.addListener((details) => {

        if (details.frameId === 0) {
            chrome.scripting.executeScript({
                target: { tabId: details.tabId },
                files: ['content.js']
            }).catch(error => {

                console.log("Content script injection skipped:", error.message);
            });
        }
    }, {
        url: [
            { hostSuffix: 'addu.edu.ph', pathContains: '/mod/quiz/attempt.php' },
            { hostSuffix: 'addu.edu.ph', pathContains: '/mod/quiz/review.php' }
        ]
    });



    // Extension startup handler
    chrome.runtime.onStartup.addListener(() => {
        console.log("🚀 LoremIpsum extension started");
    });

    // Extension installation/update handler
    chrome.runtime.onInstalled.addListener((details) => {
        console.log("🎉 LoremIpsum extension installed/updated");
        

        if (details.reason === 'install') {
            chrome.runtime.openOptionsPage?.() || 
            chrome.tabs.create({ url: chrome.runtime.getURL('options.html') });
        }
    });

    // Extension icon click handler
    chrome.action.onClicked.addListener(() => {

        chrome.runtime.openOptionsPage?.() || 
        chrome.tabs.create({ url: chrome.runtime.getURL('options.html') });
    });

    // Message handler for communication with content scripts
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (!message || !message.type) return;


        if (message.type === 'OPEN_OPTIONS') {
            chrome.runtime.openOptionsPage?.() || 
            chrome.tabs.create({ url: chrome.runtime.getURL('options.html') });
            
            sendResponse?.({ ok: true });
            return;
        }


        if (message.type === 'STATUS_CHECK') {
            sendResponse?.({
                ok: true,
                tool: 'LoremIpsum',
                version: '1.0',
                status: 'active'
            });
            return;
        }


        console.log("\ud83d\udcec Received message:", message);
        sendResponse?.({ ok: true, received: true });
    });



    // Get all tabs under the supported domain
    async function getSupportedTabs() {
        try {
            const tabs = await chrome.tabs.query({ url: '*://*.addu.edu.ph/*' });
            return tabs || [];
        } catch (error) {
            console.error("Error querying tabs:", error);
            return [];
        }
    }

    // Broadcast message to all supported tabs
    async function broadcastToSupportedTabs(message) {
        const tabs = await getSupportedTabs();
        
        for (const tab of tabs) {
            try {
                chrome.tabs.sendMessage(tab.id, message);
            } catch (error) {

                console.log("Message sending skipped for tab", tab.id, ":", error.message);
            }
        }
    }



    console.log("🎆 LoremIpsum background script ready");

})();