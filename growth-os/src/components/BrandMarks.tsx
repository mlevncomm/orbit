// Marka işaretleri (satır içi SVG): uygulama, Wexon.dev ve Aquails profilleri

type MarkProps = { size?: number; className?: string };

/** Wexon Growth OS: yükselen üç çizgi ve büyüme noktası */
export function GrowthMark({ size = 40, className }: MarkProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden>
      <rect width="48" height="48" rx="14" fill="#0b4f4a" />
      <rect x="0.5" y="0.5" width="47" height="47" rx="13.5" stroke="#3dff9a" strokeOpacity="0.25" />
      <path d="M12 32.5l7.2-8.4 6 5.2L36 16.5" stroke="#3dff9a" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="36" cy="16.5" r="3.6" fill="#3dff9a" />
    </svg>
  );
}

/** Wexon.dev: geometrik W */
export function WexonMark({ size = 40, className }: MarkProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden>
      <path d="M9 15l6.4 19L24 19.5 32.6 34 39 15" stroke="currentColor" strokeWidth="4.2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="39" cy="15" r="2.6" fill="currentColor" opacity="0.55" />
    </svg>
  );
}

/** Aquails: su damlası ve dalga */
export function AquailsMark({ size = 40, className }: MarkProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden>
      <path d="M24 7.5c5.6 7.4 12 14.6 12 22.1A12 12 0 0124 41.6a12 12 0 01-12-12c0-7.5 6.4-14.7 12-22.1z" stroke="currentColor" strokeWidth="3.6" strokeLinejoin="round" />
      <path d="M17.2 30.4c2.2 1.9 4.4 1.9 6.8 0s4.6-1.9 6.8 0" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function ProfileMark({ tenantId, size, className }: MarkProps & { tenantId: string }) {
  return tenantId === "tnt_aquails" ? <AquailsMark size={size} className={className} /> : <WexonMark size={size} className={className} />;
}
