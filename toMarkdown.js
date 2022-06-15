/*
 * toMarkdown - an HTML to Markdown converter
 *
 * Copyright 2011+, Dom Christie
 * Licenced under the MIT licence
 *
 */

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Domparser = Me.imports.xmldom.domparser;
const getTextContent = Me.imports.xmldom.dom.getTextContent;
const collapse = Me.imports.whitespace.collapseWhitespace;

const Whitespace = Me.imports.whitespace;

const isBlock = Whitespace.isBlock;
const isVoid = Whitespace.isVoid;

var toMarkdown
var converters

function cell (content, node) {
  var index = Array.prototype.indexOf.call(node.parentNode.childNodes, node)
  var prefix = ' '
  if (index === 0) prefix = '| '
  return prefix + content + ' |'
}

var highlightRegEx = /highlight highlight-(\S+)/

const mdConverters = [
  {
      filter: 'p',
      replacement: function(content) {
          return '\n\n' + content + '\n\n'
      }
  },

  {
      filter: 'br',
      replacement: function() {
          return '  \n'
      }
  },

  {
      filter: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'],
      replacement: function(content, node) {
          var hLevel = node.nodeName.charAt(1)
          var hPrefix = ''
          for (var i = 0; i < hLevel; i++) {
              hPrefix += '#'
          }
          return '\n\n' + hPrefix + ' ' + content + '\n\n'
      }
  },

  {
      filter: 'hr',
      replacement: function() {
          return '\n\n* * *\n\n'
      }
  },

  {
      filter: ['em', 'i'],
      replacement: function(content) {
          return '_' + content + '_'
      }
  },

  {
      filter: ['strong', 'b'],
      replacement: function(content) {
          return '**' + content + '**'
      }
  },

  // Inline code
  {
      filter: function(node) {
          var hasSiblings = node.previousSibling || node.nextSibling
          var isCodeBlock = node.parentNode.nodeName === 'PRE' && !hasSiblings

          return node.nodeName === 'CODE' && !isCodeBlock
      },
      replacement: function(content) {
          return '`' + content + '`'
      }
  },

  {
      filter: function(node) {
          return node.nodeName === 'A' && node.getAttribute('href')
      },
      replacement: function(content, node) {
          var titlePart = node.title ? ' "' + node.title + '"' : ''
          return '[' + content + '](' + node.getAttribute('href') + titlePart + ')'
      }
  },

  {
      filter: 'img',
      replacement: function(content, node) {
          var alt = node.alt || ''
          var src = node.getAttribute('src') || ''
          var title = node.title || ''
          var titlePart = title ? ' "' + title + '"' : ''
          return src ? '![' + alt + ']' + '(' + src + titlePart + ')' : ''
      }
  },

  // Code blocks
  {
      filter: function(node) {
          return node.nodeName === 'PRE' && node.firstChild.nodeName === 'CODE'
      },
      replacement: function(content, node) {
          return '\n\n    ' + node.firstChild.textContent.replace(/\n/g, '\n    ') + '\n\n'
      }
  },

  {
      filter: 'blockquote',
      replacement: function(content) {
          content = content.trim()
          content = content.replace(/\n{3,}/g, '\n\n')
          content = content.replace(/^/gm, '> ')
          return '\n\n' + content + '\n\n'
      }
  },

  {
      filter: 'li',
      replacement: function(content, node) {
          content = content.replace(/^\s+/, '').replace(/\n/gm, '\n    ')
          var prefix = '*   '
          var parent = node.parentNode
          if (parent.nodeName === 'OL') {
              var start = parent.getAttribute('start')
              var index = Array.prototype.indexOf.call(parent.children, node)
              prefix = (start ? Number(start) + index : index + 1) + '.  '
          }

          return prefix + content
      }
  },

  {
      filter: ['ul', 'ol'],
      replacement: function(content, node) {
          var strings = []
          for (var i = 0; i < node.childNodes.length; i++) {
              strings.push(node.childNodes[i]._replacement)
          }

          if (/li/i.test(node.parentNode.nodeName)) {
              return '\n' + strings.join('\n')
          }
          return '\n\n' + strings.join('\n') + '\n\n'
      }
  },

  {
      filter: function(node) {
          return this.isBlock(node)
      },
      replacement: function(content, node) {
          return '\n\n' + this.outer(node, content) + '\n\n'
      }
  },

  // Anything else!
  {
      filter: function() {
          return true
      },
      replacement: function(content, node) {
          return this.outer(node, content)
      }
  }
];

const gfmConverters = [
  {
      filter: 'br',
      replacement: function() {
          return '\n'
      }
  },
  {
      filter: ['del', 's', 'strike'],
      replacement: function(content) {
          return '~~' + content + '~~'
      }
  },

  {
      filter: function(node) {
          return node.type === 'checkbox' && node.parentNode.nodeName === 'LI'
      },
      replacement: function(content, node) {
          return (node.checked ? '[x]' : '[ ]') + ' '
      }
  },

  {
      filter: ['th', 'td'],
      replacement: function(content, node) {
          return cell(content, node)
      }
  },

  {
      filter: 'tr',
      replacement: function(content, node) {
          var borderCells = ''
          var alignMap = {
              left: ':--',
              right: '--:',
              center: ':-:'
          }

          if (node.parentNode.nodeName === 'THEAD') {
              for (var i = 0; i < node.childNodes.length; i++) {
                  var align = node.childNodes[i].attributes.align
                  var border = '---'

                  if (align) border = alignMap[align.value] || border

                  borderCells += cell(border, node.childNodes[i])
              }
          }
          return '\n' + content + (borderCells ? '\n' + borderCells : '')
      }
  },

  {
      filter: 'table',
      replacement: function(content) {
          return '\n\n' + content + '\n\n'
      }
  },

  {
      filter: ['thead', 'tbody', 'tfoot'],
      replacement: function(content) {
          return content
      }
  },

  // Fenced code blocks
  {
      filter: function(node) {
          return node.nodeName === 'PRE' &&
              node.firstChild &&
              node.firstChild.nodeName === 'CODE'
      },
      replacement: function(content, node) {
          return '\n\n```\n' + node.firstChild.textContent + '\n```\n\n'
      }
  },

  // Syntax-highlighted code blocks
  {
      filter: function(node) {
          return node.nodeName === 'PRE' &&
              node.parentNode.nodeName === 'DIV' &&
              highlightRegEx.test(node.parentNode.className)
      },
      replacement: function(content, node) {
          var language = node.parentNode.className.match(highlightRegEx)[1]
          return '\n\n```' + language + '\n' + node.textContent + '\n```\n\n'
      }
  },

  {
      filter: function(node) {
          return node.nodeName === 'DIV' &&
              highlightRegEx.test(node.className)
      },
      replacement: function(content) {
          return '\n\n' + content + '\n\n'
      }
  }
];

// http://pandoc.org/README.html#pandocs-markdown
const pandocConverters = [
  {
      filter: 'h1',
      replacement: function(content, node) {
          var underline = Array(content.length + 1).join('=');
          return '\n\n' + content + '\n' + underline + '\n\n';
      }
  },

  {
      filter: 'h2',
      replacement: function(content, node) {
          var underline = Array(content.length + 1).join('-');
          return '\n\n' + content + '\n' + underline + '\n\n';
      }
  },

  {
      filter: 'sup',
      replacement: function(content) {
          return '^' + content + '^';
      }
  },

  {
      filter: 'sub',
      replacement: function(content) {
          return '~' + content + '~';
      }
  },

  {
      filter: 'br',
      replacement: function() {
          return '\\\n';
      }
  },

  {
      filter: 'hr',
      replacement: function() {
          return '\n\n* * * * *\n\n';
      }
  },

  {
      filter: ['em', 'i', 'cite', 'var'],
      replacement: function(content) {
          return '*' + content + '*';
      }
  },

  {
      filter: function(node) {
          var hasSiblings = node.previousSibling || node.nextSibling;
          var isCodeBlock = node.parentNode.nodeName === 'PRE' && !hasSiblings;
          var isCodeElem = node.nodeName === 'CODE' ||
              node.nodeName === 'KBD' ||
              node.nodeName === 'SAMP' ||
              node.nodeName === 'TT';

          return isCodeElem && !isCodeBlock;
      },
      replacement: function(content) {
          return '`' + content + '`';
      }
  },

  {
      filter: function(node) {
          return node.nodeName === 'A' && node.getAttribute('href');
      },
      replacement: function(content, node) {
          var url = node.getAttribute('href');
          var titlePart = node.title ? ' "' + node.title + '"' : '';
          if (content === url) {
              return '<' + url + '>';
          } else if (url === ('mailto:' + content)) {
              return '<' + content + '>';
          } else {
              return '[' + content + '](' + url + titlePart + ')';
          }
      }
  },

  {
      filter: 'li',
      replacement: function(content, node) {
          content = content.replace(/^\s+/, '').replace(/\n/gm, '\n    ');
          var prefix = '-   ';
          var parent = node.parentNode;

          if (/ol/i.test(parent.nodeName)) {
              var index = Array.prototype.indexOf.call(parent.children, node) + 1;
              prefix = index + '. ';
              while (prefix.length < 4) {
                  prefix += ' ';
              }
          }

          return prefix + content;
      }
  }
];

/*
 * Utilities
 */

function htmlToDom (string) {
  var parser  = new Domparser.DOMParser();
  var tree = parser.parseFromString(string, 'text/html')
  collapse(tree.documentElement, isBlock)
  return tree
}

/*
 * Flattens DOM tree into single array
 */

function bfsOrder (node) {
  var inqueue = [node]
  var outqueue = []
  var elem
  var children
  var i

  while (inqueue.length > 0) {
    elem = inqueue.shift()
    outqueue.push(elem)
    children = elem.childNodes
    for (i = 0; i < children.length; i++) {
      if (children[i].nodeType === 1) inqueue.push(children[i])
    }
  }
  outqueue.shift()
  return outqueue
}

/*
 * Contructs a Markdown string of replacement text for a given node
 */

function getContent (node) {
  var text = ''
  for (var i = 0; i < node.childNodes.length; i++) {
    if (node.childNodes[i].nodeType === 1) {
      text += node.childNodes[i]._replacement
    } else if (node.childNodes[i].nodeType === 3) {
      text += node.childNodes[i].data
    } else continue
  }
  return text
}

/*
 * Returns the HTML string of an element with its contents converted
 */

function outer (node, content) {
  return content;
  //return node.cloneNode(false).outerHTML.replace('><', '>' + content + '<');
}

function canConvert (node, filter) {
  if (typeof filter === 'string') {
    return filter === node.nodeName.toLowerCase()
  }
  if (Array.isArray(filter)) {
    return filter.indexOf(node.nodeName.toLowerCase()) !== -1
  } else if (typeof filter === 'function') {
    return filter.call(toMarkdown, node)
  } else {
    throw new TypeError('`filter` needs to be a string, array, or function')
  }
}

function isFlankedByWhitespace (side, node) {
  var sibling
  var regExp
  var isFlanked

  if (side === 'left') {
    sibling = node.previousSibling
    regExp = / $/
  } else {
    sibling = node.nextSibling
    regExp = /^ /
  }

  if (sibling) {
    if (sibling.nodeType === 3) {
      isFlanked = regExp.test(sibling.nodeValue)
    } else if (sibling.nodeType === 1 && !isBlock(sibling)) {
      isFlanked = regExp.test(sibling.textContent)
    }
  }
  return isFlanked
}

function flankingWhitespace (node, content) {
  var leading = ''
  var trailing = ''

  if (!isBlock(node)) {
    var hasLeading = /^[ \r\n\t]/.test(content)
    var hasTrailing = /[ \r\n\t]$/.test(content)

    if (hasLeading && !isFlankedByWhitespace('left', node)) {
      leading = ' '
    }
    if (hasTrailing && !isFlankedByWhitespace('right', node)) {
      trailing = ' '
    }
  }

  return { leading: leading, trailing: trailing }
}

/*
 * Finds a Markdown converter, gets the replacement, and sets it on
 * `_replacement`
 */

function process (node) {
  var replacement
  var content = getContent(node)

  // Remove blank nodes
  if (!isVoid(node) && !/A|TH|TD/.test(node.nodeName) && /^\s*$/i.test(content)) {
    node._replacement = ''
    return
  }

  for (var i = 0; i < converters.length; i++) {
    var converter = converters[i]

    if (canConvert(node, converter.filter)) {
      if (typeof converter.replacement !== 'function') {
        throw new TypeError(
          '`replacement` needs to be a function that returns a string'
        )
      }

      var whitespace = flankingWhitespace(node, content)

      if (whitespace.leading || whitespace.trailing) {
        content = content.trim()
      }
      replacement = whitespace.leading +
        converter.replacement.call(toMarkdown, content, node) +
        whitespace.trailing
      break
    }
  }

  node._replacement = replacement
}

toMarkdown = function (input, options) {
  options = options || {}

  if (typeof input !== 'string') {
    throw new TypeError(input + ' is not a string')
  }

  if (input === '') {
    return ''
  }

  // Escape potential ol triggers
  input = input.replace(/(\d+)\. /g, '$1\\. ')

  var clone = htmlToDom(input)
  var nodes = bfsOrder(clone)
  var output

  converters = mdConverters.slice(0)
  if (options.gfm) {
    converters = gfmConverters.concat(converters)
  }

  if (options.converters) {
    converters = options.converters.concat(converters)
  }

  // Process through nodes in reverse (so deepest child elements are first).
  for (var i = nodes.length - 1; i >= 0; i--) {
    process(nodes[i])
  }
  output = getContent(clone)

  return output.replace(/^[\t\r\n]+|[\t\r\n\s]+$/g, '')
    .replace(/\n\s+\n/g, '\n\n')
    .replace(/\n{3,}/g, '\n\n')
}

toMarkdown.isBlock = isBlock
toMarkdown.isVoid = isVoid
toMarkdown.outer = outer

function toPlaintext (input) {
  if (input === '') {
    return ''
  }

  // Escape potential ol triggers
  input = input.replace(/(\d+)\. /g, '$1\\. ')

  var clone = htmlToDom(input)
  var output = getTextContent(clone);

  if (!output) {
    return ''
  }

  return output;
}

// http://pandoc.org/README.html#smart-punctuation
function escape (str) {
  return str.replace(/[\u2018\u2019\u00b4]/g, "'")
            .replace(/[\u201c\u201d\u2033]/g, '"')
            .replace(/[\u2212\u2022\u00b7\u25aa]/g, '-')
            .replace(/[\u2013\u2015]/g, '--')
            .replace(/\u2014/g, '---')
            .replace(/\u2026/g, '...')
            .replace(/[ ]+\n/g, '\n')
            .replace(/\s*\\\n/g, '\\\n')
            .replace(/\s*\\\n\s*\\\n/g, '\n\n')
            .replace(/\s*\\\n\n/g, '\n\n')
            .replace(/\n-\n/g, '\n')
            .replace(/\n\n\s*\\\n/g, '\n\n')
            .replace(/\n\n\n*/g, '\n\n')
            .replace(/[ ]+$/gm, '')
            .replace(/^\s+|[\s\\]+$/g, '');
}

function htmlToMarkdown (str) {
  str = str.replace(/\n/g, "");
  return escape(toMarkdown(str, { converters: pandocConverters, gfm: true }));
}

function htmlToPlaintext (str) {
  return escape(toPlaintext(str));
}