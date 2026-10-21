import { IconExclamationCircle, IconRobot } from '@arco-design/web-react/icon';
import type { Agent } from '../types';

export function AgentAvatar({ agent }: { agent?: Agent }) {
  if (!agent) return <span className="agent-reference-avatar is-empty"><IconExclamationCircle /></span>;
  if (agent.avatar) return <span className="agent-reference-avatar"><img src={agent.avatar} alt="" /></span>;
  return <span className="agent-reference-avatar"><IconRobot /></span>;
}
