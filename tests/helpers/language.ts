import { Page } from '@playwright/test';

/**
 * สลับภาษา UI ของเว็บผ่านตัวเลือกภาษาที่ header แล้วเช็คซ้ำว่าเปลี่ยนจริง
 *
 * ยืนยันด้วยมือแล้วที่ https://dev.ticketmelon.com/user/payment:
 *  - มีปุ่มที่ header แสดงชื่อภาษาปัจจุบัน (เช่น "English", "ไทย", "Melayu")
 *    คู่กับไอคอนลูกโลก
 *  - กดแล้วจะเปิด dropdown ที่มี entry role="menuitem" ครบทั้ง 9 ภาษา เรียง
 *    ลำดับเดิมเสมอ และแต่ละภาษาใช้ชื่อของตัวเองเสมอ (คือ label พวกนี้ไม่เปลี่ยน
 *    ตามภาษา UI ปัจจุบัน — "ไทย" จะเขียนว่า "ไทย" เสมอไม่ว่าภาษา UI ตอนนั้นจะเป็นอะไร)
 *
 * เพราะแบบนี้ `currentLabel` ต้องให้ฝั่งที่เรียกใช้เป็นคนติดตามเอง (อ่านจาก
 * CSV/locale code ไม่ได้ — มันคือ *label ที่แสดงผล* ไม่ใช่ key)
 *
 * `expectedHeadingText` คือหัวข้อ "Saved Cards" ของหน้า (`#header-text-payment`)
 * ที่แปลเป็นภาษาของ targetLabel แล้ว — ส่ง `t('save_cards_title', targetCode)`
 * เข้ามา ฟังก์ชันเวอร์ชันก่อนหน้านี้เช็คการสลับภาษาด้วยการรอให้ *ปุ่ม* ที่ header
 * เปลี่ยน label เป็น targetLabel ซึ่งพบว่ายังเกิด false positive ได้ (คลิกไปแล้ว
 * ไม่มีผลอะไรเห็นได้ชัด แต่ดันมีอะไรบางอย่างบนหน้าที่ match ชื่อปุ่มพอดี) ทำให้
 * ขั้นตอนถัดไปทำงานต่อบนหน้าที่จริงๆ แล้วยังไม่ได้สลับภาษาแบบเงียบๆ การเช็คจาก
 * ข้อความจริงที่ render บน heading เทียบกับข้อมูลคำแปลของเราเอง ถือเป็นความจริง
 * ที่ไม่กำกวมกว่า
 */
export async function switchLanguage(
  page: Page,
  currentLabel: string,
  targetLabel: string,
  expectedHeadingText: string,
  attempts = 3
): Promise<void> {
  if (currentLabel === targetLabel) return;

  for (let attempt = 0; attempt < attempts; attempt++) {
    await page.getByRole('button', { name: currentLabel, exact: true }).click();
    await page.getByRole('menuitem', { name: targetLabel, exact: true }).click();

    const confirmed = await page
      .locator('#header-text-payment')
      .filter({ hasText: expectedHeadingText })
      .waitFor({ state: 'visible', timeout: 8_000 })
      .then(() => true)
      .catch(() => false);
    if (confirmed) return;
  }

  throw new Error(
    `switchLanguage: failed to switch from "${currentLabel}" to "${targetLabel}" after ${attempts} attempts — ` +
      `#header-text-payment never showed "${expectedHeadingText}".`
  );
}

/**
 * ตรวจจับ label ปัจจุบันของตัวเลือกภาษาที่ header โดยอ่านหัวข้อ "Saved Cards"
 * ของหน้า (`#header-text-payment`) แล้วจับคู่ข้อความกับ `headingTextByCode`
 * (สร้างด้วย
 * `Object.fromEntries(LOCALES.map(l => [l.code, t('save_cards_title', l.code)]))`)
 *
 * เว็บนี้จำภาษาที่เลือกไว้ระดับบัญชี (เก็บฝั่ง server ไม่ใช่ browser storage — ดู
 * NOTE เรื่อง LOCALES ใน utils/i18n.ts) ดังนั้นการรันเทสต์ใหม่แต่ละครั้งอาจเจอ
 * ภาษาที่ session ก่อนหน้าทิ้งไว้ให้บัญชีนั้นก็ได้ switchLanguage() ต้องรู้ label
 * ปัจจุบัน *ตัวจริง* (ไม่ใช่สมมติเอาว่าเป็น "English") ไม่งั้นจะไปกดปุ่ม header
 * ผิดตัว แล้วการค้นหาคำแปลในขั้นตอนถัดๆ ไปจะ timeout หมด
 *
 * เวอร์ชันก่อนหน้านี้เคยลองเดาค่านี้จาก getByRole('button', { name }) ที่ match
 * ได้ และจาก document.documentElement.lang — ทั้งคู่เกิด false positive เป็น
 * บางครั้ง (มีอะไรบางอย่างบนหน้าที่ match ได้ทั้งที่ภาษาที่ render จริงเป็นคนละภาษา)
 * ทำให้ขั้นตอนถัดไปไปค้นหาข้อความของภาษาหนึ่ง บนหน้าที่จริงๆ แสดงอีกภาษาอยู่
 * ข้อความจริงที่ render บน heading เทียบกับข้อมูล CSV คำแปลของเราเอง ไม่กำกวม:
 * มันคือความจริงชุดเดียวกับที่ assertion อื่นๆ ในเทสต์พวกนี้อ้างอิงอยู่แล้ว
 */
export async function detectCurrentLanguage(
  page: Page,
  locales: { code: string; label: string }[],
  headingTextByCode: Record<string, string>
): Promise<string> {
  const currentHeading = (await page.locator('#header-text-payment').textContent())?.trim() ?? '';
  const code = Object.entries(headingTextByCode).find(([, text]) => text === currentHeading)?.[0];
  const match = locales.find((l) => l.code === code);
  if (!match) {
    throw new Error(
      `Could not detect current UI language: #header-text-payment text "${currentHeading}" did not match any ` +
        `known translation.`
    );
  }
  return match.label;
}

/**
 * ห่อ detectCurrentLanguage + switchLanguage เป็น stateful helper ตัวเดียว —
 * ตัวเรียกใช้ไม่ต้องประกาศ/จัดการตัวแปร `currentLabel` เอง และไม่ต้องเขียน
 * pattern "detect ครั้งแรก แล้วค่อย switch" ซ้ำในทุกเทสต์ (ตัว tracker จำ label
 * ปัจจุบันไว้ให้เอง อัปเดตให้เองทุกครั้งที่ switchTo สำเร็จ)
 */
export function createLanguageTracker(
  page: Page,
  locales: { code: string; label: string }[],
  headingTextByCode: Record<string, string>
) {
  let currentLabel: string | null = null;

  return {
    async switchTo(targetLabel: string, expectedHeadingText: string): Promise<void> {
      if (currentLabel === null) {
        currentLabel = await detectCurrentLanguage(page, locales, headingTextByCode);
      }
      await switchLanguage(page, currentLabel, targetLabel, expectedHeadingText);
      currentLabel = targetLabel;
    },
  };
}
