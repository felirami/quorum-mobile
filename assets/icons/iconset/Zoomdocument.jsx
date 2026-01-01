const Zoomdocument = ({ className = "", style = {}, ...props }) => (
  <svg
    style={style}
    className={`inline-block align-text-bottom ${className}`}
    fill="currentColor"
    height="1em"
    id="Zoom-Document--Streamline-Sharp"
    viewBox="0 0 24 24"
    width="1em"
  >
    <g id="zoom-document--zoom-magnifier-square-area">
      <path
        clipRule="evenodd"
        d="M1 1h20v10.469A6.75 6.75 0 1 0 14.674 23H1V1Zm12.5 6H4V5h9.5v2Zm-3 4.5H4v-2h6.5v2Zm6 2.25a2.75 2.75 0 1 0 0 5.5 2.75 2.75 0 0 0 0 -5.5Zm-5.25 2.75a5.25 5.25 0 1 1 9.74 2.722l2.394 2.394 -1.768 1.768 -2.394 -2.394a5.25 5.25 0 0 1 -7.972 -4.49Z"
        fill="currentColor"
        fillRule="evenodd"
        id="Union"
        strokeWidth="1"
      />
    </g>
  </svg>
);

export default Zoomdocument;
