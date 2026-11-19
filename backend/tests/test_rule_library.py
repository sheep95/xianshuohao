from typing import Any

import pytest
from pydantic import ValidationError

from app.schemas.library import RuleLibrary
from app.services.rule_library import load_rule_library


def test_reviewed_library_loads_with_all_three_spaces() -> None:
    library = load_rule_library()
    assert {space.key for space in library.spaces} == {
        "shared_home",
        "short_stay",
        "club_room",
    }
    assert len(library.frictions) == 15
    assert sum(len(friction.levels) for friction in library.frictions) == 45


def test_unknown_default_friction_is_rejected(library_payload: dict[str, Any]) -> None:
    library_payload["spaces"][0]["default_selection"][0]["friction_key"] = "missing-friction"
    with pytest.raises(ValidationError, match="Unknown friction"):
        RuleLibrary.model_validate(library_payload)


def test_unknown_default_level_is_rejected(library_payload: dict[str, Any]) -> None:
    library_payload["spaces"][0]["default_selection"][0]["level_id"] = "missing-level"
    with pytest.raises(ValidationError, match="Unknown level"):
        RuleLibrary.model_validate(library_payload)


def test_cross_space_default_is_rejected(library_payload: dict[str, Any]) -> None:
    space = library_payload["spaces"][0]
    default_key = space["default_selection"][0]["friction_key"]
    other_space = next(item["key"] for item in library_payload["spaces"] if item != space)
    friction = next(item for item in library_payload["frictions"] if item["key"] == default_key)
    friction["space_types"] = [other_space]
    with pytest.raises(ValidationError, match="not available in space"):
        RuleLibrary.model_validate(library_payload)


def test_duplicate_default_friction_is_rejected(library_payload: dict[str, Any]) -> None:
    selections = library_payload["spaces"][0]["default_selection"]
    selections[1] = dict(selections[0])
    with pytest.raises(ValidationError, match="duplicate default friction"):
        RuleLibrary.model_validate(library_payload)


def test_duplicate_friction_keys_are_rejected(library_payload: dict[str, Any]) -> None:
    library_payload["frictions"][1]["key"] = library_payload["frictions"][0]["key"]
    with pytest.raises(ValidationError, match="duplicate friction keys"):
        RuleLibrary.model_validate(library_payload)


def test_duplicate_level_ids_are_rejected(library_payload: dict[str, Any]) -> None:
    levels = library_payload["frictions"][0]["levels"]
    levels[1]["id"] = levels[0]["id"]
    with pytest.raises(ValidationError, match="duplicate level ids"):
        RuleLibrary.model_validate(library_payload)


def test_duplicate_space_keys_are_rejected(library_payload: dict[str, Any]) -> None:
    library_payload["spaces"][1]["key"] = library_payload["spaces"][0]["key"]
    with pytest.raises(ValidationError, match="duplicate space keys"):
        RuleLibrary.model_validate(library_payload)


@pytest.mark.parametrize("field,limit", [("action", 70), ("execution_hint", 60)])
def test_excessive_card_text_is_rejected(
    library_payload: dict[str, Any], field: str, limit: int
) -> None:
    library_payload["frictions"][0]["levels"][0][field] = "字" * (limit + 1)
    with pytest.raises(ValidationError, match="String should have at most"):
        RuleLibrary.model_validate(library_payload)


def test_excessive_humor_text_is_rejected(library_payload: dict[str, Any]) -> None:
    library_payload["frictions"][0]["levels"][0]["humor_variants"][0] = "字" * 31
    with pytest.raises(ValidationError, match="String should have at most"):
        RuleLibrary.model_validate(library_payload)


@pytest.mark.parametrize("text", ["", "   ", "\n\t"])
def test_blank_action_is_rejected(library_payload: dict[str, Any], text: str) -> None:
    library_payload["frictions"][0]["levels"][0]["action"] = text
    with pytest.raises(ValidationError, match="String should have at least"):
        RuleLibrary.model_validate(library_payload)


def test_extra_library_fields_are_rejected(library_payload: dict[str, Any]) -> None:
    library_payload["frictions"][0]["levels"][0]["punishment"] = "not permitted"
    with pytest.raises(ValidationError, match="Extra inputs are not permitted"):
        RuleLibrary.model_validate(library_payload)


def test_space_must_have_exactly_five_defaults(library_payload: dict[str, Any]) -> None:
    library_payload["spaces"][0]["default_selection"].pop()
    with pytest.raises(ValidationError, match="at least 5 items"):
        RuleLibrary.model_validate(library_payload)
