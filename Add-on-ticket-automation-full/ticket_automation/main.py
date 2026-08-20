"""
Orchestrator: สร้าง main ticket -> สร้าง add-on ticket -> เขียน id ทั้งคู่ลง DynamoDB

รัน (วางลิงก์อีเวนต์ที่จะสร้าง ticket ให้ตรงๆ):
    python -m ticket_automation.main "https://premanager.ticketmelon.com/organizer/<id>/event/<id>/..."

หรือถ้าไม่ใส่ลิงก์ จะใช้ ORGANIZER_ID / EVENT_ID จาก .env แทน:
    python -m ticket_automation.main
"""
from __future__ import annotations

import argparse
import logging
import re
import sys
import uuid

from .browser import TicketAutomation
from .config import Config
from .dynamodb_client import DynamoDBWriter
from .dynamodb_console import DynamoDBConsoleAutomation

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("ticket-automation")

YELLOW = "\033[93m"
RESET = "\033[0m"

# แกะ organizer id / event id จากลิงก์รูปแบบ .../organizer/<id>/event/<id>/...
EVENT_URL_PATTERN = re.compile(r"/organizer/([^/]+)/event/([^/]+)")


def parse_event_url(url: str) -> tuple[str, str]:
    match = EVENT_URL_PATTERN.search(url)
    if not match:
        raise ValueError(
            "ลิงก์นี้ไม่มีรูปแบบ /organizer/<id>/event/<id>/ — วางลิงก์อีเวนต์แบบเต็มที่คัดลอกมาจาก admin panel"
        )
    return match.group(1), match.group(2)


def print_ticket_ids(main_ticket_id: str, addon_ticket_id: str) -> None:
    print(f"\n{YELLOW}Main ticket id  : {main_ticket_id}{RESET}")
    print(f"{YELLOW}Add-on ticket id: {addon_ticket_id}{RESET}\n")


def run(event_url: str | None = None) -> int:
    organizer_id, event_id = Config.ORGANIZER_ID, Config.EVENT_ID

    if event_url:
        try:
            organizer_id, event_id = parse_event_url(event_url)
        except ValueError as e:
            log.error(str(e))
            return 1
        log.info("Parsed from link -> organizer_id=%s event_id=%s", organizer_id, event_id)

    if not organizer_id or not event_id:
        log.error(
            "ไม่มี organizer id / event id ให้ใช้ — วางลิงก์อีเวนต์เป็น argument ตอนรัน "
            "หรือกรอก ORGANIZER_ID/EVENT_ID ใน .env"
        )
        return 1

    # ticket id ของใบนี้ยังไม่มีจนกว่าจะสร้างเสร็จ เอาไปต่อชื่อตัวเองไม่ได้ (ไก่กับไข่)
    # ใช้ suffix สุ่ม 4 ตัวแทน เพื่อกันชื่อ ticket ซ้ำกันเวลารันทดสอบซ้ำๆ — ใช้ตัวเดียวกัน
    # ทั้ง main และ add-on จะได้รู้ว่าเป็นคู่ที่มาจากการรันรอบเดียวกัน
    name_suffix = uuid.uuid4().hex[:4].upper()
    log.info("Using name suffix: %s", name_suffix)

    try:
        with TicketAutomation() as bot:
            log.info("Logging in and creating main ticket...")
            main_ticket_id = bot.create_main_ticket(organizer_id, event_id, name_suffix)
            log.info("Main ticket created: %s", main_ticket_id)

            log.info("Creating add-on ticket...")
            addon_ticket_id = bot.create_addon_ticket(organizer_id, event_id, name_suffix)
            log.info("Add-on ticket created: %s", addon_ticket_id)
    except Exception:
        log.exception("Browser automation failed")
        return 1

    try:
        log.info(
            "Linking add-on ticket in DynamoDB via %s (events_v1 + ticket_type_v1)...",
            Config.DYNAMODB_METHOD,
        )
        if Config.DYNAMODB_METHOD == "console":
            with DynamoDBConsoleAutomation() as db:
                result = db.link_addon_ticket(
                    event_id=event_id,
                    main_ticket_id=main_ticket_id,
                    addon_ticket_id=addon_ticket_id,
                )
        else:
            result = DynamoDBWriter().link_addon_ticket(
                event_id=event_id,
                main_ticket_id=main_ticket_id,
                addon_ticket_id=addon_ticket_id,
            )
        log.info("DynamoDB updated: %s", result)
    except Exception:
        # DynamoDB ล้มเหลวก็ยังโชว์ ticket id ให้เห็น เผื่อต้องเอาไปกรอกมือระหว่างรอแก้ credential
        log.exception("DynamoDB write failed")
        print_ticket_ids(main_ticket_id, addon_ticket_id)
        return 1

    log.info("Done.")
    print_ticket_ids(main_ticket_id, addon_ticket_id)
    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "event_url",
        nargs="?",
        default=None,
        help='ลิงก์อีเวนต์เต็ม เช่น "https://premanager.ticketmelon.com/organizer/<id>/event/<id>/..."',
    )
    args = parser.parse_args()
    sys.exit(run(args.event_url))
