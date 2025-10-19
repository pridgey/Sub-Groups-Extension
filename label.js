// Script for the sub-group label page

console.log('Label page loaded');

// Get the sub-group info from the URL params
const params = new URLSearchParams(window.location.search);
const subGroupName = params.get('name') || 'Sub-Group';
const collapsed = params.get('collapsed') === 'true';
const tabCount = params.get('count') || '0';

// Update the page content
document.title = `${collapsed ? '📁' : '📂'} ${subGroupName}`;
document.getElementById('icon').textContent = collapsed ? '📁' : '📂';
document.getElementById('title').textContent = subGroupName;
document.getElementById('subtitle').textContent = collapsed ? 'Collapsed' : 'Expanded';
document.getElementById('count').textContent = `${tabCount} tabs`;

// Set the background color based on state
document.body.className = collapsed ? 'collapsed' : 'expanded';

// Handle clicks
document.body.addEventListener('click', () => {
  console.log('Label clicked! Sending message to background...');
  
  chrome.runtime.sendMessage({ action: 'toggleSubGroup' }, (response) => {
    console.log('Toggle response:', response);
    if (chrome.runtime.lastError) {
      console.error('Error:', chrome.runtime.lastError);
    }
  });
});

console.log('Label page initialized:', { subGroupName, collapsed, tabCount });