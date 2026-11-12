import type { TenantMember, TenantRole } from './types';

export interface MenuNode {
  key: string;
  label: string;
  route?: string;
  children?: MenuNode[];
}

export const MENU_TREE: MenuNode[] = [
  { key: 'inbox', label: '收件箱', route: '/inbox' },
  { key: 'agents', label: 'AI Agents', route: '/agents' },
  {
    key: 'resource-center',
    label: '资源中心',
    children: [
      { key: 'knowledge', label: '知识库', route: '/knowledge' },
      { key: 'workflows', label: '工作流', route: '/workflows' },
    ],
  },
  { key: 'channels', label: '渠道', route: '/channels' },
  {
    key: 'settings',
    label: '设置',
    children: [
      {
        key: 'settings:members-permissions',
        label: '成员与权限',
        children: [
          { key: 'settings:members', label: '用户管理', route: '/settings/members' },
          { key: 'settings:roles', label: '角色管理', route: '/settings/roles' },
        ],
      },
      { key: 'settings:chat-timeout', label: '聊天超时', route: '/settings/chat-timeout' },
    ],
  },
  { key: 'overview', label: '总览', route: '/overview' },
];

const collectLeaves = (nodes: MenuNode[]): MenuNode[] => nodes.flatMap((node) => (node.children?.length ? collectLeaves(node.children) : [node]));

export const MENU_LEAF_KEYS: string[] = collectLeaves(MENU_TREE).map((node) => node.key);

export const LEAF_ROUTE_MAP: Record<string, string> = Object.fromEntries(collectLeaves(MENU_TREE).map((node) => [node.key, node.route!]));

export const routeMenuKey = (pathname: string): string | null => {
  if (pathname.startsWith('/inbox')) return 'inbox';
  if (pathname.startsWith('/agents')) return 'agents';
  if (pathname.startsWith('/knowledge')) return 'knowledge';
  if (pathname.startsWith('/workflows')) return 'workflows';
  if (pathname.startsWith('/channels')) return 'channels';
  if (pathname.startsWith('/settings/members')) return 'settings:members';
  if (pathname.startsWith('/settings/roles')) return 'settings:roles';
  if (pathname.startsWith('/settings')) return 'settings:chat-timeout';
  if (pathname.startsWith('/overview')) return 'overview';
  return null;
};

export const expandToLeaves = (keys: string[]): string[] => {
  const keySet = new Set(keys);
  const leaves = new Set<string>();
  const walk = (nodes: MenuNode[]) => nodes.forEach((node) => {
    if (node.children?.length) {
      if (keySet.has(node.key)) collectLeaves(node.children).forEach((leaf) => leaves.add(leaf.key));
      else walk(node.children);
    } else if (keySet.has(node.key)) {
      leaves.add(node.key);
    }
  });
  walk(MENU_TREE);
  return Array.from(leaves);
};

export const roleLeafKeys = (role: TenantRole | undefined): Set<string> => {
  if (!role) return new Set();
  if (role.builtin) return new Set(MENU_LEAF_KEYS);
  return new Set(role.menuKeys.filter((key) => MENU_LEAF_KEYS.includes(key)));
};

export const currentMember = (state: { members: TenantMember[]; currentMemberId: string; session?: { username: string } | null }): TenantMember | undefined => {
  if (state.session) return state.members.find((member) => member.username === state.session!.username)
    ?? { id: 'demo-session-user', username: state.session.username, roleId: '', enabled: true, createdAt: '' };
  return state.members.find((member) => member.id === state.currentMemberId);
};

export const firstAccessibleRoute = (accessible: Set<string>): string | null => {
  for (const key of MENU_LEAF_KEYS) if (accessible.has(key)) return LEAF_ROUTE_MAP[key];
  return null;
};
