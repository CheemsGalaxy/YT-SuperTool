import { createElement } from '../dom-safe.js';
import { createIcon } from './icons.js';
import { createSponsorAccordion } from './sponsor-accordion.js';
import { UI_STRINGS } from './strings.js';
import { FEATURE_GROUPS, featuresForGroup } from '../settings-schema.js';

export function createSettingsTree({
  prefix = 'ytst',
  orientation = 'vertical',
  tabHost = null,
  panelHost = null,
  tabHostClass = '',
  panelHostClass = '',
  panelClass = '',
  rowClass = '',
  switchInputClass = '',
  badgeClass = '',
  showTabCount = false,
  onChange,
  onCategoriesChange,
  onNoticeChange,
  onProgressChange
} = {}) {
  const base = (name) => `${prefix}-${name}`;
  const rowClassName = rowClass || base('row');
  const switchClassName = switchInputClass || base('switch-input');
  const panelClassName = panelClass || base('tabpanel');
  const badgeClassName = badgeClass || base('badge-layer');

  const rows = new Map();
  const tabs = new Map();
  const panels = new Map();
  const groupMeta = new Map();
  let activeGroup = FEATURE_GROUPS[0]?.id || '';
  let sponsorAccordion = null;

  const rail = tabHost || createElement('div', {
    className: tabHostClass || base('rail'),
    role: 'tablist',
    'aria-label': UI_STRINGS.settingGroups,
    'aria-orientation': orientation
  });

  const content = panelHost || createElement('div', {
    className: panelHostClass || base('content')
  });

  const buildRow = (feature) => {
    const input = createElement('input', {
      type: 'checkbox',
      className: switchClassName,
      id: `${prefix}-${feature.key}`,
      role: 'switch',
      'aria-describedby': `${prefix}-desc-${feature.key}`
    });
    input.dataset.key = feature.key;

    const metaCell = createElement('span', { className: base('row-meta') });
    if (feature.badge) {
      metaCell.appendChild(createElement('span', {
        className: badgeClassName,
        textContent: feature.badge
      }));
    }

    const row = createElement('label', {
      className: rowClassName,
      for: `${prefix}-${feature.key}`
    }, [
      createElement('span', { className: base('row-icon') }, [createIcon(feature.icon, 20)]),
      createElement('span', { className: base('row-copy') }, [
        createElement('span', { className: base('row-label'), textContent: feature.label }),
        createElement('span', {
          className: base('row-desc'),
          id: `${prefix}-desc-${feature.key}`,
          textContent: feature.description
        })
      ]),
      metaCell,
      input,
      createElement('span', { className: base('switch'), 'aria-hidden': 'true' }, [
        createElement('span', { className: base('switch-thumb') })
      ])
    ]);

    rows.set(feature.key, { row, input, feature });
    return row;
  };

  const buildTab = (group) => {
    const features = featuresForGroup(group.id);
    const tab = createElement('button', {
      type: 'button',
      className: base('tab'),
      role: 'tab',
      id: `${prefix}-tab-${group.id}`,
      'aria-controls': `${prefix}-panel-${group.id}`,
      'aria-selected': 'false',
      tabindex: '-1'
    }, [
      createIcon(group.icon, 16),
      createElement('span', { textContent: group.label }),
      showTabCount ? createElement('span', {
        className: base('tab-count'),
        textContent: String(features.length)
      }) : null
    ]);

    tab.addEventListener('click', () => show(group.id));
    tabs.set(group.id, tab);
    return tab;
  };

  const buildAccordion = () => createSponsorAccordion({
    onChange: (value) => onCategoriesChange?.(value),
    onNoticeChange: (value) => onNoticeChange?.(value),
    onProgressChange: (value) => onProgressChange?.(value)
  });

  const buildGroupPanel = (group) => {
    const metaNode = createElement('span', { className: base('group-meta') });
    groupMeta.set(group.id, metaNode);

    const wrapper = createElement('div', {
      className: panelClassName,
      id: `${prefix}-panel-${group.id}`,
      role: 'tabpanel',
      'aria-labelledby': `${prefix}-tab-${group.id}`
    }, [
      createElement('div', { className: base('group-head') }, [
        createElement('h2', { className: base('group-title'), textContent: group.label }),
        metaNode
      ])
    ]);

    const list = createElement('div', { className: base('group') });
    let layerHeadingShown = false;
    for (const feature of featuresForGroup(group.id)) {
      if (feature.dependsOn && !layerHeadingShown) {
        layerHeadingShown = true;
        list.appendChild(createElement('div', {
          className: base('section'),
          textContent: UI_STRINGS.defenceLayers
        }));
      }
      list.appendChild(buildRow(feature));
      if (feature.key === 'sponsorblock') {
        sponsorAccordion = buildAccordion();
        list.appendChild(sponsorAccordion.element);
      }
    }
    wrapper.appendChild(list);

    panels.set(group.id, wrapper);
    return wrapper;
  };

  const show = (groupId) => {
    if (!tabs.has(groupId)) return;
    activeGroup = groupId;
    tabs.forEach((tab, id) => {
      tab.setAttribute('aria-selected', String(id === groupId));
      tab.tabIndex = id === groupId ? 0 : -1;
    });
    panels.forEach((node, id) => {
      node.hidden = id !== groupId;
    });
  };

  const sync = (values = {}) => {
    rows.forEach(({ input, row, feature }) => {
      input.checked = Boolean(values[feature.key]);
      const blocked = Boolean(feature.dependsOn && !values[feature.dependsOn]);
      input.disabled = blocked;
      row.classList.toggle('is-disabled', blocked);
    });

    groupMeta.forEach((node, groupId) => {
      const features = featuresForGroup(groupId)
        .filter((feature) => !feature.dependsOn || values[feature.dependsOn]);
      const active = features.filter((feature) => values[feature.key]).length;
      node.textContent = `${active}/${features.length}`;
    });

    sponsorAccordion?.setOpen(Boolean(values.sponsorblock));
    sponsorAccordion?.setCategories(values.sponsorblockCategories);
    sponsorAccordion?.setNotice(values.sponsorblockNotice);
    sponsorAccordion?.setProgress(values.sponsorblockProgressBar);
  };

  FEATURE_GROUPS.forEach((group) => {
    rail.appendChild(buildTab(group));
    content.appendChild(buildGroupPanel(group));
  });

  content.addEventListener('change', (event) => {
    const input = event.target;
    if (!input?.classList?.contains(switchClassName)) return;
    const key = input.dataset.key;
    if (!key) return;
    onChange?.(key, Boolean(input.checked));
  });

  rail.addEventListener('keydown', (event) => {
    const previousKey = orientation === 'horizontal' ? 'ArrowLeft' : 'ArrowUp';
    const nextKey = orientation === 'horizontal' ? 'ArrowRight' : 'ArrowDown';
    if (event.key !== previousKey && event.key !== nextKey) return;
    event.preventDefault();
    const ids = [...tabs.keys()];
    const index = ids.indexOf(activeGroup);
    const next = event.key === nextKey
      ? ids[(index + 1) % ids.length]
      : ids[(index - 1 + ids.length) % ids.length];
    show(next);
    tabs.get(next)?.focus();
  });

  show(activeGroup);

  return {
    rail,
    content,
    rows,
    tabs,
    panels,
    show,
    sync,
    get activeGroup() {
      return activeGroup;
    },
    get sponsorAccordion() {
      return sponsorAccordion;
    }
  };
}

export default createSettingsTree;
