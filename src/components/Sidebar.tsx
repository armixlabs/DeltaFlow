
import React from 'react';
import type { ModelGroup, Model, GroupContent } from '../types';
import { ChevronRightIcon, DocumentIcon, FolderIcon, LoaderIcon, PlusIcon } from './icons';
import { MODEL_PROVIDERS, getProviderLabel, type ModelProvider } from '../utils/providers';

interface SidebarProps {
  rootContent: GroupContent | null;
  childNodes: Record<string, GroupContent>;
  expandedGroups: Set<string>;
  loadingGroups: Set<string>;
  selectedModel: Model | null;
  onToggleGroup: (groupId: string) => void;
  onSelectModel: (model: Model) => void;
  onCreateNew: () => void;
  onCreateFromTranscript: () => void;
  modelProvider: ModelProvider;
  onModelProviderChange: (provider: ModelProvider) => void;
  onOpenConfig: () => void;
  appVersion?: string;
  width: number;
}

interface GroupItemProps
  extends Omit<SidebarProps, 'rootContent' | 'onCreateNew' | 'onCreateFromTranscript' | 'onModelProviderChange' | 'onOpenConfig' | 'modelProvider' | 'appVersion' | 'width'> {
    group: ModelGroup;
}

const GroupItem: React.FC<GroupItemProps> = ({
  group,
  childNodes,
  expandedGroups,
  loadingGroups,
  selectedModel,
  onToggleGroup,
  onSelectModel
}) => {
  const isExpanded = expandedGroups.has(group.id);
  const isLoading = loadingGroups.has(group.id);
  const content = childNodes[group.id];

  return (
    <li className="group-item">
      <button
        onClick={() => onToggleGroup(group.id)}
        className="group-item-button"
        aria-expanded={isExpanded}
      >
        <FolderIcon />
        <span className="item-name">{group.name}</span>
        {isLoading 
            ? <LoaderIcon className="loader-icon sidebar-loader" />
            : <ChevronRightIcon className="chevron-icon" />
        }
      </button>
      {isExpanded && content && (
        <ul className="group-children">
          {content.subgroups.sort((a,b) => a.name.localeCompare(b.name)).map(subgroup => (
              <GroupItem 
                key={subgroup.id}
                group={subgroup}
                childNodes={childNodes}
                expandedGroups={expandedGroups}
                loadingGroups={loadingGroups}
                selectedModel={selectedModel}
                onToggleGroup={onToggleGroup}
                onSelectModel={onSelectModel}
              />
          ))}
          {content.models.sort((a,b) => a.name.localeCompare(b.name)).map((model) => (
            <li className="model-item" key={model.id}>
              <button
                onClick={() => onSelectModel(model)}
                className={`model-item-button ${selectedModel?.id === model.id ? 'selected' : ''}`}
              >
                <DocumentIcon className="icon" />
                <span className="item-name" title={model.name}>{model.name}</span>
                {model.state === 'DRAFT' && <span className="model-draft-tag">DRAFT</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
};


export const Sidebar: React.FC<SidebarProps> = (props) => {
  const { rootContent, width, modelProvider } = props;
  const groupCount = rootContent?.subgroups?.length ?? 0;
  const modelCount = rootContent?.models?.length ?? 0;
  const totalCount = groupCount + modelCount;

  return (
    <aside className="sidebar" style={{ width }}>
      <div className="sidebar-inner">
        <div className="sidebar-brand">
          <img src="https://www.deltaflow.cloud/deltaflow-logo.png" alt="Deltaflow logo" className="sidebar-logo-image" />
          <div>
            <span className="sidebar-title">Deltaflow</span>
            <span className="sidebar-subtitle">Business Process Optimization</span>
          </div>
        </div>

        <div className="model-selector">
          <label htmlFor="model-provider">Language model</label>
          <select
            id="model-provider"
            value={modelProvider}
            onChange={(event) => props.onModelProviderChange(event.target.value as ModelProvider)}
          >
            {MODEL_PROVIDERS.map((provider) => (
              <option key={provider} value={provider}>
                {getProviderLabel(provider)}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="model-config-button"
            onClick={props.onOpenConfig}
            aria-label="Open configuration"
            title="Open configuration"
          >
            …
          </button>
        </div>

        <button className="sidebar-primary-action" onClick={props.onCreateNew}>
          <PlusIcon className="icon" />
          New Process Model from Description
        </button>

        <button className="sidebar-primary-action" onClick={props.onCreateFromTranscript}>
          <PlusIcon className="icon" />
          New Process Model from Transcript
        </button>

        <div className="sidebar-section">
          <div className="sidebar-section-header">
            <h2>Process Models</h2>
            <p>{totalCount} items loaded</p>
          </div>
          <div className="sidebar-scroll">
            <nav>
              <ul>
                {rootContent?.subgroups
                  .slice()
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((group) => (
                    <GroupItem key={group.id} group={group} {...props} />
                  ))}
                {rootContent?.models
                  .slice()
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((model) => (
                    <li className="model-item" key={model.id}>
                      <button
                        onClick={() => props.onSelectModel(model)}
                        className={`model-item-button ${props.selectedModel?.id === model.id ? 'selected' : ''}`}
                      >
                        <DocumentIcon className="icon" />
                        <span className="item-name" title={model.name}>
                          {model.name}
                        </span>
                        {model.state === 'DRAFT' && <span className="model-draft-tag">DRAFT</span>}
                      </button>
                    </li>
                  ))}
              </ul>
            </nav>
          </div>
        </div>
      </div>
      <div className="sidebar-footer">
        <span>&copy; {new Date().getFullYear()} ARMIX Labs</span>
        {props.appVersion && <span className="sidebar-footer-version">{props.appVersion}</span>}
      </div>
    </aside>
  );
};
