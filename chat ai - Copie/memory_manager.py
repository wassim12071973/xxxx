import json
import os
from typing import List

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
WRITABLE_DIR = os.getenv("MEMORY_DIR", "/tmp")

CORE_MEMORY_FILE = os.path.join(BASE_DIR, "core_memory.json")
USER_MEMORY_SEED_FILE = os.path.join(BASE_DIR, "user_memory.json")
USER_MEMORY_FILE = os.path.join(WRITABLE_DIR, "user_memory.json")


def _load_json(path: str) -> dict:
    if not os.path.exists(path):
        return {}
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def _save_json(path: str, data: dict):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


# =========================
# Core Memory
# =========================

def load_core_memory() -> dict:
    return _load_json(CORE_MEMORY_FILE)


def save_core_memory(data: dict):
    _save_json(CORE_MEMORY_FILE, data)


# =========================
# User Memory
# =========================

def _resolve_user_memory_file() -> str:
    if os.path.exists(USER_MEMORY_FILE):
        return USER_MEMORY_FILE
    if os.path.exists(USER_MEMORY_SEED_FILE):
        return USER_MEMORY_SEED_FILE
    return USER_MEMORY_FILE


def load_user_memory() -> dict:
    return _load_json(_resolve_user_memory_file())


def add_user_fact(fact: str):
    data = load_user_memory()

    facts: List[str] = data.get("facts", [])

    if fact not in facts:
        facts.append(fact)

    data["facts"] = facts
    save_user_memory(data)


def save_user_memory(data: dict):
    # On serverless platforms (like Vercel), only temporary dirs are writable.
    _save_json(USER_MEMORY_FILE, data)


# =========================
# Prompt Builder
# =========================

def build_memory_prompt() -> str:
    core = load_core_memory()
    user = load_user_memory()

    lines = []

    if core:
        lines.append("Core memory:")
        for k, v in core.items():
            if isinstance(v, list):
                lines.append(f"- {k}: {', '.join(v)}")
            else:
                lines.append(f"- {k}: {v}")

    if user.get("facts"):
        lines.append("\nUser memory:")
        for fact in user["facts"]:
            lines.append(f"- {fact}")

    return "\n".join(lines)
