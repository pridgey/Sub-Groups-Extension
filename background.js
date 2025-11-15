// Background service worker for managing sub-groups

/**
 * Build a tree structure of tabs grouped by their tab groups
 */
const buildTabsTree = async () => {
  const parkingLot = await readParkingLot();
  const allGroups = await chrome.tabGroups
    .query({})
    .then((groups) =>
      groups.filter((g) => g.id !== parkingLot.parkingLotGroupId)
    );
  const allTabs = await chrome.tabs.query({});

  console.log("DEBUG - Building tabs tree", { allGroups, allTabs, parkingLot });

  const tabsByGroup = Array.from(allTabs).reduce((collection, tab, index) => {
    // Discard ungrouped tabs
    if (tab.groupId === -1) return collection;
    // Discard tabs in the parking lot group
    if (tab.groupId === parkingLot.parkingLotGroupId) return collection;

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
    if (
      !!previousTab &&
      previousTab?.groupId !== -1 &&
      previousTab?.groupId !== tab.groupId
    ) {
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
 * Creates a parking lot structure in storage
 */
const createParkingLot = async (parkingLotGroupId) => {
  const parkingLot = {
    parkingLotGroupId,
    groups: [],
  };

  await chrome.storage.local.set({ parkingLot });
};

/**
 * Retrieves the current tabGroups being stored in the parking lot
 */
const readParkingLot = async () => {
  const result = await chrome.storage.local.get("parkingLot");

  if (!result.parkingLot) {
    console.log("DEBUG - No parking lot found in storage");
    const newParkingLot = await createParkingLot(-1);
    return newParkingLot;
  }

  return result.parkingLot;
};

/**
 * Adds a tab group to the parking lot storage
 */
const addToParkingLot = async (tabGroupId, parkingLotGroupId) => {
  const tabGroups = await readFromStorage();
  const parkingLot = await readParkingLot();

  const tabGroupData = tabGroups.find((g) => g.groupId === tabGroupId);
  if (!tabGroupData) return;

  if (parkingLot.groups.find((g) => g.groupId === tabGroupId)) {
    console.log("DEBUG - Tab group already in parking lot", {
      tabGroupData,
      parkingLot,
    });
    return;
  }

  parkingLot.groups.push(tabGroupData);
  parkingLot.parkingLotGroupId = parkingLotGroupId;

  await chrome.storage.local.set({ parkingLot });
};

/**
 * Removes a tab group from the parking lot storage
 */
const removeFromParkingLot = async (tabGroupId) => {
  const parkingLot = await readParkingLot();

  parkingLot.groups = parkingLot.groups.filter((g) => g.groupId !== tabGroupId);

  await chrome.storage.local.set({ parkingLot });
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

  // Get all tabs from sub-groups
  const subGroupTabIds = tabGroupData.subGroups.flatMap((sg) =>
    sg.tabs.map((t) => t.id)
  );

  // Check if parking lot exists
  const parkingLot = await readParkingLot();

  if (parkingLot.parkingLotGroupId !== -1) {
    console.log("DEBUG - Parking lot exists, moving tabs there", {
      parkingLot,
      tabGroupId,
    });
    // Parking lot exists, just move tabs there
    await chrome.tabs.group({
      groupId: parkingLot.parkingLotGroupId,
      tabIds: subGroupTabIds ?? [],
    });

    // Ensure parking lot stays collapsed
    await chrome.tabGroups.update(parkingLot.parkingLotGroupId, {
      collapsed: true,
    });

    // Update the parking lot
    await addToParkingLot(tabGroupId, parkingLot.parkingLotGroupId);
  } else {
    console.log("DEBUG - No parking lot, creating one", { tabGroupId });
    // No parking lot, create one by moving sub-group tabs into a new group
    const newGroupId = await chrome.tabs.group({
      tabIds: subGroupTabIds ?? [],
    });

    // Move the new parking lot group to the front
    await chrome.tabGroups.move(newGroupId, { index: 0 });

    // Update the parking lot group color and collapsed state
    await chrome.tabGroups.update(newGroupId, {
      color: "grey",
      collapsed: true,
    });

    // Write the tab group data to the parking lot, for retrieval later
    await addToParkingLot(tabGroupId, newGroupId);
  }

  // Update the tab tree storage
  await writeToStorage();
};

const expandParentGroup = async (tabGroupId) => {
  const parkingLot = await readParkingLot();

  const tabGroupData = parkingLot.groups.find((g) => g.groupId === tabGroupId);
  if (!tabGroupData) return;

  console.log("Debug - Expanding parent group", { tabGroupData, parkingLot });

  // For each sub-group, move its tabs back to their original group
  let subGroupIndex = 0;
  for (const subGroup of tabGroupData.subGroups) {
    const tabIds = subGroup.tabs.map((t) => t.id);
    // Create a new group for the sub-group tabs
    const newGroup = await chrome.tabs.group({
      tabIds,
    });
    // Update the new group to match the original sub-group properties
    await chrome.tabGroups.update(newGroup, {
      title: subGroup.title,
      color: subGroup.color,
      collapsed: subGroup.collapsed,
    });
    // Move the new group to the correct position
    let newMovePosition = -1;
    if (subGroupIndex === 0) {
      // This is the first sub-group and should use the parent's last tab index
      const parentLastTabId = tabGroupData.tabs.at(-1).id;
      const parentLastTabIndex = await chrome.tabs
        .get(parentLastTabId)
        .then((t) => t.index);
      newMovePosition = parentLastTabIndex;
    } else {
      // For subsequent sub-groups, position after the previous sub-group
      const previousSubGroup = tabGroupData.subGroups[subGroupIndex - 1];
      const previousSubGroupLastTabId = previousSubGroup.tabs.at(-1).id;
      const previousSubGroupLastTabIndex = await chrome.tabs
        .get(previousSubGroupLastTabId)
        .then((t) => t.index);
      newMovePosition = previousSubGroupLastTabIndex;
    }

    console.log("DEBUG - Moving new sub-group to index", {
      subGroupIndex,
      newGroup,
      newMovePosition,
      parkingLot,
    });
    await chrome.tabGroups.move(newGroup, {
      index: newMovePosition,
    });
    subGroupIndex += 1;
  }

  // Optionally, remove the parking lot group if empty
  const parkingLotTabs = await chrome.tabs.query({
    groupId: parkingLot.parkingLotGroupId,
  });
  if (parkingLotTabs.length === 0) {
    console.log("DEBUG - Parking lot empty, removing parking lot group", {
      parkingLot,
      parkingLotTabs,
    });
    // The group is removed when the last tab is ungrouped
    await createParkingLot(-1); // Reset parking lot
  } else {
    // Ensure parking lot stays collapsed
    await chrome.tabGroups.update(parkingLot.parkingLotGroupId, {
      collapsed: true,
    });
    // Remove this group from the parking lot storage
    await removeFromParkingLot(tabGroupId);
  }

  // Update the tab tree storage
  await writeToStorage();
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

  // If parking lot tab, ignore
  const parkingLot = await readParkingLot();
  if (tabGroup.id === parkingLot.parkingLotGroupId) {
    console.log("DEBUG - Parking lot group updated, no action taken", {
      tabGroup,
    });
    return;
  }

  // Determine if this is a new group
  const isNewGroup =
    !tabGroups?.find((g) => g.groupId === tabGroup.id) &&
    !tabGroups
      .flatMap((g) => g.subGroups)
      .find((sg) => sg.groupId === tabGroup.id);

  // New Tab was created, update storage (deleting groups is handled by tab updates)
  if (isNewGroup) {
    console.log("DEBUG New group detected, rebuilding tree", {
      tabGroup,
      parkingLot,
      tabGroups,
    });
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
    await expandParentGroup(tabGroup.id);
  }
});

// Listen for tab updates to rebuild the tree
chrome.tabs.onUpdated.addListener(async () => {
  // Detect if parking lot was affected
  const parkingLot = await readParkingLot();
  if (parkingLot.parkingLotGroupId !== -1) {
    const parkingLotGroup = await chrome.tabGroups
      .get(parkingLot.parkingLotGroupId)
      .catch(() => null);

    if (!parkingLotGroup) {
      // Parking lot group was deleted, reset parking lot
      console.log("DEBUG - Parking lot group deleted, resetting parking lot");
      await createParkingLot(-1);
    }
  }

  // On any tab update, rebuild the tree
  await writeToStorage();
  const currentTabTree = await readFromStorage();
  console.log("DEBUG - Tab Updated", { currentTabTree });
});

// Initialize storage on extension load
writeToStorage();
createParkingLot(-1);
