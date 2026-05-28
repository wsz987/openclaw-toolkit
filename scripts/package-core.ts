import { writeFile } from 'node:fs/promises';
import path from 'node:path';

const sidecarPath = path.resolve('apps/desktop/src-tauri/bin/openclaw-toolkit-core-x86_64-pc-windows-msvc.exe');

await writeFile(sidecarPath, 'placeholder: build packages/core into this sidecar path before tauri build.');
console.log(`sidecar placeholder written: ${sidecarPath}`);
