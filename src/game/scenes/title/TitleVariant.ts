/**
 * What every title variant, lockup or backdrop, says about itself: the
 * registries and scene params key on `id`, and the playground shows `name`
 * and `description`.
 */
export interface TitleVariant<Id extends string = string> {
  /** Stable, lower-case kebab-case, unique within its registry: it is what `?params={"backdrop":"classic"}` names. */
  readonly id: Id;
  /** A short display name, e.g. "Classic". */
  readonly name: string;
  /** One line on what sets it apart. */
  readonly description: string;
}
