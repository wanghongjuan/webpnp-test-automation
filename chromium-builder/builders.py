#!/usr/bin/python3

import os
import sys
import time
import utils
# from utils import winRun
import subprocess
from utils import Run
from utils import now


# add Chromium Engine
class Chromium(object):
    def __init__(self, source="chromium2\\src", repoPath="C:\\src"):
        self.source = "chromium2\\src"
        self.repoPath = "C:\\src"
        self.args = []
        self.cpu = "x64"
        self.dirname = sys.path[0]
        self.sourcePath = os.path.join(self.repoPath, self.source)
        self.out_path = "C:\\Apache24\\web\\windows-7zip-chromium"
        self.hostname = "ssgs3@10.239.61.104"
        self.remote_out_path = "webnn@powerbuilder.sh.intel.com:/home/webnn/project/chromium-builder/"
        self.remote_url = "http://powerbuilder.sh.intel.com/project/chromium-builder/"

    def updateAndBuild(self, rev=None, remote=True):
        result = {
            'status': 1,
            'msg': None
        }
        try:
            # update chromium repo
            if rev:
                self._update(rev)
                # time.sleep(10)
            # build
            self.build()
        except Exception as e:
            result['status'] = -3
            result['msg'] = e
            return result

        # zip_file_path = self.libpaths()
        if not os.path.exists(self.libpaths()):
            e = "ERROR: Cannot find chrome.7z file, maybe build failed or did not add 'mini_installer' tag when ninja build chromium!"
            print(e)
            result['status'] = -4
            result['msg'] = e
        else:
            # move zip file to apache web
            result = self._move_zip(rev=rev, remote=remote)
        
        return result

    def _update(self, rev):
        # sourcePath = os.path.join(self.repoPath, self.source)
        with utils.FolderChanger(self.sourcePath):
            env = os.environ.copy()
            # reset to master branch
            Run(['git', 'reset', '--hard'], env)
            Run(['git', 'checkout', 'master'], env)
            Run(['git', 'fetch'], env)
            Run(['git', 'reset' ,'--hard', rev])
            Run(['gclient', 'sync', '-D', '-j8', '-f'], env)

    def _move_zip(self, rev=None, remote=True):
        name = "chromium_"
        name += now()
        if rev and type(rev) == str:
            name += '_rev_'
            name += rev
        name += '.7z'
        print(name)
        src = self.libpaths()
        if not os.path.isdir(self.out_path):
            os.system('powershell /c mkdir -p ' + self.out_path)
        dest = os.path.join(self.out_path, name)
        result = {
            'status': 1,
            'msg': None
        }
        # try:
        #     utils.move(src=src, dest=dest)
        # except Exception as e:
        #     result['msg'] = e
        #     result['status'] = -5
        if os.path.exists(src):
            if remote:
                try:
                    Run(['scp', src, self.remote_out_path+name])
                    print('scp to remote apache2 web succeed!')
                    result['msg'] = self.remote_url + name
                except Exception as e:
                    result['status'] = -6
                    result['msg'] = e
            else:        
                print("move to local dir succeed!")

                # result['msg'] = self.hostname + ':' + dest
                result['msg'] = dest
        else:
            result['status'] = -5
            result['msg'] = "Cannot find moved 7zip file in web folder!"
        return result

    def build(self):
        env = os.environ.copy()
        # env["NO_AUTH_BOTO_CONFIG"] = "/repos/boto.cfg"
        # sourcePath = os.path.join(self.repoPath, self.source)

        # add build command code here
        with utils.FolderChanger(self.sourcePath):
            try:
                in_argns_name = self.cpu + ".gn"
                in_argns = os.path.join(self.dirname, 'gn_file', in_argns_name)
                out_argns = os.path.join(self.repoPath, self.source, 'out', self.cpu, 'args.gn')
                if not os.path.isdir(os.path.join(self.repoPath, self.source, 'out', self.cpu)):
                    os.mkdir(os.path.join(self.repoPath, self.source, 'out', self.cpu))
                Run(['copy', in_argns, out_argns], env)
                Run(['gn', 'gen', os.path.join(self.sourcePath, 'out', self.cpu)], env)
                Run(['ninja', '-C', os.path.join(self.sourcePath, 'out', self.cpu), 'chrome', 'mini_installer', '-j40'], env)
                print(12321)
            except subprocess.CalledProcessError as e:
                print("Dirty build failed!")
                try:
                    in_argns_name = self.cpu + ".gn"
                    in_argns = os.path.join(self.dirname, 'gn_file', in_argns_name)
                    out_argns = os.path.join(self.repoPath, self.source, 'out', self.cpu, 'args.gn')
                    Run(['rmdir', '/s', '/q', os.path.join(self.repoPath, self.source, 'out', self.cpu)])
                    Run(['mkdir', os.path.join(self.repoPath, self.source, 'out', self.cpu)])
                    Run(['copy', in_argns, out_argns], env)
                    Run(['gn', 'gen', os.path.join(self.sourcePath, 'out', self.cpu)], env)
                    Run(['ninja', '-C', os.path.join(self.sourcePath, 'out', self.cpu), 'chrome', 'mini_installer', '-j40'], env)
                except subprocess.CalledProcessError as e:
                    print("Clean build failed!")
                    raise e
        # return os.path.join(self.sourcePath, 'out', self.cpu)

    # deprecated
    def shell(self):
        return os.path.join(self.repoPath, self.source, 'out', self.cpu, 'chrome')

    def libpaths(self):
        p = os.path.join(self.repoPath, self.source, 'out', self.cpu, 'chrome.7z')
        return p


def build(engine, rev=None):
    print("build")
    result = engine.updateAndBuild(rev=rev)
    if result['status'] != 1:
        print("error msg:\n", result['msg'])
    else:
        print("7zip file path: ", result['msg'])
    return result


if __name__ == "__main__":
    rev = sys.argv[1] if sys.argv[1:] else None
    builder = Chromium(source="chromium2\\src", repoPath="C:\\src")
    result = build(builder, rev)
    # print(zip_file_path)