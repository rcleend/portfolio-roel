#!/usr/bin/env python3
"""Runs again every row of the after-matrix that has no run with the machine to itself, up to three times each:
waits for a quiet machine, runs it, and notes whether another checkout measured meanwhile (foreign.py)."""
import importlib.util, os, shlex, subprocess, sys, time

here = os.path.dirname(os.path.abspath(__file__))
os.chdir(os.path.join(here, '..', '..'))
spec = importlib.util.spec_from_file_location('tables', os.path.join(here, 'tables.py'))
sys.argv = ['tables.py', 'none']
tables = importlib.util.module_from_spec(spec)
spec.loader.exec_module(tables)

for attempt in range(2):
    picked = tables.rows('.shots/flights/logs/after-*.log')
    owed = [key for key, row in picked.items() if not (row['alone'] or row['time'] is None)]
    if not owed:
        break
    print(f'pass {attempt + 1}: {len(owed)} rows to run again', flush=True)
    for key in owed:
        name, args = key.split(': ', 1)
        argv = shlex.split(args.replace('&quality=low', "'&quality=low'").replace('{"slowGpu":48,"slowBake":48}', "'{\"slowGpu\":48,\"slowBake\":48}'"))
        log = f'.shots/flights/logs/after-{name}.log'
        with open(log, 'a') as out:
            out.write(f'### {name} (re-run): {args}\n')
            out.flush()
            subprocess.run(['python3', '.shots/flights/foreign.py', 'wait'], stdout=out)
            load = subprocess.run(['sysctl', '-n', 'vm.loadavg'], capture_output=True, text=True).stdout.strip()
            out.write(f"load {load} {time.strftime('%H:%M:%S')} AC\n")
            out.flush()
            run = subprocess.Popen(['node', 'scripts/perf/flights.mjs', *argv], stdout=out, stderr=subprocess.STDOUT)
            kind = ['webkit'] if 'webkit' in args else []
            watch = subprocess.Popen(['python3', '.shots/flights/foreign.py', 'watch', str(run.pid), *kind], stdout=out)
            # The run is waited for here (and so reaped: the watch ends when it is gone), eight minutes at most.
            try:
                run.wait(timeout=480)
            except subprocess.TimeoutExpired:
                run.kill()
                run.wait()
                out.write('KILLED: the run did not end within eight minutes\n')
            try:
                watch.wait(timeout=30)
            except subprocess.TimeoutExpired:
                watch.kill()
            print(f'  {time.strftime("%H:%M:%S")} ran {key[:80]}', flush=True)
left = [key for key, row in tables.rows('.shots/flights/logs/after-*.log').items() if not (row['alone'] or row['time'] is None)]
print('every row has a run alone' if not left else f'still not alone: {left}', flush=True)
open('.shots/flights/logs/after-clean-done.log', 'w').write('done\n')
