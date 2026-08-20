"""
ผูก add-on ticket กับ main ticket ใน DynamoDB โดยคลิกผ่าน AWS Console ตรงๆ ด้วย Playwright
(ทางเลือกแทน boto3 — ใช้ตอนยังไม่มี IAM access key ที่ใช้งานได้จริง)

selector มาจาก playwright codegen จริงที่ record ไว้ (login ผ่านฟอร์ม IAM sign-in +
ค้นหา/เปิด item ใน DynamoDB item explorer)

วิธีแก้ item: ต่างจากตอน record (ซึ่งกด arrow key นับตำแหน่ง cursor แล้วพิมพ์แทรก — เปราะบาง
มาก เพราะตำแหน่งจะเปลี่ยนถ้า item มี field ไม่เท่ากัน) ไฟล์นี้อ่าน JSON ทั้งก้อนของ item
ออกมาก่อน (ผ่าน hidden textarea ที่ Ace editor ใช้รับ input) เอามาแก้ด้วย Python dict
แล้วเขียน JSON ทั้งก้อนกลับเข้าไปแทนที่ทั้งหมด — ทนทานกว่าเพราะไม่ขึ้นกับตำแหน่ง field เดิม

จุดที่ยังไม่ชัวร์ 100% (ยังไม่เคยรันจริง ต้องทดสอบ):
  1. `.ace_text-input` sync กับเนื้อหาทั้งก้อนของ editor จริงไหม (ถ้าไม่ใช่ ต้องเปลี่ยนวิธีอ่าน/เขียน)
  2. ระบบมี MFA/2FA ไหม — ใน recording ที่ส่งมาไม่มีขั้นตอน OTP เลยเขียน login() แบบไม่มี MFA
     ไว้ก่อน ถ้าเจอหน้า MFA ต้องบอกผมเพิ่ม
"""
from __future__ import annotations

import json
import os
from playwright.sync_api import sync_playwright, BrowserContext, Page

from .config import Config


class DynamoDBConsoleAutomation:
    def __init__(self):
        self._playwright = None
        self._browser = None
        self._context: BrowserContext | None = None
        self._page: Page | None = None

    def _wait_ready(self, timeout: int = 30000):
        """รอหน้าโหลดเสร็จ แบบทนต่อ AWS console ที่มักไม่ network idle จริง (มี
        background polling/telemetry ค้างตลอด ทำให้ networkidle timeout ทั้งที่หน้าโหลด
        เสร็จแล้วจริงๆ — domcontentloaded/load fire ไปแล้ว). ลอง networkidle ก่อน ถ้า
        timeout ก็ fallback ไป "load" แทนโดยไม่ throw"""
        page = self._page
        try:
            page.wait_for_load_state("networkidle", timeout=timeout)
        except Exception:
            page.wait_for_load_state("load", timeout=timeout)

    def __enter__(self) -> "DynamoDBConsoleAutomation":
        self._playwright = sync_playwright().start()
        self._browser = self._playwright.chromium.launch(headless=Config.HEADLESS)

        has_saved_session = os.path.exists(Config.AWS_CONSOLE_STORAGE_STATE_PATH)
        self._context = self._browser.new_context(
            storage_state=Config.AWS_CONSOLE_STORAGE_STATE_PATH if has_saved_session else None
        )
        self._page = self._context.new_page()

        if not has_saved_session or not self._is_logged_in():
            self.login()

        return self

    def __exit__(self, exc_type, exc, tb):
        if self._browser:
            self._browser.close()
        if self._playwright:
            self._playwright.stop()

    # ---------------------------------------------------------------
    def _dynamodb_home_url(self) -> str:
        return f"{Config.AWS_CONSOLE_BASE_URL}/dynamodbv2/home?region={Config.AWS_REGION}"

    def _is_logged_in(self) -> bool:
        page = self._page
        page.goto(self._dynamodb_home_url())
        self._wait_ready()
        # ถ้ายังไม่ login AWS จะ redirect ไปหน้า signin.aws.amazon.com เสมอ
        return "signin.aws.amazon.com" not in page.url

    def login(self):
        if not (Config.AWS_CONSOLE_ACCOUNT_ALIAS and Config.AWS_CONSOLE_USERNAME and Config.AWS_CONSOLE_PASSWORD):
            raise RuntimeError(
                "ยังไม่ได้ตั้งค่า AWS_CONSOLE_ACCOUNT_ALIAS / AWS_CONSOLE_USERNAME / "
                "AWS_CONSOLE_PASSWORD ใน .env"
            )

        page = self._page

        # เข้าลิงก์เดียวกับที่กดด้วยมือแล้ว login ได้จริง (มีค่า client_id/redirect_uri/
        # code_challenge ที่ AWS ใช้ทำ OAuth handshake) แทนการ goto หน้า console เฉยๆ
        # เพราะ goto หน้า console เฉยๆ แล้วหวังให้ AWS redirect ไปหน้า sign-in เองไม่เสถียร
        login_start_url = Config.AWS_CONSOLE_LOGIN_URL or self._dynamodb_home_url()

        try:
            page.goto(login_start_url)
            self._wait_ready()

            page.get_by_role("textbox", name="Account ID or alias (Don't").fill(Config.AWS_CONSOLE_ACCOUNT_ALIAS)
            page.get_by_role("textbox", name="IAM username").fill(Config.AWS_CONSOLE_USERNAME)
            page.get_by_role("textbox", name="Password").fill(Config.AWS_CONSOLE_PASSWORD)
            page.get_by_test_id("sign-in").click()

            # รอจน URL หลุดออกจากโดเมน signin จริงๆ (ไม่ใช่แค่ network idle เฉยๆ) — ตอน
            # ทดสอบพบว่าปุ่ม Sign in ยัง spin อยู่ตอน networkidle resolve แล้ว แปลว่า resolve
            # เร็วเกินไป ต้องรอ URL เปลี่ยนจริงๆ ถึงจะชัวร์ว่า auth request จบแล้ว
            try:
                page.wait_for_url(lambda url: "signin.aws.amazon.com" not in url, timeout=45000)
            except Exception:
                pass  # ถ้ายังไม่หลุด (เช่น credential ผิด) ปล่อยให้ไปเจอ error ที่เช็คซ้ำด้านล่างแทน
            self._wait_ready()
        except Exception:
            # ถ่าย screenshot ตรงจุดที่ fail จริงๆ เผื่อฟอร์ม login หน้าตาไม่ตรงที่คาดไว้
            page.screenshot(path="debug_login_form_failed.png", full_page=True)
            raise

        # ถ่าย screenshot ไว้ดู เผื่อ AWS ขึ้น error message (เช่น account/username/password
        # ผิด) — เดี๋ยวจะ navigate ทับหน้านี้ในขั้นถัดไป
        page.screenshot(path="debug_after_signin_click.png", full_page=True)

        # บางระบบมีหน้ายืนยันอีกชั้น (ตามที่เจอตอน record) กดต่อถ้ามี
        confirm_link = page.get_by_role("link", name="Sign in")
        if confirm_link.count() > 0:
            confirm_link.click()
            self._wait_ready()

        # เช็คซ้ำให้ชัวร์ว่า login สำเร็จจริงก่อนเซฟ session — กันไม่ให้เซฟ session ที่ยัง
        # auth ไม่สมบูรณ์ (ซึ่งจะทำให้รันครั้งต่อไปเข้าใจผิดว่า login แล้วทั้งที่ยังไม่ได้)
        page.goto(self._dynamodb_home_url())
        self._wait_ready()
        if "signin.aws.amazon.com" in page.url:
            page.screenshot(path="debug_login_failed.png", full_page=True)
            raise RuntimeError(
                "Login ไม่สำเร็จ (ยังอยู่ที่หน้า sign-in หลังกรอกฟอร์มแล้ว) — เช็คว่า "
                "AWS_CONSOLE_ACCOUNT_ALIAS/USERNAME/PASSWORD ถูกต้องไหม หรือระบบมี MFA "
                "ที่ต้องกรอกเพิ่ม ดู screenshot ที่ debug_login_failed.png"
            )

        self._context.storage_state(path=Config.AWS_CONSOLE_STORAGE_STATE_PATH)

    # ---------------------------------------------------------------
    def _item_explorer_query_url(self, table: str) -> str:
        return f"{self._dynamodb_home_url()}#item-explorer?operation=QUERY&table={table}"

    def _open_item(self, table: str, key_value: str):
        page = self._page
        page.goto(self._item_explorer_query_url(table))
        self._wait_ready()

        try:
            page.get_by_role("textbox", name="Value").click(timeout=15000)
        except Exception:
            # ถ่าย screenshot ไว้ debug — ไฟล์จะโผล่ในโฟลเดอร์โปรเจกเดียวกับที่รันคำสั่งอยู่
            shot_path = f"debug_open_item_{table}.png"
            page.screenshot(path=shot_path, full_page=True)
            raise RuntimeError(
                f"หา textbox 'Value' บนหน้า item explorer ของ table '{table}' ไม่เจอภายใน 15 วิ "
                f"— ถ่าย screenshot ไว้ที่ {shot_path} แล้ว ส่งไฟล์นี้มาดูได้เลย"
            )

        page.get_by_role("textbox", name="Value").fill(key_value)
        page.get_by_test_id("run-filter").click()
        self._wait_ready()

        page.get_by_role("link", name=key_value).click()
        self._wait_ready()

        # ยืนยันว่าเปิด item detail จริงๆ แล้ว (ไม่ใช่แค่ยังค้างอยู่หน้า search results เฉยๆ)
        # โดยรอปุ่ม "Save and close" ให้ปรากฏ — ถ้าคลิกครั้งแรกไม่ติด (เช่น element ยังไม่พร้อม
        # รับคลิกตอนนั้นพอดี) ลองคลิกซ้ำอีกครั้งก่อนจะถือว่า fail จริง
        save_button = page.get_by_role("button", name="Save and close")
        try:
            save_button.wait_for(timeout=10000)
            return
        except Exception:
            pass

        page.get_by_role("link", name=key_value).click()
        self._wait_ready()
        try:
            save_button.wait_for(timeout=15000)
        except Exception:
            shot_path = f"debug_item_not_opened_{table}.png"
            page.screenshot(path=shot_path, full_page=True)
            raise RuntimeError(
                f"คลิกลิงก์ '{key_value}' แล้ว 2 ครั้งแต่หน้า item detail ไม่เปิด (ไม่เจอปุ่ม "
                f"Save and close) — ดู screenshot ที่ {shot_path} แล้วส่งมาดูได้เลย"
            )

    def _read_item_json(self) -> dict:
        page = self._page
        try:
            page.wait_for_selector(".ace_editor", timeout=15000)
            # `.ace_text-input` (hidden textarea) ไม่ mirror เนื้อหาทั้งก้อนจริง (test แล้วได้
            # ค่าว่างเปล่า) เลยดึงค่าจาก Ace editor instance ตรงๆ ผ่าน JS แทน — Ace ผูก
            # instance ไว้ที่ `.env.editor` ของ DOM node ตัวเอง เป็นวิธีมาตรฐานในการอ่านเนื้อหา
            # editor แบบเต็มไม่ตกหล่น (ต่างจากอ่านจาก DOM ที่แสดงผล ซึ่งบางบรรทัดอาจไม่ render
            # ถ้า editor ยาวเกิน viewport)
            raw = page.evaluate("document.querySelector('.ace_editor').env.editor.getValue()")
        except Exception:
            page.screenshot(path="debug_read_item_json_failed.png", full_page=True)
            raise RuntimeError(
                "อ่านเนื้อหา JSON editor ไม่สำเร็จ — ดู screenshot ที่ "
                "debug_read_item_json_failed.png แล้วส่งมาดูได้เลย"
            )
        if not raw:
            page.screenshot(path="debug_read_item_json_failed.png", full_page=True)
            raise RuntimeError(
                "อ่านค่าจาก Ace editor ได้แต่เป็นค่าว่างเปล่า — ดู screenshot ที่ "
                "debug_read_item_json_failed.png แล้วส่งมาดูได้เลย"
            )
        return json.loads(raw)

    def _write_item_json(self, data: dict):
        text = json.dumps(data, indent=2)
        self._page.evaluate(
            "(text) => { document.querySelector('.ace_editor').env.editor.setValue(text, -1); }",
            text,
        )

    def _save_and_close(self):
        page = self._page
        page.get_by_role("button", name="Save and close").click()
        self._wait_ready()

    # ---------------------------------------------------------------
    def set_event_is_add_on(self, event_id: str) -> dict:
        self._open_item(Config.DYNAMODB_TABLE, event_id)
        data = self._read_item_json()
        data["is_add_on"] = True
        self._write_item_json(data)
        self._save_and_close()
        return data

    def set_ticket_type_as_addon(self, addon_ticket_id: str) -> dict:
        self._open_item(Config.DYNAMODB_TICKET_TYPE_TABLE, addon_ticket_id)
        data = self._read_item_json()
        data["type"] = "add-on"
        self._write_item_json(data)
        self._save_and_close()
        return data

    def link_main_ticket_to_addon(self, main_ticket_id: str, addon_ticket_id: str) -> dict:
        self._open_item(Config.DYNAMODB_TICKET_TYPE_TABLE, main_ticket_id)
        data = self._read_item_json()
        data["add_on"] = {
            "condition": Config.ADDON_CONDITION,
            "is_active": True,
            "ticket_type": {
                addon_ticket_id: {
                    "conditions": {
                        "min": Config.ADDON_MIN_QTY,
                        "max": Config.ADDON_MAX_QTY,
                    }
                }
            },
        }
        self._write_item_json(data)
        self._save_and_close()
        return data

    def link_addon_ticket(self, event_id: str, main_ticket_id: str, addon_ticket_id: str) -> dict:
        return {
            "event": self.set_event_is_add_on(event_id),
            "addon_ticket_type": self.set_ticket_type_as_addon(addon_ticket_id),
            "main_ticket_type": self.link_main_ticket_to_addon(main_ticket_id, addon_ticket_id),
        }
