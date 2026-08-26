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

LOCAL_DEV = os.getenv(
    "FLASK_ENV",
    "development"
) == "development"


if LOCAL_DEV:
    os.environ["OAUTHLIB_INSECURE_TRANSPORT"] = "1"


# =========================================================
# FLASK
# =========================================================

app = Flask(__name__)

app.secret_key = os.getenv("SECRET_KEY")

if not app.secret_key:
    raise RuntimeError(
        "SECRET_KEY is missing from .env"
    )


app.config.update(
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    SESSION_COOKIE_SECURE=not LOCAL_DEV,
)


# =========================================================
# GOOGLE CONFIGURATION
# =========================================================

GOOGLE_CLIENT_ID = os.getenv(
    "GOOGLE_CLIENT_ID"
)

GOOGLE_CLIENT_SECRET = os.getenv(
    "GOOGLE_CLIENT_SECRET"
)

GOOGLE_REDIRECT_URI = os.getenv(
    "GOOGLE_REDIRECT_URI",
    "http://127.0.0.1:5000/login/callback"
)


SCOPES = [
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
    "https://www.googleapis.com/auth/gmail.readonly"
]


if not GOOGLE_CLIENT_ID:
    raise RuntimeError(
        "GOOGLE_CLIENT_ID is missing from .env"
    )


if not GOOGLE_CLIENT_SECRET:
    raise RuntimeError(
        "GOOGLE_CLIENT_SECRET is missing from .env"
    )


# =========================================================
# GEMINI
# =========================================================

GEMINI_API_KEY = os.getenv(
    "GEMINI_API_KEY"
)

if not GEMINI_API_KEY:
    raise RuntimeError(
        "GEMINI_API_KEY is missing from .env"
    )


gemini_client = genai.Client(
    api_key=GEMINI_API_KEY
)


# =========================================================
# POSTGRESQL
# =========================================================

DATABASE_URL = os.getenv(
    "DATABASE_URL"
)

if not DATABASE_URL:
    raise RuntimeError(
        "DATABASE_URL is missing from .env"
    )


def get_db():

    return psycopg2.connect(
        DATABASE_URL,
        cursor_factory=RealDictCursor
    )


# =========================================================
# DATABASE INITIALIZATION
# =========================================================

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

                    created_at TIMESTAMPTZ
                        DEFAULT CURRENT_TIMESTAMP,

                    updated_at TIMESTAMPTZ
                        DEFAULT CURRENT_TIMESTAMP
                );
                """
            )


            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS email_summaries (

                    id SERIAL PRIMARY KEY,

                    user_id INTEGER NOT NULL
                        REFERENCES users(id)
                        ON DELETE CASCADE,

                    gmail_message_id TEXT NOT NULL,

                    sender TEXT,

                    subject TEXT,

                    email_date TEXT,

                    summary TEXT,

                    action TEXT,

                    deadline TEXT,

                    category TEXT,

                    created_at TIMESTAMPTZ
                        DEFAULT CURRENT_TIMESTAMP,

                    UNIQUE(
                        user_id,
                        gmail_message_id
                    )
                );
                """
            )


            cursor.execute(
                """
                CREATE INDEX IF NOT EXISTS
                idx_email_summaries_user_id
                ON email_summaries(user_id);
                """
            )


            connection.commit()

    finally:

        connection.close()


# =========================================================
# START DATABASE
# =========================================================

init_db()


# =========================================================
# GOOGLE OAUTH FLOW
# =========================================================

def create_google_flow(
    state=None
):

    client_config = {

        "web": {

            "client_id":
                GOOGLE_CLIENT_ID,

            "client_secret":
                GOOGLE_CLIENT_SECRET,

            "auth_uri":
                "https://accounts.google.com/o/oauth2/auth",

            "token_uri":
                "https://oauth2.googleapis.com/token",

            "redirect_uris": [
                GOOGLE_REDIRECT_URI
            ]
        }
    }


    flow = Flow.from_client_config(

        client_config,

        scopes=SCOPES,

        state=state

    )


    flow.redirect_uri = (
        GOOGLE_REDIRECT_URI
    )


    return flow


# =========================================================
# HOME
# =========================================================

@app.route("/")
def home():

    user = None

    if session.get("user_id"):

        user = get_user_by_id(
            session["user_id"]
        )


    return render_template(
        "index.html",
        user=user
    )


# =========================================================
# LOGIN
# =========================================================

@app.route("/login")
def login():

    flow = create_google_flow()


    authorization_url, state = (
        flow.authorization_url(

            access_type="offline",

            include_granted_scopes="true",

            prompt="consent"
        )
    )


    session["oauth_state"] = state


    session["code_verifier"] = (
        flow.code_verifier
    )


    return redirect(
        authorization_url
    )


# =========================================================
# GOOGLE CALLBACK
# =========================================================

@app.route("/login/callback")
def login_callback():

    try:

        expected_state = (
            session.get("oauth_state")
        )

        received_state = (
            request.args.get("state")
        )


        if not expected_state:

            return (
                "OAuth session expired. "
                "Please start login again.",
                400
            )


        if not received_state:

            return (
                "Missing OAuth state.",
                400
            )


        if received_state != expected_state:

            return (
                "Invalid OAuth state.",
                400
            )


        code_verifier = (
            session.get("code_verifier")
        )


        if not code_verifier:

            return (
                "Missing OAuth code verifier. "
                "Please start login again.",
                400
            )


        flow = create_google_flow(
            state=expected_state
        )


        flow.code_verifier = (
            code_verifier
        )


        flow.fetch_token(
            authorization_response=request.url
        )


        credentials = flow.credentials


        # =================================================
        # USER INFORMATION
        # =================================================

        userinfo_service = build(
            "oauth2",
            "v2",
            credentials=credentials
        )


        user_info = (
            userinfo_service
            .userinfo()
            .get()
            .execute()
        )


        google_id = user_info.get(
            "id"
        )

        user_name = user_info.get(
            "name",
            "User"
        )

        user_email = user_info.get(
            "email"
        )


        if not google_id or not user_email:

            return (
                "Google did not return "
                "required account information.",
                400
            )


        # =================================================
        # SAVE USER
        # =================================================

        user_id = save_user(
            google_id=google_id,
            name=user_name,
            email=user_email,
            credentials=credentials
        )


        # =================================================
        # SESSION
        # =================================================

        session.clear()

        session["user_id"] = user_id
        session["user_name"] = user_name
        session["user_email"] = user_email


        return redirect(
            url_for("home")
        )


    except Exception as error:

        print(
            "OAuth error:",
            repr(error)
        )


        session.clear()


        return (
            "Google login failed. "
            "Please try again.",
            500
        )


# =========================================================
# SAVE USER
# =========================================================

def save_user(
    google_id,
    name,
    email,
    credentials
):

    credentials_json = json.loads(
        credentials.to_json()
    )


    connection = get_db()

    try:

        with connection.cursor() as cursor:

            cursor.execute(
                """
                INSERT INTO users
                    (
                        google_id,
                        name,
                        email,
                        credentials
                    )

                VALUES
                    (%s, %s, %s, %s)

                ON CONFLICT (google_id)

                DO UPDATE SET

                    name = EXCLUDED.name,

                    email = EXCLUDED.email,

                    credentials =
                        EXCLUDED.credentials,

                    updated_at =
                        CURRENT_TIMESTAMP

                RETURNING id;
                """,

                (
                    google_id,
                    name,
                    email,
                    Json(credentials_json)
                )
            )


            result = cursor.fetchone()

            connection.commit()


            return result["id"]


    finally:

        connection.close()


# =========================================================
# GET USER
# =========================================================

def get_user_by_id(
    user_id
):

    connection = get_db()

    try:

        with connection.cursor() as cursor:

            cursor.execute(
                """
                SELECT
                    id,
                    google_id,
                    name,
                    email,
                    created_at
                FROM users
                WHERE id = %s
                """,
                (user_id,)
            )


            return cursor.fetchone()


    finally:

        connection.close()


# =========================================================
# GET USER WITH CREDENTIALS
# =========================================================

def get_user_with_credentials(
    user_id
):

    connection = get_db()

    try:

        with connection.cursor() as cursor:

            cursor.execute(
                """
                SELECT
                    id,
                    google_id,
                    name,
                    email,
                    credentials
                FROM users
                WHERE id = %s
                """,
                (user_id,)
            )


            return cursor.fetchone()


    finally:

        connection.close()


# =========================================================
# GOOGLE CREDENTIALS
# =========================================================

def get_google_credentials():

    user_id = session.get(
        "user_id"
    )


    if not user_id:

        return None


    user = get_user_with_credentials(
        user_id
    )


    if not user:

        return None


    credentials_data = (
        user["credentials"]
    )


    if isinstance(
        credentials_data,
        str
    ):

        credentials_data = json.loads(
            credentials_data
        )


    credentials = (
        Credentials.from_authorized_user_info(
            credentials_data,
            SCOPES
        )
    )


    # =====================================================
    # REFRESH TOKEN
    # =====================================================

    if (
        credentials.expired
        and credentials.refresh_token
    ):

        credentials.refresh(
            Request()
        )


        save_refreshed_credentials(
            user_id,
            credentials
        )


    return credentials


# =========================================================
# SAVE REFRESHED CREDENTIALS
# =========================================================

def save_refreshed_credentials(
    user_id,
    credentials
):

    credentials_json = json.loads(
        credentials.to_json()
    )


    connection = get_db()

    try:

        with connection.cursor() as cursor:

            cursor.execute(
                """
                UPDATE users

                SET
                    credentials = %s,
                    updated_at = CURRENT_TIMESTAMP

                WHERE id = %s
                """,

                (
                    Json(credentials_json),
                    user_id
                )
            )


            connection.commit()

    finally:

        connection.close()


# =========================================================
# LOGIN REQUIRED HELPER
# =========================================================

def require_login():

    user_id = session.get(
        "user_id"
    )


    if not user_id:

        return None


    return user_id


# =========================================================
# EMAIL BODY DECODER
# =========================================================

def decode_base64_data(
    data
):

    try:

        decoded = (
            base64.urlsafe_b64decode(
                data + "="
                * (-len(data) % 4)
            )
        )


        return decoded.decode(
            "utf-8",
            errors="ignore"
        )


    except Exception:

        return ""


def decode_email_body(
    payload
):

    if not payload:

        return ""


    body = payload.get(
        "body",
        {}
    )


    data = body.get(
        "data"
    )


    if data:

        return decode_base64_data(
            data
        )


    parts = payload.get(
        "parts",
        []
    )


    # Prefer plain text

    for part in parts:

        mime_type = part.get(
            "mimeType",
            ""
        )


        if mime_type == "text/plain":

            data = (
                part
                .get("body", {})
                .get("data")
            )


            if data:

                return decode_base64_data(
                    data
                )


    # Recursively search nested parts

    for part in parts:

        if part.get("parts"):

            result = decode_email_body(
                part
            )


            if result:

                return result


    # HTML fallback

    for part in parts:

        mime_type = part.get(
            "mimeType",
            ""
        )


        if mime_type == "text/html":

            data = (
                part
                .get("body", {})
                .get("data")
            )


            if data:

                html = decode_base64_data(
                    data
                )


                # Basic HTML → text

                text = re.sub(
                    r"<[^>]+>",
                    " ",
                    html
                )


                text = re.sub(
                    r"\s+",
                    " ",
                    text
                )


                return text.strip()


    return ""


# =========================================================
# EMAIL HEADER
# =========================================================

def get_header(
    headers,
    name
):

    for header in headers:

        if (
            header
            .get("name", "")
            .lower()
            == name.lower()
        ):

            return header.get(
                "value",
                ""
            )


    return ""


# =========================================================
# CLEAN GEMINI JSON
# =========================================================

def clean_json_response(
    text
):

    text = text.strip()


    if text.startswith("```"):

        text = re.sub(
            r"^```(?:json)?",
            "",
            text,
            flags=re.IGNORECASE
        )


        text = re.sub(
            r"```$",
            "",
            text
        )


        text = text.strip()


    return text


# =========================================================
# VALIDATE CATEGORY
# =========================================================

VALID_CATEGORIES = {
    "Action Required",
    "Important",
    "Information"
}


def normalize_category(
    category
):

    if not category:

        return "Information"


    value = str(
        category
    ).strip().lower()


    if "action" in value:

        return "Action Required"


    if "important" in value:

        return "Important"


    return "Information"


# =========================================================
# GEMINI ANALYSIS
# =========================================================

def summarize_emails_with_gemini(
    emails
):

    email_blocks = []


    for index, email in enumerate(
        emails,
        start=1
    ):

        email_blocks.append(
            f"""
EMAIL {index}

Sender:
{email["sender"]}

Subject:
{email["subject"]}

Date:
{email["date"]}

Body:
{email["body"]}
"""
        )


    email_text = "\n".join(
        email_blocks
    )


    prompt = f"""
You are Trove, an AI email intelligence assistant.

Analyze the emails below.

Return ONLY valid JSON.

Required structure:

{{
  "emails": [
    {{
      "index": 1,
      "summary": "Short useful summary",
      "action": "What the user needs to do, or No action required",
      "deadline": "Deadline if explicitly mentioned, otherwise No deadline",
      "category": "Action Required"
    }}
  ]
}}

Rules:

1. Return exactly one object for every input email.
2. Preserve the email index.
3. Never invent information.
4. Keep summaries concise and useful.
5. Only identify an action when the email actually requires one.
6. Only provide a deadline when explicitly stated or clearly present.
7. Otherwise use "No deadline".
8. If no action is required, use "No action required".
9. Category must be exactly one of:
   Action Required
   Important
   Information

EMAILS:

{email_text}
"""


    response = (
        gemini_client
        .models
        .generate_content(

            model="gemini-2.5-flash",

            contents=prompt
        )
    )


    if not response.text:

        raise RuntimeError(
            "Gemini returned an empty response."
        )


    text = clean_json_response(
        response.text
    )


    try:

        result = json.loads(
            text
        )

    except json.JSONDecodeError as error:

        print(
            "Gemini JSON error:",
            text
        )

        raise RuntimeError(
            "Gemini returned invalid JSON."
        ) from error


    ai_results = result.get(
        "emails",
        []
    )


    if not isinstance(
        ai_results,
        list
    ):

        raise RuntimeError(
            "Gemini returned an invalid email list."
        )


    return ai_results


# =========================================================
# SAVE SUMMARIES
# =========================================================

def save_summaries(
    user_id,
    summaries
):

    connection = get_db()

    try:

        with connection.cursor() as cursor:

            for item in summaries:

                cursor.execute(
                    """
                    INSERT INTO email_summaries
                    (
                        user_id,
                        gmail_message_id,
                        sender,
                        subject,
                        email_date,
                        summary,
                        action,
                        deadline,
                        category
                    )

                    VALUES
                    (
                        %s, %s, %s, %s, %s,
                        %s, %s, %s, %s
                    )

                    ON CONFLICT
                    (
                        user_id,
                        gmail_message_id
                    )

                    DO UPDATE SET

                        sender =
                            EXCLUDED.sender,

                        subject =
                            EXCLUDED.subject,

                        email_date =
                            EXCLUDED.email_date,

                        summary =
                            EXCLUDED.summary,

                        action =
                            EXCLUDED.action,

                        deadline =
                            EXCLUDED.deadline,

                        category =
                            EXCLUDED.category,

                        created_at =
                            CURRENT_TIMESTAMP
                    """,

                    (
                        user_id,
                        item["gmail_message_id"],
                        item["sender"],
                        item["subject"],
                        item["date"],
                        item["summary"],
                        item["action"],
                        item["deadline"],
                        item["category"]
                    )
                )


            connection.commit()


    finally:

        connection.close()


# =========================================================
# GET SAVED SUMMARIES
# =========================================================

def get_saved_summaries(
    user_id
):

    connection = get_db()

    try:

        with connection.cursor() as cursor:

            cursor.execute(
                """
                SELECT
                    id,
                    gmail_message_id,
                    sender,
                    subject,
                    email_date,
                    summary,
                    action,
                    deadline,
                    category,
                    created_at

                FROM email_summaries

                WHERE user_id = %s

                ORDER BY created_at DESC
                """,

                (user_id,)
            )


            rows = cursor.fetchall()


            results = []


            for row in rows:

                results.append({

                    "id":
                        row["id"],

                    "gmail_message_id":
                        row["gmail_message_id"],

                    "sender":
                        row["sender"],

                    "subject":
                        row["subject"],

                    "date":
                        row["email_date"],

                    "summary":
                        row["summary"],

                    "action":
                        row["action"],

                    "deadline":
                        row["deadline"],

                    "category":
                        normalize_category(
                            row["category"]
                        )
                })


            return results


    finally:

        connection.close()


# =========================================================
# SUMMARIZE ROUTE
# =========================================================

@app.route(
    "/summarize",
    methods=["POST"]
)
def summarize():

    user_id = require_login()


    if not user_id:

        return jsonify({
            "error":
                "You are not logged in."
        }), 401


    try:

        credentials = (
            get_google_credentials()
        )


        if not credentials:

            return jsonify({
                "error":
                    "Your Google session has expired. "
                    "Please log in again."
            }), 401


        gmail = build(
            "gmail",
            "v1",
            credentials=credentials
        )


        # =================================================
        # GET LATEST EMAILS
        # =================================================

        response = (
            gmail
            .users()
            .messages()
            .list(
                userId="me",
                maxResults=10
            )
            .execute()
        )


        messages = response.get(
            "messages",
            []
        )


        emails = []


        # =================================================
        # FETCH EMAIL CONTENT
        # =================================================

        for message in messages:

            email = (
                gmail
                .users()
                .messages()
                .get(
                    userId="me",
                    id=message["id"],
                    format="full"
                )
                .execute()
            )


            payload = email.get(
                "payload",
                {}
            )


            headers = payload.get(
                "headers",
                []
            )


            sender = get_header(
                headers,
                "From"
            )


            subject = get_header(
                headers,
                "Subject"
            )


            date = get_header(
                headers,
                "Date"
            )


            body = decode_email_body(
                payload
            )


            body = body[:6000]


            if not body:

                body = (
                    "No readable email "
                    "content found."
                )


            emails.append({

                "gmail_message_id":
                    message["id"],

                "sender":
                    sender or "Unknown sender",

                "subject":
                    subject or "No subject",

                "date":
                    date or "",

                "body":
                    body
            })


        # =================================================
        # NO EMAILS
        # =================================================

        if not emails:

            return jsonify({

                "emails": [],

                "count": 0

            })


        # =================================================
        # GEMINI
        # =================================================

        ai_results = (
            summarize_emails_with_gemini(
                emails
            )
        )


        # =================================================
        # MAP RESULTS
        # =================================================

        ai_by_index = {}


        for result in ai_results:

            try:

                index = int(
                    result.get("index")
                )

                ai_by_index[index] = result

            except (
                TypeError,
                ValueError
            ):

                continue


        summaries = []


        for index, email in enumerate(
            emails,
            start=1
        ):

            ai = ai_by_index.get(
                index,
                {}
            )


            summary = (
                ai.get(
                    "summary"
                )
                or
                "No summary available."
            )


            action = (
                ai.get(
                    "action"
                )
                or
                "No action required"
            )


            deadline = (
                ai.get(
                    "deadline"
                )
                or
                "No deadline"
            )


            category = normalize_category(
                ai.get("category")
            )


            summaries.append({

                "gmail_message_id":
                    email[
                        "gmail_message_id"
                    ],

                "sender":
                    email["sender"],

                "subject":
                    email["subject"],

                "date":
                    email["date"],

                "summary":
                    summary,

                "action":
                    action,

                "deadline":
                    deadline,

                "category":
                    category
            })


        # =================================================
        # SAVE TO POSTGRESQL
        # =================================================

        save_summaries(
            user_id,
            summaries
        )


        # =================================================
        # RESPONSE
        # =================================================

        saved = get_saved_summaries(
            user_id
        )


        return jsonify({

            "emails":
                saved,

            "count":
                len(saved)

        })


    except Exception as error:

        print(
            "\n================================"
        )

        print(
            "TROVE ERROR:"
        )

        print(
            repr(error)
        )

        print(
            "================================\n"
        )


        message = (
            "Trove couldn't analyze your inbox."
        )


        error_text = str(
            error
        ).lower()


        if (
            "quota" in error_text
            or
            "resource_exhausted"
            in error_text
            or
            "429" in error_text
        ):

            message = (
                "Gemini is temporarily "
                "rate-limited. Please try again later."
            )


        elif (
            "credentials" in error_text
            or
            "unauthorized" in error_text
            or
            "401" in error_text
        ):

            message = (
                "Your Google session has expired. "
                "Please log in again."
            )


        elif (
            "403" in error_text
        ):

            message = (
                "Google denied Gmail access. "
                "Please check your Google permissions."
            )


        return jsonify({
            "error":
                message
        }), 500


# =========================================================
# GET SAVED SUMMARIES
# =========================================================

@app.route(
    "/summaries",
    methods=["GET"]
)
def summaries():

    user_id = require_login()


    if not user_id:

        return jsonify({
            "error":
                "You are not logged in."
        }), 401


    try:

        saved = get_saved_summaries(
            user_id
        )


        return jsonify({

            "emails":
                saved,

            "count":
                len(saved)

        })


    except Exception as error:

        print(
            "Summary fetch error:",
            repr(error)
        )


        return jsonify({
            "error":
                "Could not load saved summaries."
        }), 500


# =========================================================
# DELETE SUMMARY
# =========================================================

@app.route(
    "/summaries/<int:summary_id>",
    methods=["DELETE"]
)
def delete_summary(
    summary_id
):

    user_id = require_login()


    if not user_id:

        return jsonify({
            "error":
                "You are not logged in."
        }), 401


    connection = get_db()

    try:

        with connection.cursor() as cursor:

            cursor.execute(
                """
                DELETE FROM email_summaries

                WHERE id = %s
                AND user_id = %s

                RETURNING id
                """,

                (
                    summary_id,
                    user_id
                )
            )


            deleted = cursor.fetchone()


            connection.commit()


            if not deleted:

                return jsonify({
                    "error":
                        "Summary not found."
                }), 404


            return jsonify({
                "success": True,
                "id": summary_id
            })


    finally:

        connection.close()


# =========================================================
# LOGOUT
# =========================================================

@app.route("/logout")
def logout():

    session.clear()


    return redirect(
        url_for("home")
    )


# =========================================================
# HEALTH CHECK
# =========================================================

@app.route("/health")
def health():

    try:

        connection = get_db()

        connection.close()


        return jsonify({
            "status":
                "ok",
            "database":
                "connected"
        })


    except Exception:

        return jsonify({
            "status":
                "error",
            "database":
                "disconnected"
        }), 500


# =========================================================
# RUN
# =========================================================

if __name__ == "__main__":

    app.run(
        debug=LOCAL_DEV
    )