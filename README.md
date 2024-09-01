# Var Wrapper Snippets Customization 2

This repository contains code for a VS Code extension that facilitates the customization of code snippets. It includes a feature that allows users to wrap selected code using a flexible template mechanism. The extension can be configured to use specific templates, making it versatile for different programming languages.

## Installation

1. Clone this repository.
2. Open the directory in VS Code.
3. Run the extension using the VS Code Extension Development Host.

## Configuration

The extension utilizes a configuration interface to define how the wrapping should occur. This interface might look like this:
```typescript
interface WrapperConfig {
  key: string;
  wrap_template: string;
  language: string;
}
```

## Usage

1. Select the code you want to wrap in VS Code.
2. Trigger the wrapping command from the command palette or your configured hotkey.
3. The selected code will be wrapped based on your configured settings.

## Contribution

Contributions are welcome! Please submit a pull request or open an issue to discuss the changes you would like to make.

## License

This project is licensed under the MIT License.

