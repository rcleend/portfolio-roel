#!/usr/bin/env python3
"""Other measurements on this machine: `foreign.py wait` blocks until none runs (ten minutes at most);
`foreign.py watch <pid>` says, while <pid> lives, when a browser or test run that is not its own was alive."""
import os, re, subprocess, sys, time

PATTERN = re.compile(r'ms-playwright|playwright/lib|vitest|handover\.mjs|Chrome for Testing|chrome-headless-shell')

def processes():
    rows = subprocess.run(['ps', '-Ao', 'pid=,ppid=,command='], capture_output=True, text=True).stdout.splitlines()
    table = {}
    for row in rows:
        parts = row.strip().split(None, 2)
        if len(parts) == 3:
            table[int(parts[0])] = (int(parts[1]), parts[2])
    return table

def descends(table, pid, ancestor):
    seen = 0
    while pid in table and seen < 64:
        if pid == ancestor:
            return True
        pid = table[pid][0]
        seen += 1
    return False

def foreign(own):
    table = processes()
    me = os.getpid()
    found = []
    for pid, (ppid, command) in table.items():
        if not PATTERN.search(command) or '--type=' in command or 'foreign.py' in command:
            continue
        if descends(table, pid, me) or (own and descends(table, pid, own)):
            continue
        found.append(command)
    return found

def short(command):
    name = re.search(r'handover\.mjs|vitest|playwright test|chrome-headless-shell|Chrome for Testing|playwright', command)
    where = re.search(r'portfolio-roel-[0-9a-f]+/(\d+)/', command)
    return (name.group(0) if name else command[:40]) + (f' (checkout {where.group(1)})' if where else '')

mode = sys.argv[1]
if mode == 'wait':
    waited = 0
    while foreign(None) and waited < 600:
        time.sleep(5)
        waited += 5
    left = foreign(None)
    print(f'quiet after {waited} s' if not left else f'NOISY after {waited} s: {sorted(set(map(short, left)))}')
else:
    own = int(sys.argv[2])
    seen = set()
    hits = 0
    samples = 0
    while True:
        try:
            os.kill(own, 0)
        except OSError:
            break
        samples += 1
        now = foreign(own)
        if now:
            hits += 1
            for name in set(map(short, now)) - seen:
                seen.add(name)
                print(f'FOREIGN {time.strftime("%H:%M:%S")}: {name}', flush=True)
        time.sleep(1.5)
    print(f'foreign measurements alive in {hits} of {samples} samples' if hits else 'alone throughout', flush=True)
