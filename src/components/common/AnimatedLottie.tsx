'use client';

import React from 'react';
import Lottie from 'lottie-react';
import { motion, HTMLMotionProps } from 'framer-motion';
import styled from 'styled-components';

interface AnimatedLottieProps extends HTMLMotionProps<'div'> {
  animationData?: unknown;
  path?: string;
  loop?: boolean;
  autoplay?: boolean;
  width?: string | number;
  height?: string | number;
}

const Container = styled(motion.div)<{ $width?: string | number; $height?: string | number }>`
  width: ${props => typeof props.$width === 'number' ? `${props.$width}px` : props.$width || 'auto'};
  height: ${props => typeof props.$height === 'number' ? `${props.$height}px` : props.$height || 'auto'};
  display: flex;
  align-items: center;
  justify-content: center;
`;

/**
 * AnimatedLottie Component
 * Combines Lottie for vector animations and Framer Motion for container animations.
 */
export const AnimatedLottie: React.FC<AnimatedLottieProps> = ({
  animationData,
  path,
  loop = true,
  autoplay = true,
  width,
  height,
  ...motionProps
}) => {
  const [data, setData] = React.useState<unknown>(animationData);

  React.useEffect(() => {
    if (path) {
      fetch(path)
        .then(res => res.json())
        .then(json => setData(json))
        .catch(err => console.error('Failed to load Lottie animation:', err));
    } else if (animationData) {
      setData(animationData);
    }
  }, [path, animationData]);

  if (!data && path) return <Container $width={width} $height={height} {...motionProps} />;

  return (
    <Container
      $width={width}
      $height={height}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      {...motionProps}
    >
      <Lottie
        animationData={data}
        loop={loop}
        autoplay={autoplay}
        style={{ width: '100%', height: '100%' }}
      />
    </Container>
  );
};
