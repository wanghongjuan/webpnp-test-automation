const settings = require('../../config.json');
const platformBrowser = require('../browser.js');
const { chromium } = require('playwright-chromium');
const path = require('path');
const fs = require('fs');

async function runTensorflowTest(workload, flags) {
  let args = ["--start-maximized"];
  if(workload.name === "TensorFlow_Simd"){
    let simdFlag = "--enable-feature=WebAssemblySimd,WebAssemblyThreads";
    flags.push(simdFlag);
  }
  if (flags !== undefined) {
    args = args.concat(flags);
  }
  platformBrowser.configChromePath(settings);
  console.log(`********** Start running ${workload.name} tests **********`);
  const userDataDir = path.join(process.cwd(), 'userData');
  if (fs.existsSync(userDataDir)) {
    fs.rmdirSync(userDataDir, { recursive: true });
  }
  fs.mkdirSync(userDataDir);
  const browser = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    executablePath: settings.chrome_path,
    viewport: null,
    ignoreHTTPSErrors: true,
    args: args
  });
  const page = await browser.newPage();
  console.log(`********** Going to URL: ${workload.url} **********`);
  browser.setDefaultNavigationTimeout( 3 * 60 * 1000 );
  await page.goto(workload.url, { waitUntil: "networkidle" });
  if (workload.name === "TensorFlow_WebGL") {
    const backendSelect = await page.$('#gui > ul > li:nth-child(3) > div > ul > li.cr.string > div > div > select');
    await backendSelect.type('webgl', {delay: 100});
  }
  await page.waitForTimeout(3 * 1000);
  console.log(`********** Running ${workload.name} tests... **********`);
  // A quick rule-of-thumb is to count the number of await's or then's
  // happening in your code and if there's more than one then you're
  // probably better off running the code inside a page.evaluate call.
  // The reason here is that all async actions have to go back-and-forth
  // between Node's runtime and the browser's, which means all the JSON
  // serialization and deserializiation. While it's not a huge amount of
  // parsing (since it's all backed by WebSockets) it still is taking up
  // time that could better be spent doing something else.
  await page.evaluate(async () => {
    const runButton = document.querySelector('#gui > ul > li:nth-child(4) > div > span');
    runButton.click();
    await new Promise(resolve => setTimeout(resolve, 30 * 1000));
  });
  // Waits for result elements
  await page.waitForSelector('#timings > tbody > tr:nth-child(8) > td:nth-child(2)', { timeout: 10 * 60 * 1000 });
  console.log(`********** Running ${workload.name} tests completed **********`);

  const scoreElem = await page.$('#timings > tbody > tr:nth-child(8) > td:nth-child(2)');
  const score = await scoreElem.evaluate(element => element.textContent);
  let scores = {};
  console.log(`********** ${workload.name} tests score: **********`);
  console.log(`********** ${score}  **********`);
  scores['Total Score'] = score;

  const resultBody = await page.$('#timings > tbody');
  const resultLength = await resultBody.evaluate(element => element.rows.length);
  for (let i = 1; i < resultLength; i ++) {
    let typeSelector = `#timings > tbody > tr:nth-child(${i}) > td:nth-child(1)`;
    let valueSelector = `#timings > tbody > tr:nth-child(${i}) > td:nth-child(2)`;
    const typeElem = await page.$(typeSelector);
    const valueElem = await page.$(valueSelector);
    const type = await typeElem.evaluate(element => element.innerText);
    const value = await valueElem.evaluate(element => element.innerText);
    scores[type] = value;
  }

  console.log('********** Detailed scores: **********');
  console.log(scores);

  await browser.close();

  flags.pop();

  return Promise.resolve({
    date: Date(),
    scores: scores
  });
}

module.exports = runTensorflowTest;
