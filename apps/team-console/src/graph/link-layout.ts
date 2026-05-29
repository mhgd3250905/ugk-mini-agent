export function linkMidpoint(
  source: { x: number; y: number },
  target: { x: number; y: number },
): { x: number; y: number } {
  return {
    x: (source.x + target.x) / 2,
    y: (source.y + target.y) / 2,
  };
}
