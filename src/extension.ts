import * as vscode from "vscode";

interface WrapperConfig {
  key: string;
  wrap_template: string;
  language: string;
}

let wrapperConfigs: WrapperConfig[] = [];

// Load configurations from settings.json
function loadConfig() {
  const config = vscode.workspace.getConfiguration("WrapperSnippets");
  wrapperConfigs = config.get<WrapperConfig[]>("wrappers") || [];
}

export function activate(context: vscode.ExtensionContext) {
	let disposable = vscode.commands.registerCommand('WrapperSnippets.addWrapperConfig', async () => {
        const settingsUri = vscode.Uri.file(`${vscode.workspace.workspaceFolders![0].uri.fsPath}/.vscode/settings.json`);
        const document = await vscode.workspace.openTextDocument(settingsUri);
        const editor = await vscode.window.showTextDocument(document);

        // const text = editor.document.getText();
		// // show an info window to display the text
		// vscode.window.showInformationMessage(text);
        // if (!text.includes("WrapperSnippets.wrappers")) {
			
        //     const editPosition = new vscode.Position(document.lineCount, 0);
		// 	const config = "\"WrapperSnippets.wrappers\": []";
        //     editor.edit(editBuilder => {
        //         editBuilder.insert(editPosition, `\n${config}\n`);
        //     });
        // }
    });

    context.subscriptions.push(disposable);

  loadConfig();

  const provider = vscode.languages.registerCompletionItemProvider(
    { scheme: "file", language: "*" }, // Apply to all files
    {
      provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position
      ) {
        const linePrefix = document
          .lineAt(position)
          .text.substring(0, position.character);
        // Check if the line prefix ends with '.'
        if (!linePrefix.endsWith(".")) {
          return undefined;
        }

        const completionItems: vscode.CompletionItem[] = [];
        for (const wrapper of wrapperConfigs) {
          if (
            wrapper.language === document.languageId ||
            wrapper.language === "all"
          ) {
            const completionItem = new vscode.CompletionItem(
              wrapper.key,
              vscode.CompletionItemKind.Snippet
            );
            completionItem.detail = `Wrap with ${wrapper.wrap_template}`;
            completionItem.command = {
              command: `extension.wrapWith${wrapper.key}`,
              title: "Wrap Variable",
              arguments: [position, wrapper], // Pass the position and wrapper as arguments
            };
            completionItems.push(completionItem);
          }
        }

        return completionItems;
      },
    },
    "." // Trigger on dot
  );

  context.subscriptions.push(provider);

  wrapperConfigs.forEach((wrapper) => {
    let disposable = vscode.commands.registerCommand(
      `extension.wrapWith${wrapper.key}`,
      (position: vscode.Position, wrapper: WrapperConfig) => {
        if (position) {
          wrapVariableWithTemplate(wrapper, position);
        } else {
          vscode.window.showErrorMessage("Position is not defined.");
        }
      }
    );
    context.subscriptions.push(disposable);
  });
}

function wrapVariableWithTemplate(
  wrapper: WrapperConfig,
  position: vscode.Position
) {
  // the position param is the position of the dot
  const editor = vscode.window.activeTextEditor;
  if (!editor || !position) {
    vscode.window.showErrorMessage("No active editor or position found.");
    return;
  }

  const document = editor.document;

  // Ensure language match
  if (wrapper.language !== "all" && document.languageId !== wrapper.language) {
    vscode.window.showWarningMessage(
      `This wrapper is only applicable for ${wrapper.language} files.`
    );
    return;
  }

  // Use VSCode API to find the word range at the given position
  const wordRange = document.getWordRangeAtPosition(
    position.translate(0, -1),
    /[^\s()[\]{}"']+(\(.*\)|\[.*\]|\{.*\}|\".*\"|'.*')*[^\s()[\]{}"']+/
  );
  const prompt_word_range = document.getWordRangeAtPosition(
    position.translate(0, 1)
  );

  if (!wordRange || !prompt_word_range) {
    vscode.window.showErrorMessage("No valid word found to wrap.");
    return;
  }

  const word_for_substitute = document.getText(
    new vscode.Range(wordRange.start, position.translate(0, -1))
  );

  // // console.log(`Wrapping ${word} with template: ${wrapper.wrap_template}`);

  // Ensure the wrap_template contains a placeholder
  if (!wrapper.wrap_template.includes("{}")) {
    vscode.window.showErrorMessage(
      "Wrap template must contain '{}' as a placeholder."
    );
    return;
  }

  // Apply the wrap template
  const wrappedText = wrapper.wrap_template.replace("{}", word_for_substitute);


  // Replace the identified word with the wrapped text
  editor
    .edit((editBuilder) => {
      editBuilder.replace(
        new vscode.Range(wordRange.start, prompt_word_range.end),
        wrappedText
      );
    });

}

export function deactivate() {}
