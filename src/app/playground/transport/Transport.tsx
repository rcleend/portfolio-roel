import { type CSSProperties, useSyncExternalStore } from 'react';
import { STEP_HZ } from '@/engine/core/FixedLoop';
import { beatAt, type Timeline } from '../boards/timeline';
import type { PreviewLoop } from '../runtime/PreviewLoop';
import { keepFocus } from '../ui/keepFocus';
import { PixelIcon } from '../ui/PixelIcon';
import { Segmented } from '../ui/Segmented';
import { SPEEDS } from './PreviewClock';

interface TransportProps {
  readonly loop: PreviewLoop;
  /** What the scrubber spans, and the beats to jump to. */
  readonly timeline: Timeline;
}

const seconds = (frame: number): string => `${(frame / STEP_HZ).toFixed(2)} s`;

/** Replay, play and pause, frame steps, speed and a scrubber, for every preview at once. */
export function Transport({ loop, timeline }: TransportProps) {
  const { clock } = loop;
  const { frame, playing, speed } = useSyncExternalStore(clock.subscribe, () => clock.state);
  const position = Math.min(frame, timeline.frames);
  const beat = beatAt(timeline, frame);
  const scrubberStyle = { '--progress': `${(position / timeline.frames) * 100}%` } as CSSProperties;

  return (
    <div className="transport">
      <div className="transport__buttons">
        <button
          type="button"
          className="tool"
          onMouseDown={keepFocus}
          onClick={() => loop.replay()}
          aria-keyshortcuts="R"
        >
          <PixelIcon name="replay" /> Replay{' '}
          <span className="key" aria-hidden="true">
            R
          </span>
        </button>
        <button
          type="button"
          className="tool transport__play"
          onMouseDown={keepFocus}
          onClick={() => loop.togglePlay()}
          aria-keyshortcuts="Space"
        >
          <PixelIcon name={playing ? 'pause' : 'play'} /> {playing ? 'Pause' : 'Play'}{' '}
          <span className="key" aria-hidden="true">
            Space
          </span>
        </button>
        <button
          type="button"
          className="tool"
          onMouseDown={keepFocus}
          onClick={() => loop.step(-1)}
          aria-label="Previous frame"
          aria-keyshortcuts="ArrowLeft"
          title="Previous frame (←)"
        >
          <PixelIcon name="stepBack" />
        </button>
        <button
          type="button"
          className="tool"
          onMouseDown={keepFocus}
          onClick={() => loop.step(1)}
          aria-label="Next frame"
          aria-keyshortcuts="ArrowRight"
          title="Next frame (→)"
        >
          <PixelIcon name="stepForward" />
        </button>
        <Segmented
          label="Speed"
          segments={SPEEDS.map((value) => ({ value, label: `${value}×` }))}
          value={speed}
          onChange={(value) => loop.setSpeed(value)}
        />
      </div>
      <div className="scrubber" style={scrubberStyle}>
        <div className="scrubber__rail">
          <input
            type="range"
            className="scrubber__track"
            min={0}
            max={timeline.frames}
            step={1}
            value={position}
            aria-label="Scene time"
            aria-valuetext={`${seconds(position)}${beat ? `, ${beat.label}` : ''}`}
            onChange={(event) => loop.seek(Number(event.currentTarget.value))}
          />
          {timeline.beats.map((mark) => (
            <span
              key={mark.label}
              className="scrubber__tick"
              style={{ '--at': mark.frame / timeline.frames } as CSSProperties}
              aria-hidden="true"
            />
          ))}
        </div>
        <div className="scrubber__beats">
          {timeline.beats.map((mark) => (
            <button
              key={mark.label}
              type="button"
              className="beat"
              aria-current={mark === beat ? 'step' : undefined}
              onMouseDown={keepFocus}
              onClick={() => loop.seek(mark.frame)}
              title={`Jump to ${mark.label}, ${seconds(mark.frame)}`}
            >
              {mark.label}
            </button>
          ))}
        </div>
      </div>
      <output className="readout" aria-live="off">
        <span className="readout__time">{seconds(frame)}</span>
        <span className="readout__frame">f{frame}</span>
        {beat ? <span className="readout__beat">{beat.label}</span> : null}
      </output>
    </div>
  );
}
