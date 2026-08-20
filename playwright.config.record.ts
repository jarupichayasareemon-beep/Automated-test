import { defineConfig, devices } from '@playwright/test';
import 'dotenv/config';

// ไว้สร้างวิดีโอของทุกเทสต์ (ผ่านหรือไม่ผ่านก็ตาม) เพื่อแนบเป็นหลักฐานขึ้น Jira —
// config หลักเก็บวิดีโอไว้แค่ตอน fail เท่านั้น (video: 'retain-on-failure')
// เพื่อไม่ให้ artifact กองพะเนินทุกครั้งที่รันปกติ
//
// เขียนเป็น config แยกต่างหาก (แทนที่จะ merge กับ playwright.config.ts ผ่าน
// defineConfig(base, overrides)) เพราะการ merge แบบนั้นดันไม่ push
// `use.video` ระดับบนสุดลงไปที่ `use` ของ project "chromium" เอง (ที่ตั้งค่า
// storageState ไว้แล้ว) อย่างสม่ำเสมอ — วิดีโอเลยปิดอยู่ตลอดสำหรับเทสต์จริงทุก
// ตัว โผล่มาแค่ตอน "setup" รันรอบเดียวแล้วก็หายไปอีกในรอบถัดไป ไม่คุ้มจะไล่หา
// สาเหตุต่อ ก๊อปปี้ setting ไม่กี่ตัวมาไว้ตรงนี้เองน่าเชื่อถือกว่า
// slowMo ทำให้ทุก action ของ Playwright (คลิก ฯลฯ) ใช้เวลานานขึ้น ทำให้ popup
// ที่ปกติเปิดแล้วปิดภายในเสี้ยววินาที — เร็วเกินจะดูทันตอนดูสด และมองแทบไม่เห็น
// ในวิดีโอความเร็วปกติเหมือนกัน — ขึ้นมาให้เห็นบนจอสักครู่ในวิดีโอที่อัดไว้จริงๆ
const SLOW_MO_MS = 800;

export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  preserveOutput: 'always',
  reporter: [['json', { outputFile: 'recordings/results.json' }], ['list']],
  use: {
    baseURL: process.env.BASE_URL || 'https://dev.ticketmelon.com',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'on',
    launchOptions: { slowMo: SLOW_MO_MS },
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'storageState.json',
        video: 'on',
        launchOptions: { slowMo: SLOW_MO_MS },
      },
      dependencies: ['setup'],
    },
  ],
});
