import { test, expect, Page } from '@playwright/test';
import { loginTestProd } from '../helpers/auth';
import {
  gotoEventPage,
  TICKETS,
  ticketCard,
  ticketQuantity,
  increaseQuantity,
  decreaseQuantity,
} from '../helpers/testprod-tickets';
import { paymentChannelBox, isHighlighted, fillShippingAddress } from '../helpers/testprod-order';
import { ADDONS, addonQuantity, increaseAddonQuantity, decreaseAddonQuantity } from '../helpers/testprod-addons';

// เส้นทางการซื้อของผู้ซื้อแบบต่อเนื่องเส้นเดียวบนอีเว้นที่ใช้ regression ("Normal +
// Promo + Addon + Regisform + Donation + Shipping" ของ organizer qamtel)
// ครอบคลุม test case จาก CSV ตามลำดับที่ผู้ซื้อจริงจะเจอ บน page/session
// เดียวกันที่ใช้ร่วมกันทั้งไฟล์ — แทนที่จะให้แต่ละเคส login/navigate ใหม่ (หรือ
// เปิด browser window ใหม่) แยกกัน TC_018 รันเป็นตัวแรกสุด ก่อน login แล้วค่อยมี
// ขั้นตอน login จากนั้น flow ที่เหลือจะทำงานต่อแบบ login ค้างไว้บน page เดียวกัน
//
// ที่มา: "[Product] Test Cases for Regression automated - Normal_ All
// Condition.csv" ครอบคลุม: TC_001-003, 005, 016-018, 021-022, 027, 044-051
//
// สำคัญ — ทุกครั้งที่รันไฟล์นี้จะสร้าง order จริงและกด Pay Now: มีการตัดเงินจริง
// ประมาณ 1 THB บนบัตรใน .env (TEST_CARD_NUMBER ฯลฯ) ผ่าน 2C2P gateway จริงของ
// อีเว้นนี้ เป็นการตัดสินใจตั้งใจเหมือนกับอีเว้นก่อนหน้า คือทำเป็น flow ต่อเนื่อง
// เดียวแทนที่จะแยกไฟล์ที่ต้อง gate ไว้ต่างหาก
//
// อีเว้นนี้มาแทนอีเว้น regression ตัวเก่าที่ง่ายกว่า ("Copy - Normal 100" บน
// TestProd) — ยืนยันจากการทดสอบจริงว่าโครงสร้างต่างกันจริง ไม่ใช่แค่ URL ต่างกัน:
// มีขั้นตอน Add-on เพิ่มมาระหว่าง Buy กับ Registration Form, คำถามใน
// Registration Form เป็น dropdown แทนที่จะเป็นข้อความอิสระ และหน้า checkout
// ต้องกรอกที่อยู่จัดส่งเต็มรูปแบบแทนที่จะเลือก radio ตัวเดียว ดูลิสต์ "Not here"
// ด้านล่างว่าอะไรพังหรือยังไม่ได้ยืนยันบ้างจากการเปลี่ยนแปลงนี้
//
// ยังไม่มีในไฟล์นี้:
// - TC_004 (จำนวนสูงสุด) / TC_006/TC_007 (Sale Ended / Sold Out) — ติดปัญหา:
//   ticket type ทั้ง 2 แบบของอีเว้นนี้ (Ticket A, Ticket B) เป็นแบบปกติ/ซื้อได้
//   ทั้งคู่ ไม่มี fixture ที่จำกัด stock หรือตั้งสถานะพิเศษให้ทดสอบ
// - TC_008, TC_010-012, TC_014-015 (โปรโมโค้ด) — ย้ายไปอยู่ที่
//   promo-code.spec.ts แล้ว: ใช้ได้เฉพาะกับอีกบัญชีหนึ่ง (TEST_PROMO_EMAIL)
//   ที่ไม่ใช่บัญชีที่ flow นี้ login ไว้ เลยใช้ session ร่วมกับไฟล์นี้ไม่ได้
//   TC_009 (โค้ดผิด) และ TC_013 (จำกัดจำนวนใช้ต่อออเดอร์) ยังไม่ถูกทดสอบที่ไหน
//   เลย — ดูเหตุผลที่หัวไฟล์นั้น
// - TC_019 (event page idle timeout) — ยังไม่รู้ค่า timeout จริง
// - TC_020 (Add-on session timeout) — ยังไม่รู้ค่า timeout จริง ปัญหาเดียวกับ
//   TC_019
// - TC_023/026 (จำนวนสูงสุดของ Add-on) — เหมือน TC_004 ต้องรู้ค่า
//   stock/purchase cap ที่ยืนยันแล้วก่อน: ลองกด '+' เพิ่ม Tote Bag ติดกัน 5
//   ครั้งขณะถือตั๋วแค่ 2 ใบ ปุ่ม '+' ก็ยังไม่ disable เลย แปลว่า limit จริงสูงกว่านั้น
//   และไม่คุ้มจะไปหาแบบมั่วๆ
// - TC_024/025 ("one_ticket_one_item" — 1 add-on ต่อ 1 ตั๋วที่ซื้อ) — ดูเหมือนจะ
//   ไม่มีผลกับการตั้งค่า Add-on ของอีเว้นนี้: ซื้อตั๋ว 2 ใบแล้วยังเพิ่ม add-on
//   ตัวเดียวเป็น 4+ ได้โดยไม่มีการห้าม ทั้งที่ scenario ของ CSV คาดว่าจะถูกจำกัด
//   ไว้เท่าจำนวนตั๋ว ควรเช็คกับคนตั้งค่ากฎ Add-on ของอีเว้นนี้ก่อนจะสรุปว่าแค่ยัง
//   ไม่ได้ตั้งค่า (ไม่ใช่บั๊ก)
// - TC_028 (Add-on ผูกกับ ticket type แรกในออเดอร์ที่มีหลาย ticket type) —
//   ยังไม่ได้ลอง flow นี้ซื้อ ticket type เดียวตลอด
// - TC_029/030 (แก้ไขการเลือก Add-on ก่อน/หลัง checkout) — ยังไม่ได้สำรวจ
// - TC_032-043 (Registration Form) นอกเหนือจากการกรอก dropdown คำถามเดียวที่มี
//   ใน flow นี้แล้ว — เช่น ฟอร์มระดับ Order vs Ticket, ฟอร์มหลายตั๋ว — ยังไม่ได้
//   สำรวจ
// - TC_052-055 (การกรอก OTP / ผลการจ่ายเงิน) — อยู่นอก scope: OTP จริงมาทาง SMS
//   จริง ซึ่งสคริปต์ไม่มีทางอ่านได้ flow นี้ตั้งใจหยุดที่หน้า OTP (TC_051)
//   โดยไม่กรอกหรือ submit อะไรต่อ
test.describe.serial('Buyer purchase flow — Normal event', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await gotoEventPage(page);
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('TC_018: buying without logging in redirects to Sign In', async () => {
    await increaseQuantity(page, TICKETS.ticketB.id, 1);
    await page.locator('#checkbox-event-agree-share-info').click();
    await page.locator('#btn-btn-buy-ticket').click();

    await page.waitForURL(/\/authen\/sign-in/, { timeout: 10_000 });
    expect(page.url()).toContain('/authen/sign-in');
  });

  test('logs in and returns to the event page', async () => {
    await loginTestProd(page);
    await gotoEventPage(page);
  });

  test('TC_001: event details are displayed correctly', async () => {
    await expect(page.locator('#text-event-name').first()).toHaveText(
      'Normal + Promo + Addon + Regisform + Donation + Shipping'
    );
    await expect(page.locator('#text-event-time-show-0').first()).toBeVisible();
    await expect(page.locator('#event-location-name').first()).toHaveText('Bangkok');
    await expect(page.locator('#event-age-show').first()).toHaveText('No age restriction');

    const shareButton = page.locator('#event-share-btn').first();
    await expect(shareButton).toBeVisible();
    await expect(shareButton).toBeEnabled();
  });

  test('TC_002: clicking Gets Ticket scrolls to the ticket list', async () => {
    await page.locator('#btn-event-detail-get-ticket-btn').first().click();
    await expect(ticketCard(page, TICKETS.ticketA.id)).toBeVisible();
    await expect(ticketCard(page, TICKETS.ticketB.id)).toBeVisible();
  });

  test.fixme(
    "TC_004: quantity cannot be increased past the ticket type's stock limit",
    async () => {
      // ต้องรู้ค่า stock cap ที่ยืนยันแล้วของ ticket type สักตัวก่อน ถึงจะเขียน
      // เทสต์นี้ได้โดยไม่เสี่ยงเจอ loop กด click ไม่รู้จบ
    }
  );

  test.skip('TC_006: a Sale Ended ticket shows its status and no quantity controls', async () => {
    // ติดปัญหา: อีเว้นนี้ไม่มี ticket type สถานะ Sale Ended เลย
  });

  test.skip('TC_007: a Sold Out ticket shows its status and cannot be added', async () => {
    // ติดปัญหา: อีเว้นนี้ไม่มี ticket type สถานะ Sold-Out เลย
  });

  test('TC_003: increasing ticket quantity updates the quantity shown', async () => {
    await increaseQuantity(page, TICKETS.ticketB.id, 2);
    await expect(ticketQuantity(page, TICKETS.ticketB.id)).toHaveText('2');
  });

  test('TC_005: decreasing ticket quantity updates the quantity shown', async () => {
    await decreaseQuantity(page, TICKETS.ticketB.id, 1);
    await expect(ticketQuantity(page, TICKETS.ticketB.id)).toHaveText('1');
  });

  test('TC_017: Buy button cannot be clicked without consent', async () => {
    await expect(page.locator('#btn-btn-buy-ticket')).toBeDisabled();
  });

  test('TC_016: checking consent enables the Buy button', async () => {
    await page.locator('#checkbox-event-agree-share-info').click();
    await expect(page.locator('#btn-btn-buy-ticket')).toBeEnabled();
  });

  test('buys the ticket and reaches the Add-on step', async () => {
    await page.locator('#btn-btn-buy-ticket').click();
    // waitUntil ค่า default คือ 'load' ซึ่งจะค้างนานเกินจริงหลัง navigate สำเร็จ
    // แล้ว เพราะ script analytics ที่หนักของเว็บนี้ (ปัญหาเดียวกับที่ระบุไว้ใน
    // login() ของ helpers/auth.ts) — ยืนยันจากการทดสอบจริงว่า navigate สำเร็จ
    // แล้วจริงๆ และ 'domcontentloaded' fire ไปแล้วด้วย ในขณะที่โค้ดตรงนี้ยังรอ
    // 'load' อยู่แล้วก็ timeout ไปเฉยๆ
    await page.waitForURL(/\/order\/.+\/add-on/, { timeout: 15_000, waitUntil: 'domcontentloaded' });
    // ช่องว่างของ SPA-hydration แบบเดียวกับ gotoEventPage() ใน testprod-tickets.ts:
    // 'domcontentloaded' fire ก่อนแถว Add-on จะ render จริง แค่รอ #add-on-title
    // อย่างเดียวไม่พอ — ยืนยันจากการทดสอบจริงว่ามันเป็นแค่ markup หัวข้อ static
    // ที่ render มาก่อนข้อมูล add-on จริง ทำให้การค้นหาของ addonQuantity() ใน
    // เทสต์ถัดไปยังเจอ 0 รายการอยู่ #add-on-name-0 คือแถวข้อมูลจริงแถวแรก
    await page.locator('#add-on-name-0').first().waitFor({ state: 'visible', timeout: 15_000 });
  });

  test('TC_021: increasing an Add-on quantity updates the quantity shown', async () => {
    await increaseAddonQuantity(page, ADDONS.toteBag.id, 2);
    await expect(await addonQuantity(page, ADDONS.toteBag.id)).toHaveText('2');
  });

  test('TC_022: decreasing an Add-on quantity updates the quantity shown', async () => {
    await decreaseAddonQuantity(page, ADDONS.toteBag.id, 1);
    await expect(await addonQuantity(page, ADDONS.toteBag.id)).toHaveText('1');
  });

  test('TC_027: clicking Continue proceeds to the Registration Form', async () => {
    await page.locator('#btn-add-on-continue-button').click();
    await page.waitForURL(/\/order\/.+\/attendee/, { timeout: 15_000, waitUntil: 'domcontentloaded' });
  });

  test('Registration Form: fill required fields and continue to Payment', async () => {
    // ยืนยันจากการทดสอบจริง ตรงกับที่ CSV เขียนไว้ใน TC_041 ("Add-on tickets
    // are also counted as one ticket"): add-on ที่ซื้อใน TC_021 จะมีแผง
    // registration เป็นของตัวเอง "Ticket No. 2" แยกจาก "Ticket No. 1" ของตั๋ว
    // จริง — ซึ่งไม่ได้ pre-fill จากบัญชีเหมือน Ticket No. 1 และมี dropdown
    // Nationality ของตัวเองด้วย โค้ดนี้เลยกรอกทุกช่อง First/Last Name และทุก
    // dropdown Nationality ที่อยู่บนหน้าตอนนั้น ไม่ใช่แค่กรอกอย่างละครั้งเดียว
    // เพราะจำนวนจะแปรผันตามจำนวนตั๋ว+add-on ที่ซื้อ
    //
    // แผง "Ticket No. 2" (ของ add-on) render แบบ asynchronous หลัง "Ticket
    // No. 1" — ยืนยันจากการทดสอบจริง: ถ้าไม่รอตรงนี้ก่อน loop กรอกด้านล่างจะรัน
    // ก่อนที่แผงนี้จะมีอยู่จริง แล้วพอกด Continue ก็จะติด validation error ของ
    // ช่องที่ยังว่างอยู่ flow นี้ซื้อตั๋ว 1 ใบ + จบด้วย add-on 1 ชิ้นเสมอ (ดู
    // TC_021/TC_022) ดังนั้นควรมีแผงพอดี 2 แผง
    await page.getByText('Ticket No. 2', { exact: true }).first().waitFor({ state: 'visible', timeout: 15_000 });

    const nameFields = page.getByPlaceholder('Your Answer');
    for (let i = 0; i < (await nameFields.count()); i++) {
      const field = nameFields.nth(i);
      if ((await field.inputValue()) === '') {
        await field.fill('Test');
      }
    }

    const nationalityDropdowns = page.getByPlaceholder('Nationality');
    for (let i = 0; i < (await nationalityDropdowns.count()); i++) {
      const dropdown = nationalityDropdowns.nth(i);
      if ((await dropdown.inputValue()) === '') {
        await dropdown.click();
        await page.getByRole('option').first().click();
      }
    }

    await page.getByRole('button', { name: 'Continue' }).click();
    await page.waitForURL(/\/order\/.+\/checkout/, { timeout: 15_000, waitUntil: 'domcontentloaded' });
  });

  // --- หน้า Payment: ทุกอย่างด้านล่างนี้เช็คแค่ UI ของหน้าเท่านั้น ไม่มีการกด
  // Pay Now เลย เงินจึงไม่ถูกตัดเลย — flow นี้หยุดอยู่แค่นี้ไปก่อน (ดู
  // หมายเหตุเรื่องที่อยู่จัดส่ง/กรอกบัตรที่หัวไฟล์)

  test('TC_045: no donation entered — no donation line in Order Summary', async () => {
    // ต้องรันก่อน TC_044 ที่จะเพิ่ม donation เข้าไป ไม่งั้นบรรทัดนั้นจะยังค้าง
    // อยู่ตอนเช็คตรงนี้ (เป็น order/page เดียวกันที่ทำงานต่อเนื่องกัน)
    const orderSummary = page.locator('text=Order Summary').locator('xpath=ancestor::div[3]');
    await expect(orderSummary.getByText('Donation (TAX incl.)')).toHaveCount(0);
  });

  test('TC_044: entering a donation amount adds it to Order Summary', async () => {
    const donationInput = page.locator('#input-input-donation');
    // .fill() ไม่ค่อย trigger การอัปเดต state ของ React ในช่องนี้ให้แน่นอน —
    // ยืนยันจากการทดสอบจริง: Order Summary ยังขึ้น "THB 0.00" อยู่หลังใช้
    // .fill() ต้องใช้ pressSequentially() + blur ถึงจะได้ผล
    await donationInput.click();
    await donationInput.pressSequentially('10');
    await page.keyboard.press('Tab');

    const orderSummary = page.locator('text=Order Summary').locator('xpath=ancestor::div[3]');
    await expect(orderSummary.getByText('Donation (TAX incl.)')).toBeVisible();
    await expect(orderSummary.getByText('THB 10.00')).toBeVisible();
  });

  test('TC_046: contact email required-field validation', async () => {
    const emailInput = page.locator('#input-input-contact-email');
    await expect(emailInput).not.toHaveValue('');

    await emailInput.fill('');
    await emailInput.blur();
    await expect(page.getByText('This field is required.')).toBeVisible();

    await emailInput.fill('buyer@example.com');
    await expect(emailInput).toHaveValue('buyer@example.com');
  });

  test('TC_047: Credit/Debit is the default payment method', async () => {
    // ต้องรันก่อน TC_050 ซึ่งจะสลับ channel ที่ active ออกจาก Credit/Debit
    await expect(isHighlighted(paymentChannelBox(page, 'Credit/Debit'))).resolves.toBe(true);
  });

  test('TC_050: selecting a payment channel highlights it and clears the previous one', async () => {
    const creditDebit = paymentChannelBox(page, 'Credit/Debit');
    const promptPay = paymentChannelBox(page, 'PromptPay');

    await page.locator('[id="payment-channel-PromptPay"]').click();

    await expect(isHighlighted(promptPay)).resolves.toBe(true);
    await expect(isHighlighted(creditDebit)).resolves.toBe(false);
  });

  test('TC_048: selecting Refundable Ticket highlights it', async () => {
    const refundable = page.locator('#refund-protect-radio-yes-box');
    await refundable.click();
    await expect(isHighlighted(refundable)).resolves.toBe(true);
  });

  test('TC_049: selecting Non-Refundable Ticket highlights it', async () => {
    const nonRefundable = page.locator('#refund-protect-radio-no-box');
    await nonRefundable.click();
    await expect(isHighlighted(nonRefundable)).resolves.toBe(true);
  });

  test('fills the required Shipping Method address', async () => {
    await fillShippingAddress(page);
    await expect(page.locator('#input-shipping-name-input')).toHaveValue('Test Buyer');
    await expect(page.locator('#autocomplete-zipcode')).not.toHaveValue('');
  });

  test('selects Credit/Debit and adds the test card', async () => {
    // เลือก Credit/Debit ซ้ำอีกครั้ง เผื่อ TC_050 ด้านบนทิ้ง channel อื่นไว้เป็น
    // active — สเต็ปนี้ต้องถูกต้องเสมอไม่ว่าก่อนหน้าจะรันอะไรมา
    await page.locator('[id="payment-channel-Credit/Debit"]').click();

    await page.locator('#add-a-new-card').click();
    await page.locator('#input-new-card-number').fill(process.env.TEST_CARD_NUMBER!);
    await page.locator('#input-new-card-name').fill(process.env.TEST_CARD_NAME!);
    await page.locator('#input-new-card-expire').fill(process.env.TEST_CARD_EXPIRY!);
    await page.locator('#input-new-card-cvv').fill(process.env.TEST_CARD_CVV!);

    await page.locator('#checkbox-agree').click();
    await expect(page.getByRole('button', { name: 'Pay Now' })).toBeEnabled();
  });

  test('TC_051: clicking Pay Now reaches the OTP confirmation page', async () => {
    // ตรงนี้ตัดเงินจริง: มีการ hold วงเงินจริงประมาณ 1 THB บนบัตรตรงนี้ —
    // หยุด — ห้ามกรอกหรือ submit ช่อง OTP ดูหมายเหตุที่หัวไฟล์ว่าทำไม
    // TC_052-055 ถึงยังไม่ได้ทำ
    await page.getByRole('button', { name: 'Pay Now' }).click();
    await page.waitForURL(/2c2p\.com/, { timeout: 20_000 });
    // ยืนยันจากการทดสอบจริง: chain การ redirect นี้ไม่ได้ไปที่หน้า OTP ตรงๆ
    // เสมอไป — บางทีจะเด้งผ่าน 3DS ACS ของธนาคาร (เช่น
    // acs2.3ds2.entersekt.eu) ก่อนจะวกกลับมาที่หน้า OTP ของ 2c2p เอง
    // assertion timeout ค่า default 5 วินาทีไม่พอรอให้ผ่านช่วงนั้นไป ทำให้
    // fail กลางทาง redirect ทั้งที่หน้า OTP จะขึ้นมาแน่ๆ ไม่นานหลังจากนั้น
    // "OTP" ปรากฏมากกว่าหนึ่งที่บนหน้านี้ (label + ลิงก์ขอรหัสใหม่) — .first()
    // ช่วยเลี่ยง strict-mode violation
    await expect(page.getByText('OTP').first()).toBeVisible({ timeout: 20_000 });
  });
});
