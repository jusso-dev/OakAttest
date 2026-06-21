import { Composition } from 'remotion';
import { Hero } from './Hero';
import { FrameworkTicker } from './FrameworkTicker';

// Remotion compositions for the OakAttest marketing site.
export function RemotionRoot() {
  return (
    <>
      <Composition
        id="Hero"
        component={Hero}
        durationInFrames={300}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="FrameworkTicker"
        component={FrameworkTicker}
        durationInFrames={240}
        fps={30}
        width={1600}
        height={520}
      />
    </>
  );
}
