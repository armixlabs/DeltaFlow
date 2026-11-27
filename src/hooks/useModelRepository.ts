import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getGroupContents, getModelXml } from '../services/adonisService';
import { getRequiredEnvVar } from '../utils/env';
import type { GroupContent, Model } from '../types';

interface UseModelRepositoryOptions {
  onError?: (message: string | null) => void;
  configVersion: number;
}

interface SelectModelOptions {
  force?: boolean;
}

const resolveRootModelGroup = (): string => getRequiredEnvVar('ADO_REST_ROOTMODELGROUP');

export const useModelRepository = ({ onError, configVersion }: UseModelRepositoryOptions) => {
  const [rootContent, setRootContent] = useState<GroupContent | null>(null);
  const [childNodes, setChildNodes] = useState<Record<string, GroupContent>>({});
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [loadingGroups, setLoadingGroups] = useState<Set<string>>(new Set());
  const [selectedModel, setSelectedModel] = useState<Model | null>(null);
  const [originalXml, setOriginalXml] = useState<string | null>(null);
  const [isLoadingModel, setIsLoadingModel] = useState(false);
  const [rootGroupId, setRootGroupId] = useState<string | null>(null);

  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let groupId: string | null = null;

    const fetchRoot = async () => {
      try {
        groupId = resolveRootModelGroup();
        setRootGroupId(groupId);
        setLoadingGroups((prev) => {
          const updated = new Set(prev);
          updated.add(groupId as string);
          return updated;
        });
        onError?.(null);

        const content = await getGroupContents(groupId);
        if (!isMountedRef.current) {
          return;
        }
        console.log('[ModelRepository] Root group loaded', {
          subgroups: content.subgroups.length,
          models: content.models.length,
        });
        setRootContent(content);
        setExpandedGroups(new Set([groupId]));
      } catch (error) {
        console.error('[ModelRepository] Failed to load root group', error);
        setRootContent(null);
        const message =
          error instanceof Error
            ? error.message
            : 'Failed to fetch initial model groups. Please check your configuration and network.';
        onError?.(message);
      } finally {
        if (!isMountedRef.current) {
          return;
        }
        setLoadingGroups((prev) => {
          const updated = new Set(prev);
          if (groupId) {
            updated.delete(groupId);
          }
          return updated;
        });
      }
    };

    fetchRoot();

    return () => {
      // no-op cleanup; rely on isMountedRef for guarding state updates
    };
  }, [onError, configVersion]);

  const toggleGroup = useCallback(
    async (groupId: string) => {
      const willExpand = !expandedGroups.has(groupId);
      setExpandedGroups((prev) => {
        const updated = new Set(prev);
        if (updated.has(groupId)) {
          updated.delete(groupId);
        } else {
          updated.add(groupId);
        }
        return updated;
      });

      if (!willExpand || childNodes[groupId]) {
        return;
      }

      setLoadingGroups((prev) => {
        const updated = new Set(prev);
        updated.add(groupId);
        return updated;
      });
      onError?.(null);

      try {
        const content = await getGroupContents(groupId);
        if (!isMountedRef.current) {
          return;
        }
        setChildNodes((prev) => ({ ...prev, [groupId]: content }));
      } catch (error) {
        console.error('[ModelRepository] Failed to load group', groupId, error);
        onError?.('Failed to fetch content for group.');
        if (isMountedRef.current) {
          setExpandedGroups((prev) => {
            const updated = new Set(prev);
            updated.delete(groupId);
            return updated;
          });
        }
      } finally {
        if (!isMountedRef.current) {
          return;
        }
        setLoadingGroups((prev) => {
          const updated = new Set(prev);
          updated.delete(groupId);
          return updated;
        });
      }
    },
    [childNodes, expandedGroups, onError]
  );

  const selectModel = useCallback(
    async (model: Model, options: SelectModelOptions = {}) => {
      if (!options.force && selectedModel?.id === model.id) {
        return;
      }

      setSelectedModel(model);
      setOriginalXml(null);
      setIsLoadingModel(true);
      onError?.(null);

      try {
        const xml = await getModelXml(model.id);
        if (!isMountedRef.current) {
          return;
        }
        setOriginalXml(xml);
      } catch (error) {
        console.error('[ModelRepository] Failed to load model XML', model.id, error);
        onError?.('Failed to load model diagram.');
      } finally {
        if (!isMountedRef.current) {
          return;
        }
        setIsLoadingModel(false);
      }
    },
    [onError, selectedModel]
  );

  const clearSelection = useCallback(() => {
    setSelectedModel(null);
    setOriginalXml(null);
  }, []);

  const isRootLoading = useMemo(
    () => (rootGroupId ? loadingGroups.has(rootGroupId) : false),
    [loadingGroups, rootGroupId]
  );

  return {
    rootContent,
    childNodes,
    expandedGroups,
    loadingGroups,
    selectedModel,
    originalXml,
    isLoadingModel,
    isRootLoading,
    toggleGroup,
    selectModel,
    clearSelection,
    setOriginalXml,
  };
};
