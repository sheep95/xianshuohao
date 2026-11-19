import hashlib
import json
import secrets
from datetime import UTC, timedelta, timezone

from sqlalchemy import delete
from sqlmodel import Session, select

from app.core.config import Settings
from app.core.errors import fail
from app.models.entities import (
    Claim,
    FinalizedSnapshot,
    Identity,
    Operation,
    Participant,
    Room,
    Rule,
    utcnow,
)
from app.schemas.library import RuleLibrary
from app.schemas.rooms import (
    CardSnapshot,
    FinalizeRequest,
    GenerateRequest,
    RoomCreate,
    RoomView,
    SwapPreview,
    SwapRequest,
)
from app.services.rule_engine import complete_selections, generate_rules, resolve_level, template


def room_by_code(session: Session, code: str, *, lock: bool = False) -> Room:
    query = select(Room).where(Room.code == code.upper())
    room = session.exec(query.with_for_update() if lock else query).first()
    if room is None:
        fail(404, "room_not_found", "没有找到这个房间")
    return room


def room_for_rule(session: Session, rule_id: str) -> tuple[Room, Rule]:
    # Room first is the common lock order for every room mutation.
    room_id = session.exec(select(Rule.room_id).where(Rule.id == rule_id)).first()
    if room_id is None:
        fail(404, "rule_not_found", "没有找到这条规则")
    room = session.exec(select(Room).where(Room.id == room_id).with_for_update()).one()
    rule = session.get(Rule, rule_id, populate_existing=True)
    return room, rule


def participant_for(session: Session, room: Room, identity: Identity | None) -> Participant | None:
    if identity is None:
        return None
    return session.exec(
        select(Participant).where(
            Participant.room_id == room.id,
            Participant.identity_id == identity.id,
        )
    ).first()


def require_member(session: Session, room: Room, identity: Identity | None) -> Participant:
    member = participant_for(session, room, identity)
    if member is None:
        fail(403, "join_required", "请先匿名加入房间")
    return member


def require_owner(member: Participant) -> None:
    if not member.is_owner:
        fail(403, "owner_required", "此操作需要房间创建者确认")


def require_draft(room: Room) -> None:
    if room.status != "draft":
        fail(409, "not_draft", "只有未定稿的草案可以认领或替换")


def require_revision(room: Room, revision: int) -> None:
    if room.revision != revision:
        fail(409, "stale_revision", "房间有新变化，请刷新后再操作")


def require_version(rule: Rule, version: int) -> None:
    if rule.version != version:
        fail(409, "stale_rule", "条文已更换，请阅读新版本后再操作")


def nickname_or_default(nickname: str | None) -> str:
    return nickname or f"同伴-{secrets.token_hex(2).upper()}"


def create_room(
    session: Session,
    identity: Identity,
    body: RoomCreate,
    library: RuleLibrary,
) -> Room:
    selections = complete_selections(library, body.space_type, body.selections)
    space = next(s for s in library.spaces if s.key == body.space_type)
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    code = ""
    for _ in range(10):
        candidate = "".join(secrets.choice(alphabet) for _ in range(10))
        if session.exec(select(Room.id).where(Room.code == candidate)).first() is None:
            code = candidate
            break
    if not code:
        fail(503, "code_unavailable", "暂时无法分配房间码，请重试")
    room = Room(
        code=code,
        space_type=space.key,
        duration=space.duration_label,
        duration_days=space.default_days,
        group_name=body.group_name,
        selections=selections,
    )
    session.add(room)
    session.flush()
    session.add(
        Participant(
            room_id=room.id,
            identity_id=identity.id,
            nickname=nickname_or_default(body.nickname),
            is_owner=True,
        )
    )
    session.flush()
    return room


def join_room(session: Session, room: Room, identity: Identity, nickname: str | None) -> None:
    if participant_for(session, room, identity) is not None:
        return
    if room.status == "finalized":
        fail(409, "room_finalized", "房间已定稿，可以查看宪法卡；新的约定请另开房间")
    people = session.exec(select(Participant).where(Participant.room_id == room.id)).all()
    if len(people) >= 50:
        fail(409, "room_full", "房间最多支持 50 位匿名参与者")
    session.add(
        Participant(
            room_id=room.id,
            identity_id=identity.id,
            nickname=nickname_or_default(nickname),
        )
    )
    room.revision += 1
    session.add(room)
    session.flush()


def operation(
    session: Session,
    room: Room,
    member: Participant,
    kind: str,
    key: str,
    body,
) -> bool:
    """Reserve a receipt in this transaction; rollbacks remove failed attempts."""
    fingerprint = hashlib.sha256(
        json.dumps(
            body.model_dump(mode="json"),
            sort_keys=True,
            ensure_ascii=False,
        ).encode()
    ).hexdigest()
    previous = session.exec(
        select(Operation).where(
            Operation.room_id == room.id,
            Operation.participant_id == member.id,
            Operation.kind == kind,
            Operation.key == key,
        )
    ).first()
    if previous:
        if previous.fingerprint != fingerprint:
            fail(409, "idempotency_conflict", "同一个操作编号不能用于不同请求")
        return True
    session.add(
        Operation(
            room_id=room.id,
            participant_id=member.id,
            kind=kind,
            key=key,
            fingerprint=fingerprint,
        )
    )
    return False


def generate(
    session: Session,
    room: Room,
    member: Participant,
    body: GenerateRequest,
    key: str,
    library: RuleLibrary,
    settings: Settings,
) -> None:
    require_owner(member)
    if operation(session, room, member, "generate", key, body):
        return
    if room.status != "setup":
        fail(409, "already_generated", "这个房间已有草案；修改请使用换条功能")
    require_revision(room, body.expected_revision)
    if any(s["suggested"] for s in room.selections) and not body.confirm_suggestions:
        fail(409, "suggestions_unconfirmed", "请先查看并确认补充的行为建议")
    candidates = generate_rules(library, room.space_type, room.selections, settings)
    for order, (selection, candidate) in enumerate(
        zip(room.selections, candidates, strict=True), 1
    ):
        session.add(
            Rule(
                room_id=room.id,
                friction_key=selection["friction_key"],
                level_id=selection["level_id"],
                position=order,
                **candidate,
            )
        )
    room.status = "draft"
    room.revision += 1
    session.add(room)
    session.flush()


def claim_rule(
    session: Session,
    room: Room,
    rule: Rule,
    member: Participant,
    version: int,
) -> None:
    require_draft(room)
    require_version(rule, version)
    previous = session.exec(
        select(Claim).where(
            Claim.rule_id == rule.id,
            Claim.participant_id == member.id,
        )
    ).first()
    if previous:
        return
    session.add(Claim(rule_id=rule.id, participant_id=member.id, rule_version=rule.version))
    rule.status = "claimed"
    room.revision += 1
    session.add(rule)
    session.add(room)
    session.flush()


def swap_rule(
    session: Session,
    room: Room,
    rule: Rule,
    member: Participant,
    body: SwapRequest,
    key: str | None,
    library: RuleLibrary,
) -> SwapPreview | None:
    if body.mode == "apply":
        if not key:
            fail(422, "idempotency_required", "确认替换时需要 Idempotency-Key")
        if operation(session, room, member, f"swap:{rule.id}", key, body):
            return None
    require_draft(room)
    require_version(rule, body.expected_version)
    target = body.target_level_id or rule.level_id
    level = resolve_level(library, room.space_type, rule.friction_key, target)
    variant = (rule.variant_index + 1) % len(level.humor_variants) if target == rule.level_id else 0
    if target == rule.level_id:
        # An AI title can match either stored variant; still show a different wording.
        for offset in range(len(level.humor_variants)):
            proposed = (variant + offset) % len(level.humor_variants)
            if template(level, proposed)["text"] != rule.text:
                variant = proposed
                break
    candidate = template(level, variant)
    if target == rule.level_id:
        candidate["execution_hint"] = rule.execution_hint
    claims = session.exec(select(Claim).where(Claim.rule_id == rule.id)).all()
    preview = SwapPreview(
        rule_id=rule.id,
        expected_version=rule.version,
        target_level_id=target,
        old_action=rule.action,
        new_action=level.action,
        text=candidate["text"],
        execution_hint=candidate["execution_hint"],
        boundary_changed=target != rule.level_id,
        claims_to_clear=len(claims),
        requires_owner=bool(claims),
    )
    if body.mode == "preview":
        return preview
    if not body.confirmed:
        fail(409, "confirmation_required", "请先阅读替换内容并确认；原有认领将被清除")
    if body.expected_claim_count is not None and body.expected_claim_count != len(claims):
        fail(409, "claims_changed", "认领人数已经更新，请重新预览并确认；原有认领保持不变")
    if claims:
        require_owner(member)
    session.execute(delete(Claim).where(Claim.rule_id == rule.id))
    rule.level_id = target
    rule.variant_index = variant
    rule.version += 1
    rule.status = "debating"
    rule.source = "template"
    for name, value in candidate.items():
        setattr(rule, name, value)
    if preview.boundary_changed:
        room.selections = [
            {"friction_key": rule.friction_key, "level_id": target, "suggested": s["suggested"]}
            if s["friction_key"] == rule.friction_key else s
            for s in room.selections
        ]
    room.revision += 1
    session.add(rule)
    session.add(room)
    session.flush()
    return None


def finalize(
    session: Session,
    room: Room,
    member: Participant,
    body: FinalizeRequest,
    key: str,
    library: RuleLibrary,
) -> None:
    require_owner(member)
    if operation(session, room, member, "finalize", key, body):
        return
    require_draft(room)
    require_revision(room, body.expected_revision)
    rules = session.exec(select(Rule).where(Rule.room_id == room.id).order_by(Rule.position)).all()
    if len(rules) != 5:
        fail(409, "incomplete_rules", "需要完整的 5 条草案")
    for rule in rules:
        if (
            session.exec(
                select(Claim.id).where(
                    Claim.rule_id == rule.id,
                    Claim.rule_version == rule.version,
                )
            ).first()
            is None
        ):
            fail(409, "unclaimed_rules", "还有规则无人认领，请先认领或更换")
    now = utcnow()
    date = now.astimezone(timezone(timedelta(hours=8))).date().isoformat()
    participants = session.exec(select(Participant.id).where(Participant.room_id == room.id)).all()
    space = next(s for s in library.spaces if s.key == room.space_type)
    snapshot = CardSnapshot(
        code=room.code,
        group_name=room.group_name,
        space_type=room.space_type,
        space_label=space.label,
        duration=room.duration,
        duration_days=room.duration_days,
        participant_count=len(participants),
        adopted_date=date,
        effective_at=now,
        expires_at=now + timedelta(days=room.duration_days),
        rules=[
            {"text": r.text, "execution_hint": r.execution_hint, "order": r.position} for r in rules
        ],
        oath=f"我们，{room.group_name}，于 {date} 说好这五条。约定生效时刻：现在。",
    )
    session.add(FinalizedSnapshot(room_id=room.id, content=snapshot.model_dump(mode="json")))
    room.status = "finalized"
    room.finalized_at = now
    room.revision += 1
    session.add(room)
    session.flush()


def room_view(
    session: Session,
    room: Room,
    identity: Identity | None,
    library: RuleLibrary,
) -> RoomView:
    participants = session.exec(select(Participant).where(Participant.room_id == room.id)).all()
    people = {p.id: p for p in participants}
    viewer = next((p for p in participants if identity and p.identity_id == identity.id), None)
    rules = session.exec(select(Rule).where(Rule.room_id == room.id).order_by(Rule.position)).all()
    claims = session.exec(
        select(Claim)
        .join(Rule, Claim.rule_id == Rule.id)
        .where(
            Rule.room_id == room.id,
            Claim.rule_version == Rule.version,
        )
    ).all()
    rule_views = []
    for rule in rules:
        rule_claims = [c for c in claims if c.rule_id == rule.id]
        rule_views.append(
            {
                **rule.model_dump(exclude={"room_id", "variant_index", "position"}),
                "order": rule.position,
                "claim_count": len(rule_claims),
                "claimed_by_me": bool(
                    viewer and any(c.participant_id == viewer.id for c in rule_claims)
                ),
                "claims": [
                    {
                        "participant_id": c.participant_id,
                        "nickname": people[c.participant_id].nickname,
                    }
                    for c in rule_claims
                ]
                if viewer
                else [],
            }
        )
    snapshot = session.get(FinalizedSnapshot, room.id)
    selections = []
    for selection in room.selections:
        level = resolve_level(
            library,
            room.space_type,
            selection["friction_key"],
            selection["level_id"],
        )
        selections.append(
            {
                **selection,
                "label": level.label,
                "action": level.action,
                "execution_hint": selection.get("custom_execution_hint") or level.execution_hint,
            }
        )
    return RoomView(
        id=room.id,
        code=room.code,
        space_type=room.space_type,
        duration=room.duration,
        duration_days=room.duration_days,
        group_name=room.group_name,
        status=room.status,
        revision=room.revision,
        created_at=room.created_at.replace(tzinfo=UTC),
        finalized_at=room.finalized_at.replace(tzinfo=UTC) if room.finalized_at else None,
        participant_count=len(participants),
        viewer={
            "participant_id": viewer.id,
            "nickname": viewer.nickname,
            "is_owner": viewer.is_owner,
        }
        if viewer
        else None,
        selections=selections,
        rules=rule_views,
        snapshot=snapshot.content if snapshot else None,
    )
