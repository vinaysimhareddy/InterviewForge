# Operations & On-Call Playbook: InterviewForge

This runbook provides actionable procedures for operators and on-call engineers managing InterviewForge in production.

---

## 1. Fast Diagnostics & Log Inspection Cheat-Sheet

```bash
# View live backend logs with timestamp formatting
docker logs -f --tail 100 interviewforge_prod_backend

# View nginx access and error logs
docker logs -f --tail 100 interviewforge_prod_frontend

# Grep for specific correlation ID from an error report
docker logs interviewforge_prod_backend 2>&1 | grep "X-Correlation-ID: <ID>"

# Inspect current container resource usage (CPU / Memory / Net I/O)
docker stats --no-stream

# Check real-time database connection status
curl -s http://localhost:8000/health/db | jq .
```

---

## 2. On-Call Incident Playbooks

### Playbook A: High 5xx Error Rate / API Exceptions

**Symptoms**:
- Candidates reporting "System encountered an unexpected condition" or alert banner.
- Surge in HTTP 500 status codes in reverse proxy access logs.

**Diagnostic Steps**:
1. Check Nginx logs for the failing endpoint:
   ```bash
   grep '"status": 500' /var/log/nginx/access.log | tail -n 20
   ```
2. Extract the `request_id` (`X-Correlation-ID`) from the log entry or candidate bug report.
3. Locate the server-side stack trace in backend logs:
   ```bash
   docker logs interviewforge_prod_backend 2>&1 | grep "<CORRELATION_ID>" -A 10
   ```
4. Verify database health:
   ```bash
   curl -s http://localhost:8000/health/db
   ```
   If latency > 1000ms or status is 503, inspect MongoDB Atlas cluster metrics (connection count, CPU spikes).

**Remediation**:
- If transient thread deadlock or memory exhaustion:
  ```bash
  docker restart interviewforge_prod_backend
  ```
- If MongoDB Atlas connection limit exceeded:
  Increase Atlas M-tier or adjust `maxPoolSize` in `backend/app/core/database.py` (default: 50).

---

### Playbook B: Upstream LLM 429 Quota Exhaustion

**Symptoms**:
- Logs show `429 Resource has been exhausted (e.g. check quota)`.
- Report generation completes quickly with `[AI review unavailable: limited report]` badge.

**How InterviewForge Handles This**:
- The report pipeline automatically engages `generate_limited_fallback_report`.
- Candidates are **never** blocked or left on infinite spinners; scores, question transcripts, and deterministic competency breakdowns remain 100% accessible.

**Action Steps**:
1. Check current Google Cloud / AI Studio quota usage in the GCP console.
2. Failover to secondary/fallback model without code changes:
   Edit `.env.production`:
   ```ini
   PRIMARY_LLM_MODEL=gemini-2.5-flash
   ```
   Apply configuration:
   ```bash
   docker compose -f docker-compose.prod.yml up -d --no-deps backend
   ```
3. If primary key quota is depleted, hot-swap to backup key:
   Update `GEMINI_API_KEY` in `.env.production` and reload backend.

---

### Playbook C: Speech-to-Text (STT) Recognition Issues

**Symptoms**:
- Candidate sees "Speech service temporarily disconnected" warning banner.
- Transcript stops updating while candidate is speaking.

**How the System Self-Heals**:
- `sttChainManager.ts` executes autonomous provider failover if:
  - WebSocket connection drops for $> 1.5$s.
  - Speech activity detected for $> 2.5$s without partial text.
  - Unrecoverable browser recognition error occurs.
- Words spoken prior to failover are preserved and deduplicated via `TranscriptAssembler`.
- UI displays actionable recovery buttons: **"Reconnect microphone"**, **"Retry turn"**, **"Continue with typed answers"**.

**Action Steps**:
1. Check if candidate's browser blocked audio permissions.
2. In case of network WebSocket degradation:
   Verify Nginx WebSocket configuration (`proxy_read_timeout 3600s;`).
3. Ensure client bandwidth is sufficient ($\ge 128\text{ kbps}$).

---

### Playbook D: Slow Report Generation / Processing Backlog

**Target SLA**: Report ready $\le 20$s p50 / $\le 35$s p95 for a 20-minute interview.

**Diagnostic Steps**:
1. Query active report generation jobs in MongoDB:
   ```javascript
   db.report_status.find({ status: { $in: ["queued", "running"] } }).sort({ updated_at: -1 })
   ```
2. Check stage duration breakdown in generated report:
   ```bash
   curl -H "Authorization: Bearer <TOKEN>" http://localhost:8000/api/v1/sessions/<SESSION_ID>/report | jq .metadata.timings
   ```
3. Check if turn precomputation (`update_summary_node`) ran during the interview turns. If precomputation ran, generation takes $< 4$s because only final synthesis is required.

**Remediation**:
- If a report job stalled due to container restart, the startup reconciliation worker will automatically recover sessions missing completed reports.
- Trigger manual regeneration if needed:
  ```bash
  curl -X POST -H "Authorization: Bearer <TOKEN>" http://localhost:8000/api/v1/sessions/<SESSION_ID>/report/generate
  ```

---

### Playbook E: Disk Space Full / Log Exhaustion

**Symptoms**:
- Docker containers fail with `no space left on device`.
- MongoDB writes fail with disk write errors.

**Action Steps**:
1. Inspect host disk usage:
   ```bash
   df -h /
   ```
2. Clean unused Docker resources:
   ```bash
   docker system prune -af --volumes=false
   ```
3. Truncate oversized container log files:
   ```bash
   sudo sh -c 'truncate -s 0 /var/lib/docker/containers/*/*-json.log'
   ```
4. Verify Docker daemon log rotation in `/etc/docker/daemon.json`:
   ```json
   {
     "log-driver": "json-file",
     "log-opts": {
       "max-size": "50m",
       "max-file": "3"
     }
   }
   ```

---

## 3. Rate Limit Tuning

Rate limits are enforced in `app/core/rate_limiter.py` using in-memory sliding window counters with IP hash buckets:

| Endpoint Route | Default Limit | Window | Purpose |
| :--- | :--- | :--- | :--- |
| `/api/v1/auth/login` | 5 requests | 60 sec | Brute-force & credential stuffing defense |
| `/api/v1/auth/register` | 5 requests | 60 sec | Bot registration mitigation |
| `/api/v1/interview/sessions/*/answer` | 60 requests | 60 sec | Turn spamming prevention |

### Modifying Rate Limit Thresholds:
To adjust thresholds for high-volume enterprise testing, adjust the decorator parameters on the corresponding router endpoints in `backend/app/api/v1/endpoints/`:
```python
# Example: Increasing answer limit from 60 to 120 requests/minute
@router.post("/sessions/{session_id}/answer", ...)
@limiter.limit(limit=120, window_seconds=60)
async def submit_candidate_answer(...)
```

---

## 4. Zero-Downtime Secret Rotation

### 4.1 Rotating JWT_SECRET
To prevent logging out active candidates during rotation:
1. Update `app/core/security.py` to accept both the previous secret and new secret during a 24-hour transition window:
   - Validate signatures against `NEW_JWT_SECRET` first, fallback to `OLD_JWT_SECRET`.
   - Issue all *new* tokens signed by `NEW_JWT_SECRET`.
2. After 24 hours (all old tokens expired), remove `OLD_JWT_SECRET` from environment.

### 4.2 Rotating Gemini API Key
1. Generate new API key in Google Cloud Console / AI Studio.
2. Update `GEMINI_API_KEY` in `.env.production`.
3. Perform zero-downtime rolling reload:
   ```bash
   docker compose -f docker-compose.prod.yml up -d --no-deps backend
   ```
4. Revoke previous key in GCP console.

---

## 5. Cost Monitoring & Quota Management

### Gemini API Usage Tracking
- In Google Cloud Console $\to$ **APIs & Services** $\to$ **Google AI Studio API** $\to$ **Metrics**:
  - Track `Requests per minute (RPM)`
  - Track `Tokens per minute (TPM)`
- Expected consumption per 20-minute interview:
  - ~6 adaptive questions: $6 \times 400 = 2,400$ input tokens
  - Candidate answers: $6 \times 800 = 4,800$ tokens
  - Per-turn precomputations: $6 \times 600 = 3,600$ tokens
  - Final synthesis call: ~3,500 input tokens, ~1,200 output tokens
  - **Total per interview**: ~15,000 tokens (Under $0.01 USD on Gemini 3.5 Flash-Lite).

