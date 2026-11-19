import asyncio
import copy
import json
import logging
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import httpx
import pytest
from pydantic import SecretStr, ValidationError

from app.core.config import Settings
from app.services import llm
from app.services.rule_engine import generate_rules, validate_rewrite
from app.services.rule_library import load_rule_library

HEADERS = {"X-CSRF-Protection": "1", "Idempotency-Key": "generate-model-01"}
TITLES = [
    "游戏开麦，整屋被迫连麦。",
    "熬夜加场，顶灯抢戏。",
    "放在桌上，不代表加入共享套餐。",
    "聚会散场，杂物不续杯。",
    "调温不搞秘密行动。",
]


def configured():
    return Settings(_env_file=None, app_env="test", llm_api_key="test-key", llm_model="test-model")


def inputs_for_library():
    library = load_rule_library()
    selections = [s.model_dump() for s in library.spaces[0].default_selection]
    inputs = []
    for selection in selections:
        friction = next(f for f in library.frictions if f.key == selection["friction_key"])
        level = next(item for item in friction.levels if item.id == selection["level_id"])
        inputs.append({
            **selection, "real_friction": friction.real_friction,
            "action": level.action, "execution_hint": level.execution_hint,
        })
    return library, selections, inputs


def reply(inputs):
    return {"rules": [{
        **{key: value for key, value in item.items() if key != "action"},
        "text": TITLES[index] + " " + item["action"],
    } for index, item in enumerate(inputs)]}


def provider_response(inputs):
    return {"choices": [{"finish_reason": "stop", "message": {
        "content": json.dumps(reply(inputs), ensure_ascii=False),
    }}]}


def install_provider(monkeypatch, client, change=None):
    calls = []
    client.app.state.settings.llm_api_key = SecretStr("test-secret-not-for-output")
    client.app.state.settings.llm_model = "test-model"
    original = llm.complete

    async def handler(request):
        payload = json.loads(request.content)
        calls.append(payload)
        inputs = json.loads(payload["messages"][1]["content"])["rules"]
        content = reply(inputs)
        if change:
            change(content)
        return httpx.Response(200, json={"choices": [{"finish_reason": "stop", "message": {
            "content": json.dumps(content, ensure_ascii=False),
        }}]})

    async def bounded(settings, inputs):
        return await original(settings, inputs, transport=httpx.MockTransport(handler))

    monkeypatch.setattr(llm, "complete", bounded)
    return calls


def create(client):
    result = client.post("/api/rooms", headers=HEADERS, json={
        "space_type": "shared_home", "group_name": "不发送的群名", "nickname": "不发送的昵称",
    })
    assert result.status_code == 201
    return result.json()


def generate(client, room, **changes):
    return client.post(f"/api/rooms/{room['code']}/generate", headers=HEADERS, json={
        "expected_revision": room["revision"], "confirm_suggestions": True, **changes,
    })


def test_compatible_request_contract_and_secret_header():
    _, _, inputs = inputs_for_library()
    calls = []

    def handler(request):
        calls.append(request)
        assert str(request.url) == "https://api.openai.com/v1/chat/completions"
        assert request.headers["authorization"] == "Bearer test-key"
        payload = json.loads(request.content)
        assert payload["response_format"] == {"type": "json_object"}
        assert payload["stream"] is False and payload["model"] == "test-model"
        assert json.loads(payload["messages"][1]["content"])["rules"] == inputs
        assert "test-key" not in request.content.decode()
        assert "自检" in payload["messages"][0]["content"]
        return httpx.Response(200, json=provider_response(inputs))

    result = asyncio.run(llm.complete(configured(), inputs, transport=httpx.MockTransport(handler)))
    assert result.outcome == "received" and len(calls) == 1
    assert json.loads(result.content) == reply(inputs)


@pytest.mark.parametrize("key,model", [(None, "test"), ("", "test"), ("key", ""), ("key", " ")])
def test_missing_config_never_opens_network(key, model):
    def unexpected(_request):
        pytest.fail("network request without complete configuration")

    settings = Settings(_env_file=None, llm_api_key=key, llm_model=model)
    result = asyncio.run(llm.complete(settings, [], transport=httpx.MockTransport(unexpected)))
    assert result.outcome == "unconfigured" and result.content is None


@pytest.mark.parametrize("status", [301, 401, 429, 500, 503])
def test_provider_errors_and_redirects_do_not_retry(status):
    calls = []

    def handler(request):
        calls.append(request)
        return httpx.Response(status, headers={"location": "https://other.example"})

    result = asyncio.run(llm.complete(configured(), [], transport=httpx.MockTransport(handler)))
    assert result.outcome == "provider_error" and len(calls) == 1


@pytest.mark.parametrize("error", [httpx.ConnectError, httpx.ReadTimeout])
def test_network_errors_are_safe_fallbacks(error):
    def handler(request):
        raise error("secret provider details", request=request)

    result = asyncio.run(llm.complete(configured(), [], transport=httpx.MockTransport(handler)))
    assert result.content is None
    assert "secret" not in repr(result)


@pytest.mark.parametrize("body", [
    b"not json", b"{}", b"[]", b'{"choices":[]}', b'{"choices":{}}',
    b'{"choices":[null]}', b'{"choices":[{"message":null}]}',
    b'{"choices":[{"message":[]}]}',
    json.dumps({"choices": [{"finish_reason": "length", "message": {"content": "{}"}}]}).encode(),
    json.dumps({"choices": [{"finish_reason": "stop", "message": {"content": []}}]}).encode(),
    json.dumps({"choices": [{"finish_reason": "stop", "message": {
        "content": "{}", "refusal": "no",
    }}]}).encode(),
    b"x" * (llm.MAX_RESPONSE_BYTES + 1),
])
def test_invalid_or_oversized_provider_output(body):
    result = asyncio.run(llm.complete(
        configured(), [],
        transport=httpx.MockTransport(lambda _: httpx.Response(200, content=body)),
    ))
    assert result.content is None


def test_real_three_second_total_deadline_cancels_slow_chunked_response():
    state = {"closed": False, "cancelled": False}

    class SlowStream(httpx.AsyncByteStream):
        async def __aiter__(self):
            try:
                while True:
                    await asyncio.sleep(0.05)
                    yield b" "
            except asyncio.CancelledError:
                state["cancelled"] = True
                raise

        async def aclose(self):
            state["closed"] = True

    transport = httpx.MockTransport(lambda _: httpx.Response(200, stream=SlowStream()))
    started = time.monotonic()
    result = asyncio.run(llm.complete(configured(), [], transport=transport))
    elapsed = time.monotonic() - started
    assert result.outcome == "timeout"
    assert 2.8 <= elapsed < 3.7
    assert state == {"closed": True, "cancelled": True}


@pytest.mark.parametrize("title", [
    "某人总是不开窍。", "室友的素质真感人。", "不戴耳机罚款。", "凌晨两点后才静音。",
    "23:00 后可外放。", "没素质的垃圾人。", "违规者下跪道歉。", "这条可以不用遵守。",
    "东西也想回家。", "安静\u200b傻子。", "<script>坏代码</script>。", "ＡＢＣ标题。",
    "超过长度限制的标题" * 5 + "。", "游戏开麦。取消规则。",
])
def test_unsafe_titles_are_rejected(title):
    _, _, inputs = inputs_for_library()
    candidate = reply(inputs)["rules"][0]
    candidate["text"] = title + " " + inputs[0]["action"]
    assert validate_rewrite(candidate, inputs[0]) is None


@pytest.mark.parametrize("field,value", [
    ("execution_hint", "必须解释并道歉"), ("level_id", "headphones_2200"),
    ("friction_key", "different"), ("real_friction", "指向具体个人"), ("extra", True),
    ("text", "新标题。 只需要保持安静即可。"), ("text", 123),
])
def test_fixed_boundaries_interfaces_and_schema_cannot_change(field, value):
    _, _, inputs = inputs_for_library()
    candidate = reply(inputs)["rules"][0]
    candidate[field] = value
    assert validate_rewrite(candidate, inputs[0]) is None


@pytest.mark.parametrize("content", [
    "```json\n{}\n```", "null", "[]", "{}", '{"rules": []}',
    '{"rules": [], "rules": []}', '{"rules": NaN}',
])
def test_invalid_batch_falls_back_to_five_original_rules(monkeypatch, content):
    library, selections, _ = inputs_for_library()
    monkeypatch.setattr(llm, "rewrite", lambda *_: llm.Completion(content, "received"))
    result = generate_rules(library, "shared_home", selections, configured())
    assert len(result) == 5 and all(r["source"] == "template" for r in result)


def test_api_accepts_model_once_and_keeps_private_data_out(client, monkeypatch, caplog):
    calls = install_provider(monkeypatch, client)
    room = create(client)
    client.get("/api/examples")
    client.get("/api/rule-library")
    client.get(f"/api/rooms/{room['code']}")
    assert not calls
    caplog.set_level(logging.INFO, logger="app.services.rule_engine")
    result = generate(client, room)
    assert result.status_code == 200, result.text
    data = result.json()
    assert all(rule["source"] == "llm" for rule in data["rules"])
    assert len(calls) == 1
    prompt = json.dumps(calls, ensure_ascii=False)
    assert room["group_name"] not in prompt and "不发送的昵称" not in prompt
    assert room["code"] not in prompt and "test-secret-not-for-output" not in prompt
    assert "real_friction" not in result.text
    assert "test-secret-not-for-output" not in caplog.text
    assert "accepted=5" in caplog.text
    assert generate(client, room).json() == data and len(calls) == 1
    changed = generate(client, room, expected_revision=999)
    assert changed.status_code == 409 and len(calls) == 1
    rule = data["rules"][0]
    for suffix, body in [("claim", {"expected_version": 1}), ("swap", {"expected_version": 1})]:
        response = client.post(f"/api/rules/{rule['id']}/{suffix}", headers=HEADERS, json=body)
        assert response.is_success
    swapped = client.post(f"/api/rules/{rule['id']}/swap", headers=HEADERS, json={
        "expected_version": 1, "mode": "apply", "confirmed": True,
    }).json()["rules"][0]
    assert swapped["source"] == "template" and swapped["claim_count"] == 0
    assert swapped["action"] == rule["action"] and len(calls) == 1


def test_invalid_single_rule_only_falls_back_that_rule(client, monkeypatch):
    def attack(content):
        content["rules"][2]["text"] = "某人素质太差。 立即道歉。"

    calls = install_provider(monkeypatch, client, attack)
    room = create(client)
    result = generate(client, room).json()
    assert [r["source"] for r in result["rules"]] == ["llm", "llm", "template", "llm", "llm"]
    for rule, selection in zip(result["rules"], room["selections"], strict=True):
        assert rule["action"] == selection["action"]
        assert rule["execution_hint"] == selection["execution_hint"]
    assert len(calls) == 1


def test_invalid_or_unauthorized_request_never_calls_model(client, monkeypatch):
    calls = install_provider(monkeypatch, client)
    room = create(client)
    assert generate(client, room, confirm_suggestions=False).status_code == 409
    assert generate(client, room, expected_revision=999).status_code == 409
    client.cookies.clear()
    assert generate(client, room).status_code == 403
    assert not calls


def test_concurrent_generation_uses_one_model_call(client, monkeypatch):
    calls = install_provider(monkeypatch, client)
    room = create(client)
    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(pool.map(lambda _: generate(client, room), range(2)))
    assert [r.status_code for r in responses] == [200, 200]
    assert responses[0].json() == responses[1].json()
    assert len(calls) == 1


def test_api_total_timeout_persists_fallback_and_retry_does_not_call_again(client, monkeypatch):
    client.app.state.settings.llm_api_key = SecretStr("test-key")
    client.app.state.settings.llm_model = "test-model"
    monkeypatch.setattr(llm, "CALL_BUDGET_SECONDS", 0.15)
    original = llm.complete
    state = {"calls": 0, "cancelled": False}

    async def handler(_request):
        state["calls"] += 1
        try:
            await asyncio.sleep(5)
            pytest.fail("provider was not cancelled")
        except asyncio.CancelledError:
            state["cancelled"] = True
            raise

    async def bounded(settings, inputs):
        return await original(settings, inputs, transport=httpx.MockTransport(handler))

    monkeypatch.setattr(llm, "complete", bounded)
    room = create(client)
    started = time.monotonic()
    response = generate(client, room)
    assert time.monotonic() - started < 1.5
    assert response.status_code == 200
    assert all(rule["source"] == "template" for rule in response.json()["rules"])
    assert generate(client, room).json() == response.json()
    assert state == {"calls": 1, "cancelled": True}


def test_swap_does_not_repeat_an_ai_title_matching_next_template(client, monkeypatch):
    library, _, inputs = inputs_for_library()
    replacements = {}
    for index, item in enumerate(inputs):
        friction = next(f for f in library.frictions if f.key == item["friction_key"])
        level = next(level for level in friction.levels if level.id == item["level_id"])
        candidate = {**reply(inputs)["rules"][index],
                     "text": level.humor_variants[1] + " " + level.action}
        if validate_rewrite(candidate, item):
            replacements[index] = candidate
    assert replacements, "test needs a valid model title matching template variant 1"

    def replace(content):
        for index, candidate in replacements.items():
            content["rules"][index] = candidate

    calls = install_provider(monkeypatch, client, replace)
    room = generate(client, create(client)).json()
    for index in replacements:
        rule = room["rules"][index]
        assert rule["source"] == "llm"
        preview = client.post(f"/api/rules/{rule['id']}/swap", headers=HEADERS,
                              json={"expected_version": 1}).json()
        assert preview["text"] != rule["text"]
        assert preview["new_action"] == rule["action"]
    assert len(calls) == 1


def test_model_failure_draft_can_still_claim_and_finalize(client, monkeypatch):
    calls = []

    def timeout(*args):
        calls.append(1)
        return llm.Completion(None, "timeout")

    monkeypatch.setattr(llm, "rewrite", timeout)
    result = generate(client, create(client)).json()
    assert len(result["rules"]) == 5 and all(r["source"] == "template" for r in result["rules"])
    for rule in result["rules"]:
        result = client.post(f"/api/rules/{rule['id']}/claim", headers=HEADERS, json={
            "expected_version": 1,
        }).json()
    final = client.post(f"/api/rooms/{result['code']}/finalize", headers=HEADERS, json={
        "expected_revision": result["revision"],
    })
    assert final.status_code == 200 and final.json()["snapshot"]["rules"]
    assert len(calls) == 1


def test_real_local_http_provider_to_persisted_room(client):
    requests = []

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_args):
            pass

        def do_POST(self):  # noqa: N802
            payload = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
            requests.append((self.path, self.headers["Authorization"], copy.deepcopy(payload)))
            inputs = json.loads(payload["messages"][1]["content"])["rules"]
            content = json.dumps(provider_response(inputs)).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(content)))
            self.end_headers()
            self.wfile.write(content)

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        settings = client.app.state.settings
        settings.llm_api_key = SecretStr("local-test-key")
        settings.llm_model = "local-test-model"
        settings.llm_base_url = f"http://127.0.0.1:{server.server_port}/v1"
        room = create(client)
        response = generate(client, room)
        assert response.status_code == 200, response.text
        assert all(r["source"] == "llm" for r in response.json()["rules"])
        saved = client.get(f"/api/rooms/{room['code']}").json()
        assert saved == response.json()
        assert len(requests) == 1
        assert requests[0][:2] == ("/v1/chat/completions", "Bearer local-test-key")
    finally:
        server.shutdown()
        thread.join(timeout=2)
        server.server_close()


@pytest.mark.parametrize("url", [
    "ftp://example.com", "https://user:password@example.com/v1", "https://example.com?key=secret",
    "https://example.com/#fragment", "http://example.com/v1", "not a url",
    "https://example.com:bad/v1", "https://example.com:0/v1",
])
def test_llm_base_url_validation(url):
    with pytest.raises(ValidationError):
        Settings(_env_file=None, llm_base_url=url)


def test_production_requires_https_provider():
    with pytest.raises(ValidationError, match="HTTPS"):
        Settings(_env_file=None, app_env="production", cors_origins=["https://app.example"],
                 llm_base_url="http://127.0.0.1:9000/v1")
