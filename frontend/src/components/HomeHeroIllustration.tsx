/** 首页主视觉插图：浅色玻璃风 SVG，与当前界面色调保持一致。 */
export default function HomeHeroIllustration() {
  return (
    <div
      style={{
        width: "100%",
        maxWidth: 880,
        margin: "0 auto",
        aspectRatio: "16 / 7",
      }}
      aria-hidden
    >
      <svg
        viewBox="0 0 880 380"
        width="100%"
        height="100%"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="hero-shell" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="55%" stopColor="#f6f8ff" />
            <stop offset="100%" stopColor="#eef3ff" />
          </linearGradient>
          <radialGradient id="hero-halo-left" cx="20%" cy="26%" r="48%">
            <stop offset="0%" stopColor="#7dd3fc" stopOpacity="0.42" />
            <stop offset="100%" stopColor="#7dd3fc" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="hero-halo-right" cx="82%" cy="18%" r="42%">
            <stop offset="0%" stopColor="#a78bfa" stopOpacity="0.32" />
            <stop offset="100%" stopColor="#a78bfa" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="hero-panel" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.94" />
            <stop offset="100%" stopColor="#f2f6ff" stopOpacity="0.9" />
          </linearGradient>
          <linearGradient id="hero-accent" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#22d3ee" />
            <stop offset="100%" stopColor="#3b82f6" />
          </linearGradient>
          <linearGradient id="hero-accent-soft" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#e0f2fe" />
            <stop offset="100%" stopColor="#ede9fe" />
          </linearGradient>
          <pattern id="hero-grid" width="28" height="28" patternUnits="userSpaceOnUse">
            <path d="M 28 0 L 0 0 0 28" fill="none" stroke="rgba(148,163,184,0.14)" strokeWidth="1" />
          </pattern>
          <filter id="hero-shadow" x="-20%" y="-20%" width="140%" height="160%">
            <feDropShadow dx="0" dy="18" stdDeviation="20" floodColor="#8ea3d4" floodOpacity="0.18" />
          </filter>
          <filter id="hero-soft-shadow" x="-20%" y="-20%" width="140%" height="160%">
            <feDropShadow dx="0" dy="12" stdDeviation="14" floodColor="#9fb0d8" floodOpacity="0.14" />
          </filter>
        </defs>

        <rect x="0" y="0" width="880" height="380" rx="30" fill="url(#hero-shell)" />
        <rect x="0" y="0" width="880" height="380" rx="30" fill="url(#hero-grid)" />
        <rect x="0" y="0" width="880" height="380" rx="30" fill="url(#hero-halo-left)" />
        <rect x="0" y="0" width="880" height="380" rx="30" fill="url(#hero-halo-right)" />

        <ellipse cx="446" cy="188" rx="216" ry="88" fill="rgba(96, 165, 250, 0.08)" />
        <ellipse cx="446" cy="198" rx="168" ry="62" fill="rgba(167, 139, 250, 0.07)" />

        <g filter="url(#hero-shadow)">
          <rect
            x="238"
            y="66"
            width="404"
            height="210"
            rx="28"
            fill="url(#hero-panel)"
            stroke="rgba(255,255,255,0.92)"
            strokeWidth="2"
          />
        </g>

        <rect x="268" y="92" width="108" height="12" rx="6" fill="rgba(15,23,42,0.08)" />
        <rect x="388" y="92" width="72" height="12" rx="6" fill="rgba(59,130,246,0.12)" />
        <rect x="268" y="118" width="238" height="12" rx="6" fill="rgba(51,65,85,0.1)" />
        <rect x="268" y="140" width="184" height="10" rx="5" fill="rgba(51,65,85,0.08)" />

        <rect x="268" y="174" width="124" height="54" rx="18" fill="url(#hero-accent)" />
        <rect x="406" y="174" width="102" height="54" rx="18" fill="rgba(226,232,240,0.92)" />
        <rect x="524" y="162" width="86" height="86" rx="22" fill="url(#hero-accent-soft)" stroke="rgba(191,219,254,0.95)" />
        <path
          d="M548 210 L564 194 L579 205 L597 180"
          fill="none"
          stroke="url(#hero-accent)"
          strokeWidth="5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="548" cy="210" r="5" fill="#22d3ee" />
        <circle cx="597" cy="180" r="5" fill="#34d399" />

        <path d="M278 236 H604" stroke="rgba(148,163,184,0.35)" strokeWidth="2" />
        <path d="M290 236 C336 210, 390 198, 440 198" fill="none" stroke="rgba(34,211,238,0.24)" strokeWidth="3" />
        <path d="M590 236 C544 206, 494 194, 452 194" fill="none" stroke="rgba(167,139,250,0.24)" strokeWidth="3" />

        <g filter="url(#hero-soft-shadow)" transform="translate(110, 102)">
          <rect width="122" height="84" rx="20" fill="rgba(255,255,255,0.9)" stroke="rgba(226,232,240,0.98)" />
          <rect x="16" y="16" width="40" height="40" rx="14" fill="url(#hero-accent)" />
          <rect x="68" y="20" width="36" height="8" rx="4" fill="rgba(51,65,85,0.18)" />
          <rect x="68" y="36" width="28" height="6" rx="3" fill="rgba(51,65,85,0.12)" />
          <rect x="16" y="64" width="88" height="7" rx="3.5" fill="rgba(148,163,184,0.2)" />
        </g>

        <g filter="url(#hero-soft-shadow)" transform="translate(648, 90)">
          <rect width="126" height="92" rx="20" fill="rgba(255,255,255,0.9)" stroke="rgba(226,232,240,0.98)" />
          <rect x="18" y="18" width="90" height="10" rx="5" fill="rgba(51,65,85,0.14)" />
          <rect x="18" y="40" width="66" height="8" rx="4" fill="rgba(51,65,85,0.1)" />
          <rect x="18" y="62" width="42" height="18" rx="9" fill="rgba(167,243,208,0.9)" />
          <rect x="68" y="62" width="42" height="18" rx="9" fill="rgba(191,219,254,0.95)" />
        </g>

        <g filter="url(#hero-soft-shadow)" transform="translate(144, 244)">
          <rect width="144" height="54" rx="18" fill="rgba(255,255,255,0.9)" stroke="rgba(226,232,240,0.98)" />
          <circle cx="28" cy="27" r="9" fill="#22d3ee" />
          <rect x="48" y="18" width="72" height="8" rx="4" fill="rgba(51,65,85,0.16)" />
          <rect x="48" y="31" width="50" height="6" rx="3" fill="rgba(51,65,85,0.11)" />
        </g>

        <g filter="url(#hero-soft-shadow)" transform="translate(592, 244)">
          <rect width="144" height="54" rx="18" fill="rgba(255,255,255,0.9)" stroke="rgba(226,232,240,0.98)" />
          <circle cx="28" cy="27" r="9" fill="#34d399" />
          <rect x="48" y="18" width="72" height="8" rx="4" fill="rgba(51,65,85,0.16)" />
          <rect x="48" y="31" width="50" height="6" rx="3" fill="rgba(51,65,85,0.11)" />
        </g>

        <path d="M232 144 C238 144, 242 144, 238 144 L238 144" fill="none" />
        <path d="M232 144 C236 144, 238 144, 238 144" fill="none" stroke="rgba(125,211,252,0.5)" strokeWidth="2.5" strokeDasharray="6 6" />
        <path d="M642 140 C646 140, 648 140, 648 140" fill="none" stroke="rgba(167,139,250,0.42)" strokeWidth="2.5" strokeDasharray="6 6" />

        <circle cx="440" cy="42" r="5" fill="#38bdf8" opacity="0.95" />
        <circle cx="396" cy="58" r="3.5" fill="#34d399" opacity="0.9" />
        <circle cx="484" cy="60" r="3.5" fill="#818cf8" opacity="0.9" />
      </svg>
    </div>
  );
}
