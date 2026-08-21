// รันสคริปต์นี้ที่เครื่องตัวเองเท่านั้น (ต้องมีจอจริง)
//
// ใช้แก้ปัญหา CloudFront บล็อก (403) ตอน auth.setup.ts พยายาม login อัตโนมัติบน
// env-Pre — สคริปต์นี้สั่งให้ Playwright เปิด "Google Chrome" ตัวจริงที่ติดตั้งใน
// เครื่อง (channel: 'chrome') แทน Chromium ที่ Playwright แถมมาเอง เผื่อ
// CloudFront บล็อกตามลายนิ้วมือของ browser ไม่ใช่แค่ IP — ถ้าเปิดแล้วยังเจอ
// 403 อยู่เหมือนเดิม แปลว่าเป็นการบล็อกที่ IP/network จริงๆ ต้องแก้ผ่าน VPN/IP
// allowlist แทน (ดูสคริปต์นี้ไม่ช่วยแล้ว)
//
// วิธีใช้:
//   node scripts/save-dev-session.js
//
// สิ่งที่จะเกิดขึ้น:
//   1. เปิดหน้าต่าง Chrome จริงที่มองเห็นได้ ไปที่หน้า sign-in ของ BASE_URL
//   2. ถ้าโหลดผ่าน (ไม่เจอ 403) จะกรอก TEST_EMAIL / TEST_PASSWORD จาก .env
//      ให้อัตโนมัติ แล้ว submit
//   3. หยุดรอ (เปิด Playwright Inspector ขึ้นมา) — เช็คว่า login ผ่านจริงไหม
//      (หรือกรอก 2FA/challenge อื่นๆ ถ้ามี) แล้วกด "Resume" ใน Inspector
//   4. บันทึก session ลง storageState.json ซึ่ง project 'chromium' ใช้อยู่แล้ว
//
// รันสคริปต์นี้ซ้ำทุกครั้งที่ session หมดอายุ
require('dotenv').config();
const { chromium } = require('@playwright/test');

const STORAGE_STATE_PATH = 'storageState.json';

(async () => {
  const email = process.env.TEST_EMAIL;
  const password = process.env.TEST_PASSWORD;
  if (!email || !password) {
    console.error('TEST_EMAIL / TEST_PASSWORD are not set in .env.');
    process.exit(1);
  }

  const baseURL = process.env.BASE_URL || 'https://dev.ticketmelon.com';

  let browser;
  try {
    browser = await chromium.launch({ headless: false, channel: 'chrome' });
  } catch (err) {
    console.error(
      '\nเปิด Google Chrome ตัวจริงไม่ได้ — เช็คว่าติดตั้ง Chrome ไว้ในเครื่องแล้วหรือยัง\n'
    );
    throw err;
  }

  const context = await browser.newContext();
  const page = await context.newPage();

  console.log(`\nกำลังเปิด ${baseURL}/authen/sign-in?redirect_url= ด้วย Chrome จริง...\n`);
  const response = await page.goto(`${baseURL}/authen/sign-in?redirect_url=`, { waitUntil: 'domcontentloaded' });

  if (response && response.status() === 403) {
    console.error(
      '\nยังเจอ 403 อยู่แม้จะใช้ Chrome จริงแล้ว — ไม่ใช่ปัญหาลายนิ้วมือ browser ' +
        'แต่เป็นการบล็อกที่ IP/network จริงๆ ต้องแก้ผ่าน VPN หรือขอเพิ่ม IP เข้า allowlist แทน\n'
    );
    await browser.close();
    process.exit(1);
  }

  const acceptCookies = page.getByRole('button', { name: 'Accept' });
  if (await acceptCookies.isVisible().catch(() => false)) {
    await acceptCookies.click();
  }

  const usernameField = page.locator('#input-input-username');
  if (await usernameField.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await usernameField.fill(email);
    await page.locator('#input-input-password').fill(password);
    await page.locator('#btn-submit-login').click();
  }

  console.log('\nเช็คว่า login ผ่านหรือยัง (หรือกรอก 2FA/challenge อื่นๆ ถ้ามี) แล้วกด "Resume" (▶) ใน Playwright Inspector\n');
  await page.pause();

  await context.storageState({ path: STORAGE_STATE_PATH });
  console.log(`Saved session to ${STORAGE_STATE_PATH}`);

  await browser.close();
})();
