const fs = require('fs');

fs.writeFileSync('.eslintrc.json', JSON.stringify({
  env: { browser: true, es2021: true, node: true },
  extends: ['eslint:recommended', 'plugin:react/recommended', 'plugin:react/jsx-runtime'],
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  plugins: ['react'],
  rules: { 'react/prop-types': 'off', 'no-unused-vars': 'warn' },
  settings: { react: { version: 'detect' } }
}, null, 2));

fs.writeFileSync('.prettierrc', JSON.stringify({
  printWidth: 100, singleQuote: false, semi: true, trailingComma: 'es5'
}, null, 2));

fs.writeFileSync('LICENSE', 'MIT License\n\nCopyright (c) 2026 Chetanay Batra\n\nPermission is hereby granted, free of charge, to any person obtaining a copy\nof this software and associated documentation files...');

fs.writeFileSync('CONTRIBUTING.md', '# Contributing to Trove\n\nWe love your input! We want to make contributing to this project as easy and transparent as possible.\n\n## Pull Requests\n1. Fork the repo and create your branch from `main`.\n2. If youve added code that should be tested, add tests.\n3. Ensure the test suite passes.\n4. Make sure your code lints.');

fs.writeFileSync('SECURITY.md', '# Security Policy\n\n## Supported Versions\n| Version | Supported          |\n| ------- | ------------------ |\n| 1.0.x   | :white_check_mark: |\n\n## Reporting a Vulnerability\nPlease report (suspected) security vulnerabilities to our email address or open a private advisory.');

fs.writeFileSync('CODE_OF_CONDUCT.md', '# Contributor Covenant Code of Conduct\n\n## Our Pledge\nWe as members, contributors, and leaders pledge to make participation in our community a harassment-free experience for everyone.');

fs.writeFileSync('.github/ISSUE_TEMPLATE/bug_report.md', '---\nname: Bug report\nabout: Create a report to help us improve\ntitle: ""\nlabels: bug\nassignees: ""\n---\n\n**Describe the bug**\nA clear and concise description of what the bug is.');

fs.writeFileSync('.github/PULL_REQUEST_TEMPLATE/pr_template.md', '## Description\n\nFixes # (issue)\n\n## Type of change\n- [ ] Bug fix\n- [ ] New feature');

fs.writeFileSync('docs/architecture.md', '# Trove Architecture\n\nTrove uses a React frontend and Node.js Express backend with PostgreSQL.\n\n## Data Flow\n1. Document Upload -> Client -> Server\n2. Express Rate Limit & Queue -> Pipeline -> LLM\n3. Server-Sent Events stream progress to Client\n4. Insights saved to PostgreSQL');

fs.writeFileSync('docs/api.md', '# API Reference\n\n## `POST /api/analyze`\nStarts a document analysis job.\n\n## `GET /api/reports/:id`\nFetches a specific report.');

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf-8'));
pkg.scripts.lint = 'eslint .';
pkg.scripts.format = 'prettier --write .';
pkg.scripts.start = 'node server/index.js';
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2));

console.log("Docs and configs generated.");
