import { Composition } from 'remotion';
import { OakAttestScene } from './OakAttestScene';
import { FrameworkTicker } from './FrameworkTicker';

// Remotion compositions for the OakAttest marketing site.
export function RemotionRoot() {
  return (
    <>
      <Composition
        id="Hero"
        component={OakAttestScene}
        durationInFrames={480}
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
