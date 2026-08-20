import fs from 'node:fs';
import { parse } from 'csv-parse/sync';

export type LocaleCode =
  | 'en-US'
  | 'th'
  | 'vi'
  | 'zh-CN'
  | 'id'
  | 'ms-MY'
  | 'ko-KR'
  | 'ja-JP'
  | 'zh-HK';

/**
 * label ที่แสดงในตัวเลือกภาษาแบบ dropdown ของเว็บ (header มุมขวาบน ไอคอน
 * ลูกโลก) เรียงลำดับตรงกับที่ปรากฏใน dropdown menu จริง — ยืนยันด้วยการคลิกไล่
 * ดู dropdown ด้วยมือที่ https://dev.ticketmelon.com/user/payment
 *
 * หมายเหตุ: การ navigate ไปที่ URL แบบมี locale นำหน้าตรงๆ (เช่น
 * https://dev.ticketmelon.com/ms-MY/user/payment) **ใช้ไม่ได้ผลแน่นอน** —
 * ตอนทดสอบด้วยมือ แอปจะ redirect กลับไปที่ภาษาที่เลือกไว้ล่าสุดผ่าน UI เสมอ
 * (ค่านี้ดูเหมือนจะเก็บไว้ระดับบัญชีหรือใน cookie โดยไม่ขึ้นกับ URL ที่ขอไป)
 * ต้องสลับภาษาด้วยการคลิกผ่าน dropdown เสมอ (ดู switchLanguage ในไฟล์เทสต์)
 * ห้ามสร้าง URL เอาเอง
 */
export const LOCALES: { code: LocaleCode; label: string }[] = [
  { code: 'en-US', label: 'English' },
  { code: 'th', label: 'ไทย' },
  { code: 'zh-CN', label: '中文' },
  { code: 'ms-MY', label: 'Melayu' },
  { code: 'vi', label: 'Tiếng Việt' },
  { code: 'id', label: 'Indonesia' },
  { code: 'ko-KR', label: '한국어' },
  { code: 'ja-JP', label: '日本語' },
  { code: 'zh-HK', label: '繁體中文' },
];

export type TranslationRow = Record<LocaleCode, string> & { key: string };

/**
 * แปลงไฟล์ CSV ที่ export มา ("Key-FE,en-US,th,vi,zh-CN,id,ms-MY,ko-KR,ja-JP,zh-HK")
 * ให้เป็น array ของแถว โดย key แต่ละแถวคือ locale code
 */
export function loadTranslations(csvPath: string): TranslationRow[] {
  const raw = fs.readFileSync(csvPath, 'utf-8');
  const records: string[][] = parse(raw, {
    relax_column_count: true,
    skip_empty_lines: true,
  });

  const header = records[0];
  const rows = records.slice(1);

  return rows
    .filter((r) => r.some((cell) => cell && cell.trim() !== ''))
    .map((r) => {
      const row: Record<string, string> = {};
      header.forEach((col, idx) => {
        const value = r[idx] ?? '';
        row[idx === 0 ? 'key' : col] = value;
      });
      return row as TranslationRow;
    });
}

export function findByKey(rows: TranslationRow[], key: string): TranslationRow | undefined {
  return rows.find((r) => r.key === key);
}

/**
 * สร้างฟังก์ชันช่วย `t(key, locale)` ที่ผูกกับตารางคำแปลที่โหลดไว้แล้ว จะ throw
 * error ทันที (ตอน setup เทสต์ ไม่ใช่ไปโผล่ลึกๆ ข้างใน assertion) ถ้า key นั้น
 * ไม่มีใน CSV หรือ column ของ locale นั้นว่างเปล่าสำหรับ key นั้น — ช่วยจับ
 * ข้อผิดพลาดในการพิมพ์ CSV ได้ทันที แทนที่จะไปโผล่เป็น Playwright error แบบ
 * "element not visible" ที่งงว่าเกิดจากอะไร
 */
export function createTranslator(rows: TranslationRow[]) {
  return function t(key: string, locale: LocaleCode): string {
    const row = findByKey(rows, key);
    if (!row) throw new Error(`Missing translation key in CSV: "${key}"`);
    const value = row[locale];
    if (!value) throw new Error(`Missing "${locale}" value for key "${key}" in CSV`);
    return value;
  };
}
