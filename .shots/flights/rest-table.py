#!/usr/bin/env python3
"""Before/after rest costs per view: rest-table.py <before-prefix> <after-prefix> (e.g. rest-before rest-after).
Markdown: frames drawn a second, GPU ms a second, main-thread ms a second, frame callbacks a second, energy proxy."""
import json, sys, os
L = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'logs')
before, after = sys.argv[1], sys.argv[2]
names = {'desktop': 'desktop-2', 'desktop-low': 'desktop-low', 'phone': 'phone', 'phone-low': 'phone-low'}
def load(prefix, name):
    for n in ([names[name], name] if prefix == 'rest-before' else [name]):
        p = os.path.join(L, f'{prefix}-{n}.json')
        if os.path.exists(p): return json.load(open(p))
    return None
def cell(b, a, key, digits=0):
    f = lambda s: '—' if s is None or s.get(key) is None else f'{s[key]:.{digits}f}'
    return f'{f(b)} → {f(a)}'
for name in names:
    B, A = load(before, name), load(after, name)
    if not B or not A: continue
    print(f"\n**{name}** ({A['device']} {A['viewport']['width']}×{A['viewport']['height']}@{A['deviceScaleFactor']}, quality {A['qualityAtStart']}; before: {B['power']}, after: {A['power']})\n")
    print('| View | Frames/s | GPU ms/s | Main thread ms/s | Frame callbacks/s | Energy proxy (cores) | What moves, after |')
    print('| --- | --- | --- | --- | --- | --- | --- |')
    for state, a in A['states'].items():
        b = B['states'].get(state)
        if not isinstance(a, dict) or 'fps' not in a: continue
        moving = (a.get('pace') or {}).get('end') or ''
        print(f"| {state} | {cell(b,a,'fps',1)} | {cell(b,a,'gpuMsPerSecond')} | {cell(b,a,'mainMsPerSecond')} | {cell(b,a,'rafPerSecond')} | {cell(b,a,'energyProxy',2)} | {moving} |")
