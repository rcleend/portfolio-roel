/**
 * The page of a visitor whose browser has no GPU to draw the room with (docs/ROOM.md › No GPU): the résumé and
 * nothing else. The startup gate (app/startup/gate) imports this in place of the site's entry, so no room, no game
 * and no React comes with it: the résumé arrives as markup the build rendered (render.tsx).
 *
 * The styles imported here are the ones the site's entry imports too. The build ships this script without them,
 * since the page's one stylesheet already has them (scripts/gatePlugin.ts checks that it does).
 */

import { html, title } from 'virtual:cv';
import { inject } from '@vercel/analytics';
import '@fontsource/silkscreen/400.css';
import '../styles.css';
import '../cursors/cursors.css';
import '../resume/Resume.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');
// The site opens with the pointer hidden until the mouse moves (index.html); a page of text shows it from the start.
delete document.documentElement.dataset.pointer;
root.innerHTML = html;
document.title = title;
// The browser's own chrome takes the paper's colour, not the room's dark.
document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#f7f3e6');
document.documentElement.dataset.cv = 'shown';
inject();
