export const IconDownloadWithType = ({
  size = 20,
  color = 'currentColor',
  className = '',
  type = '',
  ...props
}) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      className="icon icon-tabler icons-tabler-outline icon-tabler-download"
      {...props}
    >
      <title>IconDownloadWithType</title>
      <path stroke="none" d="M0 0h24v24H0z" fill="none" />
      <g transform="translate(3.6 0) scale(0.7)">
        <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2" />
        <path d="M7 11l5 5l5 -5" />
        <path d="M12 4l0 12" />
      </g>
      <text
        x="12"
        y="24"
        textAnchor="middle"
        fontSize="9"
        fontFamily="sans-serif"
        fontWeight="1000"
        stroke="none"
        fill={color}
        pointerEvents="none"
      >
        {type}
      </text>
    </svg>
  )
}
export const IconCopyText = ({ size = 20, color = 'currentColor', className = '', ...props }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`tabler-icon tabler-icon-copy opacity-50 hover:opacity-100 ${className}`}
    {...props}
  >
    <path d="M7 7m0 2.667a2.667 2.667 0 0 1 2.667 -2.667h8.666a2.667 2.667 0 0 1 2.667 2.667v8.666a2.667 2.667 0 0 1 -2.667 2.667h-8.666a2.667 2.667 0 0 1 -2.667 -2.667z"></path>
    <path d="M4.012 16.737a2.005 2.005 0 0 1 -1.012 -1.737v-10c0 -1.1 .9 -2 2 -2h10c.75 0 1.158 .385 1.5 1"></path>
    <text
      x="14"
      y="18"
      textAnchor="middle"
      fontSize="9"
      fontFamily="sans-serif"
      fontWeight="100"
      fill={color}
      pointerEvents="none"
    >
      T
    </text>
  </svg>
)
