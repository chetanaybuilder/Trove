import fs from 'fs';
const text = fs.readFileSync('C:/Users/batra/.gemini/antigravity-ide/brain/8a606d9c-2cfa-49cd-8a19-7746ce419a22/.system_generated/steps/82/content.md', 'utf8');

// The model IDs are usually in monospace or code tags, or listed next to "Developer".
// Let's use regex to find common model IDs:
const regex = /(llama-[a-z0-9.-]+|mixtral-[a-z0-9.-]+|gemma-[a-z0-9.-]+|deepseek-[a-z0-9.-]+|qwen-[a-z0-9.-]+)/gi;
let m;
const ids = new Set();
while ((m = regex.exec(text)) !== null) {
  ids.add(m[1]);
}
console.log("Found Model IDs:", Array.from(ids));
