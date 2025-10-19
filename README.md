# Chrome Tab Sub-Groups Extension

A Chrome extension that adds collapsible sub-groups to your tab groups using interactive label tabs.

## Features

- 🎯 Create sub-group labels within existing tab groups
- 📂 Click label tabs to expand/collapse sub-groups
- 🎨 Visual feedback with color changes and icons
- 💾 Persistent state across browser restarts
- 🔍 Hidden tabs when collapsed (using Chrome's tab hiding API)

## Installation

1. **Download the files** - Save all the files to a folder:
   - `manifest.json`
   - `background.js`
   - `content.js`
   - `popup.html`
   - `popup.js`

2. **Create placeholder icons** - You need three icon files (or use the same 128px icon for all):
   - `icon16.png` (16x16 pixels)
   - `icon48.png` (48x48 pixels)
   - `icon128.png` (128x128 pixels)
   
   You can create simple icons or download placeholder icons from any icon site.

3. **Load the extension in Chrome**:
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top-right corner)
   - Click "Load unpacked"
   - Select the folder containing your extension files
   - The extension should now appear in your extensions list

## Usage

### Creating a Sub-Group

1. **Group your tabs** first using Chrome's native tab grouping (right-click tabs → "Add tab to group")

2. **Navigate to a tab** where you want to insert a sub-group label

3. **Click the extension icon** in your toolbar

4. **Enter a name** for your sub-group (e.g., "Research", "Design", "Development")

5. **Click "Create Sub-Group"** - A new label tab will be created after your current tab

6. **Add tabs to your sub-group** by placing them after the label tab (but before the next label or end of group)

### Collapsing/Expanding Sub-Groups

- Simply **click on the label tab** to toggle between collapsed and expanded states
- When collapsed:
  - Icon changes from 📂 (open) to 📁 (closed)
  - Background color changes from green to purple
  - All tabs after the label (until the next label or end of group) are hidden
- When expanded:
  - Icon changes back to 📂
  - All hidden tabs become visible again

### Organization Example

```
Main Project Group (Tab Group)
├── Overview tab
├── Notes tab
├── 📂 Research (Sub-group Label) ← Click to collapse/expand
│   ├── Article 1
│   ├── Article 2
│   └── Article 3
├── 📂 Development (Sub-group Label) ← Click to collapse/expand
│   ├── GitHub repo
│   ├── Documentation
│   └── Stack Overflow
└── Summary tab
```

## How It Works

The extension uses several Chrome APIs:

- **Tab Groups API** (`chrome.tabGroups`) - Works with Chrome's native tab groups
- **Tabs API** (`chrome.tabs`) - Creates and manages tabs
  - `chrome.tabs.hide()` - Hides collapsed tabs completely from view
  - `chrome.tabs.show()` - Shows tabs when expanding
- **Storage API** (`chrome.storage.local`) - Persists sub-group state
- **Data URLs** - Creates label tabs with embedded HTML content

## Technical Details

- Label tabs use `data:text/html` URLs with embedded styling and scripts
- Each label tab is tracked by its tab ID
- When you click a label, the extension finds all tabs between that label and the next label/end of group
- Those tabs are hidden/shown using Chrome's official tab hiding API
- State is saved to Chrome's local storage for persistence

## Limitations

- Sub-groups only work within existing Chrome tab groups
- Label tabs are actual tabs (they take up space in your tab bar when expanded)
- If you manually rearrange tabs, you may need to recreate sub-groups
- Hidden tabs still consume memory (they're not unloaded, just hidden)

## Tips

- Use emoji in sub-group names for better visual organization (e.g., "🔬 Research", "💻 Code")
- Keep sub-groups focused and small for best organization
- You can have multiple sub-groups in the same main tab group
- Label tabs can be closed like regular tabs to remove sub-groups

## Troubleshooting

**Sub-group won't collapse:**
- Make sure you're clicking the label tab itself, not tabs within the sub-group
- Check that there are tabs after the label in the same tab group

**Extension not appearing:**
- Make sure Developer Mode is enabled in `chrome://extensions/`
- Check that all files are in the same folder
- Look for error messages in the extension details page

**State not persisting:**
- The extension saves state automatically
- If tabs are moved or closed, sub-group structure may need to be recreated

## Future Enhancements

Possible features to add:
- Drag-and-drop reorganization
- Keyboard shortcuts
- Auto-collapse all sub-groups
- Export/import sub-group configurations
- Custom colors for different sub-groups
- Sub-group templates