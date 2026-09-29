import fs from 'fs';
const text = fs.readFileSync('C:/Users/batra/.gemini/antigravity-ide/brain/8a606d9c-2cfa-49cd-8a19-7746ce419a22/.system_generated/steps/82/content.md', 'utf8');
const regex = /href="\/docs\/model\/([^"]+)"/g;
let m;
const models = new Set();
while ((m = regex.exec(text)) !== null) {
  models.add(m[1]);
}
console.log("Model links:", Array.from(models));
