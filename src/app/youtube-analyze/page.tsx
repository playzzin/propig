'use client';

import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import {
  MagazineWrapper,
  Container,
  Header,
  Logo,
  NavActions,
  ActionButton,
  CategoryBar,
  CategoryPill,
  CategoryPillDelete,
  AddCategoryPill,
  HeroSection,
  HeroContent,
  HeroLabel,
  HeroTitle,
  HeroDescription,
  HeroVisual,
  HeroImage,
  EmptyArchiveVisual,
  EmptyArchiveIcon,
  EmptyArchiveTitle,
  EmptyArchiveText,
  EmptyArchiveSteps,
  EmptyArchiveStep,
  GridSection,
  SectionHeader,
  SectionTitle,
  Grid,
  Card,
  CardImageWrapper,
  CardImage,
  CardContent,
  CardMeta,
  Tag,
  SmallTag,
  CardTitle,
  CardSummary,
  CardFooter,
  InlineReaderSection,
  ReaderContainer,
  ReaderTopBar,
  ReaderTopTitle,
  ReaderHeader,
  ReaderTitle,
  ReaderContent,
  ReaderActions,
  ReaderMedia,
  ReaderIframe,
  CloseButton,
  InputModal,
  ModalBackdrop,
  ModalContent,
  InputTitle,
  StyledInput,
  InlineActionButton,
  InlineFieldRow,
  InlineGrowInput,
  StyledTextarea,
  StyledSelect,
  FormLabel,
  TagsContainer,
  Spinner,
  AnalysisBlock,
  TakeawayList,
} from './components';
import { useYoutubeAnalyze, SavedYoutubeArchive } from './useYoutubeAnalyze';

const youtubeInputTitleId = 'youtube-archive-input-title';
const categoryModalTitleId = 'youtube-category-modal-title';

export default function YoutubeAnalyzePage() {
  const {
    savedItems,
    categories,
    categoryNames,
    createArchive,
    deleteArchive,
    analyzeVideo,
    reAnalyze,
    addCategory,
    updateCategory,
    deleteCategory,
  } = useYoutubeAnalyze();

  // UI State
  const [isInputOpen, setIsInputOpen] = useState(false);
  const [activeItem, setActiveItem] = useState<SavedYoutubeArchive | null>(null);
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState('');
  const detailSectionRef = useRef<HTMLElement | null>(null);
  const shouldScrollToDetailRef = useRef(false);

  // Form State
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formCategory, setFormCategory] = useState('');
  const [formTags, setFormTags] = useState<string[]>([]);
  const [formKeyTakeaways, setFormKeyTakeaways] = useState<string[]>([]);
  const [formDetailedAnalysis, setFormDetailedAnalysis] = useState('');
  const [formChannelName, setFormChannelName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isReAnalyzing, setIsReAnalyzing] = useState(false);
  const inputModalRef = useRef<HTMLDivElement | null>(null);
  const categoryModalRef = useRef<HTMLDivElement | null>(null);

  const dateFormatter = useMemo(
    () => new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium' }),
    [],
  );

  const formatArchiveDate = useCallback((millis: number) => (
    dateFormatter.format(new Date(millis))
  ), [dateFormatter]);

  useEffect(() => {
    if (!isCategoryModalOpen) {
      setEditingCategoryId(null);
      setEditingCategoryName('');
    }
  }, [isCategoryModalOpen]);

  useEffect(() => {
    if (isInputOpen) {
      inputModalRef.current?.focus();
    }
  }, [isInputOpen]);

  useEffect(() => {
    if (isCategoryModalOpen) {
      categoryModalRef.current?.focus();
    }
  }, [isCategoryModalOpen]);

  const getItemTargetType = useCallback((item: SavedYoutubeArchive): 'video' | 'channel' => {
    if (item.targetType === 'video' || item.targetType === 'channel') {
      return item.targetType;
    }
    return item.youtubeId ? 'video' : 'channel';
  }, []);

  const activeItemType = useMemo(
    () => (activeItem ? getItemTargetType(activeItem) : null),
    [activeItem, getItemTargetType],
  );

  const scrollDetailIntoView = useCallback(() => {
    window.requestAnimationFrame(() => {
      detailSectionRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    });
  }, []);

  const handleOpenDetail = useCallback((item: SavedYoutubeArchive) => {
    shouldScrollToDetailRef.current = true;
    setActiveItem(item);

    if (activeItem?.id === item.id) {
      scrollDetailIntoView();
    }
  }, [activeItem?.id, scrollDetailIntoView]);

  useEffect(() => {
    if (!activeItem || !shouldScrollToDetailRef.current) return;

    shouldScrollToDetailRef.current = false;
    scrollDetailIntoView();
  }, [activeItem, scrollDetailIntoView]);

  // Filtered items
  const filteredItems = useMemo(() => {
    if (!activeFilter) return savedItems;
    return savedItems.filter(item => item.category === activeFilter);
  }, [savedItems, activeFilter]);

  const heroItem = useMemo(() => filteredItems[0] || null, [filteredItems]);
  const gridItems = useMemo(() => filteredItems.slice(1), [filteredItems]);

  // Unique categories present in data
  const usedCategories = useMemo(() => {
    const cats = new Set<string>();
    savedItems.forEach(item => { if (item.category) cats.add(item.category); });
    return Array.from(cats);
  }, [savedItems]);

  // All displayed category pills = user categories + any in-data categories not in user list
  const displayCategories = useMemo(() => {
    const set = new Set(categoryNames);
    usedCategories.forEach(c => set.add(c));
    return Array.from(set);
  }, [categoryNames, usedCategories]);

  const resetForm = useCallback(() => {
    setYoutubeUrl('');
    setFormTitle('');
    setFormDescription('');
    setFormCategory('');
    setFormTags([]);
    setFormKeyTakeaways([]);
    setFormDetailedAnalysis('');
    setFormChannelName('');
  }, []);

  const handleArchiveSubmit = async () => {
    if (!youtubeUrl.trim()) {
      toast.error('URL을 입력해주세요.');
      return;
    }

    setIsSubmitting(true);
    try {
      await createArchive({
        youtube_url: youtubeUrl,
        title: formTitle,
        description: formDescription,
        category: formCategory,
        tags: formTags,
        keyTakeaways: formKeyTakeaways,
        detailedAnalysis: formDetailedAnalysis,
        channelName: formChannelName,
      });
      setIsInputOpen(false);
      resetForm();
    } catch {
      // Error handled in hook
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAutoFill = async () => {
    if (!youtubeUrl.trim()) {
      toast.error('URL을 먼저 입력해주세요.');
      return;
    }

    setIsAnalyzing(true);
    try {
      const analyzed = await analyzeVideo(youtubeUrl);

      if (analyzed.title) setFormTitle(analyzed.title);
      if (analyzed.description) setFormDescription(analyzed.description);
      if (analyzed.category) setFormCategory(analyzed.category);
      if (analyzed.tags) setFormTags(analyzed.tags);
      if (analyzed.keyTakeaways) setFormKeyTakeaways(analyzed.keyTakeaways);
      if (analyzed.detailedAnalysis) setFormDetailedAnalysis(analyzed.detailedAnalysis);
      if (analyzed.channelName) setFormChannelName(analyzed.channelName);

      toast.success(`AI 분석이 완료되었습니다. (${analyzed._meta.source})`);
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : 'AI 분석 중 오류가 발생했습니다.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleReAnalyze = async () => {
    if (!activeItem) return;
    setIsReAnalyzing(true);
    try {
      const data = await reAnalyze(activeItem);
      // Update the active item display with new data
      setActiveItem(prev => prev ? {
        ...prev,
        title: data.title || prev.title,
        description: data.description || prev.description,
        category: data.category || prev.category,
        tags: data.tags || prev.tags,
        keyTakeaways: data.keyTakeaways || prev.keyTakeaways,
        detailedAnalysis: data.detailedAnalysis || prev.detailedAnalysis,
        channelName: data.channelName || prev.channelName,
      } : null);
      toast.success('AI 재분석 완료!');
    } catch {
      // Error handled in hook
    } finally {
      setIsReAnalyzing(false);
    }
  };

  const handleDelete = async () => {
    if (!activeItem) return;
    if (!window.confirm(`'${activeItem.title}'을(를) 삭제하시겠습니까?`)) return;
    await deleteArchive(activeItem.id);
    setActiveItem(null);
  };

  const handleOpenInCurrentWindow = () => {
    if (!activeItem) return;

    const url = activeItem.youtube_url || activeItem.embed.watchOnYoutubeUrl;
    if (!url) return;

    window.location.assign(url);
  };

  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) return;
    await addCategory(newCategoryName);
    setNewCategoryName('');
  };

  const handleCloseCategoryModal = useCallback(() => {
    setIsCategoryModalOpen(false);
    setEditingCategoryId(null);
    setEditingCategoryName('');
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;

      if (isCategoryModalOpen) {
        handleCloseCategoryModal();
        return;
      }

      if (isInputOpen) {
        setIsInputOpen(false);
        resetForm();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleCloseCategoryModal, isCategoryModalOpen, isInputOpen, resetForm]);

  const handleStartCategoryEdit = useCallback((category: { id: string; name: string }) => {
    setEditingCategoryId(category.id);
    setEditingCategoryName(category.name);
  }, []);

  const handleCancelCategoryEdit = useCallback(() => {
    setEditingCategoryId(null);
    setEditingCategoryName('');
  }, []);

  const handleUpdateCategory = async () => {
    if (!editingCategoryId) return;

    const result = await updateCategory(editingCategoryId, editingCategoryName);
    if (!result) return;

    if (activeFilter === result.previousName) {
      setActiveFilter(result.nextName);
    }

    if (formCategory === result.previousName) {
      setFormCategory(result.nextName);
    }

    setActiveItem((prev) => (
      prev && prev.category === result.previousName
        ? { ...prev, category: result.nextName }
        : prev
    ));

    handleCancelCategoryEdit();
  };

  const handleDeleteCategory = async (category: { id: string; name: string }) => {
    if (!window.confirm(`'${category.name}' 카테고리를 삭제하시겠습니까?`)) return;

    const deletedName = await deleteCategory(category.id);
    if (!deletedName) return;

    if (activeFilter === deletedName) {
      setActiveFilter(null);
    }

    if (formCategory === deletedName) {
      setFormCategory('');
    }

    setActiveItem((prev) => (
      prev && prev.category === deletedName
        ? { ...prev, category: '' }
        : prev
    ));

    if (editingCategoryId === category.id) {
      handleCancelCategoryEdit();
    }
  };

  return (
    <MagazineWrapper $lockScroll={isInputOpen || isCategoryModalOpen}>
      <Container>
        <Header>
          <Logo>YouTube Archive.</Logo>
          <NavActions>
            <ActionButton $variant="ghost" onClick={() => setIsCategoryModalOpen(true)}>
              <i className="fa-solid fa-tags" aria-hidden="true" /> 카테고리 관리
            </ActionButton>
            <ActionButton $variant="primary" onClick={() => setIsInputOpen(true)}>
              <i className="fa-solid fa-plus" aria-hidden="true" /> 콘텐츠 저장
            </ActionButton>
          </NavActions>
        </Header>

        {/* Category Filter Bar */}
        <CategoryBar>
          <CategoryPill $active={!activeFilter} aria-pressed={!activeFilter} onClick={() => setActiveFilter(null)}>
            전체
          </CategoryPill>
          {displayCategories.map(cat => (
            categories.find(c => c.name === cat) ? (
              <React.Fragment key={cat}>
                <CategoryPill
                  $active={activeFilter === cat}
                  aria-pressed={activeFilter === cat}
                  onClick={() => setActiveFilter(activeFilter === cat ? null : cat)}
                >
                  {cat}
                </CategoryPill>
                <CategoryPillDelete
                  aria-label={`${cat} 카테고리 삭제`}
                  onClick={(e) => {
                    e.stopPropagation();
                    const catObj = categories.find(c => c.name === cat);
                    if (catObj) {
                      void handleDeleteCategory(catObj);
                    }
                  }}
                >
                  <i className="fa-solid fa-xmark" aria-hidden="true" />
                </CategoryPillDelete>
              </React.Fragment>
            ) : (
              <CategoryPill
                key={cat}
                $active={activeFilter === cat}
                aria-pressed={activeFilter === cat}
                onClick={() => setActiveFilter(activeFilter === cat ? null : cat)}
              >
                {cat}
              </CategoryPill>
            )
          ))}
          <AddCategoryPill onClick={() => setIsCategoryModalOpen(true)}>
            <i className="fa-solid fa-plus" aria-hidden="true" /> 추가
          </AddCategoryPill>
        </CategoryBar>

        {/* Inline Reader View */}
        {activeItem && (
          <InlineReaderSection ref={detailSectionRef} aria-live="polite">
            <ReaderContainer>
              <ReaderTopBar>
                <ReaderTopTitle>
                  <i className="fa-solid fa-up-long" aria-hidden="true" />
                  <span>상단 상세 보기</span>
                </ReaderTopTitle>
                <CloseButton aria-label="상세보기 닫기" onClick={() => setActiveItem(null)}>
                  <i className="fa-solid fa-xmark" aria-hidden="true" />
                </CloseButton>
              </ReaderTopBar>

              {activeItemType === 'video' && activeItem.embed.iframeUrl ? (
                <ReaderMedia>
                  <ReaderIframe
                    key={activeItem.id}
                    title={`${activeItem.title} player`}
                    src={activeItem.embed.iframeUrl}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    referrerPolicy="strict-origin-when-cross-origin"
                    loading="lazy"
                    allowFullScreen
                  />
                </ReaderMedia>
              ) : (
                <ReaderMedia style={{
                  position: 'relative',
                  background: '#0B1120',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  <HeroImage
                    src={activeItem.thumbnail.high || activeItem.thumbnail.default}
                    alt={activeItem.title}
                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.42 }}
                  />
                  <div style={{ position: 'relative', zIndex: 1, textAlign: 'center', color: '#F8FAFC' }}>
                    <div style={{ fontSize: '2rem', marginBottom: 10 }}>
                      <i className="fa-solid fa-users-viewfinder" aria-hidden="true" />
                    </div>
                    <div style={{ fontWeight: 700, letterSpacing: 0 }}>YouTube Channel Archive</div>
                  </div>
                </ReaderMedia>
              )}

              <ReaderHeader>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
                  {activeItem.category && <Tag>{activeItem.category}</Tag>}
                  <SmallTag>{activeItemType === 'channel' ? 'Channel' : 'Video'}</SmallTag>
                  {activeItem.tags && activeItem.tags.map((tag, i) => <SmallTag key={i}>{tag}</SmallTag>)}
                </div>
                <ReaderTitle>{activeItem.title}</ReaderTitle>
                <div style={{ display: 'flex', gap: 16, color: 'var(--text-muted)', fontSize: '0.85rem', flexWrap: 'wrap' }}>
                  {activeItem.channelName && <span><i className={`fa-solid ${activeItemType === 'channel' ? 'fa-users' : 'fa-user'}`} style={{ marginRight: 6 }} aria-hidden="true" />{activeItem.channelName}</span>}
                  <span><i className="fa-solid fa-calendar" style={{ marginRight: 6 }} aria-hidden="true" />{formatArchiveDate(activeItem.createdAt)}</span>
                </div>
              </ReaderHeader>

              <ReaderContent>
                {activeItem.description && (
                  <p style={{ whiteSpace: 'pre-wrap', lineHeight: '1.7', color: '#E2E8F0', fontSize: '1rem' }}>
                    {activeItem.description}
                  </p>
                )}

                {activeItem.keyTakeaways && activeItem.keyTakeaways.length > 0 && (
                  <AnalysisBlock>
                    <h3 style={{ marginTop: 0, fontSize: '1.1rem' }}>
                      <i className="fa-solid fa-lightbulb" style={{ color: '#fbbf24', marginRight: 8 }} aria-hidden="true" />
                      핵심 내용
                    </h3>
                    <TakeawayList>
                      {activeItem.keyTakeaways.map((t, i) => (
                        <li key={i}>{t}</li>
                      ))}
                    </TakeawayList>
                  </AnalysisBlock>
                )}

                {activeItem.detailedAnalysis && (
                  <AnalysisBlock>
                    <h3 style={{ marginTop: 0, fontSize: '1.1rem' }}>
                      <i className="fa-solid fa-magnifying-glass-chart" style={{ color: 'var(--accent)', marginRight: 8 }} aria-hidden="true" />
                      상세 분석
                    </h3>
                    <p style={{ whiteSpace: 'pre-wrap', lineHeight: '1.7', fontSize: '0.95rem', color: '#D4D4D8', margin: 0 }}>
                      {activeItem.detailedAnalysis}
                    </p>
                  </AnalysisBlock>
                )}

                {!activeItem.keyTakeaways?.length && !activeItem.detailedAnalysis && (
                  <AnalysisBlock style={{ textAlign: 'center', padding: '32px 24px' }}>
                    <p style={{ color: 'var(--text-muted)', margin: '0 0 16px' }}>
                      아직 AI 분석이 수행되지 않았습니다.
                    </p>
                    <ActionButton
                      $variant="secondary"
                      onClick={handleReAnalyze}
                      disabled={isReAnalyzing}
                      style={{ margin: '0 auto' }}
                    >
                      {isReAnalyzing ? <><Spinner /> 분석 중…</> : <><i className="fa-solid fa-wand-magic-sparkles" aria-hidden="true" /> AI 분석 실행</>}
                    </ActionButton>
                  </AnalysisBlock>
                )}
              </ReaderContent>

              <ReaderActions>
                <ActionButton
                  $variant="secondary"
                  onClick={handleOpenInCurrentWindow}
                >
                  <i className="fa-brands fa-youtube" aria-hidden="true" /> {activeItemType === 'channel' ? '현재 창에서 채널 열기' : '현재 창에서 YouTube 보기'}
                </ActionButton>
                <ActionButton
                  $variant="secondary"
                  onClick={handleReAnalyze}
                  disabled={isReAnalyzing}
                >
                  {isReAnalyzing ? <><Spinner /> 재분석 중…</> : <><i className="fa-solid fa-wand-magic-sparkles" aria-hidden="true" /> AI 재분석</>}
                </ActionButton>
                <ActionButton $variant="danger" onClick={handleDelete}>
                  <i className="fa-solid fa-trash" aria-hidden="true" /> 삭제
                </ActionButton>
              </ReaderActions>
            </ReaderContainer>
          </InlineReaderSection>
        )}

        {/* Hero Section */}
        {heroItem && (
          <HeroSection>
            <HeroContent>
              <HeroLabel>
                {getItemTargetType(heroItem) === 'channel' ? 'Channel' : 'Video'}
                {heroItem.category ? ` / ${heroItem.category}` : ''}
              </HeroLabel>
              <HeroTitle>{heroItem.title}</HeroTitle>
              <HeroDescription>
                {heroItem.description || '저장된 설명이 없습니다.'}
              </HeroDescription>
              {heroItem.channelName && (
                <HeroDescription style={{ fontSize: '0.9rem', opacity: 0.7 }}>
                  {heroItem.channelName}
                </HeroDescription>
              )}
              <div>
                <ActionButton $variant="secondary" onClick={() => handleOpenDetail(heroItem)}>
                  <i className="fa-solid fa-arrow-right" aria-hidden="true" /> 상세 보기
                </ActionButton>
              </div>
            </HeroContent>
            <HeroVisual>
              <HeroImage src={heroItem.thumbnail.high || heroItem.thumbnail.default} alt={heroItem.title} />
            </HeroVisual>
          </HeroSection>
        )}

        {!heroItem && (
          <HeroSection>
            <HeroContent>
              <HeroLabel>처음 시작</HeroLabel>
              <HeroTitle>유튜브 인사이트를 한곳에 모으세요.</HeroTitle>
              <HeroDescription>
                인상 깊은 유튜브 영상을 나만의 아카이브에 저장하세요.
                AI가 자동으로 분석하고 카테고리를 분류합니다.
              </HeroDescription>
              <div>
                <ActionButton $variant="primary" onClick={() => setIsInputOpen(true)}>
                  첫 콘텐츠 저장하기
                </ActionButton>
              </div>
            </HeroContent>
            <HeroVisual>
              <EmptyArchiveVisual>
                <EmptyArchiveIcon aria-hidden="true">
                  <i className="fa-brands fa-youtube" aria-hidden="true" />
                </EmptyArchiveIcon>
                <div>
                  <EmptyArchiveTitle>아카이브가 비어 있습니다</EmptyArchiveTitle>
                  <EmptyArchiveText>첫 링크를 저장하면 요약, 메모, 카테고리가 이 화면에 정리됩니다.</EmptyArchiveText>
                </div>
                <EmptyArchiveSteps aria-label="콘텐츠 저장 흐름">
                  <EmptyArchiveStep><span>1</span><span>URL 붙여넣기</span></EmptyArchiveStep>
                  <EmptyArchiveStep><span>2</span><span>AI 분석 채우기</span></EmptyArchiveStep>
                  <EmptyArchiveStep><span>3</span><span>필요한 순간 다시 열기</span></EmptyArchiveStep>
                </EmptyArchiveSteps>
              </EmptyArchiveVisual>
            </HeroVisual>
          </HeroSection>
        )}

        {/* Grid Section */}
        {gridItems.length > 0 && (
          <GridSection>
            <SectionHeader>
              <SectionTitle>{activeFilter ? `${activeFilter}` : 'All Content'}</SectionTitle>
              <span style={{ color: '#64748B', fontSize: '0.85rem' }}>{filteredItems.length} items</span>
            </SectionHeader>
            <Grid>
              {gridItems.map(item => (
                <Card
                  key={item.id}
                  $active={activeItem?.id === item.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleOpenDetail(item)}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter' && event.key !== ' ') return;
                    event.preventDefault();
                    handleOpenDetail(item);
                  }}
                >
                  <CardImageWrapper>
                    <CardImage src={item.thumbnail.high} alt={item.title} />
                  </CardImageWrapper>
                  <CardContent>
                    <CardMeta>
                      <Tag>{item.category || (getItemTargetType(item) === 'channel' ? '채널' : '영상')}</Tag>
                      <SmallTag>{getItemTargetType(item) === 'channel' ? 'Channel' : 'Video'}</SmallTag>
                      {item.channelName && <SmallTag>{item.channelName}</SmallTag>}
                    </CardMeta>
                    <CardTitle>{item.title}</CardTitle>
                    <CardSummary>{item.description || 'No description available'}</CardSummary>
                    {item.tags && item.tags.length > 0 && (
                      <TagsContainer style={{ marginTop: 8, marginBottom: 0 }}>
                        {item.tags.slice(0, 3).map((tag, i) => (
                          <SmallTag key={i}>{tag}</SmallTag>
                        ))}
                        {item.tags.length > 3 && <SmallTag>+{item.tags.length - 3}</SmallTag>}
                      </TagsContainer>
                    )}
                    <CardFooter>
                      <span>{formatArchiveDate(item.createdAt)}</span>
                    </CardFooter>
                  </CardContent>
                </Card>
              ))}
            </Grid>
          </GridSection>
        )}
      </Container>

      {/* Input Modal */}
      <InputModal
        $isOpen={isInputOpen}
        role="dialog"
        aria-modal="true"
        aria-hidden={!isInputOpen}
        aria-labelledby={youtubeInputTitleId}
      >
        <ModalBackdrop $isOpen={isInputOpen} onClick={() => setIsInputOpen(false)} />
        <ModalContent $isOpen={isInputOpen} ref={inputModalRef} tabIndex={-1}>
          <InputTitle id={youtubeInputTitleId}>영상/채널 저장</InputTitle>

          <FormLabel htmlFor="youtube-url-input">YouTube URL *</FormLabel>
          <StyledInput
            id="youtube-url-input"
            name="youtubeUrl"
            type="url"
            inputMode="url"
            autoComplete="off"
            placeholder="https://youtube.com/watch?v=… 또는 https://youtube.com/@channel"
            value={youtubeUrl}
            onChange={e => setYoutubeUrl(e.target.value)}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
            <ActionButton
              $variant="secondary"
              onClick={handleAutoFill}
              disabled={isAnalyzing || !youtubeUrl}
              style={{ padding: '8px 14px', fontSize: '0.85rem' }}
            >
              {isAnalyzing ? <><Spinner /> 분석 중…</> : <><i className="fa-solid fa-wand-magic-sparkles" aria-hidden="true" /> AI 자동채우기</>}
            </ActionButton>
          </div>

          <FormLabel htmlFor="youtube-title-input">제목</FormLabel>
          <StyledInput
            id="youtube-title-input"
            name="title"
            autoComplete="off"
            placeholder="영상 제목…"
            value={formTitle}
            onChange={e => setFormTitle(e.target.value)}
          />

          <FormLabel htmlFor="youtube-category-select">카테고리</FormLabel>
          <StyledSelect
            id="youtube-category-select"
            name="category"
            autoComplete="off"
            value={formCategory}
            onChange={e => setFormCategory(e.target.value)}
          >
            <option value="">카테고리 선택…</option>
            {categoryNames.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </StyledSelect>

          <FormLabel htmlFor="youtube-description-input">설명 / 메모</FormLabel>
          <StyledTextarea
            id="youtube-description-input"
            name="description"
            autoComplete="off"
            placeholder="영상에 대한 설명이나 메모…"
            value={formDescription}
            onChange={e => setFormDescription(e.target.value)}
          />

          {formKeyTakeaways.length > 0 && (
            <>
              <FormLabel>핵심 내용 (AI 생성)</FormLabel>
              <div style={{ marginBottom: 12, padding: '12px', background: 'rgba(255,255,255,0.03)', borderRadius: 12, fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                {formKeyTakeaways.map((t, i) => (
                  <div key={i} style={{ marginBottom: 4 }}>- {t}</div>
                ))}
              </div>
            </>
          )}

          {formTags.length > 0 && (
            <>
              <FormLabel>태그 (AI 생성)</FormLabel>
              <TagsContainer>
                {formTags.map((tag, i) => (
                  <SmallTag key={i}>{tag}</SmallTag>
                ))}
              </TagsContainer>
            </>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 20 }}>
            <ActionButton $variant="ghost" onClick={() => { setIsInputOpen(false); resetForm(); }}>취소</ActionButton>
            <ActionButton $variant="primary" onClick={handleArchiveSubmit} disabled={isSubmitting}>
              {isSubmitting ? '저장 중…' : '저장하기'}
            </ActionButton>
          </div>
        </ModalContent>
      </InputModal>

      {/* Category Management Modal */}
      <InputModal
        $isOpen={isCategoryModalOpen}
        role="dialog"
        aria-modal="true"
        aria-hidden={!isCategoryModalOpen}
        aria-labelledby={categoryModalTitleId}
      >
        <ModalBackdrop $isOpen={isCategoryModalOpen} onClick={handleCloseCategoryModal} />
        <ModalContent $isOpen={isCategoryModalOpen} ref={categoryModalRef} tabIndex={-1}>
          <InputTitle id={categoryModalTitleId}>카테고리 관리</InputTitle>
          <InlineFieldRow>
            <FormLabel htmlFor="new-category-input" style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0, 0, 0, 0)', whiteSpace: 'nowrap', border: 0 }}>
              새 카테고리 이름
            </FormLabel>
            <InlineGrowInput
              id="new-category-input"
              name="newCategory"
              autoComplete="off"
              placeholder="새 카테고리 이름…"
              value={newCategoryName}
              onChange={e => setNewCategoryName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAddCategory(); }}
            />
            <InlineActionButton $variant="primary" onClick={handleAddCategory}>
              추가
            </InlineActionButton>
          </InlineFieldRow>

          {categories.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {categories.map(cat => (
                <div key={cat.id} style={{
                  display: 'flex',
                  flexDirection: editingCategoryId === cat.id ? 'column' : 'row',
                  alignItems: editingCategoryId === cat.id ? 'stretch' : 'center',
                  justifyContent: 'space-between',
                  gap: editingCategoryId === cat.id ? 12 : 8,
                  padding: '10px 14px', background: 'rgba(255,255,255,0.03)',
                  borderRadius: 10, border: '1px solid var(--border)',
                }}>
                  {editingCategoryId === cat.id ? (
                    <>
                      <StyledInput
                        id={`category-edit-${cat.id}`}
                        name={`category-${cat.id}`}
                        autoComplete="off"
                        aria-label={`${cat.name} 카테고리 이름`}
                        value={editingCategoryName}
                        onChange={e => setEditingCategoryName(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') void handleUpdateCategory();
                          if (e.key === 'Escape') {
                            e.stopPropagation();
                            handleCancelCategoryEdit();
                          }
                        }}
                        style={{ marginBottom: 0 }}
                      />
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
                        <ActionButton
                          $variant="danger"
                          onClick={() => void handleDeleteCategory(cat)}
                          style={{ height: 32, padding: '0 12px', fontSize: '0.75rem' }}
                        >
                          <i className="fa-solid fa-trash" aria-hidden="true" /> 삭제
                        </ActionButton>
                        <ActionButton
                          $variant="ghost"
                          onClick={handleCancelCategoryEdit}
                          style={{ height: 32, padding: '0 12px', fontSize: '0.75rem' }}
                        >
                          취소
                        </ActionButton>
                        <ActionButton
                          $variant="primary"
                          onClick={() => void handleUpdateCategory()}
                          style={{ height: 32, padding: '0 12px', fontSize: '0.75rem' }}
                        >
                          저장
                        </ActionButton>
                      </div>
                    </>
                  ) : (
                    <>
                      <span style={{ color: '#fff', fontWeight: 600 }}>{cat.name}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <ActionButton
                          $variant="ghost"
                          onClick={() => handleStartCategoryEdit(cat)}
                          aria-label={`${cat.name} 카테고리 수정`}
                          style={{ height: 30, padding: '0 10px', fontSize: '0.75rem' }}
                        >
                          <i className="fa-solid fa-pen" aria-hidden="true" />
                        </ActionButton>
                        <ActionButton
                          $variant="danger"
                          onClick={() => void handleDeleteCategory(cat)}
                          aria-label={`${cat.name} 카테고리 삭제`}
                          style={{ height: 30, padding: '0 10px', fontSize: '0.75rem' }}
                        >
                          <i className="fa-solid fa-trash" aria-hidden="true" />
                        </ActionButton>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', textAlign: 'center', padding: '20px 0' }}>
              커스텀 카테고리가 없습니다. 기본 카테고리가 사용됩니다.
            </p>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 24 }}>
            <ActionButton $variant="ghost" onClick={() => setIsCategoryModalOpen(false)}>닫기</ActionButton>
          </div>
        </ModalContent>
      </InputModal>

    </MagazineWrapper>
  );
}
