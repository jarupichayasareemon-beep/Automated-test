import { defineConfig, devices } from '@playwright/test';
import 'dotenv/config';

export default defineConfig({
  testDir: './tests',
  // เพิ่มจาก 30 วินาที: env-Pre (BASE_URL) ตอบสนองช้ากว่า dev.ticketmelon.com
  // เห็นได้ชัด และ timeout เดิมตัดจบ login ก่อนที่หน้าเว็บจะโหลดเสร็จด้วยซ้ำ
  timeout: 90_000,
  // เทสต์ในแต่ละไฟล์สลับภาษา UI บน flow เดียวกันที่ใช้ร่วมกัน และต้องพึ่งลำดับ
  // การรันที่แน่นอน (English -> ภาษาอื่นๆ) จึงต้องปิด (false) แทนที่จะรันแบบ
  // fully parallel ข้ามภาษากัน
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    baseURL: process.env.BASE_URL || 'https://dev.ticketmelon.com',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    // ยืนยันจากการทดสอบจริง: env-Pre บล็อก Chromium ที่ Playwright แถมมาเองด้วย
    // CloudFront 403 เสมอ ไม่ว่าจะมี session login ไว้แล้วหรือไม่ก็ตาม — ทั้ง
    // ตอนรันปกติ (`playwright test`) และ UI mode (`--ui`) ใส่ไว้ที่ global use
    // ตรงนี้ (แทนที่จะใส่แยกทีละ project) เพื่อให้ทุกวิธีรัน — ทั้ง CLI, --ui,
    // VS Code extension — ใช้ Chrome จริงเหมือนกันหมด ไม่มีทางหลุดไปใช้
    // Chromium ที่แถมมาได้อีก ต้องมี Google Chrome ติดตั้งอยู่ในเครื่องที่รันเทสต์ด้วย
    channel: 'chrome',
    // แม้ใช้ Chrome จริง (channel:'chrome') แล้ว env-Pre ก็ยังโดน CloudFront
    // 403 อยู่ดีถ้ารันแบบ headless (ค่า default ของ `playwright test` และของ
    // UI mode ถ้าไม่กด "show browser") — ตอนที่ทดสอบผ่านด้วย
    // scripts/save-dev-session.js นั้นสคริปต์เปิดแบบ headless:false เสมอ
    // เพราะงั้น CloudFront ต้องกำลังเช็ค headless fingerprint ด้วย ไม่ใช่แค่
    // ชนิดของ browser binary — บังคับ headed เฉพาะตอนรันในเครื่อง (ปิดใน CI
    // เพราะเครื่อง CI ไม่มีจอให้เปิด headed ได้)
    headless: process.env.CI ? true : false,
  },
  projects: [
    // login ครั้งเดียว (tests/auth.setup.ts) แล้วเขียน storageState.json
    // project chromium จะ depend อันนี้แล้วใช้ session นั้นซ้ำทุกเทสต์ แทนที่
    // จะให้แต่ละเทสต์ login เอง
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'chromium',
      testIgnore: /regression\//,
      use: { ...devices['Desktop Chrome'], storageState: 'storageState.json' },
      dependencies: ['setup'],
    },

    // ชุด regression ของ TestProd (tests/regression/**) — คนละ origin
    // (www.ticketmelon.com ไม่ใช่ dev.ticketmelon.com) กันไม่ให้ project
    // 'chromium' ด้านบนไปยุ่งด้วยผ่าน testIgnore เพื่อให้การรัน
    // tests/regression อย่างเดียวไม่ไปกระตุ้น project 'setup' ของฝั่ง
    // dev-domain โดยไม่จำเป็น ไม่มี project setup/storageState แยกตรงนี้
    // เพราะแต่ละไฟล์ spec เปิด page แค่หน้าเดียวสำหรับทุกอย่างที่มันทำ (ดู
    // buyer-purchase-flow.spec.ts) และ login เป็นขั้นตอนหนึ่งใน flow เดียวกัน
    // นั้นเลย ถ้ามี setup project แยกจะกลายเป็นเปิด browser window ที่สองสำหรับ
    // สิ่งที่จริงๆ แล้วควรเป็น session เดียวต่อเนื่อง
    {
      name: 'testprod',
      testDir: './tests/regression',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
