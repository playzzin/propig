"""Isolated 8-to-100 live monitor process check. Fake model API, zero provider calls."""
from datetime import datetime, timezone
import argparse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import threading
import time
import urllib.request
from server import OfficeServer, Store
from prepare_connections import atomic


class FixtureApi(ThreadingHTTPServer):
    request_queue_size=128
    daemon_threads=True
    writes=0


class FixtureHandler(BaseHTTPRequestHandler):
    def log_message(self,*_):
        pass
    def do_GET(self):
        value={"features":dict(run_submission=True,run_status=True,run_stop=True)} if self.path=="/v1/capabilities" else {"data":[dict(id=f"fixture-{i}") for i in range(100)]}
        body=json.dumps(value).encode()
        self.send_response(200);self.send_header("Content-Type","application/json");self.send_header("Content-Length",str(len(body)));self.end_headers();self.wfile.write(body)
    def do_POST(self):
        self.server.writes+=1
        self.send_error(405)


def check():
    started=time.monotonic()
    with tempfile.TemporaryDirectory(prefix="office-monitor-100-") as folder:
        data=Path(folder)
        store=Store(data/"office.sqlite")
        store.ingest(dict(type="inventory",hostId="fixture",eventId="fixture",at=datetime.now(timezone.utc).isoformat(),employees=[dict(botId=str(i+1),name=f"합성 직원 {i+1}",profile=f"fixture-{i}") for i in range(100)]))
        api=FixtureApi(("127.0.0.1",0),FixtureHandler)
        office=OfficeServer(("127.0.0.1",0),store,data)
        servers=[api,office]
        threads=[threading.Thread(target=s.serve_forever,daemon=True) for s in servers]
        for thread in threads:thread.start()
        process=None
        try:
            key=data/"fixture.key"
            key.write_text("synthetic-fixture-only",encoding="utf-8")
            entries=[dict(employeeId=e["id"],profile=e["profile"],endpoint=f"http://127.0.0.1:{api.server_port}",keyFile=str(key),enabled=False,monitor=True) for e in store.snapshot()["employees"]]
            config=dict(office=f"http://127.0.0.1:{office.server_port}",workers=entries[:8])
            path=data/"workers.json"
            atomic(path,config)
            process=subprocess.Popen([sys.executable,"-X","utf8","-B",str(Path(__file__).with_name("runtime_pool.py")),"--config",str(path),"--data",str(data),"--monitor"],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,creationflags=subprocess.CREATE_NO_WINDOW if sys.platform=="win32" else 0)
            original_pid=process.pid
            def ready():
                return [e for e in store.snapshot()["employees"] if e["runtime"]["status"]=="ready" and datetime.now(timezone.utc).timestamp()-datetime.fromisoformat(e["runtime"]["lastSeen"]).timestamp()<45]
            def until(condition,timeout=100):
                deadline=time.monotonic()+timeout
                while time.monotonic()<deadline:
                    if process.poll() is not None:
                        raise AssertionError("Monitor stopped unexpectedly")
                    if condition():return
                    time.sleep(.2)
                raise AssertionError("Monitor condition timed out")
            until(lambda:len(ready())==8)
            first_ids={e["id"] for e in ready()}
            broken=dict(entries[-1],keyFile=str(data/"missing-fixture.key"))
            config["workers"]=entries[:-1]+[broken]
            atomic(path,config)
            until(lambda:len(ready())==99)
            assert first_ids <= {e["id"] for e in ready()}
            assert process.pid==original_pid
            # Invalid top-level JSON must not tear down healthy employees.
            path.write_text("null",encoding="utf-8")
            time.sleep(4)
            assert process.poll() is None and len(ready())==99
            config["workers"]=entries
            atomic(path,config)
            until(lambda:len(ready())==100)
            assert process.pid==original_pid and api.writes==0
            assert store.snapshot()["tasks"]==[] and all(not e["enabled"] for e in config["workers"])
            return dict(ok=True,mode="isolated-monitor-with-fake-api",paidCalls=0,providerPostRequests=api.writes,
                growth=[8,99,100],sameProcess=True,badKeyIsolated=True,invalidConfigPreservedConnections=True,
                executionDisabled=True,durationSeconds=round(time.monotonic()-started,2))
        finally:
            if process and process.poll() is None:
                process.terminate();process.wait(timeout=10)
            office.stop.set()
            for server in servers:server.shutdown();server.server_close()
            for thread in threads:thread.join(5)
            store.close()


if __name__=="__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--report",required=True)
    args=parser.parse_args()
    result=check()
    with Path(args.report).open("x",encoding="utf-8") as output:
        json.dump(result,output,ensure_ascii=False,indent=2)
    print(json.dumps(result,ensure_ascii=False))
