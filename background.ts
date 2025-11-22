// Background service worker for managing sub-groups

// Types
interface TabData {
  id: number;
  index: number;
  groupId: number;
}

type TabColor = chrome.tabGroups.Color;

interface SubGroup {
  groupId: number;
  title: string;
  tabs: TabData[];
  collapsed: boolean;
  color: TabColor;
}

interface TabGroup extends SubGroup {
  subGroups: SubGroup[];
}

interface ParkingLot {
  parkingLotGroupId: number;
  groups: TabGroup[];
}

// Storage helpers
const storage = {
  async getParkingLot(): Promise<ParkingLot> {
    const { parkingLot } = await chrome.storage.local.get("parkingLot");
    return (parkingLot ?? { parkingLotGroupId: -1, groups: [] }) as ParkingLot;
  },

  async setParkingLot(parkingLot: ParkingLot): Promise<void> {
    await chrome.storage.local.set({ parkingLot });
  },

  async getTabTree(): Promise<TabGroup[]> {
    const { tabTree } = await chrome.storage.local.get("tabTree");
    return (tabTree ?? []) as TabGroup[];
  },

  async setTabTree(tabTree: TabGroup[]): Promise<void> {
    await chrome.storage.local.set({ tabTree });
  },
};

// Build a tree structure of tabs grouped by their tab groups
async function buildTabsTree(): Promise<TabGroup[]> {
  const parkingLot = await storage.getParkingLot();
  const allGroups = (await chrome.tabGroups.query({})).filter(
    (g) => g.id !== parkingLot.parkingLotGroupId
  );
  const allTabs = await chrome.tabs.query({});

  const groupMap = new Map(allGroups.map((g) => [g.id, g]));
  const subGroupIds = new Set<number>();
  const result: TabGroup[] = [];

  for (let i = 0; i < allTabs.length; i++) {
    const tab = allTabs[i];

    // Skip ungrouped tabs and parking lot tabs
    if (tab.groupId === -1 || tab.groupId === parkingLot.parkingLotGroupId)
      continue;

    const tabGroup = groupMap.get(tab.groupId);
    if (!tabGroup || subGroupIds.has(tabGroup.id)) continue;

    // Check if already processed as parent
    if (result.some((g) => g.groupId === tabGroup.id)) continue;

    // Determine if this is a sub-group based on previous tab's group color
    const prevTab = allTabs[i - 1];
    const prevGroup =
      prevTab?.groupId !== -1 && prevTab?.groupId !== tab.groupId
        ? groupMap.get(prevTab.groupId)
        : null;

    if (prevGroup?.color === tabGroup.color && result.length > 0) {
      // Add as sub-group to the last parent
      subGroupIds.add(tabGroup.id);
      result.at(-1)!.subGroups.push({
        groupId: tabGroup.id,
        title: tabGroup.title ?? "",
        tabs: allTabs.filter((t) => t.groupId === tabGroup.id) as TabData[],
        collapsed: tabGroup.collapsed,
        color: tabGroup.color as TabColor,
      });
    } else {
      // Add as new parent group
      result.push({
        groupId: tabGroup.id,
        title: tabGroup.title ?? "",
        tabs: allTabs.filter((t) => t.groupId === tabGroup.id) as TabData[],
        subGroups: [],
        collapsed: tabGroup.collapsed,
        color: tabGroup.color as TabColor,
      });
    }
  }

  return result;
}

async function updateTabTree(): Promise<void> {
  await storage.setTabTree(await buildTabsTree());
}

// Collapse parent group: move sub-group tabs to parking lot
async function collapseParentGroup(tabGroupId: number): Promise<void> {
  const tabGroups = await storage.getTabTree();
  const tabGroupData = tabGroups.find((g) => g.groupId === tabGroupId);

  if (!tabGroupData?.subGroups?.length) return;

  const subGroupTabIds = tabGroupData.subGroups.flatMap((sg) =>
    sg.tabs.map((t) => t.id)
  );
  if (!subGroupTabIds.length) return;

  let parkingLot = await storage.getParkingLot();

  if (subGroupTabIds.length === 0) {
    console.error("No tab IDs to group.");
    return;
  }

  if (parkingLot.parkingLotGroupId !== -1) {
    // Parking lot exists...
    // Move tabs to existing parking lot
    await chrome.tabs.group({
      groupId: parkingLot.parkingLotGroupId,
      tabIds: subGroupTabIds as [number, ...number[]],
    });

    // Ensure parking lot is collapsed
    await chrome.tabGroups.update(parkingLot.parkingLotGroupId, {
      collapsed: true,
    });
  } else {
    // Create new parking lot
    const newGroupId = await chrome.tabs.group({
      tabIds: subGroupTabIds as [number, ...number[]],
    });
    // Moves to start of tab strip
    await chrome.tabGroups.move(newGroupId, { index: 0 });
    // Style as parking lot
    await chrome.tabGroups.update(newGroupId, {
      color: "grey",
      collapsed: true,
    });
    parkingLot.parkingLotGroupId = newGroupId;
  }

  // Add group to parking lot if not already there
  if (!parkingLot.groups.some((g) => g.groupId === tabGroupId)) {
    parkingLot.groups.push(tabGroupData);
  }

  await storage.setParkingLot(parkingLot);
  await updateTabTree();
}

// Expand parent group: restore sub-group tabs from parking lot
async function expandParentGroup(tabGroupId: number): Promise<void> {
  const parkingLot = await storage.getParkingLot();
  const tabGroupData = parkingLot.groups.find((g) => g.groupId === tabGroupId);

  // No data found for this group
  if (!tabGroupData) return;

  // Restore each sub-group
  for (let i = 0; i < tabGroupData.subGroups.length; i++) {
    const subGroup = tabGroupData.subGroups[i];
    const tabIds = subGroup.tabs.map((t) => t.id);

    // Create new group for sub-group tabs
    const newGroupId = await chrome.tabs.group({
      tabIds: tabIds as [number, ...number[]],
    });
    await chrome.tabGroups.update(newGroupId, {
      title: subGroup.title,
      color: subGroup.color,
      collapsed: subGroup.collapsed,
    });

    // Position after parent or previous sub-group
    const referenceTab =
      i === 0
        ? tabGroupData.tabs.at(-1)
        : tabGroupData.subGroups[i - 1].tabs.at(-1);

    if (referenceTab) {
      const refTabIndex = (await chrome.tabs.get(referenceTab.id)).index;
      await chrome.tabGroups.move(newGroupId, { index: refTabIndex });
    }
  }

  // Clean up parking lot
  const parkingLotTabs = await chrome.tabs.query({
    groupId: parkingLot.parkingLotGroupId,
  });

  if (parkingLotTabs.length === 0) {
    await storage.setParkingLot({ parkingLotGroupId: -1, groups: [] });
  } else {
    await chrome.tabGroups.update(parkingLot.parkingLotGroupId, {
      collapsed: true,
    });
    parkingLot.groups = parkingLot.groups.filter(
      (g) => g.groupId !== tabGroupId
    );
    await storage.setParkingLot(parkingLot);
  }

  await updateTabTree();
}

// Find a group in the tree (either as parent or sub-group)
function findGroupInTree(
  tabGroups: TabGroup[],
  groupId: number
): { group: TabGroup | SubGroup; isParent: boolean } | null {
  const parent = tabGroups.find((g) => g.groupId === groupId);
  if (parent) return { group: parent, isParent: true };

  for (const parent of tabGroups) {
    const subGroup = parent.subGroups.find((sg) => sg.groupId === groupId);
    if (subGroup) return { group: subGroup, isParent: false };
  }
  return null;
}

// Event Listeners
chrome.tabGroups.onMoved.addListener(updateTabTree);

chrome.tabGroups.onUpdated.addListener(async (tabGroup) => {
  const parkingLot = await storage.getParkingLot();

  // Ignore parking lot updates
  if (tabGroup.id === parkingLot.parkingLotGroupId) return;

  const tabGroups = await storage.getTabTree();
  const found = findGroupInTree(tabGroups, tabGroup.id);

  // New group - rebuild tree
  if (!found) {
    await updateTabTree();
    return;
  }

  // Color changed - rebuild tree
  if (found.group.color !== tabGroup.color) {
    await updateTabTree();
    return;
  }

  // Sub-groups don't trigger expand/collapse actions
  if (!found.isParent) return;

  // Check for expand/collapse state change
  if (found.group.collapsed === tabGroup.collapsed) return;

  if (tabGroup.collapsed) {
    await collapseParentGroup(tabGroup.id);
  } else {
    await expandParentGroup(tabGroup.id);
  }
});

chrome.tabs.onUpdated.addListener(async () => {
  const parkingLot = await storage.getParkingLot();

  // Check if parking lot group was deleted
  if (parkingLot.parkingLotGroupId !== -1) {
    const exists = await chrome.tabGroups
      .get(parkingLot.parkingLotGroupId)
      .catch(() => null);
    if (!exists) {
      await storage.setParkingLot({ parkingLotGroupId: -1, groups: [] });
    }
  }

  await updateTabTree();
});

// Initialize on extension load
(async () => {
  await storage.setParkingLot({ parkingLotGroupId: -1, groups: [] });
  await updateTabTree();
})();
