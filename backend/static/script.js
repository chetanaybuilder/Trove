// =========================================================
// TROVE — FRONTEND
// Gmail + Gemini + PostgreSQL Dashboard
// =========================================================


// =========================================================
// 1. ELEMENTS
// =========================================================

const menuBtn =
    document.getElementById("menu-btn");

const mainNav =
    document.getElementById("main-nav");

const googleLogin =
    document.getElementById("google-login");

const summarizeBtn =
    document.getElementById("summarize-btn");

const loggedIn =
    document.getElementById("logged-in");

const processing =
    document.getElementById("processing");

const results =
    document.getElementById("results");

const progressBar =
    document.getElementById("progress-bar");

const progressText =
    document.getElementById("progress-text");

const resultCount =
    document.getElementById("result-count");

const categoryFilter =
    document.getElementById("category-filter");

const emailContainer =
    document.getElementById("email-container");


// =========================================================
// 2. STATE
// =========================================================

let allEmails = [];

let currentCategory = "All";

let progressTimer = null;


// =========================================================
// 3. MOBILE MENU
// =========================================================

if (menuBtn && mainNav) {

    menuBtn.addEventListener(
        "click",
        () => {

            const isOpen =
                mainNav.classList.toggle(
                    "mobile-open"
                );


            menuBtn.setAttribute(
                "aria-expanded",
                String(isOpen)
            );

        }
    );


    mainNav.querySelectorAll("a")
        .forEach((link) => {

            link.addEventListener(
                "click",
                () => {

                    mainNav.classList.remove(
                        "mobile-open"
                    );

                    menuBtn.setAttribute(
                        "aria-expanded",
                        "false"
                    );

                }
            );

        });

}


// =========================================================
// 4. GOOGLE LOGIN FEEDBACK
// =========================================================

if (googleLogin) {

    googleLogin.addEventListener(
        "click",
        () => {

            googleLogin.classList.add(
                "loading"
            );


            googleLogin.textContent =
                "Connecting...";

        }
    );

}


// =========================================================
// 5. SUMMARIZE BUTTON
// =========================================================

if (summarizeBtn) {

    summarizeBtn.addEventListener(
        "click",
        summarizeEmails
    );

}


// =========================================================
// 6. SUMMARIZE
// =========================================================

async function summarizeEmails() {

    if (!summarizeBtn) return;


    setLoadingState(true);


    try {

        const response =
            await fetch(
                "/summarize",
                {
                    method: "POST",
                    headers: {
                        "Content-Type":
                            "application/json"
                    }
                }
            );


        const data =
            await parseJSON(response);


        if (!response.ok) {

            throw new Error(
                data.error ||
                `Server error: ${response.status}`
            );

        }


        if (data.error) {

            throw new Error(
                data.error
            );

        }


        finishProgress();


        await sleep(350);


        allEmails =
            Array.isArray(data.emails)
                ? data.emails
                : [];


        currentCategory =
            "All";


        updateFilterButtons();


        renderEmails();


        showElement(results);


        scrollToResults();


    } catch (error) {

        console.error(
            "Trove error:",
            error
        );


        showError(
            getFriendlyError(error)
        );

    } finally {

        setLoadingState(false);

    }

}


// =========================================================
// 7. LOADING STATE
// =========================================================

function setLoadingState(
    loading
) {

    if (loading) {

        if (loggedIn) {

            hideElement(loggedIn);

        }


        if (results) {

            hideElement(results);

        }


        if (processing) {

            showElement(processing);

        }


        summarizeBtn.disabled =
            true;


        summarizeBtn.innerHTML =
            "<span>✦</span> Analyzing...";


        startProgress();

    } else {

        stopProgress();


        if (processing) {

            hideElement(processing);

        }


        if (loggedIn) {

            showElement(loggedIn);

        }


        summarizeBtn.disabled =
            false;


        summarizeBtn.innerHTML =
            "<span>✦</span> Analyze latest emails";

    }

}


// =========================================================
// 8. PROGRESS
// =========================================================

function startProgress() {

    stopProgress();


    if (!progressBar) return;


    progressBar.value =
        8;


    if (progressText) {

        progressText.textContent =
            "Connecting to Gmail...";

    }


    const stages = [
        {
            value: 20,
            text: "Reading your emails..."
        },
        {
            value: 42,
            text: "Preparing email content..."
        },
        {
            value: 63,
            text: "Trove is thinking..."
        },
        {
            value: 78,
            text: "Building your inbox..."
        },
        {
            value: 88,
            text: "Almost there..."
        }
    ];


    let stage = 0;


    progressTimer =
        setInterval(
            () => {

                if (
                    stage >=
                    stages.length
                ) {

                    return;

                }


                progressBar.value =
                    stages[stage].value;


                if (progressText) {

                    progressText.textContent =
                        stages[stage].text;

                }


                stage++;

            },
            900
        );

}


// =========================================================
// 9. FINISH PROGRESS
// =========================================================

function finishProgress() {

    stopProgress();


    if (progressBar) {

        progressBar.value =
            100;

    }


    if (progressText) {

        progressText.textContent =
            "Analysis complete.";

    }

}


// =========================================================
// 10. STOP PROGRESS
// =========================================================

function stopProgress() {

    if (progressTimer) {

        clearInterval(
            progressTimer
        );

        progressTimer =
            null;

    }

}


// =========================================================
// 11. RENDER EMAILS
// =========================================================

function renderEmails() {

    if (!emailContainer) return;


    emailContainer.innerHTML =
        "";


    const filteredEmails =
        getFilteredEmails();


    updateResultCount(
        filteredEmails.length
    );


    if (allEmails.length === 0) {

        showEmptyState(
            "Your inbox is clear",
            "Trove didn't find any emails to summarize."
        );

        return;

    }


    if (filteredEmails.length === 0) {

        showEmptyState(
            "Nothing in this category",
            "Try another category filter."
        );

        return;

    }


    filteredEmails.forEach(
        (email, index) => {

            const card =
                createEmailCard(
                    email,
                    index
                );


            emailContainer.appendChild(
                card
            );

        }
    );

}


// =========================================================
// 12. FILTERED EMAILS
// =========================================================

function getFilteredEmails() {

    if (
        currentCategory ===
        "All"
    ) {

        return allEmails;

    }


    return allEmails.filter(
        (email) => {

            return normalizeCategory(
                email.category
            ) === currentCategory;

        }
    );

}


// =========================================================
// 13. CREATE EMAIL CARD
// =========================================================

function createEmailCard(
    email,
    index
) {

    const card =
        document.createElement(
            "article"
        );


    card.className =
        "email-card";


    card.dataset.id =
        email.id || "";


    card.dataset.category =
        normalizeCategory(
            email.category
        );


    const sender =
        email.sender ||
        "Unknown sender";


    const subject =
        email.subject ||
        "No subject";


    const date =
        email.date ||
        "";


    const summary =
        email.summary ||
        "No summary available.";


    const action =
        email.action ||
        "No action required";


    const deadline =
        email.deadline ||
        "No deadline";


    const category =
        normalizeCategory(
            email.category
        );


    card.innerHTML = `

        <div class="email-card-header">

            <div class="email-heading">

                <div class="email-sender">
                    ${escapeHTML(sender)}
                </div>

                <div class="email-subject">
                    ${escapeHTML(subject)}
                </div>

            </div>


            <button
                class="remove-btn"
                type="button"
                aria-label="Remove ${escapeHTML(subject)}"
            >
                Remove
            </button>

        </div>


        <div class="email-date">
            ${escapeHTML(date)}
        </div>


        <div class="email-category">
            ${escapeHTML(category)}
        </div>


        <div class="email-summary">

            <strong>
                AI Summary
            </strong>

            <p class="summary-text">
                ${escapeHTML(summary)}
            </p>

        </div>


        <div class="email-action">

            <strong>
                Action
            </strong>

            <p class="action-text">
                ${escapeHTML(action)}
            </p>

        </div>


        <div class="email-deadline">

            <strong>
                Deadline
            </strong>

            <p class="deadline-text">
                ${escapeHTML(deadline)}
            </p>

        </div>

    `;


    const removeBtn =
        card.querySelector(
            ".remove-btn"
        );


    if (removeBtn) {

        removeBtn.addEventListener(
            "click",
            () => {

                removeEmail(
                    card,
                    email
                );

            }
        );

    }


    card.style.animationDelay =
        `${index * 70}ms`;


    return card;

}


// =========================================================
// 14. REMOVE EMAIL
// =========================================================

async function removeEmail(
    card,
    email
) {

    if (
        !card ||
        card.classList.contains(
            "removing"
        )
    ) {

        return;

    }


    const summaryId =
        email.id;


    if (!summaryId) {

        removeLocalEmail(
            card,
            email
        );

        return;

    }


    const removeBtn =
        card.querySelector(
            ".remove-btn"
        );


    if (removeBtn) {

        removeBtn.disabled =
            true;

        removeBtn.textContent =
            "Removing...";

    }


    try {

        const response =
            await fetch(
                `/summaries/${summaryId}`,
                {
                    method: "DELETE"
                }
            );


        const data =
            await parseJSON(response);


        if (!response.ok) {

            throw new Error(
                data.error ||
                "Could not remove summary."
            );

        }


        removeLocalEmail(
            card,
            email
        );


    } catch (error) {

        console.error(
            error
        );


        if (removeBtn) {

            removeBtn.disabled =
                false;

            removeBtn.textContent =
                "Remove";

        }

    }

}


// =========================================================
// 15. LOCAL REMOVE + ANIMATION
// =========================================================

function removeLocalEmail(
    card,
    email
) {

    const index =
        allEmails.indexOf(
            email
        );


    if (index !== -1) {

        allEmails.splice(
            index,
            1
        );

    }


    card.classList.add(
        "removing"
    );


    setTimeout(
        () => {

            renderEmails();

        },
        350
    );

}


// =========================================================
// 16. CATEGORY FILTER
// =========================================================

if (categoryFilter) {

    categoryFilter.addEventListener(
        "click",
        (event) => {

            const button =
                event.target.closest(
                    ".category-btn"
                );


            if (!button) return;


            currentCategory =
                normalizeFilterCategory(
                    button.dataset.category
                );


            updateFilterButtons();


            renderEmails();

        }
    );

}


// =========================================================
// 17. UPDATE FILTER BUTTONS
// =========================================================

function updateFilterButtons() {

    if (!categoryFilter) return;


    categoryFilter
        .querySelectorAll(
            ".category-btn"
        )
        .forEach(
            (button) => {

                const active =
                    normalizeFilterCategory(
                        button.dataset.category
                    ) ===
                    currentCategory;


                button.classList.toggle(
                    "active",
                    active
                );


                button.setAttribute(
                    "aria-pressed",
                    String(active)
                );

            }
        );

}


// =========================================================
// 18. RESULT COUNT
// =========================================================

function updateResultCount(
    count
) {

    if (!resultCount) return;


    const total =
        allEmails.length;


    if (
        currentCategory ===
        "All"
    ) {

        resultCount.textContent =
            `${total} ${
                total === 1
                    ? "email"
                    : "emails"
            } summarized`;

        return;

    }


    resultCount.textContent =
        `${count} of ${total} emails`;

}


// =========================================================
// 19. EMPTY STATE
// =========================================================

function showEmptyState(
    title,
    message
) {

    if (!emailContainer) return;


    emailContainer.innerHTML = `

        <div class="empty-state">

            <div class="empty-icon">
                ✦
            </div>

            <h3>
                ${escapeHTML(title)}
            </h3>

            <p>
                ${escapeHTML(message)}
            </p>

        </div>

    `;

}


// =========================================================
// 20. ERROR
// =========================================================

function showError(
    message
) {

    if (results) {

        showElement(results);

    }


    if (emailContainer) {

        emailContainer.innerHTML = `

            <div class="empty-state error-state">

                <div class="empty-icon">
                    !
                </div>

                <h3>
                    Something went wrong
                </h3>

                <p>
                    ${escapeHTML(message)}
                </p>

                <button
                    class="retry-btn"
                    type="button"
                    id="retry-btn"
                >
                    Try again
                </button>

            </div>

        `;


        const retryBtn =
            document.getElementById(
                "retry-btn"
            );


        if (retryBtn) {

            retryBtn.addEventListener(
                "click",
                summarizeEmails
            );

        }

    }


    if (resultCount) {

        resultCount.textContent =
            "Unable to analyze inbox";

    }

}


// =========================================================
// 21. FRIENDLY ERRORS
// =========================================================

function getFriendlyError(
    error
) {

    const message =
        error?.message ||
        String(error);


    const lower =
        message.toLowerCase();


    if (
        lower.includes("quota") ||
        lower.includes("429") ||
        lower.includes("resource_exhausted")
    ) {

        return (
            "Gemini is temporarily rate-limited. "
            + "Please try again later."
        );

    }


    if (
        lower.includes("401") ||
        lower.includes("not logged in") ||
        lower.includes("session")
    ) {

        return (
            "Your Google session has expired. "
            + "Please log in again."
        );

    }


    if (
        lower.includes("403")
    ) {

        return (
            "Google denied Gmail access. "
            + "Please check the permissions."
        );

    }


    if (
        lower.includes("failed to fetch")
    ) {

        return (
            "Trove couldn't connect to Flask. "
            + "Make sure the server is running."
        );

    }


    return message;

}


// =========================================================
// 22. NORMALIZE CATEGORY
// =========================================================

function normalizeCategory(
    category
) {

    if (!category) {

        return "Information";

    }


    const value =
        String(category)
            .trim()
            .toLowerCase();


    if (
        value.includes("action")
    ) {

        return "Action Required";

    }


    if (
        value.includes("important")
    ) {

        return "Important";

    }


    return "Information";

}


// =========================================================
// 23. FILTER NORMALIZER
// =========================================================

function normalizeFilterCategory(
    category
) {

    if (
        category ===
        "Action Required"
    ) {

        return "Action Required";

    }


    if (
        category ===
        "Important"
    ) {

        return "Important";

    }


    if (
        category ===
        "Information"
    ) {

        return "Information";

    }


    return "All";

}


// =========================================================
// 24. LOAD SAVED SUMMARIES
// =========================================================

async function loadSavedSummaries() {

    if (
        !emailContainer ||
        !results
    ) {

        return;

    }


    try {

        const response =
            await fetch(
                "/summaries"
            );


        if (!response.ok) {

            return;

        }


        const data =
            await parseJSON(response);


        if (
            !Array.isArray(
                data.emails
            )
        ) {

            return;

        }


        allEmails =
            data.emails;


        if (allEmails.length > 0) {

            updateFilterButtons();

            renderEmails();

            showElement(results);

        }

    } catch (error) {

        console.error(
            "Could not load saved summaries:",
            error
        );

    }

}


// =========================================================
// 25. JSON PARSER
// =========================================================

async function parseJSON(
    response
) {

    try {

        return await response.json();

    } catch {

        return {};

    }

}


// =========================================================
// 26. UI HELPERS
// =========================================================

function showElement(
    element
) {

    if (!element) return;

    element.classList.remove(
        "is-hidden"
    );

}


function hideElement(
    element
) {

    if (!element) return;

    element.classList.add(
        "is-hidden"
    );

}


// =========================================================
// 27. SCROLL
// =========================================================

function scrollToResults() {

    if (!results) return;


    setTimeout(
        () => {

            results.scrollIntoView({
                behavior: "smooth",
                block: "start"
            });

        },
        100
    );

}


// =========================================================
// 28. HTML ESCAPE
// =========================================================

function escapeHTML(
    value
) {

    const div =
        document.createElement(
            "div"
        );


    div.textContent =
        String(
            value ?? ""
        );


    return div.innerHTML;

}


// =========================================================
// 29. SLEEP
// =========================================================

function sleep(
    milliseconds
) {

    return new Promise(
        (resolve) => {

            setTimeout(
                resolve,
                milliseconds
            );

        }
    );

}


// =========================================================
// 30. KEYBOARD ACCESSIBILITY
// =========================================================

document.addEventListener(
    "keydown",
    (event) => {

        if (
            event.key === "Escape"
            &&
            mainNav
        ) {

            mainNav.classList.remove(
                "mobile-open"
            );


            if (menuBtn) {

                menuBtn.setAttribute(
                    "aria-expanded",
                    "false"
                );

            }

        }

    }
);


// =========================================================
// 31. INITIALIZATION
// =========================================================

function initialize() {

    updateFilterButtons();


    if (progressBar) {

        progressBar.value =
            0;

    }


    loadSavedSummaries();


    console.log(
        "Trove frontend loaded successfully."
    );

}


initialize();