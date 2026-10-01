<div align="center">

# 🏛️ Trove

**Your intelligent knowledge vault. Turn sprawling documents into crisp, organized insights.**

[![React](https://img.shields.io/badge/React-18-blue?logo=react&logoColor=white)](#)
[![Node.js](https://img.shields.io/badge/Node.js-18-green?logo=nodedotjs&logoColor=white)](#)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-336791?logo=postgresql&logoColor=white)](#)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.0-38B2AC?logo=tailwind-css&logoColor=white)](#)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![CI](https://github.com/chetanaybuilder/Trove/actions/workflows/ci.yml/badge.svg)](https://github.com/chetanaybuilder/Trove/actions/workflows/ci.yml)
[![Render](https://img.shields.io/badge/Deployed_on-Render-black?logo=render)](#)

[**Live Demo**](https://trove-1-t2nv.onrender.com) · [**Report a Bug**](https://github.com/chetanaybuilder/Trove/issues) · [**Request Feature**](https://github.com/chetanaybuilder/Trove/issues)

</div>

<hr/>

## 🌟 Why Trove?

Trove is built to solve information overload. Whether you're reviewing a 50-page financial report, digesting academic papers, or synthesizing meeting transcripts, Trove automatically extracts the signal from the noise. It doesn't just summarize—it structures, chunks, and organizes data into a highly readable, interactive format. 

## ✨ Features

| Feature | Description |
| :--- | :--- |
| 📄 **Smart Ingestion** | Upload PDFs or paste raw text. Trove parses it instantly. |
| 🧠 **AI Synthesis** | Deep integration with Groq LLM to chunk, analyze, and structure long documents. |
| 💬 **Contextual Q&A** | Chat with your document directly. Grounded answers with evidence tracking. |
| 📊 **Real-time Progress** | Server-Sent Events (SSE) keep you updated on the analysis pipeline. |
| 🛡️ **Resilient Architecture** | Built-in rate limiting, graceful degradation (`LLM_DISABLED` mode), and concurrency limits. |

## 📸 Screenshots

*Note: Add actual screenshots to `docs/screenshots/`.*

| Dashboard | Document Analysis |
|:---:|:---:|
| <img src="docs/screenshots/dashboard-placeholder.png" alt="Dashboard View" width="400"/> | <img src="docs/screenshots/analysis-placeholder.png" alt="Analysis View" width="400"/> |

<details>
<summary><b>📹 View Demo GIF</b></summary>
<img src="docs/screenshots/demo-placeholder.gif" alt="Trove Demo"/>
</details>

## 🛠️ Tech Stack

| Domain | Technology |
|---|---|
| **Frontend** | React, Vite, Tailwind CSS |
| **Backend** | Node.js, Express.js |
| **Database** | PostgreSQL (`pg`), Knex (Migrations) |
| **AI / LLM** | Groq (Llama 3), structured JSON generation |
| **Auth** | Google OAuth 2.0 |

---

## 🏛️ Architecture

### System Flow
```mermaid
graph TD
    Client[React Client] -->|Upload Document| API[Express API]
    API --> RateLimit[Rate Limiting & Auth]
    RateLimit --> Queue[Bounded Job Queue]
    Queue --> Pipeline[Processing Pipeline]
    Pipeline --> LLM[Groq LLM Service]
    LLM --> Pipeline
    Pipeline -.->|SSE Progress| Client
    Pipeline --> DB[(PostgreSQL)]
    DB --> Client
```

### AI Insights Sequence
```mermaid
sequenceDiagram
    actor User
    participant Client
    participant Server
    participant DB
    participant LLM

    User->>Client: Uploads PDF
    Client->>Server: POST /api/analyze
    Server->>DB: Save Document Metadata
    Server->>LLM: Stream chunks & request JSON
    loop Processing
        LLM-->>Server: JSON chunks
        Server-->>Client: SSE Progress Update
    end
    Server->>DB: Save Final Report
    Server-->>Client: Analysis Complete
    Client->>User: Displays Report
```

## 📂 Folder Structure

```text
.
├── client/          # React Vite application
│   └── src/         # Frontend components, pages, hooks
├── server/          # Express backend application
│   ├── routes/      # API Endpoints
│   ├── controllers/ # Request handlers
│   ├── services/    # Business logic (AI, DB)
│   ├── middleware/  # Auth, Error Handling, Rate Limiting
│   └── config/      # Environment variables & constants
├── migrations/      # PostgreSQL schema setup
├── docs/            # Architecture & API documentation
├── scripts/         # Utility scripts (e.g., db migrations)
└── tests/           # Test suites
```

## 🚀 Quick Start

### 1. Clone the repo
```bash
git clone https://github.com/chetanaybuilder/Trove.git
cd Trove
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Environment Variables
Copy `.env.example` to `.env` and fill in your keys:
```env
PORT=8787
DATABASE_URL=postgres://user:pass@localhost:5432/trove
SESSION_SECRET=your_secret_here
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GROQ_API_KEY=your_groq_api_key
```
*(See `.env.example` for full list including `LLM_DISABLED` options)*

### 4. Database Setup
```bash
node scripts/migrate.js
```

### 5. Run the Application
```bash
# Start frontend & backend concurrently
npm run dev
```

---

## 📖 API Reference

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/extract-pdf` | Parses raw PDF to text |
| `POST` | `/api/analyze` | Initiates analysis & streams SSE progress |
| `GET` | `/api/reports` | Lists user's reports |
| `GET` | `/api/reports/:id` | Fetches a full report by ID |
| `POST` | `/api/reports/:id/ask`| Ask questions grounded in document context |

## ☁️ Deployment (Render)

Trove is configured for seamless deployment on [Render](https://render.com). 
1. Connect your repository.
2. Render uses `render.yaml` as the blueprint.
3. The build command is `npm install && npm run build`.
4. Start command is `npm start`.
*Ensure all environment variables from your `.env` are mirrored in the Render dashboard.*

## 🔒 Security
Please review our [SECURITY.md](SECURITY.md) for vulnerability reporting.
- Helmet JS is enabled for secure HTTP headers.
- Requests are strictly rate-limited and size-limited.
- Authentication sessions are signed via HMAC.

## 🗺️ Roadmap
- [ ] Migrate to TypeScript
- [ ] Add Redis for distributed caching & pub/sub
- [ ] Support DOCX and Excel ingestion
- [ ] Add comprehensive test coverage (Jest / Cypress)

## 🤝 Contributing
Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) for details on our code of conduct and the process for submitting pull requests.

## 📄 License
This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---
<div align="center">
  <b>Built by <a href="https://github.com/chetanaybuilder">Chetanay Batra</a></b><br/>
  Senior Full-Stack Engineer & AI Enthusiast
</div>
