"""
Auto-detect environment (prod/dev) จาก host ของลิงก์อีเวนต์ที่วางตอนรัน แล้วอัปเดตค่าที่
ต้องเปลี่ยนตาม environment ลงใน .env ให้อัตโนมัติ (ไม่ต้องเข้าไปแก้ไฟล์เอง)

ที่มา: ตอนเทสด้วยมือพบว่า
  - premanager.ticketmelon.com (prod) ใช้ AWS_CONSOLE_ACCOUNT_ALIAS=ticketmelon-production
  - devmanager.ticketmelon.com (dev)  ใช้ AWS_CONSOLE_ACCOUNT_ALIAS=ticketmelon
AWS username/password และ ADMIN_USERNAME/ADMIN_PASSWORD ใช้ร่วมกันได้ทั้ง 2 env
(ยืนยันจากผู้ใช้แล้ว) เลยไม่ต้องแยก — แยกเฉพาะค่าที่ต่างจริงๆ ตาม PROFILES ด้านล่าง

เพิ่ม environment ใหม่ในอนาคต: เพิ่ม entry ใน PROFILES โดยใช้ hostname เป็น key
"""
from __future__ import annotations

import logging
import os
from pathlib import Path
from urllib.parse import urlparse

log = logging.getLogger("ticket-automation")

DOTENV_PATH = Path(__file__).resolve().parent.parent / ".env"

# key ที่ต้อง sync ตาม environment ของลิงก์ที่วาง — เพิ่ม/แก้ที่นี่จุดเดียว
# storage state แยกไฟล์กันต่อ env (ตามที่ยืนยัน) กัน session ของ AWS account หนึ่งเผลอไปใช้
# ผิด account ตอนสลับ env โดยไม่รู้ตัว
PROFILES: dict[str, dict[str, str]] = {
    "premanager.ticketmelon.com": {
        "_name": "production",
        "BASE_URL": "https://premanager.ticketmelon.com",
        "AWS_CONSOLE_ACCOUNT_ALIAS": "ticketmelon-production",
        "STORAGE_STATE_PATH": "storage_state.prod.json",
        "AWS_CONSOLE_STORAGE_STATE_PATH": "aws_console_storage_state.prod.json",
    },
    "devmanager.ticketmelon.com": {
        "_name": "dev",
        "BASE_URL": "https://devmanager.ticketmelon.com",
        "AWS_CONSOLE_ACCOUNT_ALIAS": "ticketmelon",
        "STORAGE_STATE_PATH": "storage_state.dev.json",
        "AWS_CONSOLE_STORAGE_STATE_PATH": "aws_console_storage_state.dev.json",
    },
}


def detect_host(event_url: str) -> str | None:
    return urlparse(event_url).hostname


def apply_environment_profile(event_url: str, dotenv_path: Path = DOTENV_PATH) -> dict | None:
    """แกะ host จากลิงก์ เทียบกับ PROFILES แล้วเขียน key ที่ต่างกันทับลงใน .env (บรรทัดอื่น
    ไม่แตะ) พร้อม set os.environ ให้ process ปัจจุบันเห็นค่าใหม่ทันที คืนค่า None ถ้า host
    ไม่ตรง profile ไหนเลย (ใช้ค่าที่มีอยู่ใน .env เดิมต่อไปโดยไม่แก้อะไร)"""
    host = detect_host(event_url)
    profile = PROFILES.get(host or "")
    if not profile:
        log.warning(
            "ลิงก์นี้เป็น host '%s' ซึ่งไม่มี profile ที่ตั้งไว้ (รู้จักแค่: %s) — จะใช้ค่าที่มี "
            "อยู่ใน .env เดิมต่อไป ถ้าเป็น environment ใหม่ ให้เพิ่ม profile ใน environments.py",
            host, ", ".join(PROFILES.keys()),
        )
        return None

    keys = {k: v for k, v in profile.items() if not k.startswith("_")}
    _write_dotenv_keys(dotenv_path, keys)
    for k, v in keys.items():
        os.environ[k] = v

    return {"host": host, "name": profile["_name"], **keys}


def _write_dotenv_keys(dotenv_path: Path, keys: dict[str, str]) -> None:
    """แก้ค่า key=value ที่มีอยู่แล้วใน .env แบบ in-place (คงบรรทัด/comment/ลำดับเดิมไว้ทั้งหมด)
    ถ้า key ไหนยังไม่มีในไฟล์ ค่อยเติมท้ายไฟล์"""
    remaining = dict(keys)
    lines: list[str] = []
    if dotenv_path.exists():
        lines = dotenv_path.read_text(encoding="utf-8").splitlines(keepends=True)

    for i, line in enumerate(lines):
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key = stripped.split("=", 1)[0].strip()
        if key in remaining:
            lines[i] = f"{key}={remaining.pop(key)}\n"

    if remaining:
        if lines and not lines[-1].endswith("\n"):
            lines[-1] += "\n"
        lines.append("\n# --- auto-synced by environments.py (per-environment values) ---\n")
        for k, v in remaining.items():
            lines.append(f"{k}={v}\n")

    dotenv_path.write_text("".join(lines), encoding="utf-8")
