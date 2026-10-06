// scripts/check-design.js
const fs = require('fs');
const path = require('path');

const DIRS_TO_CHECK = ['app', 'components'];
const EXTENSIONS = ['.tsx', '.jsx', '.ts', '.js', '.css'];

// Emoji regex matching standard emojis
const EMOJI_REGEX = /[\u{1F300}-\u{1F5FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;

// Forbidden patterns
const FORBIDDEN_PATTERNS = [
  { regex: /bg-gradient/i, name: 'Degradados (bg-gradient)' },
  { regex: /linear-gradient/i, name: 'Degradados (linear-gradient)' },
  { regex: /from-[a-z]+-\d+/i, name: 'Degradados Tailwind (from-...)' },
  { regex: /to-[a-z]+-\d+/i, name: 'Degradados Tailwind (to-...)' },
  { regex: /shadow-(?:md|lg|xl|2xl)/i, name: 'Sombras grandes (shadow-md/lg/xl/2xl)' },
  { regex: /font-(?:serif|mono|display|comic)/i, name: 'Tipografía no autorizada (solo Geist Sans)' },
  { regex: /bg-(?:blue|indigo|purple|pink|cyan|violet|fuchsia|rose|orange)-(?:400|500|600|700)/i, name: 'Colores llamativos no autorizados' },
];

let errors = [];

function scanDir(dir) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== '.next') {
        scanDir(fullPath);
      }
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name);
      if (EXTENSIONS.includes(ext)) {
        checkFile(fullPath);
      }
    }
  }
}

function checkFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');

  lines.forEach((line, idx) => {
    // Skip comments or test files if in tests directory
    if (filePath.includes('.test.') || filePath.includes('__tests__')) return;

    // Check emoji
    if (EMOJI_REGEX.test(line)) {
      // Allow emoji if specifically in prompt seed/config data file or if commented out
      if (!filePath.includes('seed') && !line.trim().startsWith('//') && !line.trim().startsWith('*')) {
        errors.push(`${filePath}:${idx + 1} - Emoji encontrado en la interfaz`);
      }
    }

    // Check forbidden patterns
    for (const pat of FORBIDDEN_PATTERNS) {
      if (pat.regex.test(line)) {
        errors.push(`${filePath}:${idx + 1} - ${pat.name}`);
      }
    }
  });
}

DIRS_TO_CHECK.forEach(dir => scanDir(path.resolve(process.cwd(), dir)));

if (errors.length > 0) {
  console.error('❌ Fallos en la verificación de diseño (check:design):');
  errors.forEach(e => console.error('  - ' + e));
  process.exit(1);
} else {
  console.log('✅ Verificación de diseño completada con éxito (estilo sobrio, sin degradados, Geist Sans, sin emojis en UI).');
  process.exit(0);
}
