import * as vscode from 'vscode';

interface WrapperConfig {
    key: string;
    import: string;
    wrap_template: string;
    language: string;
}

let wrapperConfigs: WrapperConfig[] = [];
// let orange = vscode.window.createOutputChannel("Orange");

// Load configurations from settings.json
function loadConfig() {
    const config = vscode.workspace.getConfiguration('rustWrapper');
    wrapperConfigs = config.get<WrapperConfig[]>('wrappers') || [];
}

export function activate(context: vscode.ExtensionContext) {
    loadConfig();

    const provider = vscode.languages.registerCompletionItemProvider(
        { scheme: 'file', language: '*' }, // Apply to all files
        {
            provideCompletionItems(document: vscode.TextDocument, position: vscode.Position) {
                const linePrefix = document.lineAt(position).text.substring(0, position.character);
                // Check if the line prefix ends with '.'
                if (!linePrefix.endsWith('.')) {
                    return undefined;
                }

                const completionItems: vscode.CompletionItem[] = [];
                for (const wrapper of wrapperConfigs) {
                    if (wrapper.language === document.languageId || wrapper.language === 'all') {
                        const completionItem = new vscode.CompletionItem(wrapper.key, vscode.CompletionItemKind.Snippet);
                        completionItem.detail = `Wrap with ${wrapper.wrap_template}`;
                        completionItem.command = {
                            command: `extension.wrapWith${wrapper.key}`,
                            title: 'Wrap Variable',
                            arguments: [position, wrapper] // Pass the position and wrapper as arguments
                        };
                        completionItems.push(completionItem);
                    }
                }

                return completionItems;
            }
        },
        '.' // Trigger on dot
    );

    context.subscriptions.push(provider);

    wrapperConfigs.forEach(wrapper => {
        let disposable = vscode.commands.registerCommand(`extension.wrapWith${wrapper.key}`, (position: vscode.Position, wrapper: WrapperConfig) => {
            if (position) {
                wrapVariableWithTemplate(wrapper, position);
            } else {
                vscode.window.showErrorMessage("Position is not defined.");
            }
        });
        context.subscriptions.push(disposable);
    });
}

function wrapVariableWithTemplate(wrapper: WrapperConfig, position: vscode.Position) {
	// the position param is the position of the dot
    const editor = vscode.window.activeTextEditor;
    if (!editor || !position) {
        vscode.window.showErrorMessage("No active editor or position found.");
        return;
    }

    const document = editor.document;

    // Ensure language match
    if (wrapper.language !== 'all' && document.languageId !== wrapper.language) {
        vscode.window.showWarningMessage(`This wrapper is only applicable for ${wrapper.language} files.`);
        return;
    }

    // Use VSCode API to find the word range at the given position
    const wordRange = document.getWordRangeAtPosition(position.translate(0, -1), /[^\s()[\]{}"']+(\(.*\)|\[.*\]|\{.*\}|\".*\"|'.*')*[^\s()[\]{}"']+/);
	const prompt_word_range = document.getWordRangeAtPosition(position.translate(0, 1));

    if (!wordRange || !prompt_word_range) {
        vscode.window.showErrorMessage("No valid word found to wrap.");
        return;
    }

    const word_for_substitute = document.getText(new vscode.Range(wordRange.start, position.translate(0, -1)));

    // // console.log(`Wrapping ${word} with template: ${wrapper.wrap_template}`);

    // Ensure the wrap_template contains a placeholder
    if (!wrapper.wrap_template.includes('{}')) {
        vscode.window.showErrorMessage("Wrap template must contain '{}' as a placeholder.");
        return;
    }

    // Apply the wrap template
    const wrappedText = wrapper.wrap_template.replace('{}', word_for_substitute);

    console.log(`Wrapped text: ${wrappedText}`);

    // Replace the identified word with the wrapped text
    editor.edit(editBuilder => {
        editBuilder.replace(new vscode.Range(wordRange.start, prompt_word_range.end), wrappedText);
    }).then(() => {
        if (document.languageId === 'rust' && wrapper.import && wrapper.import.trim() !== '') {
            addImportStatement(document, editor, wrapper.import);
        }
    });
}

async function addImportStatement(document: vscode.TextDocument, editor: vscode.TextEditor, importStatement: string) {
    if (document.languageId !== 'rust') {
        return;
    }

    const text = document.getText();
    const usePattern = /^use\s+([\w:]+)(::\{([\w\s,]*)\})?;/gm;
    const importTree = new Map<string, any>();
    let match;
    let lastUseLine = 0;

    // Parse existing use statements into a tree-like structure
    function addToTree(base: string[], item: string) {
        let currentLevel = importTree;
        for (const part of base) {
            if (!currentLevel.has(part)) {
                currentLevel.set(part, new Map());
            }
            currentLevel = currentLevel.get(part);
        }
        currentLevel.set(item, null);
    }

    while ((match = usePattern.exec(text)) !== null) {
        lastUseLine = document.positionAt(match.index).line;
        const baseParts = match[1].split('::');
        const items = match[3] ? match[3].split(',').map(item => item.trim()) : [''];
        
        items.forEach(item => addToTree(baseParts, item));
    }

    // Break down the new import statement
    const importParts = importStatement.replace('use ', '').replace(';', '').split('::');
    const newItems = importParts.pop()?.replace(/[{}]/g, '').split(',').map(item => item.trim()) || [];
    const baseParts = importParts;

    // Add the new imports to the tree
    newItems.forEach(item => addToTree(baseParts, item));

    // Function to recursively build use statements from the tree
    function buildUseStatements(node: Map<string, any>, prefix: string): string[] {
        const statements: string[] = [];
        for (const [key, value] of node.entries()) {
            if (value && value.size > 0) {
                const subStatements = buildUseStatements(value, `${prefix}${key}::`);
                if (subStatements.length > 0) {
                    statements.push(`${key}::{${subStatements.join(', ')}}`);
                } else {
                    statements.push(`${key}`);
                }
            } else {
                statements.push(`${key}`);
            }
        }
        return statements;
    }

    const newUseStatements = buildUseStatements(importTree, 'use ');

    await editor.edit(editBuilder => {
        const insertionPosition = lastUseLine > 0 ? new vscode.Position(lastUseLine + 1, 0) : new vscode.Position(0, 0);
        editBuilder.insert(insertionPosition, newUseStatements.join('\n') + '\n');
    });
}

export function deactivate() {}

