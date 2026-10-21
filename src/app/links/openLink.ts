/** What `openLink` needs from the browser; injectable for tests. */
export interface LinkEnvironment {
  readonly baseUrl: string;
  /** Same-tab navigation: right for `mailto:`, which hands off to the mail client without leaving the page. */
  navigate(href: string): void;
  /** New tab without `window.opener`, so the opened site cannot redirect the portfolio. */
  openTab(href: string): void;
}

const browserEnvironment: LinkEnvironment = {
  get baseUrl() {
    return window.location.href;
  },
  navigate: (href) => window.location.assign(href),
  openTab: (href) => {
    window.open(href, '_blank', 'noopener,noreferrer');
  },
};

/**
 * Opens a real-world link chosen in the game (the contact call to action,
 * social profiles). Only `mailto:` and `https:` are honoured: the game's
 * links come from typed content, so anything else is a bug, and refusing it
 * keeps `javascript:` and friends out by construction.
 */
export function openLink(href: string, environment: LinkEnvironment = browserEnvironment): boolean {
  let url: URL;
  try {
    url = new URL(href, environment.baseUrl);
  } catch {
    return false;
  }
  if (url.protocol === 'mailto:') {
    environment.navigate(url.href);
    return true;
  }
  if (url.protocol === 'https:') {
    environment.openTab(url.href);
    return true;
  }
  return false;
}
