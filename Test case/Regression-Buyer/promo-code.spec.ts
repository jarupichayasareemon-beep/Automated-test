import { test, expect, Page } from '@playwright/test';
import { gotoEventPage, TICKETS, increaseQuantity, ticketQuantity, firstVisible } from '../helpers/testprod-tickets';
import { applyPromoCode, clearPromoCode } from '../helpers/testprod-promo';

// เทสต์ Promo Code จาก "[Product] Test Cases for Regression automated -
// Normal_ All Condition.csv" แยกไฟล์ออกจาก buyer-purchase-flow.spec.ts
// เพราะโค้ดพวกนี้ใช้ได้เฉพาะกับอีกบัญชีหนึ่ง (TEST_PROMO_EMAIL) ไม่ใช่บัญชีที่
// flow นั้นใช้ (TEST_EMAIL) — เอามารวมเป็น flow เดียวกันไม่ได้
//
// TEST_PROMO_EMAIL ติด 2FA จึง login ผ่านสคริปต์ email+password ปกติไม่ได้
// (ดู loginTestProd() ใน helpers/auth.ts) ไฟล์นี้เลยโหลด session ที่ล็อกอินไว้
// ล่วงหน้าจาก storageState-promo.json แทน ซึ่งได้มาจากการรัน
// scripts/save-promo-account-session.js ที่เครื่องตัวเอง (ต้องมีจอจริงสำหรับ
// ขั้นตอน 2FA) — รันสคริปต์นั้นซ้ำทุกครั้งที่ session หมดอายุ
//
// นี่เป็นคนละกลไกกับ popup "Have a coupon?" ตอน checkout เลย
// (#input-coupon-code / /v1/users/coupon/redeem) — ยืนยันจากการดักดู network
// จริงว่าบางโค้ดพวกนี้ตอบกลับ 400/"Invalid Coupon" จาก endpoint นั้นจริงๆ
// เพราะมันไม่ได้ถูกออกแบบมาให้ใช้ผ่านทางนั้นตั้งแต่แรก โค้ดพวกนี้ต้อง apply
// ผ่านช่อง "Promo Code" บนหน้า event แทน (helpers/testprod-promo.ts)
//
// UN1, PT1, EX ใช้ซ้ำได้ปลอดภัยทุกครั้งที่รัน (ยืนยันจากการทดสอบจริง)
// UNQ/UNQO ตั้งใจให้ใช้ได้ครั้งเดียว (ไว้ทดสอบการถูกปฏิเสธเพราะ "ใช้ไปแล้ว"
// TC_012) แต่ยืนยันจากการทดสอบจริงว่า: การ apply โค้ดบนหน้าเลือกตั๋วเป็นแค่การ
// *preview* เท่านั้น — โควต้าการใช้จะยังไม่ถูกตัดจริงจนกว่า order จะจ่ายเงิน
// สำเร็จ การรัน TC_015 ของไฟล์นี้ซ้ำ (ซึ่ง apply UNQ) จึงไม่ทำให้โควต้าหมด มันจะ
// ยังใช้ได้อยู่เสมอ ส่วน TC_012 เองถูก mark เป็น fixme (ดูที่นั่น)
//
// ยังไม่มีในไฟล์นี้: TC_009 (โค้ดผิด) — ต้องยืนยันซ้ำกับช่องนี้โดยเฉพาะ ยังไม่ได้
// ยืนยันซ้ำหลังจากเจอว่ามีสองระบบปนกัน TC_013 (จำกัดจำนวนใช้ต่อ *จำนวนตั๋วใน
// ออเดอร์* เช่น "สูงสุด 2 ใบ") — "ใช้ได้ครั้งเดียว" ของ UNQ/UNQO เป็นการจำกัด
// จำนวนครั้งที่ redeem ได้ ไม่ใช่จำกัดจำนวนตั๋วต่อออเดอร์ ยังไม่มีโค้ดที่ตรงกับ
// scenario จริงของ TC_013
test.use({ storageState: 'storageState-promo.json' });

test.describe.serial('Promo Code', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage({ storageState: 'storageState-promo.json' });
    await gotoEventPage(page);
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('TC_010: a valid promo code reveals a hidden ticket', async () => {
    await applyPromoCode(page, 'UN1');
    await expect(page.getByText('Promo code applied successfully!')).toBeVisible();
    await expect(page.getByText('Unhide', { exact: true })).toBeVisible();
  });

  test('TC_011: an expired promo code shows an error', async () => {
    await clearPromoCode(page);
    await applyPromoCode(page, 'EX');
    await expect(page.getByText('The promo code has expired. Please try again.')).toBeVisible();
  });

  test('TC_008: applying a valid promo code applies a discount', async () => {
    await clearPromoCode(page);
    await applyPromoCode(page, 'PT1');
    await expect(page.getByText('Promo code applied successfully!')).toBeVisible();
    // PT1 ผูกกับ Ticket 1 (200 THB) ลดเหลือ 180 THB
    await expect(await firstVisible(page.getByText('180 THB'))).toBeVisible();
  });

  test('TC_014: applying a promo code after selecting a ticket keeps the selection', async () => {
    await increaseQuantity(page, TICKETS.ticketB.id, 1);
    await clearPromoCode(page);
    await applyPromoCode(page, 'PT1');
    await expect(ticketQuantity(page, TICKETS.ticketB.id)).toHaveText('1');
    await expect(page.getByText('Promo code applied successfully!')).toBeVisible();
  });

  test('TC_015: clearing a promo code and applying a different one replaces it', async () => {
    await clearPromoCode(page);
    await applyPromoCode(page, 'UNQ');
    await expect(page.getByText('Promo code applied successfully!')).toBeVisible();
    // Ticket 3 (400 THB) ลดเหลือ 300 THB
    await expect(await firstVisible(page.getByText('300 THB'))).toBeVisible();
  });

  test.fixme(
    'TC_012: reapplying an already-used-up promo code no longer works',
    async () => {
      // ยืนยันจากการทดสอบจริง: apply UNQ ซ้ำเป็นครั้งที่สองต่อจาก TC_015
      // ทันที ก็ยังสำเร็จอยู่ดี (ขึ้น "Promo code applied successfully!" อีก
      // ครั้ง) แทนที่จะถูกปฏิเสธ ดูเหมือนว่า "ใช้ได้ครั้งเดียว" จะถูกตัดโควต้า
      // จริงก็ต่อเมื่อ order นั้นจ่ายเงินสำเร็จแล้วเท่านั้น ไม่ใช่แค่ตอน
      // apply/preview บนหน้าเลือกตั๋ว — flow นี้ไม่เคยไปถึง Pay Now เลย โควต้า
      // เลยไม่มีทางถูกตัดจริง การจะทดสอบการถูกปฏิเสธแบบ "ใช้ไปแล้ว" จริงๆ
      // ต้องจ่ายเงินให้ order สำเร็จด้วย UNQ ก่อน ซึ่งต้องตัดสินใจเรื่องนี้เป็น
      // การเฉพาะ (เงินจริง เหมือนกับ TC_051 ของ buyer-purchase-flow.spec.ts)
      // ก่อนจะเขียนส่วนนี้
    }
  );
});
