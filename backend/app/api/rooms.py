from typing import Annotated

from fastapi import APIRouter, Depends, Header, Request, Response
from sqlmodel import Session

from app.core.database import get_session
from app.core.security import ensure_identity, identity_for, protect_write
from app.schemas.rooms import (
    ClaimRequest,
    FinalizeRequest,
    GenerateRequest,
    JoinRequest,
    RoomCreate,
    RoomView,
    SwapPreview,
    SwapRequest,
)
from app.services import rooms
from app.services.rule_engine import build_examples, public_library

router = APIRouter(prefix="/api", tags=["rooms"])
Database = Annotated[Session, Depends(get_session, scope="function")]
IdempotencyKey = Annotated[
    str,
    Header(
        alias="Idempotency-Key",
        min_length=8,
        max_length=80,
        pattern=r"^[A-Za-z0-9_-]+$",
        description="每次新操作使用新编号，网络重试复用原编号和请求体",
    ),
]
OptionalKey = Annotated[
    str | None,
    Header(
        alias="Idempotency-Key",
        min_length=8,
        max_length=80,
        pattern=r"^[A-Za-z0-9_-]+$",
    ),
]
protected = [Depends(protect_write)]


@router.get("/examples", tags=["library"])
def examples(request: Request) -> dict:
    return build_examples(request.app.state.rule_library)


@router.get("/rule-library", tags=["library"])
def rule_library(request: Request) -> dict:
    return public_library(request.app.state.rule_library)


@router.post("/rooms", response_model=RoomView, status_code=201, dependencies=protected)
def create(body: RoomCreate, request: Request, response: Response, session: Database):
    identity = ensure_identity(request, response, session)
    room = rooms.create_room(session, identity, body, request.app.state.rule_library)
    return rooms.room_view(session, room, identity, request.app.state.rule_library)


@router.get("/rooms/{code}", response_model=RoomView)
def get_room(code: str, request: Request, session: Database):
    room = rooms.room_by_code(session, code)
    return rooms.room_view(
        session,
        room,
        identity_for(request, session),
        request.app.state.rule_library,
    )


@router.post("/rooms/{code}/join", response_model=RoomView, dependencies=protected)
def join(code: str, body: JoinRequest, request: Request, response: Response, session: Database):
    room = rooms.room_by_code(session, code, lock=True)
    identity = ensure_identity(request, response, session)
    rooms.join_room(session, room, identity, body.nickname)
    return rooms.room_view(session, room, identity, request.app.state.rule_library)


@router.post("/rooms/{code}/generate", response_model=RoomView, dependencies=protected)
def generate(
    code: str,
    body: GenerateRequest,
    request: Request,
    session: Database,
    idempotency_key: IdempotencyKey,
):
    room = rooms.room_by_code(session, code, lock=True)
    identity = identity_for(request, session)
    member = rooms.require_member(session, room, identity)
    rooms.generate(
        session, room, member, body, idempotency_key,
        request.app.state.rule_library, request.app.state.settings,
    )
    return rooms.room_view(session, room, identity, request.app.state.rule_library)


@router.post("/rules/{rule_id}/claim", response_model=RoomView, dependencies=protected)
def claim(rule_id: str, body: ClaimRequest, request: Request, session: Database):
    room, rule = rooms.room_for_rule(session, rule_id)
    identity = identity_for(request, session)
    member = rooms.require_member(session, room, identity)
    rooms.claim_rule(session, room, rule, member, body.expected_version)
    return rooms.room_view(session, room, identity, request.app.state.rule_library)


@router.post("/rules/{rule_id}/swap", response_model=SwapPreview | RoomView, dependencies=protected)
def swap(
    rule_id: str,
    body: SwapRequest,
    request: Request,
    session: Database,
    idempotency_key: OptionalKey = None,
):
    room, rule = rooms.room_for_rule(session, rule_id)
    identity = identity_for(request, session)
    member = rooms.require_member(session, room, identity)
    preview = rooms.swap_rule(
        session,
        room,
        rule,
        member,
        body,
        idempotency_key,
        request.app.state.rule_library,
    )
    return preview or rooms.room_view(session, room, identity, request.app.state.rule_library)


@router.post("/rooms/{code}/finalize", response_model=RoomView, dependencies=protected)
def finalize(
    code: str,
    body: FinalizeRequest,
    request: Request,
    session: Database,
    idempotency_key: IdempotencyKey,
):
    room = rooms.room_by_code(session, code, lock=True)
    identity = identity_for(request, session)
    member = rooms.require_member(session, room, identity)
    rooms.finalize(session, room, member, body, idempotency_key, request.app.state.rule_library)
    return rooms.room_view(session, room, identity, request.app.state.rule_library)
