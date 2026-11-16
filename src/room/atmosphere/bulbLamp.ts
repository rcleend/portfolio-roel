/**
 * The bare-bulb lamp on the left-hand end of the TV cabinet, dimmed (gen/props/cabinetLamps.ts › bulbLamp). Its light
 * on the room is baked with the room (gen/rig.ts › bulb: `BULB_LAMP_INTENSITY` of the lamp's colour from the middle of
 * its filament); a frame draws only the filament itself, the glass's film of light and one halo (RoomHalation).
 */

/**
 * Its intensity in the finish's linear light: a clear lamp turned most of the way down, three fifths of the
 * opal globe. gen.test.ts holds the rig's bulb to it.
 */
export const BULB_LAMP_INTENSITY = 0.084;

/** The radius of the soft round glow the halation draws about the filament (metres): the bulb's own width again. */
export const BULB_LAMP_HALO = 0.11;

/** The halo's colour: a dimmed filament's orange, against the room lamps' warm halation tint (about 1). */
export const BULB_LAMP_HALO_TINT: readonly [number, number, number] = [1, 0.5, 0.2];
