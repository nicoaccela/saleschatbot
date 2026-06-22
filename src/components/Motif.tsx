// The Accela "ascending bars" motif.
export default function Motif({ className = "motif" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 32" aria-hidden="true">
      <rect x="0" y="22" width="8" height="10" fill="var(--blue)" />
      <rect x="13" y="14" width="8" height="18" fill="var(--bright)" />
      <rect x="26" y="8" width="8" height="24" fill="var(--teal)" />
      <rect x="39" y="0" width="8" height="32" fill="var(--yellow)" />
    </svg>
  );
}
