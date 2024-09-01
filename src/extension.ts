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
    const usePattern = /use\s+([\w:]+)(::\{[\w,\s]+\})?;/g;
    let match;
    let importFound = false;
    let lastUseLine = 0;
    let existingImports: { [key: string]: string[] } = {};

    // Parse existing use statements
    while ((match = usePattern.exec(text)) !== null) {
        lastUseLine = document.positionAt(match.index).line;
        const [_, base, imports] = match;
        if (imports) {
            const importedItems = imports.replace(/[{}]/g, '').split(',').map(item => item.trim());
            existingImports[base] = importedItems;
        } else {
            existingImports[base] = [];
        }
    }

    const [newBase, newImport] = importStatement.replace('use ', '').replace(';', '').split('::{');

    // Merge new import
    if (existingImports[newBase]) {
        if (newImport) {
            const newItems = newImport.replace(/[{}]/g, ''). split(',').map(item => item.trim());
            existingImports[newBase] = Array.from(new Set([...existingImports[newBase], ...newItems]));
        }
        importFound = true;
    }

    // Construct new use statements
    const newUseStatements = Object.entries(existingImports).map(([base, items]) => {
        if (items.length > 0) {
            return `use ${base}::{${items.join(', ')}};`;
        }
        return `use ${base};`;
    });

    if (!importFound) {
        newUseStatements.push(importStatement);
    }

    await editor.edit(editBuilder => {
        if (lastUseLine === 0) {
            editBuilder.insert(new vscode.Position(0, 0), newUseStatements.join('\n') + '\n');
        } else {
            const start = new vscode.Position(lastUseLine, 0);
            const end = document.lineAt(lastUseLine).range.end;
            editBuilder.replace(new vscode.Range(start, end), newUseStatements.join('\n'));
        }
    });
}

export function deactivate() {}

