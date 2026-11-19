"""Generate committed static examples from the validated canonical rule library."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.services.rule_engine import build_examples  # noqa: E402
from app.services.rule_library import load_rule_library  # noqa: E402


def render_examples() -> str:
    payload = build_examples(load_rule_library())
    return json.dumps(payload, ensure_ascii=False, indent=2) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Check without writing files")
    arguments = parser.parse_args()
    target = ROOT / "frontend" / "src" / "data" / "examples.json"
    expected = render_examples()
    if arguments.check:
        if not target.exists() or target.read_text(encoding="utf-8") != expected:
            print(
                "Static examples are missing or stale. Run scripts/sync_examples.py.",
                file=sys.stderr,
            )
            return 1
        print("Rule library valid; 9 static example sets are in sync.")
        return 0
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(expected, encoding="utf-8", newline="\n")
    print("Generated 9 static example sets (3 per space, 5 rules per set).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
