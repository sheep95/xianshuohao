import logging
import re
import unicodedata

from pydantic import ValidationError

from app.core.config import Settings
from app.core.errors import fail
from app.schemas.library import RuleLibrary
from app.schemas.llm import RewrittenRule
from app.schemas.rooms import Selection
from app.services import llm

logger = logging.getLogger(__name__)

# Conservative title-only checks. Fixed actions and interfaces are never model-authored.
TITLE_CHARACTERS = re.compile(r"[\u4e00-\u9fff，、：；‘’“”！。]{4,30}")
UNSAFE_TITLE = re.compile(
    r"你|您|他|她|谁|某|室友|同学|人品|素质|教养|脑|蠢|傻|笨|废物|垃圾人|"
    r"滚|死|贱|婊|逼|狗|猪|畜|奴|癌|病|残|智障|弱智|阴阳|羞|丢人|丢脸|活该|"
    r"惩|罚|扣|赔|跪|道歉|曝光|公示|举报|孤立|拉黑|驱逐|赶走|连坐|没收|"
    r"必须|务必|应当|应该|允许|禁止|可以|不用|不必|无需|无须|随便|例外|除非|只要|"
    r"如果|尽量|最好|建议|请|不准|别|不得|免|算了|无所谓|没关系|随意|"
    r"一|二|三|四|五|六|七|八|九|十|百|千|万|零|两|半|点钟|小时|分钟|秒|"
    r"每天|每日|每晚|之前|之后|以后|以前|不再|无需|取消|不受|不算|不适用|"
    r"温馨|乖|想回家|也想|会伤心|委屈|哭泣|想睡|等主人|求抱|小可爱"
)


def validate_rewrite(raw: object, expected: dict) -> dict | None:
    try:
        candidate = RewrittenRule.model_validate(raw)
    except ValidationError:
        return None
    if (
        candidate.friction_key != expected["friction_key"]
        or candidate.level_id != expected["level_id"]
        or candidate.real_friction != expected["real_friction"]
        or candidate.execution_hint != expected["execution_hint"]
    ):
        return None
    title, delimiter, action = candidate.text.partition("。 ")
    title += "。"
    normalized = unicodedata.normalize("NFKC", title)
    if (
        not delimiter
        or action != expected["action"]
        or not TITLE_CHARACTERS.fullmatch(title)
        or "。" in title[:-1]
        or UNSAFE_TITLE.search(normalized)
    ):
        return None
    return {
        "text": title + " " + expected["action"],
        "action": expected["action"],
        "execution_hint": expected["execution_hint"],
        "source": "llm",
    }


def generate_rules(
    library: RuleLibrary, space_type: str, selections: list[dict], settings: Settings
) -> list[dict]:
    inputs, fallbacks = [], []
    for selected in selections:
        level = resolve_level(library, space_type, selected["friction_key"], selected["level_id"])
        friction = next(f for f in library.frictions if f.key == selected["friction_key"])
        inputs.append({
            "friction_key": friction.key, "level_id": level.id,
            "real_friction": friction.real_friction,
            "action": level.action, "execution_hint": level.execution_hint,
        })
        fallbacks.append({**template(level), "source": "template"})
    result = llm.rewrite(settings, inputs)
    rules = fallbacks.copy()
    outcome = result.outcome
    if result.content is not None:
        try:
            payload = llm.decode_json(result.content)
            if not isinstance(payload, dict) or set(payload) != {"rules"}:
                raise ValueError("invalid envelope")
            candidates = payload["rules"]
            if not isinstance(candidates, list) or len(candidates) != len(inputs):
                raise ValueError("invalid count")
            for index, (candidate, expected) in enumerate(zip(candidates, inputs, strict=True)):
                checked = validate_rewrite(candidate, expected)
                if checked is not None:
                    rules[index] = checked
            outcome = "validated"
        except (ValueError, TypeError, RecursionError):
            outcome = "invalid_json"
    accepted = sum(rule["source"] == "llm" for rule in rules)
    # Apply user text only after rewriting trusted library content.
    for rule, selection in zip(rules, selections, strict=True):
        if hint := selection.get("custom_execution_hint"):
            rule["execution_hint"] = hint
    # Never log provider text, exception details, prompts, group names, nicknames or credentials.
    logger.info("rule_generation outcome=%s accepted=%d total=%d", outcome, accepted, len(rules))
    return rules


def resolve_level(library: RuleLibrary, space_type: str, friction_key: str, level_id: str):
    friction = next((f for f in library.frictions if f.key == friction_key), None)
    if friction is None or space_type not in friction.space_types:
        fail(422, "invalid_selection", "该摩擦点不适用于当前空间")
    level = next((item for item in friction.levels if item.id == level_id), None)
    if level is None:
        fail(422, "invalid_level", "行为水位不存在")
    return level


def complete_selections(
    library: RuleLibrary,
    space_type: str,
    selections: list[Selection],
) -> list[dict]:
    space = next(s for s in library.spaces if s.key == space_type)
    result = []
    keys = set()
    for selection in selections:
        resolve_level(library, space_type, selection.friction_key, selection.level_id)
        result.append({**selection.model_dump(exclude_none=True), "suggested": False})
        keys.add(selection.friction_key)
    for suggestion in space.default_selection:
        if len(result) == 5:
            break
        if suggestion.friction_key not in keys:
            result.append({**suggestion.model_dump(), "suggested": True})
            keys.add(suggestion.friction_key)
    return result


def template(level, variant_index: int = 0) -> dict:
    return {
        "text": f"{level.humor_variants[variant_index]} {level.action}",
        "action": level.action,
        "execution_hint": level.execution_hint,
    }


def public_library(library: RuleLibrary) -> dict:
    return {
        "schema_version": library.schema_version,
        "spaces": [s.model_dump() for s in library.spaces],
        "frictions": [f.model_dump(exclude={"real_friction"}) for f in library.frictions],
    }


def build_examples(library: RuleLibrary) -> dict:
    """Shared by the API and build-time static export; never calls a model."""
    frictions = {f.key: f for f in library.frictions}
    people = {"shared_home": 4, "short_stay": 3, "club_room": 6}
    groups = {
        "shared_home": "四人宿舍示例",
        "short_stay": "三人旅行示例",
        "club_room": "社团活动室示例",
    }
    examples = []
    for space in library.spaces:
        available = [f for f in library.frictions if space.key in f.space_types]
        for batch in range(3):
            if batch == 0:
                selected = [
                    (frictions[s.friction_key], s.level_id) for s in space.default_selection
                ]
            else:
                rotated = available[batch * 2 :] + available[: batch * 2]
                selected = [(f, f.levels[batch % 3].id) for f in rotated[:5]]
            rules = []
            for index, (friction, level_id) in enumerate(selected):
                level = next(item for item in friction.levels if item.id == level_id)
                variant = (batch + index) % len(level.humor_variants)
                rules.append(
                    {
                        "friction_key": friction.key,
                        "level_id": level.id,
                        "text": template(level, variant)["text"],
                        "execution_hint": level.execution_hint,
                    }
                )
            examples.append(
                {
                    "id": f"{space.key}-{batch + 1}",
                    "is_example": True,
                    "space_type": space.key,
                    "space_label": space.label,
                    "duration": space.duration_label,
                    "group_name": groups[space.key],
                    "participant_count": people[space.key],
                    "rules": rules,
                }
            )
    return {"schema_version": 1, "examples": examples}
