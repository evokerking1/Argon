import React from 'react';

const ANSI_COLORS: Record<number, string> = {
    0: '#000000', // Black
    1: '#d16969', // Red
    2: '#b5cea8', // Green
    3: '#d7ba7d', // Yellow
    4: '#569cd6', // Blue
    5: '#c586c0', // Magenta
    6: '#9cdcfe', // Cyan
    7: '#d4d4d4', // White
    // Bright variants
    8: '#808080',  // Bright Black
    9: '#d16969',  // Bright Red
    10: '#b5cea8', // Bright Green
    11: '#d7ba7d', // Bright Yellow
    12: '#569cd6', // Bright Blue
    13: '#c586c0', // Bright Magenta
    14: '#9cdcfe', // Bright Cyan
    15: '#ffffff'  // Bright White
};

interface AnsiParserProps {
    text: string;
}

interface SpanStyle {
    fontWeight?: 'bold';
    fontStyle?: 'italic';
    textDecoration?: 'underline';
    color?: string;
    backgroundColor?: string;
}

interface Span {
    text: string;
    style: SpanStyle;
}

const AnsiParser: React.FC<AnsiParserProps> = ({ text }) => {
    const parseAnsi = (input: string): Span[] => {
        const result: Span[] = [];
        let currentSpan: Span = { text: '', style: {} };
        let position = 0;

        while (position < input.length) {
            if (input[position] === '\u001b' && input[position + 1] === '[') {
                // If we have accumulated any text, push it
                if (currentSpan.text) {
                    result.push({ ...currentSpan });
                    currentSpan = { text: '', style: { ...currentSpan.style } };
                }

                position += 2; // Skip the escape sequence start
                let code = '';
                
                // Collect all numbers until 'm'
                while (position < input.length && input[position] !== 'm') {
                    code += input[position];
                    position++;
                }
                position++; // Skip the 'm'

                // Process the code
                const codes = code.split(';').map(Number);
                for (let i = 0; i < codes.length; i++) {
                    const code = codes[i];
                    
                    if (code === 0) {
                        // Reset
                        currentSpan.style = {};
                    } else if (code === 1) {
                        // Bold
                        currentSpan.style.fontWeight = 'bold';
                    } else if (code === 3) {
                        // Italic
                        currentSpan.style.fontStyle = 'italic';
                    } else if (code === 4) {
                        // Underline
                        currentSpan.style.textDecoration = 'underline';
                    } else if (code >= 30 && code <= 37) {
                        // Foreground color
                        currentSpan.style.color = ANSI_COLORS[code - 30];
                    } else if (code >= 90 && code <= 97) {
                        // Bright foreground color
                        currentSpan.style.color = ANSI_COLORS[code - 82];
                    } else if (code >= 40 && code <= 47) {
                        // Background color
                        currentSpan.style.backgroundColor = ANSI_COLORS[code - 40];
                    } else if (code >= 100 && code <= 107) {
                        // Bright background color
                        currentSpan.style.backgroundColor = ANSI_COLORS[code - 92];
                    }
                }
            } else {
                currentSpan.text += input[position];
                position++;
            }
        }

        // Push any remaining text
        if (currentSpan.text) {
            result.push(currentSpan);
        }

        return result;
    };

    const spans = parseAnsi(text);

    return (
        <div className="font-mono leading-5 whitespace-pre-wrap">
            {spans.map((span, index) => (
                <span key={index} style={{ ...span.style, fontFamily: 'Geist Mono' }}>
                    {span.text}
                </span>
            ))}
        </div>
    );
};

export default AnsiParser;