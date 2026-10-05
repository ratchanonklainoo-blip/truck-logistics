// ให้ Node (22.18+/24) รันไฟล์ใน src/lib ได้ตรงๆ: แปลง '@/x' → src/x และเติม .ts ให้ import แบบไม่มีนามสกุล
// ใช้: node --import ./scripts/ts-hooks.mjs scripts/<test>.mts
import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');

registerHooks({
  resolve(specifier, context, next) {
    let base = null;
    if (specifier.startsWith('@/')) base = path.join(SRC, specifier.slice(2));
    else if ((specifier.startsWith('./') || specifier.startsWith('../')) && context.parentURL?.startsWith('file:')
             && !path.extname(specifier)) {
      base = path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier);
    }
    if (base) {
      for (const cand of [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')]) {
        if (existsSync(cand) && path.extname(cand)) return next(pathToFileURL(cand).href, context);
      }
    }
    return next(specifier, context);
  },
});
