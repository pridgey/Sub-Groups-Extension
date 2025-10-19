// Content script that runs on sub-group label pages
console.log('Content script loaded on:', window.location.href);

// Check if this is a sub-group label page
function isSubGroupLabel() {
  const isLabel = document.body && document.body.hasAttribute('data-subgroup-label');
  console.log('Is sub-group label?', isLabel);
  return isLabel;
}

// Initialize the click handler
function initSubGroupLabel() {
  console.log('Initializing sub-group label...');
  
  if (isSubGroupLabel()) {
    console.log('Setting up click handler');
    
    // Add click handler to the entire body
    document.body.addEventListener('click', (e) => {
      console.log('Label clicked!', e.target);
      
      chrome.runtime.sendMessage({ action: 'toggleSubGroup' }, (response) => {
        console.log('Toggle response:', response);
      });
    });
    
    // Visual feedback
    document.body.style.transition = 'opacity 0.1s';
    document.body.addEventListener('mousedown', () => {
      document.body.style.opacity = '0.8';
    });
    document.body.addEventListener('mouseup', () => {
      document.body.style.opacity = '1';
    });
    
    console.log('Click handler installed successfully');
  }
}

// Multiple initialization strategies
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSubGroupLabel);
} else {
  initSubGroupLabel();
}

// Fallback: wait for body
setTimeout(() => {
  if (document.body && !document.body.dataset.initialized) {
    document.body.dataset.initialized = 'true';
    initSubGroupLabel();
  }
}, 100);