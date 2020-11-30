"use strict";

const si = require('systeminformation');
const getOtherInfo = require('./get_other_info.js');
const cpuList = require('../cpu_list.json');
const { exec } = require("child_process");

/*
* Get information of device info
*/
async function getDeviceInfo() {
  const otherInfo = await getOtherInfo();
  const chromeVersion = otherInfo.chromeVersion;
  const gpuDriverVersion = otherInfo.gpuDriverVersion;
  const screenRes = otherInfo.ScreenResolution;

  console.log('********** Get all device info **********');
  // Get GPU info
  const gpuData = await si.graphics();
  const gpuModel = gpuData.controllers.slice(-1)[0].model;
  const gpuName = gpuModel.replace("(TM)", "").replace("(R)", "").replace("Intel ", "").replace("AMD ", "").replace("NVIDIA ", "");

  // Get CPU info
  const cpuData = await si.cpu();
  let cpuCodeName = "", mfr = "";
  let cpuBrand = cpuData.brand;
  const cpuManufacturer = cpuData.manufacturer;
  // Intel CPU
  if ((cpuManufacturer + cpuBrand).includes("Intel")) {
    mfr = "Intel";
    cpuBrand = cpuBrand.split(" ").pop();
    if (cpuBrand in cpuList["Intel"])
      cpuCodeName = cpuList["Intel"][cpuBrand]["codename"];
    else
      cpuCodeName = "Unknown";
  // AMD CPU
  } else if ((cpuManufacturer + cpuBrand).includes("AMD")) {
    mfr = "AMD";
    // Trim the brand name, e.g. Ryzen 7 4700U with Radeon Graphics -> Ryzen 7 4700U
    cpuBrand = cpuBrand.split(" ").slice(0, 3).join(" ");
    if(cpuBrand in cpuList["AMD"])
      cpuCodeName = cpuList["AMD"][cpuBrand]["codename"];
    else
      cpuCodeName = "unknown";
  } else {
    // Reject other CPU
    return Promise.reject(`Error: unknown CPU brand: ${cpuBrand}`);
  }
  const cpuInfo = { mfr: mfr, "info": cpuCodeName + " " + cpuBrand, "codename": cpuCodeName, "brand": cpuBrand };

  // Get memory info
  const memData = await si.mem();
  const memSize = Math.round(memData.total/1024/1024/1024) + "G";

  // Get hardware info
  const hwData = await si.system();
  const hwInfo = hwData.manufacturer + " " + hwData.version;

  // Get OS info
  const osData = await si.osInfo();
  let platform = "";
  if (osData.distro.includes("Windows 10"))
    platform = "Windows 10";
  else
    platform = osData.distro;

  let powerPlan = "N/A";

  if (platform.includes("Windows")) {
    powerPlan = await new Promise((resolve, reject) => {
      // `cmd /c chcp 65001>nul &&`: this command sets cmd's console output to utf-8) at start of my exec command
      exec("cmd /c chcp 65001>nul && powercfg /GetActiveScheme", (error, stdout, stderr) => {
        if (error) {
          reject(`error: ${error.message}`);
        }
        if (stderr) {
          reject(`stderr: ${stderr}`);
        }
        if (stdout.includes("Balanced") || stdout.includes("平衡")) {
          resolve("Balanced");
        } else if (stdout.includes("High performance") || stdout.includes("高性能")) {
          resolve("High performance");
        } else if (stdout.includes("Power saver") || stdout.includes("省电")) {
          resolve("Power saver");
        } else {
          reject("error: Unknown power plan");
        }
      });
    });
  }
  // Generate device info object
  const deviceInfo = {
    "CPU": cpuInfo,
    "GPU": gpuName,
    "GPU Driver Version": gpuDriverVersion,
    "Memory": memSize,
    "Hardware": hwInfo,
    "Screen Resolution": screenRes,
    "Power Governor": powerPlan,
    "OS": platform,
    "OS Version": osData.release,
    "Browser": chromeVersion
  };
  console.log(deviceInfo);

  return Promise.resolve(deviceInfo);
};

module.exports = getDeviceInfo;
