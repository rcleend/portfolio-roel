#!/usr/bin/env python3
"""The Mac's shared lock for timing-sensitive runs (firstmate's message 009): /tmp/fm-quiet-machine.lock.

  quiet.py run <minutes> "<what>" -- <command...>   take the lock, wait for the other workers' browsers and test runs
                                                    to drain, run the command (15 minutes at most), release.
  quiet.py gate                                     for any other browser or heavy run: wait while someone holds the
                                                    lock (polled every 10 s, 30 minutes at most), then return.
  quiet.py status                                   who holds it.

A timing result counts only if it was taken inside `run`. Turns go in order of arrival (message 011): a ticket
/tmp/fm-quiet-machine.queue/<epoch>-<task> is dropped first, and the lock is taken only while that ticket is the
oldest; one ticket a worker, so this task's own processes (helpers too) take their turns one after another through
.shots/flights/.quiet-turn. The lock is released whatever happens to the command (a finally and signal handlers),
and a turn is ended by the wall clock, so a machine that slept cannot stretch it. A lock older than 20 minutes whose owner's browsers are gone is removed, and said so.
Exit codes of `run`: the command's own; 3 the lock was not had in 30 minutes; 4 the machine did not go quiet."""
import os, re, shutil, signal, subprocess, sys, time

LOCK = '/tmp/fm-quiet-machine.lock'
QUEUE = '/tmp/fm-quiet-machine.queue'
OWNER = os.path.join(LOCK, 'owner')
ME = 'ship-portfolio-smooth-flights'
HERE = os.path.dirname(os.path.abspath(__file__))
MINE = os.path.join(HERE, '.quiet-turn')
STATUS = '/Users/roel/conductor/workspaces/firstmate/gwangju/state/ship-portfolio-smooth-flights.status'
WAIT_S, STALE_S, TURN_S, DRAIN_S = 30 * 60, 20 * 60, 15 * 60, 8 * 60

def owner():
    try:
        return open(OWNER).read()
    except OSError:
        return ''

def started(text):
    """The owner file's start time: the first ten-digit number in it (every worker writes `date +%s` somewhere)."""
    found = re.search(r'\b(1\d{9})\b', text)
    return int(found.group(1)) if found else None

def foreign_alive():
    seen = subprocess.run(['python3', os.path.join(HERE, 'foreign.py'), 'list'], capture_output=True, text=True).stdout.strip()
    return seen

def stale():
    """A lock past twenty minutes (or without a readable owner for that long) whose owner's runs are gone."""
    text = owner()
    since = started(text)
    if since is None:
        try:
            since = int(os.stat(LOCK).st_mtime)
        except OSError:
            return False
    if time.time() - since < STALE_S:
        return False
    if foreign_alive():
        return False
    print(f'quiet: removing a stale lock (started {int(time.time() - since)} s ago, no browser or test run alive): {text!r}', flush=True)
    shutil.rmtree(LOCK, ignore_errors=True)
    return True

def alive(pid):
    state = subprocess.run(['ps', '-o', 'stat=', '-p', str(pid)], capture_output=True, text=True).stdout.strip()
    return bool(state) and not state.startswith('Z')

def queue():
    """The tickets, oldest first: (epoch, name)."""
    try:
        names = os.listdir(QUEUE)
    except OSError:
        return []
    def key(name):
        head = name.split('-', 1)[0]
        return (int(head) if head.isdigit() else 0, name)
    return sorted(names, key=key)

def take(what, minutes):
    deadline = time.time() + WAIT_S
    # One ticket a worker: another process of this task (a helper) waits here until this task's turn is over.
    while True:
        try:
            fd = os.open(MINE, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
            os.write(fd, str(os.getpid()).encode())
            os.close(fd)
            break
        except FileExistsError:
            try:
                holder = int(open(MINE).read().strip() or 0)
            except (OSError, ValueError):
                holder = 0
            if not holder or not alive(holder):
                try:
                    os.remove(MINE)
                except OSError:
                    pass
                continue
            if time.time() > deadline:
                print(f"quiet: this task's own turn (pid {holder}) was still on after {WAIT_S // 60} minutes", flush=True)
                return False
            time.sleep(5)
    os.makedirs(QUEUE, exist_ok=True)
    # A ticket of this task's already in the queue keeps its place (message 012: a wait past its bound, or a wait
    # that was stopped, does not forfeit it); a new one goes to the back.
    mine = [name for name in queue() if name.endswith(f'-{ME}')]
    ticket = os.path.join(QUEUE, mine[0] if mine else f'{int(time.time())}-{ME}')
    open(ticket, 'a').close()
    reported = time.time()
    try:
        while True:
            tickets = queue()
            if tickets and tickets[0] == os.path.basename(ticket):
                try:
                    os.mkdir(LOCK)
                    break
                except FileExistsError:
                    stale()
            if time.time() - reported > WAIT_S:
                # Said, and waited on with the same ticket (message 012), so arrival order holds.
                reported = time.time()
                note = f'the lock was not had in {WAIT_S // 60} minutes; its owner: {owner()!r}; the queue: {tickets}; still waiting with ticket {os.path.basename(ticket)}'
                print(f'quiet: {note}', flush=True)
                try:
                    with open(STATUS, 'a') as status:
                        status.write(f'working: machine lock: {note}\n')
                except OSError:
                    pass
            time.sleep(2)
    except BaseException:
        # Stopped while waiting (a signal, an interrupt): the ticket stays, and the next wait of this task resumes it.
        try:
            os.remove(MINE)
        except OSError:
            pass
        raise
    try:
        os.remove(ticket)
    except OSError:
        pass
    with open(OWNER, 'w') as out:
        out.write(f'task: {ME}\nrunning: {what}\nstarted: {int(time.time())} ({time.strftime("%a %b %d %H:%M:%S %Z %Y")})\nexpected minutes: {minutes}\npid: {os.getpid()}\n')
    return True

def release():
    if f'task: {ME}\n' in owner() and f'pid: {os.getpid()}\n' in owner():
        shutil.rmtree(LOCK, ignore_errors=True)
    try:
        if open(MINE).read().strip() == str(os.getpid()):
            os.remove(MINE)
    except OSError:
        pass

def run(minutes, what, command):
    if not take(what, minutes):
        return 3
    child = None
    def stop(signum, _frame):
        if child and child.poll() is None:
            try:
                os.killpg(child.pid, signal.SIGTERM)
            except ProcessLookupError:
                pass
        release()
        sys.exit(128 + signum)
    for sig in (signal.SIGTERM, signal.SIGINT, signal.SIGHUP):
        signal.signal(sig, stop)
    try:
        # The others may not start anything now: what they have in flight drains.
        waited = time.time()
        while foreign_alive():
            if time.time() - waited > DRAIN_S:
                print(f'quiet: other runs were still alive {DRAIN_S // 60} minutes after the lock was taken: {foreign_alive()}', flush=True)
                return 4
            time.sleep(5)
        print(f'quiet: lock held, machine quiet after {int(time.time() - waited)} s, {time.strftime("%H:%M:%S")}: {what}', flush=True)
        child = subprocess.Popen(command, start_new_session=True, env={**os.environ, 'FM_QUIET_HELD': '1'})
        watch = subprocess.Popen(['python3', os.path.join(HERE, 'foreign.py'), 'watch', str(child.pid)], stdout=subprocess.PIPE, text=True)
        # By the wall clock, looked at every second: a wait's own timeout does not count a machine's sleep.
        while child.poll() is None and time.time() - waited < TURN_S:
            time.sleep(1)
        code = child.poll()
        if code is None:
            for sig in (signal.SIGTERM, signal.SIGKILL):
                try:
                    os.killpg(child.pid, sig)
                except ProcessLookupError:
                    pass
                time.sleep(3)
            print(f'quiet: the command was stopped at the turn\'s {TURN_S // 60} minutes', flush=True)
            code = 124
        try:
            verdict = watch.communicate(timeout=30)[0].strip().splitlines()[-1]
        except Exception:
            watch.kill()
            verdict = 'watch did not end'
        print(f'quiet: released after {int(time.time() - waited)} s under the lock; {verdict}', flush=True)
        return code
    finally:
        release()

def gate():
    if os.environ.get('FM_QUIET_HELD') == '1':
        return 0
    deadline = time.time() + WAIT_S
    while os.path.isdir(LOCK):
        if stale():
            break
        if time.time() > deadline:
            print(f'quiet: the lock was still held after {WAIT_S // 60} minutes; its owner: {owner()!r}', flush=True)
            return 3
        time.sleep(10)
    return 0

if __name__ == '__main__':
    mode = sys.argv[1] if len(sys.argv) > 1 else 'status'
    if mode == 'run':
        split = sys.argv.index('--')
        sys.exit(run(sys.argv[2], sys.argv[3], sys.argv[split + 1:]))
    if mode == 'gate':
        sys.exit(gate())
    print(owner() or 'free')
