// =========================================================
// TROVE — FRONTEND
// Zero-Warning AI Email Intelligence
// =========================================================

const API_BASE_URL = "https://trove-backend-ea57.onrender.com";

// =========================================================
// 1. DOM ELEMENTS
// =========================================================

const menuBtn = document.getElementById("menu-btn");
const mainNav = document.getElementById("main-nav");
const googleLogin = document.getElementById("google-login");
const heroLogin = document.getElementById("hero-login");
const navDemoBtn = document.getElementById("nav-demo-btn");
const heroDemoBtn = document.getElementById("hero-demo-btn");
const summarizeBtn = document.getElementById("summarize-btn");
const manualSummarizeBtn = document.getElementById("manual-summarize-btn");
const manualEmailText = document.getElementById("manual-email-text");
const loggedIn = document.getElementById("logged-in");
const processing = document.getElementById("processing");
const results = document.getElementById("results");
const progressBar = document.getElementById("progress-bar");
const progressText = document.getElementById("progress-text");
const resultCount = document.getElementById("result-count");
const categoryFilter = document.getElementById("category-filter");
const emailContainer = document.getElementById("email-container");

// =========================================================
// 2. STATE
// =========================================================

let allEmails = [];
let currentCategory = "All";
let progressTimer = null;

// =========================================================
// 3. NAVIGATION & AUTH LISTENERS
// =========================================================

if (menuBtn && mainNav) {
    menuBtn.addEventListener("click", () => {
        const isOpen = mainNav.classList.toggle("mobile-open");
        menuBtn.setAttribute("aria-expanded", String(isOpen));
    });

    mainNav.querySelectorAll("a").forEach((link) => {
        link.addEventListener("click", () => {
            mainNav.classList.remove("mobile-open");
            menuBtn.setAttribute("aria-expanded", "false");
        });
    });
}

[googleLogin, heroLogin].forEach((btn) => {
    if (btn) {
        btn.addEventListener("click", () => {
            btn.classList.add("loading");
            btn.textContent = "Connecting...";
        });
    }
});

// Demo Mode Buttons
[navDemoBtn, heroDemoBtn].forEach((btn) => {
    if (btn) {
        btn.addEventListener("click", runDemoSummarize);
    }
});

if (summarizeBtn) {
    summarizeBtn.addEventListener("click", runDemoSummarize);
}

if (manualSummarizeBtn) {
    manualSummarizeBtn.addEventListener("click", runManualSummarize);
}

// =========================================================
// 4. CORE API CALLS
// =========================================================

// Runs Live AI Pipeline on Preloaded Mock Inbox
async function runDemoSummarize() {
    setLoadingState(true, "Analyzing inbox stream...");

    try {
        const response = await fetch(`${API_BASE_URL}/api/demo-summarize`, {
            method: "POST",
            headers: { "Content-Type": "application/json" }
        });

        const data = await parseJSON(response);
        if (!response.ok || data.error) throw new Error(data.error || `Server status: ${response.status}`);

        finishProgress();
        await sleep(300);

        allEmails = Array.isArray(data.emails) ? data.emails : [];
        currentCategory = "All";

        updateFilterButtons();
        renderEmails();
        showElement(loggedIn);
        showElement(results);
        scrollToResults();
    } catch (error) {
        console.error("Demo summarize error:", error);
        showError(getFriendlyError(error));
    } finally {
        setLoadingState(false);
    }
}

// Runs Live AI Pipeline on Pasted Custom Content
async function runManualSummarize() {
    const content = manualEmailText ? manualEmailText.value.trim() : "";
    if (!content) {
        alert("Please paste some email text to summarize.");
        return;
    }

    setLoadingState(true, "Analyzing pasted content with Gemini...");

    try {
        const response = await fetch(`${API_BASE_URL}/api/manual-summarize`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content: content })
        });

        const data = await parseJSON(response);
        if (!response.ok || data.error) throw new Error(data.error || `Server status: ${response.status}`);

        finishProgress();
        await sleep(300);

        if (Array.isArray(data.emails)) {
            allEmails = [...data.emails, ...allEmails];
        }

        if (manualEmailText) manualEmailText.value = "";
        currentCategory = "All";

        updateFilterButtons();
        renderEmails();
        showElement(results);
        scrollToResults();
    } catch (error) {
        console.error("Manual summarize error:", error);
        showError(getFriendlyError(error));
    } finally {
        setLoadingState(false);
    }
}

// =========================================================
// 5. LOADING & PROGRESS UI
// =========================================================

function setLoadingState(loading, message = "Processing...") {
    if (loading) {
        hideElement(results);
        showElement(processing);
        startProgress(message);
    } else {
        stopProgress();
        hideElement(processing);
    }
}

function startProgress(initialText) {
    stopProgress();
    if (!progressBar) return;

    progressBar.value = 15;
    if (progressText) progressText.textContent = initialText;

    const stages = [
        { value: 35, text: "Extracting message threads..." },
        { value: 65, text: "Gemini is identifying actions & deadlines..." },
        { value: 85, text: "Formatting executive summary..." },
        { value: 95, text: "Finalizing response..." }
    ];

    let stage = 0;
    progressTimer = setInterval(() => {
        if (stage >= stages.length) return;
        progressBar.value = stages[stage].value;
        if (progressText) progressText.textContent = stages[stage].text;
        stage++;
    }, 700);
}

function finishProgress() {
    stopProgress();
    if (progressBar) progressBar.value = 100;
    if (progressText) progressText.textContent = "Analysis complete.";
}

function stopProgress() {
    if (progressTimer) {
        clearInterval(progressTimer);
        progressTimer = null;
    }
}

// =========================================================
// 6. CARD RENDERING & CATEGORIES
// =========================================================

function renderEmails() {
    if (!emailContainer) return;
    emailContainer.innerHTML = "";

    const filtered = getFilteredEmails();
    updateResultCount(filtered.length);

    if (allEmails.length === 0) {
        showEmptyState("Inbox is clean", "No email summaries available.");
        return;
    }

    if (filtered.length === 0) {
        showEmptyState("No matching emails", "Try selecting another category filter above.");
        return;
    }

    filtered.forEach((email, index) => {
        const card = createEmailCard(email, index);
        emailContainer.appendChild(card);
    });
}

function getFilteredEmails() {
    if (currentCategory === "All") return allEmails;
    return allEmails.filter(email => normalizeCategory(email.category) === currentCategory);
}

function createEmailCard(email, index) {
    const card = document.createElement("article");
    card.className = "email-card";
    card.dataset.category = normalizeCategory(email.category);

    const sender = email.sender || "Unknown sender";
    const subject = email.subject || "No subject";
    const date = email.date || "Recent";
    const summary = email.summary || "No summary available.";
    const action = email.action || "No action required";
    const deadline = email.deadline || "No deadline";
    const category = normalizeCategory(email.category);

    card.innerHTML = `
        <div class="email-card-header">
            <div class="email-heading">
                <div class="email-sender">${escapeHTML(sender)}</div>
                <div class="email-subject">${escapeHTML(subject)}</div>
            </div>
            <button class="remove-btn" type="button" aria-label="Dismiss email">Dismiss</button>
        </div>
        <div class="email-date">${escapeHTML(date)}</div>
        <div class="email-category">${escapeHTML(category)}</div>
        <div class="email-summary">
            <strong>AI Summary</strong>
            <p class="summary-text">${escapeHTML(summary)}</p>
        </div>
        <div class="email-action">
            <strong>Action Required</strong>
            <p class="action-text">${escapeHTML(action)}</p>
        </div>
        <div class="email-deadline">
            <strong>Deadline</strong>
            <p class="deadline-text">${escapeHTML(deadline)}</p>
        </div>
    `;

    const removeBtn = card.querySelector(".remove-btn");
    if (removeBtn) {
        removeBtn.addEventListener("click", () => {
            const idx = allEmails.indexOf(email);
            if (idx !== -1) allEmails.splice(idx, 1);
            card.classList.add("removing");
            setTimeout(renderEmails, 300);
        });
    }

    card.style.animationDelay = `${index * 60}ms`;
    return card;
}

// =========================================================
// 7. CATEGORY FILTERS & HELPERS
// =========================================================

if (categoryFilter) {
    categoryFilter.addEventListener("click", (event) => {
        const button = event.target.closest(".category-btn");
        if (!button) return;
        currentCategory = normalizeFilterCategory(button.dataset.category);
        updateFilterButtons();
        renderEmails();
    });
}

function updateFilterButtons() {
    if (!categoryFilter) return;
    categoryFilter.querySelectorAll(".category-btn").forEach((button) => {
        const active = normalizeFilterCategory(button.dataset.category) === currentCategory;
        button.classList.toggle("active", active);
        button.setAttribute("aria-pressed", String(active));
    });
}

function updateResultCount(count) {
    if (!resultCount) return;
    const total = allEmails.length;
    resultCount.textContent = currentCategory === "All"
        ? `${total} ${total === 1 ? "email" : "emails"} summarized`
        : `${count} of ${total} emails`;
}

function showEmptyState(title, message) {
    if (!emailContainer) return;
    emailContainer.innerHTML = `
        <div class="empty-state">
            <div class="empty-icon">✦</div>
            <h3>${escapeHTML(title)}</h3>
            <p>${escapeHTML(message)}</p>
        </div>
    `;
}

function showError(message) {
    if (results) showElement(results);
    if (emailContainer) {
        emailContainer.innerHTML = `
            <div class="empty-state error-state">
                <div class="empty-icon">!</div>
                <h3>Processing Error</h3>
                <p>${escapeHTML(message)}</p>
                <button class="retry-btn" type="button" id="retry-btn">Try again</button>
            </div>
        `;
        const retryBtn = document.getElementById("retry-btn");
        if (retryBtn) retryBtn.addEventListener("click", runDemoSummarize);
    }
}

function getFriendlyError(error) {
    const message = error?.message || String(error);
    const lower = message.toLowerCase();
    if (lower.includes("quota") || lower.includes("429")) return "Gemini is temporarily rate-limited. Please try again shortly.";
    if (lower.includes("failed to fetch")) return "Unable to reach the Render backend. Check server deployment.";
    return message;
}

function normalizeCategory(category) {
    if (!category) return "Information";
    const val = String(category).trim().toLowerCase();
    if (val.includes("action")) return "Action Required";
    if (val.includes("important")) return "Important";
    return "Information";
}

function normalizeFilterCategory(category) {
    if (["Action Required", "Important", "Information"].includes(category)) return category;
    return "All";
}

async function parseJSON(response) {
    try { return await response.json(); } catch { return {}; }
}

function showElement(el) { if (el) el.classList.remove("is-hidden"); }
function hideElement(el) { if (el) el.classList.add("is-hidden"); }
function scrollToResults() {
    if (results) setTimeout(() => results.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
}
function escapeHTML(str) {
    const div = document.createElement("div");
    div.textContent = String(str ?? "");
    return div.innerHTML;
}
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

// Initialize
if (progressBar) progressBar.value = 0;
updateFilterButtons();
console.log("Trove client active.");