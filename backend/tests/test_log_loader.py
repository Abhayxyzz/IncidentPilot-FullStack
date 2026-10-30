import log_loader

SAMPLE = """2026-10-28 09:33:32.096 | INFO     | __main__:main:1 - Starting worker
2026-10-28 09:33:36.674 | WARNING  | logging:callHandlers:1762 - event loop blocked for 150ms at "/usr/lib/python3.12/selectors.py", line 468, in select; synchronous work on the agent loop
2026-10-28 09:33:37.674 | WARNING  | logging:callHandlers:1762 - event loop blocked for 300ms at "/usr/lib/python3.12/selectors.py", line 468, in select; synchronous work on the agent loop
2026-10-28 09:42:11.728 | WARNING  | app.db.mysql_server:add:165 - \u274c [MYSQL-SERVER] Add failed | HTTP 200 | body={'message': 'Token not valid!'} | payload={'Token': '***', 'UserID': 262, 'ChatText': 'private chat text'}
2026-10-28 09:42:12.728 | WARNING  | app.db.mysql_server:add:165 - \u274c [MYSQL-SERVER] Add failed | HTTP 200 | body={'message': 'Token not valid!'} | payload={'Token': '***', 'UserID': 263, 'ChatText': 'more chat'}
2026-10-28 09:42:13.000 | INFO     | app.db.mongo:save:9 - Updated user: 121843
{"message": "duplicate json line", "level": "INFO"}
""".replace("\\u274c", "\u274c")


def load(tmp_path):
    p = tmp_path / "logs.txt"
    p.write_text(SAMPLE, encoding="utf-8")
    return log_loader.load_logs(str(p))


def test_repeated_lines_are_collapsed_with_counts(tmp_path):
    data = load(tmp_path)
    blocked = [l for l in data["logs"] if "event loop blocked" in l["message"]]
    assert len(blocked) == 1 and blocked[0]["message"].startswith("[x2,")
    assert "max 300ms" in blocked[0]["message"]


def test_json_duplicates_skipped_and_all_lines_parsed(tmp_path):
    stats = load(tmp_path)["stats"]
    assert stats["json_duplicate_lines_skipped"] == 1
    assert stats["unparsed_lines"] == 0


def test_warnings_ranked_before_info(tmp_path):
    levels = [l["level"] for l in load(tmp_path)["logs"]]
    assert levels.index("INFO") > max(i for i, v in enumerate(levels) if v == "WARNING")


def test_payloads_and_user_ids_never_reach_evidence(tmp_path):
    blob = str(load(tmp_path))
    for private in ("private chat text", "more chat", "UserID", "121843", "262"):
        assert private not in blob


def test_metrics_derived_and_token_failures_counted(tmp_path):
    metrics = {m["metric_name"]: m["value"] for m in load(tmp_path)["metrics"]}
    assert metrics["event_loop_blocked_count"] == 2
    assert metrics["api_token_rejected_count"] == 2


def test_evidence_ids_unique_and_bounded(tmp_path):
    ids = [l["id"] for l in load(tmp_path)["logs"]]
    assert len(ids) == len(set(ids)) <= log_loader.MAX_ITEMS
