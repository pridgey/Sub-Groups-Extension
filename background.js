// Background service worker for managing sub-groups

/**
 * Build a tree structure of tabs grouped by their tab groups
 */
const buildTabsTree = async () => {
  const allGroups = await chrome.tabGroups.query({});
  const allTabs = await chrome.tabs.query({});

  const tabsByGroup = Array.from(allTabs).reduce((collection, tab, index) => {
    // Discard ungrouped tabs
    if (tab.groupId === -1) return collection;

    // Find the group name
    const tabGroup = allGroups.find((g) => g.id === tab.groupId);

    if (!tabGroup) return collection; // Tab group not found (should not happen)

    // Determine if group is a sub-group
    const subGroups = collection.flatMap((group) => group.subGroups || []);
    // If tab belongs to an existing sub-group, skip adding as a parent group
    if (subGroups.some((sg) => sg.groupId === tabGroup.id)) {
      return collection;
    }
    // Determine parent group based on previous tab's group color
    let parentGroup;
    const previousTab = allTabs[index - 1];
    if (previousTab?.groupId !== -1 && previousTab?.groupId !== tab.groupId) {
      // Previous tab has a group
      const previousTabGroup = allGroups.find(
        (g) => g.id === previousTab.groupId
      );
      if (previousTabGroup.color === tabGroup.color) {
        // Same color as previous group, consider as sub-group
        parentGroup = previousTabGroup;
      }
    }

    if (parentGroup) {
      // Add this group as a sub-group of the parent
      collection.at(-1).subGroups.push({
        groupId: tabGroup.id,
        title: tabGroup.title,
        tabs: allTabs.filter((t) => t.groupId === tabGroup.id),
        collapsed: tabGroup.collapsed || false,
        color: tabGroup.color,
      });
    } else {
      // This is not a sub-group make a new top level group
      if (!collection.find((g) => g.groupId === tabGroup.id)) {
        collection.push({
          groupId: tabGroup.id,
          title: tabGroup.title,
          tabs: allTabs.filter((t) => t.groupId === tabGroup.id),
          subGroups: [],
          collapsed: tabGroup.collapsed || false,
          color: tabGroup.color,
        });
      }
    }

    return collection;
  }, []);

  return tabsByGroup;
};

/**
 * Write the current tabs tree to storage
 */
const writeToStorage = async () => {
  const tabTree = await buildTabsTree();

  await chrome.storage.local.set({ tabTree });
};

/**
 * Retrieves the current tab tree from storage
 */
const readFromStorage = async () => {
  const result = await chrome.storage.local.get("tabTree");
  return result.tabTree;
};

/**
 * Collapses a parent tab group and moves all sub-group tabs into the parking lot
 */
const collapseParentGroup = async (tabGroupId) => {
  const tabGroups = await readFromStorage();

  const tabGroupData = tabGroups.find((g) => g.groupId === tabGroupId);
  if (!tabGroupData || tabGroupData.subGroups?.length === 0) return;

  console.log("Debug - Collapsing parent group", { tabGroupData });

  const subGroupTabIds = tabGroupData.subGroups.flatMap((sg) =>
    sg.tabs.map((t) => t.id)
  );

  const newGroupId = await chrome.tabs.group({
    tabIds: subGroupTabIds ?? [],
  });

  await chrome.tabGroups.update(newGroupId, {
    color: "grey",
    collapsed: true,
  });
  await chrome.tabGroups.move(newGroupId, { index: 0 });
};

// Listen for it a tab group is moved
chrome.tabGroups.onMoved.addListener(async (tabGroup) => {
  console.log("DEBUG - Tab group moved", { tabGroup });
  // On any tab group move, rebuild the tree
  await writeToStorage();
});

/**
 * Listen for group collapse/expand events to update the tree or run actions
 */
chrome.tabGroups.onUpdated.addListener(async (tabGroup) => {
  const tabGroups = await readFromStorage();
  const isNewGroup =
    !tabGroups?.find((g) => g.groupId === tabGroup.id) &&
    !tabGroups
      .flatMap((g) => g.subGroups)
      .find((sg) => sg.groupId === tabGroup.id);

  // New Tab was created, update storage (deleting groups is handled by tab updates)
  if (isNewGroup) {
    console.log("DEBUG New group detected, rebuilding tree", { tabGroup });
    await writeToStorage();
    return;
  }

  // Determine if this is a parent group
  const isParentGroup = tabGroups?.find((g) => g.groupId === tabGroup.id);

  // If color has changed, rebuild the tree
  const previousColorState = isParentGroup
    ? tabGroups?.find((g) => g.groupId === tabGroup.id)?.color
    : tabGroups
        .flatMap((g) => g.subGroups)
        .find((sg) => sg.groupId === tabGroup.id)?.color;
  if (previousColorState !== tabGroup.color) {
    console.log("DEBUG - Tab group color changed, rebuilding tree", {
      tabGroup,
      color: tabGroup.color,
      previousColorState,
    });
    await writeToStorage();
    return;
  }

  // If this is a sub-group, no further action needed
  if (!isParentGroup) {
    console.log("DEBUG - Sub-group updated, no action taken", {
      tabGroup,
    });
    return;
  }

  // This is an existing group, determine if expand/collapse state has changed
  const previousState = isParentGroup
    ? tabGroups?.find((g) => g.groupId === tabGroup.id)?.collapsed
    : tabGroups
        .find((g) => g.subGroups.some((sg) => sg.groupId === tabGroup.id))
        ?.subGroups.find((sg) => sg.groupId === tabGroup.id)?.collapsed;
  const hasExpandedOrCollapsed = previousState !== tabGroup.collapsed;

  if (!hasExpandedOrCollapsed) {
    console.log("DEBUG - No expand/collapse change detected", { tabGroup });
    return;
  }

  // Run actions for parent collapse or expand
  if (tabGroup.collapsed) {
    // Parent group was collapsed
    console.log("Debug - Parent group collapsed - Run collapse actions", {
      tabGroup,
    });
    await collapseParentGroup(tabGroup.id);
  } else {
    // Parent group was expanded
    console.log("Debug - Parent group expanded - Run expand actions", {
      tabGroup,
    });
  }
});

// Listen for tab updates to rebuild the tree
chrome.tabs.onUpdated.addListener(async () => {
  // On any tab update, rebuild the tree
  await writeToStorage();
  const currentTabTree = await readFromStorage();
  console.log("DEBUG - Tab Updated", { currentTabTree });
});

writeToStorage();
