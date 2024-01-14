import * as vscode from "vscode";

// Load the alphabet from settings, and in case of invalid setting, default to numerical digits
function getAlphabet() {
	const alphabet: string | undefined = vscode.workspace.getConfiguration("triplicate").get("alphabet");
	return alphabet === undefined || alphabet.length < 2 ? "0123456789" : alphabet;
}

// Load the line number length from settings, and in case of invalid setting, default to 3
function getLength() {
	const length: number | undefined = vscode.workspace.getConfiguration("triplicate").get("length");
	return length === undefined || length < 1 ? 3 : length;
}

// Load the requested system length from settings, and in case of invalid setting, default to 3
function getSystem() {
	const system: "fixed length" | "factoradic" | undefined = vscode.workspace.getConfiguration("triplicate").get("system");
	return system === undefined ? "fixed length" : system;
}


// Appends the pad string to the left of a string, repeating as necessary to achieve the desired length, or truncates to the desired length
function leftpad(str: string, pad: string, n: number) {
	const padded = str.padStart(n, pad);
	return padded.slice(padded.length - n);
}

// Clamps a number between a low and a high value
function clamp(x: number, low: number, high: number) {
	return Math.max(low, Math.min(x, high));
}

// Returns the smallest number whose factorial is greater or equal than the input
function inverseFactorial(x: number) {
  if (x < 1) throw new Error("Number must be > 0");

	for (var i = 2; x > 1; i ++)
		x /= i;

	return i - 1;
}


// Writes a number in a given base using a given alphabet
function baseConversion(x: number, base: number, alphabet: string) {
  if (x < 0) throw new Error("Number must be >= 0");
  if (base < 2) throw new Error("Radix must be >= 2");
	if (base > alphabet.length) throw new Error("Radix must be <= alphabet length");

	if (x === 0) return alphabet[0];

	let digits = [];

  while (x > 0) {
    digits.push(alphabet[x % base]);
    x = Math.floor(x / base);
  }

  return digits.reverse().join("");
}

// Writes a number in the factorial number system (https://en.wikipedia.org/wiki/Factorial_number_system)
function factoradic(x: number, alphabet: string) {
  if (x < 0) throw new Error("Number must be >= 0");

	if (x === 0) return alphabet[0];

	let digits = [];

	for (let i = 2; x > 0; i ++) {
    digits.push(alphabet[(x % i) % alphabet.length]);
    x = Math.floor(x / i);
  }

  return digits.reverse().join("");
}


// On activation, register a number of hooks to update line numbers
export function activate(context: vscode.ExtensionContext) {
	vscode.workspace.onDidChangeConfiguration(_ => {
		const editor = vscode.window.activeTextEditor;
		if (editor) updateDecorations(editor, editor.visibleRanges);
	}, null, context.subscriptions);

	// vscode.workspace.onDidOpenTextDocument(_ => {
	// 	const editor = vscode.window.activeTextEditor;
	// 	if (editor) updateDecorations(editor, editor.visibleRanges);
	// }, null, context.subscriptions);

	vscode.workspace.onDidChangeTextDocument(event => {
		const editor = vscode.window.activeTextEditor;
		if (editor && event.document === editor.document) updateDecorations(editor, editor.visibleRanges);
	}, null, context.subscriptions);

	vscode.window.onDidChangeTextEditorSelection(event => {
		updateDecorations(event.textEditor, event.textEditor.visibleRanges);
	}, null, context.subscriptions);

	vscode.window.onDidChangeVisibleTextEditors(editors => {
		for (const editor of editors)
			updateDecorations(editor, editor.visibleRanges);
	}, null, context.subscriptions);

	vscode.window.onDidChangeTextEditorVisibleRanges(event => {
		updateDecorations(event.textEditor, event.visibleRanges);
	}, null, context.subscriptions);

	// Update immediately
	const editor = vscode.window.activeTextEditor;
	if (editor) updateDecorations(editor, editor.visibleRanges);
}





const decorator = vscode.window.createTextEditorDecorationType({ before: { margin: "0 1.75rem 0 0" } });


// The vscode events we hook into above fire multiple times on a single modification, so debounce their effects
// let timeout: NodeJS.Timeout | any = undefined;
// function updateDecorations(...args: [vscode.TextEditor, vscode.TextEditorDecorationType, readonly vscode.Range[]]) {
// 	clearTimeout(timeout);
// 	timeout = setTimeout(() => updateDecorations2(...args), 2);
// }


function updateDecorations(editor: vscode.TextEditor, visibleRanges: readonly vscode.Range[]) {
	const decorations: vscode.DecorationOptions[] = [];

	// Padding above and below each range to additionally render
	const buffer = 2;

	const renderLast: "off" | "on" | "dimmed" = vscode.workspace.getConfiguration().get("editor.renderFinalNewline")!;
	const alphabet = getAlphabet();
	const length = getLength();
	const system = getSystem();

	for (const range of visibleRanges) {
		// First and last line number we're going to render
		const min = Math.max(range.start.line - buffer, 0);
		let max = Math.min(range.end.line + buffer, editor.document.lineCount);
		if (renderLast === "off" && editor.document.lineAt(editor.document.lineCount - 1).text.length === 0) max -= 1;

		// Compute the base used if we're using the fixed length system
		const requiredBase = Math.pow(max + 1, 1 / length);
		const base = clamp(Math.ceil(requiredBase), 2, alphabet.length);

		// Compute the maximum length of a number if we're using the factoradic system
		const maxLengthFactoradic = Math.max(2, inverseFactorial(max + 1) - 1);

		for (let line = min; line < max; line ++) {
			const lineNumber = system === "fixed length"
				? leftpad(baseConversion(line + 1, base, alphabet), alphabet[0], length)
				: leftpad(factoradic(line + 1, alphabet), alphabet[0], maxLengthFactoradic)
			;

			// TODO: Using the factoradic system, In a file of only 3680 newlines, lines 3651-3670 display the wrong line number unless they are the active line
			// The exact mis-rendering lines sometimes vary, and this console.log logs the correct line numbers
			// const lineNumber = leftpad(baseConversion(line, 61, alphabet), "0", 2);
			// console.log(line, lineNumber);

			// NOTE: "editorLineNumber.dimmedForeground" does not seem to work for any themes, so instead we use "textBlockQuote.background"
			const color: any = line === editor.selection.active.line                             ? { id: "editorLineNumber.activeForeground" } :
												 line === editor.document.lineCount - 1 && renderLast === "dimmed" ? { id: "textBlockQuote.background" } :
																																					                	 { id: "editorLineNumber.foreground" };
			const decoration = {
				range: new vscode.Range(line, 0, line, 0),
				renderOptions: { before: { contentText: lineNumber, color } },
			};

			decorations.push(decoration);
		}
	}

	editor.setDecorations(decorator, decorations);
}
