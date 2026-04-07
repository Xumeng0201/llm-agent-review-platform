/** 首页右侧装饰插图：轻量 SVG，与浅紫主题协调（非等比还原参考图，仅营造科技感氛围） */
export default function HomeHeroIllustration() {
  return (
    <div
      style={{
        width: "100%",
        maxWidth: 440,
        margin: "0 auto",
        aspectRatio: "5 / 4",
      }}
      aria-hidden
    >
      <svg
        viewBox="0 0 400 320"
        width="100%"
        height="100%"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="hero-bg" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ede9fe" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#e9d5ff" stopOpacity="0.5" />
          </linearGradient>
          <linearGradient id="hero-panel" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="100%" stopColor="#f5f3ff" />
          </linearGradient>
          <linearGradient id="hero-accent" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#8b5cf6" />
            <stop offset="100%" stopColor="#6366f1" />
          </linearGradient>
        </defs>
        <rect x="0" y="0" width="400" height="320" rx="20" fill="url(#hero-bg)" />
        {/* 桌面 */}
        <path
          d="M 80 220 L 200 160 L 320 220 L 200 280 Z"
          fill="#faf5ff"
          stroke="rgba(139,92,246,0.25)"
          strokeWidth="1.5"
        />
        <path
          d="M 120 200 L 200 155 L 280 200 L 200 245 Z"
          fill="#ffffff"
          stroke="rgba(139,92,246,0.2)"
          strokeWidth="1"
        />
        {/* 显示器 */}
        <rect
          x="165"
          y="118"
          width="70"
          height="52"
          rx="4"
          fill="url(#hero-panel)"
          stroke="rgba(99,102,241,0.35)"
          strokeWidth="1.5"
        />
        <rect x="172" y="125" width="56" height="30" rx="2" fill="#eef2ff" />
        <rect x="178" y="132" width="16" height="16" rx="2" fill="url(#hero-accent)" opacity="0.85" />
        <rect x="198" y="132" width="24" height="4" rx="1" fill="#c4b5fd" />
        <rect x="198" y="140" width="18" height="3" rx="1" fill="#ddd6fe" />
        {/* 悬浮屏 1 */}
        <g transform="translate(48, 72)">
          <rect
            width="88"
            height="64"
            rx="8"
            fill="white"
            opacity="0.95"
            stroke="rgba(139,92,246,0.3)"
            strokeWidth="1.2"
          />
          <text x="44" y="28" textAnchor="middle" fill="#6d28d9" fontSize="11" fontWeight="600">
            AI Agent
          </text>
          <rect x="14" y="38" width="60" height="6" rx="2" fill="#e9d5ff" />
          <rect x="14" y="48" width="40" height="6" rx="2" fill="#f3e8ff" />
        </g>
        {/* 悬浮屏 2 */}
        <g transform="translate(268, 56)">
          <rect
            width="92"
            height="70"
            rx="8"
            fill="white"
            opacity="0.92"
            stroke="rgba(99,102,241,0.28)"
            strokeWidth="1.2"
          />
          <rect x="12" y="14" width="24" height="40" rx="2" fill="#a78bfa" opacity="0.5" />
          <rect x="40" y="22" width="40" height="6" rx="2" fill="#e0e7ff" />
          <rect x="40" y="32" width="32" height="6" rx="2" fill="#ede9fe" />
          <rect x="40" y="42" width="36" height="6" rx="2" fill="#f5f3ff" />
        </g>
        {/* 小机器人 */}
        <g transform="translate(300, 168)">
          <rect x="0" y="8" width="36" height="40" rx="10" fill="#fff" stroke="#c4b5fd" strokeWidth="1.2" />
          <circle cx="18" cy="22" r="8" fill="#ede9fe" stroke="#8b5cf6" strokeWidth="1" />
          <circle cx="15" cy="21" r="2" fill="#5b21b6" />
          <circle cx="21" cy="21" r="2" fill="#5b21b6" />
          <rect x="10" y="36" width="16" height="3" rx="1" fill="#a78bfa" />
        </g>
        {/* 连接线 */}
        <path
          d="M 136 104 Q 200 60 264 90"
          fill="none"
          stroke="rgba(139,92,246,0.35)"
          strokeWidth="1.5"
          strokeDasharray="4 4"
        />
        <path
          d="M 200 170 L 200 200"
          stroke="rgba(99,102,241,0.25)"
          strokeWidth="1.5"
        />
      </svg>
    </div>
  );
}
