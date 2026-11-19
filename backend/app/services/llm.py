"""One bounded OpenAI-compatible request, with no retries or personal room data."""

import asyncio
import json
from dataclasses import dataclass

import anyio
import httpx

from app.core.config import Settings

CALL_BUDGET_SECONDS = 3.0
MAX_RESPONSE_BYTES = 65_536

SYSTEM_PROMPT = """你为刚启用的临时共享空间写五条微型宪法。只说破行为的潜台词，
不要调解、评分、惩罚、羞辱、讽刺个人或把物品拟人化。标题有吐槽感但不新增义务。
输入仅包含可信规则库。每条 action 和 execution_hint 已获用户确认，必须逐字保留。
仅改写幽默标题：4—30 个字，只用中文和中文标点，结尾为句号。
标题不写数字、时间、数量、命令、例外条件、人称、姓名、室友或某人；
不能在标题里放宽或加重正文，不重复正文，不用温馨说教。
风格示例：放在桌上，不代表加入共享套餐。 / 调温不搞秘密行动。 /
聚会散场，杂物不续杯。

输出前在本次回答内部自检，任一不过就在本次回答中重写，禁止请求追加轮次：
1. 拼接后的条文是否有可观察动作或阈值，第三个人能判断做到或没做到？
2. 不想或不能遵守时，是否保留不需要解释的最低成本替代动作或退出方式？
3. 读给不在场的人听，会不会觉得在阴阳他？如果会，重写标题。
4. 是否只有行为、没有惩罚、人身攻击、道德评分和物品拟人化？
5. action 和 execution_hint 是否逐字不变，标题是否没有新阈值、新例外和指向个人？

只输出 JSON 对象，不要 Markdown、推理过程、自检报告或额外字段。
格式：{"rules":[{"friction_key":"原标识","level_id":"原水位标识",
"real_friction":"逐字复制输入的内部摩擦解释",
"text":"幽默标题。 原 action 全文","execution_hint":"原 execution_hint 全文"}]}。
五条顺序与输入相同。real_friction 是内部字段，不进入用户页面。
"""


@dataclass(frozen=True)
class Completion:
    content: str | None
    outcome: str


def configured(settings: Settings) -> bool:
    return bool(settings.llm_api_key and settings.llm_model.strip())


def decode_json(value: str | bytes | bytearray):
    def unique_object(pairs):
        result = {}
        for key, item in pairs:
            if key in result:
                raise ValueError("duplicate JSON key")
            result[key] = item
        return result

    def invalid_constant(_value):
        raise ValueError("non-finite JSON value")

    return json.loads(value, object_pairs_hook=unique_object, parse_constant=invalid_constant)


def request_payload(settings: Settings, inputs: list[dict]) -> dict:
    return {
        "model": settings.llm_model,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": json.dumps({"rules": inputs}, ensure_ascii=False)},
        ],
        "response_format": {"type": "json_object"},
        "max_tokens": 1800,
        "stream": False,
    }


async def complete(
    settings: Settings,
    inputs: list[dict],
    *,
    transport: httpx.AsyncBaseTransport | None = None,
) -> Completion:
    if not configured(settings):
        return Completion(None, "unconfigured")
    try:
        # Total wall-clock deadline, not three seconds per connect/read/chunk.
        async with asyncio.timeout(CALL_BUDGET_SECONDS):
            async with httpx.AsyncClient(
                transport=transport or httpx.AsyncHTTPTransport(retries=0),
                timeout=httpx.Timeout(CALL_BUDGET_SECONDS),
                follow_redirects=False,
                trust_env=False,
            ) as client:
                async with client.stream(
                    "POST",
                    settings.llm_base_url.rstrip("/") + "/chat/completions",
                    headers={"Authorization": "Bearer " + settings.llm_api_key.get_secret_value()},
                    json=request_payload(settings, inputs),
                ) as response:
                    if response.status_code != 200:
                        return Completion(None, "provider_error")
                    raw = bytearray()
                    async for chunk in response.aiter_bytes():
                        raw.extend(chunk)
                        if len(raw) > MAX_RESPONSE_BYTES:
                            return Completion(None, "oversized_response")
                    envelope = decode_json(raw)
                    if not isinstance(envelope, dict):
                        return Completion(None, "invalid_response")
                    choices = envelope.get("choices")
                    if not isinstance(choices, list) or not choices:
                        return Completion(None, "invalid_response")
                    choice = choices[0]
                    if not isinstance(choice, dict) or not isinstance(choice.get("message"), dict):
                        return Completion(None, "invalid_response")
                    message = choice["message"]
                    if choice.get("finish_reason") != "stop" or message.get("refusal"):
                        return Completion(None, "incomplete_response")
                    content = message["content"]
                    if not isinstance(content, str) or not content.strip():
                        return Completion(None, "invalid_response")
                    return Completion(content, "received")
    except (TimeoutError, httpx.TimeoutException):
        return Completion(None, "timeout")
    except (httpx.HTTPError, httpx.InvalidURL):
        return Completion(None, "network_error")
    except (ValueError, TypeError, KeyError, IndexError, RecursionError):
        return Completion(None, "invalid_response")


def rewrite(settings: Settings, inputs: list[dict]) -> Completion:
    """Called only by the synchronous generate endpoint's worker thread."""
    if not configured(settings):
        return Completion(None, "unconfigured")
    # Use the server's existing event loop. A per-call asyncio.run() would wait for
    # its DNS executor to shut down even after the HTTP operation had timed out.
    return anyio.from_thread.run(complete, settings, inputs)
