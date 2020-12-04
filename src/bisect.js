const settings = require('../config.json');
const path = require('path');
const fs = require('fs');
const fsPromises = fs.promises;
const net = require('net');
const runSingleReport = require('./run_single_report.js');
const getChromiumBuild = require('./get_chromium_build.js');

/*
* Update commit_id in config.json
*/
async function updateConfig(commitId) {
  settings["chromium_builder"]["commit_id"] = commitId;
  await fs.promises.writeFile(
    path.join(process.cwd(), 'config.json'),
    JSON.stringify(settings, null, 4));
  return Promise.resolve();
}


async function checkBisectAvailability(baseCommit, comparedCommit) {
  if (settings['workloads'].length !== 1) {
    return Promise.reject('Bisect only support running one workload');
  }
  if (baseCommit["number"] > comparedCommit["number"]) {
    return Promise.reject("base_commit's number should be less than compared_commit's number");
  }
}

async function startBisect(baseCommit, comparedCommit) {
  const baseCommit = settings["chromium_builder"]["bisect"]["commits"]["base_commit"];
  const comparedCommit = settings["chromium_builder"]["bisect"]["commits"]["compared_commit"];
  let baseCommitNum = baseCommit.number;
  let comparedCommitNum = comparedCommit.number;

  console.log("Start Bisect....");
  await checkBisectAvailability(baseCommit, comparedCommit);

  // Run boundary commit ids first
  await updateConfig(baseCommit.id);
  console.log("Start running base commit...");
  const baseResultPath = await runSingleReport();
  const baseResult = await getTestScore(baseResultPath);

  await updateConfig(comparedCommit.id);
  console.log("Start running compared commit...");
  const comparedResultPath = await runSingleReport();
  const comparedResult = await getTestScore(comparedResultPath);


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
  testResults.push({ "baseCommitNum": baseCommitNum, "commitId": baseCommit.id, "totalScore": baseResult });
  testResults.push({ "comparedCommitNum": comparedCommitNum, "commitId": comparedCommit.id, "totalScore": comparedResult });
  while (medianCommitNum > baseCommitNum) {
    let medianCommitId = "";
    for (let key in commitLogs) {
      if (key === medianCommitNum.toString())
        medianCommitId = commitLogs[key];
    }
    await updateConfig(medianCommitId);
    let medianResultPath = await runSingleReport();
    console.log("Commit number: ", medianCommitNum);
    let medianResult = await getTestScore(medianResultPath);
    testResults.push({ "commitNum": medianCommitNum, "commitId": medianCommitId, "totalScore": medianResult });
    if (medianCommitNum == baseCommitNum + 1) {
      break;
    }
    if (medianResult <= (baseResult + oneThirdDValue)) {
      if (regRatio > 0)
        comparedCommitNum = medianCommitNum;
      else
        baseCommitNum = medianCommitNum;
    } else if (medianResult >= (comparedResult - oneThirdDValue)) {
      if (regRatio > 0)
        baseCommitNum = medianCommitNum;
      else
        comparedCommitNum = medianCommitNum;
    } else {
      console.log("Bisect Results: ", testResults);
      return Promise.reject(`Median commit: ${medianCommitId}'s result: ${medianResult} \
            is in median of (baseResult: ${baseResult}, comparedResult: ${comparedResult}), which is not acceptable. Please check!`);
    }
    medianCommitNum = Math.round((baseCommitNum + comparedCommitNum) / 2);
  }
  console.log("Bisect Results: ", testResults);

  return Promise.resolve();
}

async function getTestScore(resultPaths) {
  const resultPath = resultPaths[Object.keys(resultPaths)[0]];
  if (!fs.existsSync(resultPath)) {
    return Promise.reject(`Error: file: ${resultPath} does not exist!`);
  } else {
    const rawData = await fsPromises.readFile(resultPath, 'utf-8');
    basedResult = JSON.parse(rawData);
    const totalScore = basedResult['test_result']['Total Score'];
    const commitId = settings['chromium_builder']['commit_id'];
    console.log('Commit id: ', commitId, ' result: ', totalScore);
    return Promise.resolve(totalScore);
  }
}

module.exports = {
  startBisect: startBisect
}
