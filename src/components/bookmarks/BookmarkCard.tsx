import React from 'react';
import styled, { css } from 'styled-components';
import { buildFallbackFaviconUrl, INLINE_BOOKMARK_FAVICON } from '@/lib/bookmark-favicon';
import { Bookmark } from '@/types/bookmark-new';

export type ViewMode = 'card' | 'favicon' | 'icon';

const CardBase = css`
  background: var(--bg-card);
  border-radius: 12px;
  box-shadow: 0 10px 26px rgba(0, 0, 0, 0.35);
  border: 1px solid var(--border-subtle);
  transition: border-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease;

  &:hover,
  &:focus-within {
    border-color: var(--border-medium);
    box-shadow: 0 18px 40px rgba(0, 0, 0, 0.55);
    transform: translateY(-2px);
  }
`;

const CardFull = styled.article`
  ${CardBase}
  padding: 16px;
`;

const CardFavicon = styled.article`
  ${CardBase}
  min-width: 0;
  padding: 12px;
  display: flex;
  align-items: center;
  gap: 10px;
`;

const CardIcon = styled.a`
  ${CardBase}
  width: 64px;
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px;
  position: relative;
  z-index: 0;
  text-decoration: none;

  &:hover,
  &:focus-visible {
    z-index: 30;
  }

  &:hover .tooltip,
  &:focus-visible .tooltip {
    opacity: 1;
    visibility: visible;
  }

  &:focus-visible {
    outline: 2px solid rgba(16, 185, 129, 0.45);
    outline-offset: 3px;
  }
`;

const Tooltip = styled.div`
  position: absolute;
  top: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%);
  background: rgba(28, 33, 40, 0.95);
  color: var(--text-bright);
  border: 1px solid var(--border-medium);
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 0.75rem;
  white-space: nowrap;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  opacity: 0;
  visibility: hidden;
  transition: opacity 0.2s ease, visibility 0.2s ease;
  z-index: var(--z-popover);
  pointer-events: none;

  &::after {
    content: '';
    position: absolute;
    bottom: 100%;
    left: 50%;
    transform: translateX(-50%);
    border: 5px solid transparent;
    border-bottom-color: rgba(28, 33, 40, 0.95);
  }
`;

const Header = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 8px;
  min-width: 0;
`;

const Favicon = styled.img<{ $size?: number }>`
  width: ${props => props.$size || 20}px;
  height: ${props => props.$size || 20}px;
  border-radius: 4px;
  flex-shrink: 0;
  background: rgba(255, 255, 255, 0.06);
`;

const FaviconInfo = styled.div`
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 3px;
`;

const TitleLink = styled.a<{ $compact?: boolean }>`
  min-width: 0;
  color: var(--text-main);
  font-size: ${props => props.$compact ? '0.88rem' : '1rem'};
  font-weight: 600;
  line-height: 1.35;
  text-decoration: none;
  display: -webkit-box;
  -webkit-line-clamp: ${props => props.$compact ? 1 : 2};
  -webkit-box-orient: vertical;
  overflow: hidden;

  &:hover {
    color: var(--primary-light);
  }

  &:focus-visible {
    outline: 2px solid rgba(16, 185, 129, 0.45);
    outline-offset: 3px;
    border-radius: 4px;
  }
`;

const Domain = styled.div`
  min-width: 0;
  color: var(--text-muted);
  font-size: 0.78rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const UrlLink = styled.a`
  color: var(--text-muted);
  font-size: 0.85rem;
  text-decoration: none;
  word-break: break-all;
  margin-bottom: 8px;
  display: block;

  &:hover {
    color: var(--primary-light);
  }

  &:focus-visible {
    outline: 2px solid rgba(16, 185, 129, 0.45);
    outline-offset: 3px;
    border-radius: 4px;
  }
`;

const Description = styled.p`
  margin: 0;
  font-size: 0.9rem;
  color: var(--text-muted);
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
`;

const Footer = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 12px;
`;

const Tags = styled.div`
  min-width: 0;
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
`;

const Tag = styled.span`
  max-width: 120px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--border-subtle);
  color: var(--text-muted);
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 0.75rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const Actions = styled.div`
  display: flex;
  gap: 6px;
  flex-shrink: 0;
  opacity: 0;
  transition: opacity 0.2s ease;

  ${CardFull}:hover &,
  ${CardFavicon}:hover &,
  ${CardFull}:focus-within &,
  ${CardFavicon}:focus-within & {
    opacity: 1;
  }

  @media (max-width: 720px) {
    opacity: 1;
  }
`;

const ActionButton = styled.button`
  width: 30px;
  height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid var(--border-subtle);
  color: var(--text-muted);
  cursor: pointer;
  padding: 0;
  border-radius: 8px;
  transition: background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease;

  &:hover {
    background: rgba(255, 255, 255, 0.06);
    border-color: var(--border-medium);
    color: var(--text-main);
  }

  &:focus-visible {
    outline: 2px solid rgba(16, 185, 129, 0.45);
    outline-offset: 2px;
  }
`;

const FavoriteIndicator = styled.div`
  position: absolute;
  top: 4px;
  right: 4px;
  font-size: 8px;
  color: #fcd34d;
`;

interface BookmarkCardProps {
  bookmark: Bookmark;
  viewMode?: ViewMode;
  onEdit: (bookmark: Bookmark) => void;
  onDelete: (id: string) => void;
  onFavorite: (id: string) => void;
  onReanalyze: (bookmark: Bookmark) => void;
}

export const BookmarkCard: React.FC<BookmarkCardProps> = ({
  bookmark,
  viewMode = 'favicon',
  onEdit,
  onDelete,
  onFavorite,
  onReanalyze,
}) => {
  const title = bookmark.title || getDomain(bookmark.url) || bookmark.url;
  const fallbackFaviconSrc = getFaviconUrl(bookmark.url);
  const faviconSrc = bookmark.favicon?.trim() || fallbackFaviconSrc;

  const handleFaviconError = (event: React.SyntheticEvent<HTMLImageElement>) => {
    const target = event.currentTarget;

    if (target.dataset.faviconFallback !== 'service' && target.getAttribute('src') !== fallbackFaviconSrc) {
      target.dataset.faviconFallback = 'service';
      target.src = fallbackFaviconSrc;
      return;
    }

    target.dataset.faviconFallback = 'inline';
    target.src = INLINE_BOOKMARK_FAVICON;
  };

  if (viewMode === 'icon') {
    return (
      <CardIcon
        href={bookmark.url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`북마크 열기: ${title}`}
      >
        <Favicon
          src={faviconSrc}
          alt=""
          aria-hidden="true"
          width={32}
          height={32}
          loading="lazy"
          $size={32}
          onError={handleFaviconError}
        />
        <Tooltip className="tooltip">{title}</Tooltip>
        {bookmark.isFavorite && (
          <FavoriteIndicator aria-hidden="true">
            <i className="fas fa-star" />
          </FavoriteIndicator>
        )}
      </CardIcon>
    );
  }

  if (viewMode === 'favicon') {
    return (
      <CardFavicon>
        <Favicon
          src={faviconSrc}
          alt=""
          aria-hidden="true"
          width={24}
          height={24}
          loading="lazy"
          $size={24}
          onError={handleFaviconError}
        />
        <FaviconInfo>
          <TitleLink href={bookmark.url} target="_blank" rel="noopener noreferrer" $compact>
            {title}
          </TitleLink>
          <Domain>{getDomain(bookmark.url)}</Domain>
        </FaviconInfo>
        {bookmark.isFavorite && (
          <i className="fas fa-star" style={{ color: '#fcd34d', fontSize: '12px' }} aria-hidden="true" />
        )}
        <Actions>
          <BookmarkActions
            bookmark={bookmark}
            onEdit={onEdit}
            onDelete={onDelete}
            onFavorite={onFavorite}
            onReanalyze={onReanalyze}
          />
        </Actions>
      </CardFavicon>
    );
  }

  return (
    <CardFull>
      <Header>
        <Favicon
          src={faviconSrc}
          alt=""
          aria-hidden="true"
          width={20}
          height={20}
          loading="lazy"
          onError={handleFaviconError}
        />
        <TitleLink href={bookmark.url} target="_blank" rel="noopener noreferrer">
          {title}
        </TitleLink>
      </Header>

      <UrlLink href={bookmark.url} target="_blank" rel="noopener noreferrer">
        {bookmark.url}
      </UrlLink>

      {bookmark.description && (
        <Description>{bookmark.description}</Description>
      )}

      <Footer>
        <Tags>
          {(bookmark.tags || []).slice(0, 3).map(tag => (
            <Tag key={tag}>{tag}</Tag>
          ))}
        </Tags>

        <Actions>
          <BookmarkActions
            bookmark={bookmark}
            onEdit={onEdit}
            onDelete={onDelete}
            onFavorite={onFavorite}
            onReanalyze={onReanalyze}
          />
        </Actions>
      </Footer>
    </CardFull>
  );
};

function BookmarkActions({
  bookmark,
  onEdit,
  onDelete,
  onFavorite,
  onReanalyze,
}: BookmarkCardProps) {
  return (
    <>
      <ActionButton
        type="button"
        onClick={() => onFavorite(bookmark.id)}
        aria-label={bookmark.isFavorite ? '즐겨찾기 해제' : '즐겨찾기 추가'}
        title={bookmark.isFavorite ? '즐겨찾기 해제' : '즐겨찾기 추가'}
      >
        <i
          className={`${bookmark.isFavorite ? 'fa-solid' : 'fa-regular'} fa-star`}
          style={{ color: bookmark.isFavorite ? '#fcd34d' : undefined }}
          aria-hidden="true"
        />
      </ActionButton>
      <ActionButton
        type="button"
        onClick={() => onReanalyze(bookmark)}
        aria-label="AI 재분석"
        title="AI 재분석"
      >
        <i className="fa-solid fa-wand-magic-sparkles" aria-hidden="true" />
      </ActionButton>
      <ActionButton
        type="button"
        onClick={() => onEdit(bookmark)}
        aria-label="북마크 편집"
        title="북마크 편집"
      >
        <i className="fa-regular fa-edit" aria-hidden="true" />
      </ActionButton>
      <ActionButton
        type="button"
        onClick={() => onDelete(bookmark.id)}
        aria-label="북마크 삭제"
        title="북마크 삭제"
      >
        <i className="fa-regular fa-trash-can" aria-hidden="true" />
      </ActionButton>
    </>
  );
}

function getFaviconUrl(url: string) {
  return buildFallbackFaviconUrl(url);
}

function getDomain(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}
