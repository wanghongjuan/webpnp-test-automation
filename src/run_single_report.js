"use strict";


const genDeviceInfo = require('./get_device_info.js');
const runTest = require('./run.js');
const genTestReport = require('./gen_single_report.js');
const sendMail = require('./send_mail.js');
const settings = require('../config.json');
const moment = require('moment');
const os = require('os');
const getChromiumBuild = require('./get_chromium_build.js');


const cpuModel = os.cpus()[0].model;
const platform = runTest.getPlatformName();

async function runSingleReport() {

  let now = moment();
  const weekAndDay = now.week() + '.' + now.day();

  let deviceInfo = {};
  let subject = "";
  try {
    // Clean up chart folder
    // await chart.cleanUpChartFiles();
    // Use private chroimum build if chromium build is enabled
    if (settings["chromium_builder"]["enable_chromium_build"]) {
      const commitId = settings["chromium_builder"]["commit_id"];
      if (commitId !== "") {
        subject = `Web PnP auto test report on ${platform} with commit id: ${commitId}`;
        await getChromiumBuild.getChromiumBuild(commitId);
      } else {
        throw Error("Commit id should be specific in config.json if you run with chromium build");
      }
    }

    deviceInfo = await genDeviceInfo();
    if (subject === "")
      subject = '[W' + weekAndDay + '] Web PnP auto test report - ' + platform + ' - ' + deviceInfo["CPU"]["info"] + ' - ' + deviceInfo.Browser;
    console.log("Subject: ", subject);

    const workloadResults = await runTest.genWorkloadsResults(deviceInfo);
    console.log(JSON.stringify(workloadResults, null, 4));
    let chartImages = [];

    let mailType = 'dev_notice';

    const testReports = await genTestReport(workloadResults);

    console.log(subject);
    await sendMail(subject, testReports, mailType, chartImages);
    return Promise.resolve(workloadResults);
  } catch (err) {
    console.log(err);
    let subject = '[W' + weekAndDay + '] Auto test failed on ' + platform + '-' + cpuModel;
    console.log(subject);
    await sendMail(subject, err, 'failure_notice');
    return Promise.resolve(null);
  }
}

module.exports = runSingleReport;