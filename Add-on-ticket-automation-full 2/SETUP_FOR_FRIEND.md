# วิธีติดตั้ง (สำหรับเพื่อน)

> zip นี้แพ็ก `.env` (username/password จริงของเว็บแอดมิน + AWS) มาให้ด้วยแล้ว เพราะใช้
> account ร่วมกันภายในทีม — **ห้ามส่งต่อ zip นี้ออกนอกทีม หรืออัปโหลดขึ้นที่สาธารณะ**
> (เช่น GitHub public repo, Google Drive แชร์ลิงก์เปิดสาธารณะ ฯลฯ) เด็ดขาด

## 1. แตกไฟล์ zip แล้วเข้าไปในโฟลเดอร์

```bash
cd Add-on-ticket-automation-full
```

## 2. สร้าง virtual environment แล้วติดตั้ง dependency

ต้องมี Python 3.10 ขึ้นไป

```bash
python3 -m venv ticket_automation/venv
source ticket_automation/venv/bin/activate     # Windows: ticket_automation\venv\Scripts\activate
pip install -r requirements.txt
playwright install chromium
```

## 3. รัน

`.env` มากับ zip แล้ว ไม่ต้องขอไฟล์เพิ่ม รันได้เลย:

```bash
python -m ticket_automation.main "https://premanager.ticketmelon.com/organizer/<id>/event/<id>/..."
```

หรือลิงก์จาก dev (`devmanager.ticketmelon.com`) ก็ใช้ได้เหมือนกัน — สคริปต์จะเช็คจากลิงก์เอง
ว่าต้อง login AWS ด้วย account ไหน ไม่ต้องแก้ `.env` มือ

ครั้งแรกที่รันจะเปิดเบราว์เซอร์ขึ้นมาให้ login เอง (ยังไม่มี session cache ในเครื่องนี้) รอบ
ถัดไปจะเร็วขึ้นเพราะจำ session ไว้ให้แล้ว (ไฟล์ `storage_state*.json` /
`aws_console_storage_state*.json` — ไฟล์พวกนี้ไม่ได้แพ็กมาด้วย จะถูกสร้างขึ้นเองในเครื่องของ
เพื่อนตอนรันครั้งแรก มีค่าเทียบเท่ารหัสผ่าน ห้ามส่งต่อไฟล์พวกนี้เช่นกัน)

## ถ้าจะ push ขึ้น git ต่อ

**อย่า push โฟลเดอร์นี้ขึ้น git ทั้งดุ้นแบบที่ได้รับมา** เพราะ `.env` แพ็กมาด้วยจริง (ต่างจาก
ปกติที่ `.gitignore` จะกันไว้ให้) ถ้าจะ init repo ใหม่จากโฟลเดอร์นี้ ให้เช็ค `git status` ก่อน
commit ทุกครั้งว่าไม่มี `.env` หรือไฟล์ `storage_state*.json` โผล่มาในรายการที่จะ commit
