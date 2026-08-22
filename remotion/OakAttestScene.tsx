import {
  AbsoluteFill,
  Img,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  Easing,
} from 'remotion';

/**
 * OakAttest explainer, composited from on-brand unDraw vectors + a code-drawn
 * oak (flat-vector style, so it can grow and drop an acorn).
 *  0–1s    a person waters the ground
 *  1–5s    an oak grows beside her, from the watering
 *  5–6s    an acorn grows on a branch, swings, falls, and is collected
 *  6.5–8s  a soft cross-fade into a full-screen compliance scene
 *  8–11s   a warning document resolves into secured + signed, with
 *          "OakAttest — Security assessments that just click."
 */

const TRUNK = 'oklch(38% 0.055 60)';
const TRUNK_DARK = 'oklch(31% 0.05 58)';
const CANOPY = '#3f8a52';
const CANOPY_HI = '#4f9d61';
const SPROUT = '#3f8a52';
const ACORN_BODY = 'oklch(64% 0.09 72)';
const ACORN_CAP = 'oklch(40% 0.07 60)';
const GLOW = 'oklch(64% 0.17 150)';
const CUT_BG = 'oklch(22% 0.05 158)';
const CUT_BG2 = 'oklch(16% 0.045 158)';
const PAPER = 'oklch(98% 0.01 150)';
const FONT = 'Geist, "Helvetica Neue", Arial, sans-serif';

const easeOut = Easing.out(Easing.cubic);
const easeInOut = Easing.inOut(Easing.cubic);
const easeOutExpo = Easing.out(Easing.exp);
const gravity = Easing.in(Easing.quad);

const GROUND_Y = 884;
const TREE_X = 560; // the oak grows just beside the person
const BRANCH_X = TREE_X + 246;
const BRANCH_Y = 470;

function Acorn({ x, y, rot, scale = 1, opacity = 1 }: { x: number; y: number; rot: number; scale?: number; opacity?: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot}) scale(${scale})`} opacity={opacity}>
      <ellipse cx={0} cy={30} rx={18} ry={24} fill={ACORN_BODY} />
      <ellipse cx={-5} cy={26} rx={5} ry={9} fill="oklch(72% 0.08 80)" opacity={0.6} />
      <path d="M -22 8 Q 0 -10 22 8 Q 22 17 0 17 Q -22 17 -22 8 Z" fill={ACORN_CAP} />
      <rect x={-2.5} y={-18} width={5} height={11} rx={2.5} fill={ACORN_CAP} />
    </g>
  );
}

function CutVector({ file, width, left, top, progress, fromY = 40, label }: { file: string; width: number; left: string; top: string; progress: number; fromY?: number; label?: string }) {
  const o = interpolate(progress, [0, 1], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const y = interpolate(progress, [0, 1], [fromY, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: easeOutExpo });
  return (
    <div style={{ position: 'absolute', left, top, width, opacity: o, transform: `translate(-50%, ${y}px)` }}>
      <div
        style={{
          background: PAPER,
          borderRadius: 24,
          padding: 28,
          boxShadow: '0 30px 70px oklch(0% 0 0 / 0.35)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 16,
        }}
      >
        <Img src={staticFile(`marketing/${file}`)} style={{ width: '100%' }} />
        {label && (
          <span style={{ color: 'oklch(40% 0.06 155)', fontSize: 24, fontWeight: 600, letterSpacing: '-0.01em' }}>
            {label}
          </span>
        )}
      </div>
    </div>
  );
}

export function OakAttestScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Person watering.
  const waterO = interpolate(frame, [0, 22, 244, 262], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const waterX = interpolate(frame, [0, 26], [-130, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: easeOut });

  // Oak grows from the watering.
  const treeGrow = spring({ frame: frame - 34, fps, config: { damping: 200, mass: 1.3 } });
  const treeScale = interpolate(treeGrow, [0, 1], [0.001, 1]);
  const treeOpacity = interpolate(frame, [34, 56], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const sproutO = interpolate(frame, [30, 44, 70], [0, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  // Acorn: grow on branch, swing, fall, collect.
  const acornGrow = interpolate(frame, [140, 158], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: easeOut });
  const swing = Math.sin(((frame - 158) / 16) * Math.PI) * 7;
  const aX = BRANCH_X;
  let aY = BRANCH_Y;
  let aRot = frame >= 158 && frame < 180 ? swing : 0;
  let aScale = acornGrow;
  let aOpacity = 1;
  const stemOpacity = interpolate(frame, [174, 180], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  if (frame >= 180 && frame < 206) {
    // fall
    aY = interpolate(frame, [180, 206], [BRANCH_Y, GROUND_Y - 14], { easing: gravity });
    aRot = interpolate(frame, [180, 206], [0, 340]);
  } else if (frame >= 206) {
    // rest on the ground (settle upright, no bounce)
    aY = GROUND_Y - 14;
    aRot = interpolate(frame, [200, 212], [340, 360], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
    // gentle "captured" pop, then fade as the scene cross-fades.
    aScale = acornGrow * interpolate(frame, [232, 240, 248], [1, 1.14, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
    aOpacity = interpolate(frame, [262, 276], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  }
  // glow ring blooms AT the resting acorn (evidence captured), not flying off.
  const ringP = interpolate(frame, [230, 262], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const ringO = interpolate(ringP, [0, 0.2, 1], [0, 0.55, 0], { extrapolateRight: 'clamp' });
  const ringCx = BRANCH_X;
  const ringCy = GROUND_Y - 14;
  // verified check that draws above the acorn.
  const checkDraw = interpolate(frame, [238, 258], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: easeOut });
  const checkO = interpolate(frame, [236, 246, 264, 276], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  // Smooth cross-fade into the cut, bridged by a soft green flash.
  const sceneOut = interpolate(frame, [264, 300], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: easeInOut });
  const cutBg = interpolate(frame, [270, 304], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: easeInOut });
  const flash = interpolate(frame, [266, 282, 304], [0, 0.5, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  // Cut choreography: the artefact reveals, then the wording.
  const secureP = interpolate(frame, [292, 338], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: easeOut });
  const wordO = interpolate(frame, [346, 380], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  const loopFade = interpolate(frame, [0, 10], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ background: `linear-gradient(180deg, ${PAPER} 0%, oklch(94% 0.016 130) 100%)`, fontFamily: FONT, opacity: loopFade }}>
      {/* ---- Scene A: watering grows the oak -> acorn falls ---- */}
      <AbsoluteFill style={{ opacity: sceneOut }}>
        <svg width="100%" height="100%" viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMid slice">
          <defs>
            <radialGradient id="glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor={GLOW} stopOpacity="0.5" />
              <stop offset="100%" stopColor={GLOW} stopOpacity="0" />
            </radialGradient>
          </defs>
          <rect x={0} y={GROUND_Y} width={1920} height={1080 - GROUND_Y} fill="oklch(89% 0.025 132)" />
          <line x1={0} y1={GROUND_Y} x2={1920} y2={GROUND_Y} stroke="oklch(82% 0.03 135)" strokeWidth={2} />

          {/* sprout the oak rises from */}
          <g opacity={sproutO} transform={`translate(${TREE_X} ${GROUND_Y})`}>
            <path d="M0 0 C 0 -30 0 -50 0 -70" stroke={SPROUT} strokeWidth={6} fill="none" strokeLinecap="round" />
            <path d="M0 -52 C 18 -60 30 -52 34 -38 C 18 -36 4 -42 0 -52 Z" fill={SPROUT} />
            <path d="M0 -64 C -18 -72 -30 -64 -34 -50 C -18 -48 -4 -54 0 -64 Z" fill={SPROUT} />
          </g>

          {/* the oak grows up out of the ground from nothing */}
          <g opacity={treeOpacity} transform={`translate(${TREE_X} ${GROUND_Y}) scale(${treeScale})`} style={{ transformBox: 'fill-box', transformOrigin: 'center bottom' }}>
            <path d="M -26 0 C -22 -120 -16 -210 -10 -300 L 12 -300 C 18 -210 22 -120 26 0 Z" fill={TRUNK} />
            <path d="M 4 -300 C 6 -210 8 -120 10 0 L 26 0 C 22 -120 18 -210 12 -300 Z" fill={TRUNK_DARK} opacity={0.5} />
            <path d="M -4 -250 C 80 -300 180 -300 246 -350" stroke={TRUNK} strokeWidth={14} fill="none" strokeLinecap="round" />
            <path d="M 0 -270 C -90 -320 -180 -320 -240 -360" stroke={TRUNK} strokeWidth={14} fill="none" strokeLinecap="round" />
            <g>
              <ellipse cx={0} cy={-440} rx={210} ry={170} fill={CANOPY} />
              <ellipse cx={-150} cy={-380} rx={150} ry={130} fill={CANOPY} />
              <ellipse cx={160} cy={-390} rx={160} ry={135} fill={CANOPY} />
              <ellipse cx={-70} cy={-520} rx={130} ry={120} fill={CANOPY} />
              <ellipse cx={90} cy={-520} rx={130} ry={120} fill={CANOPY} />
              <ellipse cx={-40} cy={-470} rx={150} ry={90} fill={CANOPY_HI} opacity={0.5} />
            </g>
          </g>

          {ringP > 0 && ringP < 1 && (
            <>
              <circle cx={ringCx} cy={ringCy} r={Math.max(28, ringP * 120)} fill="url(#glow)" opacity={ringO + 0.15} />
              <circle cx={ringCx} cy={ringCy} r={ringP * 170} fill="none" stroke={GLOW} strokeWidth={5} opacity={ringO} />
            </>
          )}

          {/* verified check above the captured acorn */}
          {checkO > 0.01 && (
            <g opacity={checkO} transform={`translate(${BRANCH_X} ${GROUND_Y - 96})`}>
              <circle cx={0} cy={0} r={30} fill="oklch(40% 0.1 150 / 0.14)" stroke={GLOW} strokeWidth={2} />
              <path d="M -13 1 L -4 11 L 14 -12" fill="none" stroke={GLOW} strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - checkDraw} />
            </g>
          )}

          {frame < 180 && (
            <line x1={BRANCH_X + 22} y1={BRANCH_Y - 80} x2={BRANCH_X} y2={BRANCH_Y - 24} stroke={TRUNK_DARK} strokeWidth={3} opacity={stemOpacity * acornGrow} transform={`rotate(${aRot} ${BRANCH_X + 22} ${BRANCH_Y - 80})`} />
          )}
          {aScale > 0.02 && <Acorn x={aX} y={aY} rot={aRot} scale={aScale} opacity={aOpacity} />}
        </svg>

        <div style={{ position: 'absolute', left: 90, bottom: 60, width: 540, opacity: waterO, transform: `translateX(${waterX}px)` }}>
          <Img src={staticFile('marketing/watering-plants.svg')} style={{ width: '100%' }} />
        </div>
      </AbsoluteFill>

      {/* ---- Cross-fade flash ---- */}
      <AbsoluteFill style={{ background: GLOW, opacity: flash, pointerEvents: 'none' }} />

      {/* ---- Cut scene: one large signed-and-certified artefact, then wording ---- */}
      <AbsoluteFill style={{ opacity: cutBg, background: `radial-gradient(120% 120% at 50% 34%, ${CUT_BG} 0%, ${CUT_BG2} 100%)` }}>
        <CutVector file="contract-signed.svg" width={420} left="50%" top="6%" progress={secureP} fromY={50} label="Assessed, secured & certified" />
        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 60 }}>
          <div style={{ opacity: wordO, textAlign: 'center' }}>
            <div style={{ color: PAPER, fontSize: 92, fontWeight: 600, letterSpacing: '-0.03em' }}>OakAttest</div>
            <div style={{ color: 'oklch(93% 0.02 150)', fontSize: 34, fontWeight: 500, marginTop: 12, lineHeight: 1.35 }}>
              Every Oak Starts with an Acorn.
              <br />
              Every Assessment Starts with Evidence.
            </div>
          </div>
        </AbsoluteFill>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
