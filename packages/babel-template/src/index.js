/* eslint max-len: 0 */

import cloneDeep from "lodash/lang/cloneDeep";
import assign from "lodash/object/assign";
import has from "lodash/object/has";
import traverse from "babel-traverse";
import * as babylon from "babylon";
import * as t from "babel-types";

let FROM_TEMPLATE = "_fromTemplate"; //Symbol(); // todo: probably wont get copied over
let TEMPLATE_SKIP = Symbol();

export default function (code: string, opts?: Object): Function {
  // since we lazy parse the template, we get the current stack so we have the
  // original stack to append if it errors when parsing
  let stack;
  try {
    // error stack gets populated in IE only on throw (https://msdn.microsoft.com/en-us/library/hh699850(v=vs.94).aspx)
    throw new Error();
  } catch (error) {
    if (error.stack) {
      // error.stack does not exists in IE <= 9
      stack = error.stack.split("\n").slice(1).join("\n");
    }
  }

  let getAst = function () {
    let ast;

    try {
      ast = babylon.parse(code, assign({
        allowReturnOutsideFunction: true,
        allowSuperOutsideMethod: true
      }, opts));

      ast = traverse.removeProperties(ast);

      traverse.cheap(ast, function (node) {
        node[FROM_TEMPLATE] = true;
      });
    } catch (err) {
      err.stack = `${err.stack}from\n${stack}`;
      throw err;
    }

    getAst = function () {
      return ast;
    };

    return ast;
  };

  return function (...args) {
    return useTemplate(getAst(), args);
  };
}

function useTemplate(ast, nodes?: Array<Object>) {
  ast = cloneDeep(ast);
  let { program } = ast;

  if (nodes.length) {
    traverse(ast, templateVisitor, null, nodes);
  }

  if (program.body.length > 1) {
    return program.body;
  } else {
    return program.body[0];
  }
}

let templateVisitor = {
  // 360
  noScope: true,

  enter(path, args) {
    let { node } = path;
    if (node[TEMPLATE_SKIP]) return path.skip();

    if (t.isExpressionStatement(node)) {
      node = node.expression;
    }

    let replacement;

    if (t.isIdentifier(node) && node[FROM_TEMPLATE]) {
      if (has(args[0], node.name)) {
        replacement = args[0][node.name];
      } else if (node.name[0] === "$") {
        let i = +node.name.slice(1);
        if (args[i]) replacement = args[i];
      }
    }

    if (replacement === null) {
      path.remove();
    }

    if (replacement) {
      replacement[TEMPLATE_SKIP] = true;
      path.replaceInline(replacement);
    }
  },

  exit({ node }) {
    if (!node.loc)
      traverse.clearNode(node);
  }
};
