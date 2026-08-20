import { Locator, Page } from '@playwright/test';

/**
 * อีเว้นที่ใช้กับ tests/regression/*.spec.ts — "Normal + Promo + Addon +
 * Regisform + Donation + Shipping" ของ organizer qamtel (ดู .env.example
 * TESTPROD_EVENT_URL) ยืนยันจากการทดสอบจริง: ตัดเงินจริงถ้าตั๋วราคามากกว่า 0 THB
 */
export const TESTPROD_EVENT_URL = process.env.TESTPROD_EVENT_URL as string;

/**
 * id ของแต่ละ ticket type บนอีเว้น regression ยืนยันจากการเปิดดู DOM จริง
 * (#ticket-card-{id}) ไม่มีตัวไหนเป็น Sale Ended หรือ Sold Out เลย — อีเว้นนี้
 * ไม่มี fixture ให้ทั้งสองสถานะ ทำให้ TC_006/TC_007 ยังไม่มีอะไรให้ทดสอบด้วย
 * (ดู buyer-purchase-flow.spec.ts)
 */
export const TICKETS = {
  ticketA: { id: 'cd7d562df13411f0990801117567899b', name: 'Ticket A' },
  ticketB: { id: 'cd7d6c86f13411f0915501117567899b', name: 'Ticket B' },
  ticket1: { id: 'edb8080598a711f1922201117567899b', name: 'Ticket 1' },
  ticket3: { id: '0813796d98a811f1911101117567899b', name: 'Ticket 3' },
  ticket4: { id: '1b478e1898a811f1911101117567899b', name: 'Ticket 4' },
} as const;

/**
 * waitUntil: 'load' (ค่า default ของ goto) เจอว่าค้างเกิน 30 วินาทีซ้ำๆ เพราะ
 * script วิเคราะห์ข้อมูล (analytics) ที่หนักของเว็บนี้ — ยืนยันจากการทดสอบจริง
 * 'domcontentloaded' ช่วยเลี่ยงปัญหานี้ได้ แต่จะ fire ก่อนที่ SPA จะ render
 * เนื้อหาฝั่ง client เสร็จ เลยต้องรอเพิ่มอีกนิดก่อนจะไปเช็คเนื้อหา แทนที่จะเช็คทันที
 * (ยืนยันจากการทดสอบจริง: ถ้าไม่รอเพิ่ม assertion ถัดไปอาจมาถึงก่อนที่
 * #text-event-name ฯลฯ จะมีอยู่จริงด้วยซ้ำ)
 */
export async function gotoEventPage(page: Page): Promise<void> {
  await page.goto(TESTPROD_EVENT_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.locator('#text-event-name').first().waitFor({ state: 'visible', timeout: 15_000 });
}

/**
 * หลายๆ element บนหน้าเว็บนี้ render ซ้ำ 2 รอบ (เลย์เอาต์ desktop + mobile
 * สลับกันด้วย CSS) — ยืนยันจากการทดสอบจริงหลายจุด (event card, แถว Add-on,
 * ข้อความราคาตั๋ว) ว่าใช้แค่ .first() ไม่น่าเชื่อถือพอที่จะเลือกตัวที่
 * มองเห็นจริง/รับคลิกได้จริงใน viewport นั้นๆ ฟังก์ชันนี้ poll (เช็คซ้ำ) แทนที่จะ
 * เช็คครั้งเดียว เพราะ isVisible()/count() เช็คแค่ครั้งเดียวจะทำงานทันทีและ
 * ไม่รอให้หน้าเว็บ render เสร็จ ซึ่งเจอปัญหา race กับเนื้อหาหน้าเว็บมาแล้วมากกว่า
 * หนึ่งครั้ง แม้จะมีการรอ (settle wait) จากฝั่งผู้เรียกไว้ก่อนแล้วก็ตาม
 */
export async function firstVisible(locator: Locator, timeout = 15_000): Promise<Locator> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const count = await locator.count();
    for (let i = 0; i < count; i++) {
      if (await locator.nth(i).isVisible().catch(() => false)) {
        return locator.nth(i);
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`No visible match found for ${locator} within ${timeout}ms`);
}

export function ticketCard(page: Page, ticketId: string) {
  return page.locator(`#ticket-card-${ticketId}`);
}

export function ticketQuantity(page: Page, ticketId: string) {
  return page.locator(`#text-ticket-${ticketId}-quantity`);
}

export async function increaseQuantity(page: Page, ticketId: string, times = 1): Promise<void> {
  const card = ticketCard(page, ticketId);
  await card.scrollIntoViewIfNeeded();
  const plusButton = card.locator('.icon-plus').locator('..');
  for (let i = 0; i < times; i++) {
    await plusButton.click();
  }
}

export async function decreaseQuantity(page: Page, ticketId: string, times = 1): Promise<void> {
  const minusButton = ticketCard(page, ticketId).locator('.icon-minus').locator('..');
  for (let i = 0; i < times; i++) {
    await minusButton.click();
  }
}
