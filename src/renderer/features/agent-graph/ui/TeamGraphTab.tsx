/**
 * TeamGraphTab — wraps GraphView for use as a dedicated tab.
 * Provides Fullscreen button that opens the overlay.
 */

import { useCallback, useState, lazy, Suspense } from 'react';

import { GraphView } from '@claude-teams/agent-graph';

import { useTeamGraphAdapter } from '../adapters/useTeamGraphAdapter';
import { GraphNodePopover } from './GraphNodePopover';

import type { GraphDomainRef, GraphEventPort, GraphNode } from '@claude-teams/agent-graph';

const TeamGraphOverlay = lazy(() =>
  import('./TeamGraphOverlay').then((m) => ({ default: m.TeamGraphOverlay }))
);

export interface TeamGraphTabProps {
  teamName: string;
}

export const TeamGraphTab = ({ teamName }: TeamGraphTabProps): React.JSX.Element => {
  const graphData = useTeamGraphAdapter(teamName);
  const [fullscreen, setFullscreen] = useState(false);

  // Typed event dispatchers (DRY — used in both events + renderOverlay)
  const dispatchOpenTask = useCallback(
    (taskId: string) =>
      window.dispatchEvent(new CustomEvent('graph:open-task', { detail: { teamName, taskId } })),
    [teamName]
  );
  const dispatchSendMessage = useCallback(
    (memberName: string) =>
      window.dispatchEvent(
        new CustomEvent('graph:send-message', { detail: { teamName, memberName } })
      ),
    [teamName]
  );

  const events: GraphEventPort = {
    onNodeDoubleClick: useCallback(
      (ref: GraphDomainRef) => {
        if (ref.kind === 'task') dispatchOpenTask(ref.taskId);
        else if (ref.kind === 'member') dispatchSendMessage(ref.memberName);
      },
      [dispatchOpenTask, dispatchSendMessage]
    ),
    onSendMessage: dispatchSendMessage,
    onOpenTaskDetail: dispatchOpenTask,
    onOpenMemberProfile: dispatchSendMessage,
  };

  return (
    <div className="size-full" style={{ background: '#050510' }}>
      <GraphView
        data={graphData}
        events={events}
        className="size-full"
        onRequestFullscreen={() => setFullscreen(true)}
        renderOverlay={({ node, onClose }) => (
          <GraphNodePopover
            node={node}
            onClose={onClose}
            onSendMessage={dispatchSendMessage}
            onOpenTaskDetail={dispatchOpenTask}
            onOpenMemberProfile={dispatchSendMessage}
          />
        )}
      />
      {fullscreen && (
        <Suspense fallback={null}>
          <TeamGraphOverlay teamName={teamName} onClose={() => setFullscreen(false)} />
        </Suspense>
      )}
    </div>
  );
};
