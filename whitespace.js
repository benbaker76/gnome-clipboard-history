'use strict'

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

var blocks = ['address', 'article', 'aside', 'audio', 'blockquote', 'body',
  'canvas', 'center', 'dd', 'dir', 'div', 'dl', 'dt', 'fieldset', 'figcaption',
  'figure', 'footer', 'form', 'frameset', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'header', 'hgroup', 'hr', 'html', 'isindex', 'li', 'main', 'menu', 'nav',
  'noframes', 'noscript', 'ol', 'output', 'p', 'pre', 'section', 'table',
  'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'ul'
]

function isBlock (node) {
  return !!(node && blocks.indexOf(node.nodeName.toLowerCase()) !== -1);
}

var voids = [
  'area', 'base', 'br', 'col', 'command', 'embed', 'hr', 'img', 'input',
  'keygen', 'link', 'meta', 'param', 'source', 'track', 'wbr'
]

function isVoid (node) {
  return !!(node && voids.indexOf(node.nodeName.toLowerCase()) !== -1);
}

/**
 * isBlockElem(node) determines if the given node is a block element.
 *
 * @param {Node} node
 * @return {Boolean}
 */
function isBlockElem (node) {
  return !!(node && isBlock(node))
}

/**
 * isPreElem(node) determines if the given node is a PRE element.
 * 
 * Whitespace for PRE elements are not collapsed.
 * 
 * @param {Node} node
 * @return {Boolean}
 */
function isPreElem (node) {
  return node.nodeName === 'PRE';
}

/**
 * whitespace(elem [, isBlock]) removes extraneous whitespace from an
 * the given element. The function isBlock may optionally be passed in
 * to determine whether or not an element is a block element; if none
 * is provided, defaults to using the list of block elements provided
 * by the `block-elements` module.
 *
 * @param {Node} elem
 * @param {Function} blockTest
 */
function collapseWhitespace (elem, isBlock, isPre) {
  if (!elem.firstChild || elem.nodeName === 'PRE') return

  if (typeof isBlock !== 'function') {
    isBlock = isBlockElem
  }

  if (typeof isPre !== 'function') {
    isPre = isPreElem;
  }

  let prevText = null
  let prevVoid = false

  let prev = null
  let node = next(prev, elem, isPre)

  while (node !== elem) {
    if (node.nodeType === 3 || node.nodeType === 4) { // Node.TEXT_NODE or Node.CDATA_SECTION_NODE
      let text = node.data.replace(/[ \r\n\t]+/g, ' ')

      if ((!prevText || / $/.test(prevText.data)) &&
          !prevVoid && text[0] === ' ') {
        text = text.substr(1)
      }

      // `text` might be empty at this point.
      if (!text) {
        node = remove(node)
        continue
      }

      node.data = text
      
      prevText = node
    } else if (node.nodeType === 1) { // Node.ELEMENT_NODE
      if (isBlock(node) || node.nodeName === 'BR') {
        if (prevText) {
          prevText.data = prevText.data.replace(/ $/, '')
        }

        prevText = null
        prevVoid = false
      } else if (isVoid(node)) {
        // Avoid trimming space around non-block, non-BR void elements.
        prevText = null
        prevVoid = true
      }
    } else {
      node = remove(node)
      continue
    }

    let nextNode = next(prev, node, isPre)
    prev = node
    node = nextNode
  }

  if (prevText) {
    prevText.data = prevText.data.replace(/ $/, '')
    if (!prevText.data) {
      remove(prevText)
    }
  }
}

/**
 * remove(node) removes the given node from the DOM and returns the
 * next node in the sequence.
 *
 * @param {Node} node
 * @return {Node} node
 */
function remove (node) {
  let next = node.nextSibling || node.parentNode

  node.parentNode.removeChild(node)

  return next
}

/**
 * next(prev, current, isPre) returns the next node in the sequence, given the
 * current and previous nodes.
 *
 * @param {Node} prev
 * @param {Node} current
 * @param {Function} isPre
 * @return {Node}
 */
function next (prev, current, isPre) {
  if ((prev && prev.parentNode === current) || isPre(current)) {
    return current.nextSibling || current.parentNode
  }

  return current.firstChild || current.nextSibling || current.parentNode
}
