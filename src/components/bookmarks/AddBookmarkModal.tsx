import React, { useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { buildJsonAuthHeaders } from '@/lib/client-auth';
import { Category, Metadata, MetadataSchema } from '@/types/bookmark-new';

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2200;
  padding: 16px;
  overscroll-behavior: contain;
`;

const Modal = styled.div`
  background: var(--bg-card);
  border: 1px solid var(--border-medium);
  border-radius: 16px;
  padding: 24px;
  width: min(500px, 100%);
  max-height: calc(100vh - 32px);
  overflow-y: auto;
  max-width: 500px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
`;

const Header = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 24px;
`;

const Title = styled.h2`
  margin: 0;
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--text-bright);
`;

const CloseButton = styled.button`
  width: 36px;
  height: 36px;
  border: 1px solid var(--border-subtle);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.03);
  color: var(--text-muted);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease;

  &:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.06);
    border-color: var(--border-medium);
    color: var(--text-bright);
  }

  &:focus-visible {
    outline: 2px solid rgba(16, 185, 129, 0.45);
    outline-offset: 2px;
  }
`;

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const FormGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const Label = styled.label`
  font-weight: 500;
  color: var(--text-muted);
  font-size: 0.95rem;
`;

const Input = styled.input`
  padding: 12px 16px;
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  font-size: 0.95rem;
  outline: none;
  background: rgba(255, 255, 255, 0.03);
  color: var(--text-main);
  min-width: 0;

  &:focus {
    border-color: rgba(16, 185, 129, 0.45);
    box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.12);
  }

  &::placeholder {
    color: var(--text-dim);
  }
`;

const Textarea = styled.textarea`
  padding: 12px 16px;
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  font-size: 0.95rem;
  outline: none;
  resize: vertical;
  min-height: 80px;
  background: rgba(255, 255, 255, 0.03);
  color: var(--text-main);

  &:focus {
    border-color: rgba(16, 185, 129, 0.45);
    box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.12);
  }

  &::placeholder {
    color: var(--text-dim);
  }
`;

const Select = styled.select`
  padding: 12px 16px;
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  font-size: 0.95rem;
  outline: none;
  background: rgba(255, 255, 255, 0.03);
  color: var(--text-main);

  &:focus {
    border-color: rgba(16, 185, 129, 0.45);
    box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.12);
  }

  option {
    background: var(--bg-card);
  }
`;

const InlineFieldRow = styled.div`
  display: flex;
  gap: 8px;

  @media (max-width: 520px) {
    flex-direction: column;
  }
`;

const ButtonGroup = styled.div`
  display: flex;
  gap: 12px;
  margin-top: 24px;

  @media (max-width: 520px) {
    flex-direction: column-reverse;
  }
`;

const Button = styled.button<{ $variant?: 'primary' | 'secondary' }>`
  flex: 1;
  padding: 12px 24px;
  border-radius: 8px;
  font-weight: 500;
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease, background-color 0.2s ease, color 0.2s ease, border-color 0.2s ease;

  ${(props) =>
    props.$variant === 'primary'
      ? `
    background: linear-gradient(135deg, var(--primary), var(--primary-dark));
    color: var(--text-bright);
    border: none;

    &:hover {
      transform: translateY(-1px);
      box-shadow: 0 12px 26px var(--primary-glow);
    }
  `
      : `
    background: rgba(255, 255, 255, 0.03);
    color: var(--text-muted);
    border: 1px solid var(--border-subtle);

    &:hover {
      background: rgba(255, 255, 255, 0.06);
      color: var(--text-main);
    }
  `}

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  &:focus-visible {
    outline: 2px solid rgba(16, 185, 129, 0.45);
    outline-offset: 2px;
  }
`;

const LoadingSpinner = styled.div`
  display: inline-block;
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.18);
  border-top: 2px solid var(--primary);
  border-radius: 50%;
  animation: spin 1s linear infinite;

  @keyframes spin {
    0% {
      transform: rotate(0deg);
    }
    100% {
      transform: rotate(360deg);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;

interface BookmarkFormData {
  url: string;
  title: string;
  favicon?: string;
  description: string;
  categoryId: string;
  tags: string[];
}

interface AddBookmarkModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: Category[];
  mode?: 'create' | 'edit';
  initialData?: BookmarkFormData | null;
  onSubmit: (data: BookmarkFormData) => Promise<void>;
}

function buildUsageCostMessage(metadata: Metadata): string {
  const totalTokens = metadata.aiUsage?.totalTokens ?? 0;
  const totalCostUsd = metadata.aiCost?.totalCostUsd ?? 0;
  const estimatedKrw = metadata.aiCost?.estimatedKrw;

  if (totalTokens <= 0) return '';

  const usdText = totalCostUsd > 0 ? `$${totalCostUsd.toFixed(6)}` : '$0.000000';
  const krwText = typeof estimatedKrw === 'number' ? ` (약 ${Math.round(estimatedKrw).toLocaleString('ko-KR')}원)` : '';
  return `토큰 ${totalTokens.toLocaleString('ko-KR')} / 예상비용 ${usdText}${krwText}`;
}

export const AddBookmarkModal: React.FC<AddBookmarkModalProps> = ({
  isOpen,
  onClose,
  categories,
  mode = 'create',
  initialData = null,
  onSubmit,
}) => {
  const { currentUser } = useAuth();
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState(categories[0]?.id || '');
  const [tags, setTags] = useState('');
  const [favicon, setFavicon] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const urlInputRef = useRef<HTMLInputElement>(null);

  const getErrorMessage = (error: unknown): string => {
    if (error instanceof Error) return error.message;
    return String(error);
  };

  const handleClose = React.useCallback(() => {
    if (!isLoading && !isAnalyzing) {
      onClose();
    }
  }, [isAnalyzing, isLoading, onClose]);

  useEffect(() => {
    if (!categoryId && categories.length > 0) {
      setCategoryId(categories[0].id);
    }
  }, [categories, categoryId]);

  useEffect(() => {
    if (!isOpen) return;

    if (mode === 'edit' && initialData) {
      setUrl(initialData.url || '');
      setTitle(initialData.title || '');
      setFavicon(initialData.favicon || '');
      setDescription(initialData.description || '');
      setCategoryId(initialData.categoryId || categories[0]?.id || '');
      setTags((initialData.tags || []).join(', '));
      return;
    }

    setUrl('');
    setTitle('');
    setFavicon('');
    setDescription('');
    setTags('');
    setCategoryId(categories[0]?.id || '');
  }, [isOpen, mode, initialData, categories]);

  useEffect(() => {
    if (!isOpen) return;

    const frame = window.requestAnimationFrame(() => {
      urlInputRef.current?.focus();
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        handleClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleClose, isOpen]);

  const getDefaultTitleFromUrl = (targetUrl: string): string => {
    try {
      return new URL(targetUrl).hostname;
    } catch {
      return targetUrl;
    }
  };

  const analyzeUrl = async (targetUrl: string): Promise<Metadata> => {
    const response = await fetch('/api/analyze-bookmark', {
      method: 'POST',
      headers: await buildJsonAuthHeaders(currentUser),
      body: JSON.stringify({
        url: targetUrl,
        categories: categories.map((c) => c.name),
        detailed: false,
        requireAI: false,
      }),
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const message = payload && typeof payload.error === 'string'
        ? payload.error
        : `분석 요청 실패 (HTTP ${response.status})`;
      throw new Error(message);
    }

    const parsed = MetadataSchema.safeParse({
      title: typeof payload?.title === 'string' ? payload.title : '',
      favicon: typeof payload?.favicon === 'string' ? payload.favicon : undefined,
      description: typeof payload?.description === 'string' ? payload.description : '',
      suggestedCategory: typeof payload?.category === 'string' ? payload.category : '',
      tags: Array.isArray(payload?.tags) ? payload.tags.map((tag: unknown) => String(tag)) : [],
      aiUsage: payload?._meta?.usage,
      aiCost: payload?._meta?.costEstimate,
    });
    if (!parsed.success) {
      throw new Error('자동 분석 결과 형식이 올바르지 않습니다.');
    }

    if (process.env.NODE_ENV !== 'production') {
      console.log('[AddBookmarkModal] extractBookmarkMetadata response:', parsed.data);
    }

    return parsed.data;
  };

  const applyMetadataToForm = (metadata: Metadata, options: { force: boolean }) => {
    if (metadata.title) {
      setTitle((prev) => (options.force || !prev.trim() ? metadata.title ?? prev : prev));
    }
    if (metadata.favicon) {
      setFavicon((prev) => (options.force || !prev.trim() ? metadata.favicon ?? prev : prev));
    }
    if (metadata.description) {
      setDescription((prev) => (options.force || !prev.trim() ? metadata.description ?? prev : prev));
    }
    if (metadata.tags && metadata.tags.length > 0) {
      const nextTags = metadata.tags.join(', ');
      setTags((prev) => (options.force || !prev.trim() ? nextTags : prev));
    }

    const matchedCategory = categories.find((c) => c.name === metadata.suggestedCategory);
    const defaultCategoryId = categories[0]?.id ?? '';
    const shouldAutoSetCategory = options.force || !categoryId || categoryId === defaultCategoryId;

    if (matchedCategory && shouldAutoSetCategory) {
      setCategoryId(matchedCategory.id);
    }
  };

  const handleAnalyzeUrl = async () => {
    if (!url) {
      toast.error('URL을 입력해주세요.');
      return;
    }

    if (categories.length === 0) {
      toast.error('카테고리를 불러오는 중입니다. 잠시 후 다시 시도해주세요.');
      return;
    }

    setIsAnalyzing(true);
    try {
      const metadata = await analyzeUrl(url);
      applyMetadataToForm(metadata, { force: true });
      const usageCostText = buildUsageCostMessage(metadata);
      toast.success(
        usageCostText
          ? `${mode === 'edit' ? 'AI 재분석 완료' : '자동 분석 완료'}. ${usageCostText}`
          : (mode === 'edit' ? 'AI 재분석이 완료되었습니다.' : '자동 분석이 완료되었습니다.'),
      );
    } catch (error: unknown) {
      console.error('URL 분석 실패:', error);
      toast.error(`자동 분석 실패: ${getErrorMessage(error)}`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!url) {
      toast.error('URL을 입력해주세요.');
      return;
    }

    if (categories.length === 0) {
      toast.error('카테고리를 불러오는 중입니다. 잠시 후 다시 시도해주세요.');
      return;
    }

    setIsLoading(true);

    try {
      let resolvedTitle = title.trim();
      let resolvedFavicon = favicon.trim();
      let resolvedDescription = description;
      let resolvedCategoryId = categoryId;
      const tagsFromInput = tags.split(',').map((tag) => tag.trim()).filter(Boolean);
      let resolvedTags = tagsFromInput;

      const needsAnalysis = !resolvedTitle || !resolvedDescription.trim() || resolvedTags.length === 0;
      if (needsAnalysis) {
        setIsAnalyzing(true);
        try {
          const metadata = await analyzeUrl(url);

          if (!resolvedTitle && metadata.title) {
            resolvedTitle = metadata.title;
          }
          if (!resolvedFavicon && metadata.favicon) {
            resolvedFavicon = metadata.favicon;
          }
          if (!resolvedDescription.trim() && metadata.description) {
            resolvedDescription = metadata.description;
          }
          if (resolvedTags.length === 0 && metadata.tags && metadata.tags.length > 0) {
            resolvedTags = metadata.tags;
          }

          const matchedCategory = categories.find((c) => c.name === metadata.suggestedCategory);
          const defaultCategoryId = categories[0]?.id ?? '';
          const shouldAutoSetCategory = !resolvedCategoryId || resolvedCategoryId === defaultCategoryId;

          if (matchedCategory && shouldAutoSetCategory) {
            resolvedCategoryId = matchedCategory.id;
          }

          applyMetadataToForm(metadata, { force: false });
        } catch (error: unknown) {
          console.error('URL 자동 분석 실패:', error);
          toast.error(`자동 분석 실패: ${getErrorMessage(error)}`);
        } finally {
          setIsAnalyzing(false);
        }
      }

      if (!resolvedTitle) {
        resolvedTitle = getDefaultTitleFromUrl(url);
        setTitle(resolvedTitle);
      }

      await onSubmit({
        url,
        title: resolvedTitle,
        favicon: resolvedFavicon || undefined,
        description: resolvedDescription,
        categoryId: resolvedCategoryId,
        tags: resolvedTags,
      });

      onClose();
    } catch (error) {
      console.error(mode === 'edit' ? '북마크 수정 실패:' : '북마크 추가 실패:', error);
      toast.error(mode === 'edit' ? '북마크 수정에 실패했습니다.' : '북마크 추가에 실패했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <Overlay onClick={handleClose}>
      <Modal
        role="dialog"
        aria-modal="true"
        aria-labelledby="bookmark-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <Header>
          <Title id="bookmark-modal-title">{mode === 'edit' ? '북마크 수정' : '북마크 추가'}</Title>
          <CloseButton
            type="button"
            onClick={handleClose}
            disabled={isLoading || isAnalyzing}
            aria-label="모달 닫기"
          >
            <i className="fa-solid fa-xmark" aria-hidden="true" />
          </CloseButton>
        </Header>

        <Form onSubmit={handleSubmit}>
          <FormGroup>
            <Label htmlFor="url">URL *</Label>
            <InlineFieldRow>
              <Input
                id="url"
                ref={urlInputRef}
                type="url"
                name="url"
                autoComplete="url"
                inputMode="url"
                spellCheck={false}
                placeholder="https://example.com"
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  setFavicon('');
                }}
                required
                style={{ flex: 1 }}
              />
              <Button
                type="button"
                $variant="secondary"
                onClick={handleAnalyzeUrl}
                disabled={isAnalyzing || !url}
                style={{ padding: '10px 16px', fontSize: '0.9rem', whiteSpace: 'nowrap' }}
              >
                {isAnalyzing ? <LoadingSpinner aria-hidden="true" /> : mode === 'edit' ? 'AI 재분석' : '자동 채우기'}
              </Button>
            </InlineFieldRow>
          </FormGroup>

          <FormGroup>
            <Label htmlFor="title">제목</Label>
            <Input
              id="title"
              type="text"
              name="title"
              autoComplete="off"
              placeholder="북마크 제목"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </FormGroup>

          <FormGroup>
            <Label htmlFor="description">설명</Label>
            <Textarea
              id="description"
              name="description"
              placeholder="간단한 설명을 입력하세요"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </FormGroup>

          <FormGroup>
            <Label htmlFor="category">카테고리</Label>
            <Select
              id="category"
              name="category"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
          </FormGroup>

          <FormGroup>
            <Label htmlFor="tags">태그</Label>
            <Input
              id="tags"
              type="text"
              name="tags"
              autoComplete="off"
              placeholder="태그1, 태그2, 태그3 (콤마로 구분)"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
            />
          </FormGroup>

          <ButtonGroup>
            <Button
              type="button"
              $variant="secondary"
              onClick={handleClose}
              disabled={isLoading || isAnalyzing}
            >
              취소
            </Button>
            <Button
              type="submit"
              $variant="primary"
              disabled={isLoading || isAnalyzing}
            >
              {isLoading ? <LoadingSpinner aria-hidden="true" /> : mode === 'edit' ? '저장' : '추가'}
            </Button>
          </ButtonGroup>
        </Form>
      </Modal>
    </Overlay>
  );
};
