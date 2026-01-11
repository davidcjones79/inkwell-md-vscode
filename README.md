# Inkwell Markdown Preview

A beautiful, refined markdown preview for VS Code with elegant typography.

![Inkwell Preview](https://raw.githubusercontent.com/davidcjones79/inkwell-md-vscode/main/media/screenshot.png)

## Features

- 📖 **Elegant Typography** - Source Serif 4 for body text, JetBrains Mono for code
- 🎨 **Dark & Light Themes** - Automatically matches your system preference
- ⚡ **Live Preview** - Updates as you type
- 🖼️ **Beautiful Styling** - Tables, code blocks, blockquotes, and more

## Usage

1. Open a Markdown file (`.md`)
2. Press `Ctrl+Shift+V` (or `Cmd+Shift+V` on Mac)
3. Or use the command palette: "Inkwell: Open Preview to Side"

## Commands

| Command | Keybinding | Description |
|---------|------------|-------------|
| `Inkwell: Open Preview` | - | Open preview in current column |
| `Inkwell: Open Preview to Side` | `Ctrl+Shift+V` | Open preview to the side |

## Installation

### From VSIX

1. Download the `.vsix` file
2. In VS Code, go to Extensions (Ctrl+Shift+X)
3. Click the `...` menu → "Install from VSIX..."
4. Select the downloaded file

### From Source

```bash
git clone https://github.com/davidcjones79/inkwell-md-vscode
cd inkwell-md-vscode
npm install
npm run compile
```

Then press F5 in VS Code to launch the Extension Development Host.

## License

MIT
