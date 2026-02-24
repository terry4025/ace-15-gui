type CoverProps = {
  seed: string;
  title?: string;
  size?: number; // px
};

function hashSeed(s: string): number {
  // Small deterministic hash for stable cover colors.
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function hueFrom(h: number, offset: number) {
  return (h + offset) % 360;
}

export function Cover(props: CoverProps) {
  const size = props.size ?? 56;
  const h = hashSeed(props.seed || "ace-step");
  const h1 = hueFrom(h % 360, 0);
  const h2 = hueFrom((h >>> 8) % 360, 90);
  const h3 = hueFrom((h >>> 16) % 360, 210);
  const bg = `radial-gradient(90% 120% at 15% 15%, hsla(${h1}, 90%, 65%, 0.55), transparent 62%),
              radial-gradient(90% 120% at 80% 20%, hsla(${h2}, 90%, 62%, 0.45), transparent 60%),
              radial-gradient(120% 160% at 60% 90%, hsla(${h3}, 90%, 62%, 0.35), transparent 70%),
              linear-gradient(135deg, rgba(255,255,255,0.10), rgba(255,255,255,0.03))`;

  const letter = (props.title || props.seed || "A").trim().slice(0, 1).toUpperCase();
  return (
    <div
      className="cover"
      style={{ width: size, height: size, background: bg }}
      title={props.title || ""}
      aria-label={props.title || "Cover"}
      role="img"
    >
      <div className="coverLetter">{letter}</div>
    </div>
  );
}

