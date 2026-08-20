import { test, expect, Page } from '@playwright/test';
import path from 'node:path';
import { loginTestProd } from '../helpers/auth';
import { loadTranslations, createTranslator, LOCALES } from '../../Utils/i18n';
import { switchLanguage, detectCurrentLanguage } from '../helpers/language';
import { gotoEventPage, TICKETS, increaseQuantity } from '../helpers/testprod-tickets';

// TestProd (www.ticketmelon.com) เวอร์ชันของ "[Product] Test Cases for
// Regression automated" ชุด Saved Cards (TC-01 ถึง TC-012) — dev/PRE ผ่านการ
// เทสด้วยมือมาแล้ว (ดู tests/localize-saved-card.spec.ts สำหรับชุด i18n ฝั่ง
// dev) ไฟล์นี้ทำ flow เดียวกันบน environment จริงที่ตัดเงินได้ (ใช้บัญชีเดียวกับ
// tests/regression/buyer-purchase-flow.spec.ts — TEST_EMAIL/TEST_PASSWORD)
//
// สำคัญ — ทำไมหลายเคสข้างล่างหยุดแค่ที่ dialog ยืนยัน (กด Cancel) ไม่กด Delete
// จริง: ยืนยันจากการเปิดหน้าจริงก่อนเขียนไฟล์นี้ว่าบัญชี TEST_EMAIL มีบัตรจริงอยู่
// แค่ 2 ใบเท่านั้นบน TestProd (**** 9452 = Default, **** 4360 = Expired) และ
// หน้า Payment Methods ไม่มีปุ่ม "Add card" ตรงๆ เลย — บัตรใหม่บันทึกได้ทาง
// Checkout เท่านั้น และ (ยืนยันกับผู้ใช้แล้ว) บัตรจะถูกบันทึกเข้าบัญชีก็ต่อเมื่อ
// กรอก OTP/3DS สำเร็จเท่านั้น ซึ่งชุด regression นี้มีกฎเด็ดขาดว่าห้ามกรอก/submit
// OTP จริง (ดู buyer-purchase-flow.spec.ts) ผลคือ: ถ้าลบบัตรจริงทั้ง 2 ใบนี้ไป
// จะไม่มีทางเติมบัตรกลับเข้าบัญชีแบบอัตโนมัติได้อีกเลย เทสต์ในไฟล์นี้จึงถูก
// ออกแบบ (ตัดสินใจร่วมกับผู้ใช้แล้ว) ให้ตรวจแค่ระดับ dialog ยืนยัน/ข้อความ ไม่ยืนยัน
// การลบจริงและผลลัพธ์การจัด default ใหม่หลังลบจริง — TC-06/07/010 ที่ต้องอาศัย
// ผลลัพธ์หลังลบจริงถูก mark เป็น fixme พร้อมเหตุผลเดียวกันนี้
const translations = loadTranslations(
  path.join(__dirname, '../../data/buyer-profile-payment-container.csv')
);
const t = createTranslator(translations);

test.describe.serial('Saved Cards management — Payment Methods (TestProd)', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await loginTestProd(page);
    await page.goto('https://www.ticketmelon.com/user/payment', { waitUntil: 'domcontentloaded' });
  });

  test.afterAll(async () => {
    await page.close();
  });

  test.beforeEach(async () => {
    await page.goto('https://www.ticketmelon.com/user/payment', { waitUntil: 'domcontentloaded' });
  });

  test('TC-01: Default card is always shown first in the saved card list', async () => {
    // ยืนยันได้แค่ส่วนที่ตรวจสอบได้จริงผ่าน UI: การ์ด Default ต้องอยู่แถวแรกเสมอ
    // และลำดับการ์ดต้องคงที่ (ไม่สลับมั่วๆ) ข้าม reload ส่วนการยืนยันแบบเต็มว่า
    // เรียงตาม created_at ย้อนหลังจริงหรือไม่ ทำไม่ได้จาก UI อย่างเดียว (ไม่มี
    // timestamp โชว์บนหน้าเว็บ ต้องมี API/backend access) — และการสร้างสถานการณ์
    // มีบัตรใหม่ 2+ ใบที่รู้ลำดับเวลาการเพิ่มแน่ชัดก็ติดข้อจำกัดเดียวกับ TC-02/03
    // ด้านล่าง (เพิ่มบัตรผ่าน Checkout ต้องกรอก OTP สำเร็จก่อนถึงจะบันทึกจริง)
    const firstOrderBefore = await page.locator('[id^="card-number-"]').allTextContents();
    await expect(page.getByText(t('card_default', 'en-US'), { exact: true }).first()).toBeVisible();

    const defaultBadge = page.getByText(t('card_default', 'en-US'), { exact: true }).first();
    const firstCardRow = page.locator('[id^="card-number-"]').first();
    // badge "Default" ต้องอยู่ในแถวเดียวกับการ์ดใบแรกของลิสต์ (ancestor ร่วมที่
    // ใกล้ที่สุดที่ครอบทั้งเลขบัตรกับ badge)
    await expect(
      firstCardRow.locator('xpath=ancestor::div[.//text()[normalize-space()="Default"]]').first()
    ).toContainText('Default');

    await page.reload({ waitUntil: 'domcontentloaded' });
    const firstOrderAfter = await page.locator('[id^="card-number-"]').allTextContents();
    expect(firstOrderAfter).toEqual(firstOrderBefore);
  });

  test.fixme(
    'TC-02: newly added card appears below the existing Default card',
    async () => {
      // ต้องเพิ่มบัตรใหม่จริงผ่าน Checkout ก่อนถึงจะเช็คตำแหน่งที่ปรากฏได้ —
      // ยืนยันกับผู้ใช้แล้วว่าบัตรจะบันทึกเข้าบัญชีก็ต่อเมื่อกรอก OTP/3DS สำเร็จ
      // เท่านั้น ซึ่งชุด regression นี้ห้ามกรอก/submit OTP จริงเด็ดขาด (ดู
      // buyer-purchase-flow.spec.ts) จึงไม่มีทาง reach สถานะ "บัตรใหม่ถูกบันทึก
      // แล้ว" แบบอัตโนมัติได้เลยตอนนี้
    }
  );

  test.fixme('TC-03: first saved card becomes Default', async () => {
    // เหตุผลเดียวกับ TC-02: ต้องมีบัญชีที่ไม่มีบัตรเลย แล้วเพิ่มบัตรใบแรกผ่าน
    // Checkout จนสำเร็จ (รวม OTP) ถึงจะยืนยันได้ว่ามันถูกตั้งเป็น Default
    // อัตโนมัติ — ติดข้อจำกัดเดียวกับ TC-02 เรื่องห้ามกรอก OTP จริง
  });

  test('TC-04: every saved card has a Delete option in its kebab menu', async () => {
    const cardCount = await page.locator('[id^="card-action-more-"]').count();
    expect(cardCount).toBeGreaterThan(0);

    for (let i = 0; i < cardCount; i++) {
      await page.locator(`#card-action-more-${i}`).click();
      await expect(page.locator('#action-delete-card')).toBeVisible();
      await expect(page.locator('#text-menu-delete-card')).toHaveText('Delete');
      // ปิดเมนูก่อนไปแถวถัดไป (กด Escape แทนคลิก Delete) ไม่งั้นเมนูของแถวถัดไป
      // อาจเปิดซ้อนทับเมนูเดิมที่ยังไม่ปิด
      await page.keyboard.press('Escape');
    }
  });

  test('TC-05: delete confirmation dialog for a non-default card, then cancel (Default card unchanged)', async () => {
    // บนบัญชีนี้ตอนนี้มีบัตรที่ไม่ใช่ Default อยู่ใบเดียว (index 1 — **** 4360,
    // ใบเดียวกับที่ TC-09 ใช้ทดสอบ "non-default expired card" ด้านล่าง) — กด
    // Cancel เสมอ ไม่กด Delete จริง ตามเหตุผลที่หัวไฟล์
    //
    // หมายเหตุจาก CSV เดิม (manual QA): มี known bug ที่ยังไม่ fix — ถ้า save
        // card ซ้ำกัน (duplicate) แล้วลบ จะหายไปทั้ง 2 ใบ และหน้า checkout ยังไม่
    // handle ไม่ให้ save card ซ้ำได้มากกว่า 1 ครั้ง — ไม่ใช่สิ่งที่ทดสอบซ้ำได้จาก
    // dialog-level check นี้ (ต้องมีบัตรซ้ำจริงก่อน) บันทึกไว้เฉยๆ เพื่อไม่ให้
    // หายไปจาก context
    await page.locator('#card-action-more-1').click();
    await page.locator('#action-delete-card').click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(page.locator('#dialog-confirm-delete-title')).toHaveText('Delete this card?');
    await expect(page.locator('#dialog-confirm-delete-content')).toContainText(
      'This card will be removed from your saved payment methods.'
    );

    await page.locator('#btn-dialog-confirm-delete-cancel-button').click();
    await expect(dialog).not.toBeVisible();

    // ยืนยันว่าไม่มีอะไรถูกลบจริง: การ์ด Default ใบเดิมยังอยู่แถวแรกเหมือนเดิม
    await expect(page.getByText(t('card_default', 'en-US'), { exact: true }).first()).toBeVisible();
    expect(await page.locator('[id^="card-number-"]').count()).toBe(2);
  });

  test('TC-06: delete confirmation dialog opens for the Default card, then cancel', async () => {
    // TC-06 ต้นฉบับต้องการสถานการณ์ "บัตร Default เป็นบัตรใบเดียวที่มีในบัญชี"
    // ซึ่ง reproduce ไม่ได้โดยไม่ลบบัตรอีกใบ (**** 4360) จริงก่อน — บัญชีนี้มี 2
    // ใบอยู่ตลอดตามเหตุผลที่หัวไฟล์ เทสต์นี้จึงตรวจแค่ว่า dialog ยืนยันลบเปิดได้
    // ถูกต้องสำหรับบัตร Default (index 0) เหมือนกับบัตรใบอื่น ส่วน "ลบสำเร็จจริง
    // เมื่อเป็นบัตรใบเดียว" ยังไม่ถูกยืนยันในไฟล์นี้
    await page.locator('#card-action-more-0').click();
    await page.locator('#action-delete-card').click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(page.locator('#dialog-confirm-delete-title')).toHaveText('Delete this card?');

    await page.locator('#btn-dialog-confirm-delete-cancel-button').click();
    await expect(dialog).not.toBeVisible();
  });

  test.fixme(
    'TC-07: the remaining card with the latest created_at automatically becomes Default after deleting the Default card',
    async () => {
      // ต้องลบบัตร Default จริงก่อนถึงจะเช็คได้ว่าบัตรที่เหลือถูกตั้งเป็น
      // Default อัตโนมัติหรือไม่ — เป็น real destructive action ที่ผู้ใช้ตัดสินใจ
      // แล้วว่าไม่ให้ทำในไฟล์นี้ (ดูเหตุผลที่หัวไฟล์) ต้องทำแบบ manual ถ้าต้องการ
      // ยืนยันจริง
    }
  );

  test('TC-09: delete confirmation dialog for a non-default expired card, then cancel', async () => {
    // ใบเดียวกับ TC-05 บนบัญชีนี้ (index 1 — **** 4360 — เป็นทั้ง non-default
    // และ expired พร้อมกัน เพราะบัญชีมีบัตร non-default อยู่ใบเดียว) เก็บเป็น
    // เทสต์แยกเพื่อ map 1:1 กับ TC id ของสเปรดชีตต้นฉบับ
    await expect(page.getByText(t('card_expired', 'en-US'), { exact: true }).first()).toBeVisible();

    await page.locator('#card-action-more-1').click();
    await page.locator('#action-delete-card').click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(page.locator('#dialog-confirm-delete-title')).toHaveText('Delete this card?');

    await page.locator('#btn-dialog-confirm-delete-cancel-button').click();
    await expect(dialog).not.toBeVisible();
  });

  test.fixme(
    'TC-010: deleting the Default card while an expired card remains reassigns Default correctly (expired card never gets the Default tag)',
    async () => {
      // เหตุผลเดียวกับ TC-07 — ต้องลบบัตร Default จริงเพื่อเช็คว่าบัตร expired
      // ที่เหลือไม่ได้ถูกตั้งเป็น Default ด้วย ซึ่งเป็น destructive action ที่ตั้งใจ
      // ไม่ทำในไฟล์นี้
    }
  );

  // TC-08: คำแปล UI ของหน้า Saved Cards + เมนู Delete + dialog ยืนยันลบ บน
  // TestProd ครบทั้ง 9 ภาษา (LOCALES) — โครงเดียวกับ
  // tests/localize-saved-card.spec.ts ฝั่ง dev แต่ตัดเฉพาะส่วนที่ TC-08 พูดถึง
  // (Payment Methods page, Delete menu, confirmation modal) ไม่รวม empty-state
  // และ set-default dialog ซึ่งเป็นคนละ TC
  //
  // สำคัญ: ภาษาที่เลือกเก็บไว้ระดับบัญชี (ไม่ใช่แค่ cookie ต่อ domain — ดู
  // comment ใน helpers/language.ts) บัญชีนี้ใช้ร่วมกับ
  // buyer-purchase-flow.spec.ts / promo-code.spec.ts ที่ hardcode ข้อความ
  // อังกฤษไว้ในหลาย assertion ถ้าเทสต์นี้จบด้วยภาษาอื่นที่ไม่ใช่อังกฤษค้างไว้ จะไป
  // ทำเทสต์อื่นในชุด regression พังหมด — afterAll ด้านล่างจึงสลับกลับเป็น English
  // เสมอไม่ว่าเทสต์ก่อนหน้าจะจบด้วยภาษาอะไร (แม้ตัวเองจะ fail กลางทาง)
  test.describe.serial('TC-08: Saved Cards page + Delete dialog translations', () => {
    let currentLabel: string | null = null;
    const headingTextByCode = Object.fromEntries(
      LOCALES.map((l) => [l.code, t('save_cards_title', l.code)])
    );

    test.beforeEach(async () => {
      await page.goto('https://www.ticketmelon.com/user/payment', { waitUntil: 'domcontentloaded' });
    });

    test.afterAll(async () => {
      if (currentLabel !== null && currentLabel !== 'English') {
        await switchLanguage(page, currentLabel, 'English', t('save_cards_title', 'en-US'));
      }
    });

    for (const { code, label } of LOCALES) {
      test(`Saved Cards page + Delete dialog translated for ${code} (${label})`, async () => {
        if (currentLabel === null) {
          currentLabel = await detectCurrentLanguage(page, LOCALES, headingTextByCode);
        }
        await switchLanguage(page, currentLabel, label, t('save_cards_title', code));
        currentLabel = label;

        await expect(page.locator('#header-text-payment')).toHaveText(t('save_cards_title', code));
        await expect(
          page.getByText(t('save_cards_information', code), { exact: true })
        ).toBeVisible();

        await page.locator('#card-action-more-1').click();
        await page.getByText(t('card_delete', code), { exact: true }).click();

        const dialog = page.getByRole('dialog');
        await expect(dialog).toBeVisible();
        await expect(
          dialog.getByText(t('dialog_confirm_delete_title', code), { exact: true })
        ).toBeVisible();
        await expect(
          dialog.getByText(t('dialog_confirm_delete_description', code), { exact: true })
        ).toBeVisible();
        await expect(
          dialog.getByText(t('dialog_confirm_delete_button', code), { exact: true })
        ).toBeVisible();

        // Cancel เท่านั้น — เทสต์นี้ต้องไม่ลบบัตรจริง (เหตุผลเดียวกับหัวไฟล์)
        await dialog
          .getByText(t('dialog_confirm_cancel_button', code), { exact: true })
          .click();
        await expect(dialog).not.toBeVisible();
      });
    }
  });
});

// TC-011: Default card แสดง + ถูกเลือกอัตโนมัติในหน้า Checkout จริง
//
// ใช้ page/session แยกจาก describe บนสุด เพราะต้องเดินผ่าน flow ซื้อตั๋วเต็ม
// รูปแบบ (ticket -> add-on -> registration form -> checkout) เหมือน
// buyer-purchase-flow.spec.ts ถึงจะเห็นส่วน Payment Channel ได้ — จงใจ *ไม่*
// ไปแก้ไฟล์ buyer-purchase-flow.spec.ts ที่ยืนยันทำงานถูกต้องอยู่แล้วเพื่อลด
// ความเสี่ยง เทสต์นี้จบแค่การเช็คส่วน saved-card selector ที่ payment channel
// "Credit/Debit" ไม่กด Pay Now เลย จึงไม่มีการตัดเงินใดๆ (ตะกร้าจะถูกปล่อยทิ้ง
// ไว้เฉยๆ — อีเว้นนี้มี session/hold timeout ของตัวเองอยู่แล้วที่จะคืนสต็อกตั๋วเอง
// ยืนยันจากการทดสอบจริง: เห็น countdown timer บนหน้า checkout)
//
// ยืนยันจากการเปิดหน้าจริงก่อนเขียนเทสต์นี้: บัตร Default (**** 9452) เป็นใบ
// เดียวที่มีช่อง CVV/CVC ให้กรอกในลิสต์ "Saved Credit/Debit" (คือใบที่ระบบเลือก
// ไว้ให้อัตโนมัติ — ใบอื่นไม่มีช่อง CVV โชว์จนกว่าจะถูกเลือก)
test.describe.serial('TC-011: Default saved card is pre-selected at Checkout (TestProd)', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await loginTestProd(page);
    await gotoEventPage(page);

    await increaseQuantity(page, TICKETS.ticketB.id, 1);
    await page.locator('#checkbox-event-agree-share-info').click();
    await page.locator('#btn-btn-buy-ticket').click();
    await page.waitForURL(/\/order\/.+\/add-on/, { timeout: 15_000, waitUntil: 'domcontentloaded' });
    await page.locator('#add-on-name-0').first().waitFor({ state: 'visible', timeout: 15_000 });

    await page.locator('#btn-add-on-continue-button').click();
    await page.waitForURL(/\/order\/.+\/attendee/, { timeout: 15_000, waitUntil: 'domcontentloaded' });

    await page.getByText('Ticket No. 1', { exact: true }).first().waitFor({ state: 'visible', timeout: 15_000 });
    const nameFields = page.getByPlaceholder('Your Answer');
    for (let i = 0; i < (await nameFields.count()); i++) {
      const field = nameFields.nth(i);
      if ((await field.inputValue()) === '') await field.fill('Test');
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

  test.afterAll(async () => {
    await page.close();
  });

  test('TC-011: Default card is displayed and selected under Credit/Debit at checkout', async () => {
    await page.locator('[id="payment-channel-Credit/Debit"]').click();

    const defaultCardRow = page
      .getByText('*9452', { exact: false })
      .locator('xpath=ancestor::div[contains(@class,"MuiBox-root")][1]');
    const otherCardRow = page
      .getByText('*4360', { exact: false })
      .locator('xpath=ancestor::div[contains(@class,"MuiBox-root")][1]');

    await expect(defaultCardRow).toBeVisible();
    // ใบที่ระบบเลือกไว้อัตโนมัติเท่านั้นที่โชว์ช่องกรอก CVV/CVC
    await expect(defaultCardRow.locator('#input-input-save-card-cvv')).toBeVisible();
    await expect(otherCardRow.locator('#input-input-save-card-cvv')).toHaveCount(0);
  });
});

// TC-012: Responsive layout + touch interaction บนมือถือจริง (TestProd)
//
// context แยกด้วย viewport/touch ของมือถือ (ไม่ใช้ project 'testprod' เดิมที่
// ตั้งเป็น Desktop Chrome) — login ใหม่ในนี้เพราะ session ของ describe อื่นๆ
// ผูกกับ context ของตัวเอง ใช้ร่วมกันข้าม context ไม่ได้
test.describe.serial('TC-012: Responsive layout — Payment Methods on mobile (TestProd)', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    });
    page = await context.newPage();
    await loginTestProd(page);
    await page.goto('https://www.ticketmelon.com/user/payment', { waitUntil: 'domcontentloaded' });
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('TC-012: card list, kebab menu, and confirmation modal display correctly on mobile without layout issues', async () => {
    await expect(page.locator('#header-text-payment')).toBeVisible();
    const cardCount = await page.locator('[id^="card-action-more-"]').count();
    expect(cardCount).toBe(2);

    // ไม่มี horizontal overflow (เนื้อหากว้างเกิน viewport) — proxy ง่ายๆ สำหรับ
    // "display correctly without layout issues" ของ TC-012
    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth
    );
    expect(hasHorizontalOverflow).toBe(false);

    // เปิดเมนู kebab ด้วย tap (ไม่ใช่ click) เพื่อจำลอง touch interaction จริง
    await page.locator('#card-action-more-1').tap();
    await expect(page.locator('#action-delete-card')).toBeVisible();

    await page.locator('#action-delete-card').tap();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(page.locator('#dialog-confirm-delete-title')).toBeVisible();

    // dialog ต้องไม่ล้นขอบจอ (ปัญหา layout ที่พบบ่อยสุดบนมือถือ)
    const dialogBox = await dialog.boundingBox();
    expect(dialogBox).not.toBeNull();
    expect(dialogBox!.x).toBeGreaterThanOrEqual(0);
    expect(dialogBox!.x + dialogBox!.width).toBeLessThanOrEqual(390 + 1);

    await page.locator('#btn-dialog-confirm-delete-cancel-button').tap();
    await expect(dialog).not.toBeVisible();
  });
});
