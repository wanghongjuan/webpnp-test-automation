"use strict";

const path = require('path');
const fs = require('fs');
const fsPromises = fs.promises;
const cron = require('node-cron');
const settings = require('./config.json');
const bisect = require('./src/bisect.js');
const runSingleReport = require('./src/run_single_report.js');

// async function runMultiConfigs() {
//   const configDir = path.join(process.cwd(), 'configs');
//   const originConfigPath = path.join(process.cwd(), "config.json");
//   if (!fs.existsSync(configDir)) {
//     execSync('node main.js', {stdio: 'inherit'});
//   } else {
//     const configPaths = await fsPromises.readdir(configDir);
//     console.log(configPaths);
//     if (configPaths.length === 0) {
//       execSync('node main.js', {stdio: 'inherit'});
//     } else {
//       for (let configPath of configPaths) {
//         await fsPromises.copyFile(path.join(configDir, configPath), originConfigPath);
//         execSync('node main.js', {stdio: 'inherit'});
//       }
//     }
//   }
// }

async function main(multiRun) {
  const enableChromiumBuild = settings["chromium_builder"]["enable_chromium_build"];
  const useBisect = settings["chromium_builder"]["bisect"]["use_bisect"];
  if (!multiRun) {
    if (enableChromiumBuild && useBisect) {
      // Start bisect
      await bisect.startBisect();
    } else {
      await runSingleReport();
    }
  } else { // Run multiple config.json
    const configDir = path.join(process.cwd(), 'configs');
    const originConfigPath = path.join(process.cwd(), "config.json");
    if (!fs.existsSync(configDir)) {
      return Promise.reject('Not found configs folder!');
    }
    const configPaths = await fsPromises.readdir(configDir);
    console.log(configPaths);
    if (configPaths.length === 0) {
      return Promise.reject('Empty configs folder!');
    } else {
      for (let configPath of configPaths) {
        await fsPromises.copyFile(path.join(configDir, configPath), originConfigPath);
        await runSingleReport();
      }
    }
  }
}

function isMultiRun() {
  // e.g. node main.js multi
  const myArgs = process.argv.slice(2);
  console.log('myArgs: ', myArgs);
  if (myArgs.length > 0) {
    if (myArgs.includes("multi"))
      return true;
    else
      throw new Error("Incorrect argument, only accept 'multi'");
  }
  return false;
}

const useCron = false;
const sched = "0 0 0 * * Sat";
const multiRun = isMultiRun();
if (useCron) {
  cron.schedule(sched, () => {
    main(multiRun);
  });
} else {
  main(multiRun);
}
