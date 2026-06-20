import React, { useState, useEffect, useRef } from 'react';
import styled from 'styled-components';
import { toast } from 'sonner';
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  onSnapshot,
  where,
  getDocs,
  Timestamp,
  writeBatch,
} from 'firebase/firestore';
import { db } from '@/firebase/config';
import { useAuth } from '@/contexts/AuthContext';
import { buildFallbackFaviconUrl } from '@/lib/bookmark-favicon';
import { buildJsonAuthHeaders } from '@/lib/client-auth';
import { Bookmark, Category, MetadataSchema } from '@/types/bookmark-new';
import { BookmarkCard, ViewMode } from './BookmarkCard';
import { CategorySidebar } from './CategorySidebar';
import { AddBookmarkModal } from './AddBookmarkModal';
import { CategoryManagerModal } from './CategoryManagerModal';

const Container = styled.div`
  display: flex;
  height: 100%;
  min-height: 0;
  min-width: 0;
  background: var(--bg-base);

  @media (max-width: 720px) {
    flex-direction: column;
    overflow: hidden;
  }
`;

const MainContent = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
`;

const Header = styled.div`
  background: rgba(10, 12, 16, 0.5);
  backdrop-filter: blur(8px);
  padding: 20px 32px;
  border-bottom: 1px solid var(--border-subtle);
  flex-shrink: 0;

  @media (max-width: 720px) {
    padding: 16px;
  }
`;

const HeaderTop = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  margin-bottom: 12px;

  @media (max-width: 720px) {
    align-items: flex-start;
  }
`;

const Title = styled.h1`
  margin: 0;
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--text-bright);
  min-width: 0;
  line-height: 1.25;

  @media (max-width: 720px) {
    font-size: 1.35rem;
  }
`;

const HeaderActions = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;

  @media (max-width: 720px) {
    gap: 8px;
  }
`;

const ViewModeToggle = styled.div`
  display: flex;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  padding: 4px;
`;

const ViewModeButton = styled.button<{ $active?: boolean }>`
  padding: 6px 10px;
  border: none;
  background: ${props => props.$active ? 'rgba(255, 255, 255, 0.06)' : 'transparent'};
  color: ${props => props.$active ? 'var(--primary-light)' : 'var(--text-muted)'};
  border-radius: 6px;
  cursor: pointer;
  transition: background-color 0.2s ease, color 0.2s ease, box-shadow 0.2s ease;
  box-shadow: ${props => props.$active ? '0 10px 22px rgba(0,0,0,0.35)' : 'none'};

  &:hover {
    color: var(--text-main);
  }

  &:focus-visible {
    outline: 2px solid rgba(16, 185, 129, 0.45);
    outline-offset: 2px;
  }
`;

const AddButton = styled.button`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  background: linear-gradient(135deg, var(--primary), var(--primary-dark));
  color: var(--text-bright);
  border: 1px solid rgba(16, 185, 129, 0.25);
  border-radius: 8px;
  font-weight: 500;
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease, background-color 0.2s ease;

  &:hover {
    transform: translateY(-1px);
    box-shadow: 0 12px 26px var(--primary-glow);
  }

  &:focus-visible {
    outline: 2px solid rgba(16, 185, 129, 0.45);
    outline-offset: 2px;
  }

  @media (max-width: 720px) {
    width: 42px;
    height: 40px;
    padding: 0;
    justify-content: center;

    span {
      display: none;
    }
  }
`;

const QuickAddContainer = styled.div`
  display: flex;
  gap: 8px;
  margin-bottom: 12px;

  @media (max-width: 720px) {
    flex-direction: column;
  }
`;

const QuickAddInput = styled.input`
  flex: 1;
  min-width: 0;
  padding: 12px 16px;
  border: 1px solid var(--border-subtle);
  border-radius: 10px;
  font-size: 0.95rem;
  outline: none;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
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

const QuickAddStatus = styled.div<{ $type?: 'loading' | 'success' | 'error' }>`
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 0.85rem;
  background: ${props => {
    if (props.$type === 'loading') return 'rgba(99, 102, 241, 0.12)';
    if (props.$type === 'success') return 'rgba(16, 185, 129, 0.12)';
    if (props.$type === 'error') return 'rgba(239, 68, 68, 0.12)';
    return 'transparent';
  }};
  color: ${props => {
    if (props.$type === 'loading') return '#a5b4fc';
    if (props.$type === 'success') return 'var(--primary-light)';
    if (props.$type === 'error') return '#fca5a5';
    return 'var(--text-muted)';
  }};
`;

const LoadingSpinner = styled.div`
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid currentColor;
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 1s linear infinite;

  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;

const SearchBar = styled.div`
  position: relative;
  max-width: 400px;

  @media (max-width: 720px) {
    max-width: none;
  }
`;

const SearchInput = styled.input`
  width: 100%;
  padding: 10px 16px 10px 40px;
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  font-size: 0.95rem;
  outline: none;
  min-width: 0;
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

const SearchIcon = styled.i`
  position: absolute;
  left: 14px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-muted);
`;

const Content = styled.div`
  flex: 1;
  min-height: 0;
  padding: 24px;
  overflow-y: auto;

  @media (max-width: 720px) {
    padding: 16px;
  }
`;

const BookmarkGrid = styled.div<{ $viewMode: ViewMode }>`
  display: grid;
  grid-template-columns: ${props => {
    if (props.$viewMode === 'icon') return 'repeat(auto-fill, 64px)';
    if (props.$viewMode === 'favicon') return 'repeat(auto-fill, minmax(200px, 1fr))';
    return 'repeat(auto-fill, minmax(320px, 1fr))';
  }};
  gap: ${props => props.$viewMode === 'icon' ? '12px' : '20px'};
  justify-content: ${props => props.$viewMode === 'icon' ? 'center' : 'flex-start'};

  @media (max-width: 720px) {
    grid-template-columns: ${props => props.$viewMode === 'icon' ? 'repeat(auto-fill, 64px)' : '1fr'};
    justify-content: flex-start;
    gap: ${props => props.$viewMode === 'icon' ? '12px' : '12px'};
  }
`;

const EmptyState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 320px;
  text-align: center;
  color: var(--text-muted);
`;

const EmptyIcon = styled.i`
  font-size: 4rem;
  margin-bottom: 16px;
  opacity: 0.3;
`;

const EmptyTitle = styled.p`
  margin: 0;
  color: var(--text-main);
  font-weight: 600;
`;

const EmptyDescription = styled.p`
  margin: 8px 0 0;
  font-size: 0.9rem;
  line-height: 1.5;
`;

function buildUsageCostMessage(metadata: { aiUsage?: { totalTokens: number }; aiCost?: { totalCostUsd: number; estimatedKrw?: number } }): string {
  const totalTokens = metadata.aiUsage?.totalTokens ?? 0;
  const totalCostUsd = metadata.aiCost?.totalCostUsd ?? 0;
  const estimatedKrw = metadata.aiCost?.estimatedKrw;

  if (totalTokens <= 0) return '';

  const usdText = totalCostUsd > 0 ? `$${totalCostUsd.toFixed(6)}` : '$0.000000';
  const krwText = typeof estimatedKrw === 'number' ? ` (약 ${Math.round(estimatedKrw).toLocaleString('ko-KR')}원)` : '';
  return `토큰 ${totalTokens.toLocaleString('ko-KR')} / 예상비용 ${usdText}${krwText}`;
}

export const BookmarkApp: React.FC = () => {
  const { currentUser } = useAuth();
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBookmark, setEditingBookmark] = useState<Bookmark | null>(null);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);

  // 새로운 상태들
  const [viewMode, setViewMode] = useState<ViewMode>('favicon');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [quickAddUrl, setQuickAddUrl] = useState('');
  const [quickAddStatus, setQuickAddStatus] = useState<{ type: 'loading' | 'success' | 'error' | null; message: string }>({ type: null, message: '' });

  const quickAddInputRef = useRef<HTMLInputElement>(null);

  const normalizeCategoryName = (value: string) => value.trim().toLocaleLowerCase('ko-KR');

  const validateCategoryName = (name: string, excludeCategoryId?: string) => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      throw new Error('카테고리 이름을 입력해주세요.');
    }

    const duplicated = categories.some((category) => {
      if (category.id === excludeCategoryId) return false;
      return normalizeCategoryName(category.name) === normalizeCategoryName(trimmedName);
    });

    if (duplicated) {
      throw new Error('이미 같은 이름의 카테고리가 있습니다.');
    }

    return trimmedName;
  };

  // 기본 카테고리 생성
  useEffect(() => {
    if (!currentUser) {
      return;
    }

    const defaultCategories: Pick<Category, 'name' | 'icon' | 'color' | 'order'>[] = [
      { name: '업무', icon: 'fa-briefcase', color: '#3B82F6', order: 0 },
      { name: '학습', icon: 'fa-graduation-cap', color: '#8B5CF6', order: 1 },
      { name: '개인', icon: 'fa-user', color: '#10B981', order: 2 },
      { name: '참고', icon: 'fa-bookmark', color: '#F59E0B', order: 3 },
    ];

    defaultCategories.forEach(async (cat) => {
      const q = query(
        collection(db, 'categories'),
        where('userId', '==', currentUser.uid),
        where('name', '==', cat.name),
      );
      const snapshot = await getDocs(q);
      if (snapshot.empty) {
        await addDoc(collection(db, 'categories'), {
          ...cat,
          userId: currentUser.uid,
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        });
      }
    });
  }, [currentUser]);

  // 북마크 실시간 로드
  useEffect(() => {
    if (!currentUser) {
      setBookmarks([]);
      return;
    }

    const q = query(
      collection(db, 'bookmarks'),
      where('userId', '==', currentUser.uid),
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const bookmarksData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt,
        updatedAt: doc.data().updatedAt,
      })) as Bookmark[];

      setBookmarks(
        bookmarksData.sort((a, b) => {
          const aTime = a.createdAt?.toMillis?.() ?? 0;
          const bTime = b.createdAt?.toMillis?.() ?? 0;
          return bTime - aTime;
        }),
      );
    });

    return unsubscribe;
  }, [currentUser]);

  // 카테고리 실시간 로드
  useEffect(() => {
    if (!currentUser) {
      setCategories([]);
      return;
    }

    const q = query(
      collection(db, 'categories'),
      where('userId', '==', currentUser.uid),
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const categoriesData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt,
        updatedAt: doc.data().updatedAt,
      })) as Category[];

      setCategories(categoriesData.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));
    });

    return unsubscribe;
  }, [currentUser]);

  // 파비콘 URL 생성
  const getFaviconUrl = (url: string) => {
    return buildFallbackFaviconUrl(url);
  };

  const getDefaultTitleFromUrl = (url: string) => {
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  };

  const analyzeBookmarkMetadata = async (targetUrl: string) => {
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
      console.error('Metadata parsing failed:', parsed.error);
      throw new Error('데이터 분석에 실패했습니다.');
    }

    return parsed.data;
  };

  // 빠른 URL 저장 (Gemini 자동 분석)
  const handleQuickAdd = async () => {
    if (!quickAddUrl.trim()) return;

    if (!currentUser) {
      setQuickAddStatus({ type: 'error', message: '로그인이 필요합니다.' });
      setTimeout(() => setQuickAddStatus({ type: null, message: '' }), 3000);
      return;
    }

    if (categories.length === 0) {
      setQuickAddStatus({ type: 'error', message: '카테고리를 불러오는 중입니다. 잠시 후 다시 시도해주세요.' });
      setTimeout(() => setQuickAddStatus({ type: null, message: '' }), 3000);
      return;
    }

    // URL 유효성 검사
    if (!quickAddUrl.match(/^https?:\/\/.+/)) {
      setQuickAddStatus({ type: 'error', message: '올바른 URL을 입력해주세요' });
      setTimeout(() => setQuickAddStatus({ type: null, message: '' }), 3000);
      return;
    }

    setQuickAddStatus({ type: 'loading', message: 'Gemini가 내용을 분석하고 있습니다...' });

    try {
      const metadata = await analyzeBookmarkMetadata(quickAddUrl);

      if (process.env.NODE_ENV !== 'production') {
        console.log('[QuickAdd] extractBookmarkMetadata response:', metadata);
      }

      // 카테고리 매칭
      const matchedCategory = categories.find(c => c.name === metadata.suggestedCategory);
      const categoryId = matchedCategory?.id || categories[0]?.id;

      if (!categoryId) {
        throw new Error('카테고리 정보가 올바르지 않습니다.');
      }

      // 북마크 저장
      const newBookmark = {
        userId: currentUser.uid,
        url: quickAddUrl,
        title: metadata.title || getDefaultTitleFromUrl(quickAddUrl),
        favicon: metadata.favicon || getFaviconUrl(quickAddUrl),
        description: metadata.description || '',
        categoryId,
        tags: metadata.tags || [],
        isFavorite: false,
        order: 0,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      };

      await addDoc(collection(db, 'bookmarks'), newBookmark);

      const usageCostText = buildUsageCostMessage(metadata);
      setQuickAddStatus({
        type: 'success',
        message: usageCostText
          ? `"${metadata.title || '북마크'}" 저장 완료! ${usageCostText}`
          : `"${metadata.title || '북마크'}" 저장 완료!`,
      });
      setQuickAddUrl('');
      toast.success(usageCostText ? `북마크 저장 완료. ${usageCostText}` : '북마크를 저장했습니다.');

      setTimeout(() => setQuickAddStatus({ type: null, message: '' }), 3000);
    } catch (error) {
      console.error('빠른 저장 실패:', error);
      setQuickAddStatus({ type: 'error', message: '저장 실패. 다시 시도해주세요.' });
      toast.error('저장 실패. 다시 시도해주세요.');
      setTimeout(() => setQuickAddStatus({ type: null, message: '' }), 3000);
    }
  };

  // Enter 키로 빠른 저장
  const handleQuickAddKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleQuickAdd();
    }
  };

  const handleAddBookmark = async (data: {
    url: string;
    title: string;
    favicon?: string;
    description: string;
    categoryId: string;
    tags: string[];
  }) => {
    if (!currentUser) {
      throw new Error('로그인이 필요합니다.');
    }

    try {
      const newBookmark = {
        userId: currentUser.uid,
        url: data.url,
        title: data.title,
        favicon: data.favicon || getFaviconUrl(data.url),
        description: data.description,
        categoryId: data.categoryId,
        tags: data.tags,
        isFavorite: false,
        order: 0,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      };

      await addDoc(collection(db, 'bookmarks'), newBookmark);
    } catch (error) {
      console.error('북마크 생성 실패:', error);
      throw error;
    }
  };

  const handleUpdateBookmark = async (data: {
    url: string;
    title: string;
    favicon?: string;
    description: string;
    categoryId: string;
    tags: string[];
  }) => {
    if (!editingBookmark) return;

    try {
      await updateDoc(doc(db, 'bookmarks', editingBookmark.id), {
        url: data.url,
        title: data.title,
        favicon: data.favicon || getFaviconUrl(data.url),
        description: data.description,
        categoryId: data.categoryId,
        tags: data.tags,
        updatedAt: Timestamp.now(),
      });
      toast.success('북마크가 수정되었습니다.');
      setEditingBookmark(null);
    } catch (error) {
      console.error('북마크 수정 실패:', error);
      throw error;
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('정말 삭제하시겠습니까?')) {
      await deleteDoc(doc(db, 'bookmarks', id));
    }
  };

  const handleFavorite = async (id: string) => {
    const bookmark = bookmarks.find(b => b.id === id);
    if (bookmark) {
      await updateDoc(doc(db, 'bookmarks', id), {
        isFavorite: !bookmark.isFavorite,
        updatedAt: Timestamp.now(),
      });
    }
  };

  const handleEdit = (bookmark: Bookmark) => {
    setEditingBookmark(bookmark);
    setIsModalOpen(true);
  };

  const handleReanalyze = async (bookmark: Bookmark) => {
    if (categories.length === 0) {
      toast.error('카테고리를 불러오는 중입니다. 잠시 후 다시 시도해주세요.');
      return;
    }

    try {
      const metadata = await analyzeBookmarkMetadata(bookmark.url);
      const matchedCategory = categories.find((c) => c.name === metadata.suggestedCategory);

      await updateDoc(doc(db, 'bookmarks', bookmark.id), {
        title: metadata.title || bookmark.title,
        description: metadata.description || bookmark.description || '',
        favicon: metadata.favicon || bookmark.favicon || getFaviconUrl(bookmark.url),
        categoryId: matchedCategory?.id || bookmark.categoryId,
        tags: metadata.tags && metadata.tags.length > 0 ? metadata.tags : bookmark.tags,
        updatedAt: Timestamp.now(),
      });

      const usageCostText = buildUsageCostMessage(metadata);
      toast.success(usageCostText ? `AI 재분석 완료. ${usageCostText}` : 'AI 재분석이 완료되었습니다.');
    } catch (error) {
      console.error('AI 재분석 실패:', error);
      toast.error('AI 재분석에 실패했습니다. 잠시 후 다시 시도해주세요.');
    }
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    setEditingBookmark(null);
  };

  const openCategoryManager = (category: Category | null = null) => {
    setEditingCategory(category);
    setIsCategoryModalOpen(true);
  };

  const handleCategoryModalClose = () => {
    setIsCategoryModalOpen(false);
    setEditingCategory(null);
  };

  const handleCreateCategory = async (data: { name: string; icon: string; color: string }) => {
    if (!currentUser) {
      throw new Error('로그인이 필요합니다.');
    }

    const name = validateCategoryName(data.name);
    const nextOrder = categories.reduce((maxOrder, category) => Math.max(maxOrder, category.order ?? 0), -1) + 1;

    const categoryRef = await addDoc(collection(db, 'categories'), {
      userId: currentUser.uid,
      name,
      icon: data.icon,
      color: data.color,
      order: nextOrder,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });

    setSelectedCategory(categoryRef.id);
    toast.success(`'${name}' 카테고리를 추가했습니다.`);
  };

  const handleUpdateCategory = async (
    categoryId: string,
    data: { name: string; icon: string; color: string },
  ) => {
    const name = validateCategoryName(data.name, categoryId);

    await updateDoc(doc(db, 'categories', categoryId), {
      name,
      icon: data.icon,
      color: data.color,
      updatedAt: Timestamp.now(),
    });

    toast.success(`'${name}' 카테고리를 수정했습니다.`);
  };

  const handleDeleteCategory = async (category: Category) => {
    if (!currentUser) {
      throw new Error('로그인이 필요합니다.');
    }

    const bookmarkCount = bookmarksCount[category.id] || 0;
    const fallbackCategory = categories.find((item) => item.id !== category.id) ?? null;

    if (bookmarkCount > 0 && !fallbackCategory) {
      throw new Error('북마크가 남아 있는 마지막 카테고리는 삭제할 수 없습니다.');
    }

    const shouldDelete = window.confirm(
      bookmarkCount > 0 && fallbackCategory
        ? `'${category.name}' 카테고리를 삭제하면 ${bookmarkCount}개의 북마크가 '${fallbackCategory.name}' 카테고리로 이동합니다. 계속하시겠습니까?`
        : `'${category.name}' 카테고리를 삭제하시겠습니까?`,
    );

    if (!shouldDelete) return;

    if (bookmarkCount > 0 && fallbackCategory) {
      const bookmarksSnapshot = await getDocs(
        query(
          collection(db, 'bookmarks'),
          where('userId', '==', currentUser.uid),
          where('categoryId', '==', category.id),
        ),
      );

      for (let index = 0; index < bookmarksSnapshot.docs.length; index += 400) {
        const batch = writeBatch(db);
        const now = Timestamp.now();

        bookmarksSnapshot.docs.slice(index, index + 400).forEach((bookmarkDoc) => {
          batch.update(bookmarkDoc.ref, {
            categoryId: fallbackCategory.id,
            updatedAt: now,
          });
        });

        await batch.commit();
      }
    }

    await deleteDoc(doc(db, 'categories', category.id));

    if (selectedCategory === category.id) {
      setSelectedCategory(fallbackCategory?.id ?? 'all');
    }

    if (editingCategory?.id === category.id) {
      setEditingCategory(null);
    }

    toast.success(
      bookmarkCount > 0 && fallbackCategory
        ? `카테고리를 삭제하고 ${bookmarkCount}개의 북마크를 '${fallbackCategory.name}'로 이동했습니다.`
        : '카테고리를 삭제했습니다.',
    );
  };

  const normalizedSearchTerm = searchTerm.trim().toLowerCase();

  // 필터링된 북마크
  const filteredBookmarks = bookmarks.filter(bookmark => {
    if (selectedCategory === 'favorite') {
      if (!bookmark.isFavorite) return false;
    } else if (selectedCategory !== 'all') {
      if (bookmark.categoryId !== selectedCategory) return false;
    }

    if (normalizedSearchTerm) {
      return (
        (bookmark.title || '').toLowerCase().includes(normalizedSearchTerm) ||
        bookmark.description?.toLowerCase().includes(normalizedSearchTerm) ||
        bookmark.url.toLowerCase().includes(normalizedSearchTerm) ||
        (bookmark.tags || []).some(tag => tag.toLowerCase().includes(normalizedSearchTerm))
      );
    }

    return true;
  });

  // 카테고리별 북마크 수
  const bookmarksCount = categories.reduce((acc, cat) => {
    acc[cat.id] = bookmarks.filter(b => b.categoryId === cat.id).length;
    return acc;
  }, {} as Record<string, number>);
  const favoriteCount = bookmarks.filter(bookmark => bookmark.isFavorite).length;
  const emptyStateTitle = bookmarks.length === 0 ? '아직 북마크가 없습니다' : '조건에 맞는 북마크가 없습니다';
  const emptyStateDescription = bookmarks.length === 0
    ? 'URL을 붙여넣거나 북마크 추가 버튼을 클릭하세요.'
    : '검색어를 지우거나 다른 카테고리를 선택하세요.';

  return (
    <Container>
      <CategorySidebar
        categories={categories}
        activeCategoryId={selectedCategory}
        bookmarksCount={bookmarksCount}
        favoriteCount={favoriteCount}
        isCollapsed={isSidebarCollapsed}
        onCategorySelect={setSelectedCategory}
        onAddCategory={() => openCategoryManager()}
        onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
      />

      <MainContent>
        <Header>
          <HeaderTop>
            <Title>스마트 북마크</Title>
            <HeaderActions>
              <ViewModeToggle role="group" aria-label="북마크 보기 방식">
                <ViewModeButton
                  type="button"
                  $active={viewMode === 'icon'}
                  aria-label="아이콘 보기"
                  aria-pressed={viewMode === 'icon'}
                  onClick={() => setViewMode('icon')}
                  title="아이콘만"
                >
                  <i className="fa-solid fa-grip" aria-hidden="true"></i>
                </ViewModeButton>
                <ViewModeButton
                  type="button"
                  $active={viewMode === 'favicon'}
                  aria-label="목록 보기"
                  aria-pressed={viewMode === 'favicon'}
                  onClick={() => setViewMode('favicon')}
                  title="파비콘 모드"
                >
                  <i className="fa-solid fa-list" aria-hidden="true"></i>
                </ViewModeButton>
                <ViewModeButton
                  type="button"
                  $active={viewMode === 'card'}
                  aria-label="카드 보기"
                  aria-pressed={viewMode === 'card'}
                  onClick={() => setViewMode('card')}
                  title="카드 모드"
                >
                  <i className="fa-solid fa-th-large" aria-hidden="true"></i>
                </ViewModeButton>
              </ViewModeToggle>
              <AddButton
                type="button"
                aria-label="북마크 추가"
                onClick={() => { setEditingBookmark(null); setIsModalOpen(true); }}
              >
                <i className="fa-solid fa-plus" aria-hidden="true"></i>
                <span>북마크 추가</span>
              </AddButton>
            </HeaderActions>
          </HeaderTop>

          {/* 빠른 URL 저장 */}
          <QuickAddContainer>
            <QuickAddInput
              ref={quickAddInputRef}
              type="url"
              name="quickAddUrl"
              aria-label="URL 빠른 추가"
              autoComplete="url"
              inputMode="url"
              spellCheck={false}
              placeholder="🔗 URL을 붙여넣고 Enter를 누르면 Gemini가 자동 분석해서 저장합니다…"
              value={quickAddUrl}
              onChange={(e) => setQuickAddUrl(e.target.value)}
              onKeyDown={handleQuickAddKeyDown}
              disabled={quickAddStatus.type === 'loading'}
            />
            {quickAddStatus.type && (
              <QuickAddStatus $type={quickAddStatus.type} role="status" aria-live="polite">
                {quickAddStatus.type === 'loading' && <LoadingSpinner aria-hidden="true" />}
                {quickAddStatus.type === 'success' && <i className="fa-solid fa-check" aria-hidden="true"></i>}
                {quickAddStatus.type === 'error' && <i className="fa-solid fa-exclamation-circle" aria-hidden="true"></i>}
                {quickAddStatus.message}
              </QuickAddStatus>
            )}
          </QuickAddContainer>

          <SearchBar>
            <SearchIcon className="fa-solid fa-search" aria-hidden="true"></SearchIcon>
            <SearchInput
              type="text"
              name="bookmarkSearch"
              aria-label="북마크 검색"
              autoComplete="off"
              placeholder="북마크 검색…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </SearchBar>
        </Header>

        <Content>
          {filteredBookmarks.length > 0 ? (
            <BookmarkGrid $viewMode={viewMode}>
              {filteredBookmarks.map(bookmark => (
                <BookmarkCard
                  key={bookmark.id}
                  bookmark={bookmark}
                  viewMode={viewMode}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  onFavorite={handleFavorite}
                  onReanalyze={handleReanalyze}
                />
              ))}
            </BookmarkGrid>
          ) : (
            <EmptyState>
              <EmptyIcon className="fa-solid fa-bookmark" aria-hidden="true"></EmptyIcon>
              <EmptyTitle>{emptyStateTitle}</EmptyTitle>
              <EmptyDescription>{emptyStateDescription}</EmptyDescription>
            </EmptyState>
          )}
        </Content>
      </MainContent>

      <AddBookmarkModal
        isOpen={isModalOpen}
        onClose={handleModalClose}
        categories={categories}
        mode={editingBookmark ? 'edit' : 'create'}
        initialData={
          editingBookmark
            ? {
              url: editingBookmark.url,
              title: editingBookmark.title,
              favicon: editingBookmark.favicon || '',
              description: editingBookmark.description || '',
              categoryId: editingBookmark.categoryId,
              tags: editingBookmark.tags || [],
            }
            : null
        }
        onSubmit={editingBookmark ? handleUpdateBookmark : handleAddBookmark}
      />

      <CategoryManagerModal
        isOpen={isCategoryModalOpen}
        onClose={handleCategoryModalClose}
        categories={categories}
        bookmarksCount={bookmarksCount}
        initialCategory={editingCategory}
        onCreate={handleCreateCategory}
        onUpdate={handleUpdateCategory}
        onDelete={handleDeleteCategory}
      />
    </Container>
  );
};
