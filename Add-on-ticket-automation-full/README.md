# Ticket Automation

สคริปต์ Python สำหรับ automate flow ที่น่าเบื่อ: สร้าง main ticket + add-on ticket ผ่าน
Web UI ของระบบจองอีเวนต์ (ด้วย Playwright) แล้วเอา ticket id ทั้งสองไปเขียนลง DynamoDB
อัตโนมัติ (ด้วย boto3) โดยไม่ต้องเปิด AWS Console แก้มือ

## ตอบคำถาม: automate การใช้ database ได้ไหม

ได้ และเป็นส่วนที่ automate ง่ายที่สุดในสามขั้นตอนนี้ เพราะ DynamoDB มี SDK (boto3) ที่เรียก
`update_item` ได้ตรงๆ ไม่ต้องพึ่ง UI เลย สิ่งที่ต้องมีคือ (1) AWS credentials ที่มีสิทธิ์
`dynamodb:UpdateItem` บน table เป้าหมาย และ (2) ชื่อ table + partition key ที่ถูกต้อง —
ทั้งหมดอยู่ใน `ticket_automation/dynamodb_client.py` แล้ว ส่วนที่ automate ยากกว่าคือขั้นตอน
สร้าง ticket เพราะต้องขับเคลื่อนผ่าน UI (ยังไม่มี API ให้เรียกตรง) จึงต้องใช้ browser
automation (Playwright) แทน

## โครงสร้างโปรเจก

```
ticket-automation/
├── requirements.txt
├── .env.example              # copy เป็น .env แล้วกรอกค่าจริง
└── ticket_automation/
    ├── config.py              # โหลดค่าจาก .env
    ├── browser.py             # Playwright: login + สร้าง ticket 2 อัน
    ├── dynamodb_client.py     # boto3: เขียน ticket id ลง DynamoDB
    └── main.py                # รวม flow ทั้งหมด, entry point
```

## เริ่มต้นโปรเจก (setup ครั้งแรก)

1. สร้าง virtual environment แล้วติดตั้ง dependency

   ```bash
   cd ticket-automation
   python3 -m venv venv
   source venv/bin/activate        # Windows: venv\Scripts\activate
   pip install -r requirements.txt
   playwright install chromium
   ```

2. ตั้งค่า AWS credentials (ครั้งเดียวต่อเครื่อง)

   ```bash
   aws configure --profile default
   ```

   ใส่ Access Key / Secret / region ของ IAM user ที่มีสิทธิ์ `dynamodb:UpdateItem`
   บน table ที่จะใช้ (ถ้าไม่มี IAM user นี้ ต้องให้ทีม AWS สร้างให้ พร้อม policy ประมาณนี้:

   ```json
   {
     "Effect": "Allow",
     "Action": "dynamodb:UpdateItem",
     "Resource": "arn:aws:dynamodb:<region>:<account-id>:table/<table-name>"
   }
   ```

3. Copy `.env.example` เป็น `.env` แล้วกรอกค่าจริง: URL ของ admin panel, username/password
   สำหรับทดสอบ, event id, ชื่อ DynamoDB table และ partition key

## ขั้นตอนสร้าง "main ticket" แบบละเอียด (ไม่ต้องอ่าน HTML เองก็ได้)

ขั้นตอนที่ 4 ในทุก guide ก่อนหน้านี้บอกให้ "แก้ selector เอง" ซึ่งต้องอ่าน HTML เป็น — ถ้ายัง
ไม่ถนัด ให้ใช้เครื่องมือของ Playwright เองชื่อ `codegen` แทน มันจะ**เปิดเบราว์เซอร์ให้คุณคลิก
ด้วยมือตามปกติ แล้วมันเขียนโค้ดให้อัตโนมัติ** ไม่ต้องเปิด DevTools เอง

1. รันคำสั่งนี้ (แทน URL ด้วยหน้า login จริงของระบบคุณ)

   ```bash
   playwright codegen https://your-event-admin.example.com/login
   ```

   จะมีหน้าต่างเปิดขึ้นมา 2 อัน: (ก) เบราว์เซอร์จริงให้คุณคลิกเล่นตามปกติ (ข) หน้าต่าง
   "Playwright Inspector" ที่โชว์โค้ด Python สดๆ ตามที่คุณคลิก

2. ในเบราว์เซอร์ที่เปิดขึ้นมา ทำตามลำดับนี้ทีละขั้น (เหมือนสร้าง ticket ด้วยมือปกติ):
   - login เข้า admin panel ด้วย username/password ทดสอบ
   - ไปหน้าสร้าง ticket ของ event ที่ต้องการ
   - กรอกฟอร์มสร้าง main ticket ให้ครบ (ชื่อ ticket, ราคา ฯลฯ)
   - กดปุ่ม submit/สร้าง

3. ดูที่หน้าต่าง Inspector — จะเห็นโค้ดประมาณนี้ถูกเขียนให้อัตโนมัติ:

   ```python
   page.goto("https://your-event-admin.example.com/login")
   page.fill("input[name=\"username\"]", "admin")
   page.fill("input[name=\"password\"]", "xxxx")
   page.click("button[type=\"submit\"]")
   page.goto("https://your-event-admin.example.com/events/123/tickets/new")
   page.fill("input[name=\"ticketName\"]", "General Admission")
   page.click("text=Create Ticket")
   ```

   นี่คือ selector จริงของระบบคุณ — ไม่ต้องเดาเอง

4. copy บรรทัดที่เกี่ยวกับ **login** ไปแทนที่ของเดิมใน `login()` (ในไฟล์
   `ticket_automation/browser.py`) และ copy บรรทัดที่เกี่ยวกับ **การกรอกฟอร์มสร้าง ticket**
   ไปแทนที่ในฟังก์ชัน `_create_ticket()` ตรงจุดที่มี `# TODO:` (เอา URL/ชื่อ/ราคาที่ hardcode
   ไว้ กลับไปใช้ตัวแปร `Config.xxx` เหมือนเดิม แค่ยืม selector มา ไม่ต้องยืมค่าที่กรอก)

5. ปิดหน้าต่าง codegen แล้วรันสคริปต์จริงด้วย `HEADLESS=false` ใน `.env` ก่อน จะได้เห็น
   เบราว์เซอร์เปิดขึ้นมาสร้าง ticket ให้เอง ตรวจดูว่าตรงกับที่ทำด้วยมือไหม ก่อนค่อยเปลี่ยนเป็น
   `HEADLESS=true` ตอนใช้งานจริง

ทำ 2 ฟังก์ชันนี้ให้เสร็จก่อน (`login` + `create_main_ticket`) ค่อยไปทำ `create_addon_ticket`
ต่อ วิธีเดียวกันเป๊ะ แค่เปลี่ยนหน้าเป็นฟอร์มสร้าง add-on

## Session login — ไม่ต้อง login ใหม่ทุกครั้งที่รัน

สคริปต์ถูกตั้งไว้ให้จัดการเรื่องนี้อัตโนมัติแล้ว ไม่ต้องเขียนเพิ่ม: รอบแรกที่รัน มันจะ login
ตามปกติ แล้วเซฟ cookies ของ browser ลงไฟล์ `storage_state.json` (ชื่อไฟล์กำหนดได้ผ่าน
`STORAGE_STATE_PATH` ใน `.env`) รอบถัดๆ ไปมันจะโหลดไฟล์นี้มาใช้แทนการ login ใหม่ — เร็วกว่า
และลดโอกาสโดน rate-limit จากการ login ถี่ๆ ถ้า session หมดอายุ (เช่นถูก logout ฝั่งเซิร์ฟเวอร์)
สคริปต์จะ detect แล้ว login ใหม่ให้อัตโนมัติ (เช็คจาก URL ที่ redirect กลับไปหน้า `/login` —
ถ้าระบบคุณ detect ต่างจากนี้ ให้แก้ที่ฟังก์ชัน `_is_logged_in()` ใน `browser.py`)

**ข้อควรระวัง**: `storage_state.json` มีค่าเทียบเท่ารหัสผ่าน (ใครถือไฟล์นี้ = login เป็นคุณได้
ทันทีโดยไม่ต้องรู้ password) ไฟล์นี้ถูกใส่ไว้ใน `.gitignore` แล้วเพื่อกันหลุดขึ้น git ห้าม
ส่งไฟล์นี้ให้ใครหรืออัปโหลดที่ไหนทั้งสิ้น

> เรื่อง link AWS DynamoDB Console ที่ส่งมา — สังเกตว่า URL นั้นมี parameter `code=...`
> ต่อท้ายยาวมาก ซึ่งเป็น **auth code สำหรับ login เข้า AWS Console ชั่วคราว** (จาก IAM
> Identity Center/SSO) มีค่าเทียบเท่า session token ใครมี URL นี้ตอนยังไม่หมดอายุก็เข้า
> account AWS คุณได้เลย แนะนำอย่าแชร์ URL แบบนี้ต่อที่ไหนอีก (รวมถึงในแชทนี้ครั้งต่อไป) —
> ผมจะไม่เปิดหรือใช้ลิงก์นี้ และสคริปต์ในโปรเจกนี้ก็ไม่ต้องใช้ลิงก์ Console แบบนี้ด้วย เพราะ
> `dynamodb_client.py` คุยกับ DynamoDB ผ่าน boto3 + IAM access key/secret (ที่ตั้งไว้ตอน
> `aws configure`) ไม่ใช่ผ่าน browser session — ลิงก์นี้มีไว้แค่ให้คนเข้าไปดู table ด้วยตาผ่าน
> เว็บเท่านั้น ถ้ากังวลว่า session หลุดไปแล้ว ให้แจ้งทีม AWS/แอดมิน IAM Identity Center เพื่อ
> revoke session ได้

## รัน

```bash
python -m ticket_automation.main
```

Log จะบอกทีละขั้น: login → สร้าง main ticket → สร้าง add-on ticket → เขียนลง DynamoDB →
สรุปผลลัพธ์สุดท้าย (ticket id ทั้งสองตัว)

## วิธีดึง ticket id (สำคัญ)

ใน `browser.py` ใช้วิธีดัก network response ของ API ที่หน้าเว็บเรียกตอนกด "สร้าง" เป็นหลัก
(เชื่อถือได้กว่าอ่านจาก DOM เพราะไม่ขึ้นกับว่า UI จะโชว์ id ให้เห็นหรือเปล่า) ถ้าจับ pattern
URL ไม่เจอ ให้เปิด DevTools → Network tab ตอนกดสร้าง ticket จริง แล้วดูว่า request เรียก
endpoint อะไร response หน้าตาเป็นยังไง แล้วแก้ `api_url_pattern` กับ key ที่อ่าน id ให้ตรง

## ขยายต่อได้

- **รันอัตโนมัติเป็นรอบ**: ครอบ `main.py` ด้วย cron / GitHub Actions schedule ได้ตรงๆ
- **รันเป็นชุด (batch)**: แก้ `main.py` ให้ loop สร้างหลาย event/หลายคู่ ticket จาก list
  ที่อ่านจาก CSV
- **Retry**: ถ้า UI/network ไม่เสถียร เพิ่ม retry decorator รอบ `_create_ticket` ใน
  `browser.py`
- **Idempotency**: ถ้าไม่อยากสร้าง ticket ซ้ำเวลารันซ้ำ ให้เช็คใน DynamoDB ก่อนว่า
  event นี้มี `mainTicketId` อยู่แล้วหรือยัง (`get_item`) ก่อนเรียก `create_main_ticket`
