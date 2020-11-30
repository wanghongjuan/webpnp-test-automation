const settings = require('../config.json');
const path = require('path');
const fs = require('fs');
const fsPromises = fs.promises;
const net = require('net');

/*
* Exec chromium build on remote host
* @param {String}, commit id
*/
async function remoteExecChromiumBuild(commitId) {
  const message = {command: "build", content: commitId};
  const host = settings["chromium_builder"]["host"];
  const port = settings["chromium_builder"]["port"];
  const chromiumUrl = await new Promise((resolve, reject) => {
    const client = new net.Socket();
    client.connect(port, host, () => {
      client.write(JSON.stringify(message));
    });
    
    client.on('data', data => {
      console.log('Received: ' + data);
      let status = JSON.parse(data).status;
      let msg = JSON.parse(data).msg;
      // Socket connected
      if (status === 0) {
        console.log(msg);
        console.log("Waiting for build completed, this may take very long time...");
      // Build done, this will take a very long time
      } else if (status === 1) {
        console.log("Build successfully, you can get url from: ", msg);
        client.destroy(); // kill client after server's response
        resolve(msg);
      } else {
        client.destroy(); // kill client after server's response
        reject("Build Error: ", msg);
      }
    });
    client.on('close', () => {
      console.log('Connection closed');
    });
    client.on('error', e => {
      console.log(e);
      reject(e);
    });
  });
  return Promise.resolve(chromiumUrl);
}

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


async function checkBisectAvailability(base_commit, compared_commit) {
  if (settings['workloads'].length !== 1) {
    return Promise.reject('Bisect only support running one workload');
  }
  if (base_commit["number"] > compared_commit["number"]) {
    return Promise.reject("base_commit's number should be less than compared_commit's number");
  }
}

async function startBisect(resultPath) {
  for (const key in resultPath) {
    const resultPath = resultPaths[key];
  }

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
  updateConfig: updateConfig,
  getTestScore: getTestScore,
  startBisect: startBisect,
  checkBisectAvailability: checkBisectAvailability
}
