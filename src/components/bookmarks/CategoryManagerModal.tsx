import React, { useEffect, useState } from 'react';
import styled from 'styled-components';
import { toast } from 'sonner';
import { Category } from '@/types/bookmark-new';

const DEFAULT_ICON = 'fa-folder';
const DEFAULT_COLOR = '#3B82F6';

const ICON_OPTIONS = [
  { value: 'fa-folder', label: '폴더' },
  { value: 'fa-briefcase', label: '업무' },
  { value: 'fa-graduation-cap', label: '학습' },
  { value: 'fa-user', label: '개인' },
  { value: 'fa-bookmark', label: '참고' },
  { value: 'fa-lightbulb', label: '아이디어' },
  { value: 'fa-code', label: '개발' },
  { value: 'fa-film', label: '미디어' },
  { value: 'fa-heart', label: '관심사' },
  { value: 'fa-rocket', label: '프로젝트' },
] as const;

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2200;
  padding: 20px;
  overscroll-behavior: contain;
`;

const Modal = styled.div`
  width: min(920px, 100%);
  max-height: min(760px, calc(100vh - 40px));
  overflow: hidden;
  background: var(--bg-card);
  border: 1px solid var(--border-medium);
  border-radius: 20px;
  box-shadow: 0 30px 80px rgba(0, 0, 0, 0.45);
  display: flex;
  flex-direction: column;
`;

const Header = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 24px 28px 20px;
  border-bottom: 1px solid var(--border-subtle);
`;

const HeaderCopy = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const Title = styled.h2`
  margin: 0;
  font-size: 1.35rem;
  font-weight: 700;
  color: var(--text-bright);
`;

const Subtitle = styled.p`
  margin: 0;
  color: var(--text-muted);
  font-size: 0.92rem;
  line-height: 1.5;
`;

const CloseButton = styled.button`
  width: 36px;
  height: 36px;
  border: 1px solid var(--border-subtle);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.03);
  color: var(--text-muted);
  cursor: pointer;
  transition: background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease;

  &:hover {
    color: var(--text-bright);
    border-color: var(--border-medium);
    background: rgba(255, 255, 255, 0.06);
  }

  &:focus-visible {
    outline: 2px solid rgba(16, 185, 129, 0.45);
    outline-offset: 2px;
  }
`;

const Body = styled.div`
  display: grid;
  grid-template-columns: minmax(280px, 340px) minmax(0, 1fr);
  min-height: 0;
  flex: 1;

  @media (max-width: 860px) {
    grid-template-columns: 1fr;
  }
`;

const Sidebar = styled.div`
  border-right: 1px solid var(--border-subtle);
  padding: 24px;
  overflow-y: auto;

  @media (max-width: 860px) {
    border-right: none;
    border-bottom: 1px solid var(--border-subtle);
  }
`;

const PanelTitle = styled.h3`
  margin: 0 0 14px;
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-bright);
`;

const CategoryList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
`;

const CategoryRow = styled.div<{ $active?: boolean }>`
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px;
  border-radius: 14px;
  border: 1px solid ${props => props.$active ? 'rgba(16, 185, 129, 0.45)' : 'var(--border-subtle)'};
  background: ${props => props.$active ? 'rgba(16, 185, 129, 0.12)' : 'rgba(255, 255, 255, 0.02)'};
  cursor: pointer;
  text-align: left;
  transition: all 0.2s ease;

  &:hover {
    border-color: rgba(16, 185, 129, 0.28);
    background: rgba(255, 255, 255, 0.04);
  }
`;

const CategorySwatch = styled.div<{ $color: string }>`
  width: 38px;
  height: 38px;
  border-radius: 12px;
  background: ${props => `${props.$color}22`};
  color: ${props => props.$color};
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  font-size: 1rem;
`;

const CategoryMeta = styled.div`
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const CategoryName = styled.div`
  color: var(--text-main);
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const CategoryCount = styled.div`
  color: var(--text-muted);
  font-size: 0.82rem;
`;

const RowActions = styled.div`
  display: flex;
  gap: 6px;
  flex-shrink: 0;
`;

const RowActionButton = styled.button<{ $danger?: boolean }>`
  width: 34px;
  height: 34px;
  border-radius: 10px;
  border: 1px solid ${props => props.$danger ? 'rgba(239, 68, 68, 0.24)' : 'var(--border-subtle)'};
  background: ${props => props.$danger ? 'rgba(239, 68, 68, 0.08)' : 'rgba(255, 255, 255, 0.02)'};
  color: ${props => props.$danger ? '#fca5a5' : 'var(--text-muted)'};
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover:not(:disabled) {
    color: ${props => props.$danger ? '#fecaca' : 'var(--text-bright)'};
    background: ${props => props.$danger ? 'rgba(239, 68, 68, 0.14)' : 'rgba(255, 255, 255, 0.06)'};
  }

  &:disabled {
    opacity: 0.55;
    cursor: wait;
  }
`;

const EmptyState = styled.div`
  padding: 18px;
  border: 1px dashed var(--border-subtle);
  border-radius: 14px;
  color: var(--text-muted);
  line-height: 1.6;
  font-size: 0.9rem;
`;

const FormPanel = styled.div`
  padding: 24px 28px 28px;
  overflow-y: auto;
`;

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: 18px;
`;

const FormHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
`;

const FormHeaderTitle = styled.h3`
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-bright);
`;

const GhostButton = styled.button`
  border: 1px solid var(--border-subtle);
  background: rgba(255, 255, 255, 0.02);
  color: var(--text-muted);
  padding: 10px 14px;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover:not(:disabled) {
    color: var(--text-bright);
    background: rgba(255, 255, 255, 0.06);
  }

  &:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }
`;

const FormGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const Label = styled.label`
  color: var(--text-muted);
  font-size: 0.9rem;
  font-weight: 500;
`;

const Input = styled.input`
  padding: 12px 14px;
  border-radius: 12px;
  border: 1px solid var(--border-subtle);
  background: rgba(255, 255, 255, 0.03);
  color: var(--text-main);
  outline: none;

  &:focus {
    border-color: rgba(16, 185, 129, 0.45);
    box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.12);
  }
`;

const ColorField = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
`;

const ColorInput = styled.input`
  width: 52px;
  height: 42px;
  border-radius: 12px;
  border: 1px solid var(--border-subtle);
  background: transparent;
  cursor: pointer;
  padding: 0;
`;

const ColorValue = styled.code`
  color: var(--text-muted);
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--border-subtle);
  border-radius: 999px;
  padding: 6px 10px;
  font-size: 0.82rem;
`;

const IconGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(86px, 1fr));
  gap: 10px;
`;

const IconButton = styled.button<{ $active?: boolean; $color: string }>`
  border-radius: 14px;
  border: 1px solid ${props => props.$active ? 'rgba(16, 185, 129, 0.45)' : 'var(--border-subtle)'};
  background: ${props => props.$active ? 'rgba(16, 185, 129, 0.12)' : 'rgba(255, 255, 255, 0.03)'};
  color: var(--text-main);
  cursor: pointer;
  padding: 12px 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  transition: all 0.2s ease;

  i {
    font-size: 1rem;
    color: ${props => props.$color};
  }

  span {
    font-size: 0.82rem;
    color: var(--text-muted);
  }

  &:hover {
    border-color: rgba(16, 185, 129, 0.28);
    background: rgba(255, 255, 255, 0.05);
  }
`;

const PreviewCard = styled.div`
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px;
  border-radius: 16px;
  border: 1px solid var(--border-subtle);
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.02)),
    var(--bg-card);
`;

const PreviewInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
`;

const PreviewName = styled.div`
  color: var(--text-bright);
  font-weight: 600;
`;

const PreviewText = styled.div`
  color: var(--text-muted);
  font-size: 0.85rem;
`;

const SubmitRow = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 6px;
`;

const PrimaryButton = styled.button`
  border: none;
  border-radius: 10px;
  padding: 11px 18px;
  background: linear-gradient(135deg, var(--primary), var(--primary-dark));
  color: var(--text-bright);
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 12px 26px var(--primary-glow);
  }

  &:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }
`;

type CategoryFormValues = {
  name: string;
  icon: string;
  color: string;
};

interface CategoryManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: Category[];
  bookmarksCount: Record<string, number>;
  initialCategory?: Category | null;
  onCreate: (data: CategoryFormValues) => Promise<void>;
  onUpdate: (categoryId: string, data: CategoryFormValues) => Promise<void>;
  onDelete: (category: Category) => Promise<void>;
}

function normalizeColor(color?: string): string {
  if (typeof color === 'string' && /^#[0-9a-fA-F]{6}$/.test(color)) {
    return color;
  }

  return DEFAULT_COLOR;
}

function createFormValues(category?: Category | null): CategoryFormValues {
  return {
    name: category?.name ?? '',
    icon: category?.icon ?? DEFAULT_ICON,
    color: normalizeColor(category?.color),
  };
}

export const CategoryManagerModal: React.FC<CategoryManagerModalProps> = ({
  isOpen,
  onClose,
  categories,
  bookmarksCount,
  initialCategory = null,
  onCreate,
  onUpdate,
  onDelete,
}) => {
  const [formValues, setFormValues] = useState<CategoryFormValues>(createFormValues(initialCategory));
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(initialCategory?.id ?? null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingCategoryId, setDeletingCategoryId] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    if (initialCategory) {
      setEditingCategoryId(initialCategory.id);
      setFormValues(createFormValues(initialCategory));
      return;
    }

    setEditingCategoryId(null);
    setFormValues(createFormValues(null));
  }, [isOpen, initialCategory]);

  useEffect(() => {
    if (!isOpen || !editingCategoryId) return;

    const stillExists = categories.some((category) => category.id === editingCategoryId);
    if (!stillExists) {
      setEditingCategoryId(null);
      setFormValues(createFormValues(null));
    }
  }, [categories, editingCategoryId, isOpen]);

  const handleStartCreate = () => {
    setEditingCategoryId(null);
    setFormValues(createFormValues(null));
  };

  const handleStartEdit = (category: Category) => {
    setEditingCategoryId(category.id);
    setFormValues(createFormValues(category));
  };

  const handleDelete = async (category: Category) => {
    setDeletingCategoryId(category.id);

    try {
      await onDelete(category);
      if (editingCategoryId === category.id) {
        handleStartCreate();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '카테고리 삭제에 실패했습니다.';
      toast.error(message);
    } finally {
      setDeletingCategoryId(null);
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    setIsSubmitting(true);
    try {
      if (editingCategoryId) {
        await onUpdate(editingCategoryId, formValues);
      } else {
        await onCreate(formValues);
      }

      handleStartCreate();
    } catch (error) {
      const message = error instanceof Error ? error.message : '카테고리 저장에 실패했습니다.';
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting && !deletingCategoryId) {
      onClose();
    }
  };

  if (!isOpen) return null;

  const previewName = formValues.name.trim() || '새 카테고리';

  return (
    <Overlay onClick={handleClose}>
      <Modal
        role="dialog"
        aria-modal="true"
        aria-labelledby="category-manager-title"
        onClick={(event) => event.stopPropagation()}
      >
        <Header>
          <HeaderCopy>
            <Title id="category-manager-title">카테고리 관리</Title>
            <Subtitle>북마크 분류를 추가하고 이름, 아이콘, 색상을 수정하거나 삭제할 수 있습니다.</Subtitle>
          </HeaderCopy>
          <CloseButton type="button" onClick={handleClose} aria-label="카테고리 관리 닫기">
            <i className="fa-solid fa-xmark" aria-hidden="true"></i>
          </CloseButton>
        </Header>

        <Body>
          <Sidebar>
            <PanelTitle>현재 카테고리</PanelTitle>
            {categories.length > 0 ? (
              <CategoryList>
                {categories.map((category) => (
                  <CategoryRow
                    key={category.id}
                    $active={editingCategoryId === category.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => handleStartEdit(category)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        handleStartEdit(category);
                      }
                    }}
                  >
                    <CategorySwatch $color={normalizeColor(category.color)}>
                      <i className={`fa-solid ${category.icon || DEFAULT_ICON}`} aria-hidden="true"></i>
                    </CategorySwatch>

                    <CategoryMeta>
                      <CategoryName>{category.name}</CategoryName>
                      <CategoryCount>{bookmarksCount[category.id] || 0}개의 북마크</CategoryCount>
                    </CategoryMeta>

                    <RowActions onClick={(event) => event.stopPropagation()}>
                      <RowActionButton
                        type="button"
                        aria-label={`${category.name} 수정`}
                        title={`${category.name} 수정`}
                        onClick={() => handleStartEdit(category)}
                      >
                        <i className="fa-regular fa-pen-to-square" aria-hidden="true"></i>
                      </RowActionButton>
                      <RowActionButton
                        type="button"
                        $danger
                        aria-label={`${category.name} 삭제`}
                        title={`${category.name} 삭제`}
                        disabled={deletingCategoryId === category.id}
                        onClick={() => handleDelete(category)}
                      >
                        <i className="fa-regular fa-trash-can" aria-hidden="true"></i>
                      </RowActionButton>
                    </RowActions>
                  </CategoryRow>
                ))}
              </CategoryList>
            ) : (
              <EmptyState>아직 카테고리가 없습니다. 오른쪽 폼에서 첫 카테고리를 만들어 주세요.</EmptyState>
            )}
          </Sidebar>

          <FormPanel>
            <Form onSubmit={handleSubmit}>
              <FormHeader>
                <FormHeaderTitle>{editingCategoryId ? '카테고리 수정' : '새 카테고리 추가'}</FormHeaderTitle>
                <GhostButton type="button" onClick={handleStartCreate} disabled={isSubmitting}>
                  새로 입력
                </GhostButton>
              </FormHeader>

              <FormGroup>
                <Label htmlFor="bookmark-category-name">카테고리 이름</Label>
                  <Input
                    id="bookmark-category-name"
                    name="categoryName"
                    autoComplete="off"
                  value={formValues.name}
                  onChange={(event) => setFormValues((prev) => ({ ...prev, name: event.target.value }))}
                  placeholder="예: 디자인 레퍼런스"
                  maxLength={50}
                  disabled={isSubmitting}
                />
              </FormGroup>

              <FormGroup>
                <Label htmlFor="bookmark-category-color">색상</Label>
                <ColorField>
                  <ColorInput
                    id="bookmark-category-color"
                    type="color"
                    name="categoryColor"
                    value={formValues.color}
                    onChange={(event) => setFormValues((prev) => ({ ...prev, color: event.target.value }))}
                    disabled={isSubmitting}
                  />
                  <ColorValue>{formValues.color.toUpperCase()}</ColorValue>
                </ColorField>
              </FormGroup>

              <FormGroup>
                <Label>아이콘</Label>
                <IconGrid>
                  {ICON_OPTIONS.map((icon) => (
                    <IconButton
                      key={icon.value}
                      type="button"
                      $active={formValues.icon === icon.value}
                      $color={formValues.color}
                      onClick={() => setFormValues((prev) => ({ ...prev, icon: icon.value }))}
                      disabled={isSubmitting}
                      aria-pressed={formValues.icon === icon.value}
                      aria-label={`${icon.label} 아이콘 선택`}
                    >
                      <i className={`fa-solid ${icon.value}`} aria-hidden="true"></i>
                      <span>{icon.label}</span>
                    </IconButton>
                  ))}
                </IconGrid>
              </FormGroup>

              <FormGroup>
                <Label>미리보기</Label>
                <PreviewCard>
                  <CategorySwatch $color={formValues.color}>
                    <i className={`fa-solid ${formValues.icon}`} aria-hidden="true"></i>
                  </CategorySwatch>
                  <PreviewInfo>
                    <PreviewName>{previewName}</PreviewName>
                    <PreviewText>사이드바에서 이렇게 보입니다.</PreviewText>
                  </PreviewInfo>
                </PreviewCard>
              </FormGroup>

              <SubmitRow>
                <GhostButton type="button" onClick={handleClose} disabled={isSubmitting}>
                  닫기
                </GhostButton>
                <PrimaryButton type="submit" disabled={isSubmitting}>
                  {editingCategoryId ? '카테고리 저장' : '카테고리 추가'}
                </PrimaryButton>
              </SubmitRow>
            </Form>
          </FormPanel>
        </Body>
      </Modal>
    </Overlay>
  );
};
