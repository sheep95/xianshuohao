import hashlib
import re
import secrets
from collections import OrderedDict, deque
from datetime import UTC, timedelta
from threading import Lock
from time import monotonic
from typing import Annotated

from fastapi import Header, Request, Response
from sqlmodel import Session, select

from app.core.errors import fail
from app.models.entities import Identity, utcnow


def identity_for(request: Request, session: Session) -> Identity | None:
    token = request.cookies.get(request.app.state.settings.cookie_name, "")
    if not re.fullmatch(r"[A-Za-z0-9_-]{43}", token):
        return None
    digest = hashlib.sha256(token.encode()).hexdigest()
    identity = session.exec(select(Identity).where(Identity.token_hash == digest)).first()
    if identity and identity.expires_at.replace(tzinfo=UTC) > utcnow():
        return identity
    return None


def ensure_identity(request: Request, response: Response, session: Session) -> Identity:
    identity = identity_for(request, session)
    if identity:
        return identity
    settings = request.app.state.settings
    token = secrets.token_urlsafe(32)
    identity = Identity(
        token_hash=hashlib.sha256(token.encode()).hexdigest(),
        expires_at=utcnow() + timedelta(days=settings.session_days),
    )
    session.add(identity)
    session.flush()
    response.set_cookie(
        key=settings.cookie_name,
        value=token,
        httponly=True,
        secure=settings.app_env == "production",
        samesite="lax",
        max_age=settings.session_days * 86400,
        path="/api",
    )
    return identity


class WriteLimiter:
    """Single-process bounded IP window. Replace with shared storage before scaling out."""

    def __init__(self, limit: int):
        self.limit = limit
        self.entries: OrderedDict[str, deque[float]] = OrderedDict()
        self.lock = Lock()

    def check(self, key: str) -> bool:
        now = monotonic()
        with self.lock:
            bucket = self.entries.setdefault(key, deque())
            self.entries.move_to_end(key)
            while bucket and bucket[0] <= now - 60:
                bucket.popleft()
            if len(self.entries) > 10000:
                self.entries.popitem(last=False)
            if len(bucket) >= self.limit:
                return False
            bucket.append(now)
            return True


def protect_write(
    request: Request,
    x_csrf_protection: Annotated[str, Header(description="填写 1；阻止跨站表单操作匿名房间")] = "",
) -> None:
    if x_csrf_protection != "1":
        fail(403, "csrf_required", "请携带 X-CSRF-Protection: 1")
    origin = request.headers.get("origin")
    settings = request.app.state.settings
    if origin and origin not in settings.cors_origins:
        fail(403, "origin_forbidden", "此来源不能修改房间")
    address = request.client.host if request.client else "unknown"
    if not request.app.state.write_limiter.check(address):
        from fastapi import HTTPException

        raise HTTPException(
            429,
            detail={"code": "rate_limited", "message": "操作太快，请一分钟后再试"},
            headers={"Retry-After": "60"},
        )
