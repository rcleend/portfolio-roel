/**
 * Transfer curve for the master safety clipper: a straight line up to `knee`,
 * then a tanh shoulder that approaches (but never reaches) `ceiling`. Normal
 * material never touches the shoulder; a pile-up of effects is rounded off
 * instead of wrapping into harsh digital clipping above 0 dBFS.
 */
export function softClipCurve(size = 4097, knee = 0.8, ceiling = 0.98): Float32Array<ArrayBuffer> {
  if (!(knee > 0 && knee < ceiling && ceiling <= 1))
    throw new RangeError('softClipCurve needs 0 < knee < ceiling <= 1');
  const curve = new Float32Array(size);
  const room = ceiling - knee;
  for (let i = 0; i < size; i++) {
    const x = (i / (size - 1)) * 2 - 1;
    const magnitude = Math.abs(x);
    const y = magnitude <= knee ? magnitude : knee + room * Math.tanh((magnitude - knee) / room);
    curve[i] = Math.sign(x) * y;
  }
  return curve;
}
