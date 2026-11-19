FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app

COPY requirements.lock.txt .
RUN python -m pip install --no-cache-dir -r requirements.lock.txt

RUN groupadd --system app && useradd --system --gid app app
COPY --chown=app:app app ./app
COPY --chown=app:app alembic ./alembic
COPY --chown=app:app alembic.ini docker-start.sh ./
USER app

EXPOSE 8000
CMD ["sh", "/app/docker-start.sh"]
