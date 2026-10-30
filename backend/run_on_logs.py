"""Run the full investigation graph on a real log file and print the result.

Usage:  python run_on_logs.py logs.txt
Preview only (no LLM call):  python log_loader.py logs.txt
Needs ENVIRONMENT=prod + NEBIUS_API_KEY in .env for Nebius (or Ollama running for ENVIRONMENT=local).
"""
import json
import sys
import time
import uuid

from agent import build_investigation_graph
from log_loader import load_logs

path = sys.argv[1] if len(sys.argv) > 1 else "logs.txt"
data = load_logs(path)
print(f"Loaded {path}: {data['stats']}")

state = {
    "investigation_id": str(uuid.uuid4()),
    "incident_id": "inc-real-logs",
    "time_window": data["time_window"],
    "raw_logs": data["logs"],
    "metrics_data": data["metrics"],
    "evidence": [],
    "deterministic_signals": [],
    "signal_evidence": {},
    "report": None,
    "status": "queued",
    "error": None,
}

t0 = time.time()
result = build_investigation_graph().invoke(state)
print(f"\nStatus: {result['status']}  ({time.time() - t0:.1f}s)")
print("Deterministic signals:", result["deterministic_signals"])
print("Signal -> evidence IDs:", json.dumps(result["signal_evidence"]))
if result.get("error"):
    print("ERROR:", result["error"])
if result.get("report"):
    print(json.dumps(result["report"], indent=2, ensure_ascii=False))
