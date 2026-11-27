
import React from 'react';
import type { ModelGroup, Model, GroupContent } from '../types';
import { ChevronRightIcon, DocumentIcon, FolderIcon, LoaderIcon } from './icons';

interface SidebarProps {
  rootContent: GroupContent | null;
  childNodes: Record<string, GroupContent>;
  expandedGroups: Set<string>;
  loadingGroups: Set<string>;
  selectedModel: Model | null;
  onToggleGroup: (groupId: string) => void;
  onSelectModel: (model: Model) => void;
}

interface GroupItemProps extends Omit<SidebarProps, 'rootContent'> {
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
  const { rootContent } = props;
  const groupCount = rootContent?.subgroups?.length ?? 0;
  const modelCount = rootContent?.models?.length ?? 0;

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <h2>Process Models</h2>
        <p>{groupCount + modelCount} items loaded</p>
      </div>
      <nav className="sidebar-nav">
        <ul>
            {rootContent?.subgroups.sort((a,b) => a.name.localeCompare(b.name)).map(group => (
                <GroupItem key={group.id} group={group} {...props} />
            ))}
            {rootContent?.models.sort((a,b) => a.name.localeCompare(b.name)).map(model => (
                 <li className="model-item" key={model.id}>
                 <button
                   onClick={() => props.onSelectModel(model)}
                   className={`model-item-button ${props.selectedModel?.id === model.id ? 'selected' : ''}`}
                 >
                   <DocumentIcon className="icon" />
                   <span className="item-name" title={model.name}>{model.name}</span>
                   {model.state === 'DRAFT' && <span className="model-draft-tag">DRAFT</span>}
                 </button>
               </li>
            ))}
        </ul>
      </nav>
      <div className="sidebar-footer">
        <p>&copy; {new Date().getFullYear()} Deltaflow Inc.</p>
      </div>
    </aside>
  );
};
