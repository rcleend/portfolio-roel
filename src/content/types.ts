/**
 * Content model for the portfolio.
 *
 * Everything a visitor can read — in the game or in the accessible résumé —
 * is described here as plain, typed data. Presentation layers (the arcade
 * game, the HTML résumé) render this data; they never hard-code copy.
 */

export interface Profile {
  readonly name: string;
  /** What this site is to the visitor, e.g. "Portfolio"; the title sets it opposite the name. */
  readonly site: string;
  /** Short role headline, e.g. "Product Engineer". */
  readonly headline: string;
  readonly location: string;
  readonly summary: string;
  readonly links: readonly ProfileLink[];
}

export interface ProfileLink {
  readonly kind: 'email' | 'linkedin' | 'github';
  readonly label: string;
  readonly href: string;
}

export type ExperienceId = 'scripe' | 'luna' | 'fledge' | 'jouwweb';

export interface Experience {
  readonly id: ExperienceId;
  readonly company: string;
  readonly role: string;
  /** One-line company context, e.g. "AI startup · Founding team". */
  readonly context: string;
  readonly location: string;
  /** ISO year-month, e.g. "2024-10". */
  readonly start: string;
  /** ISO year-month, or `null` while the role is current. */
  readonly end: string | null;
  readonly highlights: readonly Highlight[];
  readonly stack: readonly string[];
}

/** A single, verifiable accomplishment. */
export interface Highlight {
  readonly id: string;
  /** Short, shouty arcade label, e.g. "AI AGENT". */
  readonly title: string;
  /** Plain-language sentence for the résumé and in-game cards. */
  readonly description: string;
  /** Optional headline metric, e.g. { from: '9%', to: '22%', label: 'week-one activation' }. */
  readonly metric?: Metric;
}

export interface Metric {
  readonly label: string;
  readonly from?: string;
  readonly to: string;
}

export interface Education {
  readonly degree: string;
  readonly institution: string;
  readonly location?: string;
  readonly detail?: string;
}

export interface Publication {
  readonly title: string;
  readonly citation: string;
  readonly href: string;
}

export type CharacterId = 'hackerman' | 'artsy' | 'strategy';

export type SkillId =
  | 'full-stack-attack'
  | 'agent-summon'
  | 'ux-elixir'
  | 'power-chord'
  | 'north-star'
  | 'churn-shield';

export interface Skill {
  readonly id: SkillId;
  readonly name: string;
  /** Tooltip copy: what the skill does, in-game and (winkingly) in real life. */
  readonly tooltip: string;
  /** Short gameplay rules shown in the pause menu / HUD help. */
  readonly effect: string;
  /** Seconds before the skill can be used again. */
  readonly cooldownSeconds: number;
}

export interface Character {
  readonly id: CharacterId;
  /** Arcade name the game calls the player by, e.g. "HACKERMAN" on the mission select and the HUD. */
  readonly name: string;
  /** Arcade class, e.g. "ENGINEER": the character select's heading. */
  readonly className: string;
  /** Short, playful description of this side of Roel. */
  readonly bio: string;
  /** Primary attack flavour, e.g. "Code bolts". */
  readonly attack: string;
  readonly skills: readonly [SkillId, SkillId];
}

export type LevelId = 'luna' | 'scripe';

export interface LevelInfo {
  readonly id: LevelId;
  readonly experienceId: ExperienceId;
  /** e.g. "MISSION 1". */
  readonly mission: string;
  readonly city: string;
  readonly country: string;
  /** One-paragraph tongue-in-cheek briefing shown on the level select. */
  readonly briefing: string;
  /** The mission's objective in arcade capitals, under the briefing, e.g. "FIND PRODUCT-MARKET FIT". */
  readonly target: string;
  /** Complaints Unhappy Customers shout in this level. */
  readonly complaints: readonly string[];
}

/** A non-playable teaser slot on the level select. */
export interface LevelTeaser {
  readonly mission: string;
  readonly title: string;
  readonly body: string;
  readonly cta: ProfileLink;
}
