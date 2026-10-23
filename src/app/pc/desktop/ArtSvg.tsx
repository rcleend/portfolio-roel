import { type CSSProperties, useId } from 'react';
import type { Art, Paint } from './art';

export interface ArtSvgProps {
  readonly art: Art;
  /** Rendered size in px (layout px inside the screen). */
  readonly size: number;
  readonly className?: string;
  readonly style?: CSSProperties;
}

/** Draws vector art from `art.ts` as inline SVG; decorative, so it is always hidden from assistive tech. */
export function ArtSvg({ art, size, className, style }: ArtSvgProps) {
  // React's ids contain characters that would need escaping inside url(#…); the counter alone keeps them unique.
  const id = `art${useId().replace(/[^\w-]/g, '')}`;
  const gradients = art.parts.flatMap((part, index) =>
    typeof part.fill === 'object' ? [{ id: `${id}-${index}`, paint: part.fill }] : [],
  );
  return (
    <svg
      className={className}
      style={style}
      width={size}
      height={size}
      viewBox={`0 0 ${art.size} ${art.size}`}
      aria-hidden="true"
      focusable="false"
    >
      {gradients.length > 0 ? (
        <defs>
          {gradients.map(({ id: gradientId, paint }) => (
            <linearGradient
              key={gradientId}
              id={gradientId}
              gradientUnits="userSpaceOnUse"
              x1={paint.x1}
              y1={paint.y1}
              x2={paint.x2}
              y2={paint.y2}
            >
              {paint.stops.map((stop) => (
                <stop key={stop.offset} offset={stop.offset} stopColor={stop.color} />
              ))}
            </linearGradient>
          ))}
        </defs>
      ) : null}
      {art.parts.map((part, index) => (
        <path
          // Parts are static art; their order is their identity.
          // biome-ignore lint/suspicious/noArrayIndexKey: see above.
          key={index}
          d={part.d}
          fill={fillOf(part.fill, `${id}-${index}`)}
          fillRule={part.evenOdd ? 'evenodd' : undefined}
          stroke={part.stroke}
          strokeWidth={part.stroke ? (part.width ?? 1) : undefined}
          opacity={part.opacity}
        />
      ))}
    </svg>
  );
}

function fillOf(fill: Paint | undefined, gradientId: string): string {
  if (fill === undefined) return 'none';
  return typeof fill === 'string' ? fill : `url(#${gradientId})`;
}
