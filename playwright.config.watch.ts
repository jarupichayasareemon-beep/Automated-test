import { defineConfig } from '@playwright/test';
import baseConfig from './playwright.config';

// ไว้ดูการรันชุดเทสต์แบบเห็นภาพจริง: ทุก action ของ Playwright จะถูกทำให้ช้าลง
// เพื่อให้ popup/dialog มองเห็นได้จริง แทนที่จะกระพริบเปิดแล้วปิดภายในเสี้ยว
// วินาที เก็บไว้เป็น config แยกต่างหาก (แทนที่จะใส่ใน playwright.config.ts)
// เพื่อให้การรันปกติยังเร็วเต็มสปีดอยู่ — ใช้คู่กับ --headed:
//
//   npx playwright test --headed --config=playwright.config.watch.ts
//
export default defineConfig(baseConfig, {
  timeout: 60_000,
  use: {
    launchOptions: { slowMo: 800 },
  },
});
