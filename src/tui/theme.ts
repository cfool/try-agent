/**
 * Default theme for the TUI markdown renderer.
 *
 * Provides color tokens consumed by MarkdownDisplay and its sub-components
 * (CodeColorizer, InlineMarkdownRenderer, TableRenderer, MaxSizedBox).
 */

/** Syntax-highlighting color palette used by CodeColorizer */
interface CodeColors {
  /** Fallback / default foreground */
  Gray: string;
  [className: string]: string | undefined;
}

export interface Theme {
  text: {
    primary: string;
    response: string;
    secondary: string;
    accent: string;
    link: string;
  };
  border: {
    default: string;
  };
  /** Default foreground colour for syntax-highlighted code tokens */
  defaultColor: string;
  /** Colour map keyed by lowlight/highlight.js CSS class names */
  colors: CodeColors;
  /** Resolve a highlight.js class name to an Ink-compatible colour string */
  getInkColor: (className: string) => string | undefined;
}

/**
 * A simple dark-terminal theme that works well on most terminals.
 * Colours use Ink's named-colour strings so they adapt to the user's palette.
 */
export const theme: Theme = {
  text: {
    primary: 'white',
    response: 'white',
    secondary: 'gray',
    accent: 'cyan',
    link: 'blueBright',
  },
  border: {
    default: 'gray',
  },
  defaultColor: 'white',
  colors: {
    Gray: 'gray',
    // highlight.js token → Ink colour mapping
    'hljs-keyword': 'magenta',
    'hljs-built_in': 'cyan',
    'hljs-type': 'cyan',
    'hljs-literal': 'cyan',
    'hljs-number': 'yellow',
    'hljs-string': 'green',
    'hljs-regexp': 'red',
    'hljs-symbol': 'yellow',
    'hljs-bullet': 'yellow',
    'hljs-link': 'blueBright',
    'hljs-meta': 'gray',
    'hljs-deletion': 'red',
    'hljs-addition': 'green',
    'hljs-emphasis': 'white',
    'hljs-strong': 'white',
    'hljs-formula': 'white',
    'hljs-comment': 'gray',
    'hljs-quote': 'gray',
    'hljs-doctag': 'green',
    'hljs-tag': 'blueBright',
    'hljs-name': 'blueBright',
    'hljs-attr': 'cyan',
    'hljs-attribute': 'cyan',
    'hljs-variable': 'red',
    'hljs-template-variable': 'red',
    'hljs-template-tag': 'red',
    'hljs-title': 'blueBright',
    'hljs-section': 'blueBright',
    'hljs-selector-id': 'blueBright',
    'hljs-selector-class': 'blueBright',
    'hljs-selector-tag': 'blueBright',
    'hljs-selector-pseudo': 'blueBright',
    'hljs-subst': 'white',
    'hljs-property': 'cyan',
    'hljs-params': 'white',
    'hljs-class': 'blueBright',
    'hljs-function': 'blueBright',
  },
  getInkColor(className: string): string | undefined {
    return this.colors[className] as string | undefined;
  },
};
