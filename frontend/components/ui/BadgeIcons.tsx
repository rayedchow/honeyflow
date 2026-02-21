import type { BadgeCategory } from "@/lib/types";

const CATEGORY_COLORS: Record<BadgeCategory, { fill: string; stroke: string; glow: string }> = {
  contributor:    { fill: "#FEC508", stroke: "#D4A507", glow: "rgba(254,197,8,0.35)" },
  philanthropist: { fill: "#34D399", stroke: "#059669", glow: "rgba(52,211,153,0.35)" },
  juror:          { fill: "#A78BFA", stroke: "#7C3AED", glow: "rgba(167,139,250,0.35)" },
  community:      { fill: "#60A5FA", stroke: "#2563EB", glow: "rgba(96,165,250,0.35)" },
};

const TIER_SIZES = { 1: 0.7, 2: 0.85, 3: 1.0 };

/* ── Shared hexagon base for every badge ────────────────────────── */
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
  const uid = fill.replace("#", "");
  const opacity = earned ? 1 : 0.25;
  return (
    <svg viewBox="0 0 64 72" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <defs>
        {earned && (
          <filter id={`glow-${uid}`} x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="2.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        )}
      </defs>
      <g opacity={opacity} filter={earned ? `url(#glow-${uid})` : undefined}>
        {/* Outer hexagon border */}
        <path
          d="M32 2L58 19V53L32 70L6 53V19L32 2Z"
          fill={earned ? `${fill}10` : "transparent"}
          stroke={earned ? stroke : "currentColor"}
          strokeWidth="2"
          strokeLinejoin="round"
          className={earned ? "" : "text-agentbase-border"}
        />
        {/* Inner hexagon fill */}
        <path
          d="M32 8L52 22V50L32 64L12 50V22L32 8Z"
          fill={earned ? `${fill}18` : "currentColor"}
          stroke={earned ? `${fill}40` : "currentColor"}
          strokeWidth="0.75"
          strokeLinejoin="round"
          className={earned ? "" : "text-agentbase-border"}
          opacity={earned ? 1 : 0.15}
        />
        {/* Icon centred in hex */}
        <g transform="translate(32,36)" className={earned ? "" : "text-agentbase-muted"}>
          {children}
        </g>
      </g>
    </svg>
  );
}

/* ── Icon helpers ─────────────────────────────────────────────────
   Every icon is drawn in a ±12 unit box around the origin so they
   all sit consistently inside the inner hexagon.  Stroke widths and
   fill opacities are standardised.                                */

function SeedlingIcon({ earned, fill }: { earned: boolean; fill: string }) {
  const c = earned ? fill : "currentColor";
  return (
    <g>
      <line x1="0" y1="10" x2="0" y2="-2" stroke={c} strokeWidth="2" strokeLinecap="round" />
      <path d="M0 -1Q-6 -7 -7 -11Q-7 -14 -3 -13Q0 -12 0 -7" stroke={c} strokeWidth="1.5" fill={`${c}25`} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M0 -4Q6 -9 7 -13Q7 -16 3 -15Q0 -14 0 -10" stroke={c} strokeWidth="1.5" fill={`${c}25`} strokeLinecap="round" strokeLinejoin="round" />
      <ellipse cx="0" cy="10" rx="5" ry="1.5" fill={`${c}30`} />
    </g>
  );
}

function PollinatorIcon({ earned, fill }: { earned: boolean; fill: string }) {
  const c = earned ? fill : "currentColor";
  return (
    <g>
      {/* Wings */}
      <ellipse cx="-7" cy="-4" rx="5" ry="7" fill={`${c}18`} stroke={c} strokeWidth="1" transform="rotate(-15,-7,-4)" />
      <ellipse cx="7" cy="-4" rx="5" ry="7" fill={`${c}18`} stroke={c} strokeWidth="1" transform="rotate(15,7,-4)" />
      {/* Body */}
      <ellipse cx="0" cy="2" rx="4" ry="8" fill={`${c}40`} stroke={c} strokeWidth="1.5" />
      {/* Stripes */}
      <line x1="-3.5" y1="0" x2="3.5" y2="0" stroke={c} strokeWidth="0.75" opacity="0.5" />
      <line x1="-3.8" y1="3" x2="3.8" y2="3" stroke={c} strokeWidth="0.75" opacity="0.5" />
      <line x1="-3.5" y1="6" x2="3.5" y2="6" stroke={c} strokeWidth="0.75" opacity="0.5" />
      {/* Eyes */}
      <circle cx="-1.5" cy="-4" r="1" fill={c} />
      <circle cx="1.5" cy="-4" r="1" fill={c} />
      {/* Antennae */}
      <path d="M-1 -6Q-3 -11 -5 -12" stroke={c} strokeWidth="1" fill="none" strokeLinecap="round" />
      <path d="M1 -6Q3 -11 5 -12" stroke={c} strokeWidth="1" fill="none" strokeLinecap="round" />
      <circle cx="-5" cy="-12" r="1" fill={c} opacity="0.6" />
      <circle cx="5" cy="-12" r="1" fill={c} opacity="0.6" />
    </g>
  );
}

function HiveArchitectIcon({ earned, fill }: { earned: boolean; fill: string }) {
  const c = earned ? fill : "currentColor";
  /* Three interlocking mini-hexagons */
  const hex = "L4.5 -2.5V2.5L0 5L-4.5 2.5V-2.5Z";
  return (
    <g>
      <path d={`M0 -10${hex}`} fill={`${c}30`} stroke={c} strokeWidth="1.5" strokeLinejoin="round" transform="translate(0,-3)" />
      <path d={`M0 -10${hex}`} fill={`${c}20`} stroke={c} strokeWidth="1.25" strokeLinejoin="round" transform="translate(-5.5,5.5)" />
      <path d={`M0 -10${hex}`} fill={`${c}20`} stroke={c} strokeWidth="1.25" strokeLinejoin="round" transform="translate(5.5,5.5)" />
      <circle cx="0" cy="-3" r="1.5" fill={c} opacity="0.7" />
    </g>
  );
}

function QueenBeeIcon({ earned, fill }: { earned: boolean; fill: string }) {
  const c = earned ? fill : "currentColor";
  return (
    <g>
      {/* Crown */}
      <path d="M-7 -5L-4 -13L0 -7L4 -13L7 -5" stroke={c} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="-4" cy="-13" r="1.5" fill={c} />
      <circle cx="0" cy="-7" r="1.5" fill={c} />
      <circle cx="4" cy="-13" r="1.5" fill={c} />
      {/* Body */}
      <ellipse cx="0" cy="4" rx="7" ry="8" fill={`${c}30`} stroke={c} strokeWidth="1.5" />
      {/* Stripes */}
      <line x1="-6" y1="2" x2="6" y2="2" stroke={c} strokeWidth="0.75" opacity="0.4" />
      <line x1="-6.5" y1="5" x2="6.5" y2="5" stroke={c} strokeWidth="0.75" opacity="0.4" />
      <line x1="-6" y1="8" x2="6" y2="8" stroke={c} strokeWidth="0.75" opacity="0.4" />
      {/* Wings */}
      <path d="M-7 0Q-12 -5 -9 -9" stroke={c} strokeWidth="1" fill={`${c}12`} strokeLinecap="round" />
      <path d="M7 0Q12 -5 9 -9" stroke={c} strokeWidth="1" fill={`${c}12`} strokeLinecap="round" />
    </g>
  );
}

function FirstNectarIcon({ earned, fill }: { earned: boolean; fill: string }) {
  const c = earned ? fill : "currentColor";
  return (
    <g>
      {/* Droplet */}
      <path d="M0 -12Q-8 -2 -8 4A8 8 0 0 0 8 4Q8 -2 0 -12Z" fill={`${c}30`} stroke={c} strokeWidth="1.5" strokeLinejoin="round" />
      {/* Highlight */}
      <ellipse cx="0" cy="3" rx="4" ry="5" fill={`${c}20`} />
      <circle cx="-2" cy="0" r="1.5" fill={c} opacity="0.4" />
    </g>
  );
}

function HoneyPotIcon({ earned, fill }: { earned: boolean; fill: string }) {
  const c = earned ? fill : "currentColor";
  return (
    <g>
      {/* Lid */}
      <rect x="-7" y="-11" width="14" height="3.5" rx="1.5" fill={`${c}40`} stroke={c} strokeWidth="1.25" />
      <ellipse cx="0" cy="-12.5" rx="4" ry="2" fill={`${c}25`} stroke={c} strokeWidth="1" />
      {/* Pot body */}
      <path d="M-8 -7.5Q-9 2 -7 8Q-5 12 5 12Q7 12 7 8Q9 2 8 -7.5" fill={`${c}25`} stroke={c} strokeWidth="1.5" strokeLinejoin="round" />
      {/* Honey drip */}
      <path d="M-2.5 -1Q0 7 2.5 -1" stroke={c} strokeWidth="1.25" fill={`${c}45`} strokeLinecap="round" />
    </g>
  );
}

function GoldenFlowIcon({ earned, fill }: { earned: boolean; fill: string }) {
  const c = earned ? fill : "currentColor";
  return (
    <g>
      {/* Three flowing streams */}
      <path d="M0 -13Q-5 -5 0 0Q5 5 0 13" stroke={c} strokeWidth="2" fill="none" strokeLinecap="round" />
      <path d="M-5 -10Q-10 -2 -5 4Q0 10 -5 14" stroke={c} strokeWidth="1" fill="none" opacity="0.45" strokeLinecap="round" />
      <path d="M5 -10Q10 -2 5 4Q0 10 5 14" stroke={c} strokeWidth="1" fill="none" opacity="0.45" strokeLinecap="round" />
      {/* Droplets */}
      <circle cx="0" cy="-13" r="2.5" fill={c} opacity="0.75" />
      <circle cx="0" cy="0" r="2" fill={c} opacity="0.55" />
      <circle cx="0" cy="13" r="1.5" fill={c} opacity="0.35" />
    </g>
  );
}

function BenefactorIcon({ earned, fill }: { earned: boolean; fill: string }) {
  const c = earned ? fill : "currentColor";
  return (
    <g>
      {/* Star */}
      <path d="M0 -12L3 -4L11 -4L5 1L7 9L0 5L-7 9L-5 1L-11 -4L-3 -4Z" fill={`${c}30`} stroke={c} strokeWidth="1.5" strokeLinejoin="round" />
      {/* Centre gem */}
      <circle cx="0" cy="-1" r="4" fill={`${c}50`} stroke={c} strokeWidth="1" />
      <path d="M-2.5 -1L0 -3.5L2.5 -1L0 1.5Z" fill={c} opacity="0.7" />
    </g>
  );
}

function FirstVerdictIcon({ earned, fill }: { earned: boolean; fill: string }) {
  const c = earned ? fill : "currentColor";
  return (
    <g>
      {/* Gavel head */}
      <rect x="-10" y="-12" width="20" height="7" rx="2" fill={`${c}30`} stroke={c} strokeWidth="1.5" />
      {/* Handle */}
      <line x1="0" y1="-5" x2="0" y2="8" stroke={c} strokeWidth="2" strokeLinecap="round" />
      {/* Base */}
      <rect x="-6" y="8" width="12" height="3" rx="1" fill={`${c}40`} stroke={c} strokeWidth="1.25" />
      {/* Strike lines */}
      <path d="M-5 -4L-8 -1" stroke={c} strokeWidth="1" opacity="0.4" strokeLinecap="round" />
      <path d="M5 -4L8 -1" stroke={c} strokeWidth="1" opacity="0.4" strokeLinecap="round" />
    </g>
  );
}

function WiseBeeIcon({ earned, fill }: { earned: boolean; fill: string }) {
  const c = earned ? fill : "currentColor";
  return (
    <g>
      {/* Scales of justice */}
      {/* Centre post */}
      <line x1="0" y1="-12" x2="0" y2="10" stroke={c} strokeWidth="1.5" strokeLinecap="round" />
      {/* Balance beam */}
      <line x1="-10" y1="-8" x2="10" y2="-8" stroke={c} strokeWidth="1.5" strokeLinecap="round" />
      {/* Left pan */}
      <path d="M-10 -8L-13 0L-7 0Z" fill={`${c}25`} stroke={c} strokeWidth="1.25" strokeLinejoin="round" />
      <ellipse cx="-10" cy="0" rx="4" ry="1" fill={`${c}35`} stroke={c} strokeWidth="0.75" />
      {/* Right pan */}
      <path d="M10 -8L7 0L13 0Z" fill={`${c}25`} stroke={c} strokeWidth="1.25" strokeLinejoin="round" />
      <ellipse cx="10" cy="0" rx="4" ry="1" fill={`${c}35`} stroke={c} strokeWidth="0.75" />
      {/* Base */}
      <rect x="-4" y="10" width="8" height="2.5" rx="1" fill={`${c}30`} stroke={c} strokeWidth="1" />
      {/* Fulcrum diamond */}
      <path d="M0 -12L2 -10L0 -8L-2 -10Z" fill={c} opacity="0.6" />
    </g>
  );
}

function OracleIcon({ earned, fill }: { earned: boolean; fill: string }) {
  const c = earned ? fill : "currentColor";
  return (
    <g>
      {/* Outer eye / aura */}
      <circle cx="0" cy="-1" r="12" fill={`${c}10`} stroke={c} strokeWidth="0.75" opacity="0.4" />
      {/* Inner ring */}
      <circle cx="0" cy="-1" r="8" fill={`${c}18`} stroke={c} strokeWidth="1.25" />
      {/* Iris */}
      <circle cx="0" cy="-1" r="4.5" fill={`${c}40`} stroke={c} strokeWidth="1" />
      {/* Pupil */}
      <circle cx="0" cy="-1" r="2" fill={c} />
      {/* Highlight */}
      <circle cx="-1.5" cy="-2.5" r="1" fill="white" opacity="0.5" />
      {/* Radial lines */}
      <line x1="0" y1="-14" x2="0" y2="-12" stroke={c} strokeWidth="0.75" opacity="0.35" strokeLinecap="round" />
      <line x1="9" y1="-10" x2="7.5" y2="-8.5" stroke={c} strokeWidth="0.75" opacity="0.35" strokeLinecap="round" />
      <line x1="-9" y1="-10" x2="-7.5" y2="-8.5" stroke={c} strokeWidth="0.75" opacity="0.35" strokeLinecap="round" />
      <line x1="9" y1="8" x2="7.5" y2="6.5" stroke={c} strokeWidth="0.75" opacity="0.35" strokeLinecap="round" />
      <line x1="-9" y1="8" x2="-7.5" y2="6.5" stroke={c} strokeWidth="0.75" opacity="0.35" strokeLinecap="round" />
    </g>
  );
}

function VoiceIcon({ earned, fill }: { earned: boolean; fill: string }) {
  const c = earned ? fill : "currentColor";
  return (
    <g>
      {/* Speech bubble */}
      <rect x="-10" y="-11" width="20" height="16" rx="3" fill={`${c}25`} stroke={c} strokeWidth="1.5" />
      {/* Tail */}
      <path d="M-3 5L-6 10L2 5" fill={`${c}25`} stroke={c} strokeWidth="1.5" strokeLinejoin="round" />
      {/* Sound lines inside */}
      <line x1="-5" y1="-5" x2="5" y2="-5" stroke={c} strokeWidth="1.25" strokeLinecap="round" opacity="0.6" />
      <line x1="-5" y1="-1" x2="3" y2="-1" stroke={c} strokeWidth="1.25" strokeLinecap="round" opacity="0.4" />
    </g>
  );
}

function MegaphoneIcon({ earned, fill }: { earned: boolean; fill: string }) {
  const c = earned ? fill : "currentColor";
  return (
    <g>
      {/* Cone */}
      <path d="M-4 -4L-4 5L10 10L10 -9Z" fill={`${c}25`} stroke={c} strokeWidth="1.5" strokeLinejoin="round" />
      {/* Grip */}
      <rect x="-7" y="-3" width="4" height="7" rx="1" fill={`${c}40`} stroke={c} strokeWidth="1.25" />
      {/* Bell */}
      <ellipse cx="10" cy="0.5" rx="3" ry="10" fill={`${c}15`} stroke={c} strokeWidth="1" />
      {/* Sound waves */}
      <path d="M14 -4Q17 0.5 14 5" stroke={c} strokeWidth="1.25" fill="none" strokeLinecap="round" opacity="0.6" />
      <path d="M17 -7Q21 0.5 17 8" stroke={c} strokeWidth="1" fill="none" strokeLinecap="round" opacity="0.35" />
    </g>
  );
}

function BeaconIcon({ earned, fill }: { earned: boolean; fill: string }) {
  const c = earned ? fill : "currentColor";
  return (
    <g>
      {/* Light source */}
      <circle cx="0" cy="-6" r="5" fill={`${c}35`} stroke={c} strokeWidth="1.5" />
      <circle cx="0" cy="-6" r="2" fill={c} opacity="0.7" />
      {/* Tower */}
      <path d="M-4 -1L-3 12L3 12L4 -1" fill={`${c}25`} stroke={c} strokeWidth="1.5" strokeLinejoin="round" />
      {/* Base */}
      <line x1="-6" y1="12" x2="6" y2="12" stroke={c} strokeWidth="2" strokeLinecap="round" />
      {/* Broadcast arcs */}
      <path d="M-8 -10A9 9 0 0 1 -2 -14" stroke={c} strokeWidth="1" fill="none" opacity="0.4" strokeLinecap="round" />
      <path d="M8 -10A9 9 0 0 0 2 -14" stroke={c} strokeWidth="1" fill="none" opacity="0.4" strokeLinecap="round" />
      <path d="M-11 -8A13 13 0 0 1 -2 -17" stroke={c} strokeWidth="0.75" fill="none" opacity="0.25" strokeLinecap="round" />
      <path d="M11 -8A13 13 0 0 0 2 -17" stroke={c} strokeWidth="0.75" fill="none" opacity="0.25" strokeLinecap="round" />
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
