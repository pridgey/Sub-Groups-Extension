// Background service worker for managing sub-groups

/**
 * Build a tree structure of tabs grouped by their tab groups
 */
const buildTabsTree = async () => {
  const allGroups = await chrome.tabGroups.query({});
  console.log("DEBUG All Tab Groups:", allGroups);
  const allTabs = await chrome.tabs.query({});
  console.log("DEBUG All Tabs:", allTabs);

  const tabsByGroup = Array.from(allTabs).reduce((collection, tab, index) => {
    // Discard ungrouped tabs
    if (tab.groupId === -1) return collection;

    // Find the group name
    const tabGroup = allGroups.find(g => g.id === tab.groupId);

    if (!tabGroup) return collection; // Tab group not found (should not happen)

    // Determine if group is a sub-group
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

  console.log("DEBUG Tabs by Group:", tabsByGroup);
  return tabsByGroup;
};

// Listen for group collapse/expand events to update the tree
chrome.tabGroups.onUpdated.addListener(async (tabGroup) => {
  console.log("DEBUG Tab group updated", tabGroup);
  const tabGroups = await buildTabsTree();

  const isParentGroup = tabGroups?.find(g => g.groupId === tabGroup.id);
  if (isParentGroup) {
    console.log("DEBUG Parent group updated");
  } else {
    console.log("DEBUG Sub-group updated");
  }
});