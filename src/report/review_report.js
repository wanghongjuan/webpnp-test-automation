"use strict";
const checkReport = require('./check_report.js');

/**
 * Check all the test results for delivering one round test report in old-results
 * @param {String} channel browser channel in {Stable, Beta, Dev, Canary}, the first letter must be capitalized
 * @param {String} version browser version, e.g. 88.0.4324.146
 * @param {String} platform test platform, default is Windows
 */
async function main(channel, version, platform) {
    try {
        const reviewReport = await checkReport.checkReviewReports(channel, version, platform);
        console.log('>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>> reviewReport:');
        console.log(reviewReport);
        await checkReport.moveReportFiles(reviewReport.report, platform, 'new-results');
    } catch (err) {
        console.log(err);
        let subject = 'ERROR: must give 2 or 3 params(chrome channel name, chrome version and test platform which has a default value "Windows"), e.g. `node src/report/review_report.js Canary 90.0.4402.0`';
        console.log(subject);
    }
    return Promise.resolve();
}

var myArgs = process.argv.slice(2);
console.log('myArgs: ', myArgs);
var channel = myArgs[0];
console.log('channel: ', channel);
var version = myArgs[1];
console.log('version: ', version);
var platform = myArgs[2] ? myArgs[2] : 'Windows';
console.log('platform: ', platform);

(async () => {
    await main(channel, version, platform);
})();