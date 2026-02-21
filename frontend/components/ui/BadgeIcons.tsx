import type { BadgeCategory } from "@/lib/types";

const CATEGORY_COLORS: Record<BadgeCategory, { fill: string; stroke: string; glow: string }> = {
  contributor:    { fill: "#FEC508", stroke: "#D4A507", glow: "rgba(254,197,8,0.3)" },
  philanthropist: { fill: "#34D399", stroke: "#059669", glow: "rgba(52,211,153,0.3)" },
  juror:          { fill: "#A78BFA", stroke: "#7C3AED", glow: "rgba(167,139,250,0.3)" },
  community:      { fill: "#60A5FA", stroke: "#2563EB", glow: "rgba(96,165,250,0.3)" },
};

const TIER_SIZES = { 1: 0.7, 2: 0.85, 3: 1.0 };

function HexShell({
  fill,
  stroke,
  glow,
  earned,
  children,
}: {
  fill: string;
  stroke: string;
  glow: string;
  earned: boolean;
  children: React.ReactNode;
}) {
  const opacity = earned ? 1 : 0.2;
  return (
    <svg viewBox="0 0 64 72" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <defs>
        {earned && (
          <filter id={`glow-${fill.replace("#", "")}`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        )}
      </defs>
      <g opacity={opacity} filter={earned ? `url(#glow-${fill.replace("#", "")})` : undefined}>
        <path
          d="M32 2L58 19V53L32 70L6 53V19L32 2Z"
          fill={earned ? `${fill}15` : "transparent"}
          stroke={earned ? stroke : "currentColor"}
          strokeWidth="2"
          className={earned ? "" : "text-agentbase-border"}
        />
        {earned && (
          <path
            d="M32 8L52 22V50L32 64L12 50V22L32 8Z"
            fill={`${fill}20`}
            stroke={`${fill}40`}
            strokeWidth="0.5"
          />
        )}
        <g transform="translate(32, 36)" className={earned ? "" : "text-agentbase-muted"}>
          {children}
        </g>
      </g>
    </svg>
  );
}

function SeedlingIcon({ earned, fill }: { earned: boolean; fill: string }) {
  const c = earned ? fill : "currentColor";
  return (
    <g>
      <line x1="0" y1="12" x2="0" y2="-2" stroke={c} strokeWidth="2" strokeLinecap="round" />
      <path d="M0 -2C0 -2 -8 -10 -8 -14C-8 -18 -4 -18 0 -14" stroke={c} strokeWidth="1.5" fill={`${c}30`} strokeLinecap="round" />
      <path d="M0 -6C0 -6 8 -12 8 -16C8 -20 4 -20 0 -16" stroke={c} strokeWidth="1.5" fill={`${c}30`} strokeLinecap="round" />
      <ellipse cx="-4" cy="12" rx="4" ry="2" fill={`${c}40`} />
      <ellipse cx="4" cy="12" rx="4" ry="2" fill={`${c}40`} />
    </g>
  );
}

function PollinatorIcon({ earned, fill }: { earned: boolean; fill: string }) {
  const c = earned ? fill : "currentColor";
  return (
    <g>
      <ellipse cx="0" cy="2" rx="6" ry="8" fill={`${c}50`} stroke={c} strokeWidth="1.5" />
      <line x1="-6" y1="-2" x2="-4" y2="-4" stroke={c} strokeWidth="1" />
      <line x1="6" y1="-2" x2="4" y2="-4" stroke={c} strokeWidth="1" />
      <ellipse cx="0" cy="2" rx="6" ry="1.5" fill={`${c}30`} />
      <ellipse cx="0" cy="5" rx="6" ry="1.5" fill={`${c}30`} />
      <path d="M-9 -6C-14 -12 -8 -16 -4 -10" stroke={c} strokeWidth="1" fill={`${c}15`} />
      <path d="M9 -6C14 -12 8 -16 4 -10" stroke={c} strokeWidth="1" fill={`${c}15`} />
      <circle cx="-2" cy="-4" r="1" fill={c} />
      <circle cx="2" cy="-4" r="1" fill={c} />
    </g>
  );
}

function HiveArchitectIcon({ earned, fill }: { earned: boolean; fill: string }) {
  const c = earned ? fill : "currentColor";
  return (
    <g>
      <path d="M0 -16L10 -10V2L0 8L-10 2V-10Z" fill={`${c}30`} stroke={c} strokeWidth="1.5" />
      <path d="M-12 -4L-2 -10V2L-12 8L-22 2V-10Z" fill={`${c}15`} stroke={c} strokeWidth="1" transform="translate(11, 12)" />
      <path d="M-12 -4L-2 -10V2L-12 8L-22 2V-10Z" fill={`${c}15`} stroke={c} strokeWidth="1" transform="translate(-11, 12)" />
      <circle cx="0" cy="-4" r="2" fill={c} />
    </g>
  );
}

function QueenBeeIcon({ earned, fill }: { earned: boolean; fill: string }) {
  const c = earned ? fill : "currentColor";
  return (
    <g>
      <path d="M-8 -6L-4 -16L0 -8L4 -16L8 -6" stroke={c} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="-4" cy="-16" r="2" fill={c} />
      <circle cx="0" cy="-8" r="2" fill={c} />
      <circle cx="4" cy="-16" r="2" fill={c} />
      <ellipse cx="0" cy="4" rx="9" ry="10" fill={`${c}40`} stroke={c} strokeWidth="1.5" />
      <ellipse cx="0" cy="4" rx="9" ry="2" fill={`${c}25`} />
      <ellipse cx="0" cy="8" rx="9" ry="2" fill={`${c}25`} />
      <path d="M-6 -2C-10 -6 -6 -10 -2 -6" stroke={c} strokeWidth="0.8" fill={`${c}15`} />
      <path d="M6 -2C10 -6 6 -10 2 -6" stroke={c} strokeWidth="0.8" fill={`${c}15`} />
    </g>
  );
}

function FirstNectarIcon({ earned, fill }: { earned: boolean; fill: string }) {
  const c = earned ? fill : "currentColor";
  return (
    <g>
      <path d="M0 -14C-4 -14 -8 -10 -8 -6L-6 8C-6 12 6 12 6 8L8 -6C8 -10 4 -14 0 -14Z" fill={`${c}30`} stroke={c} strokeWidth="1.5" />
      <ellipse cx="0" cy="4" rx="4" ry="6" fill={`${c}50`} />
      <circle cx="0" cy="-2" r="1.5" fill={c} opacity="0.6" />
    </g>
  );
}

function HoneyPotIcon({ earned, fill }: { earned: boolean; fill: string }) {
  const c = earned ? fill : "currentColor";
  return (
    <g>
      <ellipse cx="0" cy="-12" rx="6" ry="3" fill={`${c}20`} stroke={c} strokeWidth="1.5" />
      <rect x="-8" y="-10" width="16" height="4" rx="1" fill={`${c}40`} stroke={c} strokeWidth="1" />
      <path d="M-10 -6C-10 -6 -12 4 -10 10C-8 14 8 14 10 10C12 4 10 -6 10 -6" fill={`${c}30`} stroke={c} strokeWidth="1.5" />
      <ellipse cx="0" cy="4" rx="6" ry="8" fill={`${c}40`} />
      <path d="M-3 0Q0 8 3 0" stroke={c} strokeWidth="1" fill={`${c}60`} />
    </g>
  );
}

function GoldenFlowIcon({ earned, fill }: { earned: boolean; fill: string }) {
  const c = earned ? fill : "currentColor";
  return (
    <g>
      <path d="M0 -16Q-6 -8 0 0Q6 8 0 16" stroke={c} strokeWidth="2" fill="none" strokeLinecap="round" />
      <path d="M-4 -12Q-10 -4 -4 4Q2 12 -4 16" stroke={c} strokeWidth="1" fill="none" opacity="0.5" />
      <path d="M4 -12Q10 -4 4 4Q-2 12 4 16" stroke={c} strokeWidth="1" fill="none" opacity="0.5" />
      <circle cx="0" cy="-16" r="3" fill={c} opacity="0.8" />
      <circle cx="0" cy="0" r="2.5" fill={c} opacity="0.6" />
      <circle cx="0" cy="16" r="2" fill={c} opacity="0.4" />
    </g>
  );
}

function BenefactorIcon({ earned, fill }: { earned: boolean; fill: string }) {
  const c = earned ? fill : "currentColor";
  return (
    <g>
      <path d="M0 -6L-12 -14L-8 -2L-18 4L-6 4L0 16L6 4L18 4L8 -2L12 -14Z" fill={`${c}40`} stroke={c} strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx="0" cy="0" r="5" fill={`${c}60`} stroke={c} strokeWidth="1" />
      <text x="0" y="3" textAnchor="middle" fill={c} fontSize="8" fontWeight="bold" fontFamily="monospace">$</text>
    </g>
  );
}

function FirstVerdictIcon({ earned, fill }: { earned: boolean; fill: string }) {
  const c = earned ? fill : "currentColor";
  return (
    <g>
      <rect x="-8" y="-14" width="16" height="20" rx="2" fill={`${c}20`} stroke={c} strokeWidth="1.5" />
      <line x1="-4" y1="-8" x2="4" y2="-8" stroke={c} strokeWidth="1" strokeLinecap="round" />
      <line x1="-4" y1="-4" x2="4" y2="-4" stroke={c} strokeWidth="1" strokeLinecap="round" />
      <line x1="-4" y1="0" x2="2" y2="0" stroke={c} strokeWidth="1" strokeLinecap="round" />
      <path d="M-2 6L2 10L8 2" stroke={c} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </g>
  );
}

function WiseBeeIcon({ earned, fill }: { earned: boolean; fill: string }) {
  const c = earned ? fill : "currentColor";
  return (
    <g>
      <circle cx="0" cy="-4" r="10" fill={`${c}15`} stroke={c} strokeWidth="1.5" />
      <circle cx="0" cy="-4" r="6" fill={`${c}25`} stroke={c} strokeWidth="1" />
      <circle cx="-3" cy="-6" r="2" fill={c} opacity="0.7" />
      <circle cx="3" cy="-6" r="2" fill={c} opacity="0.7" />
      <path d="M-3 0Q0 3 3 0" stroke={c} strokeWidth="1" fill="none" strokeLinecap="round" />
      <path d="M-4 -16L-2 -12" stroke={c} strokeWidth="1.5" strokeLinecap="round" />
      <path d="M4 -16L2 -12" stroke={c} strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="-4" cy="-17" r="1.5" fill={c} opacity="0.6" />
      <circle cx="4" cy="-17" r="1.5" fill={c} opacity="0.6" />
      <path d="M-8 8L-12 12" stroke={c} strokeWidth="1" opacity="0.4" />
      <path d="M8 8L12 12" stroke={c} strokeWidth="1" opacity="0.4" />
      <path d="M0 10L0 14" stroke={c} strokeWidth="1" opacity="0.4" />
    </g>
  );
}

function OracleIcon({ earned, fill }: { earned: boolean; fill: string }) {
  const c = earned ? fill : "currentColor";
  return (
    <g>
      <path d="M0 -16C-10 -16 -14 -8 -14 0C-14 8 -8 14 0 16C8 14 14 8 14 0C14 -8 10 -16 0 -16Z" fill={`${c}15`} stroke={c} strokeWidth="1.5" />
      <circle cx="0" cy="-2" r="8" fill={`${c}30`} stroke={c} strokeWidth="1" />
      <circle cx="0" cy="-2" r="4" fill={`${c}60`} />
      <circle cx="0" cy="-2" r="1.5" fill={c} />
      <path d="M-10 -12L-6 -8" stroke={c} strokeWidth="0.8" opacity="0.5" />
      <path d="M10 -12L6 -8" stroke={c} strokeWidth="0.8" opacity="0.5" />
      <path d="M-12 4L-8 2" stroke={c} strokeWidth="0.8" opacity="0.5" />
      <path d="M12 4L8 2" stroke={c} strokeWidth="0.8" opacity="0.5" />
    </g>
  );
}

function VoiceIcon({ earned, fill }: { earned: boolean; fill: string }) {
  const c = earned ? fill : "currentColor";
  return (
    <g>
      <path d="M-8 -8L-8 4L-2 4L6 12L6 -16L-2 -8Z" fill={`${c}30`} stroke={c} strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M10 -6Q14 0 10 6" stroke={c} strokeWidth="1.5" fill="none" strokeLinecap="round" />
      <path d="M13 -10Q19 0 13 10" stroke={c} strokeWidth="1" fill="none" strokeLinecap="round" opacity="0.5" />
    </g>
  );
}

function MegaphoneIcon({ earned, fill }: { earned: boolean; fill: string }) {
  const c = earned ? fill : "currentColor";
  return (
    <g>
      <path d="M-6 -4L-6 6L-2 6L-2 -4Z" fill={`${c}40`} stroke={c} strokeWidth="1.5" />
      <path d="M-2 -10L-2 12L12 18L12 -16Z" fill={`${c}25`} stroke={c} strokeWidth="1.5" strokeLinejoin="round" />
      <ellipse cx="12" cy="1" rx="4" ry="17" fill={`${c}15`} stroke={c} strokeWidth="1" />
      <line x1="-8" y1="6" x2="-10" y2="14" stroke={c} strokeWidth="1.5" strokeLinecap="round" />
      <line x1="-4" y1="6" x2="-6" y2="14" stroke={c} strokeWidth="1.5" strokeLinecap="round" />
    </g>
  );
}

function BeaconIcon({ earned, fill }: { earned: boolean; fill: string }) {
  const c = earned ? fill : "currentColor";
  return (
    <g>
      <path d="M-3 16L3 16L5 4L-5 4Z" fill={`${c}40`} stroke={c} strokeWidth="1.5" />
      <circle cx="0" cy="-4" r="8" fill={`${c}30`} stroke={c} strokeWidth="1.5" />
      <circle cx="0" cy="-4" r="3" fill={c} opacity="0.8" />
      <path d="M-12 -4A12 12 0 0 1 0 -16" stroke={c} strokeWidth="1" fill="none" opacity="0.4" />
      <path d="M12 -4A12 12 0 0 0 0 -16" stroke={c} strokeWidth="1" fill="none" opacity="0.4" />
      <path d="M-16 -4A16 16 0 0 1 0 -20" stroke={c} strokeWidth="0.8" fill="none" opacity="0.25" />
      <path d="M16 -4A16 16 0 0 0 0 -20" stroke={c} strokeWidth="0.8" fill="none" opacity="0.25" />
    </g>
  );
}

const ICON_MAP: Record<string, React.FC<{ earned: boolean; fill: string }>> = {
  seedling: SeedlingIcon,
  pollinator: PollinatorIcon,
  hive_architect: HiveArchitectIcon,
  queen_bee: QueenBeeIcon,
  first_nectar: FirstNectarIcon,
  honey_pot: HoneyPotIcon,
  golden_flow: GoldenFlowIcon,
  benefactor: BenefactorIcon,
  first_verdict: FirstVerdictIcon,
  wise_bee: WiseBeeIcon,
  oracle: OracleIcon,
  voice: VoiceIcon,
  megaphone: MegaphoneIcon,
  beacon: BeaconIcon,
};

export default function BadgeIcon({
  badgeKey,
  category,
  tier,
  earned,
}: {
  badgeKey: string;
  category: BadgeCategory;
  tier: number;
  earned: boolean;
}) {
  const colors = CATEGORY_COLORS[category];
  const InnerIcon = ICON_MAP[badgeKey];
  const scale = TIER_SIZES[tier as keyof typeof TIER_SIZES] ?? 1;

  return (
    <div
      className="relative"
      style={{ width: `${scale * 64}px`, height: `${scale * 72}px` }}
    >
      <HexShell fill={colors.fill} stroke={colors.stroke} glow={colors.glow} earned={earned}>
        {InnerIcon && <InnerIcon earned={earned} fill={colors.fill} />}
      </HexShell>
    </div>
  );
}
