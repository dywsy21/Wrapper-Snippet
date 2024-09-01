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
    let match;
    let importFound = false;
    let lastUseLine = 0;
    let existingImports = new Map<string, Set<string>>();

    // Parse and store existing use statements
    while ((match = usePattern.exec(text)) !== null) {
        lastUseLine = document.positionAt(match.index).line;
        const base = match[1];
        const imports = match[3] ? match[3].split(',').map(item => item.trim()) : [];

        if (!existingImports.has(base)) {
            existingImports.set(base, new Set(imports));
        } else {
            imports.forEach(imp => existingImports.get(base)!.add(imp));
        }
    }

    const importParts = importStatement.replace('use ', '').replace(';', '').split('::{');
    const newBase = importParts[0];
    const newImports = importParts[1] ? importParts[1].replace(/[{}]/g, '').split(',').map(item => item.trim()) : [];

    // Merge with existing imports
    if (existingImports.has(newBase)) {
        newImports.forEach(imp => existingImports.get(newBase)!.add(imp));
        importFound = true;
    } else if (newImports.length > 0) {
        existingImports.set(newBase, new Set(newImports));
    }

    // Construct updated use statements
    const newUseStatements = Array.from(existingImports.entries()).map(([base, items]) => {
        const itemList = Array.from(items).join(', ');
        return items.size > 0 ? `use ${base}::{${itemList}};` : `use ${base};`;
    });

    if (!importFound && importParts[1]) {
        newUseStatements.push(importStatement);
    }

    await editor.edit(editBuilder => {
        const insertionPosition = lastUseLine > 0 ? new vscode.Position(lastUseLine + 1, 0) : new vscode.Position(0, 0);
        editBuilder.insert(insertionPosition, newUseStatements.join('\n') + '\n');
    });
}

export function deactivate() {}

