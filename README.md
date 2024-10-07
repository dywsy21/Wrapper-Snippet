# Var Wrapper Snippets Customization 2

This repository contains code for a VS Code extension that facilitates the customization of code snippets. It includes a feature that allows users to wrap selected code using a flexible template mechanism. The extension can be configured to use specific templates, making it versatile for different programming languages.

## Features

- Wrap variables using a flexible template mechanism. Eg. a.test => Test::new(a)
- Configure the extension to use specific templates for different programming languages.
- Trigger the wrapping command from the command palette or just press enter.


## Configuration

The extension utilizes a configuration interface to define how the wrapping should occur. This interface might look like this:
```typescript
interface WrapperConfig {
  key: string;
  wrap_template: string;
  fileSuffix: string;
}
```

The `key` field is used to identify the configuration, the `wrap_template` field is the template used to wrap the variable, and the `fileSuffix` field specifies the file with which suffix the configuration is valid.

The format of the `wrap_template` field is a string that contains the variable name surrounded by curly braces. For example, the template `Test::new({})` would wrap the variable `a` as `Test::new(a)`.

## Usage

1. Press '.' after variables and select the wrap option from the suggestions.
2. Trigger the wrapping command from the command palette or just press enter.
3. The variable will be wrapped based on your configured settings.

## Contribution

Contributions are welcome! Please submit a pull request or open an issue to discuss the changes you would like to make.

## Repository
[Wrapper Snippet](https://github.com/dywsy21/Wrapper-Snippet.git)


## License

This project is licensed under the MIT License.

