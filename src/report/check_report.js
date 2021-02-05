"use strict";

const reportConfig = require('./report_config.json');
const path = require('path');
const fs = require('fs');
const settings = require('../../config.json');
const { devices } = require('playwright-chromium');

const fsPromises = fs.promises;

/**
 * Find if there's completed test report
 * @param {String} test, returned from getNewResults()
 * @param {Object} filesList, returned from getNewResults()
 * @param {Object} report, report object with corresponding workload, device info, path if exists, else null
 */
async function findReport(test, filesList) {
  const report = {};
  const channel = test.split('-')[0];
  const expectedDevices = reportConfig['channels'][channel]['devices'];
  // Tests under ignoreList will be ignored
  const ignoreList = reportConfig['channels'][channel]['ignore_list'];
  // Loop through a report's test devices
  for (let expectedDevice of expectedDevices) {
    const expectedWorkloads = reportConfig['channels'][channel]['workloads'];
    report[expectedDevice] = {};
    report[expectedDevice]['workloads'] = {};
    // Find a workload's all expected device results
    for (let expectedWorkload of expectedWorkloads) {
      // Check ingore test in ignore_list
      let ignoreFinding = false;
      if (ignoreList.length > 0) {
        for (let ignoreTest of ignoreList) {
          if (Object.keys(ignoreTest).includes(expectedDevice)) {
            for (let key in ignoreTest) {
              if (ignoreTest[key].includes(expectedWorkload)) {
                console.log(`Ignore test for ${expectedDevice}: ${expectedWorkload}`);
                ignoreFinding = true;
              }
            }
          }
        }
      }
      // Ignore test
      if (ignoreFinding) {
        continue;
      }
      const expectedFileName = expectedDevice + "_Chrome-" + test;
      const existingFileNames = filesList[expectedWorkload];
      if (existingFileNames.length == 0)
        return Promise.resolve(null);
      let filePaths = [];
      for (let existingFileName of existingFileNames) {
        if (existingFileName.includes(expectedFileName)) {
          const workloadPath = path.join(filesList.workloadDir, expectedWorkload, existingFileName);
          filePaths.push(workloadPath);
        }
      }
      if (filePaths.length == 0) {
        console.warn(`WARNING: not found expected ${expectedDevice} ${test} in ${expectedWorkload} folder`);
        return Promise.resolve(null);
      } else if (filePaths.length == 1) {
        report[expectedDevice]['workloads'][expectedWorkload] = filePaths[0];
        const rawData = await fsPromises.readFile(filePaths[0], 'utf-8');
        const deviceInfo = JSON.parse(rawData).device_info;
        report[expectedDevice]['device_info'] = deviceInfo;
      } else {
        console.log(`WARNING: exists duplicated test files: ${filePaths}`);
        return Promise.resolve(null);
      }
    }
  }
  console.log(`Found report:`);
  console.log(report);
  return Promise.resolve(report);
}


/**
 * Traverse all the result files under new-results folder
 * @param {String}, dir of test platform
 * @Return {Object}, object with files list and tests list
 */
async function getNewResults(platformDir) {
  if (!fs.existsSync(platformDir)) {
    return Promise.reject(`Error: no such dir: ${platformDir}`);
  }
  let workloadNames = await fsPromises.readdir(platformDir);
  // testsList: list of unique test info filter from exiting files
  // and which are presented as a concatenate string. e.g. "Canary-87.0.4260.0"
  let testsList = [];
  let filesList = {};
  filesList['workloadDir'] = platformDir;
  for (let workloadName of workloadNames) {
    const workloadDir = path.join(platformDir, workloadName);
    let workloadFiles = await fsPromises.readdir(workloadDir);
    filesList[workloadName] = workloadFiles;
    if (workloadFiles.length > 0) {
      for (let workloadFile of workloadFiles) {
        if (workloadFile.includes('Chrome-')) {
          testsList.push(workloadFile.split('Chrome-')[1].split('.json')[0]);
        }
      }
    }
  }
  // Make testsList only contains unique members.
  testsList = [...new Set(testsList)];

  return Promise.resolve({'filesList': filesList, 'testsList': testsList});
}

/**
 * Move send report files to old-results folder
 * @param {Object}, avaliableReport
 * @param {String}, platform
 */
async function moveReportFiles(avaliableReport, platform, tempDir = 'old-results') {
  const newResultsDir = path.join(settings.result_server.reportDir, tempDir, platform);
  for (let key in avaliableReport) {
    const workloadPaths = avaliableReport[key]['workloads'];
    for (let workloadName in workloadPaths) {
      const oldResultPath = workloadPaths[workloadName];
      const oldResultFile = path.basename(oldResultPath);
      const newResultPath = path.join(newResultsDir, workloadName, oldResultFile);
      await fsPromises.rename(oldResultPath, newResultPath);
    }
  }
}

/**
 * Check if there're available test results for delivering one round test report
 * @param {String}, testResultsDir, path of new test results
 * @returns {Object}, availableReports, objects array with test info, workload names and their paths of workload results
 */
async function checkAvailableReports(testResultsDir) {
  const platforms = reportConfig.platforms;
  const channels = Object.keys(reportConfig.channels);
  let availaleReports = [];
  for (let platform of platforms) {
    const platformDir = path.join(testResultsDir, platform);
    const {filesList, testsList} = await getNewResults(platformDir);
    if (testsList.length > 0) {
      for (let test of testsList) {
        const channel = test.split('-')[0];
        if (channels.includes(channel)) {
          console.log(`LOG: Start looking for test report: ${platform} Chrome ${test}`);
          // Find if there're completed test report
          let report = await findReport(test, filesList);
          if (report) {
            let result = {};
            result['report'] = report;
            result['platform'] = platform;
            result['browser'] = 'Chrome-' + test;
            availaleReports.push(result);
          }
        } else {
          console.log(`WARNING: unknown ${platform} browser channel: ${test}`);
        }
      }
    } else {
      console.log(`WARNING: Empty test file folders for platform ${platform}`);
    }
  }

  return Promise.resolve(availaleReports);
}

/**
 * Check all the test results for delivering one round test report in old-results
 * @param {String} channel browser channel in {Stable, Beta, Dev, Canary}, the first letter must be capitalized
 * @param {String} version browser version, e.g. 88.0.4324.146
 * @param {String} platform test platform, default is Windows
 */
async function checkReviewReports(channel, version, platform) {
  const oldResultsDir = path.join(settings.result_server.reportDir, 'old-results', platform);
  // const oldResultsDir = path.join(settings.result_server.reportDir, 'new-results-bak', platform);
  let reviewReports = {};
  const {filesList, testsList} = await getNewResults(oldResultsDir);
  const test = channel + '-' + version
  const channels = Object.keys(reportConfig.channels);
  if (channels.includes(channel)) {
      console.log(`LOG: Start looking for test report: ${platform} Chrome ${test}`);
      // Find if there're completed test report
      let report = await findReport(test, filesList);
      if (report) {
        reviewReports['report'] = report;
        reviewReports['platform'] = platform;
        reviewReports['browser'] = 'Chrome-' + test;
      }
    } else {
      console.log(`WARNING: unknown ${platform} browser channel: ${test}`);
    }
  return Promise.resolve(reviewReports);
}

module.exports = {
  checkAvailableReports: checkAvailableReports,
  moveReportFiles: moveReportFiles,
  checkReviewReports: checkReviewReports
};