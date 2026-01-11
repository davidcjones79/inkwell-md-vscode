import * as vscode from 'vscode';
import { marked } from 'marked';
import * as path from 'path';

let currentPanel: vscode.WebviewPanel | undefined = undefined;

export function activate(context: vscode.ExtensionContext) {
    console.log('Inkwell Markdown Preview is now active');

    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('inkwell.showPreview', () => {
            showPreview(context, vscode.ViewColumn.Active);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('inkwell.showPreviewToSide', () => {
            showPreview(context, vscode.ViewColumn.Beside);
        })
    );

    // Update preview when document changes
    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument((e) => {
            if (currentPanel && e.document.languageId === 'markdown') {
                updatePreview(e.document);
            }
        })
    );

    // Update preview when active editor changes
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor((editor) => {
            if (currentPanel && editor && editor.document.languageId === 'markdown') {
                updatePreview(editor.document);
            }
        })
    );
}

function showPreview(context: vscode.ExtensionContext, viewColumn: vscode.ViewColumn) {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== 'markdown') {
        vscode.window.showWarningMessage('Open a Markdown file to preview');
        return;
    }

    if (currentPanel) {
        currentPanel.reveal(viewColumn);
        updatePreview(editor.document);
        return;
    }

    currentPanel = vscode.window.createWebviewPanel(
        'inkwellPreview',
        'Inkwell Preview',
        viewColumn,
        {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media')]
        }
    );

    currentPanel.onDidDispose(() => {
        currentPanel = undefined;
    }, null, context.subscriptions);

    const styleUri = currentPanel.webview.asWebviewUri(
        vscode.Uri.joinPath(context.extensionUri, 'media', 'style.css')
    );

    currentPanel.webview.html = getWebviewContent(styleUri);
    updatePreview(editor.document);
}

function updatePreview(document: vscode.TextDocument) {
    if (!currentPanel) return;
    
    const markdown = document.getText();
    const html = marked.parse(markdown) as string;
    
    currentPanel.webview.postMessage({
        type: 'update',
        content: html,
        title: path.basename(document.fileName)
    });
}

function getWebviewContent(styleUri: vscode.Uri): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${styleUri} 'unsafe-inline'; script-src 'unsafe-inline'; font-src https://fonts.gstatic.com; img-src * data:;">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,400;8..60,600;8..60,700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
    <link href="${styleUri}" rel="stylesheet">
    <title>Inkwell Preview</title>
</head>
<body>
    <div class="container">
        <header>
            <h1 class="doc-title">Document</h1>
        </header>
        <main id="preview">
            <p class="empty-state">Open a Markdown file to see the preview</p>
        </main>
    </div>
    <script>
        const preview = document.getElementById('preview');
        const docTitle = document.querySelector('.doc-title');
        
        window.addEventListener('message', event => {
            const message = event.data;
            if (message.type === 'update') {
                preview.innerHTML = message.content;
                docTitle.textContent = message.title.replace(/\.md$/, '');
            }
        });
    </script>
</body>
</html>`;
}

export function deactivate() {}
