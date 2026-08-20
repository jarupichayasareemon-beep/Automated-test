import { test, expect, Page, BrowserContext } from '@playwright/test';
import path from 'node:path';
import { loadTranslations, createTranslator, LOCALES } from '../utils/i18n';
import { login } from './helpers/auth';
import { switchLanguage, detectCurrentLanguage } from './helpers/language';
import { createSharedPage, closeSharedPage } from './helpers/recording';

// รวม 4 ไฟล์เดิม (saved-cards-i18n.spec.ts, delete-dialog-i18n.spec.ts,
// empty-cards-i18n.spec.ts, set-default-dialog-i18n.spec.ts) เป็นไฟล์เดียว
// เพราะทั้งหมดทดสอบหน้า Saved Cards หน้าเดียวกัน แต่ละ block ยังคง
// test.describe.serial ของตัวเองพร้อม page/บัญชีที่ใช้ร่วมกันของตัวเอง — การ
// รวม *ไฟล์* ไม่ได้รวม state ของแต่ละ block เข้าด้วยกัน แต่ละ block จึงยังต้อง
// เป็นอิสระจากกันเหมือนเดิม (ดูคอมเมนต์ของแต่ละ block ว่าทำไม)
//
// tests/auth.setup.ts **ไม่ได้ถูกรวม** เข้ามาด้วย เพราะมันเป็น Playwright
// project dependency (ที่ project 'setup' ใช้ `testMatch: /auth\.setup\.ts/`
// ของ playwright.config.ts จับคู่อยู่) ไม่ใช่ไฟล์ spec ธรรมดา จึงต้องแยกไฟล์
// ไว้แบบนี้ pattern นั้นถึงจะยังทำงานได้
const translations = loadTranslations(
  path.join(__dirname, '../data/buyer-profile-payment-container.csv')
);
const t = createTranslator(translations);
const headingTextByCode = Object.fromEntries(
  LOCALES.map((l) => [l.code, t('save_cards_title', l.code)])
);

// .serial + ใช้ page เดียวกันร่วมกันตลอดทุกเทสต์ใน block นี้ (สร้างครั้งเดียวใน
// beforeAll) แทนค่า default ที่เป็น page ใหม่ต่อเทสต์ — ดูคำอธิบายแบบละเอียด
// กว่านี้ใน block ของ delete-dialog ด้านล่าง สรุปสั้นๆ คือ: storageState.json
// (tests/auth.setup.ts) เก็บภาพสถานะ ณ ช่วงเวลาหนึ่งไว้ (point-in-time
// snapshot) ถ้าใช้ page ใหม่ทุกเทสต์ก็จะโหลดภาษาที่ capture ไว้ตอนแรกซ้ำๆ
// ทำให้ switchLanguage() ของเทสต์ก่อนหน้าถูกล้างไปเงียบๆ การใช้ page เดียวกัน
// ตลอดจะรักษาสถานะภาษาจริงบนหน้าเว็บ — รวมถึงการติดตามค่าของ currentLabel —
// ให้ถูกต้อง
test.describe.serial('Saved Cards page — main text translations', () => {
  let page: Page;
  let context: BrowserContext | null;
  // เว็บนี้จำภาษาที่เลือกไว้ระดับบัญชี ดังนั้นภาษาเริ่มต้นจริงๆ ตอนรันใหม่แต่ละ
  // ครั้งอาจเป็นภาษาอะไรก็ได้ที่ session ก่อนหน้าทิ้งไว้ — ไม่จำเป็นต้องเป็น
  // "English" เสมอไป ตรวจจับแค่ครั้งเดียวตอนเทสต์แรก จากตัวหน้าเว็บเอง ดู
  // detectCurrentLanguage()
  let currentLabel: string | null = null;

  test.beforeAll(async ({ browser }) => {
    ({ page, context } = await createSharedPage(browser, { storageState: 'storageState.json' }));
  });

  test.afterAll(async () => {
    await closeSharedPage(page, context, 'saved-cards-i18n');
  });

  test.beforeEach(async () => {
    await page.goto('/user/payment');
  });

  for (const { code, label } of LOCALES) {
    test(`Saved Cards page shows correct text for ${code} (${label})`, async () => {
      if (currentLabel === null) {
        currentLabel = await detectCurrentLanguage(page, LOCALES, headingTextByCode);
      }
      await switchLanguage(page, currentLabel, label, t('save_cards_title', code));
      currentLabel = label;

      // ข้อความ title นี้ปรากฏใน sidebar nav item ชื่อเดียวกันด้วย ใช้แค่
      // getByText({exact: true}) เฉยๆ จะกำกวม (strict-mode violation) —
      // เจาะจงไปที่ id ที่ตายตัวของ heading หน้านั้นแทน
      await expect(page.locator('#header-text-payment')).toHaveText(t('save_cards_title', code));
      // exact: true — ไม่งั้นค่า CSV ที่พังแบบมีข้อความสั้นๆ ที่บังเอิญเป็น
      // substring ของข้อความจริงบนหน้าเว็บ (เช่นเหลือแค่คำว่า "PCI" ลอยๆ)
      // จะ match ผ่านแบบผิดๆ ได้ — ยืนยันเจอเคสนี้จริงจากการทดสอบ
      await expect(page.getByText(t('save_cards_information', code), { exact: true })).toBeVisible();

      // badge พวกนี้จะ render ก็ต่อเมื่อบัญชีทดสอบที่ login อยู่มีบัตร default
      // และ/หรือบัตรหมดอายุอยู่จริงตอนนั้น ถ้าข้อมูลบัญชีทดสอบของคุณไม่เหมือนกัน
      // ให้ลบส่วนที่ไม่ตรงออก
      const defaultBadge = page.getByText(t('card_default', code), { exact: true });
      if (await defaultBadge.count()) {
        await expect(defaultBadge.first()).toBeVisible();
      }

      const expiredBadge = page.getByText(t('card_expired', code), { exact: true });
      if (await expiredBadge.count()) {
        await expect(expiredBadge.first()).toBeVisible();
      }
    });
  }
});

// .serial + ใช้ page เดียวกันร่วมกันตลอดทุกเทสต์ใน block นี้ มี 2 อย่างที่ต้อง
// พึ่งความต่อเนื่องนี้:
//  - session ที่ login แล้วมาจาก storageState.json (ดู tests/auth.setup.ts /
//    playwright.config.ts) จึงไม่ต้อง login ใหม่ทุกเทสต์ — แต่แค่นั้นไม่ได้
//    แปลว่าแต่ละเทสต์จะใช้ page ใหม่ของตัวเองได้อย่างปลอดภัย: storageState
//    เป็นภาพสถานะ ณ ช่วงเวลาหนึ่ง (point-in-time snapshot) page ใหม่จะโหลด
//    ภาษา *ต้นฉบับ* ที่ capture ไว้ตอนนั้นซ้ำเสมอ ทำให้ผลจาก switchLanguage()
//    ของเทสต์ก่อนหน้าถูกล้างไปเงียบๆ
//  - การสลับภาษาเองก็มี state ในตัว (แต่ละครั้งที่สลับจะอ้างอิงจากภาษาที่
//    "กำลังเลือกอยู่ตอนนั้น" บนหน้าเว็บจริง) เทสต์จึงต้องรันเรียงลำดับกันบน page
//    เดียวกันที่อัปเดตต่อเนื่อง ไม่ใช่รันพร้อมกันหรือแยกคนละ page
test.describe.serial('Saved Cards page — delete confirmation dialog translations', () => {
  let page: Page;
  let context: BrowserContext | null;
  let currentLabel: string | null = null;

  test.beforeAll(async ({ browser }) => {
    ({ page, context } = await createSharedPage(browser, { storageState: 'storageState.json' }));
  });

  test.afterAll(async () => {
    await closeSharedPage(page, context, 'delete-dialog-i18n');
  });

  test.beforeEach(async () => {
    await page.goto('/user/payment');
  });

  for (const { code, label } of LOCALES) {
    test(`delete confirmation dialog is translated for ${code} (${label})`, async () => {
      if (currentLabel === null) {
        currentLabel = await detectCurrentLanguage(page, LOCALES, headingTextByCode);
      }
      await switchLanguage(page, currentLabel, label, t('save_cards_title', code));
      currentLabel = label;

      // เปิดเมนู "⋮" ที่แถวบัตรที่บันทึกไว้แถวแรก ปุ่มนี้มี id ที่ตายตัว
      // ("card-action-more-0" สำหรับแถวแรก แล้วเลขจะเพิ่มตามแถว) — ยืนยัน
      // จากการเปิดดู DOM ที่ render จริงของแถวนั้น ซึ่งเชื่อถือได้กว่าการเดา id
      // จากข้อความเลขบัตรผ่าน ancestor มาก (ancestor div/li ที่ใกล้ที่สุดของ
      // ข้อความเลขบัตร กลายเป็นแค่ wrapper แคบๆ ที่ไม่มีปุ่มอยู่ข้างในเลย ทำให้
      // คลิกนี้ timeout)
      await page.locator('#card-action-more-0').click();

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

      // กด Cancel ออกมา — เทสต์นี้ต้อง**ไม่ลบบัตรจริง**
      await dialog
        .getByText(t('dialog_confirm_cancel_button', code), { exact: true })
        .click();
      await expect(dialog).not.toBeVisible();
    });
  }

  // TODO: ยังไม่ครอบคลุม — การกดยืนยันลบจริง (ไม่ใช่แค่กด cancel) แล้วเช็คคำแปล
  // ของข้อความสำเร็จหลังลบ สำหรับทั้ง 3 flow ใน design "Delete Default Card
  // Flow" (เหลือบัตร default ใบเดียว / มีหลายบัตร / บัตรหมดอายุ) ต้องวางแผน
  // เรื่องข้อมูลบัตรทดสอบที่ใช้แล้วทิ้งได้ก่อน เพราะการลบจริงเป็นการทำลายข้อมูล
  // และบัตร 3 ใบของบัญชีทดสอบตอนนี้ตรงกับทั้ง 3 flow นั้นพอดี ถ้าลบจริงจะไม่
  // เหลืออะไรให้รันเทสต์นี้ซ้ำในครั้งถัดไปเลย
});

// บัญชีนี้ใช้บัญชี*ที่สอง* (TEST_EMPTY_EMAIL / TEST_EMPTY_PASSWORD) ที่ไม่มี
// บัตรบันทึกไว้เลย เพื่อครอบคลุม empty state "You haven't saved any cards
// yet." — บัญชีหลัก TEST_EMAIL มีบัตรอยู่เสมอ จึงไม่มีทางแสดง state นี้ได้เลย
// login ตรงๆ ใน beforeAll (ครั้งเดียวสำหรับทั้ง block) แทนที่จะผ่าน
// storageState.json/auth.setup.ts เพราะไฟล์ที่ใช้ร่วมกันนั้นเป็นของบัญชีหลัก
// การสลับบัญชีกลางทางจะไปขัดกับสมมติฐานของ block อื่นๆ ที่คิดว่าบัญชีหลักจะ
// ล็อกอินค้างอยู่ตลอด
//
// .serial + ใช้ page เดียวร่วมกันทุกเทสต์ — ดูคำอธิบายแบบละเอียดกว่านี้ใน block
// ของ delete-dialog ด้านบน (การสลับภาษาเองก็มี state ในตัว เทสต์จึงต้องรัน
// เรียงลำดับกันบน page เดียวที่อัปเดตต่อเนื่อง)
test.describe.serial('Saved Cards page — empty state translations', () => {
  let page: Page;
  let context: BrowserContext | null;
  let currentLabel: string | null = null;

  test.beforeAll(async ({ browser }) => {
    ({ page, context } = await createSharedPage(browser));
    await login(page, {
      email: process.env.TEST_EMPTY_EMAIL,
      password: process.env.TEST_EMPTY_PASSWORD,
      envVarNames: ['TEST_EMPTY_EMAIL', 'TEST_EMPTY_PASSWORD'],
    });
  });

  test.afterAll(async () => {
    await closeSharedPage(page, context, 'empty-cards-i18n');
  });

  test.beforeEach(async () => {
    await page.goto('/user/payment');
  });

  for (const { code, label } of LOCALES) {
    test(`empty Saved Cards state is translated for ${code} (${label})`, async () => {
      if (currentLabel === null) {
        currentLabel = await detectCurrentLanguage(page, LOCALES, headingTextByCode);
      }
      await switchLanguage(page, currentLabel, label, t('save_cards_title', code));
      currentLabel = label;

      await expect(page.getByText(t('empty_card_title', code), { exact: true })).toBeVisible();
      await expect(page.getByText(t('empty_card_description', code), { exact: true })).toBeVisible();
    });
  }
});

// .serial + ใช้ page เดียวร่วมกันทุกเทสต์ — ดูคำอธิบายแบบละเอียดกว่านี้ใน block
// ของ delete-dialog ด้านบน (storageState.json เป็นภาพสถานะ ณ ช่วงเวลาหนึ่ง และ
// การสลับภาษาเองก็มี state ในตัว เทสต์จึงต้องรันเรียงลำดับกันบน page เดียวที่
// อัปเดตต่อเนื่อง)
test.describe.serial('Saved Cards page — set-as-default confirmation dialog translations', () => {
  let page: Page;
  let context: BrowserContext | null;
  let currentLabel: string | null = null;

  test.beforeAll(async ({ browser }) => {
    ({ page, context } = await createSharedPage(browser, { storageState: 'storageState.json' }));
  });

  test.afterAll(async () => {
    await closeSharedPage(page, context, 'set-default-dialog-i18n');
  });

  test.beforeEach(async () => {
    await page.goto('/user/payment');
  });

  for (const { code, label } of LOCALES) {
    test(`set-as-default confirmation dialog is translated for ${code} (${label})`, async () => {
      if (currentLabel === null) {
        currentLabel = await detectCurrentLanguage(page, LOCALES, headingTextByCode);
      }
      await switchLanguage(page, currentLabel, label, t('save_cards_title', code));
      currentLabel = label;

      // เปิดเมนู "⋮" ที่แถวบัตรที่บันทึกไว้แถวที่สอง (index 1) — แถวแรก
      // (index 0) เป็นบัตร default อยู่แล้ว เมนูของมันจึงไม่มีตัวเลือก "Set as
      // default" ทั้งปุ่ม more ของแถวและ menu item มี id ที่ตายตัว (ยืนยันจาก
      // การเปิดดู DOM ที่ render จริง) ต่างจาก heuristic เดาตำแหน่งแถวแบบเดิม
      // ของ flow การลบ
      await page.locator('#card-action-more-1').click();
      await page.locator('#action-set-default-card').click();

      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      await expect(
        dialog.getByText(t('dialog_confirm_set_default_title', code), { exact: true })
      ).toBeVisible();
      await expect(
        dialog.getByText(t('dialog_confirm_set_default_description', code), { exact: true })
      ).toBeVisible();
      await expect(
        dialog.getByText(t('dialog_confirm_button', code), { exact: true })
      ).toBeVisible();

      // กด Cancel ออกมา — เทสต์นี้ต้อง**ไม่เปลี่ยนบัตร default จริง**
      await dialog
        .getByText(t('dialog_confirm_cancel_button', code), { exact: true })
        .click();
      await expect(dialog).not.toBeVisible();
    });
  }

  // TODO: ยังไม่ครอบคลุม — การกดยืนยัน set-as-default จริง (ไม่ใช่แค่กด
  // cancel) แล้วเช็คคำแปลของ toast ข้อความสำเร็จหลังยืนยัน
  // (default_card_updated) ต้องวางแผนเรื่องข้อมูลบัตรทดสอบที่ใช้แล้วทิ้งได้
  // ก่อน: ถ้ายืนยันจริงจะไปเปลี่ยนว่าบัตรใบไหนใน 3 ใบของบัญชีเป็น default ซึ่ง
  // ทุก block อื่นในชุดนี้ตั้งสมมติฐานอิงกับการจัด default/expired ของบัตรแบบ
  // ปัจจุบันอยู่
});
