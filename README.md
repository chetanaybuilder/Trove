# ✦ Trove

> AI-powered Gmail intelligence that turns inbox noise into clear, actionable summaries.

---

## Overview

**Trove** is a full-stack web application designed to reduce email fatigue by processing unread and recent inbox data into structured, actionable intelligence. Instead of manually parsing dense email threads, users authenticate with their Google account to retrieve recent emails, analyze them via Google Gemini, extract key deadlines and action items, categorize each message, and persist the structured summaries to a PostgreSQL database.

This project was built as a portfolio project to demonstrate end-to-end software engineering capabilities—including OAuth 2.0 authentication flows, third-party API orchestration, relational database persistence, decoupled client-server architecture, and production cloud deployments.

---

## Live Demo

| Component | Platform | URL |
| :--- | :--- | :--- |
| **Frontend Client** | Vercel | https://trove-mocha.vercel.app/
| **Backend API Service** | Render | [https://trove-backend-ea57.onrender.com](https://trove-backend-ea57.onrender.com) |

> *Note: The backend service handles authentication handshakes, API integrations, and database operations. It is not intended as a standalone public API.*

---

## Core Features

- **Google OAuth 2.0 Authentication:** Secure authorization flow enabling users to sign in with their Google credentials.
- **Read-Only Gmail Integration:** Scoped integration that fetches recent inbox messages without modifying mailbox contents.
- **Gemini-Powered Intelligence:** Automated analysis of raw email bodies using Google's Gemini models.
- **Structured Extraction:**
  - **Core Summary:** Concise recap of the email's primary message.
  - **Action Items:** Concrete tasks required from the user.
  - **Deadlines:** Temporal commitments and due dates identified within the text.
- **Automatic Categorization:** Automatically classifies parsed messages into one of three buckets:
  - `Action Required`
  - `Important`
  - `Information`
- **PostgreSQL Persistence:** Stores extracted summaries, metadata, and categories in a managed PostgreSQL instance.
- **Summary Management:** Client interface allowing users to view previously processed summaries and remove saved records.
- **Responsive UI:** Clean, modern interface built using vanilla web standards.
- **Decoupled Deployment:** Fully separated frontend and backend environments deployed across independent hosting providers.

---

## How It Works

```
1. User Access ────► 2. OAuth Consent ────► 3. Token Exchange
   (Frontend)           (Google Cloud)         (Flask Backend)
                                                      │
                                                      ▼
6. UI Render   ◄──── 5. DB Persist    ◄──── 4. Ingestion & LLM Processing
   (Saved Cards)        (PostgreSQL)           (Gmail API + Gemini API)
```

1. **Client Initiation:** The user visits the frontend application hosted on Vercel and initiates the Google login process.
2. **Authorization:** The user is redirected to Google's consent screen, granting read-only access to Gmail.
3. **Token Exchange:** Google redirects back to the Flask backend's callback endpoint, where authorization codes are securely exchanged for access tokens.
4. **Email Retrieval:** The backend queries the Gmail API to retrieve the user's recent messages.
5. **LLM Analysis:** Message payloads are processed through the Google Gemini API to extract key points, actionable requirements, deadlines, and a category classification.
6. **Persistence:** The parsed, structured output is committed to the Supabase PostgreSQL database.
7. **Client Rendering:** The frontend consumes the backend REST endpoints to fetch, display, and manage the processed summaries.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     Client Browser                      │
└────────────────────────────┬────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────┐
│                     Vercel Hosting                      │
│            Frontend (HTML5 / CSS3 / Vanilla JS)         │
└────────────────────────────┬────────────────────────────┘
                             │
                             │ HTTPS API Requests
                             ▼
┌─────────────────────────────────────────────────────────┐
│                     Render Hosting                      │
│                  Flask / Gunicorn Backend               │
└───────┬───────────────────┬───────────────────┬─────────┘
        │                   │                   │
        ▼                   ▼                   ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│ Google OAuth  │   │   Gmail API   │   │  Gemini API   │
│ (Auth & Scope)│   │ (Read Emails) │   │  (Inference)  │
└───────────────┘   └───────────────┘   └───────────────┘
                            │
                            ▼
            ┌───────────────────────────────┐
            │      Supabase PostgreSQL      │
            │   (Structured Persistence)    │
            └───────────────────────────────┘
```

### Component Responsibilities

- **Frontend (Vercel):** Serves static assets (HTML/CSS/JS), manages client-side UI states, issues asynchronous fetch requests to the backend, and handles user interactions for viewing and deleting records.
- **Flask Backend (Render):** Acts as the central orchestrator running on Gunicorn. Handles OAuth redirects, securely communicates with Google APIs, structures prompts for Gemini, and handles database operations.
- **Google OAuth 2.0:** Issues identity verification and scoped access tokens for Gmail integration.
- **Gmail API:** Provides read-only access to query and fetch message metadata and message bodies.
- **Google Gemini API:** Ingests unstructured email text and returns structured summaries, categories, actions, and dates.
- **Supabase (PostgreSQL):** Relational database storing user-specific parsed email records, metadata, and processing timestamps.

---

## Tech Stack

| Technology | Purpose |
| :--- | :--- |
| **HTML5** | Semantic structure for the client-side user interface |
| **CSS3** | Responsive layouts, CSS variables, and modern styling |
| **Vanilla JavaScript** | DOM manipulation, state handling, and asynchronous API calls |
| **Python** | Core backend language |
| **Flask** | Lightweight WSGI web framework and API routing |
| **Gunicorn** | Production-grade WSGI HTTP server for Python |
| **PostgreSQL** | Relational database engine for structured data persistence |
| **Supabase** | Cloud-hosted managed PostgreSQL database platform |
| **Google OAuth 2.0** | Authentication and scoped API authorization protocol |
| **Gmail API** | RESTful access to retrieve raw user email data |
| **Google Gemini API** | LLM inference for text summarization, categorization, and entity extraction |
| **Vercel** | Edge hosting platform for the frontend client |
| **Render** | Cloud application platform hosting the backend container |
| **Git / GitHub** | Version control, branch management, and codebase repository |

---

## Project Structure

```
Trove/
├── backend/
│   ├── app.py              # Main Flask application entry point & route definitions
│   ├── requirements.txt    # Python dependencies
│   └── ...
├── frontend/
│   ├── index.html          # Main application interface markup
│   ├── style.css           # Global stylesheets and layout rules
│   └── script.js           # Client-side API fetching and UI event listeners
├── .gitignore              # Ignored files (virtual environments, keys, cache)
└── README.md               # Technical project documentation
```

---

## Local Development

### Prerequisites

Ensure you have the following installed and configured:
- **Python 3.8+**
- A **Google Cloud Console Project** with:
  - **Gmail API** enabled
  - **OAuth 2.0 Client ID** and secret generated
- A **Google Gemini API Key**
- A running **PostgreSQL** instance (local or hosted via Supabase)

### 1. Clone the Repository

```bash
git clone [https://github.com/YOUR-USERNAME/YOUR-REPOSITORY.git](https://github.com/YOUR-USERNAME/YOUR-REPOSITORY.git)
cd YOUR-REPOSITORY
```

### 2. Set Up Virtual Environment

**macOS / Linux:**
```bash
python -m venv .venv
source .venv/bin/activate
```

**Windows:**
```bash
python -m venv .venv
.venv\Scripts\activate
```

### 3. Install Dependencies

```bash
pip install -r backend/requirements.txt
```

### 4. Configure Environment Variables

Create a `.env` file inside the `backend/` directory (or set them in your local environment shell):

```env
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_REDIRECT_URI=[http://127.0.0.1:5000/login/callback](http://127.0.0.1:5000/login/callback)
GEMINI_API_KEY=your_gemini_api_key
DATABASE_URL=your_postgresql_connection_string
FLASK_SECRET_KEY=your_secret_key
```

> ⚠️ **CRITICAL SECURITY NOTE:** Never commit real secrets, API keys, OAuth credentials, database passwords, or `.env` files to your Git repository.

### 5. Run the Backend Application

Run the application using Python:

```bash
python backend/app.py
```

The backend server will start locally at:
```
[http://127.0.0.1:5000](http://127.0.0.1:5000)
```

### 6. Run the Frontend

Open `frontend/index.html` directly in your browser or serve it using a local static file server (such as the VS Code Live Server extension or `python -m http.server`).

---

## Environment Variables

| Variable | Description |
| :--- | :--- |
| `GOOGLE_CLIENT_ID` | OAuth 2.0 Client ID obtained from the Google Cloud Console. |
| `GOOGLE_CLIENT_SECRET` | OAuth 2.0 Client Secret obtained from the Google Cloud Console. |
| `GOOGLE_REDIRECT_URI` | Authorized redirect URI for receiving Google OAuth authorization codes. |
| `GEMINI_API_KEY` | API key used to authenticate requests to the Google Gemini LLM. |
| `DATABASE_URL` | PostgreSQL connection string including host, user, password, and port. |
| `FLASK_SECRET_KEY` | Cryptographic key used by Flask for signing session cookies. |

---

## Google OAuth Configuration

To permit authentication, the callback URI configured in your code must match the authorized redirect URI registered in your **Google Cloud Console** under **APIs & Services > Credentials > OAuth 2.0 Client IDs**.

- **Local Development URI:**
  ```
  [http://127.0.0.1:5000/login/callback](http://127.0.0.1:5000/login/callback)
  ```
- **Production URI:**
  ```
  [https://trove-backend-ea57.onrender.com/login/callback](https://trove-backend-ea57.onrender.com/login/callback)
  ```

> *Both paths must be explicitly whitelisted in the Google Cloud dashboard to prevent `redirect_uri_mismatch` errors during authentication handshakes.*

---

## Database

Trove utilizes **PostgreSQL** for persistence, hosted via **Supabase**.

- **Persistence Layer:** Stores processed metadata including email subject, original sender, generated summary, category tag, extracted actions, detected deadlines, and processing timestamps.
- **State Restoration:** When users revisit the dashboard, the frontend queries the database through the backend to display previously saved summaries without re-running the Gemini LLM.
- **Deletion:** Provides endpoints to remove specific stored summary records from the table.
- **Security:** The database is not exposed directly to the public internet; all queries are parameterized and executed server-side via the Flask backend using credentials defined in `DATABASE_URL`.

---

## Deployment

```
Frontend (Vercel) ──────► HTTPS ──────► Backend (Render) ──────► Supabase (PostgreSQL)
```

- **Frontend on Vercel:** Hosted as a decoupled static web application delivering minimal latency with automatic global CDN distribution.
- **Backend on Render:** Hosts the containerized Flask/Gunicorn application, managing the OAuth flow, external API handshakes, and secure database pool connections.
- **Database on Supabase:** Provides fully managed, serverless PostgreSQL storage.
- **Communication:** The frontend communicates with the backend exclusively over encrypted HTTPS requests.

---

## Security & Privacy

- **Read-Only Gmail Access:** Trove requests only read-level scopes (`gmail.readonly`). It does not request write, send, delete, or modify permissions.
- **Non-Destructive:** The application does not alter, archive, label, or delete existing emails in the user's Gmail mailbox.
- **Credential Hygiene:** API keys, database credentials, and OAuth secrets are injected purely through server-side environment variables and are excluded from source control via `.gitignore`.
- **Strict Redirects:** OAuth redirect endpoints are strictly validated and whitelist-bound to prevent open redirect vulnerabilities.
- **Isolation:** The client browser never interacts directly with the database; all database interactions are mediated and validated by the backend service.

---

## Current Status

| Component / Subsystem | Status |
| :--- | :--- |
| **Frontend Client (Vercel)** | 🟢 Live |
| **Backend API Service (Render)** | 🟢 Live |
| **Google OAuth 2.0 Flow** | 🟢 Working |
| **Gmail API Data Ingestion** | 🟢 Working |
| **Gemini LLM Analysis Engine** | 🟢 Working |
| **PostgreSQL Database Storage** | 🟢 Working |
| **Saved Summaries Management** | 🟢 Working |
| **Decoupled Cross-Origin Architecture** | 🟢 Working |

---

## Engineering Highlights

- **Multi-Party Authentication Handshake:** Implemented standard OAuth 2.0 flows, managing state verification, token acquisition, and session management between the browser, Flask, and Google Identity services.
- **API Orchestration:** Designed a synchronized backend pipeline that reads raw payloads from the Gmail REST API, pipes unstructured data into Google Gemini for parsing, and normalizes the JSON output for database insertion.
- **Stateless Client / Stateful Storage:** Created a lightweight Vanilla JavaScript frontend that handles asynchronous operations (`fetch` API), manages loading states, renders dynamic cards, and communicates with a REST backend.
- **Environment Parity & Deployment Management:** Successfully debugged and configured cross-origin resource sharing (CORS), environment variables, and distinct callback configurations between local development and production environments across Render and Vercel.

---

## What I Learned

Building Trove provided hands-on experience in architecting and shipping a real-world integrated application:

- **OAuth 2.0 Lifecycle:** Mastered the operational nuances of the OAuth 2.0 authorization code flow, handling token lifecycles, and managing granular permission scopes.
- **Third-Party API Integration:** Learned to handle real-world API rate limits, error states, and unstructured payload variations across Gmail API and Gemini LLM responses.
- **Relational Data Modeling:** Gained experience designing database schemas to store AI-derived outputs alongside raw metadata for quick retrieval and deletion.
- **Separation of Concerns:** Deepened understanding of building decoupled architectures—ensuring the frontend remains completely agnostic of backend internal logic and third-party API keys.
- **Production Troubleshooting:** Resolved real deployment challenges, including handling cold starts on cloud providers, configuring cross-origin headers, and ensuring consistent SSL/HTTPS execution across different platforms.

---

## Future Improvements

The following items are architectural and functional enhancements planned for future iterations:

- **Enhanced Classification Rules:** Finer-grained AI prompt tuning to improve categorization accuracy across edge-case emails (e.g., newsletters vs. automated system alerts).
- **Temporal Parsing Accuracy:** Implementing secondary validation pipelines to improve ambiguous deadline detection (e.g., distinguishing "by Friday" vs. explicit ISO dates).
- **Inbox Search & Filtering:** Adding client-side and database-level query filtering by category, sender, and date ranges.
- **Granular Retrieval Controls:** Allowing users to configure the specific number of emails to fetch and analyze per batch.
- **Comprehensive Error Boundaries:** Implementing more granular error feedback across both the backend pipeline and the user-facing UI.
- **Automated Testing & CI/CD:** Writing automated unit and integration tests (using `pytest`) and setting up GitHub Actions for continuous integration.
- **Accessibility Enhancements:** Further optimizing keyboard navigation and screen-reader accessibility across all UI components.

---

## License

This repository does not currently have an open-source license specified. All rights are reserved by the author.

---

## Author

**Chetanay Batra**  
A 16 years old future AI founder
