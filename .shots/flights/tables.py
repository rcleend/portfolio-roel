#!/usr/bin/env python3
"""The before/after tables of NOTES.md from .shots/flights/logs/{before,after}-*.log: for every row of the matrices
the last run that had the machine to itself (`alone throughout`), else the last one, marked."""
import glob, re, sys

FLIGHT = re.compile(r'^(\S+)\s+wait\s+([\d.]+)\+\s*([-\d.]+) ms\s+frames\s+(\d+) @([\d.]+)\s+max\s+([\d.]+)\s+>20:\s*(\d+) >33:\s*(\d+)\s+late\s+(\d+)\s+on time\s+([\d.]+)%\s+ripple\s+([\d.]+)%\s+step \S+\s*(.*)')
RUN = re.compile(r'display ([\d.]+) ms\s+(\S+)\s+ready (\d+) ms, whole (\S+) ms, left (\d+) ms\s+programs (\d+)\s+bake (.*?)\s+errors (.*)')

def rows(pattern):
    found = {}
    for path in sorted(glob.glob(pattern)):
        row = None
        for line in open(path):
            line = line.rstrip('\n')
            if line.startswith('###'):
                key = re.sub(r' \(re-run\)', '', line[4:])
                row = {'key': key, 'rerun': '(re-run)' in line, 'flights': [], 'alone': None, 'foreign': [], 'tv': None, 'quality': '', 'run': None, 'time': None}
                found.setdefault(key, []).append(row)
            elif row is None:
                continue
            elif line.startswith('load'):
                m = re.search(r'(\d\d:\d\d:\d\d)', line)
                row['time'] = m.group(1) if m else None
            elif line.startswith('run '):
                m = RUN.search(line)
                if m:
                    row['run'] = dict(zip(('display', 'quality', 'ready', 'whole', 'left', 'programs', 'bake', 'errors'), m.groups()))
            elif FLIGHT.match(line):
                g = FLIGHT.match(line).groups()
                made = ' '.join(x for x in g[11].split() if not x.startswith(('bufferBytes', 'textures+')))
                row['flights'].append({'label': g[0], 'wait': float(g[1]), 'first': float(g[2]), 'frames': int(g[3]), 'paced': float(g[4]), 'max': float(g[5]), 'late': int(g[8]), 'ontime': float(g[9]), 'ripple': float(g[10]), 'made': made})
            elif 'tv while warming' in line:
                m = re.search(r'(\d+) frames, median ([\d.]+) ms, max ([\d.]+) ms, over 20 ms (\d+), over 33 ms (\d+)', line)
                row['tv'] = dict(zip(('frames', 'median', 'max', 'over20', 'over33'), m.groups()))
            elif 'quality:' in line:
                row['quality'] = line.strip()[9:]
            elif line.startswith('alone throughout'):
                row['alone'] = True
            elif line.startswith('FOREIGN'):
                row['foreign'].append(line[8:].strip())
            elif line.startswith('foreign measurements'):
                row['alone'] = False
    picked = {}
    for key, runs in found.items():
        runs = [r for r in runs if r['run']]
        if not runs:
            continue
        clean = [r for r in runs if r['alone'] or r['time'] is None]
        picked[key] = (clean or runs)[-1]
    return picked

def mark(row, before):
    if before or row['alone'] or row['time'] is None:
        return ''
    return ' †'

def made(flight):
    return flight['made'].replace('texturePixels+', 'texture ').replace('+', ' ') or 'nothing'

def first_table(before, after):
    print('| Run | | Wait | Frames | Longest | Late | On time | Speed step | Made inside the flight |')
    print('| --- | --- | --- | --- | --- | --- | --- | --- | --- |')
    for key in after:
        a = after[key]
        b = before.get(key) or before.get(key.replace(' --path first', ''))
        for label, row, was in (('before', b, True), ('after', a, False)):
            if not row or not row['flights']:
                continue
            f = row['flights'][0]
            print(f"| {key if label == 'before' or not b else ''} | {label}{mark(row, was)} | {f['wait']:.0f} ms | {f['frames']} at {f['paced']} ms | {f['max']} ms | {f['late']} | {f['ontime']} % | {f['ripple']} % | {made(f)} |")

def others_table(picked, before):
    print('| Run | Quality | Flights | Longest frame of any | Late frames (flights with any) | Lowest on time | Largest speed step |')
    print('| --- | --- | --- | --- | --- | --- | --- |')
    for key, row in picked.items():
        rest = row['flights'][1:]
        if len(rest) < 5:
            continue
        late = [f for f in rest if f['late']]
        names = ', '.join(f"{f['label']} {f['late']} ({f['max']} ms)" for f in late[:6]) + (' …' if len(late) > 6 else '')
        print(f"| {key}{mark(row, before)} | {row['run']['quality']} | {len(rest)} | {max(f['max'] for f in rest)} ms | {sum(f['late'] for f in rest)} in {len(late)}{': ' + names if late else ''} | {min(f['ontime'] for f in rest)} % | {max(f['ripple'] for f in rest)} % |")

def tv_table(before, after):
    print('| Run | | Frames at the TV | Median | Longest | Over 33 ms | Quality changes |')
    print('| --- | --- | --- | --- | --- | --- | --- |')
    for key in after:
        for label, row, was in (('before', before.get(key) or before.get(key.replace(' --path first', '')), True), ('after', after[key], False)):
            if not row or not row['tv'] or int(row['tv']['frames']) < 20:
                continue
            tv = row['tv']
            print(f"| {key} | {label}{mark(row, was)} | {tv['frames']} | {tv['median']} ms | {tv['max']} ms | {tv['over33']} | {row['quality'] or '0'} |")

before = rows('.shots/flights/logs/before-*.log')
after = rows('.shots/flights/logs/after-*.log')
what = sys.argv[1] if len(sys.argv) > 1 else 'all'
if what in ('all', 'first'):
    print('\n#### The first pull-back\n'); first_table(before, after)
if what in ('all', 'others'):
    print('\n#### Every other transition, before\n'); others_table(before, True)
    print('\n#### Every other transition, after\n'); others_table(after, False)
if what in ('all', 'tv'):
    print('\n#### The TV view until the visitor leaves\n'); tv_table(before, after)
if what == 'status':
    for key, row in after.items():
        print(row['time'] or 'clean window', '|', key[:95], '|', 'alone' if (row['alone'] or row['time'] is None) else 'NOT ALONE: ' + '; '.join(row['foreign']))
