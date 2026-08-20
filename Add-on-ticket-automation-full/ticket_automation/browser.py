"""
Browser automation สำหรับสร้าง ticket ผ่าน Web UI ของ Ticketmelon (premanager.ticketmelon.com)

selector ในไฟล์นี้มาจาก `playwright codegen` จริงที่คุณ record ไว้ (login + สร้าง main ticket +
สร้าง add-on ticket) แก้ให้เป็นฟังก์ชันที่ใช้ config แทนค่า hardcode แล้ว

Endpoint ที่ใช้สร้าง ticket type (ยืนยันจาก network log จริงแล้ว):
  POST https://api-backend.ticketmelon.com/v1/manager/events/<event_id>/tickettype
  response: {"message": {"ticket_type_id": "...", "sort_number": N}, "errorCode": "", ...}

จุดที่ยังไม่แน่ใจ 100%:
  ตอน record ฝั่ง add-on ticket ไม่มีการกด "Save" ปรากฏในสคริปต์ที่ส่งมา (ต่างจากฝั่ง
  main ticket ที่กด Save ชัดเจน) ไฟล์นี้เพิ่ม Save ให้ทั้งคู่ไว้ก่อนโดยสมมติว่า modal เดียวกัน
  ต้องกด Save เสมอ — ถ้ารันแล้ว error ตรงนี้ให้บอกผม จะแก้ให้ตรงกับพฤติกรรมจริง
"""
from __future__ import annotations

import os
from playwright.sync_api import sync_playwright, BrowserContext, Page, Response

from .config import Config


class TicketAutomation:
    def __init__(self):
        self._playwright = None
        self._browser = None
        self._context: BrowserContext | None = None
        self._page: Page | None = None

    # ---- context manager: with TicketAutomation() as bot: ----
    def __enter__(self) -> "TicketAutomation":
        self._playwright = sync_playwright().start()
        self._browser = self._playwright.chromium.launch(headless=Config.HEADLESS)

        # ถ้าเคย login แล้วมีไฟล์ session (storage_state) อยู่ ให้โหลด cookies เดิมมาใช้เลย
        has_saved_session = os.path.exists(Config.STORAGE_STATE_PATH)
        self._context = self._browser.new_context(
            storage_state=Config.STORAGE_STATE_PATH if has_saved_session else None
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
    def _ticket_type_url(self, organizer_id: str, event_id: str) -> str:
        return f"{Config.BASE_URL}/organizer/{organizer_id}/event/{event_id}/detail/ticket-type/"

    def _is_logged_in(self) -> bool:
        """เช็คว่า session ที่โหลดมายังใช้ได้อยู่ไหม โดยลองเข้าหน้าแรกของระบบ
        ถ้ายังไม่ login ระบบ Ticketmelon จะโชว์ปุ่ม "Sign In" ให้เห็นแทนที่จะพาเข้าเนื้อหา"""
        page = self._page
        page.goto(Config.BASE_URL)
        page.wait_for_load_state("networkidle")
        return page.get_by_role("button", name="Sign In").count() == 0

    def login(self):
        page = self._page
        page.goto(Config.BASE_URL)
        page.get_by_role("button", name="Sign In").click()
        page.get_by_role("textbox", name="Enter your email").fill(Config.ADMIN_USERNAME)
        page.get_by_role("textbox", name="Enter your password").fill(Config.ADMIN_PASSWORD)
        page.locator("#btn-submit-login").click()
        page.wait_for_load_state("networkidle")

        # login สำเร็จแล้ว เซฟ cookies/session ลงไฟล์ ไว้ให้รันครั้งต่อไปข้าม login ได้เลย
        self._context.storage_state(path=Config.STORAGE_STATE_PATH)

    # ---------------------------------------------------------------
    def create_main_ticket(self, organizer_id: str, event_id: str, name_suffix: str = "") -> str:
        page = self._page
        page.goto(self._ticket_type_url(organizer_id, event_id))
        page.wait_for_load_state("networkidle")
        return self._create_ticket_via_modal(
            name=f"{Config.MAIN_TICKET_NAME} {name_suffix}".strip(),
            price=Config.MAIN_TICKET_PRICE,
            quantity=Config.MAIN_TICKET_QTY,
            check_sale_ends_at_entry_end=True,
        )

    def create_addon_ticket(self, organizer_id: str, event_id: str, name_suffix: str = "") -> str:
        # ทำขั้นตอนเดียวกันเป๊ะกับ create_main_ticket() เปลี่ยนแค่ชื่อ/ราคา/จำนวน
        page = self._page
        page.goto(self._ticket_type_url(organizer_id, event_id))
        page.wait_for_load_state("networkidle")
        return self._create_ticket_via_modal(
            name=f"{Config.ADDON_TICKET_NAME} {name_suffix}".strip(),
            price=Config.ADDON_TICKET_PRICE,
            quantity=Config.ADDON_TICKET_QTY,
            check_sale_ends_at_entry_end=True,
        )

    # ---------------------------------------------------------------
    def _create_ticket_via_modal(
        self, name: str, price: str, quantity: str, check_sale_ends_at_entry_end: bool
    ) -> str:
        page = self._page
        captured_id: dict[str, str | None] = {"id": None}
        all_captured: list[dict] = []  # เก็บ POST JSON ทุกตัวไว้ debug เผื่อ endpoint หลักไม่ตรง

        def on_response(response: Response):
            if response.request.method != "POST":
                return
            ctype = response.headers.get("content-type", "")
            if "json" not in ctype:
                return
            try:
                body = response.json()
            except Exception:
                return
            all_captured.append({"url": response.url, "body": body})
            if "/tickettype" in response.url:
                ticket_id = (body.get("message") or {}).get("ticket_type_id")
                if ticket_id:
                    captured_id["id"] = str(ticket_id)

        page.on("response", on_response)

        page.get_by_label("Ticket Type").get_by_role("button", name="Add Tickets").click()
        page.get_by_role("textbox", name="e.g.Early Bird").fill(name)
        page.get_by_role("textbox", name="Number of tickets").fill(str(quantity))

        page.get_by_text("Select entry date").click()
        page.get_by_text("Select All").click()
        page.locator(".MuiBackdrop-root").click()

        if check_sale_ends_at_entry_end:
            page.get_by_role("checkbox", name="Sale ends at entry end time").check()

        page.get_by_role("textbox", name="0").fill(str(price))
        page.get_by_role("button", name="Save").click()
        page.wait_for_load_state("networkidle")

        page.remove_listener("response", on_response)

        if captured_id["id"]:
            return captured_id["id"]

        print(f"\n===== [DEBUG] POST JSON responses ระหว่างสร้าง ticket '{name}' (หา id ไม่เจอ) =====")
        for item in all_captured:
            print(f"URL: {item['url']}\nBODY: {item['body']}\n---")
        if not all_captured:
            print("(ไม่มี POST JSON response ใดๆ เกิดขึ้นเลย — Save อาจไม่ได้ยิง request จริง)")
        print("===== [DEBUG] จบ log =====\n")

        shot_path = f"debug_create_ticket_failed.png"
        page.screenshot(path=shot_path, full_page=True)

        raise RuntimeError(
            f"สร้าง ticket '{name}' ผ่าน UI (กด Save แล้ว) แต่ดึง ticket_type_id ไม่ได้ "
            f"— ดู [DEBUG] log ด้านบน และ screenshot ที่ {shot_path} (คัดลอก/ส่งมาให้ดู)"
        )
