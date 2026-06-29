'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Project, TimeBlock } from '@/lib/types';
import {
  BLOCK_NOTIFY_CHECK_MS,
  checkDueBlocks,
  getNotificationPermission,
  markBlockEventFired,
  showBlockNotification
} from '@/lib/block-notifications';
import { pomoAudio } from '@/lib/pomo-audio';

export function useBlockNotifications(
  blocks: TimeBlock[],
  projects: Project[],
  enabled: boolean
) {
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const blocksRef = useRef(blocks);
  const projectsRef = useRef(projects);

  const refreshPermission = useCallback(() => {
    setPermission(getNotificationPermission());
  }, []);

  useEffect(() => {
    refreshPermission();
  }, [refreshPermission]);

  useEffect(() => {
    blocksRef.current = blocks;
    projectsRef.current = projects;
  }, [blocks, projects]);

  const runCheck = useCallback(() => {
    if (!enabled || getNotificationPermission() !== 'granted') return;

    const due = checkDueBlocks(blocksRef.current, projectsRef.current);
    for (const { block, event, projectName } of due) {
      showBlockNotification(event, block, projectName);
      markBlockEventFired(block.id, event);
      pomoAudio.unlock();
      if (event === 'start') void pomoAudio.playStart('work');
      else void pomoAudio.playComplete('rest');
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    runCheck();
    const id = setInterval(runCheck, BLOCK_NOTIFY_CHECK_MS);
    return () => clearInterval(id);
  }, [enabled, blocks, projects, runCheck]);

  return { permission, refreshPermission };
}
