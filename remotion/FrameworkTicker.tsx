import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  Easing,
} from 'remotion';

const PAPER = 'oklch(97% 0.015 95)';
const OAK = 'oklch(31% 0.073 155)';
const LEAF = 'oklch(45% 0.1 150)';
const MUTED = 'oklch(44% 0.035 255)';
const LINE = 'oklch(84% 0.023 155)';
const FONT = 'Geist, "Helvetica Neue", Arial, sans-serif';

const CAPS = [
  'Multi-framework',
  'MSP multi-tenant',
  'Evidence chain of custody',
  'Internal collaboration',
  'Defensible certification',
];

const outExpo = Easing.out(Easing.exp);

// A light, on-paper looping band of capability words rising in sequence — for
// embedding inside a marketing section.
export function FrameworkTicker() {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const loopFade = interpolate(
    frame,
    [0, 10, durationInFrames - 12, durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );
  const per = 40;
  const active = Math.floor(frame / per) % CAPS.length;

  return (
    <AbsoluteFill
      style={{
        background: PAPER,
        fontFamily: FONT,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: loopFade,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
        <svg width={84} height={92} viewBox="0 0 200 220">
          <path
            d="M100 12 L176 44 V108 C176 160 142 196 100 210 C58 196 24 160 24 108 V44 Z"
            fill="oklch(31% 0.073 155 / 0.06)"
            stroke={OAK}
            strokeWidth={6}
            strokeLinejoin="round"
          />
          <path d="M62 110 L90 140 L142 78" fill="none" stroke={LEAF} strokeWidth={11} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <div style={{ height: 120, overflow: 'hidden', position: 'relative', minWidth: 880 }}>
          {CAPS.map((c, i) => {
            const local = frame - i * 0; // staggered by active index instead
            void local;
            const isActive = i === active;
            const enter = interpolate(frame % per, [0, 12], [120, 0], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
              easing: outExpo,
            });
            const o = interpolate(frame % per, [0, 10, per - 8, per], [0, 1, 1, 0], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            });
            if (!isActive) return null;
            return (
              <div
                key={c}
                style={{
                  position: 'absolute',
                  transform: `translateY(${enter}px)`,
                  opacity: o,
                  color: OAK,
                  fontSize: 92,
                  fontWeight: 600,
                  letterSpacing: '-0.03em',
                  whiteSpace: 'nowrap',
                }}
              >
                {c}
              </div>
            );
          })}
        </div>
      </div>
      <div style={{ marginTop: 26, color: MUTED, fontSize: 30, borderTop: `1px solid ${LINE}`, paddingTop: 22 }}>
        One platform. Scoping to certification, across every framework.
      </div>
    </AbsoluteFill>
  );
}
