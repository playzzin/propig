import styled from 'styled-components';

export const Workspace = styled.section<{ $editing?: boolean }>`
  height: 100%; min-height: 0; min-width: 0; display: flex; flex-direction: column;
  border: 1px solid var(--border-subtle); border-radius: 14px; overflow: hidden;
  background: var(--bg-card); color: var(--text-main);
  button, input, select, textarea { font: inherit; }
  button { touch-action: manipulation; }
  button:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible {
    outline: 2px solid var(--primary-light); outline-offset: 2px;
  }
  button:disabled { cursor: not-allowed; opacity: .5; }
  input, textarea, select { color: var(--text-main); background: var(--bg-card); border: 1px solid var(--border-subtle); border-radius: 8px; min-width: 0; }
  input, select { min-height: 40px; padding: 8px 10px; }
  option { background: var(--bg-card); }
  input::placeholder, textarea::placeholder { color: var(--text-muted); opacity: .9; }
  @media(max-width: 720px) {
    > [data-memo-controls] { display: ${({ $editing }) => $editing ? 'none' : undefined}; }
  }
`;
export const Toolbar = styled.div`
  display: flex; align-items: center; flex-wrap: wrap; gap: 8px; padding: 12px;
  border-bottom: 1px solid var(--border-subtle); flex-shrink: 0;
  input[type='search'] { flex: 1 1 180px; width: 180px; }
  select { max-width: 180px; }
  @media(max-width: 720px) { padding: 10px; gap: 6px; select { flex: 1; max-width: none; } }
`;
export const Button = styled.button<{ $primary?: boolean; $danger?: boolean }>`
  min-height: 40px; padding: 8px 11px; border-radius: 8px; display: inline-flex;
  gap: 6px; align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0;
  border: 1px solid var(--border-subtle); font-size: .84rem !important; font-weight: 700 !important;
  color: ${({ $primary, $danger }) => $primary ? 'var(--bg-card)' : $danger ? 'var(--danger, #ef4444)' : 'var(--text-main)'};
  background: ${({ $primary }) => $primary ? 'var(--primary-light)' : 'transparent'};
  &:hover { filter: brightness(1.12); border-color: var(--primary-light); }
  &[aria-pressed='true'] { border-color: var(--primary-light); color: var(--primary-light); background: var(--bg-card); }
`;
export const QuickForm = styled.form`
  display: flex; gap: 8px; padding: 10px 12px; border-bottom: 1px solid var(--border-subtle);
  input { width: 100%; flex: 1; }
`;
export const FilterBar = styled.div`
  display: flex; gap: 6px; align-items: center; padding: 8px 12px; overflow-x: auto; flex-shrink: 0;
  border-bottom: 1px solid var(--border-subtle);
  button { white-space: nowrap; min-height: 34px; }
  span { color: var(--text-muted); font-size: .8rem; white-space: nowrap; }
`;
export const Body = styled.div<{ $editing: boolean }>`
  display: grid; grid-template-columns: minmax(250px, 32%) minmax(0, 1fr); flex: 1; min-height: 0;
  @media(max-width: 720px) {
    display: flex; flex-direction: column;
    > [data-smart-memo-list] { display: ${({ $editing }) => $editing ? 'none' : 'flex'}; }
    > [data-smart-memo-editor] { display: ${({ $editing }) => $editing ? 'flex' : 'none'}; }
  }
`;
export const List = styled.div`
  min-width: 0; overflow-y: auto; border-right: 1px solid var(--border-subtle);
  display: flex; flex-direction: column; padding: 8px; gap: 5px;
  @media(max-width: 720px) { border-right: 0; flex: 1; }
`;
export const ListRow = styled.div<{ $active: boolean; $color: string }>`
  flex-shrink: 0; display: flex; gap: 6px; align-items: flex-start; padding: 8px;
  content-visibility: auto; contain-intrinsic-size: auto 96px;
  border: 1px solid ${({ $active }) => $active ? 'var(--primary-light)' : 'transparent'};
  border-left: 4px solid ${({ $color }) => $color}; border-radius: 9px;
  background: ${({ $active }) => $active ? 'var(--bg-main, var(--bg-card))' : 'transparent'};
  &:hover { background: var(--bg-main, var(--bg-card)); }
  input { min-height: 20px; width: 18px; height: 18px; margin: 7px 0; accent-color: var(--primary-light); }
  button { min-width: 0; flex: 1; text-align: left; background: none; color: inherit; border: 0; cursor: pointer; padding: 3px; }
  strong { display: block; font-size: .93rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  strong svg { display: inline-block; vertical-align: middle; }
  p { margin: 5px 0; font-size: .81rem; line-height: 1.5; color: var(--text-muted); overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow-wrap: anywhere; }
  small { display: flex; flex-wrap: wrap; gap: 5px; color: var(--text-muted); font-size: .72rem; overflow-wrap: anywhere; }
`;
export const Editor = styled.div`
  display: flex; flex-direction: column; min-width: 0; min-height: 0; overflow-y: auto;
  padding: 18px 22px; gap: 14px; flex: 1;
  @media(max-width: 720px) { padding: 12px; }
`;
export const EditorHeader = styled.div`
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  small { color: var(--text-muted); font-size: .75rem; margin-right: auto; }
`;
export const BackButton = styled(Button)`
  display: none; @media(max-width: 720px) { display: inline-flex; }
`;
export const Title = styled.input`
  width: 100%; font-size: 1.3rem !important; font-weight: 800 !important; padding: 10px 0 !important;
  border: 0 !important; border-radius: 0 !important; border-bottom: 1px solid var(--border-subtle) !important;
`;
export const Content = styled.textarea`
  width: 100%; min-height: 260px; resize: vertical; padding: 12px; line-height: 1.8; flex: 1;
  @media(max-width: 720px) { min-height: 220px; }
`;
export const Meta = styled.div`
  display: flex; flex-wrap: wrap; gap: 10px; align-items: center;
  label { display: flex; align-items: center; gap: 6px; font-size: .8rem; color: var(--text-muted); }
  input { flex: 1; width: 160px; }
`;
export const Tags = styled.div`
  display: flex; flex-wrap: wrap; align-items: center; gap: 6px;
  button { min-height: 34px; max-width: 100%; overflow-wrap: anywhere; }
  form { display: flex; flex: 1 1 160px; gap: 6px; }
  input { width: 130px; flex: 1; }
`;
export const Checklist = styled.div`
  display: flex; flex-direction: column; gap: 8px;
  > p { margin: 0; color: var(--text-muted); font-size: .82rem; }
  progress { width: 100%; height: 5px; accent-color: var(--primary-light); border: 0; }
  progress::-webkit-progress-bar { background: var(--border-subtle); border-radius: 4px; }
  progress::-webkit-progress-value { background: var(--primary-light); border-radius: 4px; }
  progress::-moz-progress-bar { background: var(--primary-light); border-radius: 4px; }
`;
export const CheckRow = styled.div`
  display: flex; align-items: center; gap: 6px;
  input[type='checkbox'] { width: 20px; height: 20px; min-height: 20px; accent-color: var(--primary-light); flex-shrink: 0; }
  input[type='text'] { width: 0; flex: 1; }
  button { width: 36px; min-height: 38px; padding: 5px; }
`;
export const CommentArea = styled.div`
  margin: 5px 0 10px 28px; padding-left: 10px; border-left: 2px solid var(--border-subtle);
  p { display: flex; align-items: center; gap: 6px; font-size: .8rem; color: var(--text-muted); overflow-wrap: anywhere; }
  p span { flex: 1; min-width: 0; white-space: pre-wrap; }
  form { display: flex; gap: 6px; } input { width: 0; flex: 1; }
`;
export const Notice = styled.div`
  padding: 10px 12px; font-size: .82rem; line-height: 1.6; color: var(--text-muted);
  border-bottom: 1px solid var(--border-subtle); display: flex; gap: 8px; align-items: center; flex-wrap: wrap;
  span { flex: 1; min-width: 180px; overflow-wrap: anywhere; }
`;
export const Empty = styled.div`
  display: flex; flex: 1; min-height: 200px; flex-direction: column; align-items: center; justify-content: center;
  gap: 10px; padding: 24px; text-align: center; color: var(--text-muted);
  strong { color: var(--text-main); } p { margin: 0; font-size: .85rem; line-height: 1.6; }
`;
export const COLORS = { sun: '#d6aa39', lime: '#78af42', sky: '#56a6d4', rose: '#d57890', violet: '#a38bd0', slate: '#909cab' };
