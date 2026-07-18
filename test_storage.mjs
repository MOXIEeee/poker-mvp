import { chromium } from 'playwright';
const browser = await chromium.launch();
const ctx = await browser.newContext();
const p1 = await ctx.newPage();
await p1.goto('http://localhost:3000/');
await p1.evaluate(() => sessionStorage.setItem('test', 'hello'));
const v1 = await p1.evaluate(() => sessionStorage.getItem('test'));
console.log('p1:', v1);

const p2 = await ctx.newPage();
await p2.goto('http://localhost:3000/');
const v2 = await p2.evaluate(() => sessionStorage.getItem('test'));
console.log('p2 (新 page, 同 ctx):', v2);

await browser.close();
