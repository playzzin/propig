import React from 'react';
import { registerRoot, Composition } from 'remotion';
import { MyComposition } from './Composition';

const RemotionRoot: React.FC = () => {
    return (
        <Composition
            id="MyComp"
            component={MyComposition}
            durationInFrames={120}
            fps={30}
            width={1920}
            height={1080}
        />
  );
};

registerRoot(RemotionRoot);
