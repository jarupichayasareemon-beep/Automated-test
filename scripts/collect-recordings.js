// คัดลอกไฟล์วิดีโอที่แนบมากับแต่ละเทสต์ (สร้างโดย playwright.config.record.ts
// ซึ่งบังคับตั้ง video: 'on') ออกจาก path ดิบของ JSON reporter มาไว้ที่
// recordings/ ตั้งชื่อไฟล์ให้อ่านง่ายต่อเทสต์ — พร้อมแนบขึ้น Jira ทีละไฟล์ได้เลย
// แทนที่จะต้องไปงมหาในไฟล์ข้อมูล report ที่ตั้งชื่อด้วย hash
const fs = require('fs');
const path = require('path');

const recordingsDir = path.join(__dirname, '..', 'recordings');
const resultsPath = path.join(recordingsDir, 'results.json');
const data = JSON.parse(fs.readFileSync(resultsPath, 'utf-8'));

function sanitize(name) {
  return name
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 150);
}

let count = 0;

function walkSuite(suite, titlePath) {
  const nextPath = suite.title ? [...titlePath, suite.title] : titlePath;
  for (const spec of suite.specs || []) {
    for (const test of spec.tests || []) {
      for (const result of test.results || []) {
        for (const attachment of result.attachments || []) {
          if (attachment.name !== 'video' || !attachment.path) continue;
          const fileName = `${sanitize([...nextPath, spec.title].join('-'))}.webm`;
          fs.copyFileSync(attachment.path, path.join(recordingsDir, fileName));
          count++;
        }
      }
    }
  }
  for (const child of suite.suites || []) {
    walkSuite(child, nextPath);
  }
}

for (const suite of data.suites || []) {
  walkSuite(suite, []);
}

console.log(`Saved ${count} recording(s) to ${recordingsDir}`);
