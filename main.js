"use strict";

const path = require('path');
const fs = require('fs');
const fsPromises = fs.promises;
const cron = require('node-cron');
const { execSync } = require('child_process');
const settings = require('./config.json');
const bisect = require('./src/bisect.js');
const runSingleReport = require('./src/run_single_report.js');
const getChromiumBuild = require('./src/get_chromium_build.js');

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
      // Run boundary commit ids first
      const baseCommit = settings["chromium_builder"]["bisect"]["commits"]["base_commit"];
      const comparedCommit = settings["chromium_builder"]["bisect"]["commits"]["compared_commit"];
      await bisect.checkBisectAvailability(baseCommit, comparedCommit);
      await bisect.updateConfig(baseCommit.id);
      const baseResultPath = await runSingleReport();
      const baseResult = await bisect.getTestScore(baseResultPath);
      await bisect.updateConfig(comparedCommit.id);
      const comparedResultPath = await runSingleReport();
      const comparedResult = await bisect.getTestScore(comparedResultPath);
      let baseCommitNum = baseCommit.number;
      let comparedCommitNum = comparedCommit.number;

      // Run median commit
      const commitLogs = await getChromiumBuild.remoteExecCommand('', 'log', baseCommitNum, comparedCommitNum);
      const regRatio = baseResult / comparedResult - 1;
      console.log('Regression ratio of bisect boundary is: ', regRatio);
      if (Math.abs(regRatio) < 0.01) {
        return Promise.reject(`The regression ratio is less than 1%, this tool could not precisely find the root cause commit.`);
      }
      let medianCommitNum = Math.round((baseCommitNum + comparedCommitNum) / 2);
      const oneThirdDValue = Math.abs(comparedResult - baseResult) / 3;
      // Bisect algorithm:
      // oneThirdDValue: abs(compareResult - basedResult)/3, accept as variance
      // - If medianResult is less than ( baseResult + oneThirdDValue), treats as no change to baseResult
      // - If medianResult is more than (comparedResult - oneThirdDValue), treats as no change to comparedResult
      // - Otherwise, throws as unexpected result
      let testResults = [];
      testResults.push({ "commitNum": baseCommitNum, "commitId": baseCommit.id, "totalScore": baseResult });
      testResults.push({ "commitNum": comparedCommitNum, "commitId": comparedCommit.id, "totalScore": comparedResult });
      while (medianCommitNum > baseCommitNum) {
        let medianCommitId = "";
        for (let key in commitLogs) {
          if (key === medianCommitNum.toString())
            medianCommitId = commitLogs[key];
        }
        await bisect.updateConfig(medianCommitId);
        let medianResultPath = await runSingleReport();
        console.log("Commit number: ", medianCommitNum);
        let medianResult = await bisect.getTestScore(medianResultPath);
        testResults.push({ "commitNum": medianCommitNum, "totalScore": medianResult });
        if (medianCommitNum == baseCommitNum + 1) {
          break;
        }
        if (medianResult <= (baseResult + oneThirdDValue)) {
          baseCommitNum = medianCommitNum;
        } else if (medianResult >= (comparedResult - oneThirdDValue)) {
          comparedCommitNum = medianCommitNum;
        } else {
          console.log("Bisect Results: ", testResults);
          return Promise.reject(`Median commit: ${medianCommitId}'s result: ${medianResult} \
            is in median of (baseResult: ${baseResult}, comparedResult: ${comparedResult}), which is not acceptable. Please check!`);
        }
        medianCommitNum = Math.round((baseCommitNum + comparedCommitNum) / 2);
      }
      console.log("Bisect Results: ", testResults);
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
