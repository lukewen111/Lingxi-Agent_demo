import { Button, Layout, Menu, Popover } from './ui';
import { IconApps, IconBook, IconCheck, IconDown, IconMenuFold, IconMenuUnfold, IconMessage, IconPoweroff, IconRobot, IconSettings } from '@arco-design/web-react/icon';
import { RiGlobalLine } from '@remixicon/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { MemberAvatar } from './MemberAvatar';
import { createTranslator, LANGUAGE_LABELS } from '../i18n';
import type { AppLanguage, WorkspaceMode } from '../i18n';
import { useAppStore } from '../store';
import { currentMember, LEAF_ROUTE_MAP, MENU_TREE } from '../permissions';

const { Header, Sider, Content } = Layout;

const NODE_ICONS: Record<string, () => React.ReactNode> = {
  inbox: () => <IconMessage />,
  agents: () => <IconRobot />,
  'resource-center': () => <IconBook />,
  channels: () => <IconApps />,
};

const workspaceOptions: { key: WorkspaceMode; labelKey: 'aiAgents' | 'livechat' }[] = [
  { key: 'agents', labelKey: 'aiAgents' },
  { key: 'livechat', labelKey: 'livechat' },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const { state, dispatch, logout } = useAppStore();
  const t = createTranslator(state.ui.language);
  const isOps = location.pathname.startsWith('/ops');
  const workspaceMode = location.pathname.startsWith('/livechat') ? 'livechat' : state.ui.workspaceMode;
  const tenantAccount = state.tenantAccounts.find((tenant) => tenant.ownerUsername === state.session?.username);
  const allowedWorkspaces = workspaceOptions.filter((item) => !tenantAccount || tenantAccount.workspacePermissions.includes(item.key));
  const me = currentMember(state);
  const username = me?.username ?? state.session?.username ?? 'lusenbao49';
  const routeByKey: Record<string, string> = { ...LEAF_ROUTE_MAP, settings: '/settings/chat-timeout' };

  useEffect(() => {
    if (!location.pathname.startsWith('/workflows')) return;
    const query = window.matchMedia('(max-width: 760px)');
    const compact = () => { if (query.matches) setCollapsed(true); };
    compact();
    query.addEventListener('change', compact);
    return () => query.removeEventListener('change', compact);
  }, [location.pathname]);

  useEffect(() => {
    if (location.pathname.startsWith('/livechat') || location.pathname.startsWith('/ops')) return;
    dispatch({ type: 'ui.workspace', workspaceMode: 'agents', lastAgentsPath: `${location.pathname}${location.search}` });
  }, [dispatch, location.pathname, location.search]);

  useEffect(() => {
    if (!tenantAccount || isOps) return;
    if (location.pathname.startsWith('/livechat') && !tenantAccount.workspacePermissions.includes('livechat')) {
      navigate(tenantAccount.workspacePermissions.includes('agents') ? state.ui.lastAgentsPath || '/inbox' : '/ops/tenants', { replace: true });
      return;
    }
    if (!location.pathname.startsWith('/livechat') && !tenantAccount.workspacePermissions.includes('agents') && tenantAccount.workspacePermissions.includes('livechat')) {
      navigate('/livechat/dashboard', { replace: true });
    }
  }, [isOps, location.pathname, navigate, state.ui.lastAgentsPath, tenantAccount]);

  const selected = useMemo(() => location.pathname.startsWith('/inbox') ? 'inbox' : location.pathname.startsWith('/agents') ? 'agents' : location.pathname.startsWith('/knowledge') ? 'knowledge' : location.pathname.startsWith('/workflows') ? 'workflows' : location.pathname.startsWith('/channels') ? 'channels' : location.pathname.startsWith('/settings') ? 'settings' : '', [location.pathname]);
  const switchWorkspace = (mode: WorkspaceMode) => {
    if (tenantAccount && !tenantAccount.workspacePermissions.includes(mode)) return;
    setWorkspaceOpen(false);
    if (mode === 'livechat') {
      dispatch({ type: 'ui.workspace', workspaceMode: 'livechat', lastAgentsPath: location.pathname.startsWith('/livechat') ? state.ui.lastAgentsPath : `${location.pathname}${location.search}` });
      navigate('/livechat/dashboard');
      return;
    }
    dispatch({ type: 'ui.workspace', workspaceMode: 'agents' });
    navigate(state.ui.lastAgentsPath || '/inbox');
  };
  const enterProduct = () => {
    if (tenantAccount?.workspacePermissions.length === 1 && tenantAccount.workspacePermissions[0] === 'livechat') {
      dispatch({ type: 'ui.workspace', workspaceMode: 'livechat' });
      navigate('/livechat/dashboard');
      return;
    }
    dispatch({ type: 'ui.workspace', workspaceMode: 'agents' });
    navigate(state.ui.lastAgentsPath || '/inbox');
  };
  const workspaceMenu = <div className="workspace-switch-menu">
    {allowedWorkspaces.map((item) => <button key={item.key} type="button" className={workspaceMode === item.key ? 'active' : ''} onClick={() => switchWorkspace(item.key)}><span>{t(item.labelKey)}</span>{workspaceMode === item.key && <IconCheck />}</button>)}
  </div>;

  return <Layout className="app-layout">
    <Header className={`app-header ${isOps ? 'is-ops' : ''}`}>
      <div className="brand"><span className="brand-name is-logo-text">{isOps ? '运营后台管理' : 'LOGO'}</span>{!isOps && allowedWorkspaces.length > 0 && <Popover trigger="click" position="br" content={workspaceMenu} popupVisible={workspaceOpen} onVisibleChange={setWorkspaceOpen}><button className="workspace-switch-trigger" type="button"><span>{workspaceMode === 'livechat' ? t('livechat') : t('aiAgents')}</span><IconDown /></button></Popover>}{!isOps && <Button className="sider-toggle" type="text" shape="circle" aria-label={collapsed ? '展开侧边栏' : '收起侧边栏'} icon={collapsed ? <IconMenuUnfold /> : <IconMenuFold />} onClick={() => setCollapsed((value) => !value)} />}</div>
    {isOps ? <button className="product-entry" type="button" onClick={enterProduct}>进入产品</button> : <button className="ops-entry" type="button" onClick={() => navigate('/ops/tenants')}>点击跳转到运营后台管理</button>}</Header>
    <Layout>
      {workspaceMode === 'agents' && !isOps && <Sider width={200} collapsed={collapsed} className="app-sider" breakpoint="md" collapsedWidth={56} onCollapse={setCollapsed}>
        <div className="sider-inner">
          <Menu className="app-menu" mode="vertical" defaultOpenKeys={['resource-center']} selectedKeys={[selected]} onClickMenuItem={(key) => { const route = routeByKey[key]; if (route) navigate(route); }}>
            {MENU_TREE.map((node) => {
              if (node.key === 'settings') return <Menu.Item key="settings"><IconSettings />设置</Menu.Item>;
              if (node.children?.length) {
                return <Menu.SubMenu key={node.key} title={<>{NODE_ICONS[node.key]?.()}{node.label}</>}>{node.children.map((child) => <Menu.Item key={child.key}>{child.label}</Menu.Item>)}</Menu.SubMenu>;
              }
              return <Menu.Item key={node.key}>{NODE_ICONS[node.key]?.()}{node.label}</Menu.Item>;
            })}
          </Menu>
          <SidebarProfile username={username} collapsed={collapsed} language={state.ui.language} onLanguageChange={(language) => dispatch({ type: 'ui.language', language })} onLogout={() => { logout(); navigate('/login', { replace: true }); }} />
        </div>
      </Sider>}
      <Content className={`app-content ${workspaceMode === 'livechat' || isOps ? 'is-livechat' : ''}`}>{children}</Content>
    </Layout>
  </Layout>;
}

function SidebarProfile({ username, collapsed, language, onLanguageChange, onLogout }: { username: string; collapsed: boolean; language: AppLanguage; onLanguageChange: (language: AppLanguage) => void; onLogout: () => void }) {
  const [open, setOpen] = useState(false);
  const [languageOpen, setLanguageOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const t = createTranslator(language);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      setLanguageOpen(false);
      triggerRef.current?.focus();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  const content = <div className="sidebar-profile-popover-wrap">
    <div className="sidebar-profile-popover" role="menu">
      <div className="sidebar-profile-popover-user">
        <MemberAvatar username={username} size={36} />
        <div><strong>{username}</strong></div>
      </div>
      <button className={`sidebar-profile-menu-item ${languageOpen ? 'is-active' : ''}`} type="button" role="menuitem" onClick={() => setLanguageOpen((value) => !value)}>
        <RiGlobalLine className="profile-menu-icon" aria-hidden="true" />
        <span>{t('language')}</span>
        <span className="profile-menu-arrow">›</span>
      </button>
      <button className="sidebar-profile-menu-item is-danger" type="button" role="menuitem" onClick={() => { setOpen(false); setLanguageOpen(false); onLogout(); }}>
        <IconPoweroff />
        <span>{t('logout')}</span>
      </button>
    </div>
    {languageOpen && <div className="sidebar-language-panel" role="menu">
      {(['zh-CN', 'en-US'] as AppLanguage[]).map((item) => <button key={item} type="button" className={language === item ? 'active' : ''} onClick={() => { onLanguageChange(item); setLanguageOpen(false); }}><span>{language === item ? '●' : ''}</span>{LANGUAGE_LABELS[item]}</button>)}
    </div>}
  </div>;

  return <Popover trigger="click" position="top" content={content} popupVisible={open} onVisibleChange={(visible) => { setOpen(visible); if (!visible) setLanguageOpen(false); }}>
    <button ref={triggerRef} type="button" className={`sidebar-profile-trigger ${collapsed ? 'is-collapsed' : ''}`} aria-label="个人中心" aria-expanded={open}>
      <MemberAvatar username={username} size={32} />
      {!collapsed && <span className="sidebar-profile-text"><strong>{username}</strong></span>}
      {!collapsed && <IconDown className="sidebar-profile-arrow" />}
    </button>
  </Popover>;
}
