import json
import types

POOL_LOGS = [
    {"id": "log-100", "timestamp": "2026-10-25T10:02:11Z", "level": "INFO", "service": "api-service",
     "message": "GET /orders 200 in 48ms"},
    {"id": "log-101", "timestamp": "2026-10-25T10:06:40Z", "level": "WARN", "service": "api-service",
     "message": "Database connection pool at 48/50 connections"},
    {"id": "log-102", "timestamp": "2026-10-25T10:07:02Z", "level": "ERROR", "service": "api-service",
     "message": "Database connection pool timeout occurred at connection 50"},
    {"id": "log-103", "timestamp": "2026-10-25T10:07:03Z", "level": "ERROR", "service": "api-service",
     "message": "GET /orders 500 in 30012ms"},
]

POOL_METRICS = [
    {"id": "metric-17", "timestamp": "2026-10-25T10:07:00Z", "metric_name": "db_pool_active",
     "value": 50, "service": "database"},
]


def good_response(**overrides) -> str:
    """A valid model answer that cites evidence present in POOL_LOGS / POOL_METRICS."""
    body = {
        "summary": "Database connection pool exhaustion is causing API timeouts and HTTP 500s.",
        "root_cause": {
            "hypothesis": "The pool reached its 50-connection limit and requests timed out waiting.",
            "confidence": 0.9,
            "evidence_ids": ["log-102", "metric-17"],
        },
        "affected_services": ["api-service", "database"],
        "alternatives": ["Database CPU saturation", "Connection leak"],
        "limitations": ["Based on a seeded telemetry window."],
    }
    body.update(overrides)
    return json.dumps(body)


class FakeClient:
    """Stands in for the OpenAI client. Each item in `responses` is either a string
    (returned as the model's message) or an Exception (raised). The last item repeats."""

    def __init__(self, responses):
        self.responses = list(responses)
        self.prompts = []  # user prompts that were sent
        self.chat = types.SimpleNamespace(completions=types.SimpleNamespace(create=self._create))

    @property
    def calls(self) -> int:
        return len(self.prompts)

    def _create(self, **kwargs):
        self.prompts.append(kwargs["messages"][-1]["content"])
        item = self.responses.pop(0) if len(self.responses) > 1 else self.responses[0]
        if isinstance(item, Exception):
            raise item
        message = types.SimpleNamespace(content=item)
        return types.SimpleNamespace(choices=[types.SimpleNamespace(message=message)])
