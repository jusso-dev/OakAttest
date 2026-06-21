import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  Easing,
  spring,
} from 'remotion';

const OAK_BG = 'oklch(22% 0.05 158)';
const OAK_BG_2 = 'oklch(17% 0.045 158)';
const PAPER = 'oklch(97% 0.015 95)';
const LEAF = 'oklch(76% 0.13 150)';
const MUTED = 'oklch(80% 0.03 150)';
const FONT = 'Geist, "Helvetica Neue", Arial, sans-serif';

const FRAMEWORKS = [
  { name: 'ISM', sub: 'Australian Government' },
  { name: 'NIST 800-53', sub: 'Rev 5 baselines' },
  { name: 'SOC 2', sub: 'Trust Services Criteria' },
  { name: 'ISO 27001', sub: 'Annex A' },
];

const outExpo = Easing.out(Easing.exp);

export function Hero() {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // Shield draw + checkmark.
  const shieldDraw = interpolate(frame, [6, 48], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: outExpo,
  });
  const checkDraw = interpolate(frame, [40, 74], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: outExpo,
  });
  const shieldScale = spring({ frame: frame - 6, fps, config: { damping: 200, mass: 0.8 } });

  // Wordmark + tagline.
  const wordY = interpolate(frame, [62, 100], [26, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: outExpo,
  });
  const wordO = interpolate(frame, [62, 96], [0, 1], { extrapolateRight: 'clamp' });
  const tagO = interpolate(frame, [100, 132], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const tagY = interpolate(frame, [100, 132], [16, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: outExpo,
  });

  // Framework ticker: 4 entries cross-fading from frame 150.
  const tickStart = 150;
  const per = 32;
  const idxFloat = (frame - tickStart) / per;
  const activeIdx = Math.max(0, Math.min(FRAMEWORKS.length - 1, Math.floor(idxFloat)));
  const tickerOn = interpolate(frame, [tickStart - 6, tickStart + 8], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Global fade for a seamless loop.
  const loopFade = interpolate(
    frame,
    [0, 12, durationInFrames - 14, durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(120% 120% at 50% 25%, ${OAK_BG} 0%, ${OAK_BG_2} 100%)`,
        fontFamily: FONT,
        opacity: loopFade,
      }}
    >
      {/* subtle grid texture */}
      <AbsoluteFill
        style={{
          backgroundImage:
            'linear-gradient(oklch(100% 0 0 / 0.035) 1px, transparent 1px), linear-gradient(90deg, oklch(100% 0 0 / 0.035) 1px, transparent 1px)',
          backgroundSize: '64px 64px',
          maskImage: 'radial-gradient(80% 70% at 50% 40%, black, transparent)',
        }}
      />

      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 36 }}>
          <svg
            width={210}
            height={230}
            viewBox="0 0 200 220"
            style={{ transform: `scale(${0.9 + shieldScale * 0.1})`, filter: 'drop-shadow(0 18px 40px oklch(0% 0 0 / 0.4))' }}
          >
            <path
              d="M100 12 L176 44 V108 C176 160 142 196 100 210 C58 196 24 160 24 108 V44 Z"
              fill="oklch(100% 0 0 / 0.04)"
              stroke={LEAF}
              strokeWidth={5}
              strokeLinejoin="round"
              pathLength={1}
              strokeDasharray={1}
              strokeDashoffset={1 - shieldDraw}
            />
            <path
              d="M62 110 L90 140 L142 78"
              fill="none"
              stroke={PAPER}
              strokeWidth={9}
              strokeLinecap="round"
              strokeLinejoin="round"
              pathLength={1}
              strokeDasharray={1}
              strokeDashoffset={1 - checkDraw}
            />
          </svg>

          <div
            style={{
              transform: `translateY(${wordY}px)`,
              opacity: wordO,
              color: PAPER,
              fontSize: 96,
              fontWeight: 600,
              letterSpacing: '-0.03em',
            }}
          >
            OakAttest
          </div>

          <div
            style={{
              transform: `translateY(${tagY}px)`,
              opacity: tagO,
              color: MUTED,
              fontSize: 34,
              fontWeight: 400,
              letterSpacing: '-0.01em',
            }}
          >
            The assessment platform for every framework.
          </div>

          {/* Framework ticker */}
          <div
            style={{
              marginTop: 30,
              height: 96,
              opacity: tickerOn,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {FRAMEWORKS.map((fw, i) => {
              const local = (frame - tickStart) - i * per;
              const appear = interpolate(local, [0, 10], [0, 1], {
                extrapolateLeft: 'clamp',
                extrapolateRight: 'clamp',
                easing: outExpo,
              });
              const leave = i < FRAMEWORKS.length - 1
                ? interpolate(local, [per - 8, per], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
                : 1;
              const o = i === activeIdx ? appear * leave : 0;
              const y = interpolate(local, [0, 10], [18, 0], {
                extrapolateLeft: 'clamp',
                extrapolateRight: 'clamp',
                easing: outExpo,
              });
              return (
                <div
                  key={fw.name}
                  style={{
                    position: 'absolute',
                    opacity: o,
                    transform: `translateY(${(1 - (i === activeIdx ? 1 : 0)) * 0 + (i === activeIdx ? y : 0)}px)`,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 16,
                    border: `1px solid ${LEAF}`,
                    borderRadius: 999,
                    padding: '16px 30px',
                    background: 'oklch(100% 0 0 / 0.04)',
                  }}
                >
                  <span style={{ width: 12, height: 12, borderRadius: 999, background: LEAF }} />
                  <span style={{ color: PAPER, fontSize: 42, fontWeight: 600, letterSpacing: '-0.02em' }}>
                    {fw.name}
                  </span>
                  <span style={{ color: MUTED, fontSize: 26 }}>{fw.sub}</span>
                </div>
              );
            })}
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
