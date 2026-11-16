/**
 * The tin toy robot on the left-hand end of the TV cabinet (gen/props/lampAndRobot.ts). Its eyes' light on the room is
 * baked with the room (gen/rig.ts › eye-0, eye-1: each eye `TOY_ROBOT_EYE_INTENSITY` of the lamp's colour along its
 * beam); a frame draws only the eyes themselves and their halos (RoomHalation).
 */

/**
 * Each eye's intensity along its beam, in the finish's linear light: a torch bulb behind a lens. gen.test.ts holds the
 * rig's eyes to it.
 */
export const TOY_ROBOT_EYE_INTENSITY = 0.035;

/** The radius of the soft round glow the halation draws over each eye (metres): a little past the glass. */
export const TOY_ROBOT_EYE_HALO = 0.011;
