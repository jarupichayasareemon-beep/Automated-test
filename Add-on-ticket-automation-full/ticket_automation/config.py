"""โหลด config จาก .env — แก้ค่าใน .env ไม่ต้องแตะไฟล์นี้"""
from __future__ import annotations

import os
from dotenv import load_dotenv

load_dotenv()


def _get(key: str, default: str | None = None, required: bool = False) -> str:
    val = os.getenv(key, default)
    if required and not val:
        raise RuntimeError(f"Missing required env var: {key} (ดู .env.example)")
    return val


class Config:
    # Web UI
    BASE_URL = _get("BASE_URL", required=True)
    ADMIN_USERNAME = _get("ADMIN_USERNAME", required=True)
    ADMIN_PASSWORD = _get("ADMIN_PASSWORD", required=True)
    # ไม่บังคับแล้ว — ปกติจะวางลิงก์อีเวนต์ตรงๆ ตอนรัน (python -m ticket_automation.main "<ลิงก์>")
    # แล้วให้สคริปต์แกะ organizer id / event id จากลิงก์เอง ใส่ไว้ที่นี่เป็นแค่ค่า default เผื่อ
    # รันโดยไม่ใส่ลิงก์
    ORGANIZER_ID = _get("ORGANIZER_ID")
    EVENT_ID = _get("EVENT_ID")
    HEADLESS = _get("HEADLESS", "true").lower() == "true"

    # ไฟล์เก็บ session (cookies) ของ browser หลัง login สำเร็จ — รันครั้งต่อไปจะข้าม login ได้
    STORAGE_STATE_PATH = _get("STORAGE_STATE_PATH", "storage_state.json")

    MAIN_TICKET_NAME = _get("MAIN_TICKET_NAME", "General Admission")
    MAIN_TICKET_PRICE = _get("MAIN_TICKET_PRICE", "0")
    MAIN_TICKET_QTY = _get("MAIN_TICKET_QTY", "100")
    ADDON_TICKET_NAME = _get("ADDON_TICKET_NAME", "Add-on")
    ADDON_TICKET_PRICE = _get("ADDON_TICKET_PRICE", "0")
    ADDON_TICKET_QTY = _get("ADDON_TICKET_QTY", "100")

    # AWS / DynamoDB
    AWS_REGION = _get("AWS_REGION", "ap-southeast-1")
    AWS_PROFILE = _get("AWS_PROFILE", "default")

    # table เก็บ event (key: event_id) — ใส่ is_add_on = true
    DYNAMODB_TABLE = _get("DYNAMODB_TABLE", required=True)
    DYNAMODB_PARTITION_KEY = _get("DYNAMODB_PARTITION_KEY", "event_id")

    # table เก็บ ticket type (key: ticket_type_id) — ใส่ type="add-on" ให้ใบ add-on
    # และใส่ add_on={...} ให้ใบ main ที่ผูกกับมัน
    DYNAMODB_TICKET_TYPE_TABLE = _get("DYNAMODB_TICKET_TYPE_TABLE", required=True)
    DYNAMODB_TICKET_TYPE_PARTITION_KEY = _get("DYNAMODB_TICKET_TYPE_PARTITION_KEY", "ticket_type_id")

    # ค่าเงื่อนไขการผูก add-on กับ main ticket (ตามตัวอย่างที่ยืนยันมา: condition
    # "one_ticket_one_item", ซื้อ main 1 ใบ ซื้อ add-on ได้ขั้นต่ำ/สูงสุดเท่านี้)
    ADDON_CONDITION = _get("ADDON_CONDITION", "one_ticket_one_item")
    ADDON_MIN_QTY = int(_get("ADDON_MIN_QTY", "1"))
    ADDON_MAX_QTY = int(_get("ADDON_MAX_QTY", "3"))

    # "console" = ใช้ Playwright คลิกผ่าน AWS Console โดยตรง (ใช้ตอนยังไม่มี IAM access key
    #   ที่ใช้งานได้จริง)
    # "boto3"   = ใช้ AWS SDK ตรงๆ ผ่าน Access Key/Secret ที่ตั้งไว้ตอน aws configure
    DYNAMODB_METHOD = _get("DYNAMODB_METHOD", "console")

    # ---- AWS Console (ใช้เมื่อ DYNAMODB_METHOD=console) ----
    AWS_CONSOLE_BASE_URL = _get("AWS_CONSOLE_BASE_URL", "https://ap-southeast-1.console.aws.amazon.com")
    # ลิงก์ตั้งต้นสำหรับหน้า sign-in (ใช้ลิงก์เดียวกับที่กดด้วยมือแล้ว login ได้จริง แทนการ
    # goto หน้า console เฉยๆ แล้วหวังให้ AWS redirect ไปเองซึ่งไม่เสถียรเท่า)
    AWS_CONSOLE_LOGIN_URL = _get("AWS_CONSOLE_LOGIN_URL")
    AWS_CONSOLE_ACCOUNT_ALIAS = _get("AWS_CONSOLE_ACCOUNT_ALIAS")
    AWS_CONSOLE_USERNAME = _get("AWS_CONSOLE_USERNAME")
    AWS_CONSOLE_PASSWORD = _get("AWS_CONSOLE_PASSWORD")
    AWS_CONSOLE_STORAGE_STATE_PATH = _get("AWS_CONSOLE_STORAGE_STATE_PATH", "aws_console_storage_state.json")
