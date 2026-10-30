# IncidentPilot

AI-assisted incident investigation. IncidentPilot reads logs and metrics from a failing service, finds the likely root cause, **cites the exact evidence** behind its diagnosis, and recommends a fix from a fixed, pre-approved list. A human stays in control of any action.

> Built for the Nebius x NVIDIA Global AI Hackathon 2026. Runs on **Nebius Token Factory** with a production instruction-tuned model.

This repository contains the **AI investigation module and backend API**. The dashboard and database layer are built separately (see the project report).

---

## How it works

```
logs / metrics ──► collect evidence ──► deterministic checks ──► LLM synthesis ──► validated report
                   (IDs, redaction,      (plain rules, no AI)     (Nemotron,        (evidence IDs
                    bounded window)                                JSON output)       verified)
```

1. **Collect evidence.** Each log or metric gets a stable ID. Secrets, emails and tokens are redacted. The window is bounded so the model only sees a small, relevant set.
2. **Deterministic checks.** Regex rules (for example `event loop blocked`, `connection pool timeout`, `Token not valid`) produce trustworthy signals without any AI. If no rule matches, no signal is invented.
3. **LLM synthesis.** The model gets the evidence inside `<untrusted_logs>` tags and is told never to follow instructions found in logs. It must return JSON that matches a schema.
4. **Validation.** Output is rejected if it is not valid JSON, fails the schema, or cites an evidence ID that does not exist. There is one retry with feedback, then the investigation is marked `failed`. Nothing unvalidated is shown as a result.
5. **Recommendations.** Actions come only from an allowlist (`ACTION_CATALOG` in `agent.py`) and only when a deterministic signal justifies them. The model cannot choose or invent an action. All actions require human approval.

### Safety rules built in

- Logs are treated as untrusted data (prompt-injection defence).
- Confidence is capped at 0.5 when no deterministic rule backs the diagnosis.
- With no usable evidence, the LLM is not called and the report states it has insufficient data.
- Provider errors return a generic message; internal details are only logged server-side.
- No shell commands, URLs or SQL from model output are ever executed.

---

## Project layout

```
agent.py          LangGraph workflow, schemas, rules, validation
main.py           FastAPI app: trigger, poll, reset
config.py         Environment-based settings (local Ollama vs Nebius)
log_loader.py     Parses text logs into bounded, aggregated evidence
run_on_logs.py    Run the full investigation on a log file from the CLI
tests/            Pytest suite (LLM is mocked, no API key needed)
```

---

## Setup

Requires Python 3.10+.

```bash
python -m venv .venv
source .venv/bin/activate        # Windows PowerShell: .venv\Scripts\Activate.ps1

pip install fastapi "uvicorn[standard]" pydantic pydantic-settings openai langgraph
pip install -r tests/requirements-dev.txt     # pytest, httpx
```

### Configuration

Create a `.env` file in the project folder (never commit it):

```
ENVIRONMENT=prod                 # prod = Nebius, local = Ollama
NEBIUS_API_KEY=your_key_here
FRONTEND_ORIGIN=http://localhost:3000
```

| Variable | Purpose |
|---|---|
| `ENVIRONMENT` | `local` uses Ollama at `localhost:11434`; anything else uses Nebius Token Factory |
| `NEBIUS_API_KEY` | Token Factory key (required when not local) |
| `FRONTEND_ORIGIN` | The only origin allowed by CORS |
| `LOG_FILE` | Optional. Path to a text log file to investigate instead of the seeded demo data (set as a shell variable) |
| `LOG_LEVEL` | Optional. Defaults to `INFO` |

The model names are set in `config.py`. Check that the Nebius model ID exists in your Token Factory model list before relying on it.

**No API key?** Leave `ENVIRONMENT=local`, run `ollama pull llama3`, and the same code works against a local model. Smaller local models produce invalid output more often, so expect occasional `failed` results.

---

## Run

### API server

```bash
uvicorn main:app --reload
```

Interactive docs are at `http://localhost:8000/docs`.

```bash
# start an investigation (returns 202 immediately)
curl -X POST http://localhost:8000/api/incidents/inc-1/investigate

# poll until status is completed or failed
curl http://localhost:8000/api/investigations/<investigation_id>
```

To investigate a real log file instead of the seeded scenario:

```bash
LOG_FILE=logs.txt uvicorn main:app --reload
```

### Command line

```bash
python log_loader.py logs.txt     # preview the evidence that would be sent (no LLM call)
python run_on_logs.py logs.txt    # full investigation, prints the report
```

---

## API

| Method and path | Purpose |
|---|---|
| `POST /api/incidents/{id}/investigate` | Start an investigation. Returns `202` with `investigation_id` and `status`. A repeated call for an incident already in progress returns the existing investigation. |
| `GET /api/investigations/{id}` | Status, current stage, final report or error |
| `POST /api/demo/reset` | Clear stored investigations |
| `GET /health` | Liveness check |

Statuses: `queued`, `running`, `completed`, `failed`. Stages: `collect_evidence`, `deterministic_checks`, `llm_synthesis`, `done`.

Errors use one shape: `{"error": {"code": "...", "message": "..."}}`.

Example report (`report` field of a completed investigation):

```json
{
  "investigation_id": "…",
  "incident_id": "inc-1",
  "status": "completed",
  "summary": "Database connection pool exhaustion is causing API timeouts.",
  "root_cause": {
    "hypothesis": "The pool reached its 50-connection limit and requests timed out.",
    "confidence": 0.9,
    "evidence_ids": ["log-102", "metric-17"]
  },
  "affected_services": ["api-service", "database"],
  "alternatives": ["Database CPU saturation", "Connection leak"],
  "recommendations": [
    {"action_id": "sim-reset-pool", "title": "Reset simulated connection pool",
     "risk": "low", "requires_approval": true}
  ],
  "limitations": ["Based on a seeded telemetry window."]
}
```

---

## Tests

```bash
pytest -v
```

Tests mock the LLM, so they need no API key or network. They cover the happy path, sparse or missing logs, prompt injection, secret redaction, malformed model output, invented evidence IDs, provider failure, duplicate triggers, the error shape, and the log loader.

---

## Results

Fill these in with **measured** numbers from your own runs. Do not estimate.

| Metric | Result |
|---|---|
| Automated tests passing | _TBD_ |
| End-to-end clean runs in a row | _TBD_ |
| Labelled scenarios / root-cause accuracy | _TBD (state the sample size)_ |
| Time from trigger to completed report (p50 / p95) | _TBD_ |

---

## Known limitations

- Investigations are stored **in memory**, so they are lost on restart and the server must run as a single process. The record shape matches the planned PostgreSQL `investigations` table.
- Deterministic rules currently cover three signal types: database pool timeouts, blocked event loop, and rejected API tokens.
- Only one simulated action (`sim-reset-pool`) exists. Signals without an allowlisted action produce no recommendation by design.
- Diagnosis quality has only been checked on a small set of scenarios; see Results for the actual sample size.
- Smaller local models can fail schema validation more often than the hosted model.

---

## Security notes

- Keep `.env` out of Git. Rotate any key that is ever committed.
- Raw log files can contain personal data. The loader removes request payloads and numeric user IDs before anything reaches the model, but do not commit unredacted logs.
