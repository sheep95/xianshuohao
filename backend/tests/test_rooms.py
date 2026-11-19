import json
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.core.config import Settings
from app.main import create_app
from app.models.entities import FinalizedSnapshot, Identity, Room
from app.services import llm

WRITE = {"X-CSRF-Protection": "1"}


def post(client, path, body, key=None):
    headers = {**WRITE, **({"Idempotency-Key": key} if key else {})}
    return client.post(path, json=body, headers=headers)


def create(client, **changes):
    response = post(client, "/api/rooms", {"space_type": "shared_home", **changes})
    assert response.status_code == 201, response.text
    return response.json()


def draft(client, **changes):
    room = create(client, **changes)
    response = post(
        client,
        f"/api/rooms/{room['code']}/generate",
        {
            "expected_revision": room["revision"],
            "confirm_suggestions": True,
        },
        "generate-0001",
    )
    assert response.status_code == 200, response.text
    return response.json()


def claim_all(client, room):
    for rule in room["rules"]:
        response = post(
            client,
            f"/api/rules/{rule['id']}/claim",
            {
                "expected_version": rule["version"],
            },
        )
        assert response.status_code == 200, response.text
        current = response.json()
    return current


def test_custom_hint_is_saved_and_follows_the_selected_behavior(client, monkeypatch):
    hint = "先按静音，再回一个收到。"
    rewrite = llm.rewrite

    def inspect_inputs(settings, inputs):
        assert all(item["execution_hint"] != hint for item in inputs)
        return rewrite(settings, inputs)

    monkeypatch.setattr(llm, "rewrite", inspect_inputs)
    selection = {"friction_key": "night_sound", "level_id": "headphones_2200"}
    room = draft(client, selections=[{**selection, "custom_execution_hint": f" {hint} "}])
    assert room["selections"][0]["execution_hint"] == hint
    assert room["rules"][0]["execution_hint"] == hint
    rule = room["rules"][0]
    path = f"/api/rules/{rule['id']}/swap"
    body = {"expected_version": rule["version"]}
    assert post(client, path, body).json()["execution_hint"] == hint
    library = client.get("/api/rule-library").json()
    friction = next(item for item in library["frictions"] if item["key"] == "night_sound")
    changed_level = {**body, "target_level_id": friction["levels"][1]["id"]}
    preview = post(client, path, changed_level).json()
    assert preview["boundary_changed"]
    assert preview["execution_hint"] != hint

    room = post(
        client, path, {**body, "mode": "apply", "confirmed": True}, "custom-swap-0001"
    ).json()
    assert room["rules"][0]["execution_hint"] == hint
    room = claim_all(client, room)
    response = post(
        client, f"/api/rooms/{room['code']}/finalize",
        {"expected_revision": room["revision"]}, "custom-finalize-0001",
    )
    assert response.status_code == 200, response.text
    assert response.json()["snapshot"]["rules"][0]["execution_hint"] == hint
    client.cookies.clear()
    public = client.get(f"/api/rooms/{room['code']}").json()
    assert public["snapshot"]["rules"][0]["execution_hint"] == hint


@pytest.mark.parametrize("invalid_hint", ["<script>", "两行\n文字", "退" * 61])
def test_invalid_custom_hint_is_rejected(client, invalid_hint):
    response = post(client, "/api/rooms", {
        "space_type": "shared_home",
        "selections": [{
            "friction_key": "night_sound",
            "level_id": "headphones_2200",
            "custom_execution_hint": invalid_hint,
        }],
    })
    assert response.status_code == 422


def test_single_person_complete_flow_and_immutable_snapshot(client):
    room = draft(client, group_name="四楼小屋")
    assert len(room["rules"]) == 5
    assert all(r["action"] in r["text"] for r in room["rules"])
    room = claim_all(client, room)
    body = {"expected_revision": room["revision"]}
    response = post(client, f"/api/rooms/{room['code']}/finalize", body, "finalize-0001")
    assert response.status_code == 200, response.text
    finished = response.json()
    assert finished["status"] == "finalized"
    assert finished["snapshot"]["participant_count"] == 1
    assert len(finished["snapshot"]["rules"]) == 5
    assert finished["snapshot"]["oath"].endswith("约定生效时刻：现在。")
    assert "nickname" not in json.dumps(finished["snapshot"])
    retry = post(client, f"/api/rooms/{room['code']}/finalize", body, "finalize-0001")
    assert retry.json() == finished
    rule = room["rules"][0]
    assert (
        post(client, f"/api/rules/{rule['id']}/claim", {"expected_version": 1}).status_code == 409
    )
    assert post(client, f"/api/rules/{rule['id']}/swap", {"expected_version": 1}).status_code == 409
    client.cookies.clear()
    assert post(client, f"/api/rooms/{room['code']}/join", {}).status_code == 409
    public = client.get(f"/api/rooms/{room['code']}").json()
    assert public["snapshot"] == finished["snapshot"]
    assert all(r["claims"] == [] for r in public["rules"])


def test_swap_rejects_new_claims_after_preview(client):
    room = draft(client)
    rule = room["rules"][0]
    path = f"/api/rules/{rule['id']}/swap"
    preview = post(client, path, {"expected_version": 1}).json()
    post(client, f"/api/rules/{rule['id']}/claim", {"expected_version": 1})
    body = {
        "expected_version": 1, "expected_claim_count": preview["claims_to_clear"],
        "mode": "apply", "confirmed": True,
    }
    rejected = post(client, path, body, "stale-claims-01")
    assert rejected.status_code == 409
    assert rejected.json()["detail"]["code"] == "claims_changed"
    current = client.get(f"/api/rooms/{room['code']}").json()["rules"][0]
    assert current["version"] == 1
    assert current["claim_count"] == 1
    body["expected_claim_count"] = 1
    accepted = post(client, path, body, "fresh-claims-01")
    assert accepted.status_code == 200
    assert accepted.json()["rules"][0]["claim_count"] == 0
    assert post(client, path, body, "fresh-claims-01").json() == accepted.json()


def test_legacy_snapshot_oath_remains_unchanged_after_rebrand(client):
    room = claim_all(client, draft(client))
    finalized = post(client, f"/api/rooms/{room['code']}/finalize",
                     {"expected_revision": room["revision"]}, "legacy-card-01").json()
    # Simulate a snapshot persisted before the presentation rename.
    legacy = {**finalized["snapshot"], "oath": "我们通过本宪法。第一条生效时刻：现在。"}
    with Session(client.app.state.engine) as session:
        saved = session.get(FinalizedSnapshot, room["id"])
        saved.content = legacy
        session.add(saved)
        session.commit()
    client.cookies.clear()
    assert client.get(f"/api/rooms/{room['code']}").json()["snapshot"] == legacy


def test_suggestions_are_visible_and_must_be_confirmed(client):
    room = create(client, selections=[{"friction_key": "night_sound", "level_id": "quiet_2300"}])
    assert len(room["selections"]) == 5
    assert sum(s["suggested"] for s in room["selections"]) == 4
    body = {"expected_revision": room["revision"]}
    response = post(client, f"/api/rooms/{room['code']}/generate", body, "generate-0001")
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "suggestions_unconfirmed"
    assert client.get(f"/api/rooms/{room['code']}").json()["rules"] == []
    body["confirm_suggestions"] = True
    response = post(client, f"/api/rooms/{room['code']}/generate", body, "generate-0001")
    assert response.status_code == 200
    assert (
        post(client, f"/api/rooms/{room['code']}/generate", body, "generate-0001").json()
        == response.json()
    )
    assert (
        post(client, f"/api/rooms/{room['code']}/generate", body, "generate-0002").status_code
        == 409
    )
    body["expected_revision"] += 1
    assert (
        post(client, f"/api/rooms/{room['code']}/generate", body, "generate-0001").status_code
        == 409
    )


def test_explicit_five_selections_need_no_supplement_consent(client):
    defaults = client.get("/api/rule-library").json()["spaces"][0]["default_selection"]
    room = create(client, selections=defaults)
    assert not any(s["suggested"] for s in room["selections"])
    assert (
        post(
            client,
            f"/api/rooms/{room['code']}/generate",
            {
                "expected_revision": room["revision"],
            },
            "generate-0001",
        ).status_code
        == 200
    )


def test_same_nickname_does_not_impersonate_owner_and_join_is_idempotent(client):
    room = draft(client, nickname="同学")
    owner_cookie = client.cookies.get("constitution_session")
    client.cookies.clear()
    joined = post(client, f"/api/rooms/{room['code']}/join", {"nickname": "同学"}).json()
    assert joined["participant_count"] == 2
    assert not joined["viewer"]["is_owner"]
    assert joined["viewer"]["participant_id"] != room["viewer"]["participant_id"]
    again = post(client, f"/api/rooms/{room['code']}/join", {}).json()
    assert again == joined
    joined = claim_all(client, joined)
    assert (
        post(
            client,
            f"/api/rooms/{room['code']}/finalize",
            {
                "expected_revision": joined["revision"],
            },
            "finalize-0001",
        ).status_code
        == 403
    )
    client.cookies.clear()
    client.cookies.set("constitution_session", owner_cookie)
    response = post(
        client,
        f"/api/rooms/{room['code']}/finalize",
        {
            "expected_revision": joined["revision"],
        },
        "finalize-0001",
    )
    assert response.status_code == 200
    assert response.json()["snapshot"]["participant_count"] == 2


def test_swap_keeps_boundary_clears_claims_and_rejects_stale_claim(client):
    room = draft(client)
    rule = room["rules"][0]
    claimed = post(client, f"/api/rules/{rule['id']}/claim", {"expected_version": 1}).json()
    retry = post(client, f"/api/rules/{rule['id']}/claim", {"expected_version": 1}).json()
    assert retry == claimed
    preview = post(client, f"/api/rules/{rule['id']}/swap", {"expected_version": 1}).json()
    assert preview["old_action"] == preview["new_action"]
    assert preview["claims_to_clear"] == 1
    assert preview["requires_owner"]
    body = {"expected_version": 1, "mode": "apply", "confirmed": True}
    result = post(client, f"/api/rules/{rule['id']}/swap", body, "swap-0001")
    assert result.status_code == 200, result.text
    swapped = result.json()["rules"][0]
    assert swapped["action"] == rule["action"]
    assert swapped["text"] != rule["text"]
    assert swapped["version"] == 2
    assert swapped["claim_count"] == 0
    assert swapped["status"] == "debating"
    assert post(client, f"/api/rules/{rule['id']}/swap", body, "swap-0001").json() == result.json()
    assert (
        post(client, f"/api/rules/{rule['id']}/claim", {"expected_version": 1}).status_code == 409
    )
    assert (
        post(client, f"/api/rules/{rule['id']}/claim", {"expected_version": 2}).status_code == 200
    )


def test_swap_boundary_change_and_claimed_rule_owner_permission(client):
    room = draft(client)
    rule = room["rules"][0]
    path = f"/api/rules/{rule['id']}/swap"
    body = {"expected_version": 1, "target_level_id": "headphones_2200"}
    preview = post(client, path, body).json()
    assert preview["boundary_changed"]
    assert "22:00" in preview["new_action"]
    assert post(client, path, {**body, "mode": "apply"}, "swap-0001").status_code == 409
    assert post(client, path, {**body, "mode": "apply", "confirmed": True}).status_code == 422
    post(client, f"/api/rules/{rule['id']}/claim", {"expected_version": 1})
    client.cookies.clear()
    post(client, f"/api/rooms/{room['code']}/join", {})
    assert (
        post(client, path, {**body, "mode": "apply", "confirmed": True}, "swap-0002").status_code
        == 403
    )


def test_finalize_requires_every_rule_and_latest_revision(client):
    room = draft(client)
    path = f"/api/rooms/{room['code']}/finalize"
    assert (
        post(client, path, {"expected_revision": room["revision"]}, "finalize-0001").json()[
            "detail"
        ]["code"]
        == "unclaimed_rules"
    )
    claimed = claim_all(client, room)
    assert (
        post(client, path, {"expected_revision": room["revision"]}, "finalize-0001").json()[
            "detail"
        ]["code"]
        == "stale_revision"
    )
    assert (
        post(client, path, {"expected_revision": claimed["revision"]}, "finalize-0001").status_code
        == 200
    )


@pytest.mark.parametrize(
    "changes",
    [
        {"space_type": "unknown"},
        {"group_name": " "},
        {"nickname": "<b>x</b>"},
        {"group_name": "x" * 41},
        {"nickname": "x\nname"},
        {"status": "finalized"},
        {"selections": [{"friction_key": "time_slots", "level_id": "register_slot"}]},
        {"selections": [{"friction_key": "night_sound", "level_id": "fake"}]},
        {"selections": [{"friction_key": "night_sound", "level_id": "quiet_2300"}] * 2},
    ],
)
def test_invalid_input_is_rejected_without_partial_rows(client, changes):
    response = post(client, "/api/rooms", {"space_type": "shared_home", **changes})
    assert response.status_code == 422, response.text
    with Session(client.app.state.engine) as session:
        assert session.exec(select(Room)).all() == []
        assert session.exec(select(Identity)).all() == []


def test_anonymous_public_reads_hide_nicknames_and_credentials(client):
    room = draft(client, nickname="私密昵称")
    room = claim_all(client, room)
    assert room["rules"][0]["claims"][0]["nickname"] == "私密昵称"
    client.cookies.clear()
    response = client.get(f"/api/rooms/{room['code']}")
    assert "私密昵称" not in response.text
    assert "token_hash" not in response.text
    assert response.headers["cache-control"] == "no-store"
    rule = room["rules"][0]
    assert (
        post(client, f"/api/rules/{rule['id']}/claim", {"expected_version": 1}).status_code == 403
    )
    assert (
        post(
            client, f"/api/rooms/{room['code']}/generate", {"expected_revision": 1}, "generate-0001"
        ).status_code
        == 403
    )


def test_examples_match_static_json_and_internal_reason_not_exposed(client):
    static = Path(__file__).parents[2] / "frontend/src/data/examples.json"
    assert client.get("/api/examples").json() == json.loads(static.read_text(encoding="utf-8"))
    assert "real_friction" not in client.get("/api/rule-library").text
    assert client.get("/api/rooms/UNKNOWN").status_code == 404
    assert post(client, "/api/rules/missing/claim", {"expected_version": 1}).status_code == 404


def test_csrf_origin_and_session_storage(client):
    assert client.post("/api/rooms", json={"space_type": "shared_home"}).status_code == 403
    response = client.post(
        "/api/rooms",
        json={"space_type": "shared_home"},
        headers={
            **WRITE,
            "Origin": "https://evil.example",
        },
    )
    assert response.status_code == 403
    response = post(client, "/api/rooms", {"space_type": "shared_home"})
    assert response.status_code == 201
    cookie = response.headers["set-cookie"]
    assert "HttpOnly" in cookie and "SameSite=lax" in cookie and "Path=/api" in cookie
    token = client.cookies.get("constitution_session")
    with Session(client.app.state.engine) as session:
        identity = session.exec(select(Identity)).one()
        assert len(identity.token_hash) == 64 and identity.token_hash != token
        identity.expires_at = datetime.now(UTC) - timedelta(seconds=1)
        session.add(identity)
        session.commit()
    room = response.json()
    assert client.get(f"/api/rooms/{room['code']}").json()["viewer"] is None


def test_write_limiter_is_bounded_and_returns_retry(client):
    client.app.state.write_limiter.limit = 1
    create(client)
    response = post(client, "/api/rooms", {"space_type": "short_stay"})
    assert response.status_code == 429
    assert response.headers["retry-after"] == "60"
    assert client.get("/api/examples").status_code == 200


def test_concurrent_duplicate_claim_and_swap_are_serialized(client):
    room = draft(client)
    rule = room["rules"][0]
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(
            pool.map(
                lambda _: post(
                    client,
                    f"/api/rules/{rule['id']}/claim",
                    {
                        "expected_version": 1,
                    },
                ),
                range(2),
            )
        )
    assert [r.status_code for r in results] == [200, 200]
    assert client.get(f"/api/rooms/{room['code']}").json()["rules"][0]["claim_count"] == 1
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(
            pool.map(
                lambda n: post(
                    client,
                    f"/api/rules/{rule['id']}/swap",
                    {
                        "expected_version": 1,
                        "mode": "apply",
                        "confirmed": True,
                    },
                    f"swap-concurrent-{n}",
                ),
                range(2),
            )
        )
    assert sorted(r.status_code for r in results) == [200, 409]
    assert client.get(f"/api/rooms/{room['code']}").json()["rules"][0]["version"] == 2


def test_room_and_owner_survive_restart(tmp_path):
    settings = Settings(
        _env_file=None, app_env="test", database_url=f"sqlite:///{tmp_path}/persist.db"
    )
    with TestClient(create_app(settings)) as first:
        room = draft(first)
        token = first.cookies.get("constitution_session")
    with TestClient(create_app(settings)) as second:
        second.cookies.set("constitution_session", token)
        saved = second.get(f"/api/rooms/{room['code']}").json()
        assert saved == room


def test_concurrent_generation_and_cross_room_authority(client):
    room = create(client)
    body = {"expected_revision": room["revision"], "confirm_suggestions": True}
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(
            pool.map(
                lambda _: post(
                    client,
                    f"/api/rooms/{room['code']}/generate",
                    body,
                    "generate-concurrent",
                ),
                range(2),
            )
        )
    assert [response.status_code for response in results] == [200, 200]
    room = results[0].json()
    assert len(room["rules"]) == 5
    assert results[1].json()["revision"] == room["revision"]
    client.cookies.clear()
    create(client, space_type="club_room")
    rule = room["rules"][0]
    assert (
        post(
            client,
            f"/api/rules/{rule['id']}/claim",
            {
                "expected_version": rule["version"],
            },
        ).status_code
        == 403
    )


def test_confirmed_boundary_change_and_finalization_date(client, monkeypatch):
    room = draft(client)
    rule = room["rules"][0]
    response = post(
        client,
        f"/api/rules/{rule['id']}/swap",
        {
            "expected_version": 1,
            "target_level_id": "headphones_2200",
            "mode": "apply",
            "confirmed": True,
        },
        "swap-boundary",
    )
    assert response.status_code == 200
    room = response.json()
    assert "22:00" in room["rules"][0]["action"]
    assert room["selections"][0]["level_id"] == "headphones_2200"
    room = claim_all(client, room)
    fixed = datetime(2026, 11, 18, 23, 30, tzinfo=UTC)
    monkeypatch.setattr("app.services.rooms.utcnow", lambda: fixed)
    result = post(
        client,
        f"/api/rooms/{room['code']}/finalize",
        {
            "expected_revision": room["revision"],
        },
        "finalize-date",
    )
    assert result.status_code == 200
    snapshot = result.json()["snapshot"]
    assert snapshot["adopted_date"] == "2026-11-19"
    assert datetime.fromisoformat(snapshot["expires_at"]) - fixed == timedelta(days=7)
