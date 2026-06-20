import React from 'react';
import styled from 'styled-components';
import { Category } from '@/types/bookmark-new';

const getIconBgColor = (color?: string): string => {
  if (!color) return 'rgba(255, 255, 255, 0.06)';
  if (color.startsWith('#')) return `${color}20`;
  return 'rgba(255, 255, 255, 0.06)';
};

const Sidebar = styled.div<{ $collapsed?: boolean }>`
  width: ${props => props.$collapsed ? '60px' : '280px'};
  background: var(--bg-sidebar);
  border-right: 1px solid var(--border-subtle);
  padding: ${props => props.$collapsed ? '12px 0' : '20px 0'};
  overflow-y: auto;
  overflow-x: hidden;
  transition: width 0.3s ease;
  flex-shrink: 0;

  @media (max-width: 720px) {
    width: 100%;
    padding: 12px 0;
    border-right: none;
    border-bottom: 1px solid var(--border-subtle);
    overflow: hidden;
  }
`;

const Header = styled.div<{ $collapsed?: boolean }>`
  padding: ${props => props.$collapsed ? '0 12px 12px' : '0 20px 20px'};
  border-bottom: 1px solid var(--border-subtle);
  margin-bottom: 20px;
  display: flex;
  align-items: center;
  justify-content: ${props => props.$collapsed ? 'center' : 'space-between'};

  @media (max-width: 720px) {
    padding: 0 16px 10px;
    margin-bottom: 10px;
    justify-content: space-between;
  }
`;

const Title = styled.h2<{ $collapsed?: boolean }>`
  margin: 0;
  font-size: 1.2rem;
  font-weight: 700;
  color: var(--text-bright);
  display: ${props => props.$collapsed ? 'none' : 'block'};

  @media (max-width: 720px) {
    display: block;
    font-size: 1.05rem;
  }
`;

const CollapseButton = styled.button`
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  padding: 6px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background-color 0.2s ease, color 0.2s ease;

  &:hover {
    background: rgba(255, 255, 255, 0.06);
    color: var(--text-bright);
  }

  &:focus-visible {
    outline: 2px solid rgba(16, 185, 129, 0.45);
    outline-offset: 2px;
  }

  @media (max-width: 720px) {
    display: none;
  }
`;

const CategoryList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;

  @media (max-width: 720px) {
    flex-direction: row;
    gap: 8px;
    padding: 0 16px;
    overflow-x: auto;
    overflow-y: hidden;
    scroll-snap-type: x proximity;
  }
`;

const CategoryItem = styled.button<{ $active?: boolean; $collapsed?: boolean }>`
  width: 100%;
  border: 0;
  font: inherit;
  color: inherit;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: ${props => props.$collapsed ? '10px 14px' : '10px 20px'};
  cursor: pointer;
  transition: background-color 0.2s ease;
  background-color: ${props => props.$active ? 'rgba(16, 185, 129, 0.12)' : 'transparent'};
  justify-content: ${props => props.$collapsed ? 'center' : 'flex-start'};
  position: relative;
  text-align: left;

  &:hover {
    background-color: rgba(255, 255, 255, 0.04);
  }

  &:hover .item-tooltip {
    opacity: 1;
    visibility: visible;
  }

  &:focus-visible {
    outline: 2px solid rgba(16, 185, 129, 0.45);
    outline-offset: -2px;
  }

  @media (max-width: 720px) {
    width: auto;
    min-width: 112px;
    flex: 0 0 auto;
    padding: 10px 12px;
    border: 1px solid ${props => props.$active ? 'rgba(16, 185, 129, 0.28)' : 'var(--border-subtle)'};
    border-radius: 12px;
    background-color: ${props => props.$active ? 'rgba(16, 185, 129, 0.14)' : 'rgba(255, 255, 255, 0.02)'};
    justify-content: flex-start;
    scroll-snap-align: start;
  }
`;

const ItemTooltip = styled.div`
  position: absolute;
  left: calc(100% + 8px);
  top: 50%;
  transform: translateY(-50%);
  background: rgba(28, 33, 40, 0.95);
  color: var(--text-bright);
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 0.8rem;
  white-space: nowrap;
  opacity: 0;
  visibility: hidden;
  transition: all 0.2s ease;
  z-index: 100;
  pointer-events: none;

  &::before {
    content: '';
    position: absolute;
    right: 100%;
    top: 50%;
    transform: translateY(-50%);
    border: 5px solid transparent;
    border-right-color: rgba(28, 33, 40, 0.95);
  }
`;

const CategoryIcon = styled.div<{ color?: string }>`
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: ${props => getIconBgColor(props.color)};
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${props => props.color || 'var(--primary-light)'};
  font-size: 0.9rem;
  flex-shrink: 0;
`;

const CategoryInfo = styled.div<{ $collapsed?: boolean }>`
  flex: 1;
  display: ${props => props.$collapsed ? 'none' : 'block'};
  min-width: 0;

  @media (max-width: 720px) {
    display: block;
  }
`;

const CategoryName = styled.div`
  font-weight: 500;
  color: var(--text-main);
  font-size: 0.95rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const CategoryCount = styled.div`
  font-size: 0.8rem;
  color: var(--text-muted);
  margin-top: 2px;
`;

const AddButton = styled.button<{ $collapsed?: boolean }>`
  width: ${props => props.$collapsed ? 'calc(100% - 16px)' : 'calc(100% - 40px)'};
  margin: ${props => props.$collapsed ? '20px 8px' : '20px'};
  padding: ${props => props.$collapsed ? '10px' : '10px'};
  border: 2px dashed rgba(255, 255, 255, 0.18);
  background: transparent;
  border-radius: 8px;
  color: var(--text-muted);
  cursor: pointer;
  transition: border-color 0.2s ease, background-color 0.2s ease, color 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: ${props => props.$collapsed ? '0' : '8px'};
  
  &:hover {
    border-color: rgba(16, 185, 129, 0.6);
    color: var(--primary-light);
    background: rgba(16, 185, 129, 0.12);
  }

  &:focus-visible {
    outline: 2px solid rgba(16, 185, 129, 0.45);
    outline-offset: 2px;
  }

  span {
    display: ${props => props.$collapsed ? 'none' : 'inline'};
  }

  @media (max-width: 720px) {
    width: calc(100% - 32px);
    margin: 10px 16px 0;
    gap: 8px;

    span {
      display: inline;
    }
  }
`;

interface CategorySidebarProps {
  categories: Category[];
  activeCategoryId?: string;
  bookmarksCount: Record<string, number>;
  favoriteCount: number;
  isCollapsed?: boolean;
  onCategorySelect: (categoryId: string) => void;
  onAddCategory: () => void;
  onToggleCollapse?: () => void;
}

export const CategorySidebar: React.FC<CategorySidebarProps> = ({
  categories,
  activeCategoryId,
  bookmarksCount,
  favoriteCount,
  isCollapsed = false,
  onCategorySelect,
  onAddCategory,
  onToggleCollapse,
}) => {
  const totalCount = Object.values(bookmarksCount).reduce((a, b) => a + b, 0);

  return (
    <Sidebar $collapsed={isCollapsed}>
      <Header $collapsed={isCollapsed}>
        <Title $collapsed={isCollapsed}>카테고리</Title>
        {onToggleCollapse && (
          <CollapseButton
            type="button"
            onClick={onToggleCollapse}
            aria-label={isCollapsed ? '카테고리 펼치기' : '카테고리 접기'}
            title={isCollapsed ? '펼치기' : '접기'}
          >
            <i className={`fa-solid fa-chevron-${isCollapsed ? 'right' : 'left'}`} aria-hidden="true"></i>
          </CollapseButton>
        )}
      </Header>

      <CategoryList>
        <CategoryItem
          type="button"
          $active={activeCategoryId === 'all'}
          $collapsed={isCollapsed}
          aria-pressed={activeCategoryId === 'all'}
          onClick={() => onCategorySelect('all')}
        >
          <CategoryIcon color="var(--text-muted)">
            <i className="fa-solid fa-layer-group" aria-hidden="true"></i>
          </CategoryIcon>
          <CategoryInfo $collapsed={isCollapsed}>
            <CategoryName>전체</CategoryName>
            <CategoryCount>{totalCount}개</CategoryCount>
          </CategoryInfo>
          {isCollapsed && <ItemTooltip className="item-tooltip">전체 ({totalCount}개)</ItemTooltip>}
        </CategoryItem>

        <CategoryItem
          type="button"
          $active={activeCategoryId === 'favorite'}
          $collapsed={isCollapsed}
          aria-pressed={activeCategoryId === 'favorite'}
          onClick={() => onCategorySelect('favorite')}
        >
          <CategoryIcon color="#FCD34D">
            <i className="fa-solid fa-star" aria-hidden="true"></i>
          </CategoryIcon>
          <CategoryInfo $collapsed={isCollapsed}>
            <CategoryName>즐겨찾기</CategoryName>
            <CategoryCount>{favoriteCount}개</CategoryCount>
          </CategoryInfo>
          {isCollapsed && <ItemTooltip className="item-tooltip">즐겨찾기 ({favoriteCount}개)</ItemTooltip>}
        </CategoryItem>

        {categories.map(category => (
          <CategoryItem
            type="button"
            key={category.id}
            $active={activeCategoryId === category.id}
            $collapsed={isCollapsed}
            aria-pressed={activeCategoryId === category.id}
            onClick={() => onCategorySelect(category.id)}
          >
            <CategoryIcon color={category.color}>
              <i className={`fa-solid ${category.icon}`} aria-hidden="true"></i>
            </CategoryIcon>
            <CategoryInfo $collapsed={isCollapsed}>
              <CategoryName>{category.name}</CategoryName>
              <CategoryCount>{bookmarksCount[category.id] || 0}개</CategoryCount>
            </CategoryInfo>
            {isCollapsed && (
              <ItemTooltip className="item-tooltip">
                {category.name} ({bookmarksCount[category.id] || 0}개)
              </ItemTooltip>
            )}
          </CategoryItem>
        ))}
      </CategoryList>

      <AddButton
        type="button"
        $collapsed={isCollapsed}
        onClick={onAddCategory}
        aria-label="카테고리 추가"
      >
        <i className="fa-solid fa-plus" aria-hidden="true"></i>
        <span>카테고리 추가</span>
      </AddButton>
    </Sidebar>
  );
};
