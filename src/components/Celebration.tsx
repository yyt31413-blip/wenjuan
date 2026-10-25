'use client';
import { useEffect, useRef } from 'react';
import confetti from 'canvas-confetti';
export default function Celebration() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!ref.current || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const fire = confetti.create(ref.current, { resize: true, useWorker: false });
    const base = {
      colors: ['#A8E6CF', '#FFFFFF'],
      particleCount: 42,
      spread: 65,
      startVelocity: 23,
      gravity: 0.7,
      ticks: 160,
      scalar: 0.75,
      disableForReducedMotion: true,
    };
    fire({ ...base, origin: { x: 0, y: 0.4 }, angle: 50 });
    fire({ ...base, origin: { x: 1, y: 0.4 }, angle: 130 });
    fire({ ...base, origin: { x: 0.5, y: 0 }, angle: 270, startVelocity: 8, spread: 110 });
    const end = setTimeout(() => {
      fire.reset();
      if (ref.current) ref.current.style.display = 'none';
    }, 3000);
    return () => {
      clearTimeout(end);
      fire.reset();
    };
  }, []);
  return <canvas ref={ref} className="confetti" aria-hidden="true" />;
}
