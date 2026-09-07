import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Guards against silent vacuity: OpenROAD exits 0 and prints completion
 * markers even when link_design failed and `write_def` persisted nothing.
 * Every DEF-writing tool must call this before reporting success.
 */
export function assertDefWritten(cwd: string | undefined, defFile: string): string | null {
  const base = path.resolve(cwd || process.cwd());
  const abs = path.isAbsolute(defFile) ? defFile : path.join(base, defFile);
  try {
    const st = fs.statSync(abs);
    if (st.size === 0) {
      return `DEF artifact ${defFile} is empty; the design likely failed to link (check read_verilog errors above).`;
    }
    return null;
  } catch {
    return `DEF artifact ${defFile} was not written; the design likely failed to link (check read_verilog errors above).`;
  }
}
