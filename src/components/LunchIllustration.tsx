'use client';

import { useEffect, useRef, type PointerEvent } from 'react';

export default function LunchIllustration() {
  const container = useRef<HTMLDivElement>(null);
  const canTilt = useRef(false);

  function reset() {
    container.current?.style.removeProperty('--lunch-tilt-x');
    container.current?.style.removeProperty('--lunch-tilt-y');
  }

  useEffect(() => {
    const preference = window.matchMedia('(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)');
    const update = () => {
      canTilt.current = preference.matches;
      if (!preference.matches) {
        container.current?.style.removeProperty('--lunch-tilt-x');
        container.current?.style.removeProperty('--lunch-tilt-y');
      }
    };
    update();
    preference.addEventListener('change', update);
    return () => preference.removeEventListener('change', update);
  }, []);

  function tilt(event: PointerEvent<HTMLDivElement>) {
    if (!canTilt.current || event.pointerType !== 'mouse') return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = Math.max(-1, Math.min(1, (event.clientX - bounds.left) / bounds.width * 2 - 1));
    const y = Math.max(-1, Math.min(1, (event.clientY - bounds.top) / bounds.height * 2 - 1));
    event.currentTarget.style.setProperty('--lunch-tilt-x', `${-y * 5}deg`);
    event.currentTarget.style.setProperty('--lunch-tilt-y', `${x * 6}deg`);
  }

  return <div className="lunch-mark" ref={container} aria-hidden="true" onPointerMove={tilt} onPointerLeave={reset} onPointerCancel={reset}>
    <div className="lunch-scene">
      <div className="lunch-box">
        <div className="rice"><i /><i /><i /><i /><i /><i /></div>
        <div className="greens"><i /><i /><i /></div>
        <div className="tofu"><i /><i /><i /><i /></div>
      </div>
    </div>
  </div>;
}
