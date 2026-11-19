"""Create and finalize one explicit demo room against a running API (writes demo data)."""

import argparse
import json
from uuid import uuid4

import httpx


def run(base_url: str, origin: str | None = None) -> dict:
    headers = {"X-CSRF-Protection": "1"}
    if origin:
        headers["Origin"] = origin.rstrip("/")
    with httpx.Client(
        base_url=base_url.rstrip("/"),
        timeout=15,
        headers=headers,
    ) as client:

        def post(path, body, key=None):
            response = client.post(
                path,
                json=body,
                headers={"Idempotency-Key": key} if key else {},
            )
            response.raise_for_status()
            return response.json()

        room = post(
            "/api/rooms",
            {
                "space_type": "shared_home",
                "group_name": "接口验收示例",
                "nickname": "验收同伴",
            },
        )
        path = f"/api/rooms/{room['code']}"
        room = post(
            path + "/generate",
            {
                "expected_revision": room["revision"],
                "confirm_suggestions": True,
            },
            str(uuid4()),
        )
        first = room["rules"][0]
        preview = post(f"/api/rules/{first['id']}/swap", {"expected_version": first["version"]})
        assert preview["old_action"] == preview["new_action"]
        room = post(
            f"/api/rules/{first['id']}/swap",
            {
                "expected_version": first["version"],
                "mode": "apply",
                "confirmed": True,
            },
            str(uuid4()),
        )
        rules = room["rules"]
        for rule in rules:
            room = post(f"/api/rules/{rule['id']}/claim", {"expected_version": rule["version"]})
        final_body = {"expected_revision": room["revision"]}
        final_key = str(uuid4())
        room = post(path + "/finalize", final_body, final_key)
        assert post(path + "/finalize", final_body, final_key) == room
        assert room["status"] == "finalized"
        assert room["snapshot"]["participant_count"] == 1
        client.cookies.clear()
        public = client.get(path)
        public.raise_for_status()
        assert public.json()["snapshot"] == room["snapshot"]
        return {
            "result": "PASS",
            "code": room["code"],
            "status": room["status"],
            "rules": len(room["snapshot"]["rules"]),
            "participants": 1,
            "public_room_api": base_url.rstrip("/") + path,
            "frontend_card_path": f"/room/{room['code']}/card",
            "note": "Created a demo room; open frontend_card_path on the frontend origin.",
        }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://127.0.0.1:8000")
    parser.add_argument("--origin", help="Send the frontend Origin on requests, like a browser.")
    args = parser.parse_args()
    print(json.dumps(run(args.base_url, args.origin), ensure_ascii=False, indent=2))
