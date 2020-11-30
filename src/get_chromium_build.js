const settings = require('../config.json');
const path = require('path');
const fs = require('fs');
const http = require('http');
const os = require('os');
const axios = require('axios').default;
const sevenZ = require('7zip-min');
const net = require('net');
const Client = require('ssh2-sftp-client');

const localChromiumDir = path.join(process.cwd(), 'chromium_binary');

/*
* Exec chromium build on remote host
* @param {String}, commit id
* @param {String}, actionType, one of ['build', 'log']
*/
async function remoteExecCommand(commitId, actionType, base_number, compared_number) {
  let message = { command: "build", content: commitId };
  if (actionType === "log")
    message = { command: "log", base_number: base_number, compared_number: compared_number };
  const host = settings["chromium_builder"]["host"];
  const port = settings["chromium_builder"]["port"];
  const result = await new Promise((resolve, reject) => {
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
        console.log(`Waiting for ${actionType} command execution completed, this may take very long time...`);
        // Build done, this will take a very long time
      } else if (status === 1) {
        console.log("Execute successfully, you can get result from: ", msg);
        client.destroy(); // kill client after server's response
        resolve(msg);
      } else {
        client.destroy(); // kill client after server's response
        reject("Execute Error: ", msg);
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
  return Promise.resolve(result);
}

/*
* Update chromePath to true in config.json
*/
async function updateConfig(executablePath) {
  if (!fs.existsSync(executablePath)) {
    return Promise.reject(`Error: The executable chrome binary: ${executablePath} does not exist!`);
  }
  console.log(`Executable chromium path at: ${executablePath}`);
  let platform = os.platform();
  if (platform === 'win32') {
    settings['win_chrome_path'] = executablePath;
  } else if (platform === 'linux') {
    settings['linux_chrome_path'] = executablePath;
  } else {
    return Promise.reject('Unsupported test platform');
  }
  await fs.promises.writeFile(
    path.join(process.cwd(), 'config.json'),
    JSON.stringify(settings, null, 4));
  return Promise.resolve();
}

/*
* Download chromium build from remote host
* @param {String}, chromiumUrl, url of chromium to be download
*/
async function dlChromiumBuild(chromiumUrl) {
  const chromiumPath = path.join(localChromiumDir, chromiumUrl.split("/").pop());
  const chromiumBinPath = '/home/webnn/project/chromium-builder/' + chromiumUrl.split("/").pop();
  if (!fs.existsSync(localChromiumDir)) {
    fs.mkdirSync(localChromiumDir, { recursive: true });
  }
  const serverConfig = {
    host: settings["file_server"]["host"],
    username: settings["file_server"]["user"],
    password: settings["file_server"]["pwd"]
  };

  let sftp = new Client();
  try {
    await sftp.connect(serverConfig);
    console.log(`Downloading remote file: ${chromiumUrl}...`);
    await sftp.fastGet(chromiumBinPath, chromiumPath);
    console.log(`Remote file downloaded to ${chromiumPath}.`);
  } catch (err) {
    return Promise.reject("Download chromium build error: ", err);
  } finally {
    await sftp.end();
  }

  return Promise.resolve(chromiumPath);
}

/*
* Unzip chromium build to local
* @param, {String}, chromiumPath
*/
async function unzipChromium(chromiumPath) {
  const binaryFolder = path.basename(chromiumPath);
  const binaryDir = path.join(localChromiumDir, binaryFolder.split('.')[0]);
  const executablePath = path.join(binaryDir, "Chrome-bin", "chrome.exe");
  // Clean up existing binary dir if it's duplicated
  if (fs.existsSync(binaryDir)) {
    fs.rmdirSync(binaryDir, { recursive: true });
  }
  return new Promise((resolve, reject) => {
    // Unzip chromium binary  local command: "7z x -y -sdel -odir_path chrome.7z"
    sevenZ.unpack(chromiumPath, binaryDir, err => {
      console.log("**************Start extracting chromium binary**************");
      if (err !== null) reject(err);
      else resolve(executablePath);
    });
  });
}

/*
* Centralized place to execute chromium build, get binary from remote host,
* unzip binary to local, and update config.json file
* @param, {String}, commitId, used for building chromium at the head of specific commit id
*/
async function getChromiumBuild(commitId) {
  console.log(`Start chromium build with ${commitId}!`)
  const chromiumUrl = await remoteExecCommand(commitId, "build");
  const chromiumPath = await dlChromiumBuild(chromiumUrl);
  const executablePath = await unzipChromium(chromiumPath);
  await updateConfig(executablePath);
}


module.exports = {
  remoteExecCommand: remoteExecCommand,
  getChromiumBuild: getChromiumBuild
};
