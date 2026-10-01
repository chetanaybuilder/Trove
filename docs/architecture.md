# Trove Architecture

Trove uses a React frontend and Node.js Express backend with PostgreSQL.

## Data Flow
1. Document Upload -> Client -> Server
2. Express Rate Limit & Queue -> Pipeline -> LLM
3. Server-Sent Events stream progress to Client
4. Insights saved to PostgreSQL