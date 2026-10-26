/** Logo de TurboSpice: una turbina de cinco cuñas ("iris"); usa el color de acento. */
export function Logo({ size = 22 }: { size?: number }) {
  return (
    <svg className={import.meta.env.VITE_CHANNEL === 'dev' || import.meta.env.VITE_BRANCH === 'dev' ? 'logo logo-dev' : 'logo'} width={size} height={size} viewBox="-38 -38 76 76" aria-hidden="true" fill="currentColor">
      {[0, 72, 144, 216, 288].map((a) => (
        <path key={a} d="M-3 -9 L5 -34 A34 34 0 0 1 31 -15 L7 -4Z" transform={`rotate(${a})`} />
      ))}
    </svg>
  );
}
