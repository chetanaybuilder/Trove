import fs from 'fs';
const text = fs.readFileSync('C:/Users/batra/.gemini/antigravity-ide/brain/8a606d9c-2cfa-49cd-8a19-7746ce419a22/.system_generated/steps/82/content.md', 'utf8');

// The Groq docs usually have a table for models. 
// Let's print out all words that look like model IDs (lowercase with hyphens and numbers)
// that appear in the text, and count their occurrences.
const regex = /\b([a-z0-9]+(?:-[a-z0-9]+)+)\b/g;
let m;
const counts = {};
while ((m = regex.exec(text)) !== null) {
  const id = m[1];
  // Filter out normal words
  if (id.includes('-') && /\d/.test(id)) {
    counts[id] = (counts[id] || 0) + 1;
  }
}

// Print top 20
const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 20);
console.log("Most frequent id-like strings:");
sorted.forEach(entry => console.log(entry[0], entry[1]));
