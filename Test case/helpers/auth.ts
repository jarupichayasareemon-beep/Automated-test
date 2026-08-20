import { Page } from '@playwright/test';
import { generateSync } from 'otplib';

type Credentials = {
  email: string | undefined;
  password: string | undefined;
  envVarNames: [string, string];
  totpSecret?: string;
};

function resolveCredentials(credentials?: Credentials) {
  const email = credentials?.email ?? process.env.TEST_EMAIL;
  const password = credentials?.password ?? process.env.TEST_PASSWORD;
  const [emailVar, passwordVar] = credentials?.envVarNames ?? ['TEST_EMAIL', 'TEST_PASSWORD'];
  const totpSecret = credentials?.totpSecret;

  if (!email || !password) {
    throw new Error(
      `${emailVar} / ${passwordVar} are not set. Copy .env.example to .env and fill them in ` +
        `(or switch to storageState-based auth — see the comment at the top of README.md ` +
        `"Authentication" section).`
    );
  }

  return { email, password, emailVar, totpSecret };
}

// บัญชีที่ติด TOTP 2FA จะเด้ง modal ขึ้นมาทับหน้าเดิม (ไม่เปลี่ยน URL เลย —
// ยืนยันจากการตรวจ DOM จริง) เช็คก่อน waitForURL เสมอ เพราะถ้าปล่อยผ่านไปเฉยๆ
// waitForURL จะรอ URL เปลี่ยนซึ่งไม่มีวันเกิดขึ้นจน timeout ใช้ร่วมกันทั้งฝั่ง
// dev-env และ TestProd เพราะหน้า 2FA เหมือนกันทั้งสอง origin
async function handleTwoFactorIfPresent(
  page: Page,
  fnName: string,
  emailVar: string,
  totpSecret: string | undefined
): Promise<void> {
  const otpFirstDigit = page.locator('#input-two-factor-digit-0');
  const needsTotp = await otpFirstDigit
    .waitFor({ state: 'visible', timeout: 10_000 })
    .then(() => true)
    .catch(() => false);

  if (!needsTotp) return;

  if (!totpSecret) {
    throw new Error(
      `บัญชี ${emailVar} ติด 2FA (TOTP) แต่ ${fnName} ไม่ได้รับ credentials.totpSecret มาด้วย — ` +
        'ใส่ secret key ของบัญชีนี้ลง .env แล้วส่งเข้ามาทาง credentials.totpSecret'
    );
  }
  const code = generateSync({ secret: totpSecret });
  for (let i = 0; i < 6; i++) {
    await page.locator(`#input-two-factor-digit-${i}`).fill(code[i]);
  }
  await page.locator('#btn-two-factor-verify').click();
}

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
 * tests/localize-saved-card.spec.ts ใช้ TEST_EMPTY_EMAIL / TEST_EMPTY_PASSWORD
 * เพื่อเข้าบัญชีที่ไม่มีบัตรบันทึกไว้เลย สำหรับเทสต์ empty-state — บัญชีนี้ติด
 * TOTP 2FA เหมือนกับ TEST_PROMO_EMAIL ของฝั่ง regression เพราะเป็นบัญชีเดียวกัน
 * เลยส่ง totpSecret มาด้วยเพื่อกรอกโค้ด 2FA อัตโนมัติ ไม่งั้น login จะค้างรอ
 * modal 2FA จน waitForURL ด้านล่าง timeout)
 */
export async function login(page: Page, credentials?: Credentials): Promise<void> {
  const { email, password, emailVar, totpSecret } = resolveCredentials(credentials);

  // ใช้ 'domcontentloaded' แทนค่า default 'load' ของ goto: บน environment ที่
  // ช้า (เช่น BASE_URL ชี้ไปที่ env-Pre) 'load' อาจค้างนานเกินสมควรเพราะ
  // script โฆษณา/analytics ที่หนัก ทั้งที่ฟอร์ม sign-in จริงๆ render และกรอกได้แล้ว
  await page.goto('/authen/sign-in?redirect_url=', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.locator('#input-input-username').fill(email);
  await page.locator('#input-input-password').fill(password);
  await page.locator('#btn-submit-login').click();

  await handleTwoFactorIfPresent(page, 'login()', emailVar, totpSecret);

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
export async function loginTestProd(page: Page, credentials?: Credentials): Promise<void> {
  const { email, password, emailVar, totpSecret } = resolveCredentials(credentials);

  await page.goto('https://www.ticketmelon.com/authen/sign-in?redirect_url=');

  const acceptCookies = page.getByRole('button', { name: 'Accept' });
  if (await acceptCookies.isVisible().catch(() => false)) {
    await acceptCookies.click();
  }

  await page.locator('#input-input-username').fill(email);
  await page.locator('#input-input-password').fill(password);
  await page.locator('#btn-submit-login').click();

  await handleTwoFactorIfPresent(page, 'loginTestProd()', emailVar, totpSecret);

  await page.waitForURL((url) => !url.pathname.includes('/authen/sign-in'), {
    timeout: 30_000,
    waitUntil: 'domcontentloaded',
  });
}
