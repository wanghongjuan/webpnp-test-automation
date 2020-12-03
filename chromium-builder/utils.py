#!/usr/bin/python3
import os
import re
import sys
import subprocess
import datetime
from zipfile import ZipFile


now = lambda: datetime.datetime.now().strftime("%Y%m%d-%H%M%S")


class FolderChanger:
    def __init__(self, folder):
        self.old = os.getcwd()
        self.new = folder

    def __enter__(self):
        os.chdir(self.new)

    def __exit__(self, type, value, traceback):
        os.chdir(self.old)


def chdir(folder):
    return FolderChanger(folder)


def move(src, dest):
    Run(['move', src, dest])


def Zip(src, dest=None, exclude=[]):
    with FolderChanger(src):
        with ZipFile(dest, 'w') as myzip:
            files = os.listdir(src)
            files.sort()
            for file_name in files:
                if file_name not in exclude:
                    myzip.write(file_name)


def get_commit_dict(base_master_number, compared_master_number):
    DriverPath = sys.path[0]
    repo_path = "c:\\src\\chromium2\\src"

    tmp = 2
    while tmp > 0:
        tmp = tmp - 1
        os.chdir(repo_path)

        if not os.path.exists("%s/log.txt" % DriverPath):
            # special re-direct repo_path
            os.system('powershell /c git reset --hard ; git pull')
            cmd1 = "cmd /c git log > %s/log.txt" % DriverPath
            if os.system(cmd1):
                print("get chrome git log error!")

        os.chdir(DriverPath)
        with open('log.txt', encoding='utf-8') as f:
            data = f.read()

        reg_string = r'Cr-Commit-Position: refs/heads/master@{#%d}\r?\n[\w\W]*Cr-Commit-Position: refs/heads/master@{#%d}' \
                     % (compared_master_number+1, base_master_number)
        data = re.search(reg_string, data)
        if data:
            with open('c-m.txt', 'w', encoding='utf-8') as f:
                ret = data.group()
                f.write(ret)
                break
        elif tmp > 0:
            print('regular seach not found, remove log file and try again.')
            os.system('powershell /c rm -r -fo %s/log.txt' % DriverPath)
            continue

    with open('c-m.txt', encoding='utf-8') as f:
        data = f.read()

    if not data:
        print('not data!')
        return

    ret = re.findall(r'\ncommit (\w+)[\w\W]*?\n *Cr-Commit-Position: refs/heads/master@{#(\d+)}', data)
    data_dict = {}
    print(4)
    if ret:
        for t in ret:
            data_dict[t[1]] = t[0]
    print(data_dict)
    print(len(data_dict), compared_master_number - base_master_number + 1)
    return data_dict


def winRun(vec):
    print(">> Executing in " + os.getcwd())
    cmd = 'cmd /c '+' '.join(vec)
    print(cmd)
    return os.system(cmd)

def Run(vec, env=os.environ.copy()):
    print(">> Executing in " + os.getcwd())
    vec = ' '.join(vec)
    print(vec)
    try:
        o = subprocess.check_output(vec, stderr=subprocess.STDOUT, env=env, shell=True)
    except subprocess.CalledProcessError as e:
        print('output was: ' + e.output)
        print(e)
        raise e
    o = o.decode("utf-8")
    try:
        print(o)
    except:
        print("print exception...")
    return o


