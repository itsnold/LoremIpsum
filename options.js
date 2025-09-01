// Lorem Ipsum Options Script

(async () => {
    "use strict";



    console.log("⚡ LoremIpsum Options loaded");

    // Initialize the modal options page
    // This function sets up the modal state and displays tool information
    async function initializeModalPage() {
        try {
            addSectionInteractions();
            updateToolStatus();
            setupKeyboardShortcuts();
            addRawEffects();
            console.log("🚀 LoremIpsum modal initialized successfully");

        } catch (error) {
            console.error("Error initializing modal page:", error);
        }
    }

    // Add interactive behavior to sections
    function addSectionInteractions() {
        const sections = document.querySelectorAll('.section');
        const statusItems = document.querySelectorAll('.status-item');
        const featureItems = document.querySelectorAll('.feature-item');
        const teamMembers = document.querySelectorAll('.team-member');


        sections.forEach(section => {
            section.addEventListener('mouseenter', () => {
                section.style.transform = 'translateY(-2px)';
            });

            section.addEventListener('mouseleave', () => {
                section.style.transform = 'translateY(0)';
            });
        });


        statusItems.forEach(item => {
            item.addEventListener('mouseenter', () => {
                item.style.background = '#2a2a2a';
                item.style.borderColor = '#666';
            });

            item.addEventListener('mouseleave', () => {
                item.style.background = '#1a1a1a';
                item.style.borderColor = '#333';
            });
        });


        featureItems.forEach(item => {
            item.addEventListener('mouseenter', () => {
                item.style.background = '#2a2a2a';
                item.style.borderColor = '#666';
            });

            item.addEventListener('mouseleave', () => {
                item.style.background = '#1a1a1a';
                item.style.borderColor = '#333';
            });
        });


        teamMembers.forEach(member => {
            member.addEventListener('mouseenter', () => {
                member.style.background = '#2a2a2a';
                member.style.borderColor = '#666';
            });

            member.addEventListener('mouseleave', () => {
                member.style.background = '#222';
                member.style.borderColor = '#333';
            });
        });
    }

    /**
     * Update tool status display with real data
     */
    function updateToolStatus() {

        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
            if (tabs && tabs[0]) {
                const currentUrl = tabs[0].url;
                const isSupported = currentUrl && currentUrl.includes('addu.edu.ph');

                if (isSupported) {
                    console.log("✅ Currently on supported domain");

                } else {
                    console.log("📍 Navigate to an ADDU quiz page to use the tool");
                }
            }
        });
    }

    /**
     * Setup keyboard shortcuts for the modal
     */
    function setupKeyboardShortcuts() {
        document.addEventListener('keydown', (event) => {

            if (event.key === 'Escape') {
                console.log('🏃 Escape key pressed - closing modal');
                window.close();
            }


            if (event.ctrlKey && event.key === 'r') {
                event.preventDefault();
                console.log('🔄 Refreshing tool status...');
                updateToolStatus();
            }


            if (event.ctrlKey && event.key === 'i') {
                event.preventDefault();
                console.log('ℹ️ Showing extension info...');
                displayExtensionInfo();
            }


            if (event.key.startsWith('Arrow')) {
                handleArrowNavigation(event);
            }
        });
    }

    /**
     * Handle arrow key navigation through sections
     */
    function handleArrowNavigation(event) {
        const sections = Array.from(document.querySelectorAll('.section'));
        const currentSection = document.activeElement?.closest('.section');
        let targetIndex = 0;

        if (currentSection) {
            const currentIndex = sections.indexOf(currentSection);

            if (event.key === 'ArrowDown' && currentIndex < sections.length - 1) {
                targetIndex = currentIndex + 1;
            } else if (event.key === 'ArrowUp' && currentIndex > 0) {
                targetIndex = currentIndex - 1;
            }
        }

        sections[targetIndex]?.scrollIntoView({
            behavior: 'smooth',
            block: 'center'
        });
    }

    // Add some raw visual effects that feel authentic
    function addRawEffects() {

        const style = document.createElement('style');
        style.textContent = `
            ::selection {
                background: rgba(0, 255, 255, 0.2);
                color: #fff;
            }

            .section h3::after {
                content: '';
                position: absolute;
                bottom: -5px;
                left: 0;
                width: 0;
                height: 1px;
                background: currentColor;
                transition: width 0.3s ease;
            }

            .section:hover h3::after {
                width: 100%;
            }
        `;
        document.head.appendChild(style);


        const closeBtn = document.querySelector('.close-btn');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                closeBtn.style.transform = 'scale(0.9)';
                setTimeout(() => {
                    closeBtn.style.transform = 'scale(1)';
                }, 100);
            });
        }
    }

    // Display extension information in console
    function displayExtensionInfo() {
        console.log(`
⚡ Lorem Ipsum v2.0
🚀 Community Type-to-Fill Tool
🆓 Free & Open Source
👥 Built by:
   • AJ Krystle Castro (Lead Dev & UI)
   • Kevin Clark Kaslana (Core Logic)
   • Reynold Angelo Segundo (Architecture)

📝 Keyboard Shortcuts:
   • ESC: Close modal
   • Ctrl+R: Refresh status
   • Ctrl+I: Show this info
   • Arrow Keys: Navigate sections
        `);
    }



    // Listen for storage changes
    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'local') {
            console.log('💾 Storage updated:', changes);
        }
    });

    // Window beforeunload handler for cleanup
    window.addEventListener('beforeunload', () => {
        console.log('👋 LoremIpsum modal unloading');
    });

    // Document ready handler
    document.addEventListener('DOMContentLoaded', () => {
        console.log('🎯 DOM Content Loaded - Initializing LoremIpsum');
    });



    // Add smooth scrolling behavior
    function addSmoothScrolling() {
        const modalContent = document.querySelector('.modal-content');
        if (modalContent) {
            modalContent.style.scrollBehavior = 'smooth';
        }
    }

    // Add focus management for accessibility
    function addFocusManagement() {

        const firstSection = document.querySelector('.section');
        if (firstSection) {
            firstSection.setAttribute('tabindex', '0');
        }


        document.querySelectorAll('.section').forEach(section => {
            section.setAttribute('tabindex', '0');
        });
    }



    try {

        displayExtensionInfo();


        await initializeModalPage();


        addSmoothScrolling();
        addFocusManagement();

    } catch (error) {
        console.error('💥 LoremIpsum modal initialization error:', error);
    }

})();