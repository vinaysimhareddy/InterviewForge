# Environment Variables & Production Configuration Checklist

This checklist documents every configuration setting across the InterviewForge platform, including default values, production enforcement rules, and rotation procedures.

---

## 1. Master Configuration Matrix

| Variable Name | Required in Prod? | Default Value | Description & Constraints | Rotation Procedure |
| :--- | :--- | :--- | :--- | :--- |
| `ENVIRONMENT` | **YES** | `development` | Runtime environment (`production`, `staging`, `development`). When `production`, activates strict security fail-fast checks. | Restart container |
| `DEBUG` | NO | `false` | Enables verbose debug output. Must be `false` in production. | Restart container |
| `APP_NAME` | NO | `InterviewForge` | Display brand name for API and telemetry services. | Non-sensitive |
| `HOST` | NO | `0.0.0.0` | Bind IP address for ASGI server. | Host change |
| `PORT` | NO | `8000` | Port for ASGI server. | Host change |
| `JWT_SECRET` | **CRITICAL** | *(none)* | Cryptographic HMAC-SHA256 key for candidate auth tokens. **Must be $\ge 32$ chars** with high entropy. Server refuses to boot with defaults. | See [Operations Runbook](OPERATIONS.md#41-rotating-jwt_secret) |
| `JWT_ALGORITHM` | NO | `HS256` | JWT signing algorithm. | Keep `HS256` |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | NO | `60` | Lifespan of issued candidate JWTs. | Config update |
| `CORS_ORIGINS` | **CRITICAL** | `["*"]` in dev | JSON array of permitted frontend origins. **Wildcards (`*`) rejected in production**. | Config update |
| `COOKIE_SECURE` | NO | `true` in prod | Enforces `Secure` flag on HTTP cookies. | Config update |
| `MONGODB_URI` | **CRITICAL** | `mongodb://localhost:27017` | MongoDB connection string. In production, use MongoDB Atlas TLS replica set URI. | Rotate Atlas user password |
| `MONGODB_DB_NAME` | NO | `ai-mock-interview` | Database name. Safety guards prevent running test clean scripts against this name. | Migration |
| `GEMINI_API_KEY` | **CRITICAL** | *(none)* | Google Gemini API key powering question generation and evaluation. | Generate key in GCP Console |
| `PRIMARY_LLM_MODEL` | NO | `gemini-3.5-flash-lite` | Primary LLM model for adaptive turns and synthesis. Configurable and health-checked. | Config update |
| `FALLBACK_LLM_MODEL` | NO | `gemini-2.5-flash` | Secondary model engaged if primary returns 404 or quota errors. | Config update |
| `MAX_ANSWER_SEC` | NO | `300` | Maximum candidate speaking time per question (5 minutes). | Config update |
| `ANSWER_SOFT_WARNING_SEC` | NO | `240` | Subtle on-screen cue threshold (4 minutes) before hard cap. | Config update |
| `MAX_ANSWER_CHARS` | NO | `30000` | Maximum characters accepted for a single candidate answer. | Config update |
| `WS_MAX_MESSAGE_BYTES` | NO | `262144` | Maximum incoming WebSocket frame size (256 KB). | Config update |
| `MAX_TRANSCRIPT_CHARS_PER_TURN` | NO | `30000` | Maximum transcript characters preserved per turn. | Config update |

---

## 2. Cryptographic Secret Generation Commands

Run these commands on a secure terminal to generate secrets for your `.env.production` file:

```bash
# Generate high-entropy JWT Secret (32 bytes / 64 hex characters)
openssl rand -hex 32

# Verify output is at least 64 characters:
# Example output: a3f88b9012cd4e5f67890123456789abcdef0123456789abcdef0123456789ab
```

---

## 3. Production Configuration Template (`.env.production`)

```ini
# ==============================================================================
# InterviewForge Production Configuration
# Copy to .env.production and chmod 600 .env.production
# ==============================================================================

# Environment Mode
ENVIRONMENT=production
DEBUG=false
APP_NAME=InterviewForge

# Server Binding
HOST=0.0.0.0
PORT=8000

# Authentication & Security
# WARNING: Must be a random 64-character hex string generated via openssl rand -hex 32
JWT_SECRET=paste_high_entropy_secret_here_min_32_characters_random
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60
COOKIE_SECURE=true

# CORS: Set exact domains - WILDCARD (*) IS REJECTED IN PRODUCTION
CORS_ORIGINS=["https://interviewforge.yourdomain.com"]

# Database Connection (MongoDB Atlas)
MONGODB_URI=mongodb+srv://<USER>:<PASS>@<CLUSTER>.mongodb.net/ai-mock-interview?retryWrites=true&w=majority
MONGODB_DB_NAME=ai-mock-interview

# AI Provider Configuration (Google Gemini)
GEMINI_API_KEY=paste_live_gemini_api_key_here
PRIMARY_LLM_MODEL=gemini-3.5-flash-lite
FALLBACK_LLM_MODEL=gemini-2.5-flash

# Speech-to-Text & Transcript Hardening (PR4 Specification)
MAX_ANSWER_SEC=300
ANSWER_SOFT_WARNING_SEC=240
MAX_ANSWER_CHARS=30000
WS_MAX_MESSAGE_BYTES=262144
MAX_TRANSCRIPT_CHARS_PER_TURN=30000
```

