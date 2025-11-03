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
    const tabGroup = allGroups.find(g => g.id === tab.groupId);

    if (!tabGroup) return collection; // Tab group not found (should not happen)

    // Determine if group is a sub-group
    // TO-DO: There is a bug here where multiple tabs in a sub-group recreates the group as a parent group
    let parentGroup;
    const previousTab = allTabs[index - 1];
    if (previousTab.groupId !== -1 && previousTab.groupId !== tab.groupId) {
      // Previous tab has a group
      const previousTabGroup = allGroups.find(g => g.id === previousTab.groupId);
      if (previousTabGroup.color === tabGroup.color) {
        // Same color as previous group, consider as sub-group
        parentGroup = previousTabGroup;
      }
    }

    if (parentGroup) {
      // Add this group as a sub-group of the parent
      collection.at(-1).subGroups.push({
        groupdId: tabGroup.id,
        title: tabGroup.title,
        tabs: allTabs.filter(t => t.groupId === tabGroup.id),
        collapsed: tabGroup.collapsed || false
      })
    } else {
      // This is not a sub-group make a new top level group
      if (!collection.find(g => g.groupId === tabGroup.id)) {
        collection.push({
          groupId: tabGroup.id,
          title: tabGroup.title,
          tabs: allTabs.filter(t => t.groupId === tabGroup.id),
          subGroups: [],
          collapsed: tabGroup.collapsed || false
        })
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
}

/**
 * Retrieves the current tab tree from storage
 */
const readFromStorage = async () => {
  const result = await chrome.storage.local.get("tabTree");
  return result.tabTree;
}

// Listen for group collapse/expand events to update the tree
chrome.tabGroups.onUpdated.addListener(async (tabGroup) => {
  const tabGroups = await readFromStorage();
  const isParentGroup = tabGroups?.find(g => g.groupId === tabGroup.id);
  if (isParentGroup) {
    console.log("DEBUG Parent group updated", { tabGroup });
  } else {
    console.log("DEBUG Sub-group updated", { tabGroup });
  }
});

// Listen for tab updates to rebuild the tree
chrome.tabs.onUpdated.addListener(async () => {
  // On any tab update, rebuild the tree
  await writeToStorage();
  const currentTabTree = await readFromStorage();
  console.log("DEBUG Current Tab Tree from Storage:", currentTabTree);
});

writeToStorage();

// If an update was to a group, enact collapse expand
// If not on a group, update the tab tree in storage
