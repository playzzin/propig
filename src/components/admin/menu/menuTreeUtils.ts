import { MenuItem } from '@/types/menu';

export type MenuMoveDirection = 'up' | 'down' | 'indent' | 'outdent';

export interface MenuParentOption {
  id: string;
  label: string;
  depth: number;
}

type MenuNode = MenuItem | string;

function isMenuItemNode(node: MenuNode | undefined): node is MenuItem {
  return Boolean(node) && typeof node !== 'string';
}

function cloneMenuItem(item: MenuItem): MenuItem {
  return {
    ...item,
    sub: item.sub?.map((subItem) => (typeof subItem === 'string' ? subItem : cloneMenuItem(subItem))),
  };
}

function findItemPath(items: MenuNode[], id: string): number[] | null {
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    if (!isMenuItemNode(item)) continue;

    if (item.id === id) return [index];

    if (!item.sub) continue;

    const childPath = findItemPath(item.sub, id);
    if (childPath) return [index, ...childPath];
  }

  return null;
}

function getContainer(items: MenuItem[], parentPath: number[]): MenuNode[] | null {
  let container: MenuNode[] = items;

  for (const index of parentPath) {
    const parent = container[index];
    if (!isMenuItemNode(parent)) return null;

    parent.sub = parent.sub ?? [];
    container = parent.sub;
  }

  return container;
}

function addItemToNodes(nodes: MenuNode[], item: MenuItem, parentId: string): { nodes: MenuNode[]; changed: boolean } {
  let changed = false;

  const nextNodes = nodes.map((node) => {
    if (!isMenuItemNode(node)) return node;

    if (node.id === parentId) {
      changed = true;
      return {
        ...node,
        type: 'folder' as const,
        expanded: true,
        sub: [...(node.sub ?? []), item],
      };
    }

    if (!node.sub) return node;

    const childResult = addItemToNodes(node.sub, item, parentId);
    if (!childResult.changed) return node;

    changed = true;
    return {
      ...node,
      sub: childResult.nodes,
    };
  });

  return { nodes: changed ? nextNodes : nodes, changed };
}

export function addMenuItemToParent(items: MenuItem[], item: MenuItem, parentId?: string): MenuItem[] {
  if (!parentId) return [...items, item];

  const result = addItemToNodes(items, item, parentId);
  return result.changed ? (result.nodes as MenuItem[]) : [...items, item];
}

export function collectMenuParentOptions(items: MenuItem[], depth = 0): MenuParentOption[] {
  return items.flatMap((item) => {
    const children = (item.sub ?? []).filter(isMenuItemNode);
    const canHaveChildren = item.type !== 'divider';
    const label = item.text.trim() || '이름 없는 메뉴';
    const current = canHaveChildren ? [{ id: item.id, label, depth }] : [];

    return [
      ...current,
      ...collectMenuParentOptions(children, depth + 1),
    ];
  });
}

export function moveMenuItem(
  items: MenuItem[],
  id: string,
  direction: MenuMoveDirection,
): { items: MenuItem[]; changed: boolean } {
  const nextItems = items.map(cloneMenuItem);
  const path = findItemPath(nextItems, id);
  if (!path) return { items, changed: false };

  const index = path[path.length - 1];
  const parentPath = path.slice(0, -1);
  const container = getContainer(nextItems, parentPath);
  const currentItem = container?.[index];

  if (!container || !isMenuItemNode(currentItem)) {
    return { items, changed: false };
  }

  if (direction === 'up' || direction === 'down') {
    const nextIndex = direction === 'up' ? index - 1 : index + 1;
    const targetItem = container[nextIndex];

    if (!isMenuItemNode(targetItem)) {
      return { items, changed: false };
    }

    container[index] = targetItem;
    container[nextIndex] = currentItem;
    return { items: nextItems, changed: true };
  }

  if (direction === 'indent') {
    const previousItem = container[index - 1];

    if (!isMenuItemNode(previousItem) || previousItem.type === 'divider' || currentItem.type === 'divider') {
      return { items, changed: false };
    }

    container.splice(index, 1);
    previousItem.type = 'folder';
    previousItem.expanded = true;
    previousItem.sub = [...(previousItem.sub ?? []), currentItem];
    return { items: nextItems, changed: true };
  }

  if (parentPath.length === 0) {
    return { items, changed: false };
  }

  const grandParentPath = parentPath.slice(0, -1);
  const parentIndex = parentPath[parentPath.length - 1];
  const grandContainer = getContainer(nextItems, grandParentPath);
  const parentItem = grandContainer?.[parentIndex];

  if (!grandContainer || !isMenuItemNode(parentItem)) {
    return { items, changed: false };
  }

  container.splice(index, 1);
  grandContainer.splice(parentIndex + 1, 0, currentItem);
  return { items: nextItems, changed: true };
}
