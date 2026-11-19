from typing import Annotated, Literal, Self

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

SpaceKey = Literal["shared_home", "short_stay", "club_room"]
NonEmptyText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]
ActionText = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=70)
]
ExecutionHint = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=60)
]
HumorText = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=30)
]


class LibraryModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class DefaultSelection(LibraryModel):
    friction_key: NonEmptyText
    level_id: NonEmptyText


class SpaceDefinition(LibraryModel):
    key: SpaceKey
    label: NonEmptyText
    duration_key: NonEmptyText
    duration_label: NonEmptyText
    default_days: Annotated[int, Field(gt=0)]
    description: NonEmptyText
    default_selection: Annotated[list[DefaultSelection], Field(min_length=5, max_length=5)]

    @model_validator(mode="after")
    def selections_are_distinct(self) -> Self:
        keys = [selection.friction_key for selection in self.default_selection]
        if len(set(keys)) != len(keys):
            raise ValueError(f"Space '{self.key}' has duplicate default friction selections")
        return self


class BehaviorLevel(LibraryModel):
    id: NonEmptyText
    label: NonEmptyText
    action: ActionText
    execution_hint: ExecutionHint
    humor_variants: Annotated[list[HumorText], Field(min_length=2)]

    @model_validator(mode="after")
    def humor_variants_are_distinct(self) -> Self:
        if len(set(self.humor_variants)) != len(self.humor_variants):
            raise ValueError(f"Level '{self.id}' has duplicate humor variants")
        return self


class FrictionDefinition(LibraryModel):
    key: NonEmptyText
    title: NonEmptyText
    real_friction: NonEmptyText
    space_types: Annotated[list[SpaceKey], Field(min_length=1, max_length=3)]
    levels: Annotated[list[BehaviorLevel], Field(min_length=3, max_length=3)]

    @model_validator(mode="after")
    def level_ids_and_spaces_are_distinct(self) -> Self:
        level_ids = [level.id for level in self.levels]
        if len(set(level_ids)) != len(level_ids):
            raise ValueError(f"Friction '{self.key}' has duplicate level ids")
        if len(set(self.space_types)) != len(self.space_types):
            raise ValueError(f"Friction '{self.key}' has duplicate space types")
        return self


class RuleLibrary(LibraryModel):
    schema_version: Literal[1]
    spaces: Annotated[list[SpaceDefinition], Field(min_length=3, max_length=3)]
    frictions: Annotated[list[FrictionDefinition], Field(min_length=15, max_length=15)]

    @model_validator(mode="after")
    def references_are_valid(self) -> Self:
        space_keys = [space.key for space in self.spaces]
        if len(set(space_keys)) != len(space_keys):
            raise ValueError("The library has duplicate space keys")

        friction_keys = [friction.key for friction in self.frictions]
        if len(set(friction_keys)) != len(friction_keys):
            raise ValueError("The library has duplicate friction keys")

        frictions_by_key = {friction.key: friction for friction in self.frictions}
        for space in self.spaces:
            for selection in space.default_selection:
                friction = frictions_by_key.get(selection.friction_key)
                if friction is None:
                    raise ValueError(
                        f"Unknown friction '{selection.friction_key}' in space '{space.key}'"
                    )
                if space.key not in friction.space_types:
                    raise ValueError(
                        f"Friction '{friction.key}' is not available in space '{space.key}'"
                    )
                if selection.level_id not in {level.id for level in friction.levels}:
                    raise ValueError(
                        f"Unknown level '{selection.level_id}' for friction '{friction.key}'"
                    )
        return self
