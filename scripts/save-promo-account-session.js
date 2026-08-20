// รันสคริปต์นี้ที่เครื่องตัวเองเท่านั้น — ห้ามรันผ่าน environment แบบอัตโนมัติ/
// headless เพราะมันจะเปิด browser window จริงที่มองเห็นได้ แล้วหยุดรอให้คุณ
// กรอก 2FA เอง เนื่องจากบัญชี TEST_PROMO_EMAIL ติด 2FA จึง login ผ่าน flow
// สคริปต์ email+password ปกติไม่ได้ (ดู tests/helpers/auth.ts)
//
// วิธีใช้:
//   node scripts/save-promo-account-session.js
//
// สิ่งที่จะเกิดขึ้น:
//   1. เปิดหน้าต่าง Chromium ที่มองเห็นได้ ไปที่หน้า sign-in
//   2. กรอก TEST_PROMO_EMAIL / TEST_PROMO_PASSWORD จาก .env ให้อัตโนมัติแล้ว
//      submit
//   3. หยุดรอ (เปิด Playwright Inspector ขึ้นมา) — ให้คุณกรอกขั้นตอน 2FA เอง
//      ในหน้าต่าง browser นั้น แล้วกด "Resume" ใน Inspector
//   4. บันทึก session ที่ login สำเร็จแล้วลง storageState-promo.json ซึ่ง
//      tests/regression/promo-code.spec.ts จะโหลดไปใช้แทนการ login เอง
//
// รันสคริปต์นี้ซ้ำทุกครั้งที่ session ของ storageState-promo.json หมดอายุ
require('dotenv').config();
const { chromium } = require('@playwright/test');

const STORAGE_STATE_PATH = 'storageState-promo.json';

(async () => {
  const email = process.env.TEST_PROMO_EMAIL;
  const password = process.env.TEST_PROMO_PASSWORD;
  if (!email || !password) {
    console.error('TEST_PROMO_EMAIL / TEST_PROMO_PASSWORD are not set in .env.');
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto('https://www.ticketmelon.com/authen/sign-in?redirect_url=');

  const acceptCookies = page.getByRole('button', { name: 'Accept' });
  if (await acceptCookies.isVisible().catch(() => false)) {
    await acceptCookies.click();
  }

  await page.locator('#input-input-username').fill(email);
  await page.locator('#input-input-password').fill(password);
  await page.locator('#btn-submit-login').click();

  console.log('\nกรอกขั้นตอน 2FA ในหน้าต่าง browser ให้เสร็จ แล้วกด "Resume" (▶) ใน Playwright Inspector\n');
  await page.pause();

  await context.storageState({ path: STORAGE_STATE_PATH });
  console.log(`Saved session to ${STORAGE_STATE_PATH}`);

  await browser.close();
})();