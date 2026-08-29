import os
import json
import base64
import re
from datetime import datetime, timezone

import psycopg2
from psycopg2.extras import RealDictCursor, Json

from flask import (
    Flask,
    render_template,
    redirect,
    url_for,
    session,
    jsonify,
    request
)

from dotenv import load_dotenv

from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request

from google import genai


# =========================================================
# ENVIRONMENT
# =========================================================

load_dotenv()

LOCAL_DEV = os.getenv("FLASK_ENV", "development") == "development"

if LOCAL_DEV:
    os.environ["OAUTHLIB_INSECURE_TRANSPORT"] = "1"


# =========================================================
# FLASK
# =========================================================

app = Flask(__name__)
app.secret_key = os.getenv("SECRET_KEY")

if not app.secret_key:
    raise RuntimeError("SECRET_KEY is missing from .env")

app.config.update(
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    SESSION_COOKIE_SECURE=not LOCAL_DEV,
)


# =========================================================
# GOOGLE CONFIGURATION (CLEAN / UNRESTRICTED SCOPES)
# =========================================================

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET")
GOOGLE_REDIRECT_URI = os.getenv(
    "GOOGLE_REDIRECT_URI",
    "http://127.0.0.1:5000/login/callback"
)

# Standard non-sensitive scopes (0% red warnings)
SCOPES = [
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile"
]

if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET:
    raise RuntimeError("Google OAuth credentials missing from .env")


# =========================================================
# GEMINI CLIENT
# =========================================================

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    raise RuntimeError("GEMINI_API_KEY is missing from .env")

gemini_client = genai.Client(api_key=GEMINI_API_KEY)


# =========================================================
# POSTGRESQL DATABASE
# =========================================================

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL is missing from .env")

def get_db():
    return psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor)


def init_db():
    connection = get_db()
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS users (
                    id SERIAL PRIMARY KEY,
                    google_id TEXT UNIQUE NOT NULL,
                    name TEXT NOT NULL,
                    email TEXT UNIQUE NOT NULL,
                    credentials JSONB NOT NULL,
                    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
                );
                """
            )
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS email_summaries (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    gmail_message_id TEXT NOT NULL,
                    sender TEXT,
                    subject TEXT,
                    email_date TEXT,
                    summary TEXT,
                    action TEXT,
                    deadline TEXT,
                    category TEXT,
                    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(user_id, gmail_message_id)
                );
                """
            )
            cursor.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_email_summaries_user_id
                ON email_summaries(user_id);
                """
            )
            connection.commit()
    finally:
        connection.close()

init_db()


# =========================================================
# GOOGLE OAUTH FLOW
# =========================================================

def create_google_flow(state=None):
    client_config = {
        "web": {
            "client_id": GOOGLE_CLIENT_ID,
            "client_secret": GOOGLE_CLIENT_SECRET,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "redirect_uris": [GOOGLE_REDIRECT_URI]
        }
    }
    flow = Flow.from_client_config(client_config, scopes=SCOPES, state=state)
    flow.redirect_uri = GOOGLE_REDIRECT_URI
    return flow


# =========================================================
# USER HELPERS
# =========================================================

def save_user(google_id, name, email, credentials):
    credentials_json = json.loads(credentials.to_json())
    connection = get_db()
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO users (google_id, name, email, credentials)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (google_id)
                DO UPDATE SET
                    name = EXCLUDED.name,
                    email = EXCLUDED.email,
                    credentials = EXCLUDED.credentials,
                    updated_at = CURRENT_TIMESTAMP
                RETURNING id;
                """,
                (google_id, name, email, Json(credentials_json))
            )
            result = cursor.fetchone()
            connection.commit()
            return result["id"]
    finally:
        connection.close()


def get_user_by_id(user_id):
    connection = get_db()
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT id, google_id, name, email, created_at FROM users WHERE id = %s",
                (user_id,)
            )
            return cursor.fetchone()
    finally:
        connection.close()


def require_login():
    return session.get("user_id")


# =========================================================
# AI PARSER & UTILS
# =========================================================

def clean_json_response(text):
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?", "", text, flags=re.IGNORECASE)
        text = re.sub(r"```$", "", text)
        text = text.strip()
    return text


def normalize_category(category):
    if not category:
        return "Information"
    val = str(category).strip().lower()
    if "action" in val:
        return "Action Required"
    if "important" in val:
        return "Important"
    return "Information"


def summarize_emails_with_gemini(emails):
    email_blocks = []
    for index, email in enumerate(emails, start=1):
        email_blocks.append(
            f"EMAIL {index}\nSender: {email['sender']}\nSubject: {email['subject']}\nDate: {email['date']}\nBody:\n{email['body']}\n"
        )

    email_text = "\n---\n".join(email_blocks)

    prompt = f"""
You are Trove, an elite AI email intelligence assistant.
Analyze the emails below and output structured JSON.

Return ONLY valid JSON matching this schema:
{{
  "emails": [
    {{
      "index": 1,
      "summary": "High-impact 1-2 sentence executive summary",
      "action": "Specific task required or 'No action required'",
      "deadline": "Extracted date/time or 'No deadline'",
      "category": "Action Required | Important | Information"
    }}
  ]
}}

Rules:
1. Return exactly one object per input email preserving the index.
2. Category must strictly be one of: Action Required, Important, Information.
3. Keep summaries concise, clear, and factual.

EMAILS:
{email_text}
"""
    response = gemini_client.models.generate_content(
        model="gemini-2.5-flash",
        contents=prompt
    )

    if not response.text:
        raise RuntimeError("Gemini returned empty text response.")

    parsed = json.loads(clean_json_response(response.text))
    return parsed.get("emails", [])


# =========================================================
# ROUTES
# =========================================================

@app.route("/")
def home():
    user = None
    if session.get("user_id"):
        user = get_user_by_id(session["user_id"])
    return render_template("index.html", user=user)


@app.route("/login")
def login():
    flow = create_google_flow()
    auth_url, state = flow.authorization_url(
        access_type="offline",
        prompt="consent"
    )
    session["oauth_state"] = state
    session["code_verifier"] = flow.code_verifier
    return redirect(auth_url)


@app.route("/login/callback")
def login_callback():
    try:
        expected_state = session.get("oauth_state")
        received_state = request.args.get("state")

        if not expected_state or received_state != expected_state:
            return "Invalid OAuth state.", 400

        flow = create_google_flow(state=expected_state)
        flow.code_verifier = session.get("code_verifier")
        flow.fetch_token(authorization_response=request.url)

        userinfo_service = build("oauth2", "v2", credentials=flow.credentials)
        user_info = userinfo_service.userinfo().get().execute()

        user_id = save_user(
            google_id=user_info["id"],
            name=user_info.get("name", "User"),
            email=user_info["email"],
            credentials=flow.credentials
        )

        session.clear()
        session["user_id"] = user_id
        session["user_name"] = user_info.get("name", "User")
        session["user_email"] = user_info["email"]

        return redirect(url_for("home"))
    except Exception as error:
        print("OAuth Error:", repr(error))
        session.clear()
        return "Google login failed.", 500


# =========================================================
# ELITE DEMO / SANDBOX SUMMARIZATION (100% FREE)
# =========================================================

@app.route("/api/demo-summarize", methods=["POST"])
def demo_summarize():
    """Live demo that runs the real Gemini model on realistic mock emails."""
    mock_emails = [
        {
            "gmail_message_id": "demo-001",
            "sender": "Billing <billing@stripe.com>",
            "subject": "Invoice #INV-2026-089 is ready",
            "date": "Today, 10:30 AM",
            "body": "Your invoice for August 2026 ($240.00) is due on September 5, 2026. Please update your payment card on file."
        },
        {
            "gmail_message_id": "demo-002",
            "sender": "GitHub <notifications@github.com>",
            "subject": "[Pull Request] Critical security patch for auth layer #42",
            "date": "Today, 09:15 AM",
            "body": "Jacob has requested your review on PR #42: Updated session tokens and rate limits. Please review before merge."
        },
        {
            "gmail_message_id": "demo-003",
            "sender": "AWS Notifications <no-reply@amazon.com>",
            "subject": "AWS Budget Alert: 85% of monthly threshold reached",
            "date": "Yesterday, 6:00 PM",
            "body": "Your account has reached $85.40 of your $100.00 monthly threshold. No immediate action required if expected."
        },
        {
            "gmail_message_id": "demo-004",
            "sender": "Substack Daily <newsletter@substack.com>",
            "subject": "State of AI & Software Architecture 2026",
            "date": "Yesterday, 2:00 PM",
            "body": "In today's edition: Why modern SaaS architecture is moving toward edge functions and client-side processing."
        }
    ]

    ai_results = summarize_emails_with_gemini(mock_emails)
    summaries = []

    for index, email in enumerate(mock_emails, start=1):
        ai = next((item for item in ai_results if item.get("index") == index), {})
        summaries.append({
            "id": f"demo-{index}",
            "gmail_message_id": email["gmail_message_id"],
            "sender": email["sender"],
            "subject": email["subject"],
            "date": email["date"],
            "summary": ai.get("summary", "Summary not generated."),
            "action": ai.get("action", "No action required"),
            "deadline": ai.get("deadline", "No deadline"),
            "category": normalize_category(ai.get("category"))
        })

    return jsonify({"emails": summaries, "count": len(summaries), "demo": True})


# =========================================================
# MANUAL TEXT / EMAIL INGESTION ROUTE
# =========================================================

@app.route("/api/manual-summarize", methods=["POST"])
def manual_summarize():
    """Allows users to paste raw email text and get an instant AI summary."""
    data = request.get_json() or {}
    raw_content = data.get("content", "").strip()

    if not raw_content:
        return jsonify({"error": "Content cannot be empty."}), 400

    single_email = [{
        "sender": data.get("sender", "Manual Input"),
        "subject": data.get("subject", "Pasted Email Thread"),
        "date": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M"),
        "body": raw_content[:8000]
    }]

    ai_results = summarize_emails_with_gemini(single_email)
    result = ai_results[0] if ai_results else {}

    return jsonify({
        "emails": [{
            "id": 1,
            "sender": single_email[0]["sender"],
            "subject": single_email[0]["subject"],
            "date": single_email[0]["date"],
            "summary": result.get("summary", "Summary completed."),
            "action": result.get("action", "No action required"),
            "deadline": result.get("deadline", "No deadline"),
            "category": normalize_category(result.get("category"))
        }],
        "count": 1
    })


# =========================================================
# LOGOUT & HEALTH
# =========================================================

@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("home"))


@app.route("/health")
def health():
    return jsonify({"status": "ok", "backend": "active"})


if __name__ == "__main__":
    app.run(debug=LOCAL_DEV)