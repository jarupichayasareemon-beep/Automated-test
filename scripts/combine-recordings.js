// เอาวิดีโอของแต่ละไฟล์ใน recordings/ (สร้างโดย npm run test:record) มาต่อกัน
// เป็น all-tests-combined.webm ไฟล์เดียว จะได้แนบขึ้น Jira ได้ไฟล์เดียว แทนที่
// จะต้องแนบทีละไฟล์ต่อ spec file ต้องมี ffmpeg อยู่ใน PATH (brew install
// ffmpeg)
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const recordingsDir = path.join(__dirname, '..', 'recordings');

// เอา flow ล็อกอินไว้ก่อน ตามด้วยวิดีโอของแต่ละฟีเจอร์ เรียงตามลำดับที่ดูแล้วเข้าใจง่าย
const order = [
  'auth-setup-ts-authenticate.webm',
  'saved-cards-i18n.webm',
  'delete-dialog-i18n.webm',
  'set-default-dialog-i18n.webm',
  'empty-cards-i18n.webm',
];

const files = order.filter((name) => fs.existsSync(path.join(recordingsDir, name)));
if (files.length === 0) {
  console.error('No recordings found in recordings/ — run `npm run test:record` first.');
  process.exit(1);
}

const listPath = path.join(recordingsDir, '.concat-list.txt');
fs.writeFileSync(listPath, files.map((name) => `file '${name}'`).join('\n'));

const outputPath = path.join(recordingsDir, 'all-tests-combined.webm');
try {
  execFileSync(
    'ffmpeg',
    ['-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-c', 'copy', outputPath],
    { stdio: 'inherit' }
  );
} catch (err) {
  if (err.code === 'ENOENT') {
    console.error('ffmpeg not found on PATH. Install it with `brew install ffmpeg` and try again.');
    process.exit(1);
  }
  throw err;
} finally {
  fs.unlinkSync(listPath);
}

console.log(`Combined ${files.length} recording(s) into ${outputPath}`);
