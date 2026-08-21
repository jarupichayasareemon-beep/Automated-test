// รันสคริปต์นี้ที่เครื่องตัวเองเท่านั้น เนื่องจากบัญชี TEST_PROMO_EMAIL ติด 2FA
// (Google Authenticator แบบ TOTP) จึง login ผ่าน flow สคริปต์ email+password
// เฉยๆ ไม่ได้ (ดู tests/helpers/auth.ts) — ตอนนี้กรอกโค้ด 2FA ให้อัตโนมัติด้วย
// otplib โดย generate โค้ด 6 หลักจาก secret key เดียวกับที่ตั้งค่าไว้ตอนสแกน QR
// ครั้งแรก (เก็บไว้ที่ TEST_PROMO_TOTP_SECRET ใน .env) ไม่ต้องรอคนกรอกเองอีกต่อไป
//
// วิธีใช้:
//   node scripts/save-promo-account-session.js
//
// สิ่งที่จะเกิดขึ้น:
//   1. เปิดหน้าต่าง Chrome จริงที่มองเห็นได้ ไปที่หน้า sign-in
//   2. กรอก TEST_PROMO_EMAIL / TEST_PROMO_PASSWORD จาก .env ให้อัตโนมัติแล้ว
//      submit
//   3. กรอกโค้ด 2FA 6 หลัก (generate จาก TEST_PROMO_TOTP_SECRET) ให้อัตโนมัติ
//      แล้วกด "Verify Code"
//   4. บันทึก session ที่ login สำเร็จแล้วลง storageState-promo.json ซึ่ง
//      tests/regression/promo-code.spec.ts จะโหลดไปใช้แทนการ login เอง
//
// รันสคริปต์นี้ซ้ำทุกครั้งที่ session ของ storageState-promo.json หมดอายุ
require('dotenv').config();
const { chromium } = require('@playwright/test');
const { generateSync } = require('otplib');

const STORAGE_STATE_PATH = 'storageState-promo.json';

(async () => {
  const email = process.env.TEST_PROMO_EMAIL;
  const password = process.env.TEST_PROMO_PASSWORD;
  const totpSecret = process.env.TEST_PROMO_TOTP_SECRET;
  if (!email || !password) {
    console.error('TEST_PROMO_EMAIL / TEST_PROMO_PASSWORD are not set in .env.');
    process.exit(1);
  }
  if (!totpSecret) {
    console.error('TEST_PROMO_TOTP_SECRET is not set in .env (secret key from the Google Authenticator QR setup).');
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: false, channel: 'chrome' });
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

  await page.locator('#input-two-factor-digit-0').waitFor({ state: 'visible', timeout: 15_000 });

  const code = generateSync({ secret: totpSecret });
  for (let i = 0; i < 6; i++) {
    await page.locator(`#input-two-factor-digit-${i}`).fill(code[i]);
  }
  await page.locator('#btn-two-factor-verify').click();

  await page.waitForURL((url) => !url.pathname.includes('/authen/sign-in'), {
    timeout: 30_000,
    waitUntil: 'domcontentloaded',
  });

  await context.storageState({ path: STORAGE_STATE_PATH });
  console.log(`Saved session to ${STORAGE_STATE_PATH}`);

  await browser.close();
})();