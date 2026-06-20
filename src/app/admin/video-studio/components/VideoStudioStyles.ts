import styled from 'styled-components';
import { VideoStudioJobStatus } from '@/lib/video-studio';

export const Shell = styled.div`
    position: relative;
    flex: 1;
    min-height: 0;
    height: 100%;
    display: grid;
    grid-template-columns: minmax(290px, 320px) minmax(0, 1fr) minmax(320px, 360px);
    grid-template-areas: 'left center right';
    gap: 20px;
    padding: 20px;
    color: #f8fafc;
    background:
        radial-gradient(circle at top left, rgba(249, 115, 22, 0.18), transparent 22%),
        radial-gradient(circle at 82% 4%, rgba(56, 189, 248, 0.16), transparent 20%),
        linear-gradient(180deg, #07111d 0%, #0a1321 46%, #09111d 100%);
    overflow-y: auto;
    overflow-x: hidden;
    align-items: start;
    align-content: start;
    scrollbar-gutter: stable;
    isolation: isolate;
    &::before {
        content: '';
        position: absolute;
        inset: 0;
        pointer-events: none;
        background-image:
            linear-gradient(rgba(148, 163, 184, 0.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(148, 163, 184, 0.04) 1px, transparent 1px);
        background-size: 72px 72px;
        mask-image: linear-gradient(180deg, rgba(0, 0, 0, 0.32), transparent 92%);
        z-index: -1;
    }
    @media (max-width: 1240px) {
        grid-template-columns: minmax(280px, 320px) minmax(0, 1fr);
        grid-template-areas:
            'left center'
            'left right';
    }
    @media (max-width: 1040px) {
        grid-template-columns: 1fr;
        grid-template-areas:
            'left'
            'center'
            'right';
        padding: 16px;
        height: auto;
    }
`;

export const Column = styled.section`
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    position: relative;
    overflow: hidden;
    border: 1px solid rgba(148, 163, 184, 0.14);
    border-radius: 30px;
    background: linear-gradient(180deg, rgba(12, 18, 31, 0.94), rgba(8, 13, 24, 0.9));
    box-shadow:
        0 30px 80px rgba(2, 6, 23, 0.45),
        inset 0 1px 0 rgba(255, 255, 255, 0.05);
    backdrop-filter: blur(18px);
    &::before {
        content: '';
        position: absolute;
        inset: 0 0 auto 0;
        height: 120px;
        background: linear-gradient(180deg, rgba(255, 255, 255, 0.04), transparent);
        pointer-events: none;
    }
`;

export const Left = styled(Column)`
    grid-area: left;
    align-self: start;
    background:
        radial-gradient(circle at top left, rgba(251, 191, 36, 0.08), transparent 28%),
        linear-gradient(180deg, rgba(13, 20, 34, 0.95), rgba(8, 13, 24, 0.92));
`;

export const Center = styled(Column)`
    grid-area: center;
    align-self: start;
    padding: 22px;
    gap: 18px;
`;

export const Right = styled(Column)`
    grid-area: right;
    align-self: start;
    background:
        radial-gradient(circle at top right, rgba(56, 189, 248, 0.08), transparent 28%),
        linear-gradient(180deg, rgba(13, 20, 34, 0.95), rgba(8, 13, 24, 0.92));
`;

export const Section = styled.div`
    padding: 22px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
`;

export const Title = styled.h1`
    margin: 0;
    font-size: 1.35rem;
    font-weight: 800;
    letter-spacing: -0.03em;
`;

export const Copy = styled.p`
    margin: 8px 0 0;
    color: rgba(226, 232, 240, 0.74);
    line-height: 1.65;
    font-size: 0.84rem;
    word-break: keep-all;
`;

export const FieldGroup = styled.div`
    display: flex;
    flex-direction: column;
    gap: 8px;
`;

export const FieldLabel = styled.label`
    font-size: 0.76rem;
    font-weight: 700;
    letter-spacing: 0.02em;
    color: rgba(226, 232, 240, 0.88);
`;

export const Input = styled.input`
    width: 100%;
    border: 1px solid rgba(148, 163, 184, 0.18);
    background: rgba(15, 23, 42, 0.82);
    color: #f8fafc;
    border-radius: 16px;
    padding: 13px 15px;
    font-size: 0.9rem;
    outline: none;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
    transition: border-color 160ms ease, box-shadow 160ms ease, background 160ms ease;
    &:focus-visible {
        border-color: rgba(251, 191, 36, 0.56);
        box-shadow: 0 0 0 4px rgba(251, 191, 36, 0.12);
        background: rgba(15, 23, 42, 0.92);
    }
    & + & { margin-top: 10px; }
`;

export const Textarea = styled.textarea`
    width: 100%;
    min-height: 120px;
    border: 1px solid rgba(148, 163, 184, 0.18);
    background: rgba(15, 23, 42, 0.82);
    color: #f8fafc;
    border-radius: 18px;
    padding: 14px;
    resize: vertical;
    outline: none;
    font-size: 0.92rem;
    line-height: 1.6;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
    transition: border-color 160ms ease, box-shadow 160ms ease, background 160ms ease;
    &:focus-visible {
        border-color: rgba(251, 191, 36, 0.56);
        box-shadow: 0 0 0 4px rgba(251, 191, 36, 0.12);
        background: rgba(15, 23, 42, 0.92);
    }
`;

export const Row = styled.div`
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
    @media (max-width: 640px) {
        grid-template-columns: 1fr;
    }
`;

export const Select = styled.select`
    width: 100%;
    border: 1px solid rgba(148, 163, 184, 0.18);
    background: rgba(15, 23, 42, 0.82);
    color: #f8fafc;
    border-radius: 16px;
    padding: 13px 15px;
    outline: none;
    transition: border-color 160ms ease, box-shadow 160ms ease;
    &:focus-visible {
        border-color: rgba(251, 191, 36, 0.56);
        box-shadow: 0 0 0 4px rgba(251, 191, 36, 0.12);
    }
`;

export const Button = styled.button<{ $ghost?: boolean; $warn?: boolean }>`
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid ${({ $ghost }) => ($ghost ? 'rgba(255,255,255,0.14)' : 'transparent')};
    border-radius: 16px;
    padding: 12px 14px;
    font-size: 0.82rem;
    font-weight: 700;
    letter-spacing: -0.01em;
    cursor: pointer;
    color: ${({ $ghost }) => ($ghost ? '#f8fafc' : '#111827')};
    background: ${({ $ghost, $warn }) =>
        $warn
            ? 'linear-gradient(135deg, #dc2626, #f97316)'
            : $ghost
              ? 'rgba(255,255,255,0.04)'
              : 'linear-gradient(135deg, #fcd34d, #f97316)'};
    box-shadow: ${({ $ghost, $warn }) =>
        $ghost
            ? 'none'
            : $warn
              ? '0 18px 38px rgba(220, 38, 38, 0.22)'
              : '0 18px 38px rgba(249, 115, 22, 0.24)'};
    transition: transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease, opacity 160ms ease;
    &:hover:not(:disabled) {
        transform: translateY(-1px);
        border-color: ${({ $ghost }) => ($ghost ? 'rgba(251,191,36,0.28)' : 'transparent')};
    }
    &:focus-visible {
        outline: none;
        border-color: rgba(251, 191, 36, 0.72);
        box-shadow: 0 0 0 4px rgba(251, 191, 36, 0.18);
    }
    &:disabled { opacity: 0.45; cursor: not-allowed; box-shadow: none; }
`;

export const ProjectListWrapper = styled.div`
    flex: none;
    min-height: 220px;
    max-height: min(44vh, 520px);
    overflow-y: auto;
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 12px;
`;

export const ProjectButton = styled.button<{ $active?: boolean }>`
    text-align: left;
    border-radius: 22px;
    padding: 16px;
    border: 1px solid ${({ $active }) => ($active ? 'rgba(251,191,36,0.85)' : 'rgba(148,163,184,0.14)')};
    background: ${({ $active }) =>
        $active
            ? 'linear-gradient(180deg, rgba(249,115,22,0.18), rgba(15,23,42,0.86))'
            : 'linear-gradient(180deg, rgba(255,255,255,0.04), rgba(15,23,42,0.72))'};
    color: #f8fafc;
    cursor: pointer;
    box-shadow: ${({ $active }) => ($active ? '0 18px 36px rgba(249,115,22,0.16)' : 'none')};
    transition: transform 160ms ease, border-color 160ms ease, box-shadow 160ms ease;
    &:hover {
        transform: translateY(-1px);
        border-color: rgba(251, 191, 36, 0.32);
    }
    &:focus-visible {
        outline: none;
        border-color: rgba(251, 191, 36, 0.72);
        box-shadow: 0 0 0 4px rgba(251, 191, 36, 0.16);
    }
    strong { display: block; margin-bottom: 6px; font-size: 0.95rem; }
    small {
        color: rgba(226, 232, 240, 0.68);
        line-height: 1.55;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
    }
`;

export const Card = styled.div`
    border: 1px solid rgba(148, 163, 184, 0.14);
    border-radius: 28px;
    background:
        linear-gradient(180deg, rgba(15, 23, 42, 0.9), rgba(8, 13, 24, 0.84));
    overflow: hidden;
    box-shadow:
        0 24px 56px rgba(2, 6, 23, 0.36),
        inset 0 1px 0 rgba(255, 255, 255, 0.04);
`;

export const Preview = styled.div`
    min-height: 420px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 28px;
    background:
        radial-gradient(circle at top right, rgba(251,191,36,0.14), transparent 28%),
        radial-gradient(circle at bottom left, rgba(56,189,248,0.08), transparent 24%),
        linear-gradient(180deg, rgba(15,23,42,0.82), rgba(2,6,23,0.72));
    video, img {
        width: 100%;
        max-height: 100%;
        object-fit: contain;
        border-radius: 22px;
        background: rgba(2, 6, 23, 0.72);
        border: 1px solid rgba(148, 163, 184, 0.14);
        box-shadow: 0 24px 60px rgba(2, 6, 23, 0.42);
    }
`;

export const CardBody = styled.div`
    padding: 22px;
    display: flex;
    flex-direction: column;
    gap: 14px;
`;

export const BadgeRow = styled.div`
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
`;

export const Badge = styled.span`
    display: inline-flex;
    align-items: center;
    padding: 6px 10px;
    border-radius: 999px;
    border: 1px solid rgba(148, 163, 184, 0.14);
    background: rgba(255,255,255,0.05);
    font-size: 0.68rem;
    color: rgba(248,250,252,0.84);
`;

export const Upload = styled.label`
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 72px;
    border: 1px dashed rgba(251,191,36,0.35);
    border-radius: 20px;
    padding: 16px;
    background:
        linear-gradient(180deg, rgba(251,191,36,0.08), rgba(15,23,42,0.68));
    cursor: pointer;
    font-size: 0.8rem;
    color: rgba(248,250,252,0.86);
    text-align: center;
    line-height: 1.55;
    &:focus-within {
        border-color: rgba(251, 191, 36, 0.72);
        box-shadow: 0 0 0 4px rgba(251, 191, 36, 0.14);
    }
`;

export const Panel = styled.div`
    border: 1px solid rgba(148, 163, 184, 0.14);
    border-radius: 22px;
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.04), rgba(15, 23, 42, 0.72));
    padding: 16px;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
`;

export const CalloutPanel = styled(Panel)`
    background:
        radial-gradient(circle at top right, rgba(249, 115, 22, 0.14), transparent 32%),
        linear-gradient(180deg, rgba(255, 255, 255, 0.05), rgba(15, 23, 42, 0.76));
`;

export const FormulaText = styled.div`
    font-size: 0.82rem;
    line-height: 1.65;
    color: rgba(248, 250, 252, 0.9);
`;

export const RecipeGrid = styled.div`
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
    @media (max-width: 640px) {
        grid-template-columns: 1fr;
    }
`;

export const RecipeCard = styled.button`
    min-width: 0;
    text-align: left;
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 14px;
    border-radius: 20px;
    border: 1px solid rgba(148, 163, 184, 0.16);
    background:
        linear-gradient(180deg, rgba(255, 255, 255, 0.06), rgba(15, 23, 42, 0.76));
    color: #f8fafc;
    cursor: pointer;
    transition: transform 160ms ease, border-color 160ms ease, box-shadow 160ms ease;
    &:hover {
        transform: translateY(-1px);
        border-color: rgba(251, 191, 36, 0.42);
        box-shadow: 0 18px 32px rgba(15, 23, 42, 0.26);
    }
    &:focus-visible {
        outline: none;
        border-color: rgba(251, 191, 36, 0.72);
        box-shadow: 0 0 0 4px rgba(251, 191, 36, 0.16);
    }
`;

export const RecipeTitle = styled.div`
    font-size: 0.9rem;
    font-weight: 800;
    letter-spacing: -0.02em;
`;

export const RecipeBody = styled.div`
    font-size: 0.76rem;
    line-height: 1.6;
    color: rgba(226, 232, 240, 0.8);
`;

export const RecipeMeta = styled.div`
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
`;

export const MiniBadge = styled.span`
    display: inline-flex;
    align-items: center;
    padding: 4px 8px;
    border-radius: 999px;
    background: rgba(249, 115, 22, 0.12);
    border: 1px solid rgba(249, 115, 22, 0.18);
    font-size: 0.65rem;
    color: rgba(255, 237, 213, 0.92);
`;

export const ActionGrid = styled.div`
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
    @media (max-width: 720px) {
        grid-template-columns: 1fr;
    }
`;

export const ActionCard = styled.div`
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 14px;
    border-radius: 20px;
    border: 1px solid rgba(148, 163, 184, 0.14);
    background:
        linear-gradient(180deg, rgba(255, 255, 255, 0.04), rgba(15, 23, 42, 0.72));
`;

export const ActionTitle = styled.div`
    font-size: 0.88rem;
    font-weight: 800;
    letter-spacing: -0.02em;
    color: #f8fafc;
`;

export const ActionDescription = styled.div`
    font-size: 0.76rem;
    line-height: 1.6;
    color: rgba(226, 232, 240, 0.76);
`;

export const StepGrid = styled.div`
    display: grid;
    gap: 12px;
`;

export const StepCard = styled.div`
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 16px;
    border-radius: 22px;
    border: 1px solid rgba(148, 163, 184, 0.14);
    background:
        linear-gradient(180deg, rgba(255, 255, 255, 0.05), rgba(15, 23, 42, 0.76));
`;

export const StepHeader = styled.div`
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
`;

export const StepNumber = styled.span`
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: 999px;
    background: linear-gradient(135deg, rgba(251, 191, 36, 0.92), rgba(249, 115, 22, 0.92));
    color: #111827;
    font-size: 0.76rem;
    font-weight: 900;
`;

export const StepTitle = styled.div`
    font-size: 0.92rem;
    font-weight: 800;
    letter-spacing: -0.02em;
    color: #f8fafc;
`;

export const ActionRail = styled.div`
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
    @media (max-width: 920px) {
        grid-template-columns: 1fr;
    }
`;

export const ActionToggle = styled.button<{ $active?: boolean }>`
    min-width: 0;
    text-align: left;
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 14px;
    border-radius: 18px;
    border: 1px solid ${({ $active }) => ($active ? 'rgba(251,191,36,0.72)' : 'rgba(148,163,184,0.16)')};
    background: ${({ $active }) =>
        $active
            ? 'linear-gradient(180deg, rgba(249,115,22,0.18), rgba(15,23,42,0.78))'
            : 'linear-gradient(180deg, rgba(255,255,255,0.04), rgba(15,23,42,0.72))'};
    color: #f8fafc;
    cursor: pointer;
    transition: transform 160ms ease, border-color 160ms ease, box-shadow 160ms ease;
    &:hover {
        transform: translateY(-1px);
        border-color: rgba(251, 191, 36, 0.42);
    }
    &:focus-visible {
        outline: none;
        border-color: rgba(251, 191, 36, 0.72);
        box-shadow: 0 0 0 4px rgba(251, 191, 36, 0.16);
    }
`;

export const Disclosure = styled.details`
    border: 1px solid rgba(148, 163, 184, 0.14);
    border-radius: 22px;
    background: linear-gradient(180deg, rgba(255,255,255,0.04), rgba(15,23,42,0.72));
    padding: 16px;
`;

export const DisclosureSummary = styled.summary`
    cursor: pointer;
    list-style: none;
    font-size: 0.86rem;
    font-weight: 800;
    letter-spacing: -0.02em;
    color: #f8fafc;
    &::-webkit-details-marker {
        display: none;
    }
`;

export const ModePickerGrid = styled.div`
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
    @media (max-width: 720px) {
        grid-template-columns: 1fr;
    }
`;

export const ModePickerButton = styled.button<{ $active?: boolean }>`
    min-width: 0;
    text-align: left;
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 14px;
    border-radius: 20px;
    border: 1px solid ${({ $active }) => ($active ? 'rgba(251, 191, 36, 0.72)' : 'rgba(148, 163, 184, 0.16)')};
    background: ${({ $active }) =>
        $active
            ? 'linear-gradient(180deg, rgba(249, 115, 22, 0.16), rgba(15, 23, 42, 0.78))'
            : 'linear-gradient(180deg, rgba(255, 255, 255, 0.05), rgba(15, 23, 42, 0.74))'};
    color: #f8fafc;
    cursor: pointer;
    transition: transform 160ms ease, border-color 160ms ease, box-shadow 160ms ease;
    box-shadow: ${({ $active }) => ($active ? '0 18px 34px rgba(249, 115, 22, 0.18)' : 'none')};
    &:hover {
        transform: translateY(-1px);
        border-color: rgba(251, 191, 36, 0.42);
    }
    &:focus-visible {
        outline: none;
        border-color: rgba(251, 191, 36, 0.72);
        box-shadow: 0 0 0 4px rgba(251, 191, 36, 0.16);
    }
`;

export const SectionLabel = styled.div`
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    color: rgba(248, 250, 252, 0.58);
    margin-bottom: 10px;
    text-transform: uppercase;
`;

export const Tabs = styled.div`
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
`;

export const TabButton = styled.button<{ $active?: boolean }>`
    border-radius: 14px;
    border: 1px solid ${({ $active }) => ($active ? 'rgba(251,191,36,0.7)' : 'rgba(148,163,184,0.14)')};
    background: ${({ $active }) => ($active ? 'rgba(249,115,22,0.14)' : 'rgba(255,255,255,0.03)')};
    color: #f8fafc;
    padding: 12px 12px;
    font-size: 0.8rem;
    font-weight: 700;
    cursor: pointer;
    &:focus-visible {
        outline: none;
        border-color: rgba(251, 191, 36, 0.72);
        box-shadow: 0 0 0 4px rgba(251, 191, 36, 0.16);
    }
`;

export const PhotoGrid = styled.div`
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
`;

export const PhotoTile = styled.button<{ $active?: boolean }>`
    border: 1px solid ${({ $active }) => ($active ? 'rgba(251,191,36,0.88)' : 'rgba(148,163,184,0.14)')};
    background: ${({ $active }) => ($active ? 'rgba(249,115,22,0.14)' : 'rgba(2,6,23,0.42)')};
    border-radius: 18px;
    padding: 8px;
    cursor: pointer;
    text-align: left;
    color: #f8fafc;
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
    transition: transform 160ms ease, border-color 160ms ease;
    &:hover {
        transform: translateY(-1px);
        border-color: rgba(251, 191, 36, 0.32);
    }
    &:focus-visible {
        outline: none;
        border-color: rgba(251, 191, 36, 0.72);
        box-shadow: 0 0 0 4px rgba(251, 191, 36, 0.16);
    }
    img {
        width: 100%;
        height: 88px;
        border-radius: 12px;
        object-fit: cover;
        background: rgba(2, 6, 23, 0.72);
    }
    span {
        font-size: 0.7rem;
        line-height: 1.4;
        color: rgba(226, 232, 240, 0.76);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
`;

export const StarterPreview = styled.div`
    display: grid;
    grid-template-columns: 92px minmax(0, 1fr);
    gap: 12px;
    align-items: center;
    img {
        width: 92px;
        height: 92px;
        border-radius: 16px;
        object-fit: cover;
        background: rgba(2, 6, 23, 0.72);
        border: 1px solid rgba(255,255,255,0.08);
    }
`;

export const HintList = styled.div`
    display: flex;
    flex-direction: column;
    gap: 8px;
`;

export const HintItem = styled.div`
    font-size: 0.78rem;
    line-height: 1.6;
    color: rgba(226, 232, 240, 0.8);
`;

export const OverviewGrid = styled.div`
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
    margin-top: 16px;
`;

export const OverviewCard = styled.div`
    min-width: 0;
    border: 1px solid rgba(148, 163, 184, 0.14);
    border-radius: 20px;
    padding: 14px;
    background: linear-gradient(180deg, rgba(255,255,255,0.05), rgba(15,23,42,0.72));
`;

export const OverviewValue = styled.div`
    font-size: 1.35rem;
    font-weight: 800;
    letter-spacing: -0.04em;
    color: #f8fafc;
`;

export const OverviewLabel = styled.div`
    margin-top: 6px;
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: rgba(226, 232, 240, 0.56);
`;

export const OverviewCaption = styled.div`
    margin-top: 8px;
    font-size: 0.76rem;
    line-height: 1.55;
    color: rgba(226, 232, 240, 0.74);
`;

export const Timeline = styled.div`
    flex: none;
    min-height: 280px;
    max-height: min(54vh, 760px);
    overflow-y: auto;
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 10px;
`;

export const JobList = styled.div`
    max-height: min(34vh, 360px);
    overflow-y: auto;
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
`;

export const JobCard = styled.div<{ $status: VideoStudioJobStatus }>`
    border-radius: 22px;
    padding: 14px;
    border: 1px solid ${({ $status }) => jobCardBorder($status)};
    background: ${({ $status }) => jobCardBackground($status)};
    display: flex;
    flex-direction: column;
    gap: 8px;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
`;

export const JobHeader = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
`;

export const JobStatus = styled.span<{ $status: VideoStudioJobStatus }>`
    display: inline-flex;
    align-items: center;
    padding: 5px 9px;
    border-radius: 999px;
    font-size: 0.65rem;
    font-weight: 700;
    background: ${({ $status }) => jobStatusBackground($status)};
    color: ${({ $status }) => jobStatusColor($status)};
`;

export const JobMessage = styled.p`
    margin: 0;
    font-size: 0.74rem;
    line-height: 1.6;
    color: rgba(226, 232, 240, 0.78);
`;

export const ProgressStack = styled.div`
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: 2px;
`;

export const ProgressMeta = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    font-size: 0.67rem;
    color: rgba(226, 232, 240, 0.72);
    span {
        min-width: 0;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
`;

export const ProgressTrack = styled.div`
    position: relative;
    overflow: hidden;
    height: 8px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.08);
    box-shadow: inset 0 1px 1px rgba(15, 23, 42, 0.4);
`;

export const ProgressFill = styled.div<{ $value: number }>`
    height: 100%;
    width: ${({ $value }) => `${Math.max(0, Math.min(100, $value))}%`};
    border-radius: inherit;
    transition: width 220ms ease;
    box-shadow: 0 0 18px rgba(255, 255, 255, 0.16);
`;

export const ClipButton = styled.button<{ $active?: boolean; $selected?: boolean }>`
    text-align: left;
    border-radius: 22px;
    padding: 16px;
    border: 1px solid ${({ $active, $selected }) =>
        $active ? 'rgba(251,191,36,0.85)' : $selected ? 'rgba(249,115,22,0.7)' : 'rgba(148,163,184,0.14)'};
    background: ${({ $active, $selected }) =>
        $active
            ? 'linear-gradient(180deg, rgba(249,115,22,0.18), rgba(15,23,42,0.86))'
            : $selected
              ? 'rgba(249,115,22,0.09)'
              : 'linear-gradient(180deg, rgba(255,255,255,0.04), rgba(15,23,42,0.72))'};
    color: #f8fafc;
    cursor: pointer;
    transition: transform 160ms ease, border-color 160ms ease, box-shadow 160ms ease;
    &:hover {
        transform: translateY(-1px);
        border-color: rgba(251, 191, 36, 0.3);
    }
    &:focus-visible {
        outline: none;
        border-color: rgba(251, 191, 36, 0.72);
        box-shadow: 0 0 0 4px rgba(251, 191, 36, 0.16);
    }
    strong { display: block; margin-bottom: 6px; }
    p {
        margin: 0;
        font-size: 0.74rem;
        color: rgba(226,232,240,0.72);
        line-height: 1.55;
        display: -webkit-box;
        -webkit-line-clamp: 3;
        -webkit-box-orient: vertical;
        overflow: hidden;
    }
`;

function jobStatusBackground(status: VideoStudioJobStatus) {
    switch (status) {
        case 'completed': return 'rgba(16, 185, 129, 0.16)';
        case 'failed': return 'rgba(239, 68, 68, 0.16)';
        case 'uploading': return 'rgba(59, 130, 246, 0.18)';
        case 'running': return 'rgba(251, 191, 36, 0.18)';
        case 'canceled': return 'rgba(148, 163, 184, 0.16)';
        case 'queued':
        default: return 'rgba(148, 163, 184, 0.16)';
    }
}

function jobStatusColor(status: VideoStudioJobStatus) {
    switch (status) {
        case 'completed': return '#6ee7b7';
        case 'failed': return '#fca5a5';
        case 'uploading': return '#93c5fd';
        case 'running': return '#fcd34d';
        case 'canceled': return '#cbd5e1';
        case 'queued':
        default: return '#e2e8f0';
    }
}

function jobCardBorder(status: VideoStudioJobStatus) {
    switch (status) {
        case 'completed': return 'rgba(16, 185, 129, 0.28)';
        case 'failed': return 'rgba(239, 68, 68, 0.3)';
        case 'uploading': return 'rgba(59, 130, 246, 0.28)';
        case 'running': return 'rgba(251, 191, 36, 0.3)';
        case 'canceled': return 'rgba(148, 163, 184, 0.24)';
        case 'queued':
        default: return 'rgba(255, 255, 255, 0.1)';
    }
}

function jobCardBackground(status: VideoStudioJobStatus) {
    switch (status) {
        case 'completed': return 'rgba(6, 78, 59, 0.2)';
        case 'failed': return 'rgba(127, 29, 29, 0.22)';
        case 'uploading': return 'rgba(30, 64, 175, 0.22)';
        case 'running': return 'rgba(120, 53, 15, 0.22)';
        case 'canceled': return 'rgba(51, 65, 85, 0.22)';
        case 'queued':
        default: return 'rgba(255, 255, 255, 0.03)';
    }
}
