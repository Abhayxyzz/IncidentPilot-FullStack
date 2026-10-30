import logging
import os
import threading
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import BackgroundTasks, FastAPI, Path
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from agent import build_investigation_graph

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
logger = logging.getLogger("incidentpilot.api")

app = FastAPI(title="IncidentPilot API", version="1.0")

# Narrow CORS: set FRONTEND_ORIGIN to a comma-separated list in host secrets.
allowed_origins = [
    origin.strip()
    for origin in os.getenv(
        "FRONTEND_ORIGIN",
        "https://incidentpilot-dashboard-7z8wn8rdp-abhayxyzz.vercel.app",
    ).split(",")
    if origin.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_origin_regex=r"https://[A-Za-z0-9-]+\.vercel\.app",
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

# Compile graph once at startup
investigation_graph = build_investigation_graph()

# --------------------------------------------------------------------------
# Consistent error shape: {"error": {"code": "...", "message": "..."}}
# --------------------------------------------------------------------------
class ApiError(Exception):
    def __init__(self, status_code: int, code: str, message: str):
        self.status_code, self.code, self.message = status_code, code, message


@app.exception_handler(ApiError)
async def api_error_handler(_, exc: ApiError):
    return JSONResponse(status_code=exc.status_code,
                        content={"error": {"code": exc.code, "message": exc.message}})


@app.exception_handler(RequestValidationError)
async def validation_error_handler(_, exc: RequestValidationError):
    return JSONResponse(status_code=422,
                        content={"error": {"code": "invalid_request", "message": "Request validation failed."}})


# --------------------------------------------------------------------------
# In-memory investigation store (swap for PostgreSQL `investigations` table
# once the full-stack dev's schema is ready; keep the same dict shape)
# --------------------------------------------------------------------------
INVESTIGATIONS: Dict[str, Dict[str, Any]] = {}
_lock = threading.Lock()

IncidentId = Path(..., pattern=r"^[A-Za-z0-9_-]{1,64}$", description="Incident ID")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _update(inv_id: str, **fields: Any) -> None:
    with _lock:
        INVESTIGATIONS[inv_id].update(fields)


# --------------------------------------------------------------------------
# Seeded demo data. TODO: replace with a DB query for the incident's logs/metrics.
# Every log has a stable ID so the agent can cite it.
# --------------------------------------------------------------------------
SEED_TIME_WINDOW = {"start": "2026-10-25T10:00:00Z", "end": "2026-10-25T10:15:00Z"}


def get_incident_evidence(incident_id: str) -> Dict[str, Any]:
    # Start the server with LOG_FILE=logs.txt (shell env var) to investigate a real log file instead of the seed data
    log_file = os.getenv("LOG_FILE")
    if log_file:
        from log_loader import load_logs
        return load_logs(log_file)

    logs = [
        {"id": "log-100", "timestamp": "2026-10-25T10:02:11Z", "level": "INFO", "service": "api-service",
         "message": "GET /orders 200 in 48ms"},
        {"id": "log-101", "timestamp": "2026-10-25T10:06:40Z", "level": "WARN", "service": "api-service",
         "message": "Database connection pool at 48/50 connections"},
        {"id": "log-102", "timestamp": "2026-10-25T10:07:02Z", "level": "ERROR", "service": "api-service",
         "message": "Database connection pool timeout occurred at connection 50"},
        {"id": "log-103", "timestamp": "2026-10-25T10:07:03Z", "level": "ERROR", "service": "api-service",
         "message": "GET /orders 500 in 30012ms"},
    ]
    metrics = [
        {"id": "metric-17", "timestamp": "2026-10-25T10:07:00Z", "metric_name": "db_pool_active",
         "value": 50, "service": "database"},
        {"id": "metric-18", "timestamp": "2026-10-25T10:07:00Z", "metric_name": "api_error_rate",
         "value": 0.42, "service": "api-service"},
    ]
    return {"logs": logs, "metrics": metrics, "time_window": SEED_TIME_WINDOW}


# --------------------------------------------------------------------------
# Background worker
# --------------------------------------------------------------------------
def run_investigation(inv_id: str) -> None:
    with _lock:
        record = dict(INVESTIGATIONS[inv_id])
    incident_id = record["incident_id"]

    try:
        evidence = get_incident_evidence(incident_id)
        state: Dict[str, Any] = {
            "investigation_id": inv_id,
            "incident_id": incident_id,
            "time_window": evidence.get("time_window") or SEED_TIME_WINDOW,
            "raw_logs": evidence["logs"],
            "metrics_data": evidence["metrics"],
            "evidence": [],
            "deterministic_signals": [],
            "signal_evidence": {},
            "report": None,
            "status": "running",
            "error": None,
        }
        _update(inv_id, status="running", stage="starting")

        # stream() lets us publish per-node progress for the UI to poll
        for step in investigation_graph.stream(state, stream_mode="updates"):
            for node_name, node_update in step.items():
                state.update(node_update or {})
                _update(inv_id, stage=node_name)

        if state.get("status") == "completed" and state.get("report"):
            completed_at = _now()
            started_at = datetime.fromisoformat(record["started_at"])
            duration_s = max(0.0, (datetime.fromisoformat(completed_at) - started_at).total_seconds())
            _update(inv_id, status="completed", stage="done", report=state["report"],
                    error=None, completed_at=completed_at, duration_s=duration_s)
        else:
            _update(inv_id, status="failed", stage="failed",
                    error=state.get("error") or "Investigation did not complete.",
                    completed_at=_now())
    except Exception:
        logger.exception("[%s] investigation crashed", inv_id)
        _update(inv_id, status="failed", stage="failed",
                error="Internal error during investigation.", completed_at=_now())


# --------------------------------------------------------------------------
# Routes
# --------------------------------------------------------------------------
@app.get("/")
def read_root():
    return {"message": "IncidentPilot API is running"}


@app.get("/health")
def health():
    return {"status": "ok"}


def _incident(incident_id: str) -> Dict[str, Any]:
    evidence = get_incident_evidence(incident_id)
    with _lock:
        records = [dict(record) for record in INVESTIGATIONS.values() if record["incident_id"] == incident_id]
    latest = max(records, key=lambda record: record["started_at"], default=None)
    status = "open"
    if latest:
        if latest.get("approved_action_id"):
            status = "resolved"
        elif latest["status"] == "failed":
            status = "open"
        else:
            status = "investigating" if latest["status"] in ("queued", "running") else latest["status"]
        if latest["status"] == "completed" and not latest.get("approved_action_id"):
            status = "action_pending"
    return {
        "id": incident_id,
        "title": "Checkout returning 500s",
        "severity": "critical",
        "status": status,
        "service": "api-service",
        "suspect": "postgres",
        "started_at": evidence.get("time_window", SEED_TIME_WINDOW)["start"],
        "latest_investigation_id": latest["investigation_id"] if latest else None,
    }


@app.get("/api/incidents")
def list_incidents():
    return [_incident("INC-2041")]


@app.get("/api/incidents/{incident_id}/logs")
def get_incident_logs(incident_id: str = IncidentId):
    return [
        {**log, "incident_id": incident_id}
        for log in get_incident_evidence(incident_id).get("logs", [])
    ]


@app.get("/api/incidents/{incident_id}")
def get_incident(incident_id: str = IncidentId):
    incident = _incident(incident_id)
    evidence = get_incident_evidence(incident_id)
    return {
        "incident": incident,
        "latest_investigation_id": incident["latest_investigation_id"],
        "audit_events": [],
        "metrics": {
            "name": "database pool active connections",
            "series": [metric["value"] for metric in evidence.get("metrics", [])],
            "tail": [metric["value"] for metric in evidence.get("metrics", [])],
            "threshold": 50,
        },
        "recovery_note": "",
    }


@app.post("/api/incidents/{incident_id}/investigate", status_code=202)
def trigger_investigation(background_tasks: BackgroundTasks, incident_id: str = IncidentId):
    # Idempotency: a repeated trigger returns the in-flight investigation
    with _lock:
        for rec in INVESTIGATIONS.values():
            if rec["incident_id"] == incident_id and rec["status"] in ("queued", "running"):
                return {"investigation_id": rec["investigation_id"],
                        "incident_id": incident_id, "status": rec["status"]}

        inv_id = str(uuid.uuid4())
        INVESTIGATIONS[inv_id] = {
            "investigation_id": inv_id,
            "incident_id": incident_id,
            "status": "queued",
            "stage": "queued",
            "report": None,
            "error": None,
            "started_at": _now(),
            "completed_at": None,
        }

    background_tasks.add_task(run_investigation, inv_id)
    return {"investigation_id": inv_id, "incident_id": incident_id, "status": "queued"}


@app.get("/api/investigations/{investigation_id}")
def get_investigation(investigation_id: str):
    with _lock:
        record: Optional[Dict[str, Any]] = INVESTIGATIONS.get(investigation_id)
        record = dict(record) if record else None
    if record is None:
        raise ApiError(404, "investigation_not_found", "Investigation not found.")
    return record


@app.post("/api/incidents/{incident_id}/remediations/{action_id}/approve")
def approve_remediation(incident_id: str = IncidentId, action_id: str = Path(..., pattern=r"^[A-Za-z0-9_-]{1,64}$")):
    with _lock:
        records = [record for record in INVESTIGATIONS.values() if record["incident_id"] == incident_id]
        latest = max(records, key=lambda record: record["started_at"], default=None)
        if latest is None or latest["status"] != "completed":
            raise ApiError(409, "investigation_not_complete", "Complete an investigation before approving a remediation.")
        latest["status"] = "completed"
        latest["approved_action_id"] = action_id
    return {"status": "approved", "incident_id": incident_id, "action_id": action_id}


@app.post("/api/demo/reset")
def reset_demo():
    with _lock:
        INVESTIGATIONS.clear()
    return {"status": "reset"}