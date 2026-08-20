import { Page } from '@playwright/test';

/**
 * ล็อกอินที่หน้า sign-in ของ dev-env ก่อนแต่ละเทสต์
 *
 * ยืนยันกับหน้า login จริงที่ https://dev.ticketmelon.com/authen/sign-in?redirect_url=
 * (เช็คเฉพาะ field ของฟอร์ม — ไม่ได้กด submit ล็อกอินจริงตอนสำรวจ เพราะการกรอก
 * credential ลงฟอร์มจริงไม่ใช่สิ่งที่ assistant นี้ทำแทนคุณ selector ของ
 * field/ปุ่มด้านล่างยืนยันจาก DOM ที่ render จริงของหน้านั้น):
 *   - ช่องอีเมล:    id="input-input-username"
 *   - ช่องรหัสผ่าน: id="input-input-password", type="password"
 *   - ปุ่ม submit:  type="submit", id="btn-submit-login"
 *     (accessible name "Sign in" กำกวม — เมนูด้านบนก็มีปุ่ม "Sign in" เหมือนกัน
 *     ซึ่ง getByRole('button', { name: 'Sign in' }) จะ match ทั้งคู่ ทำให้เกิด
 *     strict-mode violation ใช้ id แทนจะไม่กำกวม)
 *
 * ใช้ id แทน placeholder text ("Enter your email" ฯลฯ) เพราะภาษาของหน้า
 * sign-in ไม่ได้การันตีว่าจะเป็นอังกฤษเสมอ — มันจะตามภาษาที่เว็บเลือกไว้ล่าสุด
 * (ดู NOTE เรื่อง LOCALES ใน utils/i18n.ts) ซึ่งสังเกตได้ว่าค่านี้ยังติดมาแม้จะเป็น
 * browser context ใหม่เอี่ยมที่ไม่มี cookie เลยก็ตาม เคยเจอปัญหานี้ตรงๆ ตอน
 * ล็อกอินบัญชีที่สอง: placeholder ขึ้นเป็น "輸入您的電子郵件" แทนที่จะเป็น
 * "Enter your email" ทำให้ getByPlaceholder('Enter your email') หา element
 * ไม่เจอเลย แล้วฟังก์ชันนี้ก็ค้างจน beforeAll hook timeout
 *
 * ค่า default ของ credential มาจาก env var TEST_EMAIL / TEST_PASSWORD (ดู
 * .env.example) — กรอกค่าจริงใน `.env` ของคุณเอง อย่า hardcode ไว้ในนี้หรือ
 * commit ขึ้น git ส่ง `credentials` เข้ามาแทนถ้าจะล็อกอินด้วยบัญชีอื่น (เช่น
 * tests/auth-empty.setup.ts ใช้ TEST_EMPTY_EMAIL / TEST_EMPTY_PASSWORD เพื่อ
 * เข้าบัญชีที่ไม่มีบัตรบันทึกไว้เลย สำหรับเทสต์ empty-state)
 */
export async function login(
  page: Page,
  credentials?: { email: string | undefined; password: string | undefined; envVarNames: [string, string] }
): Promise<void> {
  const email = credentials?.email ?? process.env.TEST_EMAIL;
  const password = credentials?.password ?? process.env.TEST_PASSWORD;
  const [emailVar, passwordVar] = credentials?.envVarNames ?? ['TEST_EMAIL', 'TEST_PASSWORD'];

  if (!email || !password) {
    throw new Error(
      `${emailVar} / ${passwordVar} are not set. Copy .env.example to .env and fill them in ` +
        '(or switch to storageState-based auth — see the comment at the top of README.md ' +
        '"Authentication" section).'
    );
  }

  // ใช้ 'domcontentloaded' แทนค่า default 'load' ของ goto: บน environment ที่
  // ช้า (เช่น BASE_URL ชี้ไปที่ env-Pre) 'load' อาจค้างนานเกินสมควรเพราะ
  // script โฆษณา/analytics ที่หนัก ทั้งที่ฟอร์ม sign-in จริงๆ render และกรอกได้แล้ว
  await page.goto('/authen/sign-in?redirect_url=', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.locator('#input-input-username').fill(email);
  await page.locator('#input-input-password').fill(password);
  await page.locator('#btn-submit-login').click();

  // redirect_url ที่ใช้เข้าหน้านี้ปล่อยว่างไว้ เลยไม่เคยเห็นปลายทางจริงหลังล็อกอิน
  // สำเร็จ จึงรอแค่ให้ออกจากหน้า sign-in แทนที่จะรอ URL เฉพาะเจาะจง — เทสต์จะ
  // ไปที่ /user/payment เองทันทีหลัง login() จบอยู่แล้ว
  //
  // waitUntil ค่า default คือ 'load' ซึ่งบนหน้า landing หลังล็อกอินของเว็บนี้
  // อาจกินเวลาเกิน 15 วินาที (script โฆษณา/analytics หนัก) ทั้งที่ navigate
  // ออกจาก /authen/sign-in ไปแล้วจริงๆ — ทำให้การรอนี้ timeout เป็นบางครั้งทั้งที่
  // ล็อกอินสำเร็จแล้ว 'domcontentloaded' จะ fire ทันทีที่ DOM ของหน้าใหม่พร้อม
  // ซึ่งเพียงพอสำหรับการเช็คนี้แล้ว
  await page.waitForURL((url) => !url.pathname.includes('/authen/sign-in'), {
    timeout: 30_000,
    waitUntil: 'domcontentloaded',
  });

  // ทุก session ใหม่จะขึ้น banner ยินยอมใช้ cookie (ติดอยู่ด้านล่างจอ) จนกว่าจะปิด
  // ถ้าปล่อยไว้ มันจะไปบังคลิกที่ควบคุมใกล้ขอบล่างของหน้าถัดๆ ไปได้ (เช่นปุ่มเมนู
  // ของแถวบัตรที่บันทึกไว้) การปิดมันตรงนี้ทำให้ผู้ที่เรียก login() ไม่ต้องมาจัดการเอง
  // ทุกที่ การกด accept เป็นแอ็กชันที่ทำครั้งเดียวต่อ browser context เลยจะขึ้นแค่
  // ครั้งเดียวต่อการรันเทสต์เท่านั้น
  const acceptCookiesButton = page.locator('#btn-cookie-policy-accept-button');
  if (await acceptCookiesButton.isVisible().catch(() => false)) {
    await acceptCookiesButton.click();
  }
}

/**
 * ล็อกอินที่หน้า sign-in ของ TestProd (www.ticketmelon.com — คนละ origin กับ
 * โดเมน dev-env ของ login() ด้านบน จึงต้องมี cookie/session ของตัวเอง ใช้
 * storageState.json ร่วมกันไม่ได้) ใช้โดย tests/regression/*.spec.ts
 *
 * selector ยืนยันจากการทดสอบจริงที่
 * https://www.ticketmelon.com/authen/sign-in?redirect_url=... — ใช้ id เดียวกับ
 * หน้า sign-in ของ dev (#input-input-username, #input-input-password,
 * #btn-submit-login) บวกกับปุ่มยินยอม cookie "Accept" ที่จะขึ้นเฉพาะตอนเป็น
 * context ใหม่เอี่ยมเท่านั้น
 *
 * TestProd เป็น environment ที่ตัดเงินจริง: TEST_EMAIL/TEST_PASSWORD จะล็อกอิน
 * เข้าบัญชีที่สั่งซื้อของจริงได้ (ดู helpers/testprod-tickets.ts)
 */
export async function loginTestProd(page: Page): Promise<void> {
  const email = process.env.TEST_EMAIL;
  const password = process.env.TEST_PASSWORD;

  if (!email || !password) {
    throw new Error(
      'TEST_EMAIL / TEST_PASSWORD are not set. Copy .env.example to .env and fill them in.'
    );
  }

  await page.goto('https://www.ticketmelon.com/authen/sign-in?redirect_url=');

  const acceptCookies = page.getByRole('button', { name: 'Accept' });
  if (await acceptCookies.isVisible().catch(() => false)) {
    await acceptCookies.click();
  }

  await page.locator('#input-input-username').fill(email);
  await page.locator('#input-input-password').fill(password);
  await page.locator('#btn-submit-login').click();

  await page.waitForURL((url) => !url.pathname.includes('/authen/sign-in'), {
    timeout: 30_000,
    waitUntil: 'domcontentloaded',
  });
}
