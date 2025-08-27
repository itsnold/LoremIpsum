(function() {
    "use strict";

    if (window.typeToFillInterface) {
        console.log("✅ LoremIpsum Interface already loaded.");
        return;
    }

    const DELAY_MS = 7;
    const STORAGE_KEY = "ttf_presets_" + location.hostname;
    let interfaceModal = null;
    let isInterfaceActive = false;

    function base64Decode(encodedString) {
        try {
            const paddedString = encodedString + "===".slice((encodedString.length + 3) % 4);
            const normalizedString = paddedString
                .replace(/-/g, "+")
                .replace(/_/g, "/");
            const decodedString = atob(normalizedString);
            const uint8Array = new Uint8Array(decodedString.length);

            for (let i = 0; i < decodedString.length; i++) {
                uint8Array[i] = decodedString.charCodeAt(i);
            }

            return uint8Array;
        } catch (error) {
            return new Uint8Array();
        }
    }

    // Query selector helper - returns array of elements
    const queryAll = (selector, context = document) =>
        Array.from((context || document).querySelectorAll(selector));

    // Clean and normalize text content
    const cleanText = (text) =>
        String(text || "")
            .replace(/\u00A0/g, " ")         // Non-breaking spaces
            .replace(/[\u200B\uFEFF]/g, "")  // Zero-width characters
            .trim();

    // Simple delay utility
    const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    // Detect current page type based on URL
    function getPageType() {
        const url = window.location.href;

        if (url.includes('/mod/quiz/attempt.php')) {
            return 'quiz';
        } else if (url.includes('/mod/quiz/review.php')) {
            return 'review';
        } else {
            return 'unknown';
        }
    }

    function getPageContext() {
        const pageType = getPageType();
        const url = window.location.href;

        const urlParams = new URLSearchParams(window.location.search);
        const attemptId = urlParams.get('attempt');
        const cmid = urlParams.get('cmid');

        return {
            type: pageType,
            attemptId,
            cmid,
            url
        };
    }

    function getQuizName() {
        const querySelector = (selector, context = document) => (context || document).querySelector(selector);
        const headerElement = querySelector(".page-header-headings h1, .page-header .page-title, h1.rui-main-content-title--h1, h1");

        let detectedName = "";
        if (headerElement) {
            detectedName = cleanText(headerElement.textContent).slice(0, 80);
        } else {
            const titleText = document.title || document.querySelector("h1")?.textContent;
            detectedName = cleanText(titleText || "").slice(0, 80);
        }

        console.log("TTF: Detected page quiz name:", detectedName);
        return detectedName;
    }

    function autoLoadAnswersForCurrentQuestion() {
        const activeQuestion = document.querySelector(".que.notyetanswered");

        if (!activeQuestion) {
            showToast("No active question found");
            return;
        }

        const questionId = manualQuestionOverride || detectQuestionNumber(activeQuestion);
        if (!questionId) {
            showToast("Could not detect question number");
            return;
        }

        console.log("TTF: Auto-loading answers for", questionId);

        let quizName = localStorage.getItem('ttf_selected_quiz');

        if (!quizName) {
            quizName = getQuizName();
        }

        const presets = loadPresets();
        let foundPreset = null;
        let sourceQuiz = null;

        if (quizName && presets[quizName] && presets[quizName].questions && presets[quizName].questions[questionId]) {
            foundPreset = presets[quizName].questions[questionId];
            sourceQuiz = quizName;
        }

        if (!foundPreset) {
            for (const availableQuizName of Object.keys(presets)) {
                if (presets[availableQuizName].questions && presets[availableQuizName].questions[questionId]) {
                    foundPreset = presets[availableQuizName].questions[questionId];
                    sourceQuiz = availableQuizName;
                    localStorage.setItem('ttf_selected_quiz', availableQuizName);
                    break;
                }
            }
        }

        if (foundPreset) {
            let answerText = "";

            if (foundPreset.parts && foundPreset.parts.length > 0) {
                answerText = foundPreset.parts.join(" || ");
            } else if (foundPreset.text) {
                answerText = foundPreset.text;
            } else if (foundPreset.structured && foundPreset.structured.selectedText) {
                answerText = foundPreset.structured.selectedText;
            }

            if (answerText) {
                const pasteArea = document.getElementById("ttf-paste-area");
                if (pasteArea) {
                    pasteArea.value = answerText;
                    showToast(`Loaded ${questionId} from "${sourceQuiz}"`);
                    console.log(`TTF: Loaded ${questionId} from "${sourceQuiz}":`, answerText);
                } else {
                    showToast("Could not find paste area");
                }
            } else {
                showToast(`No answer text found for ${questionId}`);
            }
        } else {
            showToast(`No preset found for ${questionId}`);
            console.log(`TTF: No preset found for ${questionId}`);
        }
    }

    function detectQuestionNumber(questionElement) {
        let questionNumber = null;

        const numberElement = questionElement.querySelector(".rui-qno, .qno, .number, .qn, .question-number");
        if (numberElement) {
            questionNumber = String(numberElement.textContent || "").replace(/\D/g, "");
        }

        if (!questionNumber) {
            const idMatch = (questionElement.id || "").match(/-(\d+)$/);
            if (idMatch) {
                questionNumber = idMatch[1];
            }
        }

        if (!questionNumber) {
            const textContent = questionElement.textContent || "";
            const questionMatch = textContent.match(/Question\s+(\d+)/i);
            if (questionMatch) {
                questionNumber = questionMatch[1];
            }
        }

        if (!questionNumber) {
            const textContent = questionElement.textContent || "";
            const qMatch = textContent.match(/Q(\d+)/i);
            if (qMatch) {
                questionNumber = qMatch[1];
            }
        }

        return questionNumber ? "Q" + questionNumber : null;
    }

    function detectQuestionType(questionElement) {
        if (questionElement.classList.contains("ddwtos")) {
            return "ddwtos";
        }
        if (questionElement.classList.contains("multianswer")) {
            return "multianswer";
        }
        if (questionElement.classList.contains("answersselect")) {
            return "answersselect";
        }

        // Fallback detection based on DOM elements
        if (questionElement.querySelector(".draghome, .drop")) {
            return "ddwtos";
        }
        if (questionElement.querySelector('.subquestion input, input[name*="_sub"]')) {
            return "multianswer";
        }
        if (questionElement.querySelector('input[type="radio"], input[type="checkbox"]')) {
            return "answersselect";
        }

        return "unknown";
    }

    function updateQuestionStatus() {
        const activeQuestion = document.querySelector(".que.notyetanswered");
        const questionStatus = document.getElementById("question-status");
        const refreshButton = questionStatus ? questionStatus.nextElementSibling : null;
        const manualCorrectionButton = refreshButton ? refreshButton.nextElementSibling : null;

        if (!questionStatus) return;

        if (manualCorrectionButton) {
            manualCorrectionButton.style.display = activeQuestion ? "block" : "none";
        }

        if (!activeQuestion) {
            questionStatus.style.display = "block";
            if (refreshButton) refreshButton.style.display = "block";
            questionStatus.style.background = "rgba(239, 68, 68, 0.1)";
            questionStatus.style.borderColor = "rgba(239, 68, 68, 0.2)";
            questionStatus.textContent = "⚠️ No active question found";
            return;
        }

        let questionId = manualQuestionOverride || detectQuestionNumber(activeQuestion);
        const isManuallyCorrected = manualQuestionOverride !== null;

        if (questionId) {
            questionStatus.style.display = "block";
            if (refreshButton) refreshButton.style.display = "block";

            if (isManuallyCorrected) {
                questionStatus.style.background = "rgba(245, 101, 101, 0.1)";
                questionStatus.style.borderColor = "rgba(245, 101, 101, 0.2)";
                questionStatus.textContent = `🔧 Manually corrected: ${questionId}`;
            } else {
                questionStatus.style.background = "rgba(34, 197, 94, 0.1)";
                questionStatus.style.borderColor = "rgba(34, 197, 94, 0.2)";
                questionStatus.textContent = `✅ Current question: ${questionId}`;
            }

            let quizName = localStorage.getItem('ttf_selected_quiz') || getQuizName();
            const presets = loadPresets();
            let hasPreset = presets[quizName] &&
                presets[quizName].questions &&
                presets[quizName].questions[questionId];

            if (!hasPreset) {
                for (const availableQuizName of Object.keys(presets)) {
                    if (presets[availableQuizName].questions && presets[availableQuizName].questions[questionId]) {
                        hasPreset = true;
                        quizName = availableQuizName;
                        break;
                    }
                }
            }

            if (hasPreset) {
                questionStatus.textContent += ` (preset available in "${quizName}")`;
            }
        } else {
            questionStatus.style.display = "block";
            if (refreshButton) refreshButton.style.display = "block";
            questionStatus.style.background = "rgba(251, 146, 60, 0.1)";
            questionStatus.style.borderColor = "rgba(251, 146, 60, 0.2)";
            questionStatus.textContent = "🔍 Question number not detected";
        }
    }

    function showToast(message, duration = 1800) {
        const toastId = "ttf-temp-toast";
        const existingToast = document.getElementById(toastId);
        if (existingToast) {
            existingToast.remove();
        }

        const toast = document.createElement("div");
        toast.id = toastId;
        toast.style.cssText = `
            position: fixed;
            right: 18px;
            bottom: 18px;
            background: #333;
            color: #fff;
            padding: 10px 12px;
            border-radius: 6px;
            z-index: 100002;
            font-family: Arial, sans-serif;
        `;
        toast.textContent = message;
        document.body.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = "0";
            setTimeout(() => toast.remove(), 300);
        }, duration);
    }
    function loadPresets() {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
        } catch (error) {
            return {};
        }
    }

    function savePresets(presets) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(presets || {}));
        } catch (error) {
            console.warn("TTF: save presets failed", error);
        }
    }

    function createMainInterface() {
        const pageContext = getPageContext();
        console.log("TTF: Detected page type:", pageContext.type);

        const questionSelectors = ".que.ddwtos, .que.answersselect, .que.multianswer";
        if (!document.querySelectorAll(questionSelectors).length) {
            if (!document.querySelectorAll(".que").length) {
                console.log("TTF: no questions found on this page - not creating modal.");
                return;
            }
        }

        if (document.querySelector(".loremipsum-modal")) {
            return;
        }

        if (pageContext.type === 'quiz') {
            createQuizInterface(pageContext);
        } else if (pageContext.type === 'review') {
            createReviewInterface(pageContext);
        } else {
            createQuizInterface(pageContext);
        }
    }


    function createQuizInterface(pageContext) {
        console.log("TTF: Creating quiz interface");

        const existingPresets = loadPresets();
        const hasPresets = Object.keys(existingPresets).length > 0;

        if (!hasPresets) {
            createImportFirstModal();
            return;
        }

        createStandardQuizModal(pageContext);
    }

    let manualQuestionOverride = null;

    function openManualCorrectionModal() {
        const existingModal = document.getElementById("manual-correction-modal");
        if (existingModal) {
            existingModal.remove();
        }

        const modal = document.createElement("div");
        modal.id = "manual-correction-modal";
        modal.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: #0b1220;
            color: #e5e7eb;
            border-radius: 12px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.5);
            min-width: 350px;
            max-width: 90vw;
            z-index: 10000;
            padding: 0;
            border: 1px solid rgba(59, 130, 246, 0.2);
        `;

        const header = document.createElement("div");
        header.style.cssText = `
            padding: 16px 20px;
            border-bottom: 1px solid rgba(59, 130, 246, 0.2);
            background: linear-gradient(135deg, rgba(59, 130, 246, 0.1), rgba(147, 51, 234, 0.1));
            border-radius: 12px 12px 0 0;
            cursor: move;
            display: flex;
            align-items: center;
            justify-content: space-between;
        `;
        header.innerHTML = `
            <div style="display: flex; align-items: center; gap: 8px;">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M11,4H4a2,2 0,0,0-2,2V18a2,2 0,0,0,2,2H18a2,2 0,0,0,2-2V13"></path>
                    <polygon points="18.5,2.5 21.5,5.5 18.5,8.5 18.5,2.5"></polygon>
                    <line x1="18.5" y1="2.5" x2="18.5" y2="8.5"></line>
                    <line x1="18.5" y1="5.5" x2="21.5" y2="5.5"></line>
                </svg>
                <span style="font-weight: 600; font-size: 14px;">Manual Question Correction</span>
            </div>
            <button id="close-modal-btn" style="
                background: none;
                border: none;
                color: #9ca3af;
                cursor: pointer;
                padding: 4px;
                border-radius: 4px;
                transition: all 0.2s ease;
            " title="Close">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            </button>
        `;

        const content = document.createElement("div");
        content.style.cssText = "padding: 20px;";

        const activeQuestion = document.querySelector(".que.notyetanswered");
        const detectedQuestion = activeQuestion ? detectQuestionNumber(activeQuestion) : null;

        content.innerHTML = `
            <div style="margin-bottom: 16px;">
                <label style="display: block; font-size: 13px; font-weight: 500; margin-bottom: 8px; color: #d1d5db;">
                    ${detectedQuestion ? `Currently detected: <strong style="color: #3b82f6;">${detectedQuestion}</strong>` : 'No question currently detected'}
                </label>
                <div style="display: flex; align-items: center; gap: 8px;">
                    <label for="question-input" style="font-size: 13px; font-weight: 500; color: #e5e7eb; white-space: nowrap;">
                        Correct question:
                    </label>
                    <input type="text" id="question-input" placeholder="e.g., Q30"
                        style="
                            flex: 1;
                            padding: 8px 12px;
                            border: 1px solid rgba(59, 130, 246, 0.2);
                            border-radius: 6px;
                            background: rgba(59, 130, 246, 0.05);
                            color: #e5e7eb;
                            font-size: 13px;
                            outline: none;
                            transition: all 0.2s ease;
                        "
                        value="${manualQuestionOverride || ''}"
                    />
                </div>
            </div>
            <div style="display: flex; gap: 8px; justify-content: flex-end;">
                <button id="clear-override-btn" style="
                    padding: 8px 16px;
                    border-radius: 6px;
                    border: 1px solid rgba(156, 163, 175, 0.2);
                    background: rgba(156, 163, 175, 0.1);
                    color: #9ca3af;
                    cursor: pointer;
                    font-size: 12px;
                    font-weight: 500;
                    transition: all 0.2s ease;
                " ${!manualQuestionOverride ? 'disabled' : ''}>Clear Override</button>
                <button id="apply-correction-btn" style="
                    padding: 8px 16px;
                    border-radius: 6px;
                    border: 1px solid rgba(34, 197, 94, 0.2);
                    background: rgba(34, 197, 94, 0.1);
                    color: #22c55e;
                    cursor: pointer;
                    font-size: 12px;
                    font-weight: 500;
                    transition: all 0.2s ease;
                ">Apply Correction</button>
            </div>
        `;

        modal.appendChild(header);
        modal.appendChild(content);
        document.body.appendChild(modal);

        setTimeout(() => {
            const input = document.getElementById("question-input");
            if (input) {
                input.focus();
                input.select();
            }
        }, 100);

        const closeBtn = document.getElementById("close-modal-btn");
        const clearBtn = document.getElementById("clear-override-btn");
        const applyBtn = document.getElementById("apply-correction-btn");
        const input = document.getElementById("question-input");

        closeBtn.addEventListener("click", () => modal.remove());
        closeBtn.addEventListener("mouseenter", () => {
            closeBtn.style.background = "rgba(239, 68, 68, 0.1)";
            closeBtn.style.color = "#ef4444";
        });
        closeBtn.addEventListener("mouseleave", () => {
            closeBtn.style.background = "none";
            closeBtn.style.color = "#9ca3af";
        });

        clearBtn.addEventListener("click", () => {
            manualQuestionOverride = null;
            modal.remove();
            updateQuestionStatus();
            showToast("Question override cleared");
        });

        applyBtn.addEventListener("click", () => {
            const questionValue = input.value.trim();
            if (!questionValue) {
                showToast("Please enter a question number");
                input.focus();
                return;
            }

            const numberMatch = questionValue.match(/(\d+)/);
            if (!numberMatch) {
                showToast("Invalid question format. Use 'Q30' or '30'");
                input.focus();
                return;
            }

            manualQuestionOverride = "Q" + numberMatch[1];
            modal.remove();
            updateQuestionStatus();
            showToast(`Question corrected to ${manualQuestionOverride}`);
        });

        input.addEventListener("keypress", (e) => {
            if (e.key === "Enter") {
                applyBtn.click();
            }
        });

        input.addEventListener("focus", () => {
            input.style.borderColor = "rgba(59, 130, 246, 0.5)";
            input.style.boxShadow = "0 0 0 3px rgba(59, 130, 246, 0.1)";
        });
        input.addEventListener("blur", () => {
            input.style.borderColor = "rgba(59, 130, 246, 0.2)";
            input.style.boxShadow = "none";
        });

        modal.addEventListener("click", (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });
    }

    function createImportFirstModal() {
        console.log("TTF: No presets found, showing import-first modal");

        const modal = document.createElement("div");
        modal.className = "loremipsum-modal";
        modal.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: #0b1220;
            color: #e5e7eb;
            border-radius: 16px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.5);
            min-width: 400px;
            max-width: 90vw;
            max-height: 85vh;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            border: 1px solid #1f2937;
            cursor: default;
            user-select: none;
            overflow: hidden;
            transition: none;
            z-index: 100000;
            animation: slideUp 0.4s ease;
        `;

        const header = document.createElement("div");
        header.style.cssText = `
            background: linear-gradient(135deg, #0b1220 0%, #111827 100%);
            color: #e5e7eb;
            padding: 10px 16px;
            font-weight: 600;
            display: flex;
            align-items: center;
            justify-content: space-between;
            cursor: move;
            border-radius: 16px 16px 0 0;
            border-bottom: 1px solid #1f2937;
            user-select: none;
        `;

        const title = document.createElement("div");
        title.textContent = "LoremIpsum - Quiz Mode";
        title.style.cssText = "font-size: 15px; display: flex; align-items: center; gap: 8px; color: #e2e8f0;";
        const icon = document.createElement("span");
        icon.textContent = "📝";
        icon.style.cssText = "font-size: 18px;";
        title.insertBefore(icon, title.firstChild);
        header.appendChild(title);

        const closeButton = document.createElement("button");
        closeButton.textContent = "✕";
        closeButton.title = "Close";
        closeButton.style.cssText = `
            background: rgba(255,255,255,0.06);
            border: 1px solid rgba(255,255,255,0.12);
            color: #e5e7eb;
            border-radius: 6px;
            padding: 4px 8px;
            cursor: pointer;
            font-size: 13px;
            font-weight: 600;
            transition: all 0.2s ease;
        `;
        closeButton.addEventListener("mouseenter", () => {
            closeButton.style.background = "rgba(255,255,255,0.2)";
        });
        closeButton.addEventListener("mouseleave", () => {
            closeButton.style.background = "rgba(255,255,255,0.1)";
        });
        header.appendChild(closeButton);
        modal.appendChild(header);

        const content = document.createElement("div");
        content.style.cssText = "padding: 20px 16px; display: flex; flex-direction: column; gap: 15px; text-align: center;";

        const importMessage = document.createElement("div");
        importMessage.innerHTML = `
            <div style="font-size: 18px; color: #fbbf24; margin-bottom: 8px;">⚠️ No Quiz Presets Found</div>
            <div style="font-size: 14px; color: #93a3b8; line-height: 1.5;">You need to import quiz presets before you can use the auto-fill functionality.</div>
        `;
        content.appendChild(importMessage);

        const importFileButton = document.createElement("button");
        importFileButton.innerHTML = "📥 Import Quiz Preset File";
        importFileButton.style.cssText = `
            padding: 12px 20px;
            border-radius: 8px;
            border: 1px solid #1f2937;
            background: #0f172a;
            color: #e5e7eb;
            cursor: pointer;
            font-weight: 600;
            font-size: 14px;
            transition: all 0.2s ease;
        `;
        importFileButton.addEventListener("mouseenter", () => {
            importFileButton.style.transform = "translateY(-1px)";
            importFileButton.style.background = "rgba(255,255,255,0.1)";
            importFileButton.style.borderColor = "#555";
            importFileButton.style.boxShadow = "0 4px 12px rgba(255, 255, 255, 0.1)";
        });
        importFileButton.addEventListener("mouseleave", () => {
            importFileButton.style.transform = "translateY(0)";
            importFileButton.style.background = "#0f172a";
            importFileButton.style.borderColor = "#1f2937";
            importFileButton.style.boxShadow = "none";
        });
        content.appendChild(importFileButton);

        const fileInput = document.createElement("input");
        fileInput.type = "file";
        fileInput.accept = "application/json";
        fileInput.style.display = "none";
        content.appendChild(fileInput);

        importFileButton.addEventListener("click", () => {
            fileInput.click();
        });

        fileInput.addEventListener("change", async (event) => {
            const file = event.target.files[0];
            if (!file) return;

            try {
                const fileContent = await file.text();
                const importData = JSON.parse(fileContent);

                if (!importData.__loremipsum_preset_export__ || !importData.quiz || !importData.data) {
                    showToast("Invalid preset file format");
                    return;
                }

                const quizName = importData.quiz;
                const existingPresets = loadPresets();

                existingPresets[quizName] = {
                    questions: importData.data.questions || {},
                    createdAt: importData.exportedAt || Date.now(),
                    updatedAt: Date.now()
                };

                savePresets(existingPresets);
                localStorage.setItem('ttf_selected_quiz', quizName);

                showToast(`Successfully imported "${quizName}"`);
                console.log("TTF: Imported quiz:", quizName);

                modal.remove();
                createStandardQuizModal(getPageContext());

            } catch (error) {
                console.error("TTF: Import failed:", error);
                showToast("Failed to import file: " + error.message);
            }

            event.target.value = "";
        });

        const helpText = document.createElement("div");
        helpText.style.cssText = "font-size: 12px; color: #93a3b8; line-height: 1.5; margin-top: 8px;";
        helpText.innerHTML = "Import a JSON preset file exported from a review session to get started.";
        content.appendChild(helpText);

        modal.appendChild(content);
        document.body.appendChild(modal);

        closeButton.addEventListener("click", () => {
            modal.remove();
        });

        if (!document.querySelector('style[data-ttf-animations]')) {
            const style = document.createElement('style');
            style.setAttribute('data-ttf-animations', 'true');
            style.textContent = `
                @keyframes slideUp {
                    from {
                        opacity: 0;
                        transform: translate(-50%, -50%) translateY(30px) scale(0.95);
                    }
                    to {
                        opacity: 1;
                        transform: translate(-50%, -50%) translateY(0) scale(1);
                    }
                }
            `;
            document.head.appendChild(style);
        }
    }



    window.extractAnswersFromReview = async function(quizName) {
        if (!quizName) {
            showToast("Quiz name is required");
            return;
        }

        const presets = loadPresets();
        if (!presets[quizName]) {
            presets[quizName] = {
                questions: {},
                createdAt: Date.now(),
                updatedAt: Date.now()
            };
        }

        const questions = queryAll(".que");
        let extractedCount = 0;

        console.log(`TTF: Extracting answers from ${questions.length} questions for quiz: ${quizName}`);

        for (const questionElement of questions) {
            let questionNumber = null;

            const numberElement = questionElement.querySelector(".rui-qno, .qno, .number, .qn, .question-number");
            if (numberElement) {
                questionNumber = String(numberElement.textContent || "").replace(/\D/g, "");
            }

            if (!questionNumber) {
                const idMatch = (questionElement.id || "").match(/-(\d+)$/);
                if (idMatch) {
                    questionNumber = idMatch[1];
                }
            }

            if (!questionNumber) {
                const textContent = questionElement.textContent || "";
                const questionMatch = textContent.match(/Question\s+(\d+)/i);
                if (questionMatch) {
                    questionNumber = questionMatch[1];
                }
            }

            if (!questionNumber) {
                console.log("TTF: Skipping question - no number found", questionElement);
                continue;
            }

            const questionId = "Q" + questionNumber;
            const questionType = detectQuestionType(questionElement);

            console.log(`TTF: Processing ${questionId} (type: ${questionType})`);

            const questionData = {
                type: questionType,
                text: "",
                structured: {},
                capturedAt: Date.now()
            };

            try {
                if (questionType === "ddwtos") {
                    const hiddenInputs = questionElement.querySelectorAll("input.placeinput");
                    const mapping = {};
                    const textParts = [];

                    if (hiddenInputs && hiddenInputs.length) {
                        for (const input of hiddenInputs) {
                            let placeNum = null;
                            const classNames = (input.className || "").split(/\s+/);

                            for (const className of classNames) {
                                const match = className.match(/^place(\d+)$/);
                                if (match) {
                                    placeNum = match[1];
                                    break;
                                }
                            }

                            if (!placeNum) {
                                const idMatch = (input.id || "").match(/_p(\d+)$/);
                                if (idMatch) {
                                    placeNum = idMatch[1];
                                }
                            }

                            const value = cleanText(input.value || "");
                            if (placeNum != null) {
                                mapping[placeNum] = value;
                            }

                            if (value) {
                                const choiceElement = questionElement.querySelector(`.draghome.choice${value}`);
                                const displayText = choiceElement ? cleanText(choiceElement.textContent) : String(value);
                                textParts.push(displayText);
                            }
                        }
                    } else {
                        const dropZones = questionElement.querySelectorAll("span.drop");
                        for (const dropZone of dropZones) {
                            const placeMatch = (dropZone.className || "").match(/place(\d+)/);
                            const placeNum = placeMatch ? placeMatch[1] : dropZones.indexOf(dropZone) + 1;
                            const choiceText = cleanText(dropZone.textContent || "");
                            if (choiceText) {
                                textParts.push(choiceText);
                            }
                        }
                    }

                    questionData.text = textParts.join(" || ");
                    questionData.structured = {
                        mapping,
                        parts: textParts
                    };
                } else if (questionType === "multianswer") {
                    const parts = [];
                    const allInputs = Array.from(questionElement.querySelectorAll(
                        '.subquestion input, .subquestion textarea, .subquestion select, ' +
                        'input[name*="_sub"], textarea[name*="_sub"], select[name*="_sub"], ' +
                        'input[id*="_sub"], textarea[id*="_sub"], select[id*="_sub"]'
                    ));

                    const indexedInputs = [];

                    allInputs.forEach((input, index) => {
                        const nameOrId = (input.name || input.id || "") + "";
                        const subMatch = nameOrId.match(/_sub(?:question_)?(\d+)_/i);
                        const subMatch2 = nameOrId.match(/_sub(\d+)/i);
                        const subMatch3 = nameOrId.match(/sub(\d+)/i);

                        const subIndex = subMatch ? Number(subMatch[1]) :
                                       subMatch2 ? Number(subMatch2[1]) :
                                       subMatch3 ? Number(subMatch3[1]) :
                                       index + 1;

                        indexedInputs.push({
                            idx: subIndex,
                            element: input
                        });
                    });

                    if (!indexedInputs.length) {
                        Array.from(questionElement.querySelectorAll('input[type="text"], textarea, select'))
                            .forEach((input, index) => {
                                const nameOrId = (input.name || input.id || "") + "";
                                const subMatch = nameOrId.match(/_sub(\d+)/i);
                                const subIndex = subMatch ? Number(subMatch[1]) : index + 1;

                                indexedInputs.push({
                                    idx: subIndex,
                                    element: input
                                });
                            });
                    }

                    indexedInputs.sort((a, b) => (a.idx || 0) - (b.idx || 0));

                    for (const item of indexedInputs) {
                        const input = item.element;
                        let value = "";

                        try {
                            if ((input.tagName || "").toLowerCase() === "select") {
                                const selectedOption = input.options && input.options[input.selectedIndex];
                                value = selectedOption ? (selectedOption.text || selectedOption.value || "") : (input.value || "");
                            } else {
                                value = (input.value && String(input.value).trim()) ||
                                       String(input.getAttribute("data-initial-value") || "").trim();

                                if (!value) {
                                    const container = input.closest(".subquestion") || input.parentElement;
                                    if (container) {
                                        value = (container.innerText || container.textContent || "").trim();
                                    }
                                }
                            }

                            value = cleanText(value || "");
                            parts.push(value);
                        } catch (error) {
                            console.warn("TTF: Failed to extract value from input", error);
                        }
                    }

                    questionData.parts = parts;
                    questionData.text = parts.join(" || ");
                    questionData.structured = {
                        parts
                    };
                } else if (questionType === "answersselect") {
                    const selectedInputs = questionElement.querySelectorAll('input[type="radio"]:checked, input[type="checkbox"]:checked');
                    const answers = [];

                    for (const input of selectedInputs) {
                        const labelElement = questionElement.querySelector(`label[for="${input.id}"]`) ||
                                           input.parentElement.querySelector('label') ||
                                           input.closest('div').querySelector('span, p, div');

                        const answerText = cleanText(labelElement ? labelElement.textContent : input.value || "");
                        if (answerText) {
                            answers.push(answerText);
                        }
                    }

                    questionData.text = answers.join(" || ");
                    questionData.structured = {
                        selected: answers
                    };
                } else {
                    const allInputs = questionElement.querySelectorAll('input, textarea, select');
                    const answers = [];

                    for (const input of allInputs) {
                        const value = (input.value || "").trim();
                        if (value) {
                            answers.push(cleanText(value));
                        }
                    }

                    questionData.text = answers.join(" || ");
                    questionData.structured = {
                        inputs: answers
                    };
                }

                if (questionData.text || (questionData.parts && questionData.parts.length > 0)) {
                    presets[quizName].questions[questionId] = questionData;
                    extractedCount++;
                    console.log(`TTF: Extracted ${questionId}:`, questionData.text);
                } else {
                    console.log(`TTF: No data found for ${questionId}`);
                }

            } catch (error) {
                console.error(`TTF: Failed to extract ${questionId}:`, error);
            }
        }

        presets[quizName].updatedAt = Date.now();
        savePresets(presets);

        showToast(`Extracted ${extractedCount} answers for "${quizName}"`);
        console.log(`TTF: Extraction complete. Total questions: ${extractedCount}`);
    }


    window.exportPresets = function() {
        console.log("TTF: exportPresets called");
        const presets = loadPresets();
        console.log("TTF: Loaded presets:", presets);

        if (Object.keys(presets).length === 0) {
            showToast("No quiz data found. Extract answers from a review page first.");
            console.log("TTF: No presets found");
            return;
        }

        console.log("TTF: Opening export selection modal");
        openExportSelectionModal(presets);
    }


    function exportSpecificQuiz(quizName, quizData) {
        const exportData = {
                __loremipsum_preset_export__: 1,
                version: 1,
                exportedAt: Date.now(),
                quiz: quizName,
                data: {
                    questions: quizData.questions || {}
                }
            };

        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);

            const link = document.createElement("a");
            link.href = url;
            link.download = `loremipsum-presets-${quizName.replace(/[^a-zA-Z0-9]/g, '_')}-${new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-')}.json`;
            link.style.display = "none";
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

        const questionCount = Object.keys(quizData.questions || {}).length;
        showToast(`Exported "${quizName}" with ${questionCount} questions`);
    }


    function openExportSelectionModal(presets) {
        console.log("TTF: openExportSelectionModal called with presets:", presets);

        const existingModal = document.getElementById("export-selection-modal");
        if (existingModal) {
            console.log("TTF: Removing existing export modal");
            existingModal.remove();
        }

        const modal = document.createElement("div");
        modal.id = "export-selection-modal";
        modal.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: #0b1220;
            color: #e5e7eb;
            border-radius: 12px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.5);
            min-width: 500px;
            max-width: 90vw;
            max-height: 80vh;
            z-index: 10000;
            padding: 0;
            border: 1px solid rgba(59, 130, 246, 0.2);
        `;

        const header = document.createElement("div");
        header.style.cssText = `
            padding: 16px 20px;
            border-bottom: 1px solid rgba(59, 130, 246, 0.2);
            background: linear-gradient(135deg, rgba(59, 130, 246, 0.1), rgba(147, 51, 234, 0.1));
            border-radius: 12px 12px 0 0;
            display: flex;
            align-items: center;
            justify-content: space-between;
        `;
        header.innerHTML = `
            <div style="display: flex; align-items: center; gap: 8px;">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="7,10 12,15 17,10"></polyline>
                    <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
                <span style="font-weight: 600; font-size: 14px;">Select Quiz to Export</span>
            </div>
            <button id="close-export-modal-btn" style="
                background: none;
                border: none;
                color: #9ca3af;
                cursor: pointer;
                padding: 4px;
                border-radius: 4px;
                transition: all 0.2s ease;
            " title="Close">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            </button>
        `;

        const content = document.createElement("div");
        content.style.cssText = "padding: 20px; max-height: 60vh; overflow-y: auto;";

        const description = document.createElement("div");
        description.textContent = "Choose which quiz data to export. Each quiz will be exported as a separate file.";
        description.style.cssText = "font-size: 13px; color: #93a3b8; margin-bottom: 16px; line-height: 1.4;";

        const quizList = document.createElement("div");
        quizList.style.cssText = "display: flex; flex-direction: column; gap: 8px;";

        for (const [quizName, quizData] of Object.entries(presets)) {
            const questionCount = Object.keys(quizData.questions || {}).length;
            const lastUpdated = quizData.updatedAt ? new Date(quizData.updatedAt).toLocaleDateString() : 'Unknown';

            const quizItem = document.createElement("div");
            quizItem.style.cssText = `
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 12px 16px;
                background: rgba(59, 130, 246, 0.05);
                border: 1px solid rgba(59, 130, 246, 0.2);
                border-radius: 8px;
                transition: all 0.2s ease;
            `;

            quizItem.innerHTML = `
                <div style="display: flex; flex-direction: column; gap: 4px; flex: 1;">
                    <div style="font-weight: 600; font-size: 14px; color: #e5e7eb;">${quizName}</div>
                    <div style="font-size: 12px; color: #93a3b8;">
                        <span style="margin-right: 16px;">📝 ${questionCount} questions</span>
                        <span>📅 Updated: ${lastUpdated}</span>
                    </div>
                </div>
                <button class="export-quiz-btn" data-quiz-name="${quizName}" style="
                    padding: 8px 16px;
                    border-radius: 6px;
                    border: 1px solid rgba(34, 197, 94, 0.2);
                    background: rgba(34, 197, 94, 0.1);
                    color: #22c55e;
                    cursor: pointer;
                    font-size: 12px;
                    font-weight: 500;
                    transition: all 0.2s ease;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                ">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="7,10 12,15 17,10"></polyline>
                        <line x1="12" y1="15" x2="12" y2="3"></line>
                    </svg>
                    Export
                </button>
            `;

            quizItem.addEventListener("mouseenter", () => {
                quizItem.style.background = "rgba(59, 130, 246, 0.1)";
                quizItem.style.borderColor = "rgba(59, 130, 246, 0.3)";
            });
            quizItem.addEventListener("mouseleave", () => {
                quizItem.style.background = "rgba(59, 130, 246, 0.05)";
                quizItem.style.borderColor = "rgba(59, 130, 246, 0.2)";
            });

            quizList.appendChild(quizItem);
        }

        const exportAllButton = document.createElement("button");
        exportAllButton.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px;">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7,10 12,15 17,10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
            Export All Quizzes (${Object.keys(presets).length} files)
        `;
        exportAllButton.style.cssText = `
            width: 100%;
            padding: 12px 16px;
            border-radius: 8px;
            border: 1px solid rgba(147, 51, 234, 0.2);
            background: rgba(147, 51, 234, 0.1);
            color: #9333ea;
            cursor: pointer;
            font-size: 13px;
            font-weight: 600;
            transition: all 0.2s ease;
            margin-top: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
        `;

        content.appendChild(description);
        content.appendChild(quizList);
        content.appendChild(exportAllButton);

        modal.appendChild(header);
        modal.appendChild(content);
        document.body.appendChild(modal);

        console.log("TTF: Export selection modal created and added to DOM");

        const closeBtn = document.getElementById("close-export-modal-btn");
        closeBtn.addEventListener("click", () => modal.remove());
        closeBtn.addEventListener("mouseenter", () => {
            closeBtn.style.background = "rgba(239, 68, 68, 0.1)";
            closeBtn.style.color = "#ef4444";
        });
        closeBtn.addEventListener("mouseleave", () => {
            closeBtn.style.background = "none";
            closeBtn.style.color = "#9ca3af";
        });

        modal.querySelectorAll(".export-quiz-btn").forEach(btn => {
            btn.addEventListener("click", (e) => {
                const quizName = e.target.closest(".export-quiz-btn").dataset.quizName;
                const quizData = presets[quizName];
                exportSpecificQuiz(quizName, quizData);
                modal.remove();
            });

            btn.addEventListener("mouseenter", () => {
                btn.style.background = "rgba(34, 197, 94, 0.2)";
                btn.style.transform = "translateY(-1px)";
            });
            btn.addEventListener("mouseleave", () => {
                btn.style.background = "rgba(34, 197, 94, 0.1)";
                btn.style.transform = "translateY(0)";
            });
        });

        exportAllButton.addEventListener("click", () => {
            for (const [quizName, quizData] of Object.entries(presets)) {
                exportSpecificQuiz(quizName, quizData);
            }
            modal.remove();
        });

        exportAllButton.addEventListener("mouseenter", () => {
            exportAllButton.style.background = "rgba(147, 51, 234, 0.2)";
            exportAllButton.style.transform = "translateY(-1px)";
        });
        exportAllButton.addEventListener("mouseleave", () => {
            exportAllButton.style.background = "rgba(147, 51, 234, 0.1)";
            exportAllButton.style.transform = "translateY(0)";
        });

        modal.addEventListener("click", (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });
    }

    function createStandardQuizModal(pageContext) {
        console.log("TTF: Creating standard quiz modal");

        let typeToFillInstance = null;

        const modal = document.createElement("div");
        modal.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: #0b1220;
            color: #e5e7eb;
            border-radius: 16px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.5);
            min-width: 400px;
            max-width: 90vw;
            max-height: 85vh;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            border: 1px solid #1f2937;
            cursor: default;
            user-select: none;
            overflow: hidden;
            transition: none;
            z-index: 100000;
        `;

        const header = document.createElement("div");
        header.style.cssText = `
            background: linear-gradient(135deg, #0b1220 0%, #111827 100%);
            color: #e5e7eb;
            padding: 10px 16px;
            font-weight: 600;
            display: flex;
            align-items: center;
            justify-content: space-between;
            cursor: move;
            border-radius: 16px 16px 0 0;
            border-bottom: 1px solid #1f2937;
            user-select: none;
        `;

        const title = document.createElement("div");
        title.textContent = "LoremIpsum";
        title.style.cssText = "font-size: 15px; display: flex; align-items: center; gap: 8px; color: #e2e8f0;";
        const icon = document.createElement("span");
        icon.textContent = "📝";
        icon.style.cssText = "font-size: 18px;";
        title.insertBefore(icon, title.firstChild);
        header.appendChild(title);

        const closeButton = document.createElement("button");
        closeButton.textContent = "✕";
        closeButton.title = "Close";
        closeButton.style.cssText = `
            background: rgba(255,255,255,0.06);
            border: 1px solid rgba(255,255,255,0.12);
            color: #e5e7eb;
            border-radius: 6px;
            padding: 4px 8px;
            cursor: pointer;
            font-size: 13px;
            font-weight: 600;
            transition: all 0.2s ease;
        `;
        closeButton.addEventListener("mouseenter", () => {
            closeButton.style.background = "rgba(255,255,255,0.2)";
        });
        closeButton.addEventListener("mouseleave", () => {
            closeButton.style.background = "rgba(255,255,255,0.1)";
        });
        header.appendChild(closeButton);

        const content = document.createElement("div");
        content.style.cssText = "padding: 20px;";

        const presetSection = document.createElement("div");
        presetSection.style.cssText = "display: flex; flex-direction: column; gap: 12px; padding: 12px; background: rgba(59, 130, 246, 0.05); border: 1px solid rgba(59, 130, 246, 0.2); border-radius: 8px;";

        const presetHeader = document.createElement("div");
        presetHeader.style.cssText = "display: flex; align-items: center; gap: 6px;";

        const presetIcon = document.createElement("span");
        presetIcon.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2z"></path>
            <polyline points="14,8 14,14 10,14 10,8"></polyline>
            <line x1="16" y1="6" x2="8" y2="6"></line>
            <line x1="16" y1="10" x2="8" y2="10"></line>
            <line x1="16" y1="14" x2="14" y2="14"></line>
        </svg>`;

        const presetTitle = document.createElement("div");
        presetTitle.textContent = "Preset Management";
        presetTitle.style.cssText = "font-size: 14px; font-weight: 600; color: #3b82f6;";

        presetHeader.appendChild(presetIcon);
        presetHeader.appendChild(presetTitle);
        presetSection.appendChild(presetHeader);

        const quizSelectContainer = document.createElement("div");
        quizSelectContainer.style.cssText = "display: flex; flex-direction: column; gap: 6px;";

        const quizLabelRow = document.createElement("div");
        quizLabelRow.style.cssText = "display: flex; justify-content: space-between; align-items: center;";

        const quizLabel = document.createElement("label");
        quizLabel.textContent = "Active Quiz (for saving/exporting)";
        quizLabel.style.cssText = "font-size: 12px; color: #93a3b8; font-weight: 500;";

        const deleteQuizButton = document.createElement("button");
        deleteQuizButton.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3,6 5,6 21,6"></polyline>
            <path d="m19,6v14a2,2 0 0,1-2,2H7a2,2 0 0,1-2-2V6m3,0V4a2,2 0 0,1,2-2h4a2,2 0 0,1,2,2v2"></path>
        </svg>`;
        deleteQuizButton.style.cssText = `
            background: none;
            border: none;
            color: #ef4444;
            cursor: pointer;
            padding: 2px 4px;
            border-radius: 4px;
            transition: all 0.2s ease;
            display: none;
            font-size: 12px;
        `;
        deleteQuizButton.addEventListener("mouseenter", () => {
            deleteQuizButton.style.background = "rgba(239, 68, 68, 0.1)";
            deleteQuizButton.style.transform = "scale(1.1)";
        });
        deleteQuizButton.addEventListener("mouseleave", () => {
            deleteQuizButton.style.background = "none";
            deleteQuizButton.style.opacity = "0.7";
            deleteQuizButton.style.transform = "scale(1)";
        });
        deleteQuizButton.addEventListener("click", () => {
            const selectedQuiz = quizSelect.value;
            if (selectedQuiz) {
                deleteQuizPreset(selectedQuiz);
            } else {
                showToast("Select a quiz to delete");
            }
        });

        quizLabelRow.appendChild(quizLabel);
        quizLabelRow.appendChild(deleteQuizButton);
        quizSelectContainer.appendChild(quizLabelRow);

        const quizSelect = document.createElement("select");
        quizSelect.id = "ttf-quiz-select";
        quizSelect.style.cssText = `
            padding: 8px 12px;
            border-radius: 6px;
            border: 1px solid #1f2937;
            background: #0f172a;
            color: #e5e7eb;
            font-size: 13px;
            cursor: pointer;
            transition: all 0.2s ease;
        `;
        quizSelect.addEventListener("focus", () => {
            quizSelect.style.borderColor = "#3b82f6";
            quizSelect.style.boxShadow = "0 0 0 3px rgba(59, 130, 246, 0.1)";
        });
        quizSelect.addEventListener("blur", () => {
            quizSelect.style.borderColor = "#1f2937";
            quizSelect.style.boxShadow = "none";
        });
        quizSelect.addEventListener("change", () => {
            const selectedQuiz = quizSelect.value;
            if (selectedQuiz) {
                localStorage.setItem('ttf_selected_quiz', selectedQuiz);
                populateQuestionSelect();
                showToast(`Active quiz set to: "${selectedQuiz}" - this will be used for saving/exporting`);
                deleteQuizButton.style.display = "inline-block";

                const statusSpan = currentQuizStatus.querySelector('span');
                if (statusSpan) {
                    statusSpan.innerHTML = `Active Quiz: <strong>"${selectedQuiz}"</strong> (will be used for saving/exporting)`;
                }

            } else {
                deleteQuizButton.style.display = "none";

                const statusSpan = currentQuizStatus.querySelector('span');
                if (statusSpan) {
                    statusSpan.innerHTML = `Active Quiz: <strong>"None"</strong> (select a quiz below)`;
                }
            }
        });
        quizSelectContainer.appendChild(quizSelect);
        presetSection.appendChild(quizSelectContainer);

        const questionSelectContainer = document.createElement("div");
        questionSelectContainer.style.cssText = "display: flex; flex-direction: column; gap: 6px;";

        const questionLabel = document.createElement("label");
        questionLabel.textContent = "Question Preset";
        questionLabel.style.cssText = "font-size: 12px; color: #93a3b8; font-weight: 500;";
        questionSelectContainer.appendChild(questionLabel);

        const questionSelect = document.createElement("select");
        questionSelect.id = "ttf-question-select";
        questionSelect.style.cssText = `
            padding: 8px 12px;
            border-radius: 6px;
            border: 1px solid #1f2937;
            background: #0f172a;
            color: #e5e7eb;
            font-size: 13px;
            cursor: pointer;
            transition: all 0.2s ease;
        `;
        questionSelect.addEventListener("focus", () => {
            questionSelect.style.borderColor = "#3b82f6";
            questionSelect.style.boxShadow = "0 0 0 3px rgba(59, 130, 246, 0.1)";
        });
        questionSelect.addEventListener("blur", () => {
            questionSelect.style.borderColor = "#1f2937";
            questionSelect.style.boxShadow = "none";
        });
        questionSelect.addEventListener("change", () => {
            const selectedQuestion = questionSelect.value;
            if (selectedQuestion) {
                loadSelectedPreset();
            }
        });
        questionSelectContainer.appendChild(questionSelect);
        presetSection.appendChild(questionSelectContainer);

        content.appendChild(presetSection);

        const actionsSection = document.createElement("div");
        actionsSection.style.cssText = "display: flex; flex-direction: column; gap: 12px; padding: 12px; background: rgba(16, 185, 129, 0.05); border: 1px solid rgba(16, 185, 129, 0.2); border-radius: 8px;";

        const actionsHeader = document.createElement("div");
        actionsHeader.style.cssText = "display: flex; align-items: center; gap: 6px;";

        const actionsIcon = document.createElement("span");
        actionsIcon.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="11,19 2,12 11,5 11,19"></polygon>
            <polygon points="22,19 13,12 22,5 22,19"></polygon>
        </svg>`;

        const actionsTitle = document.createElement("div");
        actionsTitle.textContent = "Actions";
        actionsTitle.style.cssText = "font-size: 14px; font-weight: 600; color: #10b981;";

        actionsHeader.appendChild(actionsIcon);
        actionsHeader.appendChild(actionsTitle);
        actionsSection.appendChild(actionsHeader);

        const mainButtonsRow = document.createElement("div");
        mainButtonsRow.style.cssText = "display: flex; gap: 8px;";

        const enableButton = document.createElement("button");
        enableButton.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display: inline; margin-right: 6px;">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14,2 14,8 20,8"></polyline>
            <line x1="16" y1="13" x2="8" y2="13"></line>
            <line x1="16" y1="17" x2="8" y2="17"></line>
            <polyline points="10,9 9,9 8,9"></polyline>
        </svg>Enable Type-to-Fill`;
        enableButton.style.cssText = `
            flex: 1;
            padding: 9px 12px;
            border-radius: 8px;
            border: 1px solid #1f2937;
            background: #0f172a;
            color: #e5e7eb;
            cursor: pointer;
            font-weight: 600;
            font-size: 13px;
            transition: all 0.2s ease;
        `;
        enableButton.addEventListener("mouseenter", () => {
            enableButton.style.transform = "translateY(-1px)";
            enableButton.style.boxShadow = "0 4px 12px rgba(5, 150, 105, 0.3)";
        });
        enableButton.addEventListener("mouseleave", () => {
            enableButton.style.transform = "translateY(0)";
            enableButton.style.boxShadow = "0 2px 8px rgba(5, 150, 105, 0.2)";
        });

        const importButton = document.createElement("button");
        importButton.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display: inline; margin-right: 6px;">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14,2 14,8 20,8"></polyline>
            <line x1="16" y1="13" x2="8" y2="13"></line>
            <line x1="16" y1="17" x2="8" y2="17"></line>
            <polyline points="10,9 9,9 8,9"></polyline>
        </svg>Import Answers`;
        importButton.style.cssText = `
            flex: 1;
            padding: 9px 12px;
            border-radius: 8px;
            border: 1px solid #1f2937;
            background: #0f172a;
            cursor: pointer;
            font-weight: 600;
            font-size: 13px;
            color: #e5e7eb;
            transition: all 0.2s ease;
        `;
        importButton.addEventListener("mouseenter", () => {
            importButton.style.transform = "translateY(-1px)";
            importButton.style.background = "rgba(255,255,255,0.1)";
            importButton.style.borderColor = "#555";
            importButton.style.boxShadow = "0 4px 12px rgba(255, 255, 255, 0.1)";
        });
        importButton.addEventListener("mouseleave", () => {
            importButton.style.transform = "translateY(0)";
            importButton.style.background = "#0f172a";
            importButton.style.borderColor = "#1f2937";
            importButton.style.boxShadow = "none";
        });

        mainButtonsRow.appendChild(enableButton);
        mainButtonsRow.appendChild(importButton);
        actionsSection.appendChild(mainButtonsRow);
        content.appendChild(actionsSection);

        const pasteLabel = document.createElement("div");
        pasteLabel.textContent = 'Paste answers (use " || " to separate multi-answer pieces):';
        pasteLabel.style.cssText = "font-size: 12px; color: #93a3b8; font-weight: 500; margin-bottom: 6px;";
        content.appendChild(pasteLabel);

        const pasteArea = document.createElement("textarea");
        pasteArea.id = "ttf-paste-area";
        pasteArea.rows = 4;
        pasteArea.placeholder = "e.g. virtue is teachable  OR  sentence1 || sentence2 || sentence3";
        pasteArea.style.cssText = `
            width: 100%;
            resize: vertical;
            min-height: 74px;
            max-height: 180px;
            padding: 10px;
            font-size: 13px;
            border-radius: 8px;
            border: 1px solid #1f2937;
            font-family: inherit;
            background: #0f172a;
            color: #e5e7eb;
            transition: all 0.2s ease;
            line-height: 1.4;
        `;
        pasteArea.addEventListener("focus", () => {
            pasteArea.style.borderColor = "#3b82f6";
            pasteArea.style.boxShadow = "0 0 0 3px rgba(59, 130, 246, 0.1)";
        });
        pasteArea.addEventListener("blur", () => {
            pasteArea.style.borderColor = "#e2e8f0";
            pasteArea.style.boxShadow = "none";
        });
        content.appendChild(pasteArea);

        const questionStatusContainer = document.createElement("div");
        questionStatusContainer.style.cssText = "display: flex; align-items: center; gap: 6px; margin: 4px 0;";
        
        const questionStatus = document.createElement("div");
        questionStatus.id = "question-status";
        questionStatus.style.cssText = `
            font-size: 12px;
            color: #93a3b8;
            text-align: center;
            padding: 6px;
            background: rgba(59, 130, 246, 0.1);
            border: 1px solid rgba(59, 130, 246, 0.2);
            border-radius: 6px;
            font-weight: 500;
            display: none;
            flex: 1;
        `;
        questionStatus.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display: inline; margin-right: 4px;">
            <circle cx="11" cy="11" r="8"></circle>
            <path d="m21,21-4.35-4.35"></path>
        </svg>Detecting question...`;
        
        const refreshButton = document.createElement("button");
        refreshButton.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="23,4 23,10 17,10"></polyline>
            <path d="M20.49,15A9,9 0,1,1,5.64,5.64L23,10"></path>
        </svg>`;
        refreshButton.title = "Refresh question detection";
        refreshButton.style.cssText = `
            padding: 6px 8px;
            border-radius: 6px;
            border: 1px solid rgba(59, 130, 246, 0.2);
            background: rgba(59, 130, 246, 0.1);
            color: #3b82f6;
            cursor: pointer;
            font-size: 12px;
            display: none;
            transition: all 0.2s ease;
        `;
        refreshButton.addEventListener("click", () => {
            updateQuestionStatus();
            showToast("Question detection refreshed");
        });
        refreshButton.addEventListener("mouseenter", () => {
            refreshButton.style.background = "rgba(59, 130, 246, 0.2)";
        });
        refreshButton.addEventListener("mouseleave", () => {
            refreshButton.style.background = "rgba(59, 130, 246, 0.1)";
        });

        const manualCorrectionButton = document.createElement("button");
        manualCorrectionButton.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M11,4H4a2,2 0,0,0-2,2V18a2,2 0,0,0,2,2H18a2,2 0,0,0,2-2V13"></path>
            <polygon points="18.5,2.5 21.5,5.5 18.5,8.5 18.5,2.5"></polygon>
            <line x1="18.5" y1="2.5" x2="18.5" y2="8.5"></line>
            <line x1="18.5" y1="5.5" x2="21.5" y2="5.5"></line>
        </svg>`;
        manualCorrectionButton.title = "Manually correct question number";
        manualCorrectionButton.style.cssText = `
            padding: 6px 8px;
            border-radius: 6px;
            border: 1px solid rgba(245, 101, 101, 0.2);
            background: rgba(245, 101, 101, 0.1);
            color: #f56565;
            cursor: pointer;
            font-size: 12px;
            display: none;
            transition: all 0.2s ease;
        `;
        manualCorrectionButton.addEventListener("click", () => {
            openManualCorrectionModal();
        });
        manualCorrectionButton.addEventListener("mouseenter", () => {
            manualCorrectionButton.style.background = "rgba(245, 101, 101, 0.2)";
        });
        manualCorrectionButton.addEventListener("mouseleave", () => {
            manualCorrectionButton.style.background = "rgba(245, 101, 101, 0.1)";
        });
        
        questionStatusContainer.appendChild(questionStatus);
        questionStatusContainer.appendChild(refreshButton);
        questionStatusContainer.appendChild(manualCorrectionButton);
        content.appendChild(questionStatusContainer);

        const actionButtonsRow = document.createElement("div");
        actionButtonsRow.style.cssText = "display: flex; gap: 8px; margin-top: 6px;";

        const autoLoadButton = document.createElement("button");
        autoLoadButton.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display: inline; margin-right: 6px;">
            <polyline points="23,4 23,10 17,10"></polyline>
            <path d="M20.49,15A9,9 0,1,1,5.64,5.64L23,10"></path>
        </svg>Auto-Load Answers`;
        autoLoadButton.title = "Automatically detect question and load appropriate answers";
        autoLoadButton.style.cssText = `
            flex: 1;
            padding: 9px 12px;
            border-radius: 8px;
            border: 1px solid #10b981;
            background: #064e3b;
            color: #e5e7eb;
            cursor: pointer;
            font-weight: 600;
            font-size: 13px;
            transition: all 0.2s ease;
        `;
        autoLoadButton.addEventListener("mouseenter", () => {
            autoLoadButton.style.transform = "translateY(-1px)";
            autoLoadButton.style.boxShadow = "0 4px 12px rgba(16, 185, 129, 0.3)";
        });
        autoLoadButton.addEventListener("mouseleave", () => {
            autoLoadButton.style.transform = "translateY(0)";
            autoLoadButton.style.boxShadow = "none";
        });

        const applyButton = document.createElement("button");
        applyButton.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display: inline; margin-right: 6px;">
            <polygon points="11,19 2,12 11,5 11,19"></polygon>
            <polygon points="22,19 13,12 22,5 22,19"></polygon>
        </svg>Apply Answers`;
        applyButton.title = "Apply the loaded answers to the current question";
        applyButton.style.cssText = `
            flex: 1;
            padding: 9px 12px;
            border-radius: 8px;
            border: 1px solid #1f2937;
            background: #111827;
            color: #e5e7eb;
            cursor: pointer;
            font-weight: 700;
            font-size: 13px;
            transition: all 0.2s ease;
        `;
        applyButton.addEventListener("mouseenter", () => {
            applyButton.style.transform = "translateY(-1px)";
            applyButton.style.boxShadow = "0 4px 12px rgba(59, 130, 246, 0.3)";
        });
        applyButton.addEventListener("mouseleave", () => {
            applyButton.style.transform = "translateY(0)";
            applyButton.style.boxShadow = "0 2px 8px rgba(59, 130, 246, 0.2)";
        });

        actionButtonsRow.appendChild(autoLoadButton);
        actionButtonsRow.appendChild(applyButton);
        content.appendChild(actionButtonsRow);

        const progressContainer = document.createElement("div");
        progressContainer.className = "progress-container";
        progressContainer.style.cssText = `
            position: absolute;
            top: 0;
            left: 16px;
            right: 16px;
            height: 6px;
            background: #0f172a;
            border-radius: 999px;
            border: 1px solid #1f2937;
            overflow: hidden;
            display: none;
            z-index: 100;
            margin-bottom: 8px;
        `;

        const progressBar = document.createElement("div");
        progressBar.className = "progress-bar";
        progressBar.style.cssText = `
            width: 0%;
            height: 100%;
            background: linear-gradient(90deg, #60a5fa, #34d399);
            transition: width 180ms linear;
            border-radius: 999px;
        `;
        progressContainer.appendChild(progressBar);
        content.appendChild(progressContainer);



        const helpText = document.createElement("div");
        helpText.style.cssText = "font-size: 12px; color: #93a3b8; line-height: 1.5; margin-top: 8px; padding: 10px; background: #0f172a; border-radius: 8px; border: 1px solid #1f2937;";
        helpText.innerHTML = [
            "• Works on the current question only",
            "• For drag-and-drop questions, watch the progress bar",
            "• Answer boxes may appear empty but answers are filled",
            "• Use <b>Check</b> button in quiz to verify answers"
        ].join("<br>");
        content.appendChild(helpText);

        const style = document.createElement('style');
        style.textContent = `
            @keyframes fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }
            @keyframes fadeOut {
                from { opacity: 1; }
                to { opacity: 0; }
            }
            @keyframes slideUp {
                from {
                    opacity: 0;
                    transform: translateY(30px) scale(0.95);
                }
                to {
                    opacity: 1;
                    transform: translateY(0) scale(1);
                }
            }
            @keyframes slideDown {
                from {
                    opacity: 1;
                    transform: translateY(0) scale(1);
                }
                to {
                    opacity: 0;
                    transform: translateY(30px) scale(0.95);
                }
            }
        `;
        document.head.appendChild(style);

        modal.appendChild(header);
        modal.appendChild(content);
        document.body.appendChild(modal);

        setTimeout(() => {
            modal.style.animation = "slideUp 0.4s ease";
        }, 10);

        let dragStartX = 0;
        let dragStartY = 0;
        let initialModalX = 0;
        let initialModalY = 0;
        let currentModalX = 0;
        let currentModalY = 0;
        let isDragging = false;
        let modalCentered = true;

        setTimeout(() => {
            const rect = modal.getBoundingClientRect();
            initialModalX = rect.left;
            initialModalY = rect.top;
            currentModalX = rect.left;
            currentModalY = rect.top;
        }, 50);

        // Populate quiz dropdown with available presets
        function populateQuizSelect() {
            const presets = loadPresets();
            quizSelect.innerHTML = "";

            const defaultOption = document.createElement("option");
            defaultOption.value = "";
            defaultOption.textContent = "-- Select Quiz --";
            quizSelect.appendChild(defaultOption);

            Object.keys(presets).forEach(quizName => {
                const option = document.createElement("option");
                option.value = quizName;
                option.textContent = quizName;
                quizSelect.appendChild(option);
            });

            const persistedQuiz = localStorage.getItem('ttf_selected_quiz');
            if (persistedQuiz && presets[persistedQuiz]) {
                quizSelect.value = persistedQuiz;
                const deleteQuizButton = document.querySelector('#ttf-quiz-select').parentElement.querySelector('button[title="Delete selected quiz preset"]');
                if (deleteQuizButton) {
                    deleteQuizButton.style.display = "inline-block";
                }
                console.log("TTF: Auto-selected quiz:", persistedQuiz);
            }
        }

        // Delete entire quiz preset
        function deleteQuizPreset(quizName) {
            if (!confirm(`Are you sure you want to delete the entire quiz preset "${quizName}"? This will remove all ${Object.keys(loadPresets()[quizName]?.questions || {}).length} question presets.`)) {
                return;
            }

            const presets = loadPresets();

            if (!presets[quizName]) {
                showToast("Quiz preset not found");
                return;
            }

            delete presets[quizName];
            savePresets(presets);

            populateQuizSelect();
            populateQuestionSelect();

            if (quizSelect.value === quizName) {
                quizSelect.value = "";
                questionSelect.value = "";
                localStorage.removeItem('ttf_selected_quiz');
            }

            showToast(`Deleted quiz preset "${quizName}"`);
        }

        // Populate question dropdown based on selected quiz
        function populateQuestionSelect() {
            const selectedQuiz = quizSelect.value;
            questionSelect.innerHTML = "";
            
            const defaultOption = document.createElement("option");
            defaultOption.value = "";
            defaultOption.textContent = "-- Select Question --";
            questionSelect.appendChild(defaultOption);
            
            if (!selectedQuiz) return;
            
            const presets = loadPresets();
            const quizData = presets[selectedQuiz] && presets[selectedQuiz].questions 
                ? presets[selectedQuiz].questions 
                : {};
            
            Object.keys(quizData)
                .sort((a, b) => {
                    const aNum = Number(a.replace(/^Q/, "") || 0);
                    const bNum = Number(b.replace(/^Q/, "") || 0);
                    return aNum - bNum;
                })
                .forEach(questionId => {
                    const option = document.createElement("option");
                    option.value = questionId;
                    option.textContent = questionId;
                    questionSelect.appendChild(option);
                });
        }

        // load selected preset into the paste area
        function loadSelectedPreset() {
            const selectedQuiz = quizSelect.value;
            const selectedQuestion = questionSelect.value;
            
            if (!selectedQuiz || !selectedQuestion) {
                showToast("Select quiz and question preset");
                return;
            }
            
            const presets = loadPresets();
            const questionData = presets[selectedQuiz] && 
                presets[selectedQuiz].questions && 
                presets[selectedQuiz].questions[selectedQuestion];
                
            if (questionData) {
                if (questionData.type === "multianswer") {
                    const parts = (questionData.structured && questionData.structured.parts) 
                        ? questionData.structured.parts 
                        : (questionData.parts || []);
                    pasteArea.value = parts.join(" || ");
                } else if (questionData.type === "ddwtos") {
                    pasteArea.value = questionData.text || (questionData.parts || []).join(" || ");
                } else if (questionData.type === "answersselect") {
                    pasteArea.value = questionData.text || 
                        (questionData.structured && questionData.structured.selectedText 
                            ? questionData.structured.selectedText 
                            : "");
                } else {
                    pasteArea.value = questionData.text || "";
                }
                showToast("Preset loaded into textbox");
            } else {
                showToast("Preset not found");
            }
        }
        
        function deleteSelectedPreset() {
            const selectedQuiz = quizSelect.value;
            const selectedQuestion = questionSelect.value;
            
            if (!selectedQuiz) {
                showToast("Select a quiz first");
                return;
            }
            
            if (!selectedQuestion) {
                showToast("Select a question to delete");
                return;
            }
            
            if (!confirm(`Are you sure you want to delete preset "${selectedQuestion}" from quiz "${selectedQuiz}"?`)) {
                return;
            }
            
            const presets = loadPresets();
            
            if (!presets[selectedQuiz] || !presets[selectedQuiz].questions || !presets[selectedQuiz].questions[selectedQuestion]) {
                showToast("Preset not found");
                return;
            }
            
            delete presets[selectedQuiz].questions[selectedQuestion];
            
            if (Object.keys(presets[selectedQuiz].questions).length === 0) {
                delete presets[selectedQuiz];
                showToast(`Deleted last question. Quiz "${selectedQuiz}" removed entirely.`);
            } else {
                showToast(`Deleted preset "${selectedQuestion}" from "${selectedQuiz}"`);
            }
            
            savePresets(presets);
            
            populateQuizSelect();
            populateQuestionSelect();
            
            if (!presets[selectedQuiz]) {
                quizSelect.value = "";
                questionSelect.value = "";
                localStorage.removeItem('ttf_selected_quiz');
            } else {
                questionSelect.value = "";
            }
            
            updateQuestionStatus();
        }



        // Main answer application function
        async function applyAnswers() {
            const activeQuestion = document.querySelector(".que.notyetanswered") || null;
            
            if (!activeQuestion) {
                showToast("No active question (.que.notyetanswered) found on this page");
                return;
            }
            
            const questionType = detectQuestionType(activeQuestion);
            let answers = pasteArea.value || "";

            // only auto-load preset if paste area is empty or contains default/placeholder content
            if (!answers.trim() || answers === "e.g. virtue is teachable  OR  sentence1 || sentence2 || sentence3") {
                const questionId = manualQuestionOverride || detectQuestionNumber(activeQuestion);
                if (questionId) {
                    console.log("TTF: Auto-detected question:", questionId);
                    autoLoadPresetForQuestion(activeQuestion);
                    // re-read answers after auto-loading
                    answers = pasteArea.value || "";
                }
            }

            if (!answers.trim()) {
                showToast("No answers available. Import answers first or paste manually.");
                return;
            }
            
            // show progress bar
            progressContainer.style.display = "block";
            progressBar.style.width = "0%";
            
            try {
                if (questionType === "ddwtos") {
                    await applyDragDropAnswers(activeQuestion, answers, progressBar);
                } else if (questionType === "multianswer") {
                    await applyMultiAnswers(activeQuestion, answers, progressBar);
                } else if (questionType === "answersselect") {
                    await applySingleChoiceAnswers(activeQuestion, answers, progressBar);
                } else {
                    showToast("Unknown question type, cannot apply");
                }
            } catch (error) {
                console.error("TTF apply error", error);
                showToast("Error while applying");
            } finally {
                await delay(500);
                progressContainer.style.display = "none";
                progressBar.style.width = "0%";
            }
        }

        // update question status display
        function updateQuestionStatus() {
            const activeQuestion = document.querySelector(".que.notyetanswered");
            const questionStatus = document.getElementById("question-status");
            const refreshButton = questionStatus ? questionStatus.nextElementSibling : null;
            const manualCorrectionButton = refreshButton ? refreshButton.nextElementSibling : null;
            
            if (!questionStatus) return;

            if (manualCorrectionButton) {
                manualCorrectionButton.style.display = activeQuestion ? "block" : "none";
            }
            
            if (!activeQuestion) {
                questionStatus.style.display = "block";
                if (refreshButton) refreshButton.style.display = "block";
                questionStatus.style.background = "rgba(239, 68, 68, 0.1)";
                questionStatus.style.borderColor = "rgba(239, 68, 68, 0.2)";
                questionStatus.textContent = "⚠️ No active question found";
                return;
            }
            
            let questionId = manualQuestionOverride || detectQuestionNumber(activeQuestion);
            const isManuallyCorrected = manualQuestionOverride !== null;
            if (questionId) {
                questionStatus.style.display = "block";
                if (refreshButton) refreshButton.style.display = "block";

                if (isManuallyCorrected) {
                    questionStatus.style.background = "rgba(245, 101, 101, 0.1)";
                    questionStatus.style.borderColor = "rgba(245, 101, 101, 0.2)";
                    questionStatus.textContent = `🔧 Manually corrected: ${questionId}`;
                } else {
                questionStatus.style.background = "rgba(34, 197, 94, 0.1)";
                questionStatus.style.borderColor = "rgba(34, 197, 94, 0.2)";
                questionStatus.textContent = `✅ Current question: ${questionId}`;
                }
                
                let quizName = localStorage.getItem('ttf_selected_quiz') || getQuizName();
                const presets = loadPresets();
                let hasPreset = presets[quizName] && 
                    presets[quizName].questions && 
                    presets[quizName].questions[questionId];
                
                if (!hasPreset) {
                    for (const availableQuizName of Object.keys(presets)) {
                        if (presets[availableQuizName].questions && presets[availableQuizName].questions[questionId]) {
                            hasPreset = true;
                            quizName = availableQuizName;
                            break;
                        }
                    }
                }
                    
                if (hasPreset) {
                    questionStatus.textContent += ` (preset available in "${quizName}")`;
                }
            } else {
                questionStatus.style.display = "block";
                if (refreshButton) refreshButton.style.display = "block";
                questionStatus.style.background = "rgba(251, 146, 60, 0.1)";
                questionStatus.style.borderColor = "rgba(251, 146, 60, 0.2)";
                questionStatus.textContent = "🔍 Question number not detected";
            }
        }

        // initialize the quiz dropdown
        populateQuizSelect();

        // auto-load preset answer for current question
        function autoLoadPresetForQuestion(questionElement) {
            const questionId = manualQuestionOverride || detectQuestionNumber(questionElement);
            if (!questionId) {
                console.log("TTF: Could not detect question number");
                return false;
            }
            
            console.log("TTF: Detected question:", questionId);
            
            let quizName = localStorage.getItem('ttf_selected_quiz');
            
            if (!quizName) {
                quizName = getQuizName();
            }

        // extract answers from review page and save as preset (duplicate - should be removed)
        async function extractAnswersFromReviewDuplicate(quizName) {
        if (!quizName) {
                console.log("TTF: Could not detect quiz name");
                return false;
            }
            
            const presets = loadPresets();
            let questionData = presets[quizName] && 
                presets[quizName].questions && 
                presets[quizName].questions[questionId];
            
            if (!questionData) {
                console.log("TTF: Not found in quiz", quizName, "searching all quizzes...");
                for (const availableQuizName of Object.keys(presets)) {
                    if (presets[availableQuizName].questions && presets[availableQuizName].questions[questionId]) {
                        questionData = presets[availableQuizName].questions[questionId];
                        quizName = availableQuizName;
                        console.log("TTF: Found", questionId, "in quiz:", quizName);
                        // persist this quiz selection
                        localStorage.setItem('ttf_selected_quiz', quizName);
                        break;
                    }
                }
            }
                
            if (questionData) {
                console.log("TTF: Found preset for", questionId, ":", questionData);
                
                // load answer into paste area based on question type
                if (questionData.type === "multianswer") {
                    const parts = (questionData.structured && questionData.structured.parts) 
                        ? questionData.structured.parts 
                        : (questionData.parts || []);
                    pasteArea.value = parts.join(" || ");
                } else if (questionData.type === "ddwtos") {
                    pasteArea.value = questionData.text || (questionData.parts || []).join(" || ");
                } else if (questionData.type === "answersselect") {
                    pasteArea.value = questionData.text || 
                        (questionData.structured && questionData.structured.selectedText 
                            ? questionData.structured.selectedText 
                            : "");
                } else {
                    pasteArea.value = questionData.text || "";
                }
                
                showToast(`Auto-loaded preset for ${questionId} from "${quizName}"`);
                return true;
            } else {
                console.log("TTF: No preset found for", questionId, "in any quiz");
                showToast(`No preset found for ${questionId}`);
                return false;
            }
        }

        // detect question type based on DOM structure
        function detectQuestionType(questionElement) {
            const className = questionElement.className || "";
            
            // check class names first
            if (className.includes("ddwtos") || questionElement.querySelector(".drop")) {
                return "ddwtos";
            }
            if (className.includes("multianswer") || questionElement.querySelector('input[type="text"], textarea')) {
                return "multianswer";
            }
            if (className.includes("answersselect") || questionElement.querySelector('input[type="radio"], input[type="checkbox"]')) {
                return "answersselect";
            }
            
            // fallback detection based on DOM elements
            if (questionElement.querySelector(".drop")) return "ddwtos";
            if (questionElement.querySelector('input[type="text"], textarea')) return "multianswer";
            if (questionElement.querySelector('input[type="radio"], input[type="checkbox"]')) return "answersselect";
            
            return "unknown";
        }

        // import answers from current page (review mode)
        async function importPageAnswers() {
            const quizName = getQuizName();
            if (!quizName) {
                showToast("Quiz name not found on page");
                return;
            }
            
            const presets = loadPresets();
            if (!presets[quizName]) {
                presets[quizName] = {
                    questions: {},
                    updatedAt: Date.now()
                };
            }
            
            const questions = queryAll(".que");
            
            for (const questionElement of questions) {
                let questionNumber = null;
                
                // try to find question number
                const numberElement = questionElement.querySelector(".rui-qno, .qno, .number, .qn");
                if (numberElement) {
                    questionNumber = String(numberElement.textContent || "").replace(/\D/g, "");
                }
                
                // fallback: extract from ID
                if (!questionNumber) {
                    const idMatch = (questionElement.id || "").match(/-(\d+)$/);
                    if (idMatch) {
                        questionNumber = idMatch[1];
                    }
                }
                
                if (!questionNumber) continue;
                
                const questionId = "Q" + questionNumber;
                const questionType = detectQuestionType(questionElement);
                
                const questionData = {
                    type: questionType,
                    text: "",
                    structured: {},
                    capturedAt: Date.now()
                };
                
                // Extract answers based on question type
                try {
                    if (questionType === "ddwtos") {
                        // extract drag-drop answers
                        const hiddenInputs = questionElement.querySelectorAll("input.placeinput");
                        const mapping = {};
                        const textParts = [];
                        
                        if (hiddenInputs && hiddenInputs.length) {
                            for (const input of hiddenInputs) {
                                let placeNum = null;
                                const classNames = (input.className || "").split(/\s+/);
                                
                                for (const className of classNames) {
                                    const match = className.match(/^place(\d+)$/);
                                    if (match) {
                                        placeNum = match[1];
                                        break;
                                    }
                                }
                                
                                if (!placeNum) {
                                    const idMatch = (input.id || "").match(/_p(\d+)$/);
                                    if (idMatch) {
                                        placeNum = idMatch[1];
                                    }
                                }
                                
                                const value = cleanText(input.value || "");
                                if (placeNum != null) {
                                    mapping[placeNum] = value;
                                }
                                
                                if (value) {
                                    const choiceElement = questionElement.querySelector(`.draghome.choice${value}`);
                                    const displayText = choiceElement ? cleanText(choiceElement.textContent) : String(value);
                                    textParts.push(displayText);
                                }
                            }
                        } else {
                            // fallback: extract from visible drop zones
                            const dropZones = questionElement.querySelectorAll("span.drop");
                            for (const dropZone of dropZones) {
                                const placeNum = (Array.from(dropZone.classList).find(cls => /^place\d+$/.test(cls)) || "").replace("place", "");
                                const choiceElement = dropZone.querySelector(".draghome:not(.dragplaceholder)");
                                const choiceText = choiceElement ? cleanText(choiceElement.textContent) : "";
                                
                                if (placeNum) {
                                    mapping[placeNum] = choiceText || "";
                                }
                                if (choiceText) {
                                    textParts.push(choiceText);
                                }
                            }
                        }
                        
                        questionData.structured = {
                            mapping,
                            places: Object.keys(mapping).map(num => Number(num)).sort((a, b) => a - b)
                        };
                        questionData.parts = textParts;
                        questionData.text = textParts.join(" ");
                        
                    } else if (questionType === "answersselect") {
                        // extract single/multiple choice answers
                        const inputs = questionElement.querySelectorAll('input[type="checkbox"], input[type="radio"]');
                        let selectedIndex = -1;
                        let selectedText = "";
                        
                        if (inputs && inputs.length) {
                            for (let i = 0; i < inputs.length; i++) {
                                const input = inputs[i];
                                if (input.checked || input.hasAttribute("checked") || input.getAttribute("checked") !== null) {
                                    selectedIndex = i;
                                    const label = document.getElementById(input.id + "_label");
                                    const ariaLabel = questionElement.querySelector(`[aria-labelledby="${input.id}_label"]`);
                                    const labelElement = label || ariaLabel || input.parentElement;
                                    selectedText = labelElement ? 
                                        cleanText((labelElement.textContent || input.value || "").replace(/\s+/g, " ").trim()) : 
                                        input.value || "";
                                    break;
                                }
                            }
                        }
                        
                        questionData.structured = {
                            selectedIndex,
                            selectedText
                        };
                        questionData.text = selectedText || "";
                        
                    } else if (questionType === "multianswer") {
                        // extract multi-answer parts
                        const parts = [];
                        const allInputs = Array.from(questionElement.querySelectorAll(
                            '.subquestion input, .subquestion textarea, .subquestion select, ' +
                            'input[name*="_sub"], textarea[name*="_sub"], select[name*="_sub"], ' +
                            'input[id*="_sub"], textarea[id*="_sub"], select[id*="_sub"]'
                        ));

                        const indexedInputs = [];

                        allInputs.forEach((input, index) => {
                            const nameOrId = (input.name || input.id || "") + "";
                            const subMatch = nameOrId.match(/_sub(?:question_)?(\d+)_/i);
                            const subMatch2 = nameOrId.match(/_sub(\d+)/i);
                            const subMatch3 = nameOrId.match(/sub(\d+)/i);

                            const subIndex = subMatch ? Number(subMatch[1]) :
                                           subMatch2 ? Number(subMatch2[1]) :
                                           subMatch3 ? Number(subMatch3[1]) :
                                           index + 1;

                            indexedInputs.push({
                                idx: subIndex,
                                element: input
                            });
                        });

                        if (!indexedInputs.length) {
                            // fallback to all text inputs
                            Array.from(questionElement.querySelectorAll('input[type="text"], textarea, select'))
                                .forEach((input, index) => {
                                    const nameOrId = (input.name || input.id || "") + "";
                                    const subMatch = nameOrId.match(/_sub(\d+)/i);
                                    const subIndex = subMatch ? Number(subMatch[1]) : index + 1;

                                    indexedInputs.push({
                                        idx: subIndex,
                                        element: input
                                    });
                                });
                        }

                        indexedInputs.sort((a, b) => (a.idx || 0) - (b.idx || 0));
                        for (const item of indexedInputs) {
                            const input = item.element;
                            let value = "";
                            
                            try {
                                if ((input.tagName || "").toLowerCase() === "select") {
                                    const selectedOption = input.options && input.options[input.selectedIndex];
                                    value = selectedOption ? (selectedOption.text || selectedOption.value || "") : (input.value || "");
                                } else {
                                    value = (input.value && String(input.value).trim()) || 
                                           String(input.getAttribute("data-initial-value") || "").trim();
                                    
                                    if (!value) {
                                        const container = input.closest(".subquestion") || input.parentElement;
                                        if (container) {
                                            value = (container.innerText || container.textContent || "").trim();
                                        }
                                    }
                                }
                            } catch (error) {
                                value = "";
                            }
                            
                            value = cleanText(value || "");
                            parts.push(value);
                        }
                        
                        const allEmpty = parts.every(part => !part);
                        questionData.parts = parts.slice();
                        questionData.text = allEmpty ? "" : parts.join(" || ");
                        questionData.structured = {
                            parts: parts.slice()
                        };
                    }
                } catch (error) {
                    console.warn("TTF import: failed to parse q", questionId, error);
                }
                
                presets[quizName].questions = presets[quizName].questions || {};
                presets[quizName].questions[questionId] = questionData;
            }
            
            presets[quizName].updatedAt = Date.now();
            savePresets(presets);
            populateQuizSelect();
            populateQuestionSelect();
            showToast("Imported answers from page (review) and saved presets");
        }

        // save current answers as preset
        function saveCurrentPreset() {
            let selectedQuiz = quizSelect.value;
            
            if (!selectedQuiz) {
                const suggestedName = getQuizName() || "";
                const quizName = prompt("Quiz name:", suggestedName);
                if (!quizName) {
                    showToast("No quiz name entered");
                    return;
                }
                
                selectedQuiz = quizName.trim();
                if (!selectedQuiz) {
                    showToast("No quiz name entered");
                    return;
                }
                
                const presets = loadPresets();
                if (!presets[selectedQuiz]) {
                    presets[selectedQuiz] = {
                        questions: {},
                        createdAt: Date.now()
                    };
                }
                savePresets(presets);
                populateQuizSelect();
                quizSelect.value = selectedQuiz;
                populateQuestionSelect();
            }
            
            const questionId = questionSelect.value || prompt("Question label (format: Q1, Q2, ...):", "");
            if (!questionId) {
                showToast("No question selected");
                return;
            }
            
            const answerText = pasteArea.value || "";
            if (!answerText.trim()) {
                showToast("Paste answers first");
                return;
            }
            
            const presets = loadPresets();
            if (!presets[selectedQuiz]) {
                presets[selectedQuiz] = {
                    questions: {},
                    createdAt: Date.now()
                };
            }
            
            // auto-detect question type
            let questionType = "ddwtos";
            if (answerText.includes("||")) {
                questionType = "multianswer";
            } else if (answerText.split(/\s+/).length === 1) {
                questionType = "answersselect";
            }
            
            presets[selectedQuiz].questions[questionId] = {
                type: questionType,
                text: answerText,
                savedAt: Date.now()
            };
            
            savePresets(presets);
            populateQuizSelect();
            populateQuestionSelect();
            quizSelect.value = selectedQuiz;
            questionSelect.value = questionId;
            showToast("Preset saved (overwritten if existed)");
        }

    
        if (!quizName) {
            showToast("Quiz name is required");
            return;
        }
        
        const presets = loadPresets();
        if (!presets[quizName]) {
            presets[quizName] = {
                questions: {},
                createdAt: Date.now(),
                updatedAt: Date.now()
            };
        }
        
        const questions = queryAll(".que");
        let extractedCount = 0;
        
        console.log(`TTF: Extracting answers from ${questions.length} questions for quiz: ${quizName}`);
        
        for (const questionElement of questions) {
            let questionNumber = null;
            
            // try to find question number using multiple methods
            const numberElement = questionElement.querySelector(".rui-qno, .qno, .number, .qn, .question-number");
            if (numberElement) {
                questionNumber = String(numberElement.textContent || "").replace(/\D/g, "");
            }
            
            // fallback: extract from ID
            if (!questionNumber) {
                const idMatch = (questionElement.id || "").match(/-(\d+)$/);
                if (idMatch) {
                    questionNumber = idMatch[1];
                }
            }
            
            // another fallback: look for "Question X" text
            if (!questionNumber) {
                const textContent = questionElement.textContent || "";
                const questionMatch = textContent.match(/Question\s+(\d+)/i);
                if (questionMatch) {
                    questionNumber = questionMatch[1];
                }
            }
            
            if (!questionNumber) {
                console.log("TTF: Skipping question - no number found", questionElement);
                continue;
            }
            
            const questionId = "Q" + questionNumber;
            const questionType = detectQuestionType(questionElement);
            
            console.log(`TTF: Processing ${questionId} (type: ${questionType})`);
            
            const questionData = {
                type: questionType,
                text: "",
                structured: {},
                capturedAt: Date.now()
            };
            
            // extract answers based on question type
            try {
                if (questionType === "ddwtos") {
                    // extract drag-drop answers
                    const hiddenInputs = questionElement.querySelectorAll("input.placeinput");
                    const mapping = {};
                    const textParts = [];
                    
                    if (hiddenInputs && hiddenInputs.length) {
                        for (const input of hiddenInputs) {
                            let placeNum = null;
                            const classNames = (input.className || "").split(/\s+/);
                            
                            for (const className of classNames) {
                                const match = className.match(/^place(\d+)$/);
                                if (match) {
                                    placeNum = match[1];
                                    break;
                                }
                            }
                            
                            if (!placeNum) {
                                const idMatch = (input.id || "").match(/_p(\d+)$/);
                                if (idMatch) {
                                    placeNum = idMatch[1];
                                }
                            }
                            
                            const value = cleanText(input.value || "");
                            if (placeNum != null) {
                                mapping[placeNum] = value;
                            }
                            
                            if (value) {
                                const choiceElement = questionElement.querySelector(`.draghome.choice${value}`);
                                const displayText = choiceElement ? cleanText(choiceElement.textContent) : String(value);
                                textParts.push(displayText);
                            }
                        }
                    } else {
                        // fallback: extract from visible drop zones
                        const dropZones = questionElement.querySelectorAll("span.drop");
                        for (const dropZone of dropZones) {
                            const placeNum = (Array.from(dropZone.classList).find(cls => /^place\d+$/.test(cls)) || "").replace("place", "");
                            const choiceElement = dropZone.querySelector(".draghome:not(.dragplaceholder)");
                            const choiceText = choiceElement ? cleanText(choiceElement.textContent) : "";
                            
                            if (placeNum) {
                                mapping[placeNum] = choiceText || "";
                            }
                            if (choiceText) {
                                textParts.push(choiceText);
                            }
                        }
                    }
                    
                    questionData.structured = {
                        mapping,
                        places: Object.keys(mapping).map(num => Number(num)).sort((a, b) => a - b)
                    };
                    questionData.parts = textParts;
                    questionData.text = textParts.join(" || ");
                    
                } else if (questionType === "answersselect") {
                    // extract single/multiple choice answers
                    const inputs = questionElement.querySelectorAll('input[type="checkbox"], input[type="radio"]');
                    let selectedText = "";
                    
                    if (inputs && inputs.length) {
                        for (const input of inputs) {
                            if (input.checked || input.hasAttribute("checked") || input.getAttribute("checked") !== null) {
                                const label = document.getElementById(input.id + "_label");
                                const ariaLabel = questionElement.querySelector(`[aria-labelledby="${input.id}_label"]`);
                                const labelElement = label || ariaLabel || input.parentElement;
                                selectedText = labelElement ? 
                                    cleanText((labelElement.textContent || input.value || "").replace(/\s+/g, " ").trim()) : 
                                    input.value || "";
                                break;
                            }
                        }
                    }
                    
                    questionData.structured = {
                        selectedText
                    };
                    questionData.text = selectedText || "";
                    
                } else if (questionType === "multianswer") {
                    // extract multi-answer parts
                    const parts = [];
                    const allInputs = Array.from(questionElement.querySelectorAll(
                        '.subquestion input, .subquestion textarea, .subquestion select, ' +
                        'input[name*="_sub"], textarea[name*="_sub"], select[name*="_sub"], ' +
                        'input[id*="_sub"], textarea[id*="_sub"], select[id*="_sub"]'
                    ));
                    
                    const indexedInputs = [];
                    
                    allInputs.forEach((input, index) => {
                        const nameOrId = (input.name || input.id || "") + "";
                        const subMatch = nameOrId.match(/_sub(?:question_)?(\d+)_/i);
                        const subMatch2 = nameOrId.match(/_sub(\d+)/i);
                        const subMatch3 = nameOrId.match(/sub(\d+)/i);
                        
                        const subIndex = subMatch ? Number(subMatch[1]) : 
                                       subMatch2 ? Number(subMatch2[1]) : 
                                       subMatch3 ? Number(subMatch3[1]) : 
                                       index + 1;
                        
                        indexedInputs.push({
                            idx: subIndex,
                            element: input
                        });
                    });
                    
                    indexedInputs.sort((a, b) => (a.idx || 0) - (b.idx || 0));
                    
                    for (const item of indexedInputs) {
                        const input = item.element;
                        let value = "";
                        
                        try {
                            if ((input.tagName || "").toLowerCase() === "select") {
                                const selectedOption = input.options && input.options[input.selectedIndex];
                                value = selectedOption ? (selectedOption.text || selectedOption.value || "") : (input.value || "");
                            } else {
                                value = (input.value && String(input.value).trim()) || "";
                            }
                            
                            if (value) {
                                parts.push(cleanText(value));
                            }
                        } catch (error) {
                            console.warn("TTF: Failed to extract value from input", error);
                        }
                    }
                    
                    questionData.parts = parts;
                    questionData.text = parts.join(" || ");
                    questionData.structured = {
                        parts
                    };
                }
                
                // save the question data
                if (questionData.text || (questionData.parts && questionData.parts.length > 0)) {
                    presets[quizName].questions[questionId] = questionData;
                    extractedCount++;
                    console.log(`TTF: Extracted ${questionId}:`, questionData.text);
                } else {
                    console.log(`TTF: No data found for ${questionId}`);
                }
                
            } catch (error) {
                console.error(`TTF: Failed to extract ${questionId}:`, error);
            }
        }
        
        // save updated presets
        presets[quizName].updatedAt = Date.now();
        savePresets(presets);
        
        showToast(`Extracted ${extractedCount} answers for "${quizName}"`);
        console.log(`TTF: Extraction complete. Total questions: ${extractedCount}`);
    }



        // modal functionality - drag implementation
        header.addEventListener("mousedown", (e) => {
            if (e.target === closeButton || closeButton.contains(e.target)) return;

            isDragging = true;

            // if modal is still centered, switch to absolute positioning
            if (modalCentered) {
                const rect = modal.getBoundingClientRect();
                modal.style.top = rect.top + 'px';
                modal.style.left = rect.left + 'px';
                modal.style.transform = 'none';
                modalCentered = false;

                // update current position
                currentModalX = rect.left;
                currentModalY = rect.top;
                initialModalX = rect.left;
                initialModalY = rect.top;
            }

            dragStartX = e.clientX - currentModalX;
            dragStartY = e.clientY - currentModalY;

            modal.style.transition = "none";
            document.body.style.userSelect = "none";
        });

        document.addEventListener("mousemove", (e) => {
            if (!isDragging) return;

            // calculate new position
            const newX = e.clientX - dragStartX;
            const newY = e.clientY - dragStartY;

            // get modal dimensions
            const rect = modal.getBoundingClientRect();

            // keep modal within viewport bounds
            const maxX = window.innerWidth - rect.width;
            const maxY = window.innerHeight - rect.height;

            // apply bounds checking to the new position
            currentModalX = Math.max(0, Math.min(newX, maxX));
            currentModalY = Math.max(0, Math.min(newY, maxY));

            // update modal position using absolute positioning
            modal.style.left = currentModalX + 'px';
            modal.style.top = currentModalY + 'px';
        });

        document.addEventListener("mouseup", () => {
            if (isDragging) {
                isDragging = false;
                modal.style.transition = "all 0.2s ease";
                document.body.style.userSelect = "";
            }
        });

        // Double-click header to center modal
        header.addEventListener("dblclick", () => {
            modal.style.transition = "all 0.3s ease";
            modal.style.top = "50%";
            modal.style.left = "50%";
            modal.style.transform = "translate(-50%, -50%)";
            modalCentered = true;

            // update position variables
            setTimeout(() => {
                const rect = modal.getBoundingClientRect();
                currentModalX = rect.left;
                currentModalY = rect.top;
                initialModalX = rect.left;
                initialModalY = rect.top;
                modal.style.transition = "none";
            }, 300);
        });

        // close button functionality
        closeButton.addEventListener("click", () => {
            modal.style.animation = "slideDown 0.2s ease";
            setTimeout(() => {
                modal.style.display = "none";
                createToggleButton();
            }, 200);
        });

        function createToggleButton() {
            if (document.getElementById("loremipsum-toggle")) return;

            const toggleButton = document.createElement("button");
            toggleButton.id = "loremipsum-toggle";
            toggleButton.title = "Show LoremIpsum";
            toggleButton.innerHTML = "📝 LoremIpsum";
            toggleButton.style.cssText = `
                position: fixed;
                right: 16px;
                top: 40px;
                z-index: 100001;
                background: linear-gradient(135deg, #1e293b 0%, #334155 100%);
                color: white;
                border: 0;
                padding: 10px 14px;
                border-radius: 12px;
                cursor: pointer;
                font-weight: 600;
                font-size: 13px;
                box-shadow: 0 4px 16px rgba(0,0,0,0.15);
                transition: all 0.2s ease;
            `;

            toggleButton.addEventListener("mouseenter", () => {
                toggleButton.style.transform = "translateY(-2px)";
                toggleButton.style.boxShadow = "0 6px 20px rgba(0,0,0,0.2)";
            });
            toggleButton.addEventListener("mouseleave", () => {
                toggleButton.style.transform = "translateY(0)";
                toggleButton.style.boxShadow = "0 4px 16px rgba(0,0,0,0.15)";
            });

            toggleButton.addEventListener("click", () => {
                modal.style.display = "block";
                modal.style.animation = "slideUp 0.4s ease";
                toggleButton.remove();
            });

            document.body.appendChild(toggleButton);
        }

        // main action buttons
        enableButton.addEventListener("click", async () => {
            if (isInterfaceActive) {
                showToast("Interface already active");
            } else {
                typeToFillInstance = new TypeToFillInlineInterface();
                window.typeToFillInstance = typeToFillInstance;
                isInterfaceActive = true;
                enableButton.textContent = "Type-to-Fill Active";
                enableButton.disabled = true;
                showToast("Type-to-Fill enabled");
                populateQuizSelect();
                populateQuestionSelect();
            }
        });

        importButton.addEventListener("click", async () => {
            await importPageAnswers();
        });



        // answer application
        autoLoadButton.addEventListener("click", async () => {
            updateQuestionStatus();
            autoLoadAnswersForCurrentQuestion();
        });
        
        applyButton.addEventListener("click", async () => {
            updateQuestionStatus();
            await applyAnswers();
        });
        
        // update question status on modal open
        setTimeout(() => {
            updateQuestionStatus();
        }, 100);
        populateQuestionSelect();

        return {
            modal,
            pasteArea,
            populateQuizSelect,
            populateQuestionSelect,
            loadSelectedPreset,
            showToast,
            applyAnswers,
            setProgress: (percentage) => {
                progressBar.style.width = Math.max(0, Math.min(100, percentage)) + "%";
            },
            showProgress: (show) => {
                progressContainer.style.display = show ? "block" : "none";
            }
        };
    }
    

    
    function createReviewInterface(pageContext) {
        console.log("TTF: Creating review interface");
        
        // create main modal container
        const modal = document.createElement("div");
        modal.className = "loremipsum-modal";
        modal.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: #0b1220;
            color: #e5e7eb;
            border-radius: 16px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.5);
            min-width: 400px;
            max-width: 90vw;
            max-height: 85vh;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            border: 1px solid #1f2937;
            cursor: default;
            user-select: none;
            overflow: hidden;
            transition: none;
            z-index: 100000;
            animation: slideUp 0.4s ease;
        `;

        // create header with different color for review mode
        const header = document.createElement("div");
        header.style.cssText = `
            background: linear-gradient(135deg, #065f46 0%, #047857 100%);
            color: #e5e7eb;
            padding: 10px 16px;
            font-weight: 600;
            display: flex;
            align-items: center;
            justify-content: space-between;
            cursor: move;
            border-radius: 16px 16px 0 0;
            border-bottom: 1px solid #1f2937;
            user-select: none;
        `;

        const title = document.createElement("div");
        title.textContent = "LoremIpsum - Save Answers";
        title.style.cssText = "font-size: 15px; display: flex; align-items: center; gap: 8px; color: #e2e8f0;";
        const icon = document.createElement("span");
        icon.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2z"></path>
            <polyline points="14,8 14,14 10,14 10,8"></polyline>
            <line x1="16" y1="6" x2="8" y2="6"></line>
            <line x1="16" y1="10" x2="8" y2="10"></line>
            <line x1="16" y1="14" x2="14" y2="14"></line>
        </svg>`;
        icon.style.cssText = "display: flex; align-items: center;";
        title.insertBefore(icon, title.firstChild);
        header.appendChild(title);

        const closeButton = document.createElement("button");
        closeButton.textContent = "−";
        closeButton.title = "Minimize";
        closeButton.style.cssText = `
            background: rgba(255,255,255,0.06);
            border: 1px solid rgba(255,255,255,0.12);
            color: #e5e7eb;
            border-radius: 6px;
            padding: 4px 8px;
            cursor: pointer;
            font-size: 13px;
            font-weight: 600;
            transition: all 0.2s ease;
        `;
        closeButton.addEventListener("mouseenter", () => {
            closeButton.style.background = "rgba(255,255,255,0.2)";
        });
        closeButton.addEventListener("mouseleave", () => {
            closeButton.style.background = "rgba(255,255,255,0.1)";
        });
        header.appendChild(closeButton);
        modal.appendChild(header);

        // create content area
        const content = document.createElement("div");
        content.style.cssText = "padding: 12px 16px 14px; display: flex; flex-direction: column; gap: 12px;";

        // description text for review mode
        const description = document.createElement("div");
        description.textContent = "Import answers from this review page, then select and export which quiz you want to export.";
        description.style.cssText = "font-size: 13px; color: #93a3b8; line-height: 1.4;";
        content.appendChild(description);

        // quiz name input
        const quizNameContainer = document.createElement("div");
        quizNameContainer.style.cssText = "display: flex; flex-direction: column; gap: 6px;";
        
        const quizNameLabel = document.createElement("div");
        quizNameLabel.textContent = "Quiz Name:";
        quizNameLabel.style.cssText = "font-size: 12px; color: #93a3b8; font-weight: 500;";
        quizNameContainer.appendChild(quizNameLabel);
        
        const quizNameInput = document.createElement("input");
        quizNameInput.type = "text";
        quizNameInput.placeholder = "Enter quiz name...";
        quizNameInput.value = getQuizName() || "";
        quizNameInput.style.cssText = `
            padding: 8px 12px;
            border-radius: 6px;
            border: 1px solid #1f2937;
            background: #0f172a;
            color: #e5e7eb;
            font-size: 13px;
            transition: all 0.2s ease;
        `;
        quizNameInput.addEventListener("focus", () => {
            quizNameInput.style.borderColor = "#10b981";
            quizNameInput.style.boxShadow = "0 0 0 3px rgba(16, 185, 129, 0.1)";
        });
        quizNameInput.addEventListener("blur", () => {
            quizNameInput.style.borderColor = "#1f2937";
            quizNameInput.style.boxShadow = "none";
        });
        quizNameContainer.appendChild(quizNameInput);
        content.appendChild(quizNameContainer);

        // action buttons for review mode
        const actionButtonsRow = document.createElement("div");
        actionButtonsRow.style.cssText = "display: flex; gap: 8px; margin-bottom: 12px;";

        const extractButton = document.createElement("button");
        extractButton.innerHTML = "🔍 Import Answers";
        extractButton.style.cssText = `
            flex: 1;
            padding: 10px 12px;
            border-radius: 8px;
            border: 1px solid #10b981;
            background: #064e3b;
            color: #e5e7eb;
            cursor: pointer;
            font-weight: 600;
            font-size: 13px;
            transition: all 0.2s ease;
        `;
        extractButton.addEventListener("mouseenter", () => {
            extractButton.style.transform = "translateY(-1px)";
            extractButton.style.boxShadow = "0 4px 12px rgba(16, 185, 129, 0.3)";
        });
        extractButton.addEventListener("mouseleave", () => {
            extractButton.style.transform = "translateY(0)";
            extractButton.style.boxShadow = "none";
        });
        
        actionButtonsRow.appendChild(extractButton);
        content.appendChild(actionButtonsRow);

        // export section
        const exportSection = document.createElement("div");
        exportSection.style.cssText = "display: flex; flex-direction: column; gap: 8px; background: rgba(59, 130, 246, 0.05); border: 1px solid rgba(59, 130, 246, 0.2); border-radius: 8px; padding: 12px; margin-bottom: 12px;";
        
        const exportLabel = document.createElement("div");
        exportLabel.textContent = "Export Quiz Data";
        exportLabel.style.cssText = "font-size: 13px; color: #3b82f6; font-weight: 600; margin-bottom: 4px;";
        exportSection.appendChild(exportLabel);

        // dropdown to select quiz to export
        const exportSelect = document.createElement("select");
        exportSelect.style.cssText = "padding: 8px 12px; border-radius: 6px; border: 1px solid #1f2937; background: #0f172a; color: #e5e7eb; font-size: 13px; margin-bottom: 8px;";
        
        const exportButton = document.createElement("button");
        exportButton.innerHTML = "📤 Export Selected Quiz";
        exportButton.style.cssText = `
            padding: 10px 12px;
            border-radius: 8px;
            border: 1px solid #1f2937;
            background: #0f172a;
            color: #e5e7eb;
            cursor: pointer;
            font-weight: 600;
            font-size: 13px;
            transition: all 0.2s ease;
        `;
        exportButton.addEventListener("mouseenter", () => {
            exportButton.style.transform = "translateY(-1px)";
            exportButton.style.background = "rgba(255,255,255,0.1)";
            exportButton.style.borderColor = "#555";
        });
        exportButton.addEventListener("mouseleave", () => {
            exportButton.style.transform = "translateY(0)";
            exportButton.style.background = "#0f172a";
            exportButton.style.borderColor = "#1f2937";
        });

        const deleteButton = document.createElement("button");
        deleteButton.innerHTML = "🗑️ Delete Selected Quiz";
        deleteButton.style.cssText = `
            padding: 10px 12px;
            border-radius: 8px;
            border: 1px solid #dc2626;
            background: #0f172a;
            color: #ef4444;
            cursor: pointer;
            font-weight: 600;
            font-size: 13px;
            transition: all 0.2s ease;
            margin-top: 6px;
        `;
        deleteButton.addEventListener("mouseenter", () => {
            deleteButton.style.transform = "translateY(-1px)";
            deleteButton.style.background = "rgba(239, 68, 68, 0.1)";
            deleteButton.style.borderColor = "#ef4444";
        });
        deleteButton.addEventListener("mouseleave", () => {
            deleteButton.style.transform = "translateY(0)";
            deleteButton.style.background = "#0f172a";
            deleteButton.style.borderColor = "#dc2626";
        });

        // function to populate export dropdown
        const updateExportDropdown = () => {
            exportSelect.innerHTML = "";
            const defaultOption = document.createElement("option");
            defaultOption.value = "";
            defaultOption.textContent = "-- Select Quiz to Export --";
            exportSelect.appendChild(defaultOption);
            
            const allOption = document.createElement("option");
            allOption.value = "__all__";
            allOption.textContent = "Export ALL Quizzes";
            exportSelect.appendChild(allOption);
            
            const presets = loadPresets();
            Object.keys(presets).forEach(quizName => {
                const option = document.createElement("option");
                option.value = quizName;
                option.textContent = quizName;
                exportSelect.appendChild(option);
            });
        };
        
        updateExportDropdown();
        exportSection.appendChild(exportSelect);
        exportSection.appendChild(exportButton);
        exportSection.appendChild(deleteButton);
        content.appendChild(exportSection);

        const statusDisplay = document.createElement("div");
        statusDisplay.id = "review-status";
        statusDisplay.style.cssText = `
            padding: 8px 12px;
            background: rgba(59, 130, 246, 0.1);
            border: 1px solid rgba(59, 130, 246, 0.2);
            border-radius: 6px;
            font-size: 12px;
            color: #93a3b8;
            text-align: center;
        `;
        statusDisplay.textContent = "Ready to extract answers from review page";
        content.appendChild(statusDisplay);

        const helpText = document.createElement("div");
        helpText.style.cssText = "font-size: 11px; color: #6b7280; line-height: 1.4; margin-top: 8px;";
        helpText.innerHTML = `
            • Import answers from this review page<br>
            • Select which quiz to export from the dropdown<br>
            • Delete unwanted quizzes using the delete button<br>
            • Import the JSON file in quiz mode for auto-fill
        `;
        content.appendChild(helpText);

        modal.appendChild(content);
        document.body.appendChild(modal);
        
        // event handlers for review mode
        extractButton.addEventListener("click", async () => {
            const quizName = quizNameInput.value.trim();
            if (!quizName) {
                showToast("Please enter a quiz name first");
                return;
            }
            
            statusDisplay.textContent = "Importing answers...";
            statusDisplay.style.background = "rgba(251, 146, 60, 0.1)";
            statusDisplay.style.borderColor = "rgba(251, 146, 60, 0.2)";
            
            try {
                await extractAnswersFromReview(quizName);
                statusDisplay.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display: inline; margin-right: 4px;">
                    <polyline points="20,6 9,17 4,12"></polyline>
                </svg>Answers imported and saved!`;
                statusDisplay.style.background = "rgba(34, 197, 94, 0.1)";
                statusDisplay.style.borderColor = "rgba(34, 197, 94, 0.2)";
                
                // update export dropdown after successful import
                updateExportDropdown();
                
            } catch (error) {
                statusDisplay.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display: inline; margin-right: 4px;">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="15" y1="9" x2="9" y2="15"></line>
                    <line x1="9" y1="9" x2="15" y2="15"></line>
                </svg>Failed to import answers`;
                statusDisplay.style.background = "rgba(239, 68, 68, 0.1)";
                statusDisplay.style.borderColor = "rgba(239, 68, 68, 0.2)";
                console.error("TTF: Import failed:", error);
            }
        });
        
        exportButton.addEventListener("click", () => {
            const selectedQuiz = exportSelect.value;
            if (!selectedQuiz) {
                showToast("Please select a quiz to export");
                return;
            }
            
            if (selectedQuiz === "__all__") {
                const presets = loadPresets();
                if (Object.keys(presets).length === 0) {
                    showToast("No quizzes available to export");
                    return;
                }
                Object.entries(presets).forEach(([quizName, quizData]) => {
                    exportSpecificQuiz(quizName, quizData);
                });
                showToast(`Exported all ${Object.keys(presets).length} quizzes`);
            } else {
                const presets = loadPresets();
                if (presets[selectedQuiz]) {
                    exportSpecificQuiz(selectedQuiz, presets[selectedQuiz]);
                } else {
                    showToast("Selected quiz not found");
                }
            }
        });
        
        deleteButton.addEventListener("click", () => {
            const selectedQuiz = exportSelect.value;
            if (!selectedQuiz || selectedQuiz === "__all__") {
                showToast("Please select a specific quiz to delete");
                return;
            }
            
            // confirmation dialog
            const confirmDelete = confirm(`Are you sure you want to delete the quiz "${selectedQuiz}"? This action cannot be undone.`);
            if (!confirmDelete) {
                return;
            }
            
            try {
                const presets = loadPresets();
                if (!presets[selectedQuiz]) {
                    showToast("Quiz not found");
                    return;
                }
                
                delete presets[selectedQuiz];
                savePresets(presets);
                
                // update dropdown after deletion
                updateExportDropdown();
                
                showToast(`Quiz "${selectedQuiz}" deleted successfully`);
            } catch (error) {
                showToast("Failed to delete quiz");
                console.error("TTF: Delete failed:", error);
            }
        });
        
        closeButton.addEventListener("click", () => {
            // minimize the modal instead of removing it
            modal.style.display = "none";
            
            // create minimized indicator if it doesn't exist
            let minimizedIndicator = document.getElementById("ttf-review-minimized");
            if (!minimizedIndicator) {
                minimizedIndicator = document.createElement("div");
                minimizedIndicator.id = "ttf-review-minimized";
                minimizedIndicator.innerHTML = "📝 Save Answers";
                minimizedIndicator.style.cssText = `
                    position: fixed;
                    bottom: 20px;
                    right: 20px;
                    background: #0b1220;
                    border: 2px solid #1f2937;
                    color: #e5e7eb;
                    padding: 8px 12px;
                    border-radius: 8px;
                    cursor: pointer;
                    font-size: 13px;
                    font-weight: 600;
                    z-index: 10001;
                    transition: all 0.2s ease;
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
                `;
                
                minimizedIndicator.addEventListener("mouseenter", () => {
                    minimizedIndicator.style.transform = "translateY(-2px)";
                    minimizedIndicator.style.background = "rgba(59, 130, 246, 0.1)";
                    minimizedIndicator.style.borderColor = "#3b82f6";
                });
                
                minimizedIndicator.addEventListener("mouseleave", () => {
                    minimizedIndicator.style.transform = "translateY(0)";
                    minimizedIndicator.style.background = "#0b1220";
                    minimizedIndicator.style.borderColor = "#1f2937";
                });
                
                minimizedIndicator.addEventListener("click", () => {
                    // restore the modal
                    modal.style.display = "block";
                    minimizedIndicator.remove();
                });
                
                document.body.appendChild(minimizedIndicator);
            }
        });
        
        // add drag functionality (simplified)
        let isDragging = false;
        let dragStartX = 0;
        let dragStartY = 0;
        
        header.addEventListener("mousedown", (e) => {
            if (e.target === closeButton) return;
            isDragging = true;
            dragStartX = e.clientX - modal.offsetLeft;
            dragStartY = e.clientY - modal.offsetTop;
            modal.style.transition = "none";
        });
        
        document.addEventListener("mousemove", (e) => {
            if (!isDragging) return;
            const newX = e.clientX - dragStartX;
            const newY = e.clientY - dragStartY;
            modal.style.left = Math.max(0, Math.min(newX, window.innerWidth - modal.offsetWidth)) + "px";
            modal.style.top = Math.max(0, Math.min(newY, window.innerHeight - modal.offsetHeight)) + "px";
            modal.style.transform = "none";
        });
        
        document.addEventListener("mouseup", () => {
            if (isDragging) {
                isDragging = false;
                modal.style.transition = "all 0.2s ease";
            }
        });
        
        // add CSS for animations if not already present
        if (!document.querySelector('style[data-ttf-animations]')) {
            const style = document.createElement('style');
            style.setAttribute('data-ttf-animations', 'true');
            style.textContent = `
                @keyframes slideUp {
                    from {
                        opacity: 0;
                        transform: translate(-50%, -50%) translateY(30px) scale(0.95);
                    }
                    to {
                        opacity: 1;
                        transform: translate(-50%, -50%) translateY(0) scale(1);
                    }
                }
            `;
            document.head.appendChild(style);
        }
    }



    // class for inline type-to-fill interface on drag-drop questions
    class TypeToFillInlineInterface {
        constructor() {
            this.processedElements = new Set();
            this.init();
        }

        init() {
            this.scan();
            setTimeout(() => this.scan(), 700);
        }

        scan() {
            const ddwtosQuestions = queryAll(".que.ddwtos");
            
            for (const question of ddwtosQuestions) {
                const dropZones = question.querySelectorAll("span.drop");
                
                for (const dropZone of dropZones) {
                    if (dropZone.dataset.ttfAttached !== "1") {
                        try {
                            const computedStyle = window.getComputedStyle(dropZone);
                            const width = dropZone.clientWidth || parseInt(computedStyle.width) || 100;
                            const height = dropZone.clientHeight || parseInt(computedStyle.height) || 28;
                            
                            const input = document.createElement("input");
                            input.type = "text";
                            input.className = "ttf-inline";
                            input.style.cssText = `
                                width: ${Math.max(60, width - 6)}px;
                                height: ${height}px;
                                line-height: ${height}px;
                                padding: 2px 6px;
                                border-radius: 6px;
                                border: 1px dashed rgba(0,0,0,0.15);
                                box-sizing: border-box;
                                background: rgba(0,0,0,0.03);
                            `;
                            input.placeholder = "";
                            
                            input.addEventListener("keydown", async (event) => {
                                if (event.key === "Enter" || event.key === "Tab" || event.key === " ") {
                                    event.preventDefault();
                                    const answerText = cleanText(input.value || "");
                                    
                                    if (answerText) {
                                        const questionElement = dropZone.closest(".que.ddwtos") || dropZone.closest(".que");
                                        
                                        try {
                                            const availableChoices = Array.from(questionElement.querySelectorAll(".draghome:not(.dragplaceholder)"));
                                            let matchingChoice = null;
                                            
                                            // find exact match
                                            for (const choice of availableChoices) {
                                                if (cleanText(choice.textContent).toLowerCase() === answerText.toLowerCase()) {
                                                    matchingChoice = choice;
                                                    break;
                                                }
                                            }
                                            
                                            // find partial match
                                            if (!matchingChoice) {
                                                for (const choice of availableChoices) {
                                                    if (cleanText(choice.textContent).toLowerCase().includes(answerText.toLowerCase())) {
                                                        matchingChoice = choice;
                                                        break;
                                                    }
                                                }
                                            }
                                            
                                            if (!matchingChoice && /^\d+$/.test(answerText)) {
                                                // direct number input
                                                applyPlaceHiddenInput(questionElement, getPlaceNumber(dropZone), answerText);
                                            } else if (matchingChoice) {
                                                const choiceNumber = extractChoiceNumber(matchingChoice) || matchingChoice.dataset.choice || "";
                                                applyPlaceHiddenInput(questionElement, getPlaceNumber(dropZone), choiceNumber);
                                            }
                                            
                                            input.value = "";
                                        } catch (error) {
                                            console.warn("TTF inline apply failed", error);
                                        }
                                    }
                                }
                            });
                            
                            dropZone.innerHTML = "";
                            dropZone.style.position = "relative";
                            dropZone.dataset.ttfAttached = "1";
                            dropZone.appendChild(input);
                            
                        } catch (error) {
                            console.warn("TTF inline attach error", error);
                        }
                    }
                }
            }
        }
    }

    // extract place number from drop zone element
    function getPlaceNumber(element) {
        if (!element) return null;
        
        const placeClass = Array.from(element.classList).find(cls => /^place\d+$/.test(cls));
        return placeClass ? Number(placeClass.replace("place", "")) : null;
    }

    // apply answer to hidden input field for drag-drop questions
    function applyPlaceHiddenInput(questionElement, placeNumber, choiceNumber) {
        try {
            // find the hidden input for this place
            let hiddenInput = questionElement.querySelector(`input.placeinput.place${placeNumber}`);
            
            if (!hiddenInput) {
                // fallback search for hidden inputs
                hiddenInput = Array.from(questionElement.querySelectorAll('input[type="hidden"], input'))
                    .find(input => {
                        const searchText = (input.className + " " + (input.name || "") + " " + (input.id || "")).toLowerCase();
                        return searchText.includes(`place${placeNumber}`) || 
                               searchText.includes(`place_${placeNumber}`) || 
                               (input.name && input.name.toLowerCase().includes(`:${placeNumber}_`)) || 
                               false;
                    });
            }
            
            // set the hidden input value
            if (hiddenInput) {
                hiddenInput.value = choiceNumber;
                hiddenInput.dispatchEvent(new Event("change", { bubbles: true }));
            } else {
                console.warn("TTF: hidden place input not found for place", placeNumber);
            }
            
            // find the source choice element
            const sourceChoice = questionElement.querySelector(`.draghome.choice${choiceNumber}`) ||
                               questionElement.querySelector(`.draghome[data-choice="${choiceNumber}"]`) ||
                               null;
            
            const displayText = sourceChoice ? cleanText(sourceChoice.textContent || "") : String(choiceNumber);
            
            // find the drop zone
            let dropZone = questionElement.querySelector(`span.drop.place${placeNumber}`);
            if (!dropZone) {
                dropZone = Array.from(questionElement.querySelectorAll("span.drop"))
                    .find(element => 
                        Array.from(element.classList).some(cls => cls === `place${placeNumber}`)
                    );
            }
            
            if (dropZone) {
                // remove any existing content
                const existingChoice = dropZone.querySelector(".draghome:not(.dragplaceholder)");
                if (existingChoice) {
                    existingChoice.remove();
                }
                
                // create new choice element
                let newChoice;
                if (sourceChoice) {
                    newChoice = sourceChoice.cloneNode(true);
                    newChoice.classList.remove("dragplaceholder");
                    newChoice.classList.add("ttf-placed");
                    newChoice.style.visibility = "visible";
                    newChoice.style.display = "";
                    if (!newChoice.dataset.choice) {
                        newChoice.dataset.choice = String(choiceNumber);
                    }
                } else {
                    newChoice = document.createElement("div");
                    newChoice.className = "draghome ttf-placed";
                    newChoice.textContent = displayText;
                    newChoice.dataset.choice = String(choiceNumber);
                }
                
                // add to drop zone
                try {
                    dropZone.appendChild(newChoice);
                } catch (error) {
                    console.warn("TTF: unable to append placed element", error);
                }
                
                // hide the original choice
                if (sourceChoice) {
                    try {
                        sourceChoice.style.visibility = "hidden";
                        sourceChoice.style.display = "none";
                        sourceChoice.classList.add("ttf-placed");
                    } catch (error) {
                        // ignore errors
                    }
                }
                
                // trigger events
                try {
                    dropZone.dispatchEvent(new Event("change", { bubbles: true }));
                    dropZone.dispatchEvent(new Event("drop", { bubbles: true }));
                    dropZone.dispatchEvent(new CustomEvent("ddwtos:drop", {
                        detail: { place: placeNumber, choice: choiceNumber },
                        bubbles: true
                    }));
                    questionElement.dispatchEvent(new Event("change", { bubbles: true }));
                } catch (error) {
                    // ignore event errors
                }
                
                console.log("TTF: set place", placeNumber, "=>", choiceNumber, "visible label:", displayText);
                return true;
            }
            
            console.warn("TTF: drop span not found for place", placeNumber, " — hidden input set:", !!hiddenInput);
            return !!hiddenInput;
            
        } catch (error) {
            console.warn("TTF applyPlaceHiddenInput error", error);
            return false;
        }
    }

    async function applyDragDropAnswers(questionElement, answersText, progressBar) {
        // find all drop zones with place numbers
        const dropZones = Array.from(questionElement.querySelectorAll("span.drop"))
            .filter(element => 
                Array.from(element.classList).some(cls => /^place\d+$/.test(cls))
            )
            .map(element => {
                const placeClass = Array.from(element.classList).find(cls => /^place\d+$/.test(cls));
                return {
                    place: placeClass ? Number(placeClass.replace("place", "")) : null,
                    element: element
                };
            })
            .filter(item => item.place !== null)
            .sort((a, b) => a.place - b.place);
        
        if (!dropZones.length) {
            showToast("No drop spans found in active question");
            return;
        }
        
        // parse answers
        let answerTokens;
        if (answersText.includes("||")) {
            answerTokens = answersText.split(/\|\|/).map(text => cleanText(text)).filter(Boolean);
        } else {
            answerTokens = answersText.split(/\s+/).filter(Boolean);
        }
        
        // check for explicit place mapping (e.g., "place1:2 place2:3")
        const explicitMapping = {};
        const mappingMatches = answersText.match(/place(\d+)\s*[:=]\s*([0-9]+)/gi);
        
        if (mappingMatches && mappingMatches.length) {
            for (const match of mappingMatches) {
                const parsed = match.match(/place(\d+)\s*[:=]\s*([0-9]+)/i);
                if (parsed) {
                    explicitMapping[parsed[1]] = parsed[2];
                }
            }
        }
        
        // apply explicit mapping if found
        if (Object.keys(explicitMapping).length) {
            const placeNumbers = dropZones.map(zone => zone.place);
            let appliedCount = 0;
            
            for (let i = 0; i < placeNumbers.length; i++) {
                const placeNum = String(placeNumbers[i]);
                if (explicitMapping[placeNum]) {
                    if (applyPlaceHiddenInput(questionElement, placeNum, explicitMapping[placeNum])) {
                        appliedCount++;
                    }
                    const progress = Math.round((appliedCount / placeNumbers.length) * 100);
                    progressBar.style.width = progress + "%";
                    await delay(DELAY_MS);
                }
            }
            showToast("Applied explicit mapping to hidden inputs");
            return;
        }
        
        // get available choices
        const availableChoices = Array.from(questionElement.querySelectorAll(".draghome:not(.dragplaceholder)"));
        const choiceMap = new Map();
        
        for (const choice of availableChoices) {
            const choiceText = cleanText(choice.textContent || "").toLowerCase();
            const choiceNumber = (Array.from(choice.classList)
                .map(cls => cls.match(/^choice(\d+)$/))
                .find(Boolean) || [])[1] || null;
            
            if (!choiceMap.has(choiceText)) {
                choiceMap.set(choiceText, []);
            }
            choiceMap.get(choiceText).push({
                element: choice,
                choiceNum: choiceNumber
            });
        }
        
        let appliedCount = 0;
        
        // try exact token-to-place mapping
        if (answerTokens.length === dropZones.length) {
            for (let i = 0; i < dropZones.length; i++) {
                const answerText = cleanText(answerTokens[i]);
                const placeNumber = dropZones[i].place;
                
                // find matching choice
                let matchingChoice = (choiceMap.get(answerText.toLowerCase()) || [])[0];
                
                if (!matchingChoice) {
                    // try partial matching
                    for (const [choiceText, choices] of choiceMap) {
                        if (choiceText.includes(answerText.toLowerCase())) {
                            matchingChoice = choices[0];
                            break;
                        }
                    }
                }
                
                if (matchingChoice) {
                    const choiceNum = matchingChoice.choiceNum || 
                        extractChoiceNumber(matchingChoice.element) || 
                        matchingChoice.element.dataset.choice || null;
                    
                    if (choiceNum != null) {
                        if (applyPlaceHiddenInput(questionElement, String(placeNumber), String(choiceNum))) {
                            appliedCount++;
                        }
                    }
                } else if (/^\d+$/.test(answerText)) {
                    // if answer is just a number, use it directly
                    if (applyPlaceHiddenInput(questionElement, String(placeNumber), answerText)) {
                        appliedCount++;
                    }
                }
                
                progressBar.style.width = Math.round(((i + 1) / dropZones.length) * 100) + "%";
                await delay(DELAY_MS);
            }
            
            showToast(`Attempted mapping by tokens — applied ${appliedCount}/${dropZones.length}`);
            return;
        }
        
        // sequential filling
        let tokenIndex = 0;
        for (let i = 0; i < dropZones.length && answerTokens[tokenIndex]; i++) {
            const answerText = cleanText(answerTokens[tokenIndex]);
            const placeNumber = dropZones[i].place;
            
            let matchingChoice = (choiceMap.get(answerText.toLowerCase()) || [])[0];
            
            if (!matchingChoice) {
                for (const [choiceText, choices] of choiceMap) {
                    if (choiceText.includes(answerText.toLowerCase())) {
                        matchingChoice = choices[0];
                        break;
                    }
                }
            }
            
            if (matchingChoice) {
                const choiceNum = matchingChoice.choiceNum || 
                    extractChoiceNumber(matchingChoice.element) || 
                    matchingChoice.element.dataset.choice || null;
                
                if (choiceNum != null) {
                    applyPlaceHiddenInput(questionElement, String(placeNumber), String(choiceNum));
                }
            } else if (/^\d+$/.test(answerText)) {
                applyPlaceHiddenInput(questionElement, String(placeNumber), answerText);
            }
            
            progressBar.style.width = Math.round(((i + 1) / dropZones.length) * 100) + "%";
            tokenIndex++;
            await delay(DELAY_MS);
        }
        
        showToast("Applied ddwtos attempts");
    }

    async function applyMultiAnswers(questionElement, answersText, progressBar) {
        const answerParts = answersText.split(/\|\|/).map(text => cleanText(text)).filter(Boolean);
        
        if (!answerParts.length) {
            showToast('No pieces detected (use " || " to separate)');
            return;
        }
        
        const inputElements = Array.from(questionElement.querySelectorAll('input[type="text"], textarea, select'));
        
        if (!inputElements.length) {
            showToast("No text inputs found in question");
            return;
        }
        
        let appliedCount = 0;
        
        for (let i = 0; i < inputElements.length && i < answerParts.length; i++) {
            const inputElement = inputElements[i];
            const answerText = answerParts[i];
            
            try {
                if (inputElement.tagName.toLowerCase() === "select") {
                    // handle select elements
                    const exactMatch = Array.from(inputElement.options)
                        .find(option => cleanText(option.text).toLowerCase() === answerText.toLowerCase());
                    
                    if (exactMatch) {
                        inputElement.value = exactMatch.value;
                    } else {
                        const valueMatch = Array.from(inputElement.options)
                            .find(option => String(option.value).toLowerCase() === answerText.toLowerCase());
                        if (valueMatch) {
                            inputElement.value = valueMatch.value;
                        }
                    }
                    inputElement.dispatchEvent(new Event("change", { bubbles: true }));
                } else {
                    // handle text inputs and textareas
                    inputElement.value = answerText;
                    inputElement.dispatchEvent(new Event("input", { bubbles: true }));
                    inputElement.dispatchEvent(new Event("change", { bubbles: true }));
                }
                appliedCount++;
            } catch (error) {
                console.warn("TTF: failed to set multi sub", error);
            }
            
            progressBar.style.width = Math.round(((i + 1) / inputElements.length) * 100) + "%";
            await delay(DELAY_MS);
        }
        
        showToast(`Multi answers applied: ${appliedCount}/${inputElements.length}`);
    }

    async function applySingleChoiceAnswers(questionElement, answersText, progressBar) {
        const answerText = cleanText(answersText);
        
        if (!answerText) {
            showToast("Paste text empty");
            return;
        }
        
        const inputElements = Array.from(questionElement.querySelectorAll('input[type="checkbox"], input[type="radio"]'));
        
        if (!inputElements.length) {
            showToast("No radio/checkbox inputs found");
            return;
        }
        
        // try exact text matching
        for (let i = 0; i < inputElements.length; i++) {
            const input = inputElements[i];
            const label = document.getElementById(input.id + "_label");
            const ariaLabel = questionElement.querySelector(`[aria-labelledby="${input.id}_label"]`);
            const labelElement = label || ariaLabel || input.parentElement;
            const labelText = labelElement ? cleanText(labelElement.textContent || "") : "";
            
            if (labelText && labelText.toLowerCase() === answerText.toLowerCase()) {
                try {
                    input.checked = true;
                    input.dispatchEvent(new Event("change", { bubbles: true }));
                    progressBar.style.width = "100%";
                    await delay(DELAY_MS);
                    showToast("Selected matching option");
                    return;
                } catch (error) {
                    // continue to next option
                }
            }
        }
        
        // try partial text matching
        for (let i = 0; i < inputElements.length; i++) {
            const input = inputElements[i];
            const label = document.getElementById(input.id + "_label");
            const ariaLabel = questionElement.querySelector(`[aria-labelledby="${input.id}_label"]`);
            const labelElement = label || ariaLabel || input.parentElement;
            const labelText = labelElement ? cleanText(labelElement.textContent || "") : "";
            
            if (labelText && labelText.toLowerCase().includes(answerText.toLowerCase())) {
                try {
                    input.checked = true;
                    input.dispatchEvent(new Event("change", { bubbles: true }));
                    progressBar.style.width = "100%";
                    await delay(DELAY_MS);
                    showToast("Selected option by substring");
                    return;
                } catch (error) {
                    // continue to next option
                }
            }
        }
        
        // try index-based selection (if answer is a number)
        if (/^\d+$/.test(answerText)) {
            const index = Number(answerText) - 1; // convert to 0-based index
            if (index >= 0 && index < inputElements.length) {
                const input = inputElements[index];
                input.checked = true;
                input.dispatchEvent(new Event("change", { bubbles: true }));
                progressBar.style.width = "100%";
                await delay(DELAY_MS);
                showToast("Selected option by index");
                return;
            }
        }
        
        // try value-based matching
        for (const input of inputElements) {
            if (String(input.value || "").toLowerCase() === answerText.toLowerCase()) {
                input.checked = true;
                input.dispatchEvent(new Event("change", { bubbles: true }));
                progressBar.style.width = "100%";
                await delay(DELAY_MS);
                showToast("Selected option by value");
                return;
            }
        }
        
        showToast("No matching option found for multiple-choice");
    }

    function extractChoiceNumber(element) {
        const classList = element && element.className ? element.className.split(/\s+/) : [];
        for (const className of classList) {
            const match = className.match(/^choice(\d+)$/);
            if (match) {
                return match[1];
            }
        }
        return null;
    }



    // initialize the main interface
    interfaceModal = createMainInterface();

    // chrome storage and messaging listeners
    try {
        chrome.storage.onChanged.addListener(async (changes, namespace) => {
            // handle storage changes if needed
        });
    } catch (error) {
        // ignore if not in extension context
    }

    try {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            // message handling for extension functionality
        });
    } catch (error) {
        // ignore if not in extension context
    }

    // dom ready handler
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => {
            setTimeout(() => {
                // additional initialization if needed
            }, 100);
        });
    }

    // set global flags
    window.typeToFillInterface = true;
    window.typeToFill = window.typeToFill || {};
    window.typeToFill.showUI = () => {
        if (!document.querySelector(".loremipsum-modal")) {
            createMainInterface();
        }
    };

    console.log("🚀 LoremIpsum loaded.");

})();
