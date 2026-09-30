import React from "react";

// Furniture is decorative. Employee activity and all motion belong to the scene.
const palette = {
  ink: "#4d615a",
  wood: "#e4b782",
  woodLight: "#f4d3a7",
  woodEdge: "#c68c5b",
  sage: "#87b7a0",
  sageLight: "#bdd8be",
  teal: "#32796d",
  tealDark: "#285b55",
  cream: "#fff6df",
  coral: "#dc866e",
  gold: "#e3b357",
  shadow: "#375449",
};

function FloorPlant({
  x = 0,
  y = 0,
  scale = 1,
}: {
  x?: number;
  y?: number;
  scale?: number;
}) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <ellipse
        cx="27"
        cy="66"
        rx="21"
        ry="5"
        fill={palette.shadow}
        opacity=".13"
      />
      <path
        d="M17 46h21l-3 18c-5 4-11 4-16 0Z"
        fill={palette.woodEdge}
        stroke={palette.ink}
        strokeWidth="1.8"
      />
      <path d="m20 48 2 15c2 2 4 3 7 3V48" fill={palette.woodLight} />
      <ellipse
        cx="27.5"
        cy="46"
        rx="12"
        ry="4.2"
        fill={palette.cream}
        stroke={palette.ink}
        strokeWidth="1.8"
      />
      <ellipse cx="27.5" cy="46" rx="8" ry="2.1" fill="#85684f" />
      <path
        d="M27 47V18m0 17L15 26m12 5 12-12"
        fill="none"
        stroke={palette.tealDark}
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      <path
        d="M27 30C12 29 7 22 9 13c12-1 20 6 18 17Z"
        fill={palette.sage}
        stroke={palette.ink}
        strokeWidth="1.6"
      />
      <path
        d="M27 23C20 11 24 4 31 3c8 8 7 15-4 20Z"
        fill={palette.sageLight}
        stroke={palette.ink}
        strokeWidth="1.6"
      />
      <path
        d="M28 35c0-14 8-21 18-20 1 12-7 20-18 20Z"
        fill={palette.teal}
        stroke={palette.ink}
        strokeWidth="1.6"
      />
      <path
        d="M25 40C14 40 8 34 7 27c10-3 18 2 18 13Z"
        fill={palette.sageLight}
        stroke={palette.ink}
        strokeWidth="1.6"
      />
      <path
        d="m14 18 9 9m8-17-2 8m11 3-8 9"
        fill="none"
        stroke={palette.cream}
        strokeWidth="1.2"
        opacity=".6"
        strokeLinecap="round"
      />
    </g>
  );
}

function Chair({
  x,
  y,
  color = palette.teal,
  scale = 1,
}: {
  x: number;
  y: number;
  color?: string;
  scale?: number;
}) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <ellipse
        cx="13"
        cy="31"
        rx="15"
        ry="4"
        fill={palette.shadow}
        opacity=".11"
      />
      <path
        d="M6 20v9m15-9v9"
        stroke={palette.ink}
        strokeWidth="2.3"
        strokeLinecap="round"
      />
      <rect
        x="0"
        y="11"
        width="27"
        height="12"
        rx="5"
        fill={palette.tealDark}
        stroke={palette.ink}
        strokeWidth="1.7"
      />
      <rect
        x="2"
        y="1"
        width="23"
        height="17"
        rx="6"
        fill={color}
        stroke={palette.ink}
        strokeWidth="1.7"
      />
      <path
        d="M7 5h13"
        stroke={palette.cream}
        strokeWidth="1.5"
        opacity=".35"
        strokeLinecap="round"
      />
    </g>
  );
}

function Mug({
  x,
  y,
  color = palette.coral,
}: {
  x: number;
  y: number;
  color?: string;
}) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <path
        d="M7 2h3c4 0 4 6 0 6H8"
        fill="none"
        stroke={palette.ink}
        strokeWidth="1.7"
      />
      <path
        d="M0 0h9v8c-2 3-7 3-9 0Z"
        fill={color}
        stroke={palette.ink}
        strokeWidth="1.4"
      />
      <ellipse
        cx="4.5"
        cy="0"
        rx="4.5"
        ry="2"
        fill={palette.cream}
        stroke={palette.ink}
        strokeWidth="1.2"
      />
      <ellipse cx="4.5" cy=".2" rx="2.8" ry="1" fill="#796451" />
    </g>
  );
}

export function DeskArt({ active }: { active: boolean }) {
  return (
    <svg
      className={`game-art game-desk-art ${active ? "is-active" : "is-idle"}`}
      viewBox="0 0 160 108"
      width="100%"
      height="100%"
      aria-hidden="true"
      focusable="false"
    >
      <ellipse
        cx="80"
        cy="91"
        rx="64"
        ry="11"
        fill={palette.shadow}
        opacity=".12"
      />
      <path
        d="M26 54v28l7 4 4-30m91-2v31l-8 4-3-32"
        fill={palette.woodEdge}
        stroke={palette.ink}
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M24 40 133 34 143 64 32 72 17 59Z"
        fill={palette.woodEdge}
        stroke={palette.ink}
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="m24 34 109-5 10 29-111 8-15-13Z"
        fill={palette.woodLight}
        stroke={palette.ink}
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="m26 39 99-5M31 61l101-7"
        stroke={palette.wood}
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="m108 66 29-2-3 19-25 3Z"
        fill={palette.wood}
        stroke={palette.ink}
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="m112 73 20-1m-16 7 11-1"
        stroke={palette.woodEdge}
        strokeWidth="1.3"
      />
      <path
        d="M78 29v14l-8 4 24-1-8-4V27"
        fill={palette.ink}
        stroke={palette.ink}
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path
        d="m52 9 52-3 3 29-53 4Z"
        fill={palette.tealDark}
        stroke={palette.ink}
        strokeWidth="2.1"
        strokeLinejoin="round"
      />
      <path d="m57 13 42-2 2 19-43 3Z" fill={active ? "#b7e3cb" : "#99aea4"} />
      <path
        d="m57 13 16-1-15 15Z"
        fill={palette.cream}
        opacity={active ? ".4" : ".2"}
      />
      <g
        className="game-screen-lines"
        stroke={active ? palette.teal : "#728d80"}
        strokeWidth="2"
        strokeLinecap="round"
      >
        <path d="m63 18 12-.6m4-.2 14-.7m-29 7 8-.5m5-.2 12-.6m-25 7 19-1" />
      </g>
      <circle cx="80" cy="35" r="1.4" fill={active ? "#cee9b6" : "#7b9382"} />
      <path
        d="m62 46 32-2 8 9-34 3Z"
        fill={palette.cream}
        stroke={palette.ink}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="m67 48 24-1m-22 4 24-1"
        stroke="#a6afa0"
        strokeWidth="1.2"
        strokeDasharray="2 2"
      />
      <path
        d="m108 44 3 5c1 4-7 5-9 1l-2-4c-1-4 6-5 8-2Z"
        fill={palette.sage}
        stroke={palette.ink}
        strokeWidth="1.4"
      />
      <path
        d="m114 36 13-1 4 9-13 1Z"
        fill={palette.coral}
        stroke={palette.ink}
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path
        d="m118 38 9-.5m-8 3 6-.5"
        stroke={palette.cream}
        strokeWidth="1.1"
      />
      <Mug x={34} y={44} />
      <path
        d="M74 86v11m-11 3 11-3 13 3m-13-3-1 6"
        stroke={palette.ink}
        strokeWidth="2.8"
        strokeLinecap="round"
      />
      <ellipse
        cx="74"
        cy="84"
        rx="20"
        ry="8"
        fill={palette.tealDark}
        stroke={palette.ink}
        strokeWidth="2"
      />
      <path
        d="M55 74c0-6 39-6 39 0v9c-1 10-39 10-39 0Z"
        fill={palette.sage}
        stroke={palette.ink}
        strokeWidth="2"
      />
      <path
        d="M60 73c8-4 22-4 29-1"
        fill="none"
        stroke={palette.sageLight}
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M55 78h-5v-7m44 7h5v-7"
        fill="none"
        stroke={palette.ink}
        strokeWidth="2.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="62" cy="100" r="2.2" fill={palette.ink} />
      <circle cx="88" cy="100" r="2.2" fill={palette.ink} />
    </svg>
  );
}

function MeetingFurniture() {
  return (
    <>
      <path
        d="M169 16h48v43h-48Z"
        fill="#f4ead1"
        stroke={palette.ink}
        strokeWidth="2"
      />
      <path d="M174 22h38v27h-38Z" fill={palette.cream} />
      <rect x="180" y="28" width="9" height="8" rx="1" fill={palette.coral} />
      <rect x="197" y="26" width="9" height="8" rx="1" fill={palette.sage} />
      <path
        d="M184 42h20m-11-10v7"
        stroke={palette.ink}
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path d="M176 60v6m35-6v6" stroke={palette.ink} strokeWidth="2" />
      <Chair x={50} y={30} color={palette.sage} scale={0.8} />
      <Chair x={89} y={27} color={palette.sage} scale={0.8} />
      <Chair x={128} y={30} color={palette.sage} scale={0.8} />
      <ellipse
        cx="106"
        cy="111"
        rx="77"
        ry="10"
        fill={palette.shadow}
        opacity=".11"
      />
      <path
        d="M57 78v24m99-26v23"
        stroke={palette.ink}
        strokeWidth="6"
        strokeLinecap="round"
      />
      <path
        d="M35 61c0-18 139-18 139 0v14c0 31-139 31-139 0Z"
        fill={palette.woodEdge}
        stroke={palette.ink}
        strokeWidth="2"
      />
      <ellipse
        cx="104.5"
        cy="61"
        rx="69.5"
        ry="25"
        fill={palette.woodLight}
        stroke={palette.ink}
        strokeWidth="2"
      />
      <ellipse
        cx="104.5"
        cy="61"
        rx="60"
        ry="18"
        fill="none"
        stroke={palette.wood}
        strokeWidth="1.6"
      />
      <path
        d="m71 49 26 2-3 17-25-3Z"
        fill={palette.cream}
        stroke={palette.ink}
        strokeWidth="1.3"
      />
      <path
        d="m76 54 14 1m-15 4 10 1"
        stroke={palette.sage}
        strokeWidth="1.5"
      />
      <path
        d="m118 59 24-1 2 13-23 2Z"
        fill={palette.sage}
        stroke={palette.ink}
        strokeWidth="1.4"
      />
      <path d="m121 62 19-1" stroke={palette.sageLight} strokeWidth="1.4" />
      <Mug x={48} y={60} />
      <Mug x={141} y={49} color={palette.cream} />
      <Chair x={46} y={83} color={palette.teal} />
      <Chair x={91} y={88} color={palette.teal} />
      <Chair x={136} y={83} color={palette.teal} />
      <FloorPlant x={185} y={61} scale={0.75} />
    </>
  );
}

function TrainingFurniture() {
  return (
    <>
      <path
        d="M64 20v48m101-48v48"
        stroke={palette.ink}
        strokeWidth="3"
        strokeLinecap="round"
      />
      <rect
        x="49"
        y="11"
        width="134"
        height="46"
        rx="4"
        fill={palette.woodEdge}
        stroke={palette.ink}
        strokeWidth="2"
      />
      <rect
        x="54"
        y="16"
        width="124"
        height="36"
        rx="2"
        fill={palette.tealDark}
      />
      <path
        d="m64 30 7-7 7 7m-7-7v17m17-16h24m-24 7h41m-41 7h33"
        fill="none"
        stroke={palette.cream}
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="m147 23 4 8 10 1-7 6 2 10-9-5-8 5 2-10-7-6 10-1Z"
        fill={palette.gold}
      />
      <path
        d="M54 56h124"
        stroke={palette.woodLight}
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path d="M164 53h6" stroke={palette.cream} strokeWidth="2" />
      {[30, 94, 158].map((x) => (
        <g key={x} transform={`translate(${x} 63)`}>
          <path
            d="M4 19v29m42-29v29"
            stroke={palette.ink}
            strokeWidth="3"
            strokeLinecap="round"
          />
          <path
            d="M0 4 45 1l7 18-46 4-6-5Z"
            fill={palette.woodEdge}
            stroke={palette.ink}
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
          <path
            d="M0 1 45-2l7 17-46 4-6-5Z"
            fill={palette.woodLight}
            stroke={palette.ink}
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
          <path
            d="m11 3 11 1 10-2 3 10-11 2-11-1Z"
            fill={palette.cream}
            stroke={palette.ink}
            strokeWidth="1.3"
            strokeLinejoin="round"
          />
          <path d="m22 4 2 10" stroke={palette.coral} strokeWidth="1.3" />
          <Chair x={11} y={28} color={palette.sage} scale={0.85} />
        </g>
      ))}
      <FloorPlant x={195} y={9} scale={0.6} />
    </>
  );
}

function LoungeFurniture() {
  return (
    <>
      <ellipse cx="102" cy="110" rx="83" ry="16" fill="#bdd6c6" />
      <ellipse
        cx="102"
        cy="110"
        rx="72"
        ry="11"
        fill="none"
        stroke="#a1bdad"
        strokeWidth="1.5"
      />
      <path
        d="M26 90v11m108-11v11"
        stroke={palette.ink}
        strokeWidth="4"
        strokeLinecap="round"
      />
      <rect
        x="23"
        y="45"
        width="116"
        height="46"
        rx="11"
        fill={palette.tealDark}
        stroke={palette.ink}
        strokeWidth="2"
      />
      <rect
        x="26"
        y="38"
        width="107"
        height="41"
        rx="11"
        fill={palette.sage}
        stroke={palette.ink}
        strokeWidth="2"
      />
      <path d="M78 43v31" stroke="#5f8e78" strokeWidth="2" />
      <rect
        x="33"
        y="72"
        width="93"
        height="17"
        rx="6"
        fill={palette.sageLight}
        stroke={palette.ink}
        strokeWidth="1.8"
      />
      <path d="M79 75v12" stroke="#84a589" strokeWidth="1.4" />
      <rect
        x="17"
        y="66"
        width="17"
        height="29"
        rx="6"
        fill={palette.sage}
        stroke={palette.ink}
        strokeWidth="2"
      />
      <rect
        x="125"
        y="66"
        width="17"
        height="29"
        rx="6"
        fill={palette.sage}
        stroke={palette.ink}
        strokeWidth="2"
      />
      <path
        d="m39 47 23 3-3 22-24-3Z"
        fill={palette.coral}
        stroke={palette.ink}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="m104 48 19 8-7 20-20-7Z"
        fill={palette.cream}
        stroke={palette.ink}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M78 108v16m44-17v14"
        stroke={palette.ink}
        strokeWidth="3"
        strokeLinecap="round"
      />
      <ellipse
        cx="100"
        cy="106"
        rx="35"
        ry="13"
        fill={palette.woodEdge}
        stroke={palette.ink}
        strokeWidth="1.8"
      />
      <ellipse
        cx="100"
        cy="102"
        rx="35"
        ry="13"
        fill={palette.woodLight}
        stroke={palette.ink}
        strokeWidth="1.8"
      />
      <path
        d="m98 95 15 3-5 10-16-3Z"
        fill={palette.cream}
        stroke={palette.ink}
        strokeWidth="1.2"
      />
      <path d="m100 97 9 2" stroke={palette.sage} strokeWidth="1.4" />
      <Mug x={81} y={99} color={palette.teal} />
      <path
        d="M162 57h54v51h-54Z"
        fill={palette.wood}
        stroke={palette.ink}
        strokeWidth="2"
      />
      <path
        d="M162 75h54m-27 2v27m-16-21v8m32-8v8"
        stroke={palette.woodEdge}
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M159 55h60v6h-60Z"
        fill={palette.woodLight}
        stroke={palette.ink}
        strokeWidth="1.7"
      />
      <rect
        x="170"
        y="23"
        width="33"
        height="32"
        rx="4"
        fill={palette.cream}
        stroke={palette.ink}
        strokeWidth="1.8"
      />
      <rect
        x="175"
        y="29"
        width="16"
        height="7"
        rx="2"
        fill={palette.tealDark}
      />
      <circle cx="197" cy="31" r="2" fill={palette.coral} />
      <path d="M176 41h19v12h-19Z" fill={palette.ink} />
      <path d="M182 42h7v7c-1 2-6 2-7 0Z" fill={palette.cream} />
      <path d="M185 36v6" stroke={palette.ink} strokeWidth="2" />
      <FloorPlant x={181} y={67} scale={0.8} />
    </>
  );
}

function AwardsFurniture() {
  return (
    <>
      <path
        d="M43 23h151v81H43Z"
        fill={palette.woodEdge}
        stroke={palette.ink}
        strokeWidth="2"
      />
      <path d="M49 29h139v69H49Z" fill="#f0d6af" />
      <path
        d="M48 67h141M89 29v37m58-37v37m-40 6v26"
        stroke={palette.woodEdge}
        strokeWidth="5"
      />
      <path d="M48 70h141M47 102h144" stroke={palette.ink} strokeWidth="1.6" />
      <path
        d="M64 38v15m-5 5h11"
        stroke={palette.gold}
        strokeWidth="5"
        strokeLinecap="round"
      />
      <path
        d="m64 33 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Z"
        fill={palette.gold}
        stroke="#ad8242"
        strokeWidth="1.3"
      />
      <path
        d="M106 35h25l-3 14c-4 7-15 7-19 0Z"
        fill={palette.gold}
        stroke="#9a7540"
        strokeWidth="1.5"
      />
      <path
        d="M107 38h-7c-1 8 4 13 12 12m18-12h7c1 8-4 13-12 12"
        fill="none"
        stroke="#c39341"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M118 53v8m-8 1h17"
        stroke="#9a7540"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="m113 39 2 6"
        stroke={palette.cream}
        strokeWidth="2"
        strokeLinecap="round"
      />
      <rect
        x="159"
        y="37"
        width="21"
        height="23"
        rx="1"
        fill={palette.cream}
        stroke={palette.ink}
        strokeWidth="1.5"
      />
      <circle cx="169.5" cy="46" r="4" fill={palette.coral} />
      <path d="m167 49-2 7 5-2 4 2-2-7" fill={palette.gold} />
      <path
        d="M57 80h37v11H57Z"
        fill={palette.sage}
        stroke={palette.ink}
        strokeWidth="1.4"
      />
      <path
        d="M60 76h33v5H60Z"
        fill={palette.coral}
        stroke={palette.ink}
        strokeWidth="1.2"
      />
      <path d="M62 84h26" stroke={palette.cream} strokeWidth="1.4" />
      <rect
        x="119"
        y="78"
        width="13"
        height="18"
        rx="1"
        fill={palette.cream}
        stroke={palette.ink}
        strokeWidth="1.2"
      />
      <path
        d="m122 83 3 3 5-5"
        fill="none"
        stroke={palette.teal}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M148 82h29v14h-29Z"
        fill={palette.coral}
        stroke={palette.ink}
        strokeWidth="1.3"
      />
      <path
        d="M162 82v14m-13-16h27v4h-27Z"
        fill={palette.cream}
        stroke={palette.ink}
        strokeWidth="1.1"
      />
      <path
        d="m161 79-5-4c-6-4-7 4-1 5m8-1 5-4c6-4 7 4 1 5"
        fill="none"
        stroke={palette.cream}
        strokeWidth="2"
      />
      <path
        d="M52 105v8m135-8v8"
        stroke={palette.ink}
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path d="m83 111 35-10 35 10-35 14Z" fill={palette.teal} opacity=".7" />
      <FloorPlant x={7} y={51} scale={0.8} />
      <FloorPlant x={190} y={51} scale={0.8} />
    </>
  );
}

function WorkFurniture() {
  return (
    <>
      <rect
        x="18"
        y="17"
        width="68"
        height="36"
        rx="3"
        fill={palette.wood}
        stroke={palette.ink}
        strokeWidth="1.8"
      />
      <rect x="23" y="22" width="58" height="26" rx="1" fill={palette.cream} />
      <path
        d="M30 29h18m-18 7h24m-24 6h12"
        stroke={palette.sage}
        strokeWidth="2"
        strokeLinecap="round"
      />
      <rect x="61" y="28" width="13" height="14" rx="1" fill={palette.coral} />
      <svg x="47" y="26" width="160" height="108" viewBox="0 0 160 108">
        <DeskArt active={false} />
      </svg>
      <FloorPlant x={181} y={53} scale={0.88} />
    </>
  );
}

export function RoomArt({
  kind,
}: {
  kind: "work" | "meeting" | "training" | "lounge" | "awards";
}) {
  const content = {
    work: <WorkFurniture />,
    meeting: <MeetingFurniture />,
    training: <TrainingFurniture />,
    lounge: <LoungeFurniture />,
    awards: <AwardsFurniture />,
  };
  return (
    <svg
      className={`game-art game-room-art game-room-art-${kind}`}
      viewBox="0 0 240 135"
      width="100%"
      height="100%"
      aria-hidden="true"
      focusable="false"
    >
      {content[kind]}
    </svg>
  );
}

export function PlantArt() {
  return (
    <svg
      className="game-art game-plant-art"
      viewBox="0 0 54 72"
      width="100%"
      height="100%"
      aria-hidden="true"
      focusable="false"
    >
      <FloorPlant />
    </svg>
  );
}

export function ReceptionArt() {
  return (
    <svg
      className="game-art game-reception-art"
      viewBox="0 0 260 70"
      width="100%"
      height="100%"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M5 62h250"
        stroke={palette.shadow}
        strokeWidth="2"
        opacity=".15"
        strokeLinecap="round"
      />
      <path
        d="M13 7h42v54H13Z"
        fill={palette.woodEdge}
        stroke={palette.ink}
        strokeWidth="2"
      />
      <path
        d="M18 12h32v47H18Z"
        fill={palette.sageLight}
        stroke={palette.ink}
        strokeWidth="1.3"
      />
      <path
        d="M23 17h21v25H23Z"
        fill="#d8ead8"
        stroke="#8ca89a"
        strokeWidth="1.1"
      />
      <path d="m25 20 16-1-16 17Z" fill={palette.cream} opacity=".6" />
      <path
        d="M44 45v7"
        stroke={palette.tealDark}
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path d="M17 63h42l6 4H13Z" fill="#8bab9b" />
      <rect
        x="73"
        y="7"
        width="107"
        height="22"
        rx="5"
        fill={palette.tealDark}
        stroke={palette.ink}
        strokeWidth="1.5"
      />
      <text
        x="126.5"
        y="22"
        textAnchor="middle"
        fill={palette.cream}
        fontFamily="Arial, sans-serif"
        fontWeight="800"
        fontSize="13"
        letterSpacing="2"
      >
        HERMES
      </text>
      <path
        d="M82 47v14m88-14v14"
        stroke={palette.ink}
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M76 35h99v18H76Z"
        fill={palette.woodEdge}
        stroke={palette.ink}
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M76 35h99v8H76Z"
        fill={palette.woodLight}
        stroke={palette.ink}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M86 36v5m15-5v5m16-5v5m16-5v5m16-5v5m16-5v5"
        stroke={palette.woodEdge}
        strokeWidth="1.3"
      />
      <path
        d="m142 32 18-1 2 8-18 1Z"
        fill={palette.sage}
        stroke={palette.ink}
        strokeWidth="1.2"
      />
      <rect
        x="194"
        y="12"
        width="24"
        height="31"
        rx="3"
        fill={palette.cream}
        stroke={palette.ink}
        strokeWidth="1.5"
      />
      <circle cx="206" cy="24" r="6" fill={palette.sageLight} />
      <path
        d="M206 19v6l3 2"
        fill="none"
        stroke={palette.tealDark}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M199 36h14"
        stroke={palette.wood}
        strokeWidth="2"
        strokeLinecap="round"
      />
      <FloorPlant x={219} y={1} scale={0.85} />
    </svg>
  );
}
