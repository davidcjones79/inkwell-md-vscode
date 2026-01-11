import * as vscode from 'vscode';
import { marked } from 'marked';
import hljs from 'highlight.js/lib/core';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import python from 'highlight.js/lib/languages/python';
import json from 'highlight.js/lib/languages/json';
import bash from 'highlight.js/lib/languages/bash';
import css from 'highlight.js/lib/languages/css';
import html from 'highlight.js/lib/languages/xml';
import markdown from 'highlight.js/lib/languages/markdown';
import sql from 'highlight.js/lib/languages/sql';
import yaml from 'highlight.js/lib/languages/yaml';
import go from 'highlight.js/lib/languages/go';
import rust from 'highlight.js/lib/languages/rust';
import java from 'highlight.js/lib/languages/java';
import csharp from 'highlight.js/lib/languages/csharp';
import cpp from 'highlight.js/lib/languages/cpp';

// Register languages
hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('js', javascript);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('ts', typescript);
hljs.registerLanguage('python', python);
hljs.registerLanguage('py', python);
hljs.registerLanguage('json', json);
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('sh', bash);
hljs.registerLanguage('shell', bash);
hljs.registerLanguage('css', css);
hljs.registerLanguage('html', html);
hljs.registerLanguage('xml', html);
hljs.registerLanguage('markdown', markdown);
hljs.registerLanguage('md', markdown);
hljs.registerLanguage('sql', sql);
hljs.registerLanguage('yaml', yaml);
hljs.registerLanguage('yml', yaml);
hljs.registerLanguage('go', go);
hljs.registerLanguage('rust', rust);
hljs.registerLanguage('rs', rust);
hljs.registerLanguage('java', java);
hljs.registerLanguage('csharp', csharp);
hljs.registerLanguage('cs', csharp);
hljs.registerLanguage('cpp', cpp);
hljs.registerLanguage('c', cpp);
import matter from 'gray-matter';
import * as path from 'path';

let currentPanel: vscode.WebviewPanel | undefined = undefined;
let statusBarItem: vscode.StatusBarItem;
let currentDocument: vscode.TextDocument | undefined;

// Custom renderer for marked
const renderer = new marked.Renderer();

// Handle code blocks - check for mermaid and ASCII tables
renderer.code = function(code: string, language: string | undefined): string {
    // Mermaid diagrams
    if (language === 'mermaid') {
        return `<div class="mermaid">${escapeHtml(code)}</div>`;
    }
    
    // ASCII flowcharts - convert to Mermaid
    if (language === 'flow' || language === 'flowchart' || language === 'asciiflow' || language === 'ascii-flow') {
        const mermaid = convertAsciiFlowchart(code);
        if (mermaid) {
            return `<div class="mermaid">${escapeHtml(mermaid)}</div>`;
        }
        // Fallback to code block if conversion fails
        return `<pre><code>${escapeHtml(code)}</code></pre>`;
    }
    
    // ASCII art tables (detect and convert)
    if (language === 'table' || language === 'ascii-table') {
        return convertAsciiTable(code);
    }
    
    // Regular code with syntax highlighting
    if (language && hljs.getLanguage(language)) {
        try {
            const highlighted = hljs.highlight(code, { language }).value;
            return `<pre><code class="hljs language-${language}">${highlighted}</code></pre>`;
        } catch (e) {}
    }
    
    // Auto-detect language
    try {
        const highlighted = hljs.highlightAuto(code).value;
        return `<pre><code class="hljs">${highlighted}</code></pre>`;
    } catch (e) {
        return `<pre><code>${escapeHtml(code)}</code></pre>`;
    }
};

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Convert ASCII table to HTML table
function convertAsciiTable(ascii: string): string {
    const lines = ascii.trim().split('\n');
    
    // Detect table format
    // Format 1: +---+---+ style
    // Format 2: |---|---| style (markdown)
    // Format 3: Plain pipe-separated
    
    const rows: string[][] = [];
    let isHeader = true;
    let headerRowIndex = -1;
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        
        // Skip separator lines
        if (/^[+\-=|:\s]+$/.test(line) && !line.includes(' ')) {
            // Check if this is after the header
            if (rows.length === 1) {
                headerRowIndex = 0;
            }
            continue;
        }
        
        // Skip empty lines
        if (!line) continue;
        
        // Parse cells
        let cells: string[];
        if (line.startsWith('|')) {
            // Pipe-delimited
            cells = line.split('|')
                .slice(1, -1) // Remove first and last empty elements
                .map(c => c.trim());
        } else if (line.includes('|')) {
            cells = line.split('|').map(c => c.trim());
        } else if (line.includes('\t')) {
            cells = line.split('\t').map(c => c.trim());
        } else {
            // Try to split by multiple spaces
            cells = line.split(/\s{2,}/).map(c => c.trim());
        }
        
        if (cells.length > 0 && cells.some(c => c.length > 0)) {
            rows.push(cells);
        }
    }
    
    if (rows.length === 0) {
        return `<pre><code>${escapeHtml(ascii)}</code></pre>`;
    }
    
    // Build HTML table
    let html = '<table class="ascii-table">';
    
    rows.forEach((row, i) => {
        if (i === headerRowIndex || (headerRowIndex === -1 && i === 0)) {
            html += '<thead><tr>';
            row.forEach(cell => {
                html += `<th>${escapeHtml(cell)}</th>`;
            });
            html += '</tr></thead><tbody>';
        } else {
            html += '<tr>';
            row.forEach(cell => {
                html += `<td>${escapeHtml(cell)}</td>`;
            });
            html += '</tr>';
        }
    });
    
    html += '</tbody></table>';
    return html;
}

// Also detect ASCII tables in regular text (not in code blocks)
// Convert ASCII flowchart to Mermaid
function convertAsciiFlowchart(ascii: string): string {
    const lines = ascii.split('\n');
    const nodes: Map<string, {id: string, label: string, type: 'box' | 'diamond' | 'rounded'}> = new Map();
    const connections: Array<{from: string, to: string, label?: string}> = [];
    
    let nodeId = 0;
    const getNodeId = () => `N${nodeId++}`;
    
    // Find all boxes: [text], (text), {text}
    // Note: Using simpler patterns to avoid regex issues
    
    // Track positions of nodes
    const nodePositions: Map<string, {row: number, col: number}> = new Map();
    
    // First pass: find all nodes
    lines.forEach((line, rowIdx) => {
        // Look for box patterns: [text]
        let match;
        const boxRegex = /\[([^\]]+)\]/g;
        while ((match = boxRegex.exec(line)) !== null) {
            const label = match[1].trim();
            const id = getNodeId();
            nodes.set(label, {id, label, type: 'box'});
            nodePositions.set(label, {row: rowIdx, col: match.index});
        }
        
        // Look for rounded boxes: (text)
        const roundedRegex = /\(([^)]+)\)/g;
        while ((match = roundedRegex.exec(line)) !== null) {
            const label = match[1].trim();
            if (!nodes.has(label)) {
                const id = getNodeId();
                nodes.set(label, {id, label, type: 'rounded'});
                nodePositions.set(label, {row: rowIdx, col: match.index});
            }
        }
        
        // Look for diamonds: {text}
        const diamondRegex = /\{([^}]+)\}/g;
        while ((match = diamondRegex.exec(line)) !== null) {
            const label = match[1].trim();
            if (!nodes.has(label)) {
                const id = getNodeId();
                nodes.set(label, {id, label, type: 'diamond'});
                nodePositions.set(label, {row: rowIdx, col: match.index});
            }
        }
    });
    
    // Second pass: find connections (arrows)
    // Look for: -->, --->, --, |, v, V, ^, arrows between nodes
    const fullText = lines.join('\n');
    
    // Simple arrow patterns: [A] --> [B] or [A] -> [B]
    const arrowPattern = /\[([^\]]+)\]\s*[-=]+>\s*\[([^\]]+)\]/g;
    let arrowMatch;
    while ((arrowMatch = arrowPattern.exec(fullText)) !== null) {
        const from = arrowMatch[1].trim();
        const to = arrowMatch[2].trim();
        if (nodes.has(from) && nodes.has(to)) {
            connections.push({from, to});
        }
    }
    
    // Also check for vertical connections (| or v below a node)
    for (let i = 0; i < lines.length - 1; i++) {
        const line = lines[i];
        const nextLines = lines.slice(i + 1, i + 4).join('\n');
        
        // Find nodes on this line and check for vertical arrows below
        nodes.forEach((node, label) => {
            const pos = nodePositions.get(label);
            if (pos && pos.row === i) {
                // Check for | or v below this position
                for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
                    const belowLine = lines[j];
                    // Look for another node roughly below
                    nodes.forEach((targetNode, targetLabel) => {
                        const targetPos = nodePositions.get(targetLabel);
                        if (targetPos && targetPos.row === j && 
                            Math.abs(targetPos.col - pos.col) < 10 &&
                            label !== targetLabel) {
                            // Check if there's a | or v between them
                            let hasConnection = false;
                            for (let k = i + 1; k < j; k++) {
                                if (lines[k].includes('|') || lines[k].includes('v') || lines[k].includes('V')) {
                                    hasConnection = true;
                                    break;
                                }
                            }
                            if (hasConnection && !connections.some(c => c.from === label && c.to === targetLabel)) {
                                connections.push({from: label, to: targetLabel});
                            }
                        }
                    });
                }
            }
        });
    }
    
    // If we found nodes and connections, generate Mermaid
    if (nodes.size > 0 && connections.length > 0) {
        let mermaid = 'graph TD\n';
        
        // Define nodes
        nodes.forEach((node, label) => {
            switch (node.type) {
                case 'diamond':
                    mermaid += `    ${node.id}{${node.label}}\n`;
                    break;
                case 'rounded':
                    mermaid += `    ${node.id}(${node.label})\n`;
                    break;
                default:
                    mermaid += `    ${node.id}[${node.label}]\n`;
            }
        });
        
        // Define connections
        connections.forEach(conn => {
            const fromNode = nodes.get(conn.from);
            const toNode = nodes.get(conn.to);
            if (fromNode && toNode) {
                if (conn.label) {
                    mermaid += `    ${fromNode.id} -->|${conn.label}| ${toNode.id}\n`;
                } else {
                    mermaid += `    ${fromNode.id} --> ${toNode.id}\n`;
                }
            }
        });
        
        return mermaid;
    }
    
    // Fallback: return original
    return '';
}

function preprocessContent(content: string): string {
    // First pass: Convert ASCII flowcharts in code blocks
    content = content.replace(/```(?:ascii-?flow(?:chart)?|flow)\n([\s\S]*?)```/gi, (match, ascii) => {
        const mermaid = convertAsciiFlowchart(ascii);
        if (mermaid) {
            return '```mermaid\n' + mermaid + '```';
        }
        return match;
    });
    
    // Second pass: Convert ASCII box-style tables
    const lines = content.split('\n');
    const result: string[] = [];
    let inAsciiTable = false;
    let tableLines: string[] = [];
    
    for (const line of lines) {
        const trimmed = line.trim();
        
        // Detect ASCII box table (starts with + and has +---+ pattern)
        const isBoxBorder = /^\+[-=+]+\+$/.test(trimmed);
        
        if (isBoxBorder && !inAsciiTable) {
            inAsciiTable = true;
            tableLines.push(line);
        } else if (inAsciiTable) {
            if (isBoxBorder || /^\|.*\|$/.test(trimmed)) {
                tableLines.push(line);
            } else {
                if (tableLines.length > 2) {
                    result.push('```table');
                    result.push(...tableLines);
                    result.push('```');
                } else {
                    result.push(...tableLines);
                }
                tableLines = [];
                inAsciiTable = false;
                result.push(line);
            }
        } else {
            result.push(line);
        }
    }
    
    if (tableLines.length > 2) {
        result.push('```table');
        result.push(...tableLines);
        result.push('```');
    } else if (tableLines.length > 0) {
        result.push(...tableLines);
    }
    
    return result.join('\n');
}

marked.setOptions({
    renderer: renderer
});

export function activate(context: vscode.ExtensionContext) {
    console.log('Inkwell Markdown Preview is now active');

    // Create status bar item
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.command = 'inkwell.showPreviewToSide';
    context.subscriptions.push(statusBarItem);

    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('inkwell.showPreview', () => {
            showPreview(context, vscode.ViewColumn.Active);
        }),
        vscode.commands.registerCommand('inkwell.showPreviewToSide', () => {
            showPreview(context, vscode.ViewColumn.Beside);
        }),
        vscode.commands.registerCommand('inkwell.exportHTML', () => {
            exportHTML(context);
        }),
        vscode.commands.registerCommand('inkwell.toggleTheme', () => {
            toggleTheme();
        }),
        vscode.commands.registerCommand('inkwell.zoomIn', () => {
            zoom(10);
        }),
        vscode.commands.registerCommand('inkwell.zoomOut', () => {
            zoom(-10);
        }),
        vscode.commands.registerCommand('inkwell.zoomReset', () => {
            zoom(0, true);
        })
    );

    // Update on document changes
    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument((e) => {
            if (currentPanel && e.document.languageId === 'markdown') {
                updatePreview(context, e.document);
                updateStatusBar(e.document);
            }
        })
    );

    // Update on active editor change
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor((editor) => {
            if (editor && editor.document.languageId === 'markdown') {
                updateStatusBar(editor.document);
                if (currentPanel) {
                    updatePreview(context, editor.document);
                }
            } else {
                statusBarItem.hide();
            }
        })
    );

    // Handle scroll sync from editor
    context.subscriptions.push(
        vscode.window.onDidChangeTextEditorVisibleRanges((e) => {
            if (currentPanel && e.textEditor.document.languageId === 'markdown') {
                const visibleRange = e.visibleRanges[0];
                if (visibleRange) {
                    const line = visibleRange.start.line;
                    const totalLines = e.textEditor.document.lineCount;
                    const scrollPercent = line / totalLines;
                    currentPanel.webview.postMessage({
                        type: 'scrollSync',
                        percent: scrollPercent
                    });
                }
            }
        })
    );

    // Initial status bar update
    if (vscode.window.activeTextEditor?.document.languageId === 'markdown') {
        updateStatusBar(vscode.window.activeTextEditor.document);
    }
}

function showPreview(context: vscode.ExtensionContext, viewColumn: vscode.ViewColumn) {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== 'markdown') {
        vscode.window.showWarningMessage('Open a Markdown file to preview');
        return;
    }

    currentDocument = editor.document;

    if (currentPanel) {
        currentPanel.reveal(viewColumn);
        updatePreview(context, editor.document);
        return;
    }

    currentPanel = vscode.window.createWebviewPanel(
        'inkwellPreview',
        'Inkwell Preview',
        viewColumn,
        {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media')],
            retainContextWhenHidden: true
        }
    );

    currentPanel.onDidDispose(() => {
        currentPanel = undefined;
    }, null, context.subscriptions);

    // Handle messages from webview
    currentPanel.webview.onDidReceiveMessage(
        message => {
            switch (message.type) {
                case 'scrollToLine':
                    scrollEditorToLine(message.line);
                    break;
                case 'tocNavigate':
                    scrollEditorToLine(message.line);
                    break;
            }
        },
        undefined,
        context.subscriptions
    );

    currentPanel.webview.html = getWebviewContent(context, currentPanel.webview);
    updatePreview(context, editor.document);
}

function scrollEditorToLine(line: number) {
    const editor = vscode.window.activeTextEditor;
    if (editor && editor.document.languageId === 'markdown') {
        const position = new vscode.Position(line, 0);
        editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.AtTop);
    }
}

function updatePreview(context: vscode.ExtensionContext, document: vscode.TextDocument) {
    if (!currentPanel) return;
    
    currentDocument = document;
    const text = document.getText();
    
    // Parse frontmatter
    let frontmatter: Record<string, any> = {};
    let content = text;
    try {
        const parsed = matter(text);
        frontmatter = parsed.data;
        content = parsed.content;
    } catch (e) {
        // No frontmatter or parse error
    }
    
    // Extract TOC
    const toc = extractTOC(content);
    
    // Preprocess content (convert ASCII tables)
    const processedContent = preprocessContent(content);
    
    // Render markdown
    const html = marked.parse(processedContent) as string;
    
    // Get VS Code theme
    const theme = vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark ? 'dark' : 'light';
    
    currentPanel.webview.postMessage({
        type: 'update',
        content: html,
        title: path.basename(document.fileName).replace(/\.md$/, ''),
        frontmatter,
        toc,
        theme,
        stats: getDocumentStats(text)
    });
}

function extractTOC(content: string): Array<{level: number, text: string, line: number}> {
    const toc: Array<{level: number, text: string, line: number}> = [];
    const lines = content.split('\n');
    
    lines.forEach((line, index) => {
        const match = line.match(/^(#{1,6})\s+(.+)$/);
        if (match) {
            toc.push({
                level: match[1].length,
                text: match[2].replace(/[*_`]/g, ''),
                line: index
            });
        }
    });
    
    return toc;
}

function getDocumentStats(text: string): {words: number, chars: number, readTime: number} {
    const words = text.trim().split(/\s+/).filter(w => w.length > 0).length;
    const chars = text.length;
    const readTime = Math.ceil(words / 200); // ~200 words per minute
    return { words, chars, readTime };
}

function updateStatusBar(document: vscode.TextDocument) {
    const stats = getDocumentStats(document.getText());
    statusBarItem.text = `$(book) ${stats.words} words · ${stats.readTime} min read`;
    statusBarItem.tooltip = `${stats.chars} characters\nClick to open Inkwell Preview`;
    statusBarItem.show();
}

function toggleTheme() {
    if (currentPanel) {
        currentPanel.webview.postMessage({ type: 'toggleTheme' });
    }
}

function zoom(delta: number, reset: boolean = false) {
    if (currentPanel) {
        currentPanel.webview.postMessage({ 
            type: 'zoom', 
            delta,
            reset 
        });
    }
}

async function exportHTML(context: vscode.ExtensionContext) {
    if (!currentDocument) {
        vscode.window.showWarningMessage('Open a Markdown file first');
        return;
    }
    
    const text = currentDocument.getText();
    let content = text;
    let frontmatter: Record<string, any> = {};
    
    try {
        const parsed = matter(text);
        frontmatter = parsed.data;
        content = parsed.content;
    } catch (e) {}
    
    const html = marked.parse(content) as string;
    const title = frontmatter.title || path.basename(currentDocument.fileName).replace(/\.md$/, '');
    
    const fullHTML = getExportHTML(title, html, context);
    
    const uri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(currentDocument.fileName.replace(/\.md$/, '.html')),
        filters: { 'HTML': ['html'] }
    });
    
    if (uri) {
        await vscode.workspace.fs.writeFile(uri, Buffer.from(fullHTML, 'utf8'));
        vscode.window.showInformationMessage(`Exported to ${uri.fsPath}`);
    }
}

function getExportHTML(title: string, content: string, context: vscode.ExtensionContext): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,400;8..60,600;8..60,700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
    <style>
        :root {
            --paper: #1a1816;
            --paper-light: #242120;
            --ink: #f5f3f0;
            --ink-faded: #a8a4a0;
            --accent: #c9a87c;
            --accent-light: #e8d5b5;
        }
        @media (prefers-color-scheme: light) {
            :root {
                --paper: #faf8f5;
                --paper-light: #f0ebe4;
                --ink: #1a1816;
                --ink-faded: #5c5652;
                --accent: #8b6914;
                --accent-light: #6b5010;
            }
        }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Source Serif 4', Georgia, serif;
            font-size: 18px;
            line-height: 1.75;
            color: var(--ink);
            background: var(--paper);
            padding: 3rem;
            max-width: 800px;
            margin: 0 auto;
        }
        h1, h2, h3, h4, h5, h6 { margin-top: 2rem; margin-bottom: 1rem; line-height: 1.3; }
        h1 { font-size: 2.25rem; border-bottom: 2px solid var(--accent); padding-bottom: 0.5rem; }
        h2 { font-size: 1.75rem; color: var(--accent); }
        p { margin-bottom: 1.25rem; }
        a { color: var(--accent); text-decoration: none; }
        code { font-family: 'JetBrains Mono', monospace; background: var(--paper-light); padding: 0.2em 0.4em; border-radius: 4px; font-size: 0.9em; }
        pre { background: var(--paper-light); padding: 1.25rem; border-radius: 8px; overflow-x: auto; margin-bottom: 1.5rem; border-left: 3px solid var(--accent); }
        pre code { background: none; padding: 0; }
        blockquote { margin: 1.5rem 0; padding: 1rem 1.5rem; border-left: 4px solid var(--accent); background: var(--paper-light); font-style: italic; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 1.5rem; }
        th, td { padding: 0.75rem 1rem; text-align: left; border-bottom: 1px solid var(--paper-light); }
        th { background: var(--paper-light); font-weight: 600; text-transform: uppercase; font-size: 0.8rem; }
        ul, ol { margin-bottom: 1.25rem; padding-left: 1.5rem; }
        li { margin-bottom: 0.5rem; }
        hr { border: none; height: 2px; background: linear-gradient(90deg, transparent, var(--accent), transparent); margin: 2rem 0; }
        img { max-width: 100%; height: auto; border-radius: 8px; }
    </style>
</head>
<body>
    ${content}
</body>
</html>`;
}

function getWebviewContent(context: vscode.ExtensionContext, webview: vscode.Webview): string {
    const styleUri = webview.asWebviewUri(
        vscode.Uri.joinPath(context.extensionUri, 'media', 'style.css')
    );

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net; script-src 'unsafe-inline' https://cdn.jsdelivr.net; font-src https://fonts.gstatic.com; img-src * data: ${webview.cspSource};">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,400;8..60,600;8..60,700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
    <link href="${styleUri}" rel="stylesheet">
    <script src="https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js"></script>
    <title>Inkwell Preview</title>
</head>
<body data-theme="dark">
    <div class="toolbar">
        <button id="tocToggle" title="Toggle Outline">☰</button>
        <button id="themeToggle" title="Toggle Theme">◐</button>
        <button id="zoomOut" title="Zoom Out">−</button>
        <span id="zoomLevel">100%</span>
        <button id="zoomIn" title="Zoom In">+</button>
        <button id="exportBtn" title="Export HTML">⤓</button>
    </div>
    
    <aside id="toc" class="toc">
        <div class="toc-header">OUTLINE</div>
        <nav id="tocList"></nav>
    </aside>
    
    <div class="container" id="container">
        <header id="docHeader">
            <div id="frontmatter" class="frontmatter"></div>
            <h1 class="doc-title" id="docTitle">Document</h1>
        </header>
        <main id="preview">
            <p class="empty-state">Open a Markdown file to see the preview</p>
        </main>
        <footer id="stats" class="stats"></footer>
    </div>
    
    <script>
        const vscode = acquireVsCodeApi();
        const preview = document.getElementById('preview');
        const docTitle = document.getElementById('docTitle');
        const frontmatterEl = document.getElementById('frontmatter');
        const tocEl = document.getElementById('toc');
        const tocList = document.getElementById('tocList');
        const statsEl = document.getElementById('stats');
        const zoomLevelEl = document.getElementById('zoomLevel');
        const container = document.getElementById('container');
        const body = document.body;
        
        let currentZoom = 100;
        let tocVisible = false;
        let scrollSyncEnabled = true;
        let currentToc = [];
        
        // Toolbar buttons
        document.getElementById('tocToggle').addEventListener('click', function() {
            tocVisible = !tocVisible;
            tocEl.classList.toggle('visible', tocVisible);
            body.classList.toggle('toc-open', tocVisible);
        });
        
        document.getElementById('themeToggle').addEventListener('click', function() {
            const current = body.getAttribute('data-theme');
            body.setAttribute('data-theme', current === 'dark' ? 'light' : 'dark');
        });
        
        document.getElementById('zoomIn').addEventListener('click', function() {
            currentZoom = Math.min(200, currentZoom + 10);
            updateZoom();
        });
        
        document.getElementById('zoomOut').addEventListener('click', function() {
            currentZoom = Math.max(50, currentZoom - 10);
            updateZoom();
        });
        
        document.getElementById('exportBtn').addEventListener('click', function() {
            vscode.postMessage({ type: 'export' });
        });
        
        function updateZoom() {
            body.style.setProperty('--zoom-factor', currentZoom / 100);
            preview.style.transform = 'scale(' + (currentZoom / 100) + ')';
            preview.style.transformOrigin = 'top left';
            preview.style.width = (100 / (currentZoom / 100)) + '%';
            zoomLevelEl.textContent = currentZoom + '%';
        }
        
        function renderToc() {
            if (!currentToc || currentToc.length === 0) {
                tocList.innerHTML = '<div class="toc-empty">No headings found</div>';
                return;
            }
            
            tocList.innerHTML = currentToc.map(function(item, i) {
                return '<a href="#" class="toc-item toc-h' + item.level + '" data-line="' + item.line + '" data-index="' + i + '">' + escapeHtml(item.text) + '</a>';
            }).join('');
            
            // Add click handlers
            var items = tocList.querySelectorAll('.toc-item');
            for (var i = 0; i < items.length; i++) {
                items[i].addEventListener('click', function(e) {
                    e.preventDefault();
                    var line = parseInt(this.getAttribute('data-line'));
                    vscode.postMessage({ type: 'tocNavigate', line: line });
                    
                    // Highlight active item
                    var allItems = tocList.querySelectorAll('.toc-item');
                    for (var j = 0; j < allItems.length; j++) {
                        allItems[j].classList.remove('active');
                    }
                    this.classList.add('active');
                });
            }
        }
        
        function escapeHtml(text) {
            var div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }
        
        // Handle messages from extension
        window.addEventListener('message', function(event) {
            var message = event.data;
            
            switch (message.type) {
                case 'update':
                    preview.innerHTML = message.content;
                    docTitle.textContent = message.title;
                    
                    // Update theme
                    if (message.theme) {
                        body.setAttribute('data-theme', message.theme);
                    }
                    
                    // Update frontmatter
                    if (message.frontmatter && Object.keys(message.frontmatter).length > 0) {
                        var fmHtml = '';
                        for (var key in message.frontmatter) {
                            fmHtml += '<span class="fm-item"><strong>' + escapeHtml(key) + ':</strong> ' + escapeHtml(String(message.frontmatter[key])) + '</span>';
                        }
                        frontmatterEl.innerHTML = fmHtml;
                        frontmatterEl.style.display = 'flex';
                    } else {
                        frontmatterEl.style.display = 'none';
                    }
                    
                    // Update TOC
                    currentToc = message.toc || [];
                    renderToc();
                    
                    // Update stats
                    if (message.stats) {
                        statsEl.innerHTML = message.stats.words + ' words · ' + message.stats.chars + ' characters · ' + message.stats.readTime + ' min read';
                    }
                    
                    // Add line markers to headings for scroll sync
                    var headings = preview.querySelectorAll('h1, h2, h3, h4, h5, h6');
                    for (var i = 0; i < headings.length; i++) {
                        if (currentToc[i]) {
                            headings[i].setAttribute('data-line', currentToc[i].line);
                            headings[i].id = 'heading-' + i;
                        }
                    }
                    
                    // Initialize Mermaid diagrams
                    if (typeof mermaid !== 'undefined') {
                        try {
                            mermaid.initialize({ 
                                startOnLoad: false,
                                theme: body.getAttribute('data-theme') === 'dark' ? 'dark' : 'default'
                            });
                            mermaid.run({ nodes: preview.querySelectorAll('.mermaid') });
                        } catch (e) {
                            console.error('Mermaid error:', e);
                        }
                    }
                    break;
                    
                case 'scrollSync':
                    if (scrollSyncEnabled) {
                        var scrollHeight = document.documentElement.scrollHeight - window.innerHeight;
                        window.scrollTo(0, scrollHeight * message.percent);
                    }
                    break;
                    
                case 'toggleTheme':
                    var currentTheme = body.getAttribute('data-theme');
                    body.setAttribute('data-theme', currentTheme === 'dark' ? 'light' : 'dark');
                    break;
                    
                case 'zoom':
                    if (message.reset) {
                        currentZoom = 100;
                    } else {
                        currentZoom = Math.max(50, Math.min(200, currentZoom + message.delta));
                    }
                    updateZoom();
                    break;
            }
        });
        
        // Scroll sync from preview to editor
        var scrollTimeout;
        window.addEventListener('scroll', function() {
            clearTimeout(scrollTimeout);
            scrollTimeout = setTimeout(function() {
                // Find the heading closest to the top of the viewport
                var headings = preview.querySelectorAll('[data-line]');
                for (var i = 0; i < headings.length; i++) {
                    var rect = headings[i].getBoundingClientRect();
                    if (rect.top >= 0 && rect.top < 200) {
                        vscode.postMessage({ 
                            type: 'scrollToLine', 
                            line: parseInt(headings[i].getAttribute('data-line')) 
                        });
                        break;
                    }
                }
            }, 100);
        });
    </script>
</body>
</html>`;
}

export function deactivate() {
    if (statusBarItem) {
        statusBarItem.dispose();
    }
}
