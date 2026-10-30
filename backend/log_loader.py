"""Turn a raw text log file (loguru format) into a bounded evidence bundle for the agent.

Why this exists: the agent only sees ~30 evidence items. Sending the first 30 raw lines
of an 800-line file would mostly be startup noise and miss the real errors. So we
collapse repeated lines into templates (with counts) and rank warnings/errors first.

Run `python log_loader.py logs.txt` to preview exactly what would be sent (no LLM needed).
"""
import json
import re
import statistics
import sys
from collections import Counter, OrderedDict
from pathlib import Path
from typing import Any, Dict, List

MAX_ITEMS = 25  # leave headroom under agent.MAX_EVIDENCE (30)

# 2026-10-28 09:33:32.096 | INFO     | module:function:123 - message
LINE_RE = re.compile(r"^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}) \| (\w+)\s*\| (.+?) - (.*)$")
BLOCKED_RE = re.compile(r'event loop blocked for (\d+)ms(?: at "([^"]+)", line (\d+), in (\w+))?')

_NON_ASCII = re.compile(r"[^\x00-\x7F]+")
_QUOTED_ID = re.compile(r"'[A-Za-z0-9_]{8,}'")
_PREFIXED_ID = re.compile(r"\b[A-Za-z]{2,4}_[A-Za-z0-9]{6,}\b")
_DIGITS = re.compile(r"\d+")
_USER_ID = re.compile(r"(?i)\b(user[_ ]?id\s*[=:]\s*|updated user:\s*)\d+")


def _clean(msg: str) -> str:
    msg = msg.split(" | payload=")[0]          # payloads hold user IDs and chat text: never send
    msg = _NON_ASCII.sub("", msg)              # drop emoji / non-latin chat text
    msg = _USER_ID.sub(r"\1[USER]", msg)       # numeric user IDs are personal data
    return re.sub(r"\s+", " ", msg).strip()


def _template(msg: str) -> str:
    msg = _QUOTED_ID.sub("'X'", msg)
    msg = _PREFIXED_ID.sub("X", msg)
    return _DIGITS.sub("N", msg)


def parse_lines(text: str):
    entries, skipped_json, skipped_other = [], 0, 0
    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            continue
        if line.startswith("{"):               # JSON duplicate of a line already logged as text
            skipped_json += 1
            continue
        m = LINE_RE.match(line)
        if not m:
            skipped_other += 1
            continue
        ts, level, loc, msg = m.groups()
        entries.append({"ts": ts, "level": level.upper(), "service": loc.split(":")[0], "msg": msg})
    return entries, skipped_json, skipped_other


def _blocked_item(blocked: List[Dict[str, Any]]) -> Dict[str, Any]:
    ms = [b["ms"] for b in blocked]
    frames = Counter(b["frame"] for b in blocked if b["frame"])
    top = ", ".join(f"{f} x{c}" for f, c in frames.most_common(3))
    return {
        "level": "WARNING",
        "service": "livekit-runtime",
        "first": blocked[0]["ts"],
        "last": blocked[-1]["ts"],
        "count": len(blocked),
        "message": (f"event loop blocked (synchronous work delays audio/turn handling): min {min(ms)}ms, "
                    f"median {int(statistics.median(ms))}ms, max {max(ms)}ms; most common blocking frames: {top}"),
    }


def load_logs(path: str) -> Dict[str, Any]:
    text = Path(path).read_text(encoding="utf-8", errors="replace")
    entries, skipped_json, skipped_other = parse_lines(text)
    if not entries:
        return {"logs": [], "metrics": [], "time_window": {}, "stats": {"lines_parsed": 0}}

    blocked: List[Dict[str, Any]] = []
    groups: "OrderedDict[tuple, Dict[str, Any]]" = OrderedDict()

    for e in entries:
        b = BLOCKED_RE.search(e["msg"])
        if b:
            frame = f"{Path(b.group(2)).name}:{b.group(4)}" if b.group(2) else ""
            blocked.append({"ts": e["ts"], "ms": int(b.group(1)), "frame": frame})
            continue
        msg = _clean(e["msg"])
        key = (e["level"], e["service"], _template(msg))
        g = groups.get(key)
        if g is None:
            groups[key] = {"level": e["level"], "service": e["service"], "first": e["ts"],
                           "last": e["ts"], "count": 1, "message": msg}
        else:
            g["count"] += 1
            g["last"] = e["ts"]

    items = list(groups.values())
    if blocked:
        items.append(_blocked_item(blocked))

    severity = {"CRITICAL": 0, "ERROR": 0, "WARNING": 1, "WARN": 1}
    items.sort(key=lambda g: (severity.get(g["level"], 2), -g["count"], g["first"]))
    kept, dropped = items[:MAX_ITEMS], max(0, len(items) - MAX_ITEMS)

    logs = []
    for i, g in enumerate(kept):
        span = g["first"][11:23] if g["count"] == 1 else f"{g['first'][11:19]}-{g['last'][11:19]}"
        logs.append({
            "id": f"log-{i}",
            "timestamp": g["first"].replace(" ", "T"),
            "level": g["level"],
            "service": g["service"],
            "message": f"[x{g['count']}, {span}] {g['message']}",
        })

    metrics: List[Dict[str, Any]] = []
    if blocked:
        ms = [b["ms"] for b in blocked]
        for name, val in (("event_loop_blocked_count", len(ms)), ("event_loop_blocked_max_ms", max(ms)),
                          ("event_loop_blocked_median_ms", int(statistics.median(ms)))):
            metrics.append({"id": f"metric-{len(metrics)}", "timestamp": entries[-1]["ts"].replace(" ", "T"),
                            "metric_name": name, "value": val, "service": "livekit-runtime"})
    token_rejects = sum(g["count"] for g in groups.values() if "token not valid" in g["message"].lower())
    if token_rejects:
        metrics.append({"id": f"metric-{len(metrics)}", "timestamp": entries[-1]["ts"].replace(" ", "T"),
                        "metric_name": "api_token_rejected_count", "value": token_rejects,
                        "service": "app.db.mysql_server"})

    return {
        "logs": logs,
        "metrics": metrics,
        "time_window": {"start": entries[0]["ts"].replace(" ", "T"), "end": entries[-1]["ts"].replace(" ", "T")},
        "stats": {"lines_parsed": len(entries), "json_duplicate_lines_skipped": skipped_json,
                  "unparsed_lines": skipped_other, "templates": len(items), "templates_dropped": dropped},
    }


if __name__ == "__main__":
    data = load_logs(sys.argv[1] if len(sys.argv) > 1 else "logs.txt")
    print(json.dumps(data["stats"], indent=2))
    print(json.dumps(data["time_window"]))
    for m in data["metrics"]:
        print("METRIC", m["id"], m["metric_name"], m["value"])
    for l in data["logs"]:
        print(f"{l['id']:7} {l['level']:8} {l['service']:22} {l['message'][:150]}")
