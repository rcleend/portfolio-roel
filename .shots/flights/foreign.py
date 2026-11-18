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
        # A browser's helpers (its crash handler is its own orphan: parent 1) are not a measurement of their own.
        if not PATTERN.search(command) or '--type=' in command or 'crashpad' in command or 'foreign.py' in command:
            continue
        # An agent's own process carries its brief on its command line, and a brief names browsers and test runners.
        if command.startswith('claude') or 'FIRSTMATE_OP' in command:
            continue
        if descends(table, pid, me) or (own and descends(table, pid, own)):
            continue
        # WebKit's own helpers are launchd's children, not the run's: a WebKit run cannot tell another's from its own.
        if OWN_WEBKIT and 'ms-playwright/webkit' in command:
            continue
        found.append(command)
    return found

def short(command):
    name = re.search(r'handover\.mjs|vitest|playwright test|chrome-headless-shell|Chrome for Testing', command) or re.search(r'playwright', command)
    where = re.search(r'portfolio-roel-[0-9a-f]+/(\d+)/', command)
    return (name.group(0) if name else command[:40]) + (f' (checkout {where.group(1)})' if where else '')

mode = sys.argv[1]
OWN_WEBKIT = 'webkit' in sys.argv[3:]
if mode == 'list':
    print(', '.join(sorted(set(map(short, foreign(None))))))
    sys.exit(0)
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
    started = time.time()
    # A finished run that nobody has waited for yet is a zombie: gone as far as this is concerned (a signal still
    # reaches one, so `kill -0` says it lives). Twenty minutes at most, whatever the run does.
    def alive(pid):
        state = subprocess.run(['ps', '-o', 'stat=', '-p', str(pid)], capture_output=True, text=True).stdout.strip()
        return bool(state) and not state.startswith('Z')
    while alive(own) and time.time() - started < 1200:
        samples += 1
        now = foreign(own)
        if now:
            hits += 1
            for name in set(map(short, now)) - seen:
                seen.add(name)
                print(f'FOREIGN {time.strftime("%H:%M:%S")}: {name}', flush=True)
        time.sleep(1.5)
    print(f'foreign measurements alive in {hits} of {samples} samples' if hits else 'alone throughout', flush=True)
