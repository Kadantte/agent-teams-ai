/**
 * TeamGraphOverlay — full-screen overlay showing the agent graph.
 * Follows the exact ProjectEditorOverlay pattern (lazy-loaded, fixed z-50).
 */

import { useCallback } from 'react';

import { GraphView } from '@claude-teams/agent-graph';

import { useTeamGraphAdapter } from '../adapters/useTeamGraphAdapter';
import { GraphNodePopover } from './GraphNodePopover';

import type { GraphDomainRef, GraphEventPort } from '@claude-teams/agent-graph';

export interface TeamGraphOverlayProps {
  teamName: string;
  onClose: () => void;
  onPinAsTab?: () => void;
  onSendMessage?: (memberName: string) => void;
  onOpenTaskDetail?: (taskId: string) => void;
  onOpenMemberProfile?: (memberName: string) => void;
}

export const TeamGraphOverlay = ({
  teamName,
  onClose,
  onPinAsTab,
  onSendMessage,
  onOpenTaskDetail,
  onOpenMemberProfile,
}: TeamGraphOverlayProps): React.JSX.Element => {
  const graphData = useTeamGraphAdapter(teamName);

  const events: GraphEventPort = {
    onNodeDoubleClick: useCallback(
      (ref: GraphDomainRef) => {
        if (ref.kind === 'task') onOpenTaskDetail?.(ref.taskId);
        else if (ref.kind === 'member') onOpenMemberProfile?.(ref.memberName);
      },
      [onOpenTaskDetail, onOpenMemberProfile]
    ),
    onSendMessage: useCallback(
      (memberName: string) => onSendMessage?.(memberName),
      [onSendMessage]
    ),
    onOpenTaskDetail: useCallback(
      (taskId: string) => onOpenTaskDetail?.(taskId),
      [onOpenTaskDetail]
    ),
    onOpenMemberProfile: useCallback(
      (memberName: string) => onOpenMemberProfile?.(memberName),
      [onOpenMemberProfile]
    ),
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: '#050510' }}>
      <GraphView
        data={graphData}
        events={events}
        onRequestClose={onClose}
        onRequestPinAsTab={onPinAsTab}
        className="flex-1"
        renderOverlay={({ node, onClose: closePopover }) => (
          <GraphNodePopover
            node={node}
            onClose={closePopover}
            onSendMessage={(name) => {
              onSendMessage?.(name);
              closePopover();
            }}
            onOpenTaskDetail={(id) => {
              onOpenTaskDetail?.(id);
              closePopover();
            }}
            onOpenMemberProfile={(name) => {
              onOpenMemberProfile?.(name);
              closePopover();
            }}
          />
        )}
      />
    </div>
  );
};
