// The opal lamp's light colour, shared by the lamp (tv-lamp.mjs) and the toy robot's eyes (toy-robot.mjs), which glow
// in the same warm opal.
export const TV_LAMP_LIGHT = {
  color: [1, 0.72, 0.46], // warm opal: a 2700 K bulb behind white glass, matching the room's tungsten practicals
  glow: 2.8, // the globe's unlit colour × this, so it reads as light and blooms in the finish
};
