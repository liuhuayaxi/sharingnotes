import { readFile, writeFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/dashboard-browser.js', import.meta.url), 'utf8');
const target = new URL('../src/views.js', import.meta.url);
const views = await readFile(target, 'utf8');
const marker = 'export const dashboardScript = ';
const index = views.lastIndexOf(marker);
if (index < 0) throw Error('Dashboard script marker is missing');
await writeFile(target, views.slice(0, index) + marker + JSON.stringify(source) + ';\n');
