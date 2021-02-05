const fs = require('fs');
const fsPromises = fs.promises;
const path = require('path');
const xl = require('excel4node');
const settings = require('../../config.json');
const { exec } = require("child_process");


/**
 * Get date of json files
 * @param {String} jsonPath 
 */
async function getJsonFileDate(fileInfo) {
  dateList = [];
  for (let workload in fileInfo) {
    let jsonPath = fileInfo[workload];
    let resultFileBasename = path.basename(jsonPath, '.json');
    let resultFileParts = resultFileBasename.split('_');
    let date = resultFileParts[0].substring(0, 8);
    await dateList.push(date);
  }
  return Promise.resolve(dateList);
}

/**
 * if json files' datetime are not the same, rename them
 * @param {String} jsonPath old json path name
 * @param {String} newDate new date time in json path
 */
async function renameJsonFile(jsonPath, newDate) {
  let resultFileBasename = path.basename(jsonPath, '.json');
  let resultFileDirname = path.dirname(jsonPath);
  let resultFileParts = resultFileBasename.split('_');

  let oldDate = resultFileParts[0].substring(0, 8);

  if (oldDate === newDate) {
    return Promise.resolve(jsonPath);
  } else {
    resultFileParts[0] = newDate + resultFileParts[0].substring(8,14);
    resultFileBasename = resultFileParts.join('_');
    newResultFilePath = path.join(resultFileDirname, resultFileBasename+'.json');

    await fsPromises.rename(jsonPath, newResultFilePath);
    return Promise.resolve(newResultFilePath);
  }
}

/**
 * rename all datetime of json files
 * @param {Object} fileInfo 
 * @param {String} newDate 
 */
async function genJsonDateTime(fileInfo, newDate) {
  for (let workload in fileInfo) {
    let resultFilePath = fileInfo[workload];
    await renameJsonFile(resultFilePath, newDate);
  }
  return Promise.resolve();
}

/*
* Get excel filename base on JSON file path
*/
function getExcelFilename(jsonPath, platform) {
  let resultFileBasename = path.basename(jsonPath, '.json');
  let resultFileParts = resultFileBasename.split('_');

  let date = resultFileParts[0].substring(0, 8);
  let device = resultFileParts[1];

  let browserParts = resultFileParts[resultFileParts.length - 1].split('-');

  // browserParts.pop();
  let browser = [platform, browserParts.join('_')].join('-');

  let excelFileName = [date, browser, device].join('_') + '.xlsx';
  return excelFileName;
}

/*
* Write the test results stored in JSON file to excel
* 
*/
async function genExcelFiles(fileInfo, platform) {
  let results = {};
  let excelFileName = '';

  for (let workload in fileInfo) {
    let resultFilePath = fileInfo[workload];

    if (!fs.existsSync(resultFilePath)) {
      return Promise.reject(`${resultFilePath} does not exist, failed to write to Excel!`);
    }
    // Rename json files if datetime of them are not the same
    // resultFilePath = await renameJsonFile(resultFilePath, newDate);

    let rawData = await fsPromises.readFile(resultFilePath, 'utf-8');
    results[workload] = JSON.parse(rawData);

    if (excelFileName === '')
      excelFileName = await getExcelFilename(resultFilePath, platform);
  }

  console.log(`Excel file name: ${excelFileName}`);
  let excelDir = path.join(process.cwd(), 'excels');
  if (!fs.existsSync(excelDir)) {
    fs.mkdirSync(excelDir, { recursive: true });
  }

  let excelPathName = path.join(excelDir, excelFileName);
  await writeDataToExcel(excelPathName, results);

  return Promise.resolve(excelPathName);
}

/*
* Write JSON object to an excel file
*/
async function writeDataToExcel(pathname, jsonData) {
  let wb = new xl.Workbook();

  let ws = wb.addWorksheet('Index');
  let deviceInfo = '';
  let tableHeader = ['component', 'case_id', 'unit'];
  let workloadNameConverter = {
    'Speedometer2': 'Speedometer 2.0',
    'WebXPRT3': 'WebXPRT 3',
    'Unity3D': 'Unity3D2018',
    'JetStream2': 'JetStream2'
  };
  let workloadUnits = {
    'Speedometer2': 'score',
    'WebXPRT3': 'ms',
    'Unity3D': 'score',
    'JetStream2': 'score'
  };
  let totalWorkloadScoreRows = [];
  let detailedWorkloadsScoreRows = [];

  for (let workload in jsonData) {

    if (deviceInfo === '') {
      let device = jsonData[workload]['device_info'];
      let cpu = device['CPU']['info'];
      let gpu = device['GPU'];
      let gpuVer = device['GPU Driver Version'];
      let osVer = device['OS Version'];
      let browserVer = device['Browser'].split('-').pop();
      deviceInfo = ['CPU: ' + cpu,
      'GPU: ' + gpu,
      'GPU Version: ' + gpuVer,
      'OS Version: ' + osVer,
      'Browser Version: ' + browserVer].join('\n');

    }

    let totalWorkloadName = jsonData[workload]['workload'];
    if (workload in workloadNameConverter)
      totalWorkloadName = workloadNameConverter[workload];

    totalWorkloadScoreRows.push([totalWorkloadName, totalWorkloadName, 'score',
      jsonData[workload]['test_result']['Total Score']]);

    for (let subCase in jsonData[workload]['test_result']) {
      if (subCase !== 'Total Score') {
        let col1 = totalWorkloadName;
        let col2 = subCase;
        if (workload === 'WebXPRT3')
          col2 = subCase.replace(/\s\(ms\)$/g, ''); // Remove unit in excel sheet.
        let col3 = workloadUnits[workload];
        let col4 = jsonData[workload]['test_result'][subCase];

        detailedWorkloadsScoreRows.push([col1, col2, col3, col4]);
      }
    }
  }
  tableHeader.push(deviceInfo);

  for (let i = 0; i < tableHeader.length; i++)
    ws.cell(1, i + 1).string(tableHeader[i]);

  for (let i = 0; i < totalWorkloadScoreRows.length; i++)
    for (let j = 0; j < totalWorkloadScoreRows[i].length; j++)
      ws.cell(i + 2, j + 1).string(totalWorkloadScoreRows[i][j]);

  for (let i = 0; i < detailedWorkloadsScoreRows.length; i++)
    for (let j = 0; j < detailedWorkloadsScoreRows[i].length; j++)
      ws.cell(i + 2 + totalWorkloadScoreRows.length, j + 1).string(detailedWorkloadsScoreRows[i][j]);

  await wb.write(pathname);

  return Promise.resolve();
}

/*
* uploading the excel data to web pnp server
*/
async function execUploadScript(file_path) {
  const token = "4fc97c5dc10c681a87c5eb6178c60a0025299e44";
  const curlCommand = `curl -F files=@${file_path} -F project=1 http://webpnp.sh.intel.com/api/report/ -H 'Authorization: Token ${token}'`;
  console.log(`Executing uploading report:`);
  await new Promise(resolve => setTimeout(resolve, 5000));
  return new Promise((resolve, reject) => {
    exec(curlCommand, (error, stdout, stderr) => {
      console.log("stdout: ", stdout);
      if (stdout) {
        if (stdout.includes('web_pnp_reporter uploaded the report')) {
          console.log(`************${file_path} uploaded to webpnp report server successfully****************`);
          resolve();
        } else {
          reject(`Error: Failed to upload ${file_path} to webpnp reporter`);
        }
      } else {
        reject(`Error: Failed to upload ${file_path} to webpnp reporter`);
      }
    });
  });
}

module.exports = {
  getJsonFileDate: getJsonFileDate,
  genJsonDateTime: genJsonDateTime,
  genExcelFiles: genExcelFiles,
  execUploadScript: execUploadScript
};
