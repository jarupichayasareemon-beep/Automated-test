import { Browser, BrowserContext, Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const RECORDINGS_DIR = path.join(__dirname, '../../recordings');

/**
 * สร้าง page ที่ใช้ร่วมกันสำหรับทุก sub-test ของแต่ละ locale ในไฟล์ spec นั้นๆ
 * (ดูคอมเมนต์ .describe.serial ใน tests/localize-saved-card.spec.ts ว่าทำไม
 * ถึงใช้ page เดียวต่อไฟล์ แทนค่า default ที่เป็น page ต่อเทสต์)
 *
 * page นั้นสร้างผ่าน browser.newPage()/newContext() ตรงๆ ซึ่งข้าม fixture
 * `page` ไป — ส่วนระบบอัดวิดีโออัตโนมัติของ Playwright (option `video` ใน
 * playwright.config.ts) จะครอบเฉพาะ context ที่สร้างผ่าน fixture นั้นเท่านั้น
 * context ที่สร้างเองต้องส่ง `recordVideo` ตอน *สร้าง* แทน (เปิดอัดวิดีโอทีหลัง
 * ไม่ได้) ซึ่งฟังก์ชันนี้จะทำให้ตอนตั้งค่า RECORD_VIDEO ไว้ (ดู
 * playwright.config.record.ts / `npm run test:record`) — ถ้าไม่ตั้งก็จะได้
 * page ธรรมดาไม่มีวิดีโอเหมือนเดิม ไม่กระทบการรันปกติ
 */
export async function createSharedPage(
  browser: Browser,
  options: { storageState?: string } = {}
): Promise<{ page: Page; context: BrowserContext | null }> {
  if (!process.env.RECORD_VIDEO) {
    const page = await browser.newPage(options);
    return { page, context: null };
  }

  fs.mkdirSync(RECORDINGS_DIR, { recursive: true });
  const context = await browser.newContext({
    ...options,
    recordVideo: { dir: RECORDINGS_DIR },
  });
  const page = await context.newPage();
  return { page, context };
}

/**
 * คู่กันกับ createSharedPage() — ปิด page/context และถ้ามีการอัดวิดีโออยู่
 * จะเปลี่ยนชื่อไฟล์ที่ Playwright ตั้งให้อัตโนมัติ (เป็น id สุ่ม) ให้อ่านง่ายขึ้น
 * แล้วย้ายไปไว้ที่ recordings/
 */
export async function closeSharedPage(page: Page, context: BrowserContext | null, name: string): Promise<void> {
  if (!context) {
    await page.close();
    return;
  }

  const video = page.video();
  await context.close(); // finalizes the video file on disk
  if (!video) return;

  const originalPath = await video.path();
  const dest = path.join(RECORDINGS_DIR, `${name}.webm`);
  fs.renameSync(originalPath, dest);
}
