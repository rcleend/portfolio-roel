import { useEffect, useMemo, useState } from 'react';
import type { GameAudio } from '@/game/audio/ids';
import { chosen } from '../boards/subject';
import { useElementSize } from '../layout/useElementSize';
import { fitZoom } from '../layout/zoom';
import type { Focus } from '../state/playgroundState';
import { keepFocus } from './keepFocus';
import { LiveScreen } from './LiveScreen';
import { PickerControl } from './PickerControl';

interface FocusViewProps {
  readonly focus: Focus;
  readonly crt: boolean;
  readonly reducedMotion: boolean;
  /** The synthesiser while sound is on; this is the one view ever heard. */
  readonly audio: GameAudio | undefined;
  readonly onPick: (picker: string, choice: string) => void;
  readonly onClose: () => void;
}

/**
 * One combination as large as the window allows, at a whole-number zoom,
 * with a picker for every choice so any lockup can meet any backdrop.
 */
export function FocusView({ focus, crt, reducedMotion, audio, onPick, onClose }: FocusViewProps) {
  const { subject, picks } = focus;
  const show = useMemo(() => subject.show(picks), [subject, picks]);
  const [view, setView] = useState<HTMLElement | null>(null);
  const [stage, setStage] = useState<HTMLDivElement | null>(null);
  const { width, height } = useElementSize(stage);

  // Keyboard focus moves into the view as it opens, so Tab starts from its pickers.
  useEffect(() => {
    view?.focus({ preventScroll: true });
  }, [view]);

  return (
    <section ref={setView} className="focus" role="dialog" aria-label={`${subject.label}, focused`} tabIndex={-1}>
      <div className="focus__bar">
        <button type="button" className="tool" onMouseDown={keepFocus} onClick={onClose} aria-keyshortcuts="Escape">
          Back to the boards{' '}
          <span className="key" aria-hidden="true">
            Esc
          </span>
        </button>
        {subject.pickers.map((picker) => (
          <PickerControl
            key={picker.id}
            picker={picker}
            value={picks[picker.id] ?? picker.current}
            onChange={(choice) => onPick(picker.id, choice)}
          />
        ))}
      </div>
      <div ref={setStage} className="focus__stage">
        <LiveScreen
          show={show}
          zoom={fitZoom(width, height)}
          crt={crt}
          reducedMotion={reducedMotion}
          layer="focus"
          audio={audio}
        />
      </div>
      <dl className="focus__legend">
        {subject.pickers.map((picker) => {
          const choice = chosen(picker, picks);
          return (
            <div key={picker.id} className="focus__pick">
              <dt>{picker.label}</dt>
              <dd>
                <strong className="focus__name">{choice.name}</strong>
                {choice.id === picker.current ? <span className="badge">Current</span> : null}
                <span className="focus__description">{choice.description}</span>
              </dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}
