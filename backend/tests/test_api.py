import pytest
from fastapi.testclient import TestClient
from openai import OpenAIError

from helpers import good_response

SEEDED_IDS = {"log-100", "log-101", "log-102", "log-103", "metric-17", "metric-18"}


@pytest.fixture
def client():
    import main

    main.INVESTIGATIONS.clear()
    with TestClient(main.app) as c:
        yield c
    main.INVESTIGATIONS.clear()


def test_trigger_returns_202_and_poll_shows_completed_report(client, install_llm):
    install_llm(good_response())

    resp = client.post("/api/incidents/inc-1/investigate")
    assert resp.status_code == 202
    body = resp.json()
    assert body["status"] == "queued"
    assert body["incident_id"] == "inc-1"
    inv_id = body["investigation_id"]
    assert inv_id != "inv-uuid-123"  # real, unique IDs

    # TestClient runs background tasks before returning, so the result is ready to poll
    got = client.get(f"/api/investigations/{inv_id}")
    assert got.status_code == 200
    data = got.json()
    assert data["status"] == "completed"
    assert data["stage"] == "done"
    assert data["error"] is None
    assert [r["action_id"] for r in data["report"]["recommendations"]] == ["sim-reset-pool"]
    assert set(data["report"]["root_cause"]["evidence_ids"]) <= SEEDED_IDS


def test_each_completed_run_gets_a_new_investigation_id(client, install_llm):
    install_llm(good_response())
    first = client.post("/api/incidents/inc-1/investigate").json()["investigation_id"]
    second = client.post("/api/incidents/inc-1/investigate").json()["investigation_id"]
    assert first != second


def test_duplicate_trigger_returns_inflight_investigation(client, install_llm):
    import main

    fake = install_llm(good_response())
    main.INVESTIGATIONS["existing-inv"] = {
        "investigation_id": "existing-inv", "incident_id": "inc-1", "status": "running",
        "stage": "collect_evidence", "report": None, "error": None,
        "started_at": "2026-10-25T10:00:00+00:00", "completed_at": None,
    }

    resp = client.post("/api/incidents/inc-1/investigate")
    assert resp.status_code == 202
    assert resp.json()["investigation_id"] == "existing-inv"
    assert resp.json()["status"] == "running"
    assert len(main.INVESTIGATIONS) == 1
    assert fake.calls == 0  # no second LLM run started


def test_unknown_investigation_returns_consistent_error_shape(client):
    resp = client.get("/api/investigations/does-not-exist")
    assert resp.status_code == 404
    err = resp.json()["error"]
    assert err["code"] == "investigation_not_found"
    assert err["message"]


def test_invalid_incident_id_is_rejected(client, install_llm):
    install_llm(good_response())
    resp = client.post("/api/incidents/" + "a" * 65 + "/investigate")
    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == "invalid_request"


def test_llm_failure_becomes_failed_status_without_leaking_details(client, install_llm):
    install_llm(OpenAIError("internal-provider-detail"))

    inv_id = client.post("/api/incidents/inc-1/investigate").json()["investigation_id"]
    data = client.get(f"/api/investigations/{inv_id}").json()

    assert data["status"] == "failed"
    assert data["report"] is None
    assert data["error"]
    assert "internal-provider-detail" not in data["error"]


def test_malformed_model_output_becomes_failed_status(client, install_llm):
    install_llm("not json at all")
    inv_id = client.post("/api/incidents/inc-1/investigate").json()["investigation_id"]
    data = client.get(f"/api/investigations/{inv_id}").json()
    assert data["status"] == "failed"
    assert data["report"] is None


def test_demo_reset_clears_investigations(client, install_llm):
    install_llm(good_response())
    inv_id = client.post("/api/incidents/inc-1/investigate").json()["investigation_id"]

    assert client.post("/api/demo/reset").json() == {"status": "reset"}
    assert client.get(f"/api/investigations/{inv_id}").status_code == 404


def test_health(client):
    assert client.get("/health").json() == {"status": "ok"}


def test_dashboard_incident_bundle_routes(client):
    assert client.get("/api/incidents").json()[0]["id"] == "INC-2041"
    detail = client.get("/api/incidents/INC-2041").json()
    assert detail["incident"]["status"] == "open"
    assert detail["metrics"]["series"]
    assert client.get("/api/incidents/INC-2041/logs").json()[0]["incident_id"] == "INC-2041"


def test_completed_investigation_includes_dashboard_fields_and_approval(client, install_llm):
    install_llm(good_response())
    inv_id = client.post("/api/incidents/INC-2041/investigate").json()["investigation_id"]
    result = client.get(f"/api/investigations/{inv_id}").json()
    assert result["duration_s"] >= 0
    recommendation = result["report"]["recommendations"][0]
    assert recommendation["description"]
    assert client.post(
        "/api/incidents/INC-2041/remediations/sim-reset-pool/approve",
        json={"approver": "test engineer"},
    ).status_code == 200
    assert client.get("/api/incidents/INC-2041").json()["incident"]["status"] == "resolved"
