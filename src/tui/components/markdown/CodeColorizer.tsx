/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Text, Box } from 'ink';
import { common, createLowlight } from 'lowlight';
import type {
  Root,
  Element,
  Text as HastText,
  ElementContent,
  RootContent,
} from 'hast';
import { MINIMUM_MAX_HEIGHT } from './MaxSizedBox.js';
import { theme } from '../../theme.js';

// Configure theming and parsing utilities.
const lowlight = createLowlight(common);

function renderHastNode(
  node: Root | Element | HastText | RootContent,
  inheritedColor: string | undefined,
): React.ReactNode {
  if (node.type === 'text') {
    // Use the color passed down from parent element, or the theme's default.
    const color = inheritedColor || theme.defaultColor;
    return <Text color={color}>{node.value}</Text>;
  }

  // Handle Element Nodes: Determine color and pass it down, don't wrap
  if (node.type === 'element') {
    const nodeClasses: string[] =
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      (node.properties?.['className'] as string[]) || [];
    let elementColor: string | undefined = undefined;

    // Find color defined specifically for this element's class
    for (let i = nodeClasses.length - 1; i >= 0; i--) {
      const color = theme.getInkColor(nodeClasses[i]);
      if (color) {
        elementColor = color;
        break;
      }
    }

    // Determine the color to pass down: Use this element's specific color
    // if found; otherwise, continue passing down the already inherited color.
    const colorToPassDown = elementColor || inheritedColor;

    // Recursively render children, passing the determined color down
    // Ensure child type matches expected HAST structure (ElementContent is common)
    const children = node.children?.map(
      (child: ElementContent, index: number) => (
        <React.Fragment key={index}>
          {renderHastNode(child, colorToPassDown)}
        </React.Fragment>
      ),
    );

    // Element nodes now only group children; color is applied by Text nodes.
    // Use a React Fragment to avoid adding unnecessary elements.
    return <React.Fragment>{children}</React.Fragment>;
  }

  // Handle Root Node: Start recursion with initially inherited color
  if (node.type === 'root') {
    // Check if children array is empty - this happens when lowlight can't detect language – fall back to plain text
    if (!node.children || node.children.length === 0) {
      return null;
    }

    // Pass down the initial inheritedColor (likely undefined from the top call)
    // Ensure child type matches expected HAST structure (RootContent is common)
    return node.children?.map((child: RootContent, index: number) => (
      <React.Fragment key={index}>
        {renderHastNode(child, inheritedColor)}
      </React.Fragment>
    ));
  }

  // Handle unknown or unsupported node types
  return null;
}

function highlightAndRenderLine(
  line: string,
  language: string | null,
): React.ReactNode {
  try {
    const getHighlightedLine = () =>
      !language || !lowlight.registered(language)
        ? lowlight.highlightAuto(line)
        : lowlight.highlight(language, line);

    const renderedNode = renderHastNode(getHighlightedLine(), undefined);

    return renderedNode !== null ? renderedNode : line;
  } catch (_error) {
    return line;
  }
}

export function colorizeLine(
  line: string,
  language: string | null,
): React.ReactNode {
  return highlightAndRenderLine(line, language);
}

export interface ColorizeCodeOptions {
  code: string;
  language?: string | null;
  availableHeight?: number;
  maxWidth: number;
  hideLineNumbers?: boolean;
}

/**
 * Renders syntax-highlighted code for Ink applications using a selected theme.
 *
 * @param options The options for colorizing the code.
 * @returns A React.ReactNode containing Ink <Text> elements for the highlighted code.
 */
export function colorizeCode({
  code,
  language = null,
  availableHeight,
  maxWidth,
  hideLineNumbers = false,
}: ColorizeCodeOptions): React.ReactNode {
  const codeToHighlight = code.replace(/\n$/, '');
  const activeTheme = theme;
  const showLineNumbers = !hideLineNumbers;

  try {
    // Render the HAST tree using the adapted theme
    // Apply the theme's default foreground color to the top-level Text element
    let lines = codeToHighlight.split('\n');
    const padWidth = String(lines.length).length; // Calculate padding width based on number of lines

    let hiddenLinesCount = 0;

    // Optimization to avoid highlighting lines that cannot possibly be displayed.
    if (availableHeight !== undefined) {
      availableHeight = Math.max(availableHeight, MINIMUM_MAX_HEIGHT);
      if (lines.length > availableHeight) {
        const sliceIndex = lines.length - availableHeight;
        hiddenLinesCount = sliceIndex;
        lines = lines.slice(sliceIndex);
      }
    }

    const renderedLines = lines.map((line, index) => {
      const contentToRender = highlightAndRenderLine(
        line,
        language,
      );

      return (
        <Box key={index} minHeight={1}>
          {showLineNumbers && (
            <Box
              minWidth={padWidth + 1}
              flexShrink={0}
              paddingRight={1}
              alignItems="flex-start"
              justifyContent="flex-end"
            >
              <Text color={activeTheme.colors.Gray}>
                {`${index + 1 + hiddenLinesCount}`}
              </Text>
            </Box>
          )}
          <Text color={activeTheme.defaultColor} wrap="wrap">
            {contentToRender}
          </Text>
        </Box>
      );
    });

    return (
      <Box flexDirection="column" width={maxWidth}>
        {renderedLines}
      </Box>
    );
  } catch (error) {
    // Fall back to plain text with default color on error
    // Also display line numbers in fallback
    const lines = codeToHighlight.split('\n');
    const padWidth = String(lines.length).length; // Calculate padding width based on number of lines
    const fallbackLines = lines.map((line, index) => (
      <Box key={index} minHeight={1}>
        {showLineNumbers && (
          <Box
            minWidth={padWidth + 1}
            flexShrink={0}
            paddingRight={1}
            alignItems="flex-start"
            justifyContent="flex-end"
          >
            <Text color={activeTheme.defaultColor}>{`${index + 1}`}</Text>
          </Box>
        )}
        <Text color={activeTheme.colors.Gray}>{line}</Text>
      </Box>
    ));

    return (
      <Box flexDirection="column" width={maxWidth}>
        {fallbackLines}
      </Box>
    );
  }
}
