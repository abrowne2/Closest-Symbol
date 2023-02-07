import * as vscode from 'vscode';
import * as similar from 'string-similarity';

interface Closest {
    symbol: string;
    range: vscode.Range;
    rating: number;
    distanceFromCursor: number;
}

let closest: Closest | null = null;

// TODO fix this for local unsaved files?
const gotoLineByNumber = async function(line: number) {
    await vscode.commands.executeCommand("editor.action.goToLocations", 
        vscode.window.activeTextEditor?.document.uri,
        vscode.window.activeTextEditor?.selection.active,
        [{
            uri: vscode.window.activeTextEditor?.document.uri,
            range: {
                startLineNumber: line,
                startColumn: 0,
                endLineNumber: line,
                endColumn: 0
            }
        }],
        'goto',
        'No super implementation found'
    );
};

const gotoRange = async function(range: vscode.Range) {
    await vscode.commands.executeCommand("editor.action.goToLocations", 
        vscode.window.activeTextEditor?.document.uri,
        vscode.window.activeTextEditor?.selection.active,
        [{
            uri: vscode.window.activeTextEditor?.document.uri,
            range: {
                startLineNumber: range.start.line+1,
                startColumn: 0, 
                endLineNumber: range.end.line+1,
                endColumn: 0
            }
        }],
        'goto',
        'No super implementation found'
    );
};

const tokenIsNotKeyword = (token: string): boolean => {
    return token !== "let" && token !== "var" && token !== "to"
        && token !== "const" && token !== "await" && token !== "return";
};

const checkLineRangeForSymbolMatch = async function(pattern: string, line: vscode.TextLine, cursorPos: vscode.Position) {
    let currentLineRange: vscode.Range = line.rangeIncludingLineBreak;
    let distanceFromCursor: number = Math.abs(cursorPos.line - line.lineNumber);

    let lineText: string = line.text.trim();
    let tokens: string[] = lineText.split(" ").filter((token) => {
        return tokenIsNotKeyword(token);
    });

    let matches = similar.findBestMatch(pattern, tokens);
    if(closest) {
        if (
            ((matches.bestMatch.rating > closest.rating) ||
            (matches.bestMatch.rating === closest.rating && distanceFromCursor < closest.distanceFromCursor)) 
        ) {
            closest = {
                symbol: matches.bestMatch.target,
                range: currentLineRange,
                rating: matches.bestMatch.rating,
                distanceFromCursor: distanceFromCursor
            };
        }
    } else {
        closest = {
            symbol: matches.bestMatch.target,
            range: currentLineRange,
            rating: matches.bestMatch.rating,
            distanceFromCursor: distanceFromCursor
        };
    } 
};

const symbolContainsCursorRange = function(cursorPosition: vscode.Position, symbol: any): vscode.Range | null {
    if(symbol.kind === vscode.SymbolKind.Function) {
        if(symbol.range.contains(cursorPosition)) {
            return symbol.range;
        } else {
            return null;
        }
    } else if(symbol.kind === vscode.SymbolKind.Object) {
        // check children for functions
        let childSymbols = symbol.children;
        for(let i = 0; i < childSymbols.length; ++i) {
            let possibleRange: vscode.Range | null = symbolContainsCursorRange(cursorPosition, childSymbols[i]);
            if(possibleRange) {
                return possibleRange;
            } 
        }
        return null;
    } else {
        return null;
    }
};

const closestSymbolInsideBlock = async function(pattern: string): Promise<vscode.Range | undefined> {
    let document: vscode.TextDocument = vscode.window.activeTextEditor?.document!;
    let cursorPositon: vscode.Position = vscode.window.activeTextEditor?.selection.active!;

    let currentSymbols: any = await vscode.commands.executeCommand("vscode.executeDocumentSymbolProvider", document.uri);

    let closestFunctionRange: vscode.Range | null = null;

    // get current function the cursor is inside.
    for(var i = 0; i < currentSymbols.length; ++i) {
        let matchedCursorRange: vscode.Range | null = symbolContainsCursorRange(cursorPositon, currentSymbols[i]);
        if(matchedCursorRange) {
            closestFunctionRange = matchedCursorRange;
            break;
        }
    }

    // Iterate over the lines of the function; if they contain the partial match, return first.
    if(closestFunctionRange) {
        let startLineOfCurFunction: number = closestFunctionRange.start.line;
        let endLineOfCurFunction: number = closestFunctionRange.end.line;

        for(let lineInc = startLineOfCurFunction; lineInc <= endLineOfCurFunction; ++lineInc) {
            let lineFromDoc: vscode.TextLine = document.lineAt(lineInc);
            if(!lineFromDoc.isEmptyOrWhitespace) {
                await checkLineRangeForSymbolMatch(pattern, lineFromDoc, cursorPositon);
            }
        }

        if(closest) {
            let currentLineRange = closest.range;
        
            return currentLineRange;
        }
    }

};  

function isNumber(value: string | undefined): boolean {
   return ((value != undefined) &&
           (value != null) &&
           (value !== '') &&
           !isNaN(Number(value.toString())));
}

export const closestSymbolMatch = async function() {
    // 1. Check command pallete input. If contains `:` in first piece check if goto-line logic can be applied.
    // 2. If is a pure letter combo, then can go to closest editor buffer match.

    let outputFromUser: string | undefined = await vscode.window.showInputBox();

    if(isNumber(outputFromUser)) {
        await gotoLineByNumber(+outputFromUser!);
    } else {
        if(outputFromUser) {
            closest = null;
            let foundWordMatchRange: vscode.Range | undefined = await closestSymbolInsideBlock(outputFromUser);
            if(foundWordMatchRange) {
                await gotoRange(foundWordMatchRange);
            }
        }
    }
};