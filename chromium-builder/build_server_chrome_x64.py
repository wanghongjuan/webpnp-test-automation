#!/usr/bin/python3

import socket
import json, time
import utils
import builders

LISTEN_ADDRESS = "0.0.0.0"
LISTEN_PORT = 8790
ERROR_LOG_FILE = "C:\\logs\\build_server_error.log"

s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
s.bind((LISTEN_ADDRESS, LISTEN_PORT))
s.listen(5)


def build(rev=None):
    # Set of engines that get build.
    builder = builders.Chromium(source="chromium2\\src", repoPath="C:\\src")
    return builders.build(builder, rev)


def log_to_file(err_content):
    file = open(ERROR_LOG_FILE, "a+")
    error_log = "error in build_server - %s : %s \n" % (
    time.strftime("%Y-%m-%d %H:%M:%S", time.localtime()), err_content)
    file.write(error_log)
    file.close()


while True:
    try:
        sock, addr = s.accept()
        print(utils.now(), "connect", addr)
        hello = {
            'status': 0,
            'msg': 'connect ok'
        }
        sock.send(json.dumps(hello).encode())
        data = sock.recv(10240).decode()
        if not data:
            # log_to_file("client close in error with ip " + addr)
            continue
        print("recv", data)
        time.sleep(5)
        recv = json.loads(data)
        if recv['command'] == 'build':
            commit_id = recv['content']
            ret = build(rev=commit_id)
        elif recv['command'] == 'log':
            base_id = int(recv['base_number'])
            compared_id = int(recv['compared_number'])
            msg = utils.get_commit_dict(base_id, compared_id)
            ret = {
                'status': 1,
                'msg': msg
            }
        else:
            msg = "ERROR: incorrect json format!"
            ret = {
                'status': -1,
                'msg': msg
            }
        back_msg = json.dumps(ret)
        sock.send(back_msg.encode())
        sock.close()
        print("over")
    except Exception as e:
        # log_to_file(str(e))
        print('line 70')
        print(e)
        try:
            ret = {
                'status': -2,
                'msg': str(e)
            }
            sock.send(json.dumps(ret).encode())
        except Exception as e:
            print(e)
        sock.close()
s.close()
