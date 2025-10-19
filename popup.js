// Popup script for creating sub-groups

document.getElementById('createBtn').addEventListener('click', async () => {
  const name = document.getElementById('subGroupName').value.trim();
  
  if (!name) {
    alert('Please enter a sub-group name');
    return;
  }
  
  // Get the current active tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  if (!tab) {
    alert('No active tab found');
    return;
  }
  
  // Get the group ID of the current tab
  const groupId = tab.groupId;
  const index = tab.index + 1; // Insert after current tab
  
  // Send message to background script to create sub-group
  chrome.runtime.sendMessage({
    action: 'createSubGroup',
    name: name,
    groupId: groupId,
    index: index
  }, (response) => {
    if (response && response.success) {
      document.getElementById('subGroupName').value = '';
      alert(`Sub-group "${name}" created! Click the label tab to collapse/expand it.`);
      loadSubGroups();
    }
  });
});

// Load and display existing sub-groups
async function loadSubGroups() {
  chrome.runtime.sendMessage({ action: 'getSubGroups' }, async (response) => {
    const container = document.getElementById('subGroupsList');
    
    if (!response || !response.subGroups || response.subGroups.length === 0) {
      container.innerHTML = '';
      return;
    }
    
    // Get all tabs to check if sub-groups still exist
    const allTabs = await chrome.tabs.query({});
    const existingTabIds = new Set(allTabs.map(t => t.id));
    
    const subGroups = response.subGroups.filter(sg => existingTabIds.has(sg.tabId));
    
    if (subGroups.length === 0) {
      container.innerHTML = '';
      return;
    }
    
    container.innerHTML = '<div style="font-weight: 600; font-size: 12px; color: #5f6368; margin-bottom: 8px;">Active Sub-Groups:</div>';
    
    subGroups.forEach(sg => {
      const item = document.createElement('div');
      item.className = 'sub-group-item';
      
      const statusClass = sg.collapsed ? 'status-collapsed' : 'status-expanded';
      const statusText = sg.collapsed ? 'Collapsed' : 'Expanded';
      const icon = sg.collapsed ? '📁' : '📂';
      
      item.innerHTML = `
        <span class="sub-group-name">${icon} ${sg.name}</span>
        <span class="sub-group-status ${statusClass}">${statusText} (${sg.subTabs.length} tabs)</span>
      `;
      
      container.appendChild(item);
    });
  });
}

// Load sub-groups when popup opens
loadSubGroups();

// Allow Enter key to submit
document.getElementById('subGroupName').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    document.getElementById('createBtn').click();
  }
});