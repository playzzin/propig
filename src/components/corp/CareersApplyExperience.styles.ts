import Link from 'next/link';
import styled from 'styled-components';

export const Page = styled.main<{ $accent: string }>`
  min-width: 0;
  color: #16342d;
  background:
    radial-gradient(circle at 90% 4%, ${(props) => `${props.$accent}22`}, transparent 25%),
    #f6f4ed;
`;

export const Hero = styled.section`
  width: min(1180px, calc(100% - 40px));
  margin: 0 auto;
  padding: clamp(66px, 9vw, 118px) 0 clamp(50px, 7vw, 86px);
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(300px, .72fr);
  gap: clamp(34px, 6vw, 80px);
  align-items: center;

  @media (max-width: 840px) { grid-template-columns: 1fr; }
  @media (max-width: 520px) { width: min(100% - 28px, 1180px); }
`;

export const HeroCopy = styled.div`
  h1 {
    margin: 20px 0 0;
    color: #12372e;
    font-size: clamp(2.65rem, 6vw, 5.4rem);
    line-height: .99;
    letter-spacing: -.055em;
    font-weight: 900;
    word-break: keep-all;
    text-wrap: balance;
  }
  h1 em { color: #438b75; font-style: normal; }
  p { max-width: 690px; margin: 23px 0 0; color: #60726b; font-size: 1.03rem; line-height: 1.8; word-break: keep-all; }
`;

export const Eyebrow = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: #468976;
  font-size: .73rem;
  font-weight: 950;
  letter-spacing: .13em;
`;

export const BackLink = styled(Link)`
  min-height: 46px;
  width: fit-content;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-top: 26px;
  padding: 0 16px;
  border: 1px solid #c5d3cc;
  border-radius: 999px;
  color: #214b40;
  font-weight: 850;
  text-decoration: none;
  &:hover { background: rgba(255,255,255,.62); }
  &:focus-visible { outline: 3px solid #2f7763; outline-offset: 3px; }
`;

export const HeroGuide = styled.aside`
  padding: 27px;
  border: 1px solid #c9d8d1;
  border-radius: 25px;
  background: rgba(255,255,255,.64);
  box-shadow: 0 22px 60px rgba(32,73,61,.08);

  > span { display: flex; align-items: center; gap: 8px; color: #448a75; font-size: .69rem; font-weight: 950; letter-spacing: .1em; }
  > strong { display: block; margin-top: 17px; color: #163b31; font-size: 1.25rem; line-height: 1.4; word-break: keep-all; }
  > p { margin: 11px 0 0; color: #66776f; font-size: .87rem; line-height: 1.7; word-break: keep-all; }
  ul { display: grid; gap: 9px; margin: 20px 0 0; padding: 16px 0 0; border-top: 1px solid #dae2dd; list-style: none; }
  li { display: flex; align-items: center; gap: 8px; color: #46685d; font-size: .8rem; }
  li svg { color: #4c9a81; }
`;

export const Content = styled.div`
  width: min(1180px, calc(100% - 40px));
  margin: 0 auto;
  padding-bottom: 100px;
  @media (max-width: 520px) { width: min(100% - 28px, 1180px); }
`;

export const ProgressSection = styled.section`
  padding: 24px clamp(20px, 4vw, 34px);
  border: 1px solid #cbd8d1;
  border-radius: 23px;
  background: rgba(255,255,255,.65);
`;

export const ProgressCopy = styled.div`
  display: flex;
  align-items: baseline;
  gap: 14px;
  flex-wrap: wrap;
  > span { color: #4c8977; font-size: .66rem; font-weight: 950; letter-spacing: .12em; }
  > strong { color: #183b32; font-size: 1rem; }
  > small { margin-left: auto; color: #6d7c76; font-size: .75rem; }
  @media (max-width: 700px) { > small { width: 100%; margin-left: 0; } }
`;

export const ProgressTrack = styled.div`
  height: 7px;
  margin-top: 16px;
  border-radius: 999px;
  overflow: hidden;
  background: #dde4df;
  span { display: block; width: 100%; height: 100%; border-radius: inherit; background: linear-gradient(90deg, #5ab18f, #82cfb5); transform-origin: left; transition: transform 250ms ease; }
  @media (prefers-reduced-motion: reduce) { span { transition: none; } }
`;

export const StepList = styled.ol`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
  margin: 18px 0 0;
  padding: 0;
  list-style: none;
  li { min-width: 0; display: flex; align-items: center; gap: 8px; color: #829089; font-size: .74rem; }
  li b { width: 27px; height: 27px; flex: 0 0 auto; display: grid; place-items: center; border-radius: 50%; background: #e3e8e5; font-size: .64rem; }
  li[data-active='true'] { color: #285d4e; font-weight: 900; }
  li[data-active='true'] b { color: #fff; background: #438b75; }
  @media (max-width: 650px) { grid-template-columns: repeat(2, minmax(0, 1fr)); }
`;

export const Layout = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(260px, 330px);
  gap: 22px;
  align-items: start;
  margin-top: 22px;
  @media (max-width: 900px) { grid-template-columns: 1fr; }
`;

export const Form = styled.form`
  min-width: 0;
  display: grid;
  gap: 14px;
`;

export const FormSection = styled.section`
  min-width: 0;
  padding: clamp(23px, 4vw, 38px);
  border: 1px solid #d0dbd5;
  border-radius: 24px;
  background: rgba(255,255,255,.76);
`;

export const SectionHeading = styled.header`
  margin-bottom: 25px;
  > span { color: #4e907c; font-size: .67rem; font-weight: 950; letter-spacing: .12em; }
  h2 { margin: 8px 0 0; color: #173a31; font-size: clamp(1.35rem, 2.7vw, 2rem); line-height: 1.22; letter-spacing: -.025em; word-break: keep-all; }
  p { margin: 9px 0 0; color: #6a7a74; font-size: .86rem; line-height: 1.65; word-break: keep-all; }
`;

export const TrackGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 9px;
  @media (max-width: 620px) { grid-template-columns: 1fr; }
`;

export const TrackChoice = styled.div<{ $selected: boolean; $accent: string }>`
  position: relative;
  min-width: 0;
  input { position: absolute; width: 1px; height: 1px; opacity: 0; }
  label {
    min-height: 150px;
    display: flex;
    flex-direction: column;
    padding: 19px;
    border: 1px solid ${(props) => props.$selected ? props.$accent : '#d6ded9'};
    border-radius: 17px;
    background: ${(props) => props.$selected ? `${props.$accent}22` : '#fbfcfa'};
    cursor: pointer;
  }
  small { color: #6d8179; font-size: .62rem; font-weight: 900; letter-spacing: .08em; }
  strong { margin-top: 10px; color: #173a31; }
  span { margin-top: 8px; color: #6b7b74; font-size: .76rem; line-height: 1.5; word-break: keep-all; }
  input:focus-visible + label { outline: 3px solid #2f7763; outline-offset: 3px; }
`;

export const FieldGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 17px;
  @media (max-width: 650px) { grid-template-columns: 1fr; }
`;

export const Field = styled.div`
  min-width: 0;
  display: grid;
  gap: 8px;
  & + & { margin-top: 20px; }
  ${FieldGrid} & + & { margin-top: 0; }
  label { color: #234a3f; font-size: .82rem; font-weight: 900; }
  label small { margin-left: 4px; color: #84928c; font-weight: 750; }
  input, textarea {
    width: 100%;
    min-width: 0;
    min-height: 48px;
    padding: 12px 14px;
    border: 1px solid #cbd6d0;
    border-radius: 12px;
    color: #173a31;
    background: #fff;
    font: inherit;
    font-size: .9rem;
    line-height: 1.55;
    resize: vertical;
  }
  textarea { min-height: 116px; }
  input::placeholder, textarea::placeholder { color: #9ba7a1; }
  input:focus, textarea:focus { border-color: #438b75; outline: 3px solid rgba(67,139,117,.15); }
  input[aria-invalid='true'], textarea[aria-invalid='true'] { border-color: #c14f54; }
`;

export const Hint = styled.small`
  color: #7d8a84;
  font-size: .72rem;
`;

export const TextMeta = styled.small`
  display: flex;
  justify-content: space-between;
  gap: 12px;
  color: #7d8a84;
  font-size: .72rem;
  b { color: #9a6f45; }
  b[data-ready='true'] { color: #318065; }
`;

export const Error = styled.p`
  margin: 0;
  color: #b83f46;
  font-size: .76rem;
  line-height: 1.45;
  font-weight: 800;
`;

export const Consent = styled.div<{ $invalid: boolean }>`
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 12px;
  padding: 18px;
  border: 1px solid ${(props) => props.$invalid ? '#cb5a61' : '#ced9d3'};
  border-radius: 15px;
  background: #f9fbf9;
  input { width: 20px; height: 20px; margin: 2px 0 0; accent-color: #3e8b73; }
  input:focus-visible { outline: 3px solid #3e8b73; outline-offset: 3px; }
  label { display: grid; gap: 5px; cursor: pointer; }
  strong { color: #21463b; font-size: .84rem; line-height: 1.45; }
  span { color: #728079; font-size: .74rem; line-height: 1.55; word-break: keep-all; }
`;

export const Actions = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 10px;
  margin-top: 22px;
  @media (max-width: 560px) { flex-direction: column-reverse; button { width: 100%; } }
`;

export const ResetButton = styled.button`
  min-height: 48px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 0 17px;
  border: 1px solid #cbd6d0;
  border-radius: 999px;
  color: #536a62;
  background: transparent;
  font: inherit;
  font-weight: 850;
  cursor: pointer;
  &:hover { background: #eef3f0; }
  &:focus-visible { outline: 3px solid #2f7763; outline-offset: 3px; }
`;

export const SubmitButton = styled.button<{ $ready: boolean }>`
  min-height: 50px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 9px;
  padding: 0 21px;
  border: 0;
  border-radius: 999px;
  color: #fff;
  background: ${(props) => props.$ready ? '#246c58' : '#55746a'};
  box-shadow: ${(props) => props.$ready ? '0 14px 28px rgba(36,108,88,.18)' : 'none'};
  font: inherit;
  font-weight: 900;
  cursor: pointer;
  &:hover { background: #195844; }
  &:focus-visible { outline: 3px solid #123c31; outline-offset: 3px; }
`;

export const Status = styled.p`
  min-height: 22px;
  margin: 12px 0 0;
  color: #35735f;
  font-size: .77rem;
  line-height: 1.5;
  font-weight: 800;
`;

export const Sidebar = styled.aside`
  min-width: 0;
  display: grid;
  gap: 12px;
  position: sticky;
  top: 20px;
  @media (max-width: 900px) { position: static; grid-template-columns: repeat(2, minmax(0, 1fr)); }
  @media (max-width: 620px) { grid-template-columns: 1fr; }
`;

export const SideCard = styled.section<{ $accent?: string }>`
  padding: 22px;
  border: 1px solid ${(props) => props.$accent ? `${props.$accent}99` : '#d0dbd5'};
  border-radius: 19px;
  background: ${(props) => props.$accent ? `linear-gradient(140deg, ${props.$accent}27, rgba(255,255,255,.72))` : 'rgba(255,255,255,.72)'};
  > svg { color: #438b75; }
  > span { display: block; margin-top: 14px; color: #668078; font-size: .63rem; font-weight: 950; letter-spacing: .1em; }
  h2 { margin: 6px 0 0; color: #183b32; font-size: 1.15rem; }
  p { margin: 8px 0 0; color: #64766f; font-size: .8rem; line-height: 1.55; word-break: keep-all; }
  ul { display: grid; gap: 8px; margin: 17px 0 0; padding: 14px 0 0; border-top: 1px solid #d8e0db; list-style: none; }
  li { display: flex; align-items: flex-start; gap: 7px; color: #536c63; font-size: .75rem; line-height: 1.5; }
  li svg { flex: 0 0 auto; margin-top: 2px; color: #4b987f; }
`;

export const EmailCard = styled.section`
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 10px;
  align-items: center;
  padding: 19px;
  border-radius: 18px;
  color: #fff;
  background: #173f34;
  > svg { color: #9ee1c9; }
  div { min-width: 0; display: grid; gap: 3px; }
  span { color: rgba(255,255,255,.55); font-size: .65rem; }
  strong { overflow-wrap: anywhere; font-size: .83rem; }
  button { grid-column: 1 / -1; min-height: 44px; display: inline-flex; align-items: center; justify-content: center; gap: 7px; border: 1px solid rgba(255,255,255,.18); border-radius: 999px; color: #fff; background: rgba(255,255,255,.07); font: inherit; font-size: .75rem; font-weight: 850; cursor: pointer; }
  button:focus-visible { outline: 3px solid #fff; outline-offset: 3px; }
`;

export const DraftNote = styled.aside`
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 10px;
  padding: 17px;
  border: 1px solid #d8d7ca;
  border-radius: 17px;
  color: #6d705e;
  background: #f7f2df;
  p { margin: 0; font-size: .72rem; line-height: 1.55; word-break: keep-all; }
  strong { display: block; margin-bottom: 3px; color: #555b49; }
`;

export const JobsLink = styled(Link)`
  min-height: 47px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 0 15px;
  border: 1px solid #cad6d0;
  border-radius: 999px;
  color: #285c4e;
  background: rgba(255,255,255,.64);
  font-size: .78rem;
  font-weight: 900;
  text-decoration: none;
  &:focus-visible { outline: 3px solid #2f7763; outline-offset: 3px; }
`;
